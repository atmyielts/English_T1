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
