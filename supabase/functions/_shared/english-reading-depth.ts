// Reading beyond the questions: speed in words per minute over time, the
// learner's saved words found in a text, and what to read next.
//
// Pure (imports only other pure modules), shared by reading-articles, the
// daily story and the English app.

import { wordForms } from "./english-words.ts";

export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR)[number];
const isCefr = (value: unknown): value is Cefr => (CEFR as readonly string[]).includes(String(value));

/** Words in a markdown text (headings, emphasis and list marks are not words). */
export const wordCount = (markdown: string): number =>
  String(markdown ?? "")
    .replace(/[#>*_`~[\]()|-]+/g, " ")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

/** Below this a timing is a skim or a stopped clock; above, the learner left the tab open. */
export const MIN_WPM = 30;
export const MAX_WPM = 700;
const MIN_SECONDS = 15;

/** Words per minute for one reading, or null when the timing is not believable. */
export const readingWpm = (words: number, seconds: number | null | undefined): number | null => {
  if (!Number.isFinite(words) || words < 30 || !seconds || !Number.isFinite(seconds) || seconds < MIN_SECONDS) return null;
  const wpm = words / (seconds / 60);
  return wpm >= MIN_WPM && wpm <= MAX_WPM ? Math.round(wpm) : null;
};

/**
 * A comfortable silent-reading pace for a second-language reader at each
 * level, for study texts (not skimming). Rough, but enough to say "slower
 * than usual for B1" without pretending to be a test.
 */
export const TYPICAL_WPM: Record<Cefr, { low: number; high: number }> = {
  A1: { low: 50, high: 90 },
  A2: { low: 70, high: 110 },
  B1: { low: 90, high: 140 },
  B2: { low: 120, high: 170 },
  C1: { low: 150, high: 210 },
  C2: { low: 180, high: 250 },
};

export type SpeedPoint = { at: string; wpm: number; level: string | null; accuracy: number | null; title?: string | null };

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
};

export type SpeedSummary = {
  points: SpeedPoint[];
  latest: number | null;
  /** Median of the last five readings. */
  recent: number | null;
  /** Median of the five before them; null until there are six readings. */
  previous: number | null;
  /** Percent change from previous to recent, rounded. */
  change: number | null;
  /** Words per minute times accuracy over the recent readings: speed that counts only what was understood. */
  effective: number | null;
};

/** Oldest first; only believable timings. */
export const speedSummary = (raw: SpeedPoint[], limit = 30): SpeedSummary => {
  const points = raw
    .filter((point) => Number.isFinite(point.wpm) && point.wpm >= MIN_WPM && point.wpm <= MAX_WPM && Number.isFinite(Date.parse(point.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-limit);
  const wpms = points.map((point) => point.wpm);
  const recentPoints = points.slice(-5);
  const recent = median(recentPoints.map((point) => point.wpm));
  const previous = points.length >= 6 ? median(wpms.slice(-10, -5)) : null;
  const scored = recentPoints.filter((point) => point.accuracy !== null && Number.isFinite(point.accuracy));
  const effective = scored.length
    ? Math.round(scored.reduce((sum, point) => sum + point.wpm * Math.max(0, Math.min(1, point.accuracy!)), 0) / scored.length)
    : null;
  return {
    points,
    latest: points.at(-1)?.wpm ?? null,
    recent,
    previous,
    change: recent !== null && previous ? Math.round(((recent - previous) / previous) * 100) : null,
    effective,
  };
};

export type PaceVerdict = "slow" | "typical" | "fast" | null;

export const paceFor = (level: unknown, wpm: number | null): PaceVerdict => {
  if (!isCefr(level) || wpm === null) return null;
  const band = TYPICAL_WPM[level];
  return wpm < band.low ? "slow" : wpm > band.high ? "fast" : "typical";
};

export type RereadAction = "reread" | "easier" | "same" | "harder";
export type RereadAdvice = { action: RereadAction; level: Cefr | null; pace: PaceVerdict };

const shift = (level: Cefr, by: number): Cefr => CEFR[Math.max(0, Math.min(CEFR.length - 1, CEFR.indexOf(level) + by))]!;

/**
 * What to read next, from how much was understood and how fast:
 *  - under 50%: the text was too hard; re-read it now with the answers, then an easier text;
 *  - 50-69%: re-read the paragraphs behind the missed questions, then stay at this level;
 *  - 85%+ at a typical or fast pace (or 100%): ready for the next level up;
 *  - otherwise another text at the same level.
 * A text with no questions (score null) is judged by pace alone.
 */
export const rereadAdvice = (input: { level: unknown; score: number | null; wpm: number | null }): RereadAdvice => {
  const level = isCefr(input.level) ? input.level : null;
  const pace = paceFor(level, input.wpm);
  if (!level) return { action: "same", level: null, pace };
  if (input.score === null) {
    return pace === "fast" ? { action: "harder", level: shift(level, 1), pace } : pace === "slow" ? { action: "easier", level: shift(level, -1), pace } : { action: "same", level, pace };
  }
  if (input.score < 50) return { action: "reread", level: level === "A1" ? level : shift(level, -1), pace };
  if (input.score < 70) return { action: "reread", level, pace };
  if (input.score >= 100 || (input.score >= 85 && pace !== "slow")) {
    return level === "C2" ? { action: "same", level, pace } : { action: "harder", level: shift(level, 1), pace };
  }
  return { action: "same", level, pace };
};

// ---------------------------------------------------------------------------
// Saved words in a text
// ---------------------------------------------------------------------------

export type SavedWordEntry = { id: string; word: string };
export type SavedWordMatch = { id: string; word: string; forms: string[]; sentence: string };

const WORD = /[\p{L}]+(?:['’-][\p{L}]+)*/gu;

/** Sentences of a plain text (markdown marks removed). */
export const sentencesOf = (markdown: string): string[] =>
  String(markdown ?? "")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>]+/g, "")
    .split(/\n{2,}|(?<=[.!?…])["”’)]*\s+(?=["“‘(]?[A-Z0-9])/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 0);

/**
 * Which of the learner's saved words appear in the text, in which surface
 * forms ("decided" for "decide"; none for phrases), with the first sentence
 * each appears in.
 * Single words and two- or three-word phrases; longer entries are skipped.
 */
export const savedWordsInText = (markdown: string, entries: SavedWordEntry[], limit = 80): SavedWordMatch[] => {
  const sentences = sentencesOf(markdown);
  const lowerSentences = sentences.map((sentence) => sentence.toLowerCase().replace(/’/g, "'"));
  const tokens = new Set<string>();
  for (const sentence of lowerSentences) for (const match of sentence.matchAll(WORD)) tokens.add(match[0]);
  const out: SavedWordMatch[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const parts = entry.word.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!parts.length || parts.length > 3 || seen.has(parts.join(" "))) continue;
    if (parts.length === 1) {
      const forms = wordForms(parts[0]!).filter((form) => tokens.has(form));
      if (!forms.length) continue;
      const index = lowerSentences.findIndex((sentence) => [...sentence.matchAll(WORD)].some((match) => forms.includes(match[0])));
      seen.add(parts[0]!);
      out.push({ id: entry.id, word: entry.word, forms, sentence: sentences[Math.max(0, index)] ?? "" });
    } else {
      const pattern = new RegExp(`(?<![\\p{L}'])${parts.map((part) => `(?:${wordForms(part).map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).join("\\s+")}(?![\\p{L}'])`, "iu");
      const index = lowerSentences.findIndex((sentence) => pattern.test(sentence));
      if (index < 0) continue;
      seen.add(parts.join(" "));
      // Phrases are not highlighted word by word (that would mark "rush" anywhere); their sentence is kept.
      out.push({ id: entry.id, word: entry.word, forms: [], sentence: sentences[index] ?? "" });
    }
    if (out.length >= limit) break;
  }
  return out;
};
