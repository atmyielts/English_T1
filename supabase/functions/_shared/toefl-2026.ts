// TOEFL iBT 2026 format: scoring, adaptive routing and score reporting.
//
// Pure TypeScript with no imports so the same file runs in Edge Functions
// (Deno) and in the TOEFL simulator frontend (Vite), and is unit tested once.
//
// Sources (ETS, 2026): "TOEFL iBT Test: 2026 Update - Test Blueprint and
// Specifications", "A banded score scale for the TOEFL iBT test" (April 2026,
// Tables 6 and 7) and the "Updated TOEFL iBT Test Overview" (scoring guides).
//
// What is official and what is a Schood estimate:
// - Official (ETS): the 1-6 band scale in 0.5 steps, the band <-> CEFR table,
//   the band <-> legacy 0-30 / 0-120 comparison table, the overall score as the
//   mean of the four section bands rounded to the nearest half band, the 0-5
//   task scales for Writing/Speaking constructed responses, and 1 point per
//   machine-scored item.
// - Schood estimate: ETS converts raw performance to bands with IRT on
//   calibrated forms and does not publish a raw-to-band table. We convert the
//   proportion of available points to a legacy-equivalent 0-30 value, then use
//   the ETS comparison table to read the band. Reading/Listening learners routed
//   to the lower module are capped at the top of band 4.5 (B2), mirroring the
//   lower ceiling of a two-stage adaptive test. Every result built here carries
//   `is_estimated: true` and must never be presented as an official ETS score.

export const TOEFL_2026_FORMAT = "toefl-2026";
export const TOEFL_2026_SCORE_VERSION = "toefl-2026-band-estimate-v1";

export type Toefl2026Section = "reading" | "listening" | "writing" | "speaking";
export const TOEFL_2026_SECTIONS: readonly Toefl2026Section[] = ["reading", "listening", "writing", "speaking"];

export type Toefl2026Task =
  | "complete_the_words"
  | "read_daily_life"
  | "read_academic_passage"
  | "listen_choose_response"
  | "listen_conversation"
  | "listen_announcement"
  | "listen_academic_talk"
  | "build_sentence"
  | "write_email"
  | "write_academic_discussion"
  | "listen_repeat"
  | "take_interview";

export const TOEFL_2026_TASKS: readonly Toefl2026Task[] = [
  "complete_the_words",
  "read_daily_life",
  "read_academic_passage",
  "listen_choose_response",
  "listen_conversation",
  "listen_announcement",
  "listen_academic_talk",
  "build_sentence",
  "write_email",
  "write_academic_discussion",
  "listen_repeat",
  "take_interview",
];

export const TASK_SECTION: Record<Toefl2026Task, Toefl2026Section> = {
  complete_the_words: "reading",
  read_daily_life: "reading",
  read_academic_passage: "reading",
  listen_choose_response: "listening",
  listen_conversation: "listening",
  listen_announcement: "listening",
  listen_academic_talk: "listening",
  build_sentence: "writing",
  write_email: "writing",
  write_academic_discussion: "writing",
  listen_repeat: "speaking",
  take_interview: "speaking",
};

/** Content unit types introduced for the 2026 format. */
export const UNIT_COMPLETE_WORDS = "question_complete_words";
export const UNIT_BUILD_SENTENCE = "question_build_sentence";
export const UNIT_SPEAKING_REPEAT = "question_speaking_repeat";
export const UNIT_SPEAKING_INTERVIEW = "question_speaking_interview";
export const TOEFL_2026_UNIT_TYPES: readonly string[] = [
  UNIT_COMPLETE_WORDS,
  UNIT_BUILD_SENTENCE,
  UNIT_SPEAKING_REPEAT,
  UNIT_SPEAKING_INTERVIEW,
];
export const isToefl2026UnitType = (type: string): boolean => TOEFL_2026_UNIT_TYPES.includes(type);

/** Writing task types stored on `question_text` units. */
export const TASK_TYPE_EMAIL = "toefl_email";
export const TASK_TYPE_DISCUSSION = "toefl_academic_discussion";

/**
 * Timing and item counts from the ETS 2026 blueprint (blueprint table and the
 * test overview). Router + one second-stage module per adaptive section.
 */
export const TOEFL_2026_TIMING = {
  reading: { router_seconds: 21 * 60, lower_seconds: 9 * 60, upper_seconds: 9 * 60, items: 50 },
  listening: { router_seconds: 18 * 60, lower_seconds: 7 * 60, upper_seconds: 11 * 60, items: 47 },
  writing: { seconds: 23 * 60, build_sentence_seconds: 6 * 60, email_seconds: 7 * 60, discussion_seconds: 10 * 60, items: 12 },
  speaking: { seconds: 8 * 60, repeat_items: 7, interview_items: 4, interview_response_seconds: 45, items: 11 },
} as const;

/**
 * Router threshold (transparent, documented): a learner whose router accuracy
 * is at least 60% of available router points takes the upper module; anyone
 * below takes the lower module.
 */
export const ROUTER_THRESHOLD = 0.6;
export type ModuleTier = "lower" | "upper";
/** exam-state stores tiers as `standard` (lower) and `advanced` (upper). */
export const tierFromExamState = (value: unknown): ModuleTier | null => {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "advanced" || v === "upper") return "upper";
  if (v === "standard" || v === "lower") return "lower";
  return null;
};
export const routeModule = (raw: number, max: number, threshold = ROUTER_THRESHOLD): ModuleTier =>
  max > 0 && raw / max >= threshold - 1e-9 ? "upper" : "lower";

// ---------------------------------------------------------------------------
// ETS score scale tables (scale.txt, Table 6 and Table 7)

export type LegacyRange = { min: number; max: number };
export const BANDS: readonly number[] = [6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];

/** Table 6: band -> legacy 0-30 section range, per section. */
export const LEGACY_SECTION_RANGES: Record<Toefl2026Section, Record<string, LegacyRange>> = {
  reading: {
    "6": { min: 29, max: 30 }, "5.5": { min: 27, max: 28 }, "5": { min: 24, max: 26 }, "4.5": { min: 22, max: 23 },
    "4": { min: 18, max: 21 }, "3.5": { min: 12, max: 17 }, "3": { min: 6, max: 11 }, "2.5": { min: 4, max: 5 },
    "2": { min: 3, max: 3 }, "1.5": { min: 2, max: 2 }, "1": { min: 0, max: 1 },
  },
  listening: {
    "6": { min: 28, max: 30 }, "5.5": { min: 26, max: 27 }, "5": { min: 22, max: 25 }, "4.5": { min: 20, max: 21 },
    "4": { min: 17, max: 19 }, "3.5": { min: 13, max: 16 }, "3": { min: 9, max: 12 }, "2.5": { min: 6, max: 8 },
    "2": { min: 4, max: 5 }, "1.5": { min: 2, max: 3 }, "1": { min: 0, max: 1 },
  },
  writing: {
    "6": { min: 29, max: 30 }, "5.5": { min: 27, max: 28 }, "5": { min: 24, max: 26 }, "4.5": { min: 21, max: 23 },
    "4": { min: 17, max: 20 }, "3.5": { min: 15, max: 16 }, "3": { min: 13, max: 14 }, "2.5": { min: 11, max: 12 },
    "2": { min: 7, max: 10 }, "1.5": { min: 3, max: 6 }, "1": { min: 0, max: 2 },
  },
  speaking: {
    "6": { min: 28, max: 30 }, "5.5": { min: 27, max: 27 }, "5": { min: 25, max: 26 }, "4.5": { min: 23, max: 24 },
    "4": { min: 20, max: 22 }, "3.5": { min: 18, max: 19 }, "3": { min: 16, max: 17 }, "2.5": { min: 13, max: 15 },
    "2": { min: 10, max: 12 }, "1.5": { min: 5, max: 9 }, "1": { min: 0, max: 4 },
  },
};

/** Table 6: band -> minimum legacy 0-120 total ("114+", "107+", ...). */
export const LEGACY_TOTAL_MIN: Record<string, number> = {
  "6": 114, "5.5": 107, "5": 95, "4.5": 86, "4": 72, "3.5": 58, "3": 44, "2.5": 34, "2": 24, "1.5": 12, "1": 0,
};

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
/** Table 7: the same band thresholds for every section and the overall score. */
export const cefrForBand = (band: number): Cefr => {
  if (band >= 6) return "C2";
  if (band >= 5) return "C1";
  if (band >= 4) return "B2";
  if (band >= 3) return "B1";
  if (band >= 2) return "A2";
  return "A1";
};

const bandKey = (band: number): string => String(band);

export const isValidBand = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 6 && Math.round(value * 2) === value * 2;

export const legacyRangeForBand = (section: Toefl2026Section, band: number): LegacyRange =>
  LEGACY_SECTION_RANGES[section][bandKey(band)] ?? { min: 0, max: 0 };

export const legacyTotalForBand = (band: number): number => LEGACY_TOTAL_MIN[bandKey(band)] ?? 0;

/** Reads the band for a legacy 0-30 section value from the ETS comparison table. */
export const bandFromLegacy = (section: Toefl2026Section, legacy: number): number => {
  const value = Math.max(0, Math.min(30, Math.round(legacy)));
  for (const band of BANDS) {
    const range = LEGACY_SECTION_RANGES[section][bandKey(band)];
    if (range && value >= range.min && value <= range.max) return band;
  }
  return 1;
};

/** Overall = mean of the four section bands rounded to the nearest half band (halves round up). */
export const overallBandFrom = (bands: Array<number | null | undefined>): number | null => {
  if (bands.length !== 4) return null;
  if (!bands.every((b) => typeof b === "number" && Number.isFinite(b))) return null;
  const mean = (bands as number[]).reduce((sum, b) => sum + b, 0) / 4;
  return Math.max(1, Math.min(6, Math.floor(mean * 2 + 0.5 + 1e-9) / 2));
};

/** Lower-module ceiling on the legacy-equivalent scale (top of band 4.5). */
export const LOWER_MODULE_LEGACY_CAP: Record<"reading" | "listening", number> = { reading: 23, listening: 21 };

export const legacyEquivalent = (
  section: Toefl2026Section,
  raw: number,
  max: number,
  tier: ModuleTier | null,
): number | null => {
  if (!(max > 0)) return null;
  const ratio = Math.max(0, Math.min(1, raw / max));
  const cap = (section === "reading" || section === "listening") && tier === "lower"
    ? LOWER_MODULE_LEGACY_CAP[section]
    : 30;
  return Math.round(cap * ratio + 1e-9);
};

export const sectionBandFromRaw = (
  section: Toefl2026Section,
  raw: number,
  max: number,
  tier: ModuleTier | null,
): number | null => {
  const legacy = legacyEquivalent(section, raw, max, tier);
  return legacy == null ? null : bandFromLegacy(section, legacy);
};

// ---------------------------------------------------------------------------
// Machine-scored item types

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const lettersOnly = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z']/g, "");

export type ItemScore = { score: number; max: number };
export type BlankResult = { id: string; correct: boolean; expected: string; given: string };

/**
 * Complete the Words. Each blank is one point and must match exactly (case
 * and surrounding spaces ignored). The learner types the missing letters; the
 * whole word (stem + missing letters) is accepted too.
 *
 * correct: { blanks: { "1": "ght" }, stems: { "1": "mi" } }
 * response: { blanks: { "1": "ght" } }
 */
export const scoreCompleteWords = (correct: unknown, response: unknown): ItemScore & { blanks: BlankResult[] } => {
  const key = isRecord(correct) && isRecord(correct.blanks) ? correct.blanks : null;
  if (!key) return { score: 0, max: 0, blanks: [] };
  const stems = isRecord(correct) && isRecord(correct.stems) ? correct.stems : {};
  const source = isRecord(response) && isRecord(response.blanks) ? response.blanks : isRecord(response) ? response : {};
  const blanks: BlankResult[] = [];
  let score = 0;
  for (const [id, expectedRaw] of Object.entries(key)) {
    const expected = lettersOnly(expectedRaw);
    const stem = lettersOnly(stems[id]);
    const given = lettersOnly(source[id]);
    const ok = expected.length > 0 && (given === expected || (stem.length > 0 && given === stem + expected));
    if (ok) score += 1;
    blanks.push({ id, correct: ok, expected, given });
  }
  return { score, max: blanks.length, blanks };
};

const tileText = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Build a Sentence. One point when the slots hold the tiles in the single
 * correct order. Tiles are compared by their text so two identical tiles
 * (e.g. two "the") are interchangeable; distractor tiles must stay unused.
 *
 * correct: { order: ["t3", "t1", ...], tiles: { t1: "who", ... } }
 * response: { order: ["t3", "t1", ...] }
 */
export const scoreBuildSentence = (correct: unknown, response: unknown): ItemScore & { given: string; expected: string } => {
  const order = isRecord(correct) && Array.isArray(correct.order) ? correct.order.map(String) : [];
  const tiles = isRecord(correct) && isRecord(correct.tiles) ? correct.tiles : {};
  if (order.length === 0) return { score: 0, max: 0, given: "", expected: "" };
  const expectedLabels = order.map((id) => tileText(tiles[id] ?? id));
  const givenIds = isRecord(response) && Array.isArray(response.order) ? response.order : Array.isArray(response) ? response : [];
  const seen = new Set<string>();
  const givenLabels: string[] = [];
  let valid = givenIds.length === order.length;
  for (const raw of givenIds) {
    const id = raw == null ? "" : String(raw);
    if (!id || !(id in tiles) || seen.has(id)) {
      valid = false;
      givenLabels.push("");
      continue;
    }
    seen.add(id);
    givenLabels.push(tileText(tiles[id]));
  }
  const ok = valid && expectedLabels.every((label, index) => label === givenLabels[index]);
  return { score: ok ? 1 : 0, max: 1, given: givenLabels.join(" ").trim(), expected: expectedLabels.join(" ") };
};

/**
 * Score hook for the shared exam scorers (score-session, exam-state,
 * review-session). Returns null for types it does not own so callers keep
 * their existing behaviour for every other unit type. Speaking items are
 * scored from evaluations, so they contribute no machine points here.
 */
export const scoreToefl2026Unit = (unitType: string, correct: unknown, response: unknown): ItemScore | null => {
  if (unitType === UNIT_COMPLETE_WORDS) {
    const r = scoreCompleteWords(correct, response);
    return { score: r.score, max: r.max };
  }
  if (unitType === UNIT_BUILD_SENTENCE) {
    const r = scoreBuildSentence(correct, response);
    return { score: r.score, max: r.max };
  }
  if (unitType === UNIT_SPEAKING_REPEAT || unitType === UNIT_SPEAKING_INTERVIEW) return { score: 0, max: 0 };
  return null;
};

// ---------------------------------------------------------------------------
// Speaking estimates from a browser speech-recognition transcript

const CONTRACTIONS: Record<string, string> = {
  "don't": "do not", "doesn't": "does not", "didn't": "did not", "isn't": "is not", "aren't": "are not",
  "wasn't": "was not", "weren't": "were not", "can't": "can not", "cannot": "can not", "won't": "will not",
  "wouldn't": "would not", "shouldn't": "should not", "couldn't": "could not", "haven't": "have not",
  "hasn't": "has not", "hadn't": "had not", "i'm": "i am", "you're": "you are", "we're": "we are",
  "they're": "they are", "it's": "it is", "that's": "that is", "there's": "there is", "here's": "here is",
  "what's": "what is", "let's": "let us", "i'll": "i will", "you'll": "you will", "we'll": "we will",
  "they'll": "they will", "it'll": "it will", "i've": "i have", "you've": "you have", "we've": "we have",
  "they've": "they have", "i'd": "i would", "you'd": "you would", "we'd": "we would", "they'd": "they would",
  "he's": "he is", "she's": "she is",
};

const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
  "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve", "15": "fifteen", "20": "twenty",
  "30": "thirty",
};

export const speechTokens = (text: string): string[] => {
  const cleaned = String(text ?? "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9'\s-]+/g, " ")
    .replace(/-/g, " ");
  const out: string[] = [];
  for (const raw of cleaned.split(/\s+/)) {
    const word = raw.replace(/^'+|'+$/g, "");
    if (!word) continue;
    const expanded = CONTRACTIONS[word] ?? NUMBER_WORDS[word] ?? word;
    for (const part of expanded.split(" ")) if (part) out.push(part.replace(/'s$/, ""));
  }
  return out;
};

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "if", "of", "to", "in", "on", "at", "for", "from", "by", "with",
  "about", "as", "into", "near", "down", "up", "out", "over", "under", "is", "are", "was", "were", "be", "been",
  "am", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could", "should", "may", "might",
  "must", "not", "no", "this", "that", "these", "those", "it", "its", "i", "you", "we", "they", "he", "she",
  "me", "us", "them", "him", "her", "my", "your", "our", "their", "his", "there", "here", "who", "which",
  "what", "when", "where", "please", "than", "then", "also", "very", "just", "all", "any", "some",
]);

const stem = (word: string): string =>
  word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "") : word.replace(/s$/, "");

const lcsMatches = (a: string[], b: string[], eq: (x: string, y: string) => boolean): boolean[] => {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      matched[i] = true;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  return matched;
};

export type RepeatEstimate = {
  score: number;
  max: 5;
  exact: boolean;
  matched_words: number;
  target_words: number;
  missing_content_words: string[];
  reason: string;
};

/**
 * Listen and Repeat estimate (0-5) that follows the shape of the ETS scoring
 * guide: 5 exact repetition; 4 meaning kept with minor changes (one or two
 * function words, a tense/number marker, or one content word in a longer
 * sentence); 3 essentially full but meaning not accurately kept (majority of
 * content words); 2 large part missing; 1 a few words; 0 nothing usable. It
 * compares words only - intelligibility and pronunciation are not judged.
 */
export const estimateListenRepeat = (target: string, transcript: string): RepeatEstimate => {
  const t = speechTokens(target);
  const s = speechTokens(transcript);
  const base = { max: 5 as const, target_words: t.length };
  if (t.length === 0) return { ...base, score: 0, exact: false, matched_words: 0, missing_content_words: [], reason: "no_target" };
  if (s.length === 0) {
    return { ...base, score: 0, exact: false, matched_words: 0, missing_content_words: [], reason: "no_response" };
  }
  const exactMatch = lcsMatches(t, s, (x, y) => x === y);
  const stemMatch = lcsMatches(t, s, (x, y) => x === y || stem(x) === stem(y));
  const exactCount = exactMatch.filter(Boolean).length;
  const stemCount = stemMatch.filter(Boolean).length;
  const isExact = exactCount === t.length && s.length === t.length;
  const contentIdx = t.map((w, i) => (FUNCTION_WORDS.has(w) ? -1 : i)).filter((i) => i >= 0);
  const missingContent = contentIdx.filter((i) => !stemMatch[i]).map((i) => t[i]);
  const missingFunction = t.filter((w, i) => FUNCTION_WORDS.has(w) && !stemMatch[i]).length;
  const inflection = stemCount - exactCount;
  const insertions = s.length - stemCount;
  const contentTotal = Math.max(1, contentIdx.length);
  const contentCoverage = (contentTotal - missingContent.length) / contentTotal;
  const result = (score: number, reason: string): RepeatEstimate => ({
    ...base,
    score,
    exact: isExact,
    matched_words: stemCount,
    missing_content_words: missingContent,
    reason,
  });
  if (isExact) return result(5, "exact");
  const allowedContentMiss = t.length >= 8 ? 1 : 0;
  const allowedMinor = t.length >= 10 ? 3 : 2;
  if (missingContent.length <= allowedContentMiss && missingFunction + inflection <= allowedMinor && insertions <= 2) {
    return result(4, "minor_changes");
  }
  if (contentCoverage > 0.5 && s.length >= Math.ceil(t.length * 0.6)) return result(3, "essentially_full");
  const contentMatched = contentTotal - missingContent.length;
  if (contentMatched >= 1 && (contentCoverage >= 0.25 || stemCount >= 3)) return result(2, "large_part_missing");
  if (contentMatched >= 1) return result(1, "few_words");
  return result(0, "unconnected");
};

export type InterviewEstimate = { score: number; max: 5; words: number; on_topic: boolean; source: "basic"; reason: string };

/**
 * Basic Take an Interview estimate used only when the AI rater is not
 * available. It can see length and topic overlap, not quality, so it never
 * awards 5 and is labelled "basic" wherever it is shown.
 */
export const basicInterviewEstimate = (question: string, transcript: string): InterviewEstimate => {
  const words = speechTokens(transcript);
  const content = (list: string[]) => new Set(list.filter((w) => !FUNCTION_WORDS.has(w) && w.length > 2).map(stem));
  const questionWords = content(speechTokens(question));
  const answerWords = content(words);
  let overlap = 0;
  for (const w of answerWords) if (questionWords.has(w)) overlap += 1;
  const onTopic = overlap >= 1;
  const variety = words.length > 0 ? new Set(words).size / words.length : 0;
  const make = (score: number, reason: string): InterviewEstimate => ({
    score, max: 5, words: words.length, on_topic: onTopic, source: "basic", reason,
  });
  if (words.length === 0) return make(0, "no_response");
  if (words.length < 8) return make(1, "very_short");
  if (words.length < 25) return make(onTopic ? 2 : 1, "short");
  if (words.length < 50) return make(onTopic ? 3 : 2, "limited_elaboration");
  return make(onTopic && variety >= 0.45 ? 4 : 3, "elaborated");
};

// ---------------------------------------------------------------------------
// Result assembly

export type Toefl2026UnitInput = {
  id: string;
  section_id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  score: number;
  max: number;
};

export type Toefl2026SectionInput = {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
};

export type TaskScore = { task: Toefl2026Task; section: Toefl2026Section; raw: number; max: number; items: number; scale: "points" | "0-5" };

export type Toefl2026SectionResult = {
  section: Toefl2026Section;
  raw: number | null;
  max: number;
  band: number | null;
  cefr: Cefr | null;
  legacy_equivalent: number | null;
  legacy_range: LegacyRange | null;
  module_path: ModuleTier | null;
  router: { raw: number; max: number; threshold: number } | null;
  pending_reason: string | null;
};

export type Toefl2026Result = {
  format: typeof TOEFL_2026_FORMAT;
  score_version: string;
  is_estimated: true;
  mode: "full_test" | "section" | "practice";
  sections: Record<Toefl2026Section, Toefl2026SectionResult | null>;
  overall_band: number | null;
  overall_cefr: Cefr | null;
  overall_legacy_total_min: number | null;
  overall_pending_reason: string | null;
  tasks: TaskScore[];
  speaking_scope: "transcript_estimate";
  method_notes: string[];
};

export type ConstructedScore = { content_unit_id: string; score: number | null };

const metaString = (meta: Record<string, unknown> | null, key: string): string =>
  meta && typeof meta[key] === "string" ? String(meta[key]).trim().toLowerCase() : "";

const asTask = (value: string): Toefl2026Task | null =>
  (TOEFL_2026_TASKS as readonly string[]).includes(value) ? (value as Toefl2026Task) : null;

export const sectionKind = (section: Toefl2026SectionInput): Toefl2026Section | null => {
  const type = metaString(section.metadata, "type");
  return (TOEFL_2026_SECTIONS as readonly string[]).includes(type) ? (type as Toefl2026Section) : null;
};

export const sectionModule = (section: Toefl2026SectionInput): "router" | "second" | null => {
  const role = metaString(section.metadata, "toefl_module");
  return role === "router" || role === "second" ? role : null;
};

/** Units that belong to the module tier the learner did not take are excluded. */
export const unitVisibleForTier = (unit: Pick<Toefl2026UnitInput, "metadata">, tier: ModuleTier | null): boolean => {
  const unitTier = tierFromExamState(unit.metadata?.difficulty_tier);
  if (!unitTier) return true;
  return unitTier === tier;
};

export const buildToefl2026Result = (input: {
  sections: Toefl2026SectionInput[];
  units: Toefl2026UnitInput[];
  /** session.metadata.route_decisions keyed by second-module section id. */
  routeDecisions: Record<string, unknown>;
  /** 0-5 scores from the AI writing grader, keyed by content unit. */
  writing: ConstructedScore[] | null;
  /** 0-5 speaking estimates, keyed by content unit. Null when not evaluated yet. */
  speaking: ConstructedScore[] | null;
  /** Speaking units the evaluator could not score (no transcript on that device). */
  speakingUnscored?: string[];
  mode: Toefl2026Result["mode"];
  threshold?: number;
}): Toefl2026Result => {
  const threshold = input.threshold ?? ROUTER_THRESHOLD;
  const kindBySection = new Map<string, Toefl2026Section>();
  const moduleBySection = new Map<string, "router" | "second" | null>();
  for (const s of input.sections) {
    const kind = sectionKind(s);
    if (kind) kindBySection.set(s.id, kind);
    moduleBySection.set(s.id, sectionModule(s));
  }

  // Router accuracy per adaptive section kind.
  const routerTotals = new Map<Toefl2026Section, { raw: number; max: number }>();
  for (const u of input.units) {
    const kind = kindBySection.get(u.section_id);
    if (!kind || moduleBySection.get(u.section_id) !== "router") continue;
    const entry = routerTotals.get(kind) ?? { raw: 0, max: 0 };
    entry.raw += u.score;
    entry.max += u.max;
    routerTotals.set(kind, entry);
  }

  // Tier per second-stage section: stored decision first, else recomputed.
  const tierBySection = new Map<string, ModuleTier>();
  for (const s of input.sections) {
    if (moduleBySection.get(s.id) !== "second") continue;
    const decision = isRecord(input.routeDecisions[s.id]) ? (input.routeDecisions[s.id] as Record<string, unknown>) : null;
    const stored = tierFromExamState(decision?.tier);
    const kind = kindBySection.get(s.id);
    const router = kind ? routerTotals.get(kind) : undefined;
    tierBySection.set(s.id, stored ?? routeModule(router?.raw ?? 0, router?.max ?? 0, threshold));
  }

  const writingByUnit = new Map((input.writing ?? []).map((w) => [w.content_unit_id, w.score]));
  const speakingByUnit = new Map((input.speaking ?? []).map((w) => [w.content_unit_id, w.score]));
  const unscored = new Set(input.speakingUnscored ?? []);

  const taskTotals = new Map<Toefl2026Task, TaskScore>();
  const sectionTotals = new Map<Toefl2026Section, { raw: number; max: number; pending: string | null; tier: ModuleTier | null }>();
  const touch = (kind: Toefl2026Section) => {
    const entry = sectionTotals.get(kind) ?? { raw: 0, max: 0, pending: null, tier: null };
    sectionTotals.set(kind, entry);
    return entry;
  };

  for (const s of input.sections) {
    const kind = kindBySection.get(s.id);
    if (kind) touch(kind);
    const tier = tierBySection.get(s.id);
    if (kind && tier) touch(kind).tier = tier;
  }

  for (const u of input.units) {
    const kind = kindBySection.get(u.section_id);
    if (!kind) continue;
    if (moduleBySection.get(u.section_id) === "second" && !unitVisibleForTier(u, tierBySection.get(u.section_id) ?? null)) continue;
    const task = asTask(metaString(u.metadata, "toefl_task"));
    const entry = touch(kind);
    let raw: number | null = u.score;
    let max = u.max;
    let scale: TaskScore["scale"] = "points";

    if (task === "write_email" || task === "write_academic_discussion") {
      scale = "0-5";
      max = 5;
      const value = writingByUnit.get(u.id);
      raw = typeof value === "number" ? Math.max(0, Math.min(5, Math.round(value))) : null;
      if (raw == null) entry.pending = entry.pending ?? "writing_ai_pending";
    } else if (task === "listen_repeat" || task === "take_interview") {
      scale = "0-5";
      max = 5;
      const value = speakingByUnit.get(u.id);
      raw = typeof value === "number" ? Math.max(0, Math.min(5, Math.round(value))) : null;
      if (raw == null) entry.pending = entry.pending ?? (unscored.has(u.id) ? "speaking_no_transcript" : "speaking_pending");
    }

    if (max <= 0) continue;
    entry.max += max;
    if (raw != null) entry.raw += raw;
    if (task) {
      const t = taskTotals.get(task) ?? { task, section: TASK_SECTION[task], raw: 0, max: 0, items: 0, scale };
      t.max += max;
      t.items += 1;
      if (raw != null) t.raw += raw;
      taskTotals.set(task, t);
    }
  }

  const sections = { reading: null, listening: null, writing: null, speaking: null } as Record<Toefl2026Section, Toefl2026SectionResult | null>;
  for (const kind of TOEFL_2026_SECTIONS) {
    const entry = sectionTotals.get(kind);
    if (!entry) continue;
    const adaptive = kind === "reading" || kind === "listening";
    const router = adaptive ? routerTotals.get(kind) ?? null : null;
    const tier = adaptive ? entry.tier ?? (router ? routeModule(router.raw, router.max, threshold) : null) : null;
    const pending = entry.max <= 0 ? "no_scored_items" : entry.pending;
    const legacy = pending ? null : legacyEquivalent(kind, entry.raw, entry.max, tier);
    const band = legacy == null || input.mode === "practice" ? null : bandFromLegacy(kind, legacy);
    sections[kind] = {
      section: kind,
      raw: pending && pending !== "no_scored_items" ? null : entry.raw,
      max: entry.max,
      band,
      cefr: band == null ? null : cefrForBand(band),
      legacy_equivalent: input.mode === "practice" ? null : legacy,
      legacy_range: band == null ? null : legacyRangeForBand(kind, band),
      module_path: tier,
      router: router ? { raw: router.raw, max: router.max, threshold } : null,
      pending_reason: input.mode === "practice" && !pending ? "practice_set" : pending,
    };
  }

  const bands = TOEFL_2026_SECTIONS.map((k) => sections[k]?.band ?? null);
  const overall = input.mode === "full_test" ? overallBandFrom(bands) : null;
  const missing = TOEFL_2026_SECTIONS.filter((k) => sections[k]?.band == null);
  const overallPending = overall != null
    ? null
    : input.mode !== "full_test"
      ? "not_full_test"
      : missing.length > 0
        ? `missing:${missing.join(",")}`
        : "unavailable";

  return {
    format: TOEFL_2026_FORMAT,
    score_version: TOEFL_2026_SCORE_VERSION,
    is_estimated: true,
    mode: input.mode,
    sections,
    overall_band: overall,
    overall_cefr: overall == null ? null : cefrForBand(overall),
    overall_legacy_total_min: overall == null ? null : legacyTotalForBand(overall),
    overall_pending_reason: overallPending,
    tasks: TOEFL_2026_TASKS.map((task) => taskTotals.get(task)).filter((t): t is TaskScore => Boolean(t)),
    speaking_scope: "transcript_estimate",
    method_notes: [
      "Bands are Schood estimates on the ETS 1-6 scale; they are not official ETS scores.",
      `Router threshold: ${Math.round(threshold * 100)}% of router points sends a learner to the upper module.`,
      "Raw proportion -> legacy-equivalent 0-30 -> ETS band comparison table (lower module capped at band 4.5).",
      "Speaking is estimated from a browser transcript; pronunciation, rhythm and intonation are not assessed.",
    ],
  };
};

// ---------------------------------------------------------------------------
// Links for "What to do next"

export const TOEFL_PLAYBOOK_URL = "https://playbook.toefl.schood.online";
export const PLAYBOOK_MODULE_FOR_TASK: Record<Toefl2026Task, string> = {
  complete_the_words: "reading-complete-the-words",
  read_daily_life: "reading-daily-life-and-academic",
  read_academic_passage: "reading-daily-life-and-academic",
  listen_choose_response: "listening-strategy",
  listen_conversation: "listening-strategy",
  listen_announcement: "listening-strategy",
  listen_academic_talk: "listening-strategy",
  build_sentence: "writing-build-a-sentence",
  write_email: "writing-email",
  write_academic_discussion: "writing-academic-discussion",
  listen_repeat: "speaking-listen-and-repeat",
  take_interview: "speaking-take-an-interview",
};

export const playbookDiagnosticUrl = (sessionId: string): string =>
  `${TOEFL_PLAYBOOK_URL}/diagnostic?source=toefl-simulator&session_id=${encodeURIComponent(sessionId)}`;

export const playbookModuleUrl = (slug: string): string => `${TOEFL_PLAYBOOK_URL}/${encodeURIComponent(slug)}`;

/** Weakest tasks first (lowest share of points), at most `limit`, with their Playbook module. */
export const nextStepModules = (tasks: TaskScore[], limit = 3): Array<{ task: Toefl2026Task; slug: string; ratio: number }> => {
  const seen = new Set<string>();
  return tasks
    .filter((t) => t.max > 0)
    .map((t) => ({ task: t.task, slug: PLAYBOOK_MODULE_FOR_TASK[t.task], ratio: t.raw / t.max }))
    .sort((a, b) => a.ratio - b.ratio)
    .filter((t) => (seen.has(t.slug) ? false : (seen.add(t.slug), true)))
    .slice(0, limit);
};
