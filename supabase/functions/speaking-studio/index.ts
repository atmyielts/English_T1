import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { guardActivity } from "../_shared/english-allowance.ts";
import { creditUsedWords, loadPracticeWords } from "../_shared/english-words.ts";
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
import { callEnglishAIWithStatus, isEnglishAIConfigured } from "../_shared/english-ai.ts";
import {
  consumeEnglishAiDailyQuota,
  parseEnglishAiDailyLimit,
  requireEnglishSuiteAccess,
} from "../_shared/english-access.ts";
import {
  asLevel,
  buildSpeakingAIRequest,
  buildStats,
  countWords,
  issuesFromFeedback,
  normalizeAIFeedback,
  ruleBasedFeedback,
  type SpeakingFeedback,
  type SpeakingMode,
  type SpeakingPromptInput,
  tokenize,
} from "../_shared/english-speaking.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/speaking-studio";
const MIN_WORDS = 5;

const PROMPT_COLUMNS =
  "id, slug, title, prompt_text, prompt_type, level, target_duration_seconds, target_grammar, target_vocabulary, fluency_objective, pronunciation_objective, cue_points, status, sort_order, metadata, presentation_meta";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** A number from input, or null when missing (toNumber(null) would give 0). */
const optionalNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : toNumber(value);

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const stringList = (value: unknown, max = 12): string[] =>
  Array.isArray(value) ? value.map((entry) => toText(entry, 200)).filter(Boolean).slice(0, max) : [];

/** Prompt as sent to the learner: the example answer and checking keywords stay on the server until submit. */
const publicPrompt = (row: JsonRecord): JsonRecord => {
  const { model_answer: _answer, cue_keywords: _keywords, ...metadata } = asRecord(row.metadata);
  return { ...row, cue_points: stringList(row.cue_points), metadata };
};

const toPromptInput = (row: JsonRecord): SpeakingPromptInput => {
  const metadata = asRecord(row.metadata);
  return {
    title: toText(row.title, 220),
    prompt_text: toText(row.prompt_text, 1200),
    level: asLevel(row.level),
    target_duration_seconds: Math.max(10, Math.min(600, Math.round(toNumber(row.target_duration_seconds) ?? 60))),
    target_grammar: toText(row.target_grammar, 160),
    target_vocabulary: stringList(row.target_vocabulary, 12),
    cue_points: stringList(row.cue_points, 6),
    cue_keywords: Array.isArray(metadata.cue_keywords) ? metadata.cue_keywords.map((entry) => stringList(entry, 20)) : undefined,
    model_answer: toText(metadata.model_answer, 2400) || null,
  };
};

const loadPrompt = async (sb: any, productId: string, languageId: string, identifier: string): Promise<JsonRecord | null> => {
  let query = sb
    .from("speaking_prompts")
    .select(PROMPT_COLUMNS)
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  return data as JsonRecord;
};

/**
 * AI feedback only for learners with English access and quota left; anything
 * else (no key, no access, quota used, provider error, bad JSON) gets the
 * rule-based feedback. Reasons are logged, never shown to the learner.
 */
const evaluate = async (
  sb: any,
  userId: string,
  products: Record<string, { productId?: string | null }>,
  prompt: SpeakingPromptInput,
  transcript: string,
  mode: SpeakingMode,
  speakingSeconds: number | null,
): Promise<SpeakingFeedback> => {
  const basic = () => ruleBasedFeedback(prompt, transcript, mode, speakingSeconds);
  if (!isEnglishAIConfigured()) return basic();
  try {
    const access = await requireEnglishSuiteAccess(sb, userId, products);
    if (!access.allowed) return basic();
    const quota = await consumeEnglishAiDailyQuota(sb, userId, parseEnglishAiDailyLimit(Deno.env.get("ENGLISH_AI_DAILY_LIMIT")));
    if (!quota.allowed) return basic();
    const stats = buildStats(prompt, transcript, mode, speakingSeconds);
    const result = await callEnglishAIWithStatus<unknown>(buildSpeakingAIRequest(prompt, transcript, mode, stats), null);
    if (result.status !== "ok") {
      console.warn(JSON.stringify({ event: "speaking_ai_unavailable", status: result.status, error: result.error?.slice(0, 200) ?? null }));
      return basic();
    }
    const normalized = normalizeAIFeedback(result.data, prompt, transcript, mode, speakingSeconds);
    if (!normalized) console.warn(JSON.stringify({ event: "speaking_ai_unusable_output" }));
    return normalized ?? basic();
  } catch (error) {
    console.warn(JSON.stringify({ event: "speaking_ai_error", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return basic();
  }
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
      const limit = Math.max(1, Math.min(50, Math.floor(optionalNumber(url.searchParams.get("limit")) ?? 30)));
      let query = sb
        .from("speaking_prompts")
        .select(PROMPT_COLUMNS)
        .eq("product_id", productId)
        .eq("language_id", scope.languageId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(limit);
      if (level) query = query.eq("level", level);
      const { data, error } = await query;
      if (error) return json(500, { error: "Failed to load speaking prompts" });
      return json(200, { prompts: ((data ?? []) as JsonRecord[]).map(publicPrompt) });
    }

    // Submit one spoken (or typed) answer. Legacy `/practice/submit` uses the same path.
    const submitMatch = req.method === "POST" && route.startsWith("/prompts/") && route.endsWith("/submit");
    if (submitMatch || (req.method === "POST" && route === "/practice/submit")) {
      // Paid skills, or today's free activity.
      const blocked = await guardActivity(sb, auth.userId, scope.languageId, "speaking", route);
      if (blocked) return blocked;
      const identifier = submitMatch
        ? decodeURIComponent(route.slice("/prompts/".length, -"/submit".length)).trim()
        : toText(body.prompt_id ?? body.slug ?? body.source_ref, 120);
      const row = identifier ? await loadPrompt(sb, productId, scope.languageId, identifier) : null;
      if (!row) return json(404, { error: "Speaking prompt not found" });

      const transcript = toText(body.transcript ?? body.response_text, 6000);
      const modeRaw = toText(body.mode, 16) || (toText(body.transcript_source, 40) === "speech_api" ? "speech" : "typed");
      if (modeRaw !== "speech" && modeRaw !== "typed") return json(422, { error: "mode must be speech or typed" });
      const mode = modeRaw as SpeakingMode;
      if (countWords(transcript) < MIN_WORDS) {
        return json(422, { error: "Your answer is too short to check. Please say at least one or two full sentences.", code: "too_short" });
      }
      const secondsIn = optionalNumber(body.speaking_seconds);
      const speakingSeconds = mode === "speech" && secondsIn !== null ? Math.max(0, Math.min(900, Math.round(secondsIn))) : null;
      const timeSpentIn = optionalNumber(body.time_spent_seconds);
      const timeSpentSeconds = timeSpentIn !== null ? Math.max(1, Math.min(7200, Math.round(timeSpentIn))) : null;

      const prompt = toPromptInput(row);
      const slug = toText(row.slug, 160) || String(row.id);
      const feedback = await evaluate(sb, auth.userId, products, prompt, transcript, mode, speakingSeconds);
      const correctnessRatio = feedback.overall / 100;

      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "speaking",
        contentType: "speaking.prompt",
        sourceRef: slug,
        title: prompt.title,
        description: toText(row.prompt_text, 900),
        skillKey: "speaking",
        subskillKeys: ["speaking.fluency", "speaking.grammar", "speaking.task_completion", "vocabulary.usage"],
        cefrLevel: prompt.level,
        estimatedMinutes: Math.ceil(prompt.target_duration_seconds / 60) + 4,
        learningObjective: toText(row.fluency_objective ?? row.prompt_text, 900),
        tags: [toText(row.prompt_type, 80), prompt.target_grammar].filter(Boolean),
      });

      const score = calculateAttemptScore({
        correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 6),
        timeSpentSeconds,
        hintUsageCount: 0,
        retryCount: 0,
        correctionQualityRatio: correctnessRatio,
      });
      const feedbackPayload = buildFeedbackPayload({
        serviceKey: "speaking",
        score: score.overallScore,
        title: prompt.title,
        reason: toText(row.fluency_objective ?? row.prompt_text, 900),
        issues: issuesFromFeedback(feedback, slug),
      });

      const previousRes = await sb
        .from("speaking_attempts")
        .select("id, feedback_json")
        .eq("user_id", auth.userId)
        .eq("prompt_id", String(row.id))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previous = previousRes.data as JsonRecord | null;
      const previousFeedback = asRecord(previous?.feedback_json);
      const previousScore = previousFeedback.version === 2 && Number.isFinite(Number(previousFeedback.overall))
        ? Math.round(Number(previousFeedback.overall))
        : null;

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "speaking",
        contentItem,
        attemptType: mode === "speech" ? "speaking.spoken-response" : "speaking.typed-response",
        responseJson: {
          prompt_id: String(row.id),
          transcript,
          mode,
          speaking_seconds: speakingSeconds,
          feedback,
        },
        metadata: { prompt_id: String(row.id), prompt_slug: slug, mode, feedback_source: feedback.source },
        timeSpentSeconds,
        score,
        feedback: feedbackPayload,
        products,
      });
      const attemptId = String(recorded.attempt.id ?? "");

      // Service-level history (best effort: the learning attempt above is the record of truth).
      try {
        const serviceAttempt = await sb
          .from("speaking_attempts")
          .insert({
            user_id: auth.userId,
            language_id: scope.languageId,
            product_id: productId,
            prompt_id: String(row.id),
            status: "completed",
            actual_duration_seconds: speakingSeconds ?? 0,
            word_count: feedback.stats.words,
            filler_count: feedback.stats.filler_count,
            transcript_source: mode === "speech" ? "speech_api" : "manual",
            latest_learning_attempt_id: attemptId || null,
            previous_attempt_id: previous?.id ? String(previous.id) : null,
            retry_comparison_json: previousScore !== null ? { previous_score: previousScore, delta: feedback.overall - previousScore } : {},
            feedback_json: { version: 2, overall: feedback.overall, source: feedback.source, scores: feedback.scores },
            metadata: { prompt_slug: slug, mode },
          })
          .select("id")
          .maybeSingle();
        if (serviceAttempt.data?.id) {
          await sb.from("speaking_transcripts").upsert({
            attempt_id: String(serviceAttempt.data.id),
            user_id: auth.userId,
            transcript_text: transcript,
            transcript_confidence: null,
            transcript_tokens: tokenize(transcript).slice(0, 2000),
            metadata: { source: mode === "speech" ? "speech_api" : "manual" },
          }, { onConflict: "attempt_id" });
        } else if (serviceAttempt.error) {
          console.warn(JSON.stringify({ event: "speaking_attempt_store_failed", error: serviceAttempt.error.message }));
        }
      } catch (error) {
        console.warn(JSON.stringify({ event: "speaking_attempt_store_failed", error: error instanceof Error ? error.message : "unknown" }));
      }

      const yourWordsUsed = await creditUsedWords(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        wordIds: Array.isArray(body.your_word_ids) ? (body.your_word_ids as unknown[]).map(String) : [],
        text: transcript,
      }).catch(() => [] as string[]);

      return json(200, {
        ok: true,
        attempt_id: attemptId,
        score: feedback.overall,
        previous_score: previousScore,
        mode,
        transcript,
        feedback,
        your_words_used: yourWordsUsed,
      });
    }

    if (req.method === "GET" && route.startsWith("/prompts/")) {
      const identifier = decodeURIComponent(route.slice("/prompts/".length)).trim();
      if (!identifier) return json(404, { error: "Speaking prompt not found" });
      const prompt = await loadPrompt(sb, productId, scope.languageId, identifier);
      if (!prompt) return json(404, { error: "Speaking prompt not found" });
      const yourWords = await loadPracticeWords(sb, auth.userId, scope.languageId, 3);
      return json(200, {
        prompt: publicPrompt(prompt),
        your_words: yourWords.map((entry) => ({ id: entry.id, word: entry.word, definition: entry.definition })),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(JSON.stringify({ event: "speaking_studio_failed", error: error instanceof Error ? error.message.slice(0, 300) : "unknown" }));
    return json(500, { error: "Something went wrong. Please try again." });
  }
});
