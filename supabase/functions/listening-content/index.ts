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

const routeMarker = "/listening-content";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const tokenize = (value: string): string[] =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const functionWords = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "for",
  "at",
  "on",
  "in",
  "is",
  "are",
  "was",
  "were",
  "am",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "from",
  "with",
  "and",
  "but",
  "or",
  "because",
  "before",
  "after",
  "this",
  "that",
  "it",
  "one",
  "two",
]);

const buildLcsMatches = (expected: string[], actual: string[]): { expectedMatched: number[]; actualMatched: number[] } => {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (expected[i - 1] === actual[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const expectedMatched: number[] = [];
  const actualMatched: number[] = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === actual[j - 1]) {
      expectedMatched.push(i - 1);
      actualMatched.push(j - 1);
      i -= 1;
      j -= 1;
      continue;
    }
    if (dp[i - 1][j] >= dp[i][j - 1]) i -= 1;
    else j -= 1;
  }

  return {
    expectedMatched: expectedMatched.reverse(),
    actualMatched: actualMatched.reverse(),
  };
};

const evaluateDictation = (
  transcript: string,
  responseText: string,
): {
  correctnessRatio: number;
  issues: Array<Record<string, unknown>>;
  missingWords: string[];
  extraWords: string[];
  notebookWords: Array<Record<string, unknown>>;
} => {
  const expectedTokens = tokenize(transcript);
  const actualTokens = tokenize(responseText);
  const matches = buildLcsMatches(expectedTokens, actualTokens);
  const expectedMatchedSet = new Set(matches.expectedMatched);
  const actualMatchedSet = new Set(matches.actualMatched);
  const missingWords = expectedTokens.filter((_, index) => !expectedMatchedSet.has(index));
  const extraWords = actualTokens.filter((_, index) => !actualMatchedSet.has(index));
  const functionWordMisses = missingWords.filter((word) => functionWords.has(word));
  const contentWordMisses = unique(missingWords.filter((word) => !functionWords.has(word)));
  const correctnessRatio = expectedTokens.length > 0 ? matches.expectedMatched.length / expectedTokens.length : 0;

  const issues: Array<Record<string, unknown>> = [];
  if (correctnessRatio < 0.72) {
    issues.push({
      category: "listening",
      subskill_key: "listening.detail_recall",
      location_ref: "whole-clip",
      explanation: "Too many key details were missed in the dictation.",
      correction_hint: "Replay one clause at a time, then type the meaning before typing the full sentence.",
      severity: 0.82,
    });
  }
  if (functionWordMisses.length >= 2) {
    issues.push({
      category: "grammar",
      subskill_key: "listening.function_word_accuracy",
      location_ref: "connected-speech",
      explanation: `Small grammar words were missed: ${functionWordMisses.slice(0, 4).join(", ")}.`,
      correction_hint: "Use a slower replay and listen for articles, prepositions, and auxiliary verbs.",
      severity: 0.7,
    });
  }
  if (contentWordMisses.length > 0) {
    issues.push({
      category: "vocabulary",
      subskill_key: "listening.word_recognition",
      location_ref: "keyword-recovery",
      explanation: `Useful words were missed: ${contentWordMisses.slice(0, 4).join(", ")}.`,
      correction_hint: "Replay the clip, say each missed word aloud, and send the unstable ones to Vocabulary review.",
      severity: contentWordMisses.length >= 3 ? 0.74 : 0.58,
    });
  }
  if (extraWords.length >= 3) {
    issues.push({
      category: "listening",
      subskill_key: "listening.transcription_control",
      location_ref: "response-draft",
      explanation: "The response added extra words that were not in the clip.",
      correction_hint: "Pause after each chunk and write only the exact wording you heard.",
      severity: 0.48,
    });
  }

  const notebookWords = contentWordMisses.slice(0, 5).map((word) => ({
    word,
    definition: null,
    example: transcript,
    context_text: transcript,
    source_type: "english.listening.dictation",
    source_label: "English Listening",
    metadata: {
      seeded_by: "listening-content.submit",
      transcript_excerpt: transcript.slice(0, 220),
    },
  }));

  return {
    correctnessRatio,
    issues,
    missingWords: unique(missingWords),
    extraWords: unique(extraWords),
    notebookWords,
  };
};

const listItems = async (sb: any, productId: string, languageId: string, url: URL): Promise<Response> => {
  const level = toText(url.searchParams.get("level"), 8).toUpperCase();
  const limit = Math.max(1, Math.min(40, Math.floor(toNumber(url.searchParams.get("limit")) ?? 12)));

  let query = sb
    .from("listening_items")
    .select("id, slug, title, summary, transcript_text, level, category, accent, speed_label, speed_wpm, duration_seconds, focus_skill, tags, status, sort_order, metadata, presentation_meta")
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (level) query = query.eq("level", level);

  const { data, error } = await query;
  if (error) return json(500, { error: "Failed to load listening items", details: error.message });

  return json(200, {
    items: data ?? [],
    scope: {
      product_id: productId,
      language_id: languageId,
    },
  });
};

const loadItem = async (sb: any, productId: string, languageId: string, identifier: string): Promise<Record<string, unknown> | null> => {
  let query = sb
    .from("listening_items")
    .select("id, slug, title, summary, transcript_text, level, category, accent, speed_label, speed_wpm, duration_seconds, focus_skill, tags, status, sort_order, metadata, presentation_meta")
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
    const productId = products.listening?.productId;
    if (!productId) return json(500, { error: "english-listening product is not configured" });

    if (req.method === "GET" && (route === "" || route === "/" || route === "/items")) {
      return await listItems(sb, productId, scope.languageId, url);
    }

    if (req.method === "GET" && route.startsWith("/items/")) {
      const identifier = decodeURIComponent(route.slice("/items/".length)).trim();
      if (!identifier) return json(404, { error: "Listening item not found" });
      const item = await loadItem(sb, productId, scope.languageId, identifier);
      if (!item) return json(404, { error: "Listening item not found" });

      const [segmentsRes, taskSetsRes] = await Promise.all([
        sb
          .from("listening_segments")
          .select("id, segment_index, segment_text, starts_at_seconds, ends_at_seconds, focus_phrase, metadata")
          .eq("listening_item_id", String(item.id))
          .order("segment_index", { ascending: true }),
        sb
          .from("listening_task_sets")
          .select("id, task_type, title, instructions, target_skill_key, expected_answer_json, metadata, status, sort_order")
          .eq("listening_item_id", String(item.id))
          .eq("status", "published")
          .order("sort_order", { ascending: true }),
      ]);

      return json(200, {
        item,
        segments: segmentsRes.data ?? [],
        task_sets: taskSetsRes.data ?? [],
      });
    }

    if (req.method === "POST" && route === "/practice/submit") {
      const identifier = toText(body.item_id ?? body.slug ?? body.source_ref, 120);
      const responseText = toText(body.response_text, 6000);
      if (!identifier || !responseText) {
        return json(422, { error: "item_id (or slug) and response_text are required" });
      }

      const item = await loadItem(sb, productId, scope.languageId, identifier);
      if (!item) return json(404, { error: "Listening item not found" });

      const taskSetRes = await sb
        .from("listening_task_sets")
        .select("id, task_type, title, instructions, target_skill_key, expected_answer_json, metadata")
        .eq("listening_item_id", String(item.id))
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      const taskSet = taskSetRes.data as Record<string, unknown> | null;

      const transcript = toText(item.transcript_text, 6000);
      const evaluation = evaluateDictation(transcript, responseText);
      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "listening",
        contentType: `listening.${toText(taskSet?.task_type, 80) || "dictation"}`,
        sourceRef: toText(item.slug, 160) || String(item.id),
        title: toText(item.title, 220),
        description: toText(item.summary, 900),
        skillKey: "listening",
        subskillKeys: ["listening.word_recognition", "listening.detail_recall", "vocabulary.recall"],
        cefrLevel: toText(item.level, 8),
        difficulty: undefined,
        estimatedMinutes: Math.max(4, Math.min(18, Math.ceil((Number(item.duration_seconds ?? 18) / 60) + 3))),
        learningObjective: toText(taskSet?.instructions, 900) || toText(item.summary, 900),
        tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry)) : [],
        payloadJson: {
          accent: toText(item.accent, 80),
          speed_label: toText(item.speed_label, 40),
          speed_wpm: Number(item.speed_wpm ?? 130),
          duration_seconds: Number(item.duration_seconds ?? 20),
        },
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as JsonRecord : {},
      });

      const score = calculateAttemptScore({
        correctnessRatio: evaluation.correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 6),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        correctionQualityRatio: Math.max(0.35, Math.min(0.95, evaluation.correctnessRatio + 0.08)),
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "listening",
        score: score.overallScore,
        title: toText(item.title, 220),
        reason: toText(item.summary, 900),
        issues: evaluation.issues,
      });

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "listening",
        contentItem,
        attemptType: `listening.${toText(taskSet?.task_type, 80) || "dictation"}`,
        responseJson: {
          listening_item_id: String(item.id),
          task_set_id: String(taskSet?.id ?? ""),
          response_text: responseText,
          expected_transcript: transcript,
          missing_words: evaluation.missingWords,
          extra_words: evaluation.extraWords,
        },
        metadata: {
          listening_item_id: String(item.id),
          task_set_id: String(taskSet?.id ?? ""),
          accent: toText(item.accent, 80),
          speed_label: toText(item.speed_label, 40),
        },
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });

      return json(200, {
        ok: true,
        item,
        task_set: taskSet,
        attempt: recorded.attempt,
        feedback: recorded.feedbackRow,
        scoring: {
          correctness_ratio: score.correctnessRatio,
          overall_score: score.overallScore,
          time_efficiency_ratio: score.timeEfficiencyRatio,
        },
        evaluation: {
          missing_words: evaluation.missingWords,
          extra_words: evaluation.extraWords,
          expected_transcript: transcript,
        },
        notebook_words: evaluation.notebookWords,
        signals_enqueued: recorded.signalsCount,
        errors_updated: recorded.errorsCount,
        recommendations_regenerated: recorded.recommendationsCount,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
