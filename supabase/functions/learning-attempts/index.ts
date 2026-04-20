import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildFeedbackPayload,
  calculateAttemptScore,
  corsHeaders,
  extractRoute,
  getEnv,
  json,
  normalizeServiceKey,
  parseBody,
  rebuildLanguageProfile,
  rebuildRecommendationsForUser,
  resolveEnglishProducts,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNullableText,
  toNumber,
  toText,
  upsertAttemptSignals,
  upsertErrorsFromFeedback,
  upsertMasteryFromAttempt,
} from "../_shared/english-learning.ts";

const routeMarker = "/learning-attempts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const body = req.method === "POST" ? await parseBody(req) : {};
    const scope = await resolveLanguageScope(
      sb,
      toText(url.searchParams.get("language_code") ?? body.language_code, 16) || "en",
    );
    const products = await resolveEnglishProducts(sb);

    if (req.method === "POST" && route === "/start") {
      const serviceKey = normalizeServiceKey(body.service_key);
      if (!serviceKey) return json(422, { error: "service_key is required" });
      const productId = toText(body.product_id, 80) || products[serviceKey]?.productId;
      if (!productId) return json(422, { error: "product_id is required" });

      const contentItem = await resolveOrCreateContentItem(sb, {
        contentItemId: toNullableText(body.content_item_id, 80),
        productId,
        languageId: scope.languageId,
        serviceKey,
        contentType: toNullableText(body.content_type, 80),
        sourceRef: toNullableText(body.source_ref, 160),
        title: toNullableText(body.title, 220),
        description: toNullableText(body.description, 900),
        skillKey: toNullableText(body.skill_key, 120),
        subskillKeys: Array.isArray(body.subskill_keys)
          ? body.subskill_keys.map((entry) => String(entry ?? "")).filter(Boolean)
          : null,
        cefrLevel: toNullableText(body.cefr_level, 8),
        difficulty: toNumber(body.difficulty),
        estimatedMinutes: toNumber(body.estimated_minutes),
        learningObjective: toNullableText(body.learning_objective, 900),
        tags: Array.isArray(body.tags) ? body.tags.map((entry) => String(entry ?? "")).filter(Boolean) : null,
        payloadJson: body.payload_json && typeof body.payload_json === "object" ? body.payload_json as Record<string, unknown> : {},
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
      });

      const { data, error } = await sb
        .from("learning_attempts")
        .insert({
          user_id: auth.userId,
          language_id: scope.languageId,
          product_id: productId,
          content_item_id: contentItem.id,
          service_key: serviceKey,
          attempt_type: toText(body.attempt_type, 80) || contentItem.content_type,
          status: "started",
          response_json: body.response_json && typeof body.response_json === "object" ? body.response_json : {},
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        })
        .select("*")
        .maybeSingle();
      if (error || !data?.id) return json(500, { error: "Failed to start attempt", details: error?.message ?? null });

      return json(200, {
        ok: true,
        attempt: data,
        content_item: contentItem,
        scope: {
          language_id: scope.languageId,
          language_code: scope.languageCode,
        },
      });
    }

    if (req.method === "POST" && route === "/submit") {
      const attemptId = toText(body.attempt_id, 80);
      if (!attemptId) return json(422, { error: "attempt_id is required" });

      const attemptRes = await sb
        .from("learning_attempts")
        .select("*")
        .eq("id", attemptId)
        .maybeSingle();
      if (attemptRes.error || !attemptRes.data?.id) return json(404, { error: "Attempt not found" });
      const attempt = attemptRes.data as Record<string, unknown>;
      if (String(attempt.user_id ?? "") !== auth.userId) return json(403, { error: "Forbidden" });

      const contentRes = await sb
        .from("learning_content_registry_items")
        .select("*")
        .eq("id", String(attempt.content_item_id ?? ""))
        .maybeSingle();
      if (contentRes.error || !contentRes.data?.id) return json(404, { error: "Content item not found" });
      const contentItem = contentRes.data as any;

      const existingStatus = toText(attempt.status, 40).toLowerCase();
      const alreadySubmitted = (existingStatus === "scored" || existingStatus === "failed")
        && !!toNullableText(attempt.submitted_at, 64)
        && !!attempt.scoring_json;
      if (alreadySubmitted) {
        const feedbackRes = await sb
          .from("learning_attempt_feedback")
          .select("*")
          .eq("attempt_id", attemptId)
          .maybeSingle();
        return json(200, {
          ok: true,
          idempotent_replay: true,
          attempt,
          content_item: contentItem,
          feedback: feedbackRes.data ?? null,
          scoring: attempt.scoring_json ?? {},
          signals_enqueued: 0,
          errors_updated: 0,
          recommendations_regenerated: 0,
        });
      }

      const serviceKey = normalizeServiceKey(attempt.service_key) ?? "reading";
      const score = calculateAttemptScore({
        correctnessRatio: toNumber(body.correctness_ratio),
        estimatedMinutes: toNumber(body.estimated_minutes) ?? Number(contentItem.estimated_minutes ?? 10),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        correctionQualityRatio: toNumber(body.correction_quality_ratio),
      });
      const feedback = buildFeedbackPayload({
        serviceKey,
        score: score.overallScore,
        title: toNullableText(body.title, 220) ?? contentItem.title,
        reason: toNullableText(body.reason, 400),
        issues: body.issues,
      });

      const responseJson = body.response_json && typeof body.response_json === "object"
        ? body.response_json
        : {};
      const scoringJson = {
        correctness_ratio: score.correctnessRatio,
        time_efficiency_ratio: score.timeEfficiencyRatio,
        correction_quality_ratio: score.correctionQualityRatio,
        hint_score_ratio: score.hintScoreRatio,
        retry_penalty_ratio: score.retryPenaltyRatio,
        overall_score: score.overallScore,
      };

      const nextStatus = score.overallScore >= 0.6 ? "scored" : "failed";
      const nowIso = new Date().toISOString();

      const { data: updatedAttempt, error: updateError } = await sb
        .from("learning_attempts")
        .update({
          status: nextStatus,
          response_json: responseJson,
          scoring_json: scoringJson,
          hint_usage_count: Math.max(0, Math.floor(toNumber(body.hint_usage_count) ?? 0)),
          retry_count: Math.max(0, Math.floor(toNumber(body.retry_count) ?? 0)),
          time_spent_seconds: Math.max(0, Math.floor(toNumber(body.time_spent_seconds) ?? Number(contentItem.estimated_minutes ?? 10) * 60)),
          correctness_ratio: score.correctnessRatio,
          time_efficiency_ratio: score.timeEfficiencyRatio,
          correction_quality_ratio: score.correctionQualityRatio,
          overall_score: score.overallScore,
          submitted_at: nowIso,
          scored_at: nowIso,
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : attempt.metadata ?? {},
        })
        .eq("id", attemptId)
        .select("*")
        .maybeSingle();
      if (updateError || !updatedAttempt?.id) return json(500, { error: "Failed to submit attempt", details: updateError?.message ?? null });

      const feedbackRes = await sb
        .from("learning_attempt_feedback")
        .upsert({
          attempt_id: attemptId,
          user_id: auth.userId,
          language_id: scope.languageId,
          summary: feedback.summary,
          issues: feedback.issues,
          retry_task: feedback.retry_task,
          related_drill: feedback.related_drill,
          handoff_targets: feedback.handoff_targets,
          normalized_payload: feedback.normalized_payload,
        }, { onConflict: "attempt_id" })
        .select("*")
        .eq("attempt_id", attemptId)
        .maybeSingle();
      if (feedbackRes.error || !feedbackRes.data?.id) return json(500, { error: "Failed to store feedback", details: feedbackRes.error?.message ?? null });

      const signalsCount = await upsertAttemptSignals(sb, {
        attemptId,
        userId: auth.userId,
        languageId: scope.languageId,
        productId: String(updatedAttempt.product_id),
        serviceKey,
        contentItem,
        overallScore: score.overallScore,
        correctnessRatio: score.correctnessRatio,
        correctionQualityRatio: score.correctionQualityRatio,
        timeEfficiencyRatio: score.timeEfficiencyRatio,
      });
      const errorsCount = await upsertErrorsFromFeedback(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        serviceKey,
        attemptId,
        contentItemId: contentItem.id,
        issues: feedback.issues,
      });
      await upsertMasteryFromAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        serviceKey,
        contentItem,
        overallScore: score.overallScore,
      });
      await rebuildLanguageProfile(sb, scope.languageId, auth.userId);
      const recommendations = await rebuildRecommendationsForUser(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        products,
      });

      return json(200, {
        ok: true,
        attempt: updatedAttempt,
        content_item: contentItem,
        feedback: feedbackRes.data,
        scoring: scoringJson,
        signals_enqueued: signalsCount,
        errors_updated: errorsCount,
        recommendations_regenerated: recommendations.length,
      });
    }

    if (req.method === "GET" && route.startsWith("/")) {
      const attemptId = toText(route.replace("/", ""), 80);
      if (!attemptId) return json(404, { error: "Attempt not found" });

      const { data: attemptData, error: attemptError } = await sb
        .from("learning_attempts")
        .select("*")
        .eq("id", attemptId)
        .maybeSingle();
      if (attemptError || !attemptData?.id) return json(404, { error: "Attempt not found" });
      if (String(attemptData.user_id ?? "") !== auth.userId) return json(403, { error: "Forbidden" });

      const [contentItemRes, feedbackRes] = await Promise.all([
        sb.from("learning_content_registry_items").select("*").eq("id", String(attemptData.content_item_id ?? "")).maybeSingle(),
        sb.from("learning_attempt_feedback").select("*").eq("attempt_id", attemptId).maybeSingle(),
      ]);

      return json(200, {
        attempt: attemptData,
        content_item: contentItemRes.data ?? null,
        feedback: feedbackRes.data ?? null,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
