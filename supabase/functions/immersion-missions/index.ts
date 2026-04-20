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
  recordEvaluatedAttempt,
  rebuildRecommendationsForUser,
  reopenMasteryFromTransferFailure,
  resolveEnglishProducts,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNumber,
  toText,
  type EnglishServiceKey,
} from "../_shared/english-learning.ts";

type JsonRecord = Record<string, unknown>;
type MissionRow = Record<string, unknown>;
type MissionStepRow = Record<string, unknown>;

const routeMarker = "/immersion-missions";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const clip = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const countWords = (text: string): number => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

const tokenize = (text: string): string[] =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const hasKeyword = (text: string, keyword: string): boolean => {
  const normalizedText = ` ${String(text ?? "").toLowerCase()} `;
  const normalizedKeyword = String(keyword ?? "").trim().toLowerCase();
  return normalizedKeyword.length > 0 && normalizedText.includes(` ${normalizedKeyword} `);
};

const categoryToServiceKey = (value: unknown): EnglishServiceKey | null => {
  const text = toText(value, 80).toLowerCase();
  if (!text) return null;
  if (text.includes("grammar")) return "grammar";
  if (text.includes("vocabulary")) return "vocabulary";
  if (text.includes("reading")) return "reading";
  if (text.includes("listening")) return "listening";
  if (text.includes("writing")) return "writing";
  if (text.includes("speaking")) return "speaking";
  if (text.includes("immersion")) return "immersion";
  return null;
};

const loadMissionWithSteps = async (
  sb: any,
  productId: string,
  languageId: string,
  identifier: string,
): Promise<{ mission: MissionRow; steps: MissionStepRow[] } | null> => {
  let query = sb
    .from("immersion_missions")
    .select("id, slug, title, context_text, objective_text, mission_type, level, target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata, presentation_meta")
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;

  const stepsRes = await sb
    .from("immersion_mission_steps")
    .select("id, mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, estimated_minutes, status, metadata")
    .eq("mission_id", String(data.id))
    .eq("status", "published")
    .order("step_index", { ascending: true });

  return {
    mission: data as MissionRow,
    steps: Array.isArray(stepsRes.data) ? stepsRes.data as MissionStepRow[] : [],
  };
};

const loadMissionList = async (
  sb: any,
  productId: string,
  languageId: string,
  options: { limit: number; level?: string },
): Promise<Array<MissionRow & { steps: MissionStepRow[] }>> => {
  let query = sb
    .from("immersion_missions")
    .select("id, slug, title, context_text, objective_text, mission_type, level, target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata, presentation_meta")
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(options.limit);
  if (options.level) query = query.eq("level", options.level);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load immersion missions: ${error.message}`);

  const missions = Array.isArray(data) ? data as MissionRow[] : [];
  const missionIds = missions.map((mission) => String(mission.id ?? "")).filter(Boolean);
  if (missionIds.length === 0) return [];

  const stepsRes = await sb
    .from("immersion_mission_steps")
    .select("id, mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, estimated_minutes, status, metadata")
    .in("mission_id", missionIds)
    .eq("status", "published")
    .order("step_index", { ascending: true });
  const steps = Array.isArray(stepsRes.data) ? stepsRes.data as MissionStepRow[] : [];
  const stepsByMission = new Map<string, MissionStepRow[]>();
  for (const step of steps) {
    const missionId = String(step.mission_id ?? "");
    const bucket = stepsByMission.get(missionId) ?? [];
    bucket.push(step);
    stepsByMission.set(missionId, bucket);
  }

  return missions.map((mission) => ({
    ...mission,
    steps: stepsByMission.get(String(mission.id ?? "")) ?? [],
  }));
};

const evaluateMission = (
  mission: MissionRow,
  steps: MissionStepRow[],
  responses: Array<Record<string, unknown>>,
  previousAttempt: Record<string, unknown> | null,
): {
  issues: Array<Record<string, unknown>>;
  stepResults: Array<Record<string, unknown>>;
  completionRatio: number;
  correctnessRatio: number;
  correctionQualityRatio: number;
  usedMissionVocabulary: string[];
  missedMissionVocabulary: string[];
  comparison: Record<string, unknown>;
  transferServicesToReopen: EnglishServiceKey[];
} => {
  const responseMap = new Map<string, string>();
  for (const row of responses) {
    const stepId = toText(row.step_id, 120);
    if (!stepId) continue;
    responseMap.set(stepId, toText(row.response_text, 12000));
  }

  const missionVocabulary = Array.isArray(mission.target_vocabulary)
    ? mission.target_vocabulary.map((entry) => String(entry ?? "").trim().toLowerCase()).filter(Boolean)
    : [];
  const issues: Array<Record<string, unknown>> = [];
  const stepResults: Array<Record<string, unknown>> = [];
  const transferServices = new Set<EnglishServiceKey>();
  const usedMissionVocab = new Set<string>();

  for (const step of steps) {
    const stepId = String(step.id ?? "");
    const responseText = responseMap.get(stepId) ?? "";
    const trimmedResponse = responseText.trim();
    const expected = step.expected_answer_json && typeof step.expected_answer_json === "object"
      ? step.expected_answer_json as Record<string, unknown>
      : {};
    const requiredKeywords = Array.isArray(expected.required_keywords)
      ? expected.required_keywords.map((entry) => String(entry ?? "").trim().toLowerCase()).filter(Boolean)
      : [];
    const minimumWords = Math.max(0, Math.floor(toNumber(expected.minimum_words) ?? 0));
    const wordCount = countWords(trimmedResponse);
    const matchedKeywords = requiredKeywords.filter((keyword) => hasKeyword(trimmedResponse, keyword));
    const missingKeywords = requiredKeywords.filter((keyword) => !matchedKeywords.includes(keyword));
    const serviceKey = normalizeServiceKey(step.service_key) ?? "immersion";
    const serviceSubskillBase = serviceKey === "immersion" ? "immersion.transfer" : `${serviceKey}.detail`;
    const stepIssues: Array<Record<string, unknown>> = [];

    if (!trimmedResponse) {
      stepIssues.push({
        category: serviceKey,
        subskill_key: serviceSubskillBase,
        location_ref: `step-${Number(step.step_index ?? 0) + 1}`,
        explanation: "This mission step was left blank, so transfer could not be validated here.",
        correction_hint: "Complete the step with one clear response before retrying the mission.",
        severity: 0.88,
      });
    }

    if (minimumWords > 0 && trimmedResponse && wordCount < minimumWords) {
      stepIssues.push({
        category: serviceKey,
        subskill_key: serviceKey === "speaking" ? "speaking.task_completion" : serviceKey === "writing" ? "writing.task_completion" : serviceSubskillBase,
        location_ref: `step-${Number(step.step_index ?? 0) + 1}`,
        explanation: `This response is too short for the task. Aim for at least ${minimumWords} words.`,
        correction_hint: "Add one more complete idea so the step solves the mission problem clearly.",
        severity: 0.68,
      });
    }

    if (missingKeywords.length > 0 && trimmedResponse) {
      stepIssues.push({
        category: serviceKey,
        subskill_key: serviceSubskillBase,
        location_ref: `step-${Number(step.step_index ?? 0) + 1}`,
        explanation: `Important task details are missing: ${missingKeywords.slice(0, 3).join(", ")}.`,
        correction_hint: "Reuse the key facts from the prompt so your answer covers the mission requirement fully.",
        severity: clip(missingKeywords.length / Math.max(1, requiredKeywords.length), 0.35, 0.78),
      });
    }

    if ((serviceKey === "speaking" || serviceKey === "writing") && /\bi\b/.test(trimmedResponse)) {
      stepIssues.push({
        category: "grammar",
        subskill_key: `${serviceKey}.grammar`,
        location_ref: `step-${Number(step.step_index ?? 0) + 1}`,
        explanation: "The response still uses lowercase 'i' where 'I' should be capitalized.",
        correction_hint: "Clean up sentence-level grammar before retrying the mission.",
        severity: 0.42,
      });
    }

    if (serviceKey === "writing" && trimmedResponse && !/[.!?]$/.test(trimmedResponse)) {
      stepIssues.push({
        category: "grammar",
        subskill_key: "writing.sentence_control",
        location_ref: `step-${Number(step.step_index ?? 0) + 1}`,
        explanation: "The written message needs clear sentence punctuation at the end.",
        correction_hint: "Finish the last sentence with a full stop or question mark.",
        severity: 0.46,
      });
    }

    const completionRatio = trimmedResponse ? 1 : 0;
    const keywordRatio = requiredKeywords.length > 0 ? matchedKeywords.length / requiredKeywords.length : (trimmedResponse ? 1 : 0);
    const lengthRatio = minimumWords > 0 ? clip(wordCount / minimumWords, trimmedResponse ? 0.2 : 0, 1) : (trimmedResponse ? 1 : 0);
    const grammarPenalty = stepIssues.filter((issue) => String(issue.category ?? "") === "grammar").length * 0.06;
    const stepScore = clip(
      (completionRatio * 0.35) + (keywordRatio * 0.45) + (lengthRatio * 0.2) - grammarPenalty,
      0.08,
      0.98,
    );

    for (const token of missionVocabulary) {
      if (hasKeyword(trimmedResponse, token)) usedMissionVocab.add(token);
    }
    if (stepScore < 0.7 && serviceKey !== "immersion") transferServices.add(serviceKey);
    for (const issue of stepIssues) {
      const issueService = categoryToServiceKey(issue.category);
      if (issueService && issueService !== "immersion") transferServices.add(issueService);
    }

    issues.push(...stepIssues);
    stepResults.push({
      step_id: stepId,
      title: toText(step.title, 220),
      service_key: serviceKey,
      step_type: toText(step.step_type, 80),
      word_count: wordCount,
      matched_keywords: matchedKeywords,
      missing_keywords: missingKeywords,
      score: stepScore,
      response_text: responseText,
    });
  }

  const completedSteps = stepResults.filter((row) => toText(row.response_text, 12000).length > 0).length;
  const completionRatio = steps.length > 0 ? completedSteps / steps.length : 0;
  const stepAverage = stepResults.length > 0
    ? stepResults.reduce((sum, row) => sum + Number(row.score ?? 0), 0) / stepResults.length
    : 0;
  const usedMissionVocabulary = Array.from(usedMissionVocab);
  const missedMissionVocabulary = missionVocabulary.filter((entry) => !usedMissionVocab.has(entry));

  if (missionVocabulary.length > 0 && usedMissionVocabulary.length === 0) {
    issues.push({
      category: "vocabulary",
      subskill_key: "vocabulary.activation",
      location_ref: "mission-wide",
      explanation: "The mission did not activate any of the target vocabulary in a real-use response.",
      correction_hint: `Reuse at least one target phrase next time: ${missedMissionVocabulary.slice(0, 3).join(", ")}.`,
      severity: 0.58,
    });
    transferServices.add("vocabulary");
  }

  const previousScore = Number(previousAttempt?.overall_score ?? 0);
  const previousCompletion = Number(previousAttempt?.completion_ratio ?? 0);
  const improvementBonus = previousAttempt
    ? (stepAverage > previousScore ? 0.08 : 0) + (completionRatio > previousCompletion ? 0.06 : 0)
    : 0.08;
  const missionVocabRatio = missionVocabulary.length > 0 ? usedMissionVocabulary.length / missionVocabulary.length : 1;
  const correctnessRatio = clip(
    (stepAverage * 0.72) + (completionRatio * 0.18) + (missionVocabRatio * 0.1),
    0.12,
    0.98,
  );
  const correctionQualityRatio = clip(
    0.35 + (correctnessRatio * 0.4) + (completionRatio * 0.15) + (missionVocabRatio * 0.05) + improvementBonus,
    0.22,
    0.98,
  );

  return {
    issues: issues.slice(0, 12),
    stepResults,
    completionRatio,
    correctnessRatio,
    correctionQualityRatio,
    usedMissionVocabulary,
    missedMissionVocabulary,
    comparison: previousAttempt
      ? {
          previous_score: previousScore,
          previous_completion_ratio: previousCompletion,
          score_delta: correctnessRatio - previousScore,
        }
      : {},
    transferServicesToReopen: Array.from(transferServices),
  };
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
    const productId = products.immersion?.productId;
    if (!productId) return json(500, { error: "english-immersion product is not configured" });

    if (req.method === "GET" && (route === "" || route === "/" || route === "/missions")) {
      const level = toText(url.searchParams.get("level"), 8).toUpperCase();
      const limit = Math.max(1, Math.min(20, Math.floor(toNumber(url.searchParams.get("limit")) ?? 12)));
      const missions = await loadMissionList(sb, productId, scope.languageId, { limit, level: level || undefined });
      return json(200, {
        missions,
        scope: {
          product_id: productId,
          language_id: scope.languageId,
        },
      });
    }

    if (req.method === "GET" && route.startsWith("/missions/")) {
      const identifier = decodeURIComponent(route.slice("/missions/".length)).trim();
      if (!identifier) return json(404, { error: "Immersion mission not found" });
      const loaded = await loadMissionWithSteps(sb, productId, scope.languageId, identifier);
      if (!loaded) return json(404, { error: "Immersion mission not found" });
      return json(200, loaded);
    }

    if (req.method === "POST" && route === "/missions/submit") {
      const identifier = toText(body.mission_id ?? body.slug ?? body.source_ref, 120);
      const rawResponses = Array.isArray(body.step_responses) ? body.step_responses : [];
      if (!identifier || rawResponses.length === 0) {
        return json(422, { error: "mission_id (or slug) and step_responses are required" });
      }

      const loaded = await loadMissionWithSteps(sb, productId, scope.languageId, identifier);
      if (!loaded) return json(404, { error: "Immersion mission not found" });
      const { mission, steps } = loaded;

      const previousAttemptRes = await sb
        .from("immersion_mission_attempts")
        .select("id, overall_score, completion_ratio")
        .eq("user_id", auth.userId)
        .eq("mission_id", String(mission.id))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousAttempt = previousAttemptRes.data as Record<string, unknown> | null;

      const evaluation = evaluateMission(
        mission,
        steps,
        rawResponses.map((entry) => (entry && typeof entry === "object" ? entry as Record<string, unknown> : {})),
        previousAttempt,
      );
      const stepMinutes = steps.reduce((sum, step) => sum + Math.max(1, Number(step.estimated_minutes ?? 4)), 0);
      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "immersion",
        contentType: "immersion.mission",
        sourceRef: toText(mission.slug, 160) || String(mission.id),
        title: toText(mission.title, 220),
        description: toText(mission.objective_text, 900),
        skillKey: "immersion",
        subskillKeys: ["immersion.transfer", "immersion.communication", "immersion.problem-solving"],
        cefrLevel: toText(mission.level, 8),
        estimatedMinutes: Math.max(10, stepMinutes),
        learningObjective: toText(mission.objective_text, 900),
        tags: [
          toText(mission.mission_type, 80),
          toText(mission.target_grammar, 120),
          ...(Array.isArray(mission.skill_mix) ? mission.skill_mix.map((entry) => String(entry ?? "")) : []),
        ].filter(Boolean),
        payloadJson: {
          mission_type: toText(mission.mission_type, 80),
          target_vocabulary: Array.isArray(mission.target_vocabulary) ? mission.target_vocabulary : [],
          skill_mix: Array.isArray(mission.skill_mix) ? mission.skill_mix : [],
          step_count: steps.length,
        },
        metadata: mission.metadata && typeof mission.metadata === "object" ? mission.metadata as JsonRecord : {},
      });

      const score = calculateAttemptScore({
        correctnessRatio: evaluation.correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? stepMinutes),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        correctionQualityRatio: evaluation.correctionQualityRatio,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "immersion",
        score: score.overallScore,
        title: toText(mission.title, 220),
        reason: "Immersion missions validate whether skill work transfers into realistic English use across multiple steps.",
        issues: evaluation.issues,
      });

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "immersion",
        contentItem,
        attemptType: "immersion.mission",
        responseJson: {
          mission_id: String(mission.id),
          step_responses: rawResponses,
          used_target_vocabulary: evaluation.usedMissionVocabulary,
          missed_target_vocabulary: evaluation.missedMissionVocabulary,
        },
        metadata: {
          mission_id: String(mission.id),
          mission_type: toText(mission.mission_type, 80),
          skill_mix: Array.isArray(mission.skill_mix) ? mission.skill_mix : [],
        },
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });

      const masteryReopenedCount = score.overallScore < 0.65
        ? await reopenMasteryFromTransferFailure(sb, {
            userId: auth.userId,
            languageId: scope.languageId,
            serviceKeys: evaluation.transferServicesToReopen,
            reason: `Immersion mission "${toText(mission.title, 220)}" showed transfer instability.`,
            metadata: {
              mission_id: String(mission.id),
              mission_slug: toText(mission.slug, 160),
              learning_attempt_id: String(recorded.attempt.id ?? ""),
              transfer_score: score.overallScore,
            },
          })
        : 0;
      if (masteryReopenedCount > 0) {
        await rebuildRecommendationsForUser(sb, {
          userId: auth.userId,
          languageId: scope.languageId,
          products,
        });
      }

      const { data: missionAttempt, error: missionAttemptError } = await sb
        .from("immersion_mission_attempts")
        .insert({
          user_id: auth.userId,
          language_id: scope.languageId,
          product_id: productId,
          mission_id: String(mission.id),
          status: score.overallScore >= 0.78 ? "completed" : score.overallScore >= 0.6 ? "submitted" : "needs_recovery",
          latest_learning_attempt_id: String(recorded.attempt.id ?? ""),
          previous_attempt_id: previousAttempt?.id ? String(previousAttempt.id) : null,
          overall_score: score.overallScore,
          completion_ratio: evaluation.completionRatio,
          transfer_reopen_count: masteryReopenedCount,
          step_results_json: evaluation.stepResults,
          feedback_json: {
            summary: String(recorded.feedbackRow.summary ?? ""),
            overall_score: score.overallScore,
            completion_ratio: evaluation.completionRatio,
            used_target_vocabulary: evaluation.usedMissionVocabulary,
            missed_target_vocabulary: evaluation.missedMissionVocabulary,
          },
          metadata: {
            mission_slug: toText(mission.slug, 160),
            mission_type: toText(mission.mission_type, 80),
            comparison: evaluation.comparison,
          },
        })
        .select("*")
        .maybeSingle();
      if (missionAttemptError || !missionAttempt?.id) {
        return json(500, {
          error: "Failed to store immersion mission attempt",
          details: missionAttemptError?.message ?? null,
        });
      }

      return json(200, {
        ok: true,
        mission,
        step_results: evaluation.stepResults,
        attempt: missionAttempt,
        feedback: recorded.feedbackRow,
        scoring: {
          overall_score: score.overallScore,
          correctness_ratio: score.correctnessRatio,
          correction_quality_ratio: score.correctionQualityRatio,
          completion_ratio: evaluation.completionRatio,
        },
        evaluation: {
          used_target_vocabulary: evaluation.usedMissionVocabulary,
          missed_target_vocabulary: evaluation.missedMissionVocabulary,
          comparison: evaluation.comparison,
        },
        mastery_reopened_count: masteryReopenedCount,
        note: masteryReopenedCount > 0
          ? `${masteryReopenedCount} stable mastery unit(s) reopened because this mission did not transfer cleanly.`
          : "Immersion mission recorded.",
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
