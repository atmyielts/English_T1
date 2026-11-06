// Spaced review for the personal deck, modelled on FSRS: every card keeps a memory
// stability (days until recall falls to 90%) and a difficulty, and each answer moves
// them. Pure functions, so the rules can be tested without a database.

export type Grade = 1 | 2 | 3 | 4; // again, hard, good, easy
export type CardState = 'new' | 'learning' | 'review';

export interface Schedule {
  state: CardState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  due_on: string | null;
  last_reviewed_at: string | null;
}

// The published FSRS default weights, which suit a learner with no history of their own.
const W = [0.4, 0.9, 2.3, 10.9, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61];
const DECAY = -0.5;
const FACTOR = 19 / 81;
/** A work phrase should come back at least about twice a year. */
export const MAX_INTERVAL = 180;
/** From this stability on a card counts as learned for the deck's numbers. */
export const MATURE_STABILITY = 21;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const DAY = 86_400_000;

/** YYYY-MM-DD plus whole days. */
export const addDay = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** Whole days from one calendar day to another. */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

const round = (value: number) => Math.round(value * 1000) / 1000;
const initialDifficulty = (grade: Grade) => clamp(W[4] - (grade - 3) * W[5], 1, 10);
const retrievability = (elapsed: number, stability: number) => Math.pow(1 + FACTOR * elapsed / stability, DECAY);

function nextDifficulty(difficulty: number, grade: Grade): number {
  const moved = difficulty - W[6] * (grade - 3);
  return clamp(W[7] * initialDifficulty(3) + (1 - W[7]) * moved, 1, 10);
}

function recalled(difficulty: number, stability: number, recall: number, grade: Grade): number {
  const penalty = grade === 2 ? W[15] : 1, bonus = grade === 4 ? W[16] : 1;
  return stability * (1 + Math.exp(W[8]) * (11 - difficulty) * Math.pow(stability, -W[9]) * (Math.exp((1 - recall) * W[10]) - 1) * penalty * bonus);
}

function forgotten(difficulty: number, stability: number, recall: number): number {
  return Math.min(stability, W[11] * Math.pow(difficulty, -W[12]) * (Math.pow(stability + 1, W[13]) - 1) * Math.exp((1 - recall) * W[14]));
}

/** Days until the next review: at a 90% target the interval equals the stability. */
export const intervalFor = (stability: number): number => clamp(Math.round(stability), 1, MAX_INTERVAL);

/**
 * The card after one answer on Tashkent day `today`. "Again" keeps it due today so it comes
 * back in the session. A repeat on the day of the last review is relearning, not spaced
 * recall, so it does not grow the stability however many times it is answered.
 */
export function schedule(card: Schedule, grade: Grade, today: string, at: string): Schedule {
  const reps = card.reps + 1;
  const lastDay = card.last_reviewed_at ? tashkentDayOf(card.last_reviewed_at) : null;
  const first = card.state === 'new' || card.stability <= 0;
  let stability: number, difficulty: number, lapses = card.lapses;
  if (first) {
    stability = W[grade - 1];
    difficulty = initialDifficulty(grade);
  } else if (lastDay === today) {
    stability = card.stability;
    difficulty = card.difficulty;
    if (grade === 1 && card.due_on !== today) lapses += 1;
  } else {
    const elapsed = lastDay ? Math.max(0, daysBetween(lastDay, today)) : 0;
    const recall = retrievability(elapsed, card.stability);
    difficulty = nextDifficulty(card.difficulty, grade);
    if (grade === 1) {
      stability = forgotten(difficulty, card.stability, recall);
      lapses += 1;
    } else {
      stability = recalled(difficulty, card.stability, recall, grade);
    }
  }
  stability = round(clamp(stability, 0.1, 3650));
  difficulty = round(difficulty);
  return {
    state: grade === 1 ? 'learning' : stability >= 1 ? 'review' : 'learning',
    stability, difficulty, reps, lapses,
    due_on: grade === 1 ? today : addDay(today, intervalFor(stability)),
    last_reviewed_at: at,
  };
}

const tashkentDayOf = (value: string) => new Date(Date.parse(value) + 5 * 3_600_000).toISOString().slice(0, 10);

/** Which way of asking suits a card: first see it, then listen, recall and type in turn. */
export type ReviewMode = 'intro' | 'listen' | 'recall' | 'type';
export function modeFor(card: Pick<Schedule, 'reps' | 'state'>): ReviewMode {
  if (card.state === 'new' || card.reps === 0) return 'intro';
  return (['type', 'listen', 'recall'] as const)[card.reps % 3];
}
