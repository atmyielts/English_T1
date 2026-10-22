import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { guardActivity } from "../_shared/english-allowance.ts";
import { grammarTopicFor, topicSubskill } from "../_shared/english-mistakes.ts";
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
  rebuildRecommendationsForUser,
  recordEvaluatedAttempt,
  reopenMasteryFromTransferFailure,
  resolveEnglishProducts,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNumber,
  toText,
  type EnglishServiceKey,
} from "../_shared/english-learning.ts";
import { callEnglishAIWithStatus } from "../_shared/english-ai.ts";
import {
  applyJudgement,
  basicReplyCheck,
  buildJudgeRequest,
  checkChoices,
  minWordsFor,
  missionScore,
  ownWordCount,
  parseQuestions,
  publicQuestions,
  stepKind,
  type ChoiceResult,
  type ReplyCheck,
  type StepKind,
} from "../_shared/english-immersion.ts";

type JsonRecord = Record<string, unknown>;
type Row = Record<string, unknown>;

const routeMarker = "/immersion-missions";

const MISSION_COLUMNS =
  "id, slug, title, context_text, objective_text, mission_type, level, target_vocabulary, target_grammar, skill_mix, success_conditions_json, cultural_note, status, sort_order, metadata";
const STEP_COLUMNS =
  "id, mission_id, step_index, service_key, step_type, title, instructions, prompt_text, expected_answer_json, target_skill_key, estimated_minutes, status, metadata";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean) : [];

const SKILL_OF_KIND: Record<StepKind, EnglishServiceKey> = {
  read: "reading",
  listen: "listening",
  reply: "writing",
  speak: "speaking",
};

const stepMinutes = (steps: Row[]): number =>
  steps.reduce((sum, step) => sum + Math.max(1, Math.floor(toNumber(step.estimated_minutes) ?? 3)), 0);

/** Mission fields a learner sees before starting. The tip is saved for the result. */
const publicMission = (mission: Row, steps: Row[]) => ({
  id: String(mission.id),
  slug: toText(mission.slug, 160),
  title: toText(mission.title, 220),
  context_text: toText(mission.context_text, 2000),
  objective_text: toText(mission.objective_text, 900),
  mission_type: toText(mission.mission_type, 40),
  level: toText(mission.level, 8) || null,
  target_vocabulary: stringList(mission.target_vocabulary),
  success_conditions: stringList(mission.success_conditions_json),
  estimated_minutes: stepMinutes(steps),
  step_count: steps.length,
});

/** A step as sent before submitting: no answer key, no model answer. */
const publicStep = (step: Row, level: string | null) => {
  const kind = stepKind(step.step_type);
  const meta = asRecord(step.metadata);
  const accent = meta.accent === "gb" || meta.accent === "us" ? meta.accent : null;
  return {
    id: String(step.id),
    step_index: Number(step.step_index ?? 0),
    kind,
    title: toText(step.title, 220),
    instructions: toText(step.instructions, 900),
    // read: the notice; listen: the script the browser reads aloud (shown only after checking); reply/speak: the cue.
    text: String(step.prompt_text ?? "").slice(0, 4000),
    estimated_minutes: Math.max(1, Math.floor(toNumber(step.estimated_minutes) ?? 3)),
    questions: kind === "read" || kind === "listen" ? publicQuestions(step.expected_answer_json) : [],
    min_words: kind === "reply" || kind === "speak" ? minWordsFor(kind, level, step.expected_answer_json) : null,
    accent,
  };
};

const loadMission = async (sb: any, productId: string, languageId: string, identifier: string): Promise<{ mission: Row; steps: Row[] } | null> => {
  let query = sb
    .from("immersion_missions")
    .select(MISSION_COLUMNS)
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  const stepsRes = await sb
    .from("immersion_mission_steps")
    .select(STEP_COLUMNS)
    .eq("mission_id", String(data.id))
    .eq("status", "published")
    .order("step_index", { ascending: true });
  const steps = ((stepsRes.data ?? []) as Row[]).filter((step) => stepKind(step.step_type) !== null);
  return { mission: data as Row, steps };
};

type StepOutcome = {
  step_id: string;
  kind: StepKind;
  title: string;
  score: number;
  questions?: ChoiceResult[];
  transcript?: string;
  response?: string;
  mode?: "voice" | "typed";
  check?: ReplyCheck;
  model_answer?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const body = req.method === "POST" ? await parseBody(req) : {};
    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code") ?? body.language_code, 16) || "en");
    const products = await resolveEnglishProducts(sb);
    const productId = products.immersion?.productId;
    if (!productId) return json(500, { error: "Real-life tasks are not available right now" });

    // List of missions (summaries only).
    if (req.method === "GET" && (route === "" || route === "/" || route === "/missions")) {
      const level = toText(url.searchParams.get("level"), 8).toUpperCase();
      let query = sb
        .from("immersion_missions")
        .select(MISSION_COLUMNS)
        .eq("product_id", productId)
        .eq("language_id", scope.languageId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(50);
      if (level) query = query.eq("level", level);
      const { data, error } = await query;
      if (error) return json(500, { error: "Could not load tasks" });
      const missions = (data ?? []) as Row[];
      const ids = missions.map((mission) => String(mission.id));
      const stepsRes = ids.length
        ? await sb.from("immersion_mission_steps").select("id, mission_id, step_type, estimated_minutes").in("mission_id", ids).eq("status", "published")
        : { data: [] };
      const byMission = new Map<string, Row[]>();
      for (const step of (stepsRes.data ?? []) as Row[]) {
        if (!stepKind(step.step_type)) continue;
        const key = String(step.mission_id);
        byMission.set(key, [...(byMission.get(key) ?? []), step]);
      }
      return json(200, { missions: missions.map((mission) => publicMission(mission, byMission.get(String(mission.id)) ?? [])) });
    }

    // Submit a whole mission: every step checked together, one attempt recorded.
    if (req.method === "POST" && route.startsWith("/missions/") && route.endsWith("/submit")) {
      // Paid skills, or today's free activity.
      const blocked = await guardActivity(sb, auth.userId, scope.languageId, "immersion", route);
      if (blocked) return blocked;
      const identifier = decodeURIComponent(route.slice("/missions/".length, -"/submit".length)).trim();
      const loaded = identifier ? await loadMission(sb, productId, scope.languageId, identifier) : null;
      if (!loaded) return json(404, { error: "Task not found" });
      const { mission, steps } = loaded;
      if (!steps.length) return json(422, { error: "This task has no steps yet" });

      const level = toText(mission.level, 8) || null;
      const situation = toText(mission.context_text, 2000);
      const submitted = new Map<string, JsonRecord>();
      for (const entry of Array.isArray(body.steps) ? body.steps : []) {
        const rec = asRecord(entry);
        const id = toText(rec.step_id, 120);
        if (id) submitted.set(id, rec);
      }
      if (!submitted.size) return json(422, { error: "Please complete at least one step" });

      const outcomes: StepOutcome[] = await Promise.all(steps.map(async (step): Promise<StepOutcome> => {
        const kind = stepKind(step.step_type)!;
        const stepId = String(step.id);
        const given = submitted.get(stepId) ?? {};
        const base = { step_id: stepId, kind, title: toText(step.title, 220) };
        const expected = asRecord(step.expected_answer_json);
        const promptText = String(step.prompt_text ?? "");

        if (kind === "read" || kind === "listen") {
          const { results, score } = checkChoices(parseQuestions(expected), given.answers);
          return { ...base, score, questions: results, ...(kind === "listen" ? { transcript: promptText } : {}) };
        }

        const response = toText(given.text, 3000);
        const mode = kind === "speak" && given.mode === "voice" ? "voice" : "typed";
        const replyKind = kind;
        const basic = basicReplyCheck({ kind: replyKind, level, prompt: promptText, response, expected });
        let check: ReplyCheck = basic;
        // Only ask the AI about a real attempt in the learner's own words.
        if (ownWordCount(promptText, response) >= 3) {
          const ai = await callEnglishAIWithStatus<unknown>(
            buildJudgeRequest({
              kind: replyKind,
              level,
              situation,
              stepTitle: toText(step.title, 220),
              instructions: toText(step.instructions, 900),
              prompt: promptText,
              response,
              expected,
            }),
            null,
          );
          if (ai.status === "ok") {
            check = applyJudgement({ raw: ai.data, kind: replyKind, level, prompt: promptText, response, expected }) ?? basic;
          }
        }
        return {
          ...base,
          score: check.score,
          response,
          mode,
          check,
          model_answer: toText(expected.model_answer, 1200) || undefined,
        };
      }));

      const correctnessRatio = missionScore(outcomes.map((outcome) => outcome.score));
      const replySteps = outcomes.filter((outcome) => outcome.check);
      const feedbackMode = replySteps.length === 0
        ? null
        : replySteps.every((outcome) => outcome.check!.feedback_mode === "ai") ? "ai" : "basic";

      // Issues for the learner profile: wrong answers, missed points, corrections, tone.
      const issues: Array<Record<string, unknown>> = [];
      for (const outcome of outcomes) {
        const skill = SKILL_OF_KIND[outcome.kind];
        const location = `${toText(mission.slug, 120)}#${outcome.step_id}`;
        for (const question of outcome.questions ?? []) {
          if (question.correct) continue;
          issues.push({
            category: skill,
            subskill_key: `${skill}.detail`,
            location_ref: location,
            explanation: question.explanation || question.prompt,
            correction_hint: question.options[question.answer] ?? "",
            severity: 0.5,
          });
        }
        if (!outcome.check) continue;
        for (const point of outcome.check.points) {
          if (point.met) continue;
          issues.push({
            category: "immersion",
            subskill_key: "immersion.task_completion",
            location_ref: location,
            explanation: `The reply did not ${point.label}.`,
            correction_hint: `Next time, ${point.label}.`,
            severity: 0.55,
          });
        }
        for (const correction of outcome.check.corrections) {
          const topic = grammarTopicFor({ original: correction.original, corrected: correction.better, explanation: correction.explanation });
          issues.push({
            category: topic ? "grammar" : skill,
            // A grammar topic links the mistake to the lesson that fixes it.
            subskill_key: topic ? topicSubskill(topic) : `${skill}.accuracy`,
            location_ref: location,
            explanation: correction.explanation || `Better: ${correction.better}`,
            correction_hint: `${correction.original} → ${correction.better}`,
            severity: 0.45,
          });
        }
        if (outcome.check.tone && outcome.check.tone !== "good") {
          issues.push({
            category: "immersion",
            subskill_key: "immersion.register",
            location_ref: location,
            explanation: outcome.check.tone_note || "The tone did not quite fit the situation.",
            correction_hint: "Match how polite or formal you are to the person and the situation.",
            severity: outcome.check.tone === "inappropriate" ? 0.7 : 0.4,
          });
        }
      }

      const minutes = stepMinutes(steps);
      const slug = toText(mission.slug, 160);
      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "immersion",
        contentType: "immersion.mission",
        sourceRef: slug,
        title: toText(mission.title, 220),
        description: toText(mission.objective_text, 900),
        skillKey: "immersion",
        subskillKeys: ["immersion.transfer", "immersion.communication", "immersion.problem-solving"],
        cefrLevel: level,
        estimatedMinutes: minutes,
        learningObjective: toText(mission.objective_text, 900),
        tags: [toText(mission.mission_type, 80), ...stringList(mission.skill_mix)].filter(Boolean),
      });

      const score = calculateAttemptScore({
        correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? minutes),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: 0,
        retryCount: 0,
        correctionQualityRatio: correctnessRatio,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "immersion",
        score: score.overallScore,
        title: toText(mission.title, 220),
        reason: toText(mission.objective_text, 900),
        issues: issues.slice(0, 12),
      });

      const stepSummaries = outcomes.map((outcome) => ({
        step_id: outcome.step_id,
        kind: outcome.kind,
        score: Math.round(outcome.score * 100),
        ...(outcome.questions ? { answers: outcome.questions.map((question) => ({ id: question.id, chosen: question.chosen, correct: question.correct })) } : {}),
        ...(outcome.check
          ? {
              response: outcome.response,
              mode: outcome.mode,
              feedback_mode: outcome.check.feedback_mode,
              points: outcome.check.points,
              corrections: outcome.check.corrections,
            }
          : {}),
      }));

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "immersion",
        contentItem,
        attemptType: "immersion.mission",
        responseJson: { mission_id: String(mission.id), steps: stepSummaries },
        metadata: { mission_id: String(mission.id), mission_slug: slug, feedback_mode: feedbackMode },
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });
      const attemptId = String(recorded.attempt.id ?? "");

      // Mission history and adaptive follow-up are useful but must never fail the submit.
      try {
        await sb.from("immersion_mission_attempts").insert({
          user_id: auth.userId,
          language_id: scope.languageId,
          product_id: productId,
          mission_id: String(mission.id),
          status: correctnessRatio >= 0.78 ? "completed" : correctnessRatio >= 0.6 ? "submitted" : "needs_recovery",
          latest_learning_attempt_id: attemptId || null,
          overall_score: Number(correctnessRatio.toFixed(4)),
          completion_ratio: Number((outcomes.filter((outcome) => submitted.has(outcome.step_id)).length / outcomes.length).toFixed(4)),
          step_results_json: stepSummaries,
          feedback_json: { feedback_mode: feedbackMode, issues: issues.slice(0, 12) },
          metadata: { mission_slug: slug },
        });
        if (correctnessRatio < 0.5) {
          const weak = [...new Set(outcomes.filter((outcome) => outcome.score < 0.6).map((outcome) => SKILL_OF_KIND[outcome.kind]))];
          const reopened = weak.length
            ? await reopenMasteryFromTransferFailure(sb, {
                userId: auth.userId,
                languageId: scope.languageId,
                serviceKeys: weak,
                reason: `Real-life task "${toText(mission.title, 220)}" showed these skills are not yet stable.`,
                metadata: { mission_slug: slug, learning_attempt_id: attemptId },
              })
            : 0;
          if (reopened > 0) await rebuildRecommendationsForUser(sb, { userId: auth.userId, languageId: scope.languageId, products });
        }
      } catch (_error) {
        // ignore: the attempt itself is already recorded
      }

      return json(200, {
        ok: true,
        attempt_id: attemptId,
        score: Math.round(correctnessRatio * 100),
        feedback_mode: feedbackMode,
        cultural_note: toText(mission.cultural_note, 1200) || null,
        success_conditions: stringList(mission.success_conditions_json),
        steps: outcomes.map((outcome) => ({
          step_id: outcome.step_id,
          kind: outcome.kind,
          title: outcome.title,
          score: Math.round(outcome.score * 100),
          questions: outcome.questions ?? [],
          transcript: outcome.transcript ?? null,
          response: outcome.response ?? null,
          mode: outcome.mode ?? null,
          feedback: outcome.check
            ? {
                mode: outcome.check.feedback_mode,
                achieved: outcome.check.achieved,
                points: outcome.check.points,
                tone: outcome.check.tone,
                tone_note: outcome.check.tone_note,
                corrections: outcome.check.corrections,
                summary: outcome.check.summary,
                word_count: outcome.check.word_count,
                min_words: outcome.check.min_words,
                too_short: outcome.check.too_short,
              }
            : null,
          model_answer: outcome.model_answer ?? null,
        })),
      });
    }

    // One mission with its steps, answer keys removed.
    if (req.method === "GET" && route.startsWith("/missions/")) {
      const identifier = decodeURIComponent(route.slice("/missions/".length)).trim();
      const loaded = identifier ? await loadMission(sb, productId, scope.languageId, identifier) : null;
      if (!loaded) return json(404, { error: "Task not found" });
      const level = toText(loaded.mission.level, 8) || null;
      return json(200, {
        mission: publicMission(loaded.mission, loaded.steps),
        steps: loaded.steps.map((step) => publicStep(step, level)),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("immersion-missions", error);
    return json(500, { error: "Something went wrong. Please try again." });
  }
});
