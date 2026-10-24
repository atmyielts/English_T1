// Scoring for vocabulary deck quizzes.
//
// The learner studies a deck's words, then sees each meaning and picks the
// matching word from four options. Options are built from the deck itself (no
// secret: the learner has just studied every word), so the server only checks
// which word was chosen for each meaning. Unanswered words count as wrong.

export type DeckWordKey = { id: string; word: string };

export type DeckAnswer = { word_id: string; option: string };

export type DeckResult = {
  word_id: string;
  word: string;
  /** What the learner picked ("" when unanswered). */
  chosen: string;
  correct: boolean;
};

export type DeckScore = {
  results: DeckResult[];
  correct: number;
  total: number;
  /** correct / total, 0..1 (0 for an empty deck). */
  ratio: number;
};

const MAX_ANSWERS = 100;
const MAX_OPTION_LENGTH = 120;

export const normalizeChoice = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Reads `answers` from a request body, keeping the first answer per word. */
export const parseDeckAnswers = (raw: unknown): DeckAnswer[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DeckAnswer[] = [];
  for (const entry of raw.slice(0, MAX_ANSWERS)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const wordId = String(record.word_id ?? "").trim().slice(0, 64);
    if (!wordId || seen.has(wordId)) continue;
    seen.add(wordId);
    out.push({ word_id: wordId, option: String(record.option ?? "").trim().slice(0, MAX_OPTION_LENGTH) });
  }
  return out;
};

/** Checks every deck word against the learner's choice, in deck order. */
export const scoreDeckQuiz = (words: DeckWordKey[], answers: DeckAnswer[]): DeckScore => {
  const chosenById = new Map(answers.map((answer) => [answer.word_id, answer.option]));
  const results = words.map((word) => {
    const chosen = chosenById.get(word.id) ?? "";
    return {
      word_id: word.id,
      word: word.word,
      chosen,
      correct: chosen !== "" && normalizeChoice(chosen) === normalizeChoice(word.word),
    };
  });
  const correct = results.filter((result) => result.correct).length;
  const total = results.length;
  return { results, correct, total, ratio: total ? correct / total : 0 };
};

/**
 * When a saved deck word should first come up in Review. Missed words are due
 * now, so they come first; words the learner got right wait one day (the same
 * gap as Leitner box 1).
 */
export const firstReviewAt = (correct: boolean, now: Date = new Date()): string =>
  new Date(now.getTime() + (correct ? 24 * 60 * 60 * 1000 : 0)).toISOString();

/** Missed words first, then the rest, each group in deck order. */
export const missedFirst = <T extends { correct: boolean }>(results: T[]): T[] => [
  ...results.filter((result) => !result.correct),
  ...results.filter((result) => result.correct),
];

// ---------------------------------------------------------------------------
// What a saved word carries beyond its meaning
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Common word partners ("make a decision"), at most 8, each a short phrase. */
export const parseCollocations = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const phrase = clip(entry, 80);
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= 8) break;
  }
  return out;
};

export type FamilyMember = { word: string; part_of_speech: string | null };

/** Other forms of the word ("decide" → decision (noun), decisive (adjective)), at most 6. */
export const parseWordFamily = (raw: unknown): FamilyMember[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FamilyMember[] = [];
  for (const entry of raw) {
    const member: Rec = isRec(entry) ? entry : { word: entry };
    const word = clip(member.word, 60);
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push({ word, part_of_speech: clip(member.part_of_speech ?? member.pos, 24) || null });
    if (out.length >= 6) break;
  }
  return out;
};

export type WordContext = { text: string; source: string | null; at: string | null };

const MAX_CONTEXTS = 5;

/** Sentences where the learner met the word in their own reading and listening (newest first). */
export const parseContexts = (raw: unknown): WordContext[] =>
  (Array.isArray(raw) ? raw : [])
    .flatMap((entry) => {
      const rec: Rec = isRec(entry) ? entry : { text: entry };
      const text = clip(rec.text, 300);
      return text ? [{ text, source: clip(rec.source, 120) || null, at: clip(rec.at, 40) || null }] : [];
    })
    .slice(0, MAX_CONTEXTS);

/**
 * Adds a sentence where the learner met the word again. Returns null when it
 * adds nothing (same sentence already kept, or it is the sentence the word was
 * saved from), so callers can skip the write.
 */
export const withContext = (meta: Rec, input: { sentence: string; source: string | null; at: string; savedFrom?: string | null }): Rec | null => {
  const text = clip(input.sentence, 300);
  if (text.length < 12) return null;
  const key = text.toLowerCase();
  if (clip(input.savedFrom, 300).toLowerCase() === key) return null;
  const current = parseContexts(meta.contexts);
  if (current.some((entry) => entry.text.toLowerCase() === key)) return null;
  return { ...meta, contexts: [{ text, source: input.source, at: input.at }, ...current].slice(0, MAX_CONTEXTS) };
};

/** The extra fields a notebook card shows: memory state, encounters, partners, family, translations. */
export const wordExtras = (meta: Rec) => ({
  srs: isRec(meta.srs) ? meta.srs : null,
  contexts: parseContexts(meta.contexts),
  collocations: parseCollocations(meta.collocations),
  word_family: parseWordFamily(meta.word_family),
  translation_ru: clip(meta.translation_ru, 120) || null,
  translation_uz: clip(meta.translation_uz, 120) || null,
  part_of_speech: clip(meta.part_of_speech, 24) || null,
});

// ---------------------------------------------------------------------------
// Typed recall and listen-and-type
// ---------------------------------------------------------------------------

const foldAnswer = (value: string): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^a-z0-9'\s-]+/g, " ")
    .replace(/[-\s]+/g, " ")
    .trim();

/** Edit distance with adjacent swaps (teh → the is one slip). */
export const slipDistance = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
};

export type TypedRecall = {
  verdict: "exact" | "close" | "wrong";
  /** FSRS grade to record: exact 3 good, close 2 hard, wrong 1 again. */
  grade: 1 | 2 | 3;
  /** Letters that differ, for "almost: check the spelling". */
  distance: number;
};

/**
 * Checks a typed answer against the saved word. Case, accents, hyphens and
 * punctuation do not matter ("e-mail" = "email"); one slipped letter (two in
 * a long word) is "close" and counts as a hard recall. Words of three
 * letters or fewer must be exact ("cut" is not "cat").
 */
export const checkTypedRecall = (expected: string, typed: string): TypedRecall => {
  const want = foldAnswer(expected);
  const got = foldAnswer(typed);
  if (!got || !want) return { verdict: "wrong", grade: 1, distance: want.length };
  const compactWant = want.replace(/ /g, "");
  const compactGot = got.replace(/ /g, "");
  if (got === want || compactGot === compactWant) return { verdict: "exact", grade: 3, distance: 0 };
  const distance = slipDistance(compactWant, compactGot);
  const allowed = compactWant.length >= 8 ? 2 : compactWant.length >= 4 ? 1 : 0;
  return distance <= allowed ? { verdict: "close", grade: 2, distance } : { verdict: "wrong", grade: 1, distance };
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The sentence with the word (or a simple inflected form of it) blanked out,
 * as a cue for typed recall. Null when the word is not found in the sentence.
 */
export const blankWord = (sentence: string, word: string): string | null => {
  const tokens = foldAnswer(word).split(" ").filter(Boolean);
  if (!tokens.length || !sentence) return null;
  const forms = (token: string) => {
    const out = new Set([token, `${token}s`, `${token}es`, `${token}ed`, `${token}d`, `${token}ing`, `${token}er`, `${token}ly`]);
    if (/[^aeiou]y$/.test(token)) out.add(`${token.slice(0, -1)}ies`).add(`${token.slice(0, -1)}ied`);
    if (/e$/.test(token)) out.add(`${token.slice(0, -1)}ing`);
    if (/[^aeiou][aeiou][bdgmnprt]$/.test(token)) out.add(`${token}${token.slice(-1)}ed`).add(`${token}${token.slice(-1)}ing`);
    return [...out].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  };
  const pattern = new RegExp(`(?<![\\p{L}'])${tokens.map((token) => `(?:${forms(token)})`).join("[\\s-]+")}(?![\\p{L}'])`, "iu");
  if (!pattern.test(sentence)) return null;
  return sentence.replace(pattern, "_____");
};
