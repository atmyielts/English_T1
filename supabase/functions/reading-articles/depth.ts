// Reading depth for one learner: their saved words in a text, the speed
// history, and the next text to read. Pure rules live in
// _shared/english-reading-depth.ts; this file only loads and saves.

import {
  type Cefr,
  CEFR,
  rereadAdvice,
  type RereadAdvice,
  savedWordsInText,
  type SpeedPoint,
  speedSummary,
} from "../_shared/english-reading-depth.ts";
import { loadSavedWords, recordEncounters } from "../_shared/english-word-store.ts";

type Row = Record<string, unknown>;

const relation = (row: Row, key: string): Row => {
  const value = row[key];
  return ((Array.isArray(value) ? value[0] : value) ?? {}) as Row;
};

/** Saved words that appear in this text, with the forms to highlight. */
export const savedWordsForText = async (sb: any, userId: string, languageId: string, markdown: string) => {
  const rows = await loadSavedWords(sb, userId, languageId);
  return savedWordsInText(markdown, rows).map((match) => ({ word: match.word, forms: match.forms }));
};

/** After a reading: keep the sentence where each saved word was met again. */
export const recordReadingEncounters = async (
  sb: any,
  userId: string,
  languageId: string,
  markdown: string,
  sourceLabel: string,
): Promise<number> => {
  const rows = await loadSavedWords(sb, userId, languageId);
  if (!rows.length) return 0;
  return await recordEncounters(sb, userId, rows, savedWordsInText(markdown, rows), sourceLabel);
};

/** Slugs of reading texts the learner already submitted. */
const readSlugs = async (sb: any, userId: string, languageId: string): Promise<Set<string>> => {
  const { data } = await sb
    .from("learning_attempts")
    .select("learning_content_registry_items!inner(source_ref)")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("service_key", "reading")
    .order("submitted_at", { ascending: false })
    .limit(400);
  return new Set(((data ?? []) as Row[]).map((row) => String(relation(row, "learning_content_registry_items").source_ref ?? "")).filter(Boolean));
};

type ArticleRef = { slug: string; title: string; level: string; read_time_minutes: number };

/** `article`: what to open now (this text again for a re-read); `then`: the text after a re-read. */
export type NextRead = RereadAdvice & { article: ArticleRef | null; then: ArticleRef | null };

/**
 * The advice for this result and a text that fits it: the first unread
 * published text at the advised level (then the nearest level), in library
 * order. For a re-read, this text comes first and that one after it.
 */
export const nextRead = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    productId: string;
    article: { slug: string; title: string; level: string; read_time_minutes: number };
    score: number | null;
    wpm: number | null;
  },
): Promise<NextRead> => {
  const advice = rereadAdvice({ level: input.article.level, score: input.score, wpm: input.wpm });
  const target = advice.level as Cefr | null;
  if (!target) return { ...advice, article: advice.action === "reread" ? input.article : null, then: null };
  const [done, { data }] = await Promise.all([
    readSlugs(sb, input.userId, input.languageId),
    sb.from("reading_articles")
      .select("slug, title, level, read_time_minutes, sort_order")
      .eq("product_id", input.productId)
      .eq("language_id", input.languageId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .limit(400),
  ]);
  const candidates = ((data ?? []) as Row[]).filter((row) => String(row.slug) !== input.article.slug && !done.has(String(row.slug)));
  const distance = (row: Row) => Math.abs(CEFR.indexOf(String(row.level) as Cefr) - CEFR.indexOf(target));
  const pick = candidates
    .filter((row) => CEFR.includes(String(row.level) as Cefr))
    .sort((a, b) => distance(a) - distance(b))[0];
  const picked: ArticleRef | null = pick
    ? { slug: String(pick.slug), title: String(pick.title), level: String(pick.level), read_time_minutes: Number(pick.read_time_minutes ?? 5) }
    : null;
  return advice.action === "reread" ? { ...advice, article: input.article, then: picked } : { ...advice, article: picked, then: null };
};

/** Reading speed over time: library texts and daily stories with a believable timing. */
export const speedHistory = async (sb: any, userId: string, languageId: string) => {
  const points: SpeedPoint[] = [];
  const { data } = await sb
    .from("learning_attempts")
    .select("submitted_at, correctness_ratio, metadata, learning_content_registry_items(cefr_level, title)")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("service_key", "reading")
    .not("metadata->reading_wpm", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(60);
  for (const row of (data ?? []) as Row[]) {
    const meta = (row.metadata ?? {}) as Row;
    const registry = relation(row, "learning_content_registry_items");
    const wpm = Number(meta.reading_wpm);
    if (!Number.isFinite(wpm)) continue;
    const ratio = Number(row.correctness_ratio);
    points.push({
      at: String(row.submitted_at ?? ""),
      wpm,
      level: registry.cefr_level ? String(registry.cefr_level) : null,
      accuracy: meta.no_questions ? null : Number.isFinite(ratio) ? ratio : null,
      title: registry.title ? String(registry.title) : null,
    });
  }
  try {
    const { data: stories, error } = await sb
      .from("english_daily_story_reads")
      .select("created_at, wpm, correct, total, english_daily_stories(level, title)")
      .eq("user_id", userId)
      .not("wpm", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error) {
      for (const row of (stories ?? []) as Row[]) {
        const story = relation(row, "english_daily_stories");
        const total = Number(row.total ?? 0);
        points.push({
          at: String(row.created_at ?? ""),
          wpm: Number(row.wpm),
          level: story.level ? String(story.level) : null,
          accuracy: total > 0 ? Number(row.correct ?? 0) / total : null,
          title: story.title ? String(story.title) : null,
        });
      }
    }
  } catch {
    // the daily story table may not exist yet
  }
  return speedSummary(points);
};
