import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { guardActivity } from "../_shared/english-allowance.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildFeedbackPayload,
  calculateAttemptScore,
  corsHeaders,
  extractRoute,
  getEnv,
  json,
  parseBody,
  recordEvaluatedAttempt,
  resolveEnglishProducts,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";
import { queueReviewItems } from "../_shared/english-review.ts";
import { checkGrammarAnswer } from "../_shared/english-grammar.ts";
import { buildHandbook, HANDBOOK_COLUMNS } from "../_shared/english-handbook.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/grammar-remediation";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Drills as sent to the learner: the answer key stays on the server. */
const publicDrill = (drill: Record<string, unknown>): Record<string, unknown> => {
  const { expected_answer_json: _hidden, ...rest } = drill;
  return rest;
};

const acceptedAnswersOf = (drill: Record<string, unknown>): string[] => {
  const expected = drill.expected_answer_json && typeof drill.expected_answer_json === "object"
    ? drill.expected_answer_json as Record<string, unknown>
    : {};
  return Array.isArray(expected.accepted_answers)
    ? expected.accepted_answers.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
};

const mapErrorToUnitSlug = (errorText: string, skillKey = "", subskillKey = ""): string | null => {
  const haystack = `${errorText} ${skillKey} ${subskillKey}`.toLowerCase();
  if (haystack.includes("article") || haystack.includes("count noun")) return "articles-basic-control";
  if (haystack.includes("past") || haystack.includes("yesterday") || haystack.includes("last week") || haystack.includes("tense")) {
    return "past-simple-time-control";
  }
  if (haystack.includes("preposition") || haystack.includes(" on ") || haystack.includes(" at ")) return "prepositions-common-use";
  if (haystack.includes("agreement") || haystack.includes("subject-verb") || haystack.includes("third-person")) {
    return "subject-verb-agreement";
  }
  return null;
};

const rebuildAssignments = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    productId: string;
  },
): Promise<Array<Record<string, unknown>>> => {
  const [unitsRes, activeAssignmentsRes, errorsRes] = await Promise.all([
    sb
      .from("grammar_units")
      .select("id, slug, title, focus_area")
      .eq("product_id", input.productId)
      .eq("language_id", input.languageId)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    sb
      .from("grammar_remediation_assignments")
      .select("id, grammar_unit_id, source_error_id, status")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .eq("status", "active"),
    sb
      .from("learner_language_errors")
      .select("id, service_key, skill_key, subskill_key, error_type, error_frequency, severity_score")
      .eq("user_id", input.userId)
      .eq("language_id", input.languageId)
      .in("mastery_status", ["open", "reopened", "improving"])
      .order("severity_score", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(16),
  ]);

  const units = Array.isArray(unitsRes.data) ? unitsRes.data as Array<Record<string, unknown>> : [];
  const unitBySlug = new Map(units.map((unit) => [String(unit.slug ?? ""), unit]));
  const activeAssignments = Array.isArray(activeAssignmentsRes.data)
    ? activeAssignmentsRes.data as Array<Record<string, unknown>>
    : [];
  const existingActiveKeys = new Set(
    activeAssignments.map((assignment) => `${String(assignment.grammar_unit_id ?? "")}:${String(assignment.source_error_id ?? "")}`),
  );

  const errorRows = Array.isArray(errorsRes.data) ? errorsRes.data as Array<Record<string, unknown>> : [];
  let inserted = 0;
  for (const errorRow of errorRows) {
    const slug = mapErrorToUnitSlug(
      String(errorRow.error_type ?? ""),
      String(errorRow.skill_key ?? ""),
      String(errorRow.subskill_key ?? ""),
    );
    if (!slug) continue;
    const unit = unitBySlug.get(slug);
    if (!unit?.id) continue;
    const key = `${String(unit.id)}:${String(errorRow.id ?? "")}`;
    if (existingActiveKeys.has(key)) continue;

    const { error } = await sb.from("grammar_remediation_assignments").insert({
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      grammar_unit_id: String(unit.id),
      source_error_id: String(errorRow.id),
      source_service_key: toText(errorRow.service_key, 80),
      reason: `Repair pattern: ${String(errorRow.error_type ?? "grammar instability")}`,
      priority: Math.max(1, Math.min(5, Number(errorRow.severity_score ?? 0.5) * 5)),
      status: "active",
      metadata: {
        seeded_by: "grammar-remediation.rebuild",
      },
    });
    if (!error) {
      inserted += 1;
      existingActiveKeys.add(key);
    }
  }

  if (inserted === 0 && activeAssignments.length === 0 && units[0]?.id) {
    await sb.from("grammar_remediation_assignments").insert({
      user_id: input.userId,
      language_id: input.languageId,
      product_id: input.productId,
      grammar_unit_id: String(units[0].id),
      reason: "Warm up with a baseline grammar drill to keep core accuracy stable.",
      priority: 1,
      status: "active",
      metadata: {
        seeded_by: "grammar-remediation.warmup",
      },
    });
  }

  const refreshed = await sb
    .from("grammar_remediation_assignments")
    .select("id, grammar_unit_id, source_error_id, source_service_key, reason, priority, status, assigned_at, completed_at, last_learning_attempt_id, metadata")
    .eq("user_id", input.userId)
    .eq("language_id", input.languageId)
    .order("priority", { ascending: false })
    .order("assigned_at", { ascending: false });
  return Array.isArray(refreshed.data) ? refreshed.data as Array<Record<string, unknown>> : [];
};

const loadUnit = async (sb: any, productId: string, languageId: string, identifier: string): Promise<Record<string, unknown> | null> => {
  let query = sb
    .from("grammar_units")
    .select("id, slug, title, level, focus_area, explanation_text, contrast_text, common_error_pattern, examples_json, tags, status, sort_order, metadata, presentation_meta")
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  return data as Record<string, unknown>;
};

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
    const productId = products.grammar?.productId;
    if (!productId) return json(500, { error: "english-grammar product is not configured" });

    // Grammar handbook: reference for every signed-in learner, so no activity guard.
    // The same for everyone, so the browser may keep it for a while.
    if (req.method === "GET" && route === "/handbook") {
      const { data, error } = await sb
        .from("grammar_units")
        .select(HANDBOOK_COLUMNS)
        .eq("product_id", productId)
        .eq("language_id", scope.languageId)
        .eq("status", "published");
      if (error) return json(500, { error: "Could not load the grammar handbook" });
      return new Response(JSON.stringify({ entries: buildHandbook((data ?? []) as Array<Record<string, unknown>>) }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=600", ...corsHeaders },
      });
    }

    if (req.method === "GET" && (route === "" || route === "/" || route === "/dashboard")) {
      const shouldRebuild = url.searchParams.get("rebuild") === "1";
      let assignments: Array<Record<string, unknown>> = [];
      if (shouldRebuild) {
        assignments = await rebuildAssignments(sb, { userId: auth.userId, languageId: scope.languageId, productId });
      } else {
        const assignmentsRes = await sb
          .from("grammar_remediation_assignments")
          .select("id, grammar_unit_id, source_error_id, source_service_key, reason, priority, status, assigned_at, completed_at, last_learning_attempt_id, metadata")
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .order("priority", { ascending: false })
          .order("assigned_at", { ascending: false });
        assignments = Array.isArray(assignmentsRes.data) ? assignmentsRes.data as Array<Record<string, unknown>> : [];
      }

      const [unitsRes, drillsRes] = await Promise.all([
        sb
          .from("grammar_units")
          .select("id, slug, title, level, focus_area, explanation_text, contrast_text, common_error_pattern, examples_json, tags, status, sort_order, metadata, presentation_meta")
          .eq("product_id", productId)
          .eq("language_id", scope.languageId)
          .eq("status", "published")
          .order("sort_order", { ascending: true }),
        sb
          .from("grammar_drills")
          .select("id, grammar_unit_id, drill_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, status, sort_order, metadata, presentation_meta")
          .eq("status", "published")
          .order("sort_order", { ascending: true }),
      ]);

      return json(200, {
        units: unitsRes.data ?? [],
        drills: ((drillsRes.data ?? []) as Array<Record<string, unknown>>).map(publicDrill),
        assignments,
        scope: {
          product_id: productId,
          language_id: scope.languageId,
        },
      });
    }

    if (req.method === "POST" && route === "/assignments/rebuild") {
      const assignments = await rebuildAssignments(sb, { userId: auth.userId, languageId: scope.languageId, productId });
      return json(200, { ok: true, assignments });
    }

    if (req.method === "GET" && route.startsWith("/units/")) {
      const identifier = decodeURIComponent(route.slice("/units/".length)).trim();
      if (!identifier) return json(404, { error: "Grammar unit not found" });
      const unit = await loadUnit(sb, productId, scope.languageId, identifier);
      if (!unit) return json(404, { error: "Grammar unit not found" });
      const drillsRes = await sb
        .from("grammar_drills")
        .select("id, grammar_unit_id, drill_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, status, sort_order, metadata, presentation_meta")
        .eq("grammar_unit_id", String(unit.id))
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      return json(200, {
        unit,
        drills: ((drillsRes.data ?? []) as Array<Record<string, unknown>>).map(publicDrill),
      });
    }

    // Submit a whole lesson: every practice item in a unit, checked together and
    // recorded as one attempt on the unit, so the lesson shows as done everywhere.
    if (req.method === "POST" && route.startsWith("/units/") && route.endsWith("/submit")) {
      // Paid skills, or today's free activity.
      const blocked = await guardActivity(sb, auth.userId, scope.languageId, "grammar", route);
      if (blocked) return blocked;
      const identifier = decodeURIComponent(route.slice("/units/".length, -"/submit".length)).trim();
      const unit = identifier ? await loadUnit(sb, productId, scope.languageId, identifier) : null;
      if (!unit) return json(404, { error: "Grammar unit not found" });

      const drillsRes = await sb
        .from("grammar_drills")
        .select("id, drill_type, title, instructions, prompt_text, expected_answer_json, sort_order")
        .eq("grammar_unit_id", String(unit.id))
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      const drills = (drillsRes.data ?? []) as Array<Record<string, unknown>>;
      if (!drills.length) return json(422, { error: "This lesson has no practice items yet" });

      const answersIn = Array.isArray(body.answers) ? body.answers as Array<Record<string, unknown>> : [];
      const responseByDrill = new Map(
        answersIn.map((entry) => [toText(entry.drill_id, 120), toText(entry.response, 2000)]),
      );

      const results = drills.map((drill) => {
        const response = responseByDrill.get(String(drill.id)) ?? "";
        const check = checkGrammarAnswer({
          prompt: toText(drill.prompt_text, 900),
          accepted: acceptedAnswersOf(drill),
          response,
        });
        return {
          drill_id: String(drill.id),
          prompt: toText(drill.prompt_text, 900),
          response,
          correct: check.correct,
          typo: check.typo,
          expected: check.expected,
        };
      });
      const correctCount = results.filter((result) => result.correct).length;
      const correctnessRatio = correctCount / results.length;

      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "grammar",
        contentType: "grammar.unit",
        sourceRef: toText(unit.slug, 120),
        title: toText(unit.title, 220),
        description: toText(unit.explanation_text, 900),
        skillKey: "grammar",
        subskillKeys: [`grammar.${toText(unit.focus_area, 80) || "accuracy"}`],
        cefrLevel: toText(unit.level, 8),
        estimatedMinutes: 8,
        tags: [toText(unit.focus_area, 80)].filter(Boolean),
      });

      const issues = correctnessRatio >= 1
        ? []
        : [{
            category: "grammar",
            subskill_key: `grammar.${toText(unit.focus_area, 80) || "accuracy"}`,
            location_ref: toText(unit.slug, 120),
            explanation: toText(unit.common_error_pattern, 320) || toText(unit.title, 220),
            correction_hint: toText(unit.contrast_text ?? unit.explanation_text, 220),
            severity: correctnessRatio < 0.5 ? 0.76 : 0.48,
          }];

      const score = calculateAttemptScore({
        correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 8),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: 0,
        retryCount: 0,
        correctionQualityRatio: correctnessRatio,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "grammar",
        score: score.overallScore,
        title: toText(unit.title, 220),
        reason: toText(unit.explanation_text, 900),
        issues,
      });
      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "grammar",
        contentItem,
        attemptType: "grammar.lesson",
        responseJson: { unit_id: String(unit.id), results },
        metadata: { unit_id: String(unit.id), unit_slug: toText(unit.slug, 120), correct: correctCount, total: results.length },
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });

      // Questions answered wrongly come back on the Review page.
      const drillById = new Map(drills.map((drill) => [String(drill.id), drill]));
      await queueReviewItems(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        attemptId: String(recorded.attempt.id ?? "") || null,
        items: results.filter((result) => !result.correct).flatMap((result) => {
          const drill = drillById.get(result.drill_id);
          if (!drill) return [];
          return [{
            kind: "grammar" as const,
            item_key: `grammar:${result.drill_id}`,
            payload: {
              type: "grammar" as const,
              prompt: result.prompt,
              instructions: toText(drill.instructions, 300),
              accepted: acceptedAnswersOf(drill),
              source_title: toText(unit.title, 220),
              source_slug: toText(unit.slug, 120),
            },
          }];
        }),
      });

      // Passing the lesson marks matching mistakes from writing and speaking as practised.
      // If the learner makes them again later, recording them reopens them.
      let practisedMistakes = 0;
      const focus = toText(unit.focus_area, 80);
      if (correctnessRatio >= 0.8 && focus) {
        const { data: improved } = await sb
          .from("learner_language_errors")
          .update({ mastery_status: "improving" })
          .eq("user_id", auth.userId)
          .eq("language_id", scope.languageId)
          .eq("subskill_key", `grammar.${focus}`)
          .in("mastery_status", ["open", "reopened"])
          .select("id");
        practisedMistakes = Array.isArray(improved) ? improved.length : 0;
      }

      return json(200, {
        ok: true,
        attempt_id: String(recorded.attempt.id ?? ""),
        practised_mistakes: practisedMistakes,
        score: Math.round(correctnessRatio * 100),
        correct: correctCount,
        total: results.length,
        results,
      });
    }

    if (req.method === "POST" && route === "/drills/submit") {
      // Paid skills, or today's free activity.
      const blocked = await guardActivity(sb, auth.userId, scope.languageId, "grammar", route);
      if (blocked) return blocked;
      const drillId = toText(body.drill_id, 120);
      const responseText = toText(body.response_text, 6000);
      if (!drillId || !responseText) return json(422, { error: "drill_id and response_text are required" });

      const drillRes = await sb
        .from("grammar_drills")
        .select("id, grammar_unit_id, drill_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, status, sort_order, metadata, presentation_meta")
        .eq("id", drillId)
        .eq("status", "published")
        .maybeSingle();
      if (drillRes.error || !drillRes.data?.id) return json(404, { error: "Grammar drill not found" });
      const drill = drillRes.data as Record<string, unknown>;

      const unit = await loadUnit(sb, productId, scope.languageId, String(drill.grammar_unit_id ?? ""));
      if (!unit) return json(404, { error: "Grammar unit not found" });

      const acceptedAnswers = acceptedAnswersOf(drill);
      const check = checkGrammarAnswer({ prompt: toText(drill.prompt_text, 900), accepted: acceptedAnswers, response: responseText });
      const exactMatch = check.correct;
      const partialMatch = false;
      const correctnessRatio = exactMatch ? 1 : 0;

      const issues = exactMatch
        ? []
        : [{
            category: "grammar",
            subskill_key: `grammar.${toText(unit.focus_area, 80) || "accuracy"}`,
            location_ref: toText(drill.drill_type, 80),
            explanation: toText(unit.common_error_pattern, 320) || "This grammar pattern still needs another focused correction loop.",
            correction_hint: `Review the contrast first, then retry: ${toText(unit.contrast_text ?? unit.explanation_text, 220)}`,
            severity: partialMatch ? 0.48 : 0.76,
          }];

      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "grammar",
        contentType: "grammar.drill",
        sourceRef: `${toText(unit.slug, 120)}:${String(drill.sort_order ?? 0)}`,
        title: toText(drill.title, 220),
        description: toText(drill.prompt_text, 900),
        skillKey: "grammar",
        subskillKeys: ["grammar.accuracy", "grammar.word-order", "grammar.transfer"],
        cefrLevel: toText(unit.level, 8),
        estimatedMinutes: 6,
        learningObjective: toText(drill.instructions, 900),
        tags: [toText(unit.focus_area, 80), toText(drill.drill_type, 80)].filter(Boolean),
        payloadJson: {
          unit_slug: toText(unit.slug, 120),
          drill_type: toText(drill.drill_type, 80),
          accepted_answers: acceptedAnswers,
        },
        metadata: unit.metadata && typeof unit.metadata === "object" ? unit.metadata as JsonRecord : {},
      });

      const score = calculateAttemptScore({
        correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 6),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        correctionQualityRatio: exactMatch ? 0.95 : partialMatch ? 0.62 : 0.32,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "grammar",
        score: score.overallScore,
        title: toText(drill.title, 220),
        reason: toText(unit.explanation_text, 900),
        issues,
      });

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "grammar",
        contentItem,
        attemptType: `grammar.${toText(drill.drill_type, 80) || "drill"}`,
        responseJson: {
          drill_id: String(drill.id),
          unit_id: String(unit.id),
          response_text: responseText,
          accepted_answers: acceptedAnswers,
        },
        metadata: {
          drill_id: String(drill.id),
          unit_id: String(unit.id),
          unit_slug: toText(unit.slug, 120),
          drill_type: toText(drill.drill_type, 80),
        },
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });

      const assignmentId = toText(body.assignment_id, 120);
      if (assignmentId) {
        await sb
          .from("grammar_remediation_assignments")
          .update({
            status: exactMatch ? "completed" : "active",
            completed_at: exactMatch ? new Date().toISOString() : null,
            last_learning_attempt_id: String(recorded.attempt.id ?? ""),
          })
          .eq("id", assignmentId)
          .eq("user_id", auth.userId);
      }

      return json(200, {
        ok: true,
        unit,
        drill,
        attempt: recorded.attempt,
        feedback: recorded.feedbackRow,
        scoring: {
          overall_score: score.overallScore,
          correctness_ratio: score.correctnessRatio,
          correction_quality_ratio: score.correctionQualityRatio,
        },
        evaluation: {
          correct: check.correct,
          typo: check.typo,
          expected: check.expected,
          exact_match: exactMatch,
          partial_match: partialMatch,
        },
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
