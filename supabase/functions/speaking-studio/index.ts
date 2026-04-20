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
  parseBody,
  recordEvaluatedAttempt,
  resolveEnglishProducts,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/speaking-studio";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const fillerWords = new Set(["um", "uh", "like", "hmm", "er"]);

const tokenize = (text: string): string[] =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s?]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const clip = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const countWords = (text: string): number => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

const evaluateSpeaking = (
  prompt: Record<string, unknown>,
  responseText: string,
  previousAttempt: Record<string, unknown> | null,
): {
  wordCount: number;
  fillerCount: number;
  targetWordsUsed: string[];
  missedTargetWords: string[];
  issues: Array<Record<string, unknown>>;
  correctnessRatio: number;
  correctionQualityRatio: number;
  comparison: Record<string, unknown>;
} => {
  const normalizedText = String(responseText ?? "").trim();
  const wordCount = countWords(normalizedText);
  const tokens = tokenize(normalizedText);
  const fillerCount = tokens.filter((token) => fillerWords.has(token)).length;
  const lexicalTokens = tokens.filter((token) => !fillerWords.has(token));
  const uniqueRatio = lexicalTokens.length > 0 ? new Set(lexicalTokens).size / lexicalTokens.length : 0;
  const targetWords = Array.isArray(prompt.target_vocabulary)
    ? prompt.target_vocabulary.map((entry) => String(entry ?? "").toLowerCase()).filter(Boolean)
    : [];
  const targetWordsUsed = targetWords.filter((word) => lexicalTokens.includes(word));
  const missedTargetWords = targetWords.filter((word) => !targetWordsUsed.includes(word));
  const targetDurationSeconds = Math.max(10, Number(prompt.target_duration_seconds ?? 45));
  const minimumWords = Math.max(10, Math.round(targetDurationSeconds / 3));
  const previousScore = Number((previousAttempt?.feedback_json as Record<string, unknown> | undefined)?.overall_score ?? 0);
  const previousWordCount = Number(previousAttempt?.word_count ?? 0);
  const previousFillerCount = Number(previousAttempt?.filler_count ?? 0);

  const issues: Array<Record<string, unknown>> = [];
  if (wordCount < minimumWords) {
    issues.push({
      category: "speaking",
      subskill_key: "speaking.task_completion",
      location_ref: "whole-response",
      explanation: `The response is too short for the prompt. Aim for at least ${minimumWords} words.`,
      correction_hint: "Add one more idea and one follow-up sentence before trying again.",
      severity: 0.82,
    });
  }
  if (fillerCount >= 3) {
    issues.push({
      category: "speaking",
      subskill_key: "speaking.fluency",
      location_ref: "delivery",
      explanation: "Too many filler words are slowing down the response.",
      correction_hint: "Pause silently between ideas instead of using filler words like um or like.",
      severity: 0.68,
    });
  }
  if (uniqueRatio < 0.48 && wordCount >= 18) {
    issues.push({
      category: "vocabulary",
      subskill_key: "vocabulary.usage",
      location_ref: "whole-response",
      explanation: "The response repeats the same basic words too often.",
      correction_hint: "Replace one repeated word with a clearer synonym or one target phrase from the prompt.",
      severity: 0.58,
    });
  }
  if (/\bi\b/.test(normalizedText)) {
    issues.push({
      category: "grammar",
      subskill_key: "speaking.grammar",
      location_ref: "transcript",
      explanation: "The transcript still includes lowercase 'i' where 'I' should be capitalized.",
      correction_hint: "Review the sentence and fix first-person pronouns before the next attempt.",
      severity: 0.46,
    });
  }
  if (prompt.prompt_text && String(prompt.prompt_text).toLowerCase().includes("ask one") && !normalizedText.includes("?")) {
    issues.push({
      category: "speaking",
      subskill_key: "speaking.task_completion",
      location_ref: "ending",
      explanation: "The prompt asked for a follow-up question, but the response did not include one.",
      correction_hint: "Finish with one direct question so the answer fully completes the task.",
      severity: 0.61,
    });
  }
  if (targetWords.length > 0 && targetWordsUsed.length === 0) {
    issues.push({
      category: "vocabulary",
      subskill_key: "vocabulary.activation",
      location_ref: "target-language",
      explanation: "The response did not activate any of the target vocabulary from the prompt.",
      correction_hint: `Reuse at least one target word next time: ${missedTargetWords.slice(0, 3).join(", ")}.`,
      severity: 0.55,
    });
  }

  const brevityPenalty = wordCount < minimumWords ? clip((minimumWords - wordCount) / minimumWords, 0, 0.45) : 0;
  const fillerPenalty = clip(fillerCount * 0.06, 0, 0.22);
  const lexicalPenalty = wordCount >= 18 && uniqueRatio < 0.48 ? 0.1 : 0;
  const taskPenalty = issues.some((issue) => String(issue.subskill_key) === "speaking.task_completion") ? 0.08 : 0;
  const correctnessRatio = clip(1 - brevityPenalty - fillerPenalty - lexicalPenalty - taskPenalty, 0.18, 0.98);

  const improvedWords = wordCount > previousWordCount;
  const reducedFillers = fillerCount < previousFillerCount || previousFillerCount === 0;
  const improvementBonus = previousAttempt
    ? (improvedWords ? 0.1 : 0) + (reducedFillers ? 0.1 : 0) + (correctnessRatio > previousScore ? 0.12 : 0)
    : 0.08;
  const correctionQualityRatio = clip(0.45 + (correctnessRatio * 0.35) + improvementBonus, 0.25, 0.98);

  return {
    wordCount,
    fillerCount,
    targetWordsUsed,
    missedTargetWords,
    issues,
    correctnessRatio,
    correctionQualityRatio,
    comparison: previousAttempt
      ? {
          word_count_delta: wordCount - previousWordCount,
          filler_count_delta: fillerCount - previousFillerCount,
          previous_score: previousScore,
        }
      : {},
  };
};

const loadPrompt = async (sb: any, productId: string, languageId: string, identifier: string): Promise<Record<string, unknown> | null> => {
  let query = sb
    .from("speaking_prompts")
    .select("id, slug, title, prompt_text, prompt_type, level, target_duration_seconds, target_grammar, target_vocabulary, fluency_objective, pronunciation_objective, cue_points, status, sort_order, metadata, presentation_meta")
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
    const productId = products.speaking?.productId;
    if (!productId) return json(500, { error: "english-speaking product is not configured" });

    if (req.method === "GET" && (route === "" || route === "/" || route === "/prompts")) {
      const level = toText(url.searchParams.get("level"), 8).toUpperCase();
      const limit = Math.max(1, Math.min(20, Math.floor(toNumber(url.searchParams.get("limit")) ?? 12)));

      let query = sb
        .from("speaking_prompts")
        .select("id, slug, title, prompt_text, prompt_type, level, target_duration_seconds, target_grammar, target_vocabulary, fluency_objective, pronunciation_objective, cue_points, status, sort_order, metadata, presentation_meta")
        .eq("product_id", productId)
        .eq("language_id", scope.languageId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(limit);
      if (level) query = query.eq("level", level);

      const { data, error } = await query;
      if (error) return json(500, { error: "Failed to load speaking prompts", details: error.message });
      return json(200, {
        prompts: data ?? [],
        scope: {
          product_id: productId,
          language_id: scope.languageId,
        },
      });
    }

    if (req.method === "GET" && route.startsWith("/prompts/")) {
      const identifier = decodeURIComponent(route.slice("/prompts/".length)).trim();
      if (!identifier) return json(404, { error: "Speaking prompt not found" });
      const prompt = await loadPrompt(sb, productId, scope.languageId, identifier);
      if (!prompt) return json(404, { error: "Speaking prompt not found" });
      return json(200, { prompt });
    }

    if (req.method === "POST" && route === "/practice/submit") {
      const identifier = toText(body.prompt_id ?? body.slug ?? body.source_ref, 120);
      const responseText = toText(body.response_text, 12000);
      if (!identifier || !responseText) return json(422, { error: "prompt_id (or slug) and response_text are required" });

      const prompt = await loadPrompt(sb, productId, scope.languageId, identifier);
      if (!prompt) return json(404, { error: "Speaking prompt not found" });

      const previousAttemptRes = await sb
        .from("speaking_attempts")
        .select("id, word_count, filler_count, feedback_json")
        .eq("user_id", auth.userId)
        .eq("prompt_id", String(prompt.id))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousAttempt = previousAttemptRes.data as Record<string, unknown> | null;

      const evaluation = evaluateSpeaking(prompt, responseText, previousAttempt);
      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "speaking",
        contentType: "speaking.prompt",
        sourceRef: toText(prompt.slug, 160) || String(prompt.id),
        title: toText(prompt.title, 220),
        description: toText(prompt.prompt_text, 900),
        skillKey: "speaking",
        subskillKeys: ["speaking.fluency", "speaking.grammar", "speaking.pronunciation", "vocabulary.usage"],
        cefrLevel: toText(prompt.level, 8),
        estimatedMinutes: Math.max(4, Math.min(16, Math.ceil(Number(prompt.target_duration_seconds ?? 45) / 20) + 3)),
        learningObjective: toText(prompt.fluency_objective ?? prompt.prompt_text, 900),
        tags: [
          toText(prompt.prompt_type, 80),
          toText(prompt.target_grammar, 120),
        ].filter(Boolean),
        payloadJson: {
          target_duration_seconds: Number(prompt.target_duration_seconds ?? 45),
          target_grammar: toText(prompt.target_grammar, 120),
          target_vocabulary: Array.isArray(prompt.target_vocabulary) ? prompt.target_vocabulary : [],
          cue_points: Array.isArray(prompt.cue_points) ? prompt.cue_points : [],
        },
        metadata: prompt.metadata && typeof prompt.metadata === "object" ? prompt.metadata as JsonRecord : {},
      });

      const score = calculateAttemptScore({
        correctnessRatio: evaluation.correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 6),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        correctionQualityRatio: evaluation.correctionQualityRatio,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "speaking",
        score: score.overallScore,
        title: toText(prompt.title, 220),
        reason: "Transcript mode measures structure, fluency signals, and task completion. Pronunciation is not directly scored here.",
        issues: evaluation.issues,
      });

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "speaking",
        contentItem,
        attemptType: "speaking.transcript-response",
        responseJson: {
          prompt_id: String(prompt.id),
          response_text: responseText,
          target_words_used: evaluation.targetWordsUsed,
          missed_target_words: evaluation.missedTargetWords,
        },
        metadata: {
          prompt_id: String(prompt.id),
          prompt_type: toText(prompt.prompt_type, 80),
          transcript_mode: true,
        },
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });

      const attemptInsertRes = await sb
        .from("speaking_attempts")
        .insert({
          user_id: auth.userId,
          language_id: scope.languageId,
          product_id: productId,
          prompt_id: String(prompt.id),
          status: score.overallScore >= 0.8 ? "completed" : "submitted",
          actual_duration_seconds: Math.max(0, Math.floor(toNumber(body.time_spent_seconds) ?? 0)),
          word_count: evaluation.wordCount,
          filler_count: evaluation.fillerCount,
          transcript_source: toText(body.transcript_source, 40) || "manual",
          latest_learning_attempt_id: String(recorded.attempt.id ?? ""),
          previous_attempt_id: previousAttempt?.id ? String(previousAttempt.id) : null,
          retry_comparison_json: evaluation.comparison,
          feedback_json: {
            summary: String(recorded.feedbackRow.summary ?? ""),
            overall_score: Number((recorded.attempt.overall_score as number | null) ?? score.overallScore),
            target_words_used: evaluation.targetWordsUsed,
            missed_target_words: evaluation.missedTargetWords,
          },
          metadata: {
            prompt_slug: toText(prompt.slug, 120),
          },
        })
        .select("*")
        .maybeSingle();
      if (attemptInsertRes.error || !attemptInsertRes.data?.id) {
        return json(500, { error: "Failed to store speaking attempt", details: attemptInsertRes.error?.message ?? null });
      }

      const transcriptRes = await sb
        .from("speaking_transcripts")
        .upsert({
          attempt_id: String(attemptInsertRes.data.id),
          user_id: auth.userId,
          transcript_text: responseText,
          transcript_confidence: null,
          transcript_tokens: tokenize(responseText),
          metadata: {
            source: toText(body.transcript_source, 40) || "manual",
          },
        }, { onConflict: "attempt_id" })
        .select("*")
        .maybeSingle();
      if (transcriptRes.error || !transcriptRes.data?.attempt_id) {
        return json(500, { error: "Failed to store speaking transcript", details: transcriptRes.error?.message ?? null });
      }

      return json(200, {
        ok: true,
        prompt,
        service_attempt: attemptInsertRes.data,
        transcript: transcriptRes.data,
        attempt: recorded.attempt,
        feedback: recorded.feedbackRow,
        scoring: {
          overall_score: score.overallScore,
          correctness_ratio: score.correctnessRatio,
          correction_quality_ratio: score.correctionQualityRatio,
        },
        evaluation: {
          word_count: evaluation.wordCount,
          filler_count: evaluation.fillerCount,
          target_words_used: evaluation.targetWordsUsed,
          missed_target_words: evaluation.missedTargetWords,
          comparison: evaluation.comparison,
        },
        note: "Transcript mode scores structure and fluency proxies; pronunciation is not directly assessed.",
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
