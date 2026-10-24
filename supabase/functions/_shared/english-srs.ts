// Spaced repetition for saved words: one scheduler for every place a word is
// reviewed (English Review page, vocabulary practice, Telegram Mini App,
// Telegram quiz, platform vocab drill, words used in writing/speaking).
//
// The model is FSRS-4.5 (Free Spaced Repetition Scheduler) with its published
// default weights. Each card keeps its own memory state:
//   stability  S: days until recall probability falls to 90%
//   difficulty D: 1 (easy) .. 10 (hard)
// After a review graded 1 again / 2 hard / 3 good / 4 easy, S and D are
// updated from how likely the learner was to remember at that moment, and the
// next review is set so recall probability is back at the target (90%).
//
// State lives in user_vocabulary_notebook_entries.metadata.srs, so no schema
// change is needed and older code that reads leitner_box keeps working:
// leitner_box is still written, derived from stability.
//
// Pure module with no imports, so the English app can bundle it too (for
// "next review in 3 days" labels on the grade buttons).

export type Grade = 1 | 2 | 3 | 4;
export const GRADES: readonly Grade[] = [1, 2, 3, 4];

export type SrsState = {
  /** Stability in days. */
  s: number;
  /** Difficulty 1..10. */
  d: number;
  /** Successful reviews in a row. */
  reps: number;
  /** Times forgotten (graded again after being learned). */
  lapses: number;
  /** Last review, ISO. */
  last: string;
};

/** FSRS-4.5 default weights. */
export const FSRS_WEIGHTS: readonly number[] = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587,
  0.2272, 2.8755,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
export const TARGET_RETENTION = 0.9;
export const MAX_INTERVAL_DAYS = 365;
/** A forgotten card comes back after this many minutes, so it is seen again the same day. */
export const RELEARN_MINUTES = 10;
const DAY_MS = 86_400_000;

const w = (index: number): number => FSRS_WEIGHTS[index] ?? 0;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number, places = 4): number => Math.round(value * 10 ** places) / 10 ** places;

/** Probability of recall after `elapsedDays` with stability `s`. */
export const retrievability = (elapsedDays: number, s: number): number =>
  Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / Math.max(0.01, s), DECAY);

/** Days until recall probability falls to `retention` (= s at 90%). */
export const intervalForStability = (s: number, retention = TARGET_RETENTION): number =>
  (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);

const initialStability = (grade: Grade): number => Math.max(0.1, w(grade - 1));
const initialDifficulty = (grade: Grade): number => clamp(w(4) - (grade - 3) * w(5), 1, 10);

const nextDifficulty = (d: number, grade: Grade): number => {
  const moved = d - w(6) * (grade - 3);
  // Mean reversion towards the difficulty of a "good" first answer.
  return clamp(w(7) * initialDifficulty(3) + (1 - w(7)) * moved, 1, 10);
};

const recallStability = (d: number, s: number, r: number, grade: Grade): number => {
  const hardPenalty = grade === 2 ? w(15) : 1;
  const easyBonus = grade === 4 ? w(16) : 1;
  return s * (Math.exp(w(8)) * (11 - d) * Math.pow(s, -w(9)) * (Math.exp(w(10) * (1 - r)) - 1) * hardPenalty * easyBonus + 1);
};

const forgetStability = (d: number, s: number, r: number): number =>
  Math.min(s, w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r)));

export type ReviewOutcome = {
  state: SrsState;
  /** When the card is due next. */
  due: Date;
  /** Days until due (fractional for a relearn). */
  intervalDays: number;
  /** Recall probability at the moment of this review (1 for a new card). */
  recall: number;
};

/** Applies one review. `state` null = a card never reviewed before. */
export const reviewCard = (state: SrsState | null, grade: Grade, now: Date): ReviewOutcome => {
  let s: number;
  let d: number;
  let reps: number;
  let lapses: number;
  let recall = 1;
  if (!state) {
    s = initialStability(grade);
    d = initialDifficulty(grade);
    reps = grade === 1 ? 0 : 1;
    lapses = 0;
  } else {
    const elapsed = Math.max(0, (now.getTime() - Date.parse(state.last)) / DAY_MS) || 0;
    recall = retrievability(elapsed, state.s);
    d = nextDifficulty(state.d, grade);
    if (grade === 1) {
      s = forgetStability(state.d, state.s, recall);
      reps = 0;
      lapses = state.lapses + (state.reps > 0 ? 1 : 0);
    } else {
      // Reviewing again the same day barely changes memory; keep at least the old stability.
      s = Math.max(state.s, recallStability(state.d, state.s, recall, grade));
      reps = state.reps + 1;
      lapses = state.lapses;
    }
  }
  s = clamp(s, 0.1, 36500);
  let intervalDays: number;
  if (grade === 1) {
    intervalDays = RELEARN_MINUTES / (24 * 60);
  } else {
    intervalDays = clamp(Math.round(intervalForStability(s)), 1, MAX_INTERVAL_DAYS);
    // A harder grade never gets a longer wait than an easier one would.
    if (grade === 2) intervalDays = Math.max(1, Math.min(intervalDays, Math.round(intervalForStability(s) * 0.8) || 1));
  }
  return {
    state: { s: round(s), d: round(d), reps, lapses, last: now.toISOString() },
    due: new Date(now.getTime() + intervalDays * DAY_MS),
    intervalDays,
    recall: round(recall),
  };
};

/** Days until due for each grade, for labels on the buttons. */
export const previewIntervals = (state: SrsState | null, now: Date): Record<Grade, number> => ({
  1: reviewCard(state, 1, now).intervalDays,
  2: reviewCard(state, 2, now).intervalDays,
  3: reviewCard(state, 3, now).intervalDays,
  4: reviewCard(state, 4, now).intervalDays,
});

/** Leitner box (1..5) for code that still reads boxes: by stability. */
export const boxForStability = (s: number): number => (s < 2 ? 1 : s < 4 ? 2 : s < 8 ? 3 : s < 16 ? 4 : 5);

/** The old Leitner spacing (1, 2, 4, 8, 16 days); used to seed state for cards reviewed before FSRS. */
export const legacyIntervalDays = (box: number): number => (box <= 1 ? 1 : box === 2 ? 2 : box === 3 ? 4 : box === 4 ? 8 : 16);

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Reads a stored state; null when missing or malformed. */
export const parseSrsState = (raw: unknown): SrsState | null => {
  if (!isRecord(raw)) return null;
  const s = num(raw.s, Number.NaN);
  const d = num(raw.d, Number.NaN);
  const last = typeof raw.last === "string" && Number.isFinite(Date.parse(raw.last)) ? raw.last : null;
  if (!(s > 0) || !(d >= 1 && d <= 10) || !last) return null;
  return { s, d, reps: Math.max(0, Math.floor(num(raw.reps))), lapses: Math.max(0, Math.floor(num(raw.lapses))), last };
};

export type NotebookSrsRow = {
  leitner_box?: unknown;
  review_count?: unknown;
  correct_count?: unknown;
  incorrect_count?: unknown;
  last_reviewed_at?: unknown;
  next_review_at?: unknown;
  metadata?: unknown;
};

/**
 * The card's memory state. Words reviewed only under the old Leitner boxes get
 * a state seeded from their box (stability = the box's interval) and their
 * error rate; never-reviewed words have none.
 */
export const stateOfRow = (row: NotebookSrsRow, now: Date): SrsState | null => {
  const meta = isRecord(row.metadata) ? row.metadata : {};
  const stored = parseSrsState(meta.srs);
  if (stored) return stored;
  const reviews = Math.max(0, Math.floor(num(row.review_count)));
  if (reviews === 0) return null;
  const box = clamp(Math.floor(num(row.leitner_box, 1)) || 1, 1, 5);
  const wrong = Math.max(0, num(row.incorrect_count));
  const errorRate = clamp(wrong / Math.max(1, reviews), 0, 1);
  const lastRaw = typeof row.last_reviewed_at === "string" && Number.isFinite(Date.parse(row.last_reviewed_at))
    ? row.last_reviewed_at
    : new Date(now.getTime() - legacyIntervalDays(box) * DAY_MS).toISOString();
  return {
    s: legacyIntervalDays(box),
    d: round(clamp(4 + errorRate * 5, 1, 10)),
    reps: box > 1 ? box - 1 : 0,
    lapses: Math.floor(wrong),
    last: lastRaw,
  };
};

/** Old outcome words to a grade. */
export const gradeFromOutcome = (correct: boolean): Grade => (correct ? 3 : 1);

/** SM-2 quality 0..5 (platform vocab drill) to a grade: 0-2 again, 3 hard, 4 good, 5 easy. */
export const gradeFromQuality = (quality: unknown): Grade => {
  const q = Math.round(num(quality, 3));
  if (q <= 2) return 1;
  if (q === 3) return 2;
  if (q === 4) return 3;
  return 4;
};

export const parseGrade = (value: unknown): Grade | null => {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
};

/**
 * The update for user_vocabulary_notebook_entries after one review. Keeps
 * other metadata, writes the new state to metadata.srs, and keeps the legacy
 * columns (leitner_box, counts) meaningful.
 */
export const notebookReviewPatch = (row: NotebookSrsRow, grade: Grade, now: Date) => {
  const outcome = reviewCard(stateOfRow(row, now), grade, now);
  const meta = isRecord(row.metadata) ? row.metadata : {};
  const correct = grade > 1;
  return {
    leitner_box: grade === 1 ? 1 : boxForStability(outcome.state.s),
    next_review_at: outcome.due.toISOString(),
    last_reviewed_at: now.toISOString(),
    review_count: Math.max(0, Math.floor(num(row.review_count))) + 1,
    correct_count: Math.max(0, Math.floor(num(row.correct_count))) + (correct ? 1 : 0),
    incorrect_count: Math.max(0, Math.floor(num(row.incorrect_count))) + (correct ? 0 : 1),
    metadata: { ...meta, srs: outcome.state } as Record<string, unknown> & { srs: SrsState },
  };
};

/**
 * Seeds a state from an SM-2 card (vocab_drill_cards) when it is moved into
 * the notebook: stability from its interval, difficulty from its ease factor
 * (2.5 = average, 1.3 = hardest).
 */
export const stateFromSm2 = (
  card: { interval?: unknown; ease_factor?: unknown; repetitions?: unknown; last_review?: unknown },
  now: Date,
): SrsState | null => {
  const reps = Math.max(0, Math.floor(num(card.repetitions)));
  const last = typeof card.last_review === "string" && Number.isFinite(Date.parse(card.last_review)) ? card.last_review : null;
  if (reps === 0 && !last) return null;
  const ease = clamp(num(card.ease_factor, 2.5), 1.3, 3);
  return {
    s: round(Math.max(1, num(card.interval, 1))),
    d: round(clamp(1 + ((3 - ease) / 1.7) * 9, 1, 10)),
    reps,
    lapses: 0,
    last: last ? new Date(last).toISOString() : now.toISOString(),
  };
};

/** SM-2 ease factor equivalent of a difficulty, for old clients that show it. */
export const easeFromDifficulty = (d: number): number => round(clamp(3 - ((d - 1) / 9) * 1.7, 1.3, 3), 2);

/**
 * Starter decks are introduced gradually: the first `perDay` words are due
 * now, the next ones a day later, and so on.
 */
export const starterDueAt = (index: number, now: Date, perDay = 20): string =>
  new Date(now.getTime() + Math.floor(Math.max(0, index) / Math.max(1, perDay)) * DAY_MS).toISOString();
