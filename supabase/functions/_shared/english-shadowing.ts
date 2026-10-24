// Shadowing: hear a model sentence, say it at the same time or straight after,
// compare. Everything that judges the learner's voice runs in the browser
// (speech recognition, the recording, the waveform); the audio never leaves
// the device. The server only
//   * serves sentence sets by level, cut from published listening scripts and
//     reading articles, and
//   * records a short, capped "shadowing" speaking attempt so streaks and XP
//     see the practice.
// Pure helpers only; hub/shadowing.ts loads and stores rows.

import { CEFR_ORDER, type Cefr, isCefr } from "./english-today.ts";

export const SHADOWING_CONTENT_TYPE = "speaking.shadowing";
export const SHADOWING_ATTEMPT_TYPE = "speaking.shadowing";
/** One registry item for all shadowing, so XP counts it once a day (its best take). */
export const SHADOWING_SOURCE_REF = "shadowing";
/** Logged attempts per learner day (UTC+5). Takes beyond this still work; they are just not recorded. */
export const SHADOWING_LOGS_PER_DAY = 5;
export const SHADOWING_SOURCES = ["listening", "reading", "roleplay", "tutor", "shadowing", "read-aloud"] as const;
export type ShadowingSource = (typeof SHADOWING_SOURCES)[number];

export const SHADOW_MIN_WORDS = 4;
export const SHADOW_MAX_WORDS = 22;
export const SHADOW_SENTENCES_PER_SET = 5;
export const SHADOW_MAX_SETS = 6;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** Markdown and script labels removed, so only speakable text is left. */
export const speakableText = (source: string): string =>
  source
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        // "Anna: Hello there." → "Hello there."
        .replace(/^\s*[A-Z][A-Za-z .']{0,30}:\s+/, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]+/g, "")
        .trim()
    )
    .filter(Boolean)
    .join("\n");

/**
 * Sentences that suit shadowing: a comfortable length, no lists of numbers or
 * headings, each once. Keeps the source order.
 */
export const shadowSentences = (
  source: string,
  options: { min?: number; max?: number; limit?: number } = {},
): string[] => {
  const min = options.min ?? SHADOW_MIN_WORDS;
  const max = options.max ?? SHADOW_MAX_WORDS;
  const limit = options.limit ?? 40;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of speakableText(source).split("\n")) {
    // A line without end punctuation is usually a heading or a label.
    if (!/[.!?]["'”’)]?$/.test(line)) continue;
    const parts = line.match(/[^.!?]+[.!?]+["'”’)]?/g) ?? [];
    for (const raw of parts) {
      const sentence = raw.replace(/\s+/g, " ").trim();
      const count = wordCount(sentence);
      if (count < min || count > max) continue;
      if (!/^["'“‘(]?[A-Z]/.test(sentence)) continue;
      // Mostly digits or symbols (timetables, prices) are not good speech practice.
      const letters = sentence.replace(/[^A-Za-z]/g, "").length;
      if (letters < sentence.replace(/\s/g, "").length * 0.7) continue;
      const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sentence);
      if (out.length >= limit) return out;
    }
  }
  return out;
};

export type ShadowSourceRow = {
  kind: "listening" | "reading";
  slug: string;
  title: string;
  level: string | null;
  text: string;
};

export type ShadowSet = {
  id: string;
  source: "listening" | "reading";
  slug: string;
  title: string;
  level: Cefr | null;
  sentences: string[];
};

/** Levels to try, nearest first: the level itself, then one below, then one above, and so on. */
export const levelsNear = (level: Cefr): Cefr[] => {
  const index = CEFR_ORDER.indexOf(level);
  const out: Cefr[] = [level];
  for (let step = 1; step < CEFR_ORDER.length; step += 1) {
    const below = CEFR_ORDER[index - step];
    const above = CEFR_ORDER[index + step];
    if (below) out.push(below);
    if (above) out.push(above);
  }
  return out;
};

/** A stable shuffle seed from a string (the learner's day), so a page reload shows the same sets. */
export const seedFrom = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Sentence sets for one level: one set per source text with enough good
 * sentences, at the requested level first and the nearest levels after.
 * Listening and reading alternate so both kinds of English appear.
 */
export const buildShadowSets = (
  rows: ShadowSourceRow[],
  input: { level: Cefr; seed?: number; perSet?: number; maxSets?: number },
): ShadowSet[] => {
  const perSet = input.perSet ?? SHADOW_SENTENCES_PER_SET;
  const maxSets = input.maxSets ?? SHADOW_MAX_SETS;
  const seed = input.seed ?? 0;
  const candidates = rows
    .map((row) => ({ row, sentences: shadowSentences(row.text) }))
    .filter((entry) => entry.sentences.length >= Math.min(3, perSet));
  const out: ShadowSet[] = [];
  for (const level of levelsNear(input.level)) {
    if (out.length >= maxSets) break;
    const atLevel = candidates
      .filter((entry) => (isCefr(entry.row.level) ? entry.row.level : null) === level)
      .sort((a, b) => (seedFrom(`${seed}:${a.row.slug}`) - seedFrom(`${seed}:${b.row.slug}`)));
    const listening = atLevel.filter((entry) => entry.row.kind === "listening");
    const reading = atLevel.filter((entry) => entry.row.kind === "reading");
    const mixed: typeof atLevel = [];
    for (let i = 0; i < Math.max(listening.length, reading.length); i += 1) {
      if (listening[i]) mixed.push(listening[i]!);
      if (reading[i]) mixed.push(reading[i]!);
    }
    for (const entry of mixed) {
      if (out.length >= maxSets) break;
      out.push({
        id: `${entry.row.kind}:${entry.row.slug}`,
        source: entry.row.kind,
        slug: entry.row.slug,
        title: entry.row.title,
        level,
        sentences: entry.sentences.slice(0, perSet),
      });
    }
  }
  return out;
};

export type ShadowLog = {
  /** Words recognised / words in the sentence, 0..100; null when the browser could not check words. */
  score: number | null;
  /** Words in the sentence. */
  words: number;
  /** Seconds the learner spoke. */
  seconds: number;
  source: ShadowingSource;
};

const clampInt = (value: unknown, min: number, max: number): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
};

/** A take worth recording: a real sentence, real speaking time, a plausible score. */
export const parseShadowLog = (body: unknown): ShadowLog | null => {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const words = clampInt(record.words, 0, 400);
  const seconds = clampInt(record.seconds, 0, 600);
  if (words === null || words < 3 || seconds === null || seconds < 1) return null;
  const score = record.score === null || record.score === undefined ? null : clampInt(record.score, 0, 100);
  if (record.score !== null && record.score !== undefined && score === null) return null;
  const source = (SHADOWING_SOURCES as readonly string[]).includes(String(record.source))
    ? record.source as ShadowingSource
    : "shadowing";
  return { score, words, seconds, source };
};

export type ShadowLogDecision = { log: boolean; reason: "ok" | "daily_cap" | "paused"; left: number };

export const decideShadowLog = (input: { loggedToday: number; paused: boolean; perDay?: number }): ShadowLogDecision => {
  const perDay = input.perDay ?? SHADOWING_LOGS_PER_DAY;
  const left = Math.max(0, perDay - input.loggedToday);
  if (input.paused) return { log: false, reason: "paused", left };
  if (left <= 0) return { log: false, reason: "daily_cap", left: 0 };
  return { log: true, reason: "ok", left: left - 1 };
};

/**
 * Accuracy recorded for the attempt. Without a word check the take counts as
 * done (like "finished reading"), never as a perfect score: 0.6.
 */
export const shadowRatio = (log: Pick<ShadowLog, "score">): number =>
  log.score === null ? 0.6 : Math.max(0, Math.min(1, log.score / 100));
