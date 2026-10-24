// Story of the day (rules in _shared/english-daily-story.ts).
//
//   GET  /daily-story[?level=B1]   today's story at the learner's reading level (or the level asked)
//   GET  /daily-story/archive      the last 30 days at that level, with what the learner read
//   GET  /daily-story/:id          one story
//   POST /daily-story/answer       { story_id, answers, reading_seconds } → checked answers, speed
//
// Free for every signed-in learner (a daily reason to open the app), so no
// activity allowance and no AI credit: the story is written once per level
// per day for everyone, and only the first request of the day pays for it.
// When the owner pauses Reading, the story pauses with it.

import { callEnglishAIWithStatus, englishAIAvailable } from "../_shared/english-ai.ts";
import {
  isStoryLevel,
  leaseUntil,
  libraryStoryFor,
  lockDecision,
  parseStoryOutput,
  type StoryContent,
  storyDate,
  type StoryLevel,
  storyPrompt,
  type StoryRow,
} from "../_shared/english-daily-story.ts";
import { json, parseBody } from "../_shared/english-learning.ts";
import { perSkillLevels } from "../_shared/english-levels.ts";
import { normalizeQuestions, publicQuestions, scoreReadingAnswers } from "../_shared/english-reading.ts";
import { paceFor, readingWpm, savedWordsInText } from "../_shared/english-reading-depth.ts";
import { isServicePaused, loadEnglishSettings, servicePausedBody } from "../_shared/english-settings.ts";
import { loadSavedWords, recordEncounters } from "../_shared/english-word-store.ts";

type Row = Record<string, unknown>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string };

const COLUMNS = "id, level, story_date, status, source, source_ref, title, body, questions, word_count, locked_until, attempts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asRecord = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? value as Row : {});

/** The learner's reading level: their placement for reading, else their overall level, else A2. */
const learnerLevel = async (ctx: Ctx): Promise<StoryLevel> => {
  const { data } = await ctx.sb
    .from("learner_language_goals")
    .select("current_cefr_estimate, metadata")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  const reading = perSkillLevels(asRecord(asRecord(data).metadata).placement).reading;
  if (isStoryLevel(reading)) return reading;
  const overall = asRecord(data).current_cefr_estimate;
  return isStoryLevel(overall) ? overall : "A2";
};

const requestedLevel = async (ctx: Ctx): Promise<StoryLevel> => {
  const asked = String(ctx.url.searchParams.get("level") ?? "").toUpperCase();
  return isStoryLevel(asked) ? asked : await learnerLevel(ctx);
};

const loadRow = async (sb: any, languageId: string, level: StoryLevel, date: string): Promise<Row | null> => {
  const { data } = await sb
    .from("english_daily_stories")
    .select(COLUMNS)
    .eq("language_id", languageId)
    .eq("level", level)
    .eq("story_date", date)
    .maybeSingle();
  return data?.id ? data as Row : null;
};

const saveContent = async (sb: any, id: string, content: StoryContent, source: "ai" | "library", sourceRef: string | null, error: string | null) => {
  const { data } = await sb
    .from("english_daily_stories")
    .update({
      status: "ready",
      source,
      source_ref: sourceRef,
      title: content.title,
      body: content.body,
      questions: content.questions,
      word_count: content.word_count,
      locked_until: null,
      error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  return data as Row | null;
};

/** Today's library text for this level, when AI cannot write one. */
const writeFromLibrary = async (sb: any, row: Row, languageId: string, level: StoryLevel, date: string, reason: string | null): Promise<Row | null> => {
  const { data } = await sb
    .from("reading_articles")
    .select("slug, title, level, content_markdown, questions")
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(400);
  const story = libraryStoryFor((data ?? []) as Array<{ slug: string; title: string; level: string; content_markdown: string | null; questions: unknown }>, level, date);
  if (!story) {
    await sb.from("english_daily_stories").update({ status: "failed", locked_until: null, error: reason ?? "no_library_text" }).eq("id", String(row.id));
    return null;
  }
  return await saveContent(sb, String(row.id), story, "library", story.slug, reason);
};

/** The request holding the lease writes the story: AI first, the library if AI is off or fails. */
const writeStory = async (sb: any, row: Row, languageId: string, level: StoryLevel, date: string): Promise<Row | null> => {
  let reason: string | null = "ai_unavailable";
  if (await englishAIAvailable("daily-story")) {
    const prompt = storyPrompt(level, date);
    // Shared by every learner at this level, so it is not charged to anyone (userId null).
    const result = await callEnglishAIWithStatus<unknown>({ ...prompt, temperature: 0.8, feature: "daily-story", userId: null }, null);
    const content = result.status === "ok" ? parseStoryOutput(result.data, level) : null;
    if (content) return await saveContent(sb, String(row.id), content, "ai", null, null);
    reason = result.status === "ok" ? "invalid_ai_output" : `ai_${result.status}`;
  }
  return await writeFromLibrary(sb, row, languageId, level, date, reason);
};

/** Today's row for the level, written now if this request gets the lease. */
const ensureStory = async (sb: any, languageId: string, level: StoryLevel, date: string): Promise<{ row: Row | null; status: "ready" | "generating" | "failed" }> => {
  let row = await loadRow(sb, languageId, level, date);
  if (!row) {
    const { data: inserted } = await sb
      .from("english_daily_stories")
      .insert({ language_id: languageId, level, story_date: date, status: "generating", locked_until: leaseUntil(), attempts: 1 })
      .select(COLUMNS)
      .maybeSingle();
    if (inserted?.id) {
      const written = await writeStory(sb, inserted as Row, languageId, level, date);
      return { row: written, status: written ? "ready" : "failed" };
    }
    // Someone else inserted it first.
    row = await loadRow(sb, languageId, level, date);
    if (!row) return { row: null, status: "failed" };
  }
  const decision = lockDecision({
    status: row.status as StoryRow["status"],
    locked_until: row.locked_until ? String(row.locked_until) : null,
    attempts: Number(row.attempts ?? 0),
  });
  if (decision === "serve") return { row, status: "ready" };
  if (decision === "wait") return { row: null, status: "generating" };
  if (decision === "fallback") {
    const written = await writeFromLibrary(sb, row, languageId, level, date, "too_many_attempts");
    return { row: written, status: written ? "ready" : "failed" };
  }
  // Take over a lease that ran out: only one request can win this update.
  const now = new Date().toISOString();
  const { data: claimed } = await sb
    .from("english_daily_stories")
    .update({ status: "generating", locked_until: leaseUntil(), attempts: Number(row.attempts ?? 0) + 1, updated_at: now })
    .eq("id", String(row.id))
    .neq("status", "ready")
    .or(`locked_until.is.null,locked_until.lt."${now}"`)
    .select(COLUMNS)
    .maybeSingle();
  if (!claimed?.id) {
    const latest = await loadRow(sb, languageId, level, date);
    return latest?.status === "ready" ? { row: latest, status: "ready" } : { row: null, status: "generating" };
  }
  const written = await writeStory(sb, claimed as Row, languageId, level, date);
  return { row: written, status: written ? "ready" : "failed" };
};

const readsFor = async (sb: any, userId: string, ids: string[]): Promise<Map<string, Row>> => {
  if (!ids.length) return new Map();
  const { data } = await sb
    .from("english_daily_story_reads")
    .select("story_id, correct, total, wpm, updated_at")
    .eq("user_id", userId)
    .in("story_id", ids);
  return new Map(((data ?? []) as Row[]).map((row) => [String(row.story_id), row]));
};

const readView = (read: Row | undefined) =>
  read ? { correct: Number(read.correct ?? 0), total: Number(read.total ?? 0), wpm: read.wpm === null || read.wpm === undefined ? null : Number(read.wpm) } : null;

/** A story as the learner sees it: no answer key; their saved words in it; whether they read it. */
const storyView = async (ctx: Ctx, row: Row, withSavedWords: boolean) => {
  const reads = await readsFor(ctx.sb, ctx.userId, [String(row.id)]);
  const body = String(row.body ?? "");
  let savedWords: Array<{ word: string; forms: string[] }> = [];
  if (withSavedWords) {
    try {
      savedWords = savedWordsInText(body, await loadSavedWords(ctx.sb, ctx.userId, ctx.languageId)).map((match) => ({ word: match.word, forms: match.forms }));
    } catch {
      savedWords = [];
    }
  }
  return {
    id: String(row.id),
    date: String(row.story_date),
    level: String(row.level),
    title: String(row.title ?? ""),
    body,
    word_count: Number(row.word_count ?? 0),
    source: String(row.source ?? "ai"),
    source_ref: row.source_ref ? String(row.source_ref) : null,
    questions: publicQuestions(normalizeQuestions(row.questions)),
    read: readView(reads.get(String(row.id))),
    saved_words: savedWords,
  };
};

export const handleDailyStoryRoute = async (ctx: Ctx): Promise<Response | null> => {
  const { route, req } = ctx;
  if (route !== "/daily-story" && !route.startsWith("/daily-story/")) return null;

  if (isServicePaused(await loadEnglishSettings(ctx.sb), "reading")) return json(503, servicePausedBody("reading"));

  if (req.method === "GET" && route === "/daily-story") {
    const level = await requestedLevel(ctx);
    const date = storyDate();
    const { row, status } = await ensureStory(ctx.sb, ctx.languageId, level, date);
    if (!row) return json(200, { status, level, date, story: null, retry_after_seconds: status === "generating" ? 4 : null });
    return json(200, { status: "ready", level, date, story: await storyView(ctx, row, true) });
  }

  if (req.method === "GET" && route === "/daily-story/archive") {
    const level = await requestedLevel(ctx);
    const { data, error } = await ctx.sb
      .from("english_daily_stories")
      .select("id, level, story_date, title, word_count, source")
      .eq("language_id", ctx.languageId)
      .eq("level", level)
      .eq("status", "ready")
      .lte("story_date", storyDate())
      .order("story_date", { ascending: false })
      .limit(30);
    if (error) return json(500, { error: "Could not load the stories" });
    const rows = (data ?? []) as Row[];
    const reads = await readsFor(ctx.sb, ctx.userId, rows.map((row) => String(row.id)));
    return json(200, {
      level,
      stories: rows.map((row) => ({
        id: String(row.id),
        date: String(row.story_date),
        level: String(row.level),
        title: String(row.title ?? ""),
        word_count: Number(row.word_count ?? 0),
        source: String(row.source ?? "ai"),
        read: readView(reads.get(String(row.id))),
      })),
    });
  }

  const single = /^\/daily-story\/([^/]+)$/.exec(route);
  if (req.method === "GET" && single && UUID.test(single[1]!)) {
    const { data } = await ctx.sb
      .from("english_daily_stories")
      .select(COLUMNS)
      .eq("id", single[1]!)
      .eq("language_id", ctx.languageId)
      .eq("status", "ready")
      .maybeSingle();
    if (!data?.id) return json(404, { error: "Story not found" });
    return json(200, { status: "ready", story: await storyView(ctx, data as Row, true) });
  }

  if (req.method === "POST" && route === "/daily-story/answer") {
    const body = await parseBody(req) as Row;
    const storyId = String(body.story_id ?? "");
    if (!UUID.test(storyId)) return json(422, { error: "story_id is required" });
    const { data } = await ctx.sb
      .from("english_daily_stories")
      .select(COLUMNS)
      .eq("id", storyId)
      .eq("language_id", ctx.languageId)
      .eq("status", "ready")
      .maybeSingle();
    if (!data?.id) return json(404, { error: "Story not found" });
    const row = data as Row;
    const questions = normalizeQuestions(row.questions);
    const checked = scoreReadingAnswers(questions, body.answers);
    const seconds = Number(body.reading_seconds);
    const readingSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.min(4 * 3600, Math.round(seconds)) : null;
    const wpm = readingWpm(Number(row.word_count ?? 0), readingSeconds);
    const { error } = await ctx.sb
      .from("english_daily_story_reads")
      .upsert({
        user_id: ctx.userId,
        story_id: storyId,
        correct: checked.correct,
        total: checked.total,
        reading_seconds: readingSeconds,
        wpm,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,story_id" });
    if (error) console.error(JSON.stringify({ event: "english_daily_story_read_failed", message: error.message }));
    // Saved words met in the story keep this sentence as an example.
    try {
      const saved = await loadSavedWords(ctx.sb, ctx.userId, ctx.languageId);
      if (saved.length) await recordEncounters(ctx.sb, ctx.userId, saved, savedWordsInText(String(row.body ?? ""), saved), String(row.title ?? "Story of the day"));
    } catch {
      // examples are a nice-to-have
    }
    return json(200, {
      ok: true,
      score: checked.score,
      correct: checked.correct,
      total: checked.total,
      results: checked.results,
      reading: { words: Number(row.word_count ?? 0), seconds: readingSeconds, wpm, pace: paceFor(row.level, wpm) },
    });
  }

  return json(404, { error: "Not found" });
};
