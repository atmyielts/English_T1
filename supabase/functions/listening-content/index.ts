import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { guardActivity } from "../_shared/english-allowance.ts";
import { queueReviewItems } from "../_shared/english-review.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dedupeSubmits, isSubmitPath } from "../_shared/english-client-attempt.ts";
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
import {
  combineDictation,
  gradeQuestions,
  listeningCorrectness,
  parseQuestions,
  publicQuestions,
  scoreDictation,
} from "../_shared/english-listening.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/listening-content";

/** How many sentences the learner writes down in one activity. */
const DICTATION_SENTENCES = 2;

const ITEM_COLUMNS =
  "id, slug, title, summary, transcript_text, level, category, accent, speed_label, speed_wpm, duration_seconds, audio_url, focus_skill, tags, status, sort_order, metadata, questions";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = value === null || value === undefined || value === "" ? null : toNumber(value);
  return parsed === null ? fallback : Math.max(min, Math.min(max, Math.round(parsed)));
};

/** Same formula as the registry seed: listening time plus about four minutes of tasks. */
const estimatedMinutesOf = (item: JsonRecord): number =>
  Math.max(1, Math.min(30, Math.ceil(Number(item.duration_seconds ?? 60) / 60) + 4));

/** Item as sent to the browser: question keys and explanations stay on the server. */
const publicItem = (item: JsonRecord): JsonRecord => {
  const { questions, ...rest } = item;
  return { ...rest, questions: publicQuestions(parseQuestions(questions)), estimated_minutes: estimatedMinutesOf(item) };
};

const listItems = async (sb: any, productId: string, languageId: string, url: URL): Promise<Response> => {
  const level = toText(url.searchParams.get("level"), 8).toUpperCase();
  const limit = clampInt(url.searchParams.get("limit"), 1, 60, 40);

  let query = sb
    .from("listening_items")
    .select(ITEM_COLUMNS)
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(limit);
  if (level) query = query.eq("level", level);

  const { data, error } = await query;
  if (error) return json(500, { error: "Failed to load listening items" });

  return json(200, {
    items: ((data ?? []) as JsonRecord[]).map((row) => {
      const { questions, ...rest } = row;
      return { ...rest, question_count: parseQuestions(questions).length, estimated_minutes: estimatedMinutesOf(row) };
    }),
    scope: { product_id: productId, language_id: languageId },
  });
};

const loadItem = async (sb: any, productId: string, languageId: string, identifier: string): Promise<JsonRecord | null> => {
  let query = sb
    .from("listening_items")
    .select(ITEM_COLUMNS)
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  return data as JsonRecord;
};

type Segment = { segment_index: number; segment_text: string; focus_phrase: string | null };

const loadSegments = async (sb: any, itemId: string): Promise<Segment[]> => {
  const { data } = await sb
    .from("listening_segments")
    .select("segment_index, segment_text, focus_phrase")
    .eq("listening_item_id", itemId)
    .order("segment_index", { ascending: true });
  return ((data ?? []) as JsonRecord[])
    .map((row) => ({
      segment_index: Number(row.segment_index ?? 0),
      segment_text: toText(row.segment_text, 1000),
      focus_phrase: toText(row.focus_phrase, 200) || null,
    }))
    .filter((row) => row.segment_text);
};

/** The sentences the learner writes down: segments marked with a focus phrase, in order. */
const dictationTargets = (segments: Segment[]): Segment[] =>
  segments.filter((segment) => segment.focus_phrase).slice(0, DICTATION_SENTENCES);

// Offline answers synced later carry a client attempt id and are recorded once.
serve(dedupeSubmits({
  serviceKey: "listening",
  routeMarker: routeMarker,
  isSubmitRoute: (route) => isSubmitPath(route, "items"),
  client: () => createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } }),
}, async (req) => {
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
    if (!productId) return json(500, { error: "Listening is not available right now" });

    if (req.method === "GET" && (route === "" || route === "/" || route === "/items")) {
      return await listItems(sb, productId, scope.languageId, url);
    }

    // One activity: the script (read aloud by the browser), questions without
    // answer keys, and the sentences used for dictation.
    if (req.method === "GET" && route.startsWith("/items/")) {
      const identifier = decodeURIComponent(route.slice("/items/".length)).trim();
      const item = identifier ? await loadItem(sb, productId, scope.languageId, identifier) : null;
      if (!item) return json(404, { error: "Listening item not found" });
      const segments = await loadSegments(sb, String(item.id));
      return json(200, {
        item: publicItem(item),
        segments,
        dictation: dictationTargets(segments),
      });
    }

    // Submit a whole activity once: questions + dictation, recorded as ONE
    // attempt on the item's registry entry so it shows as done everywhere.
    if (req.method === "POST" && route.startsWith("/items/") && route.endsWith("/submit")) {
      // Paid skills, or today's free activity.
      const blocked = await guardActivity(sb, auth.userId, scope.languageId, "listening", route);
      if (blocked) return blocked;
      const identifier = decodeURIComponent(route.slice("/items/".length, -"/submit".length)).trim();
      const item = identifier ? await loadItem(sb, productId, scope.languageId, identifier) : null;
      if (!item) return json(404, { error: "Listening item not found" });

      const questions = parseQuestions(item.questions);
      const targets = dictationTargets(await loadSegments(sb, String(item.id)));
      // Reading mode = the browser could not play audio and the learner read the text.
      // Questions are checked, but nothing is recorded as listening practice.
      const mode = body.mode === "reading" ? "reading" : "listening";
      const usedTargets = mode === "reading" ? [] : targets;
      if (!questions.length && !usedTargets.length) return json(422, { error: "This activity has nothing to check yet" });

      const answersIn = (Array.isArray(body.answers) ? body.answers : []).slice(0, 50) as Array<JsonRecord>;
      const graded = gradeQuestions(questions, answersIn);

      const typedBySegment = new Map<number, string>();
      for (const entry of (Array.isArray(body.dictation) ? body.dictation : []).slice(0, 20) as Array<JsonRecord>) {
        const index = toNumber(entry?.segment_index);
        if (index !== null && !typedBySegment.has(index)) typedBySegment.set(index, toText(entry?.text, 1000));
      }
      const scored = usedTargets.map((target) => {
        const typed = typedBySegment.get(target.segment_index) ?? "";
        return { target, typed, result: scoreDictation(target.segment_text, typed) };
      });
      const dictationAccuracy = combineDictation(scored.map((entry) => entry.result));
      const dictationResults = scored.map(({ target, typed, result }) => ({
        segment_index: target.segment_index,
        text: target.segment_text,
        focus_phrase: target.focus_phrase,
        typed,
        ...result,
        accuracy: Math.round(result.accuracy * 100),
      }));
      const correctnessRatio = listeningCorrectness({
        questionCorrect: graded.correct,
        questionTotal: graded.total,
        dictationAccuracy,
      });

      const reviewSeen = new Set<string>();
      const reviewWords: Array<{ word: string; context: string }> = [];
      for (const result of dictationResults) {
        for (const word of result.review_words) {
          const key = word.toLowerCase();
          if (reviewSeen.has(key)) continue;
          reviewSeen.add(key);
          reviewWords.push({ word, context: result.text });
        }
      }

      const plays = clampInt(body.plays, 0, 50, 0);
      const timeSpentSeconds = clampInt(body.time_spent_seconds, 1, 7200, 0) || null;
      const transcript = toText(item.transcript_text, 8000);

      let attemptId: string | null = null;
      if (mode === "listening") {
        const contentItem = await resolveOrCreateContentItem(sb, {
          productId,
          languageId: scope.languageId,
          serviceKey: "listening",
          contentType: "listening.item",
          sourceRef: toText(item.slug, 160),
          title: toText(item.title, 220),
          description: toText(item.summary, 900),
          skillKey: "listening",
          subskillKeys: ["listening.word_recognition", "listening.detail_recall", "vocabulary.recall"],
          cefrLevel: toText(item.level, 8),
          estimatedMinutes: estimatedMinutesOf(item),
          learningObjective: toText(item.summary, 900),
          tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry)) : [],
          payloadJson: {
            accent: toText(item.accent, 80),
            speed_label: toText(item.speed_label, 40),
            speed_wpm: Number(item.speed_wpm ?? 130),
            duration_seconds: Number(item.duration_seconds ?? 20),
          },
        });

        const issues: JsonRecord[] = [];
        if (graded.total && graded.correct < graded.total) {
          issues.push({
            category: "listening",
            subskill_key: "listening.detail_recall",
            location_ref: toText(item.slug, 120),
            explanation: `${graded.total - graded.correct} of ${graded.total} questions were answered incorrectly.`,
            correction_hint: "Listen again with the questions in front of you and note the key words.",
            severity: graded.correct / graded.total < 0.5 ? 0.76 : 0.48,
          });
        }
        if (dictationAccuracy !== null && dictationAccuracy < 0.8) {
          issues.push({
            category: "listening",
            subskill_key: "listening.word_recognition",
            location_ref: "dictation",
            explanation: reviewWords.length
              ? `Missed words in dictation: ${reviewWords.slice(0, 4).map((entry) => entry.word).join(", ")}.`
              : "Some words in the dictation sentences were missed.",
            correction_hint: "Play the sentence slowly, write it in short chunks, then check small words.",
            severity: dictationAccuracy < 0.5 ? 0.74 : 0.5,
          });
        }

        const score = calculateAttemptScore({
          correctnessRatio,
          estimatedMinutes: Number(contentItem.estimated_minutes ?? estimatedMinutesOf(item)),
          timeSpentSeconds,
          hintUsageCount: 0,
          retryCount: 0,
          correctionQualityRatio: correctnessRatio,
        });
        const feedback = buildFeedbackPayload({
          serviceKey: "listening",
          score: score.overallScore,
          title: toText(item.title, 220),
          reason: toText(item.summary, 900),
          issues,
        });
        const recorded = await recordEvaluatedAttempt(sb, {
          userId: auth.userId,
          languageId: scope.languageId,
          productId,
          serviceKey: "listening",
          contentItem,
          attemptType: "listening.item",
          responseJson: {
            listening_item_id: String(item.id),
            answers: graded.results.map((result) => ({ question_id: result.question_id, option_index: result.chosen_index, correct: result.correct })),
            dictation: dictationResults.map((result) => ({ segment_index: result.segment_index, typed: result.typed, accuracy: result.accuracy })),
            missed_words: reviewWords.map((entry) => entry.word),
          },
          metadata: {
            listening_item_id: String(item.id),
            slug: toText(item.slug, 160),
            plays,
            questions_correct: graded.correct,
            questions_total: graded.total,
            dictation_accuracy: dictationAccuracy,
          },
          timeSpentSeconds,
          score,
          feedback,
          products,
        });
        attemptId = String(recorded.attempt?.id ?? "") || null;

        // Missed questions and dictation sentences come back on the Review page.
        const questionById = new Map(questions.map((question) => [question.id, question]));
        const title = toText(item.title, 220);
        const slug = toText(item.slug, 160);
        await queueReviewItems(sb, {
          userId: auth.userId,
          languageId: scope.languageId,
          attemptId,
          items: [
            ...graded.results.filter((result) => !result.correct).flatMap((result) => {
              const question = questionById.get(result.question_id);
              if (!question) return [];
              return [{
                kind: "listening" as const,
                item_key: `listening:${slug}:${question.id}`,
                payload: {
                  type: "choice" as const,
                  prompt: question.prompt,
                  options: question.options,
                  answer_index: question.answer_index,
                  explanation: question.explanation,
                  source_title: title,
                  source_slug: slug,
                },
              }];
            }),
            ...dictationResults.filter((result) => result.accuracy < 90).map((result) => ({
              kind: "listening" as const,
              item_key: `listening:${slug}:dictation:${result.segment_index}`,
              payload: { type: "dictation" as const, sentence: result.text, source_title: title, source_slug: slug },
            })),
          ],
        });
      }

      return json(200, {
        ok: true,
        mode,
        recorded: attemptId !== null,
        attempt_id: attemptId,
        score: Math.round(correctnessRatio * 100),
        questions: graded,
        dictation: {
          score: dictationAccuracy === null ? null : Math.round(dictationAccuracy * 100),
          results: dictationResults,
        },
        review_words: reviewWords,
        transcript,
        plays,
      });
    }

    // Older single-clip dictation (whole script typed at once). Kept for old clients.
    if (req.method === "POST" && route === "/practice/submit") {
      // Paid skills, or today's free activity.
      const blocked = await guardActivity(sb, auth.userId, scope.languageId, "listening", route);
      if (blocked) return blocked;
      const identifier = toText(body.item_id ?? body.slug ?? body.source_ref, 120);
      const responseText = toText(body.response_text, 6000);
      if (!identifier || !responseText) return json(422, { error: "item_id (or slug) and response_text are required" });

      const item = await loadItem(sb, productId, scope.languageId, identifier);
      if (!item) return json(404, { error: "Listening item not found" });

      const transcript = toText(item.transcript_text, 8000);
      const result = scoreDictation(transcript, responseText);
      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "listening",
        contentType: "listening.dictation",
        sourceRef: toText(item.slug, 160) || String(item.id),
        title: toText(item.title, 220),
        description: toText(item.summary, 900),
        skillKey: "listening",
        subskillKeys: ["listening.word_recognition", "listening.detail_recall", "vocabulary.recall"],
        cefrLevel: toText(item.level, 8),
        estimatedMinutes: estimatedMinutesOf(item),
        learningObjective: toText(item.summary, 900),
        tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry)) : [],
      });
      const score = calculateAttemptScore({
        correctnessRatio: result.accuracy,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 6),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        correctionQualityRatio: result.accuracy,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "listening",
        score: score.overallScore,
        title: toText(item.title, 220),
        reason: toText(item.summary, 900),
        issues: result.accuracy < 0.8
          ? [{
              category: "listening",
              subskill_key: "listening.word_recognition",
              location_ref: "whole-clip",
              explanation: "Some words in the clip were missed.",
              correction_hint: "Replay one sentence at a time and check small words.",
              severity: result.accuracy < 0.5 ? 0.74 : 0.5,
            }]
          : [],
      });
      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "listening",
        contentItem,
        attemptType: "listening.dictation",
        responseJson: { listening_item_id: String(item.id), response_text: responseText, review_words: result.review_words },
        metadata: { listening_item_id: String(item.id) },
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });
      const missing = result.tokens.filter((token) => token.kind !== "ok" && token.kind !== "extra").map((token) => token.text);
      const extra = result.tokens.filter((token) => token.kind === "extra").map((token) => token.text);
      return json(200, {
        ok: true,
        attempt: recorded.attempt,
        scoring: { correctness_ratio: score.correctnessRatio, overall_score: score.overallScore },
        evaluation: { missing_words: missing, extra_words: extra, expected_transcript: transcript, tokens: result.tokens },
        notebook_words: result.review_words.map((word) => ({
          word,
          context_text: transcript.slice(0, 220),
          source_type: "english.listening.dictation",
          source_label: "English Listening",
        })),
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("listening-content", error);
    return json(500, { error: "Something went wrong. Please try again." });
  }
}));
