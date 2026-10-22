// Mastery per learner per topic: a one-parameter (Rasch-style) ability estimate
// updated online with a Laplace step, so each answer moves the estimate less as
// evidence builds up. Unpractised topics slowly lose certainty and come back for review.
// Item difficulty starts from the author's easy/medium/hard tag and later comes from
// Assessment Cloud's calibrated item statistics on the same scale.

export interface MasteryState {
  /** Ability on the logit scale. 0 means a 50% chance on a medium item. */
  theta: number;
  /** Posterior precision (1 / variance). The prior is 1. */
  precision: number;
  attempts: number;
  correct: number;
  /** Spaced-review box: 0 after a mistake, up to 5 after a run of correct answers. */
  box: number;
  last_at: string | null;
  next_review_at: string | null;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY_LOGIT: Record<Difficulty, number> = { easy: -1, medium: 0, hard: 1 };
export const REVIEW_DAYS = [1, 2, 4, 8, 16, 32];
const HALF_LIFE_DAYS = 30;
const DAY = 86_400_000;

export function initialMastery(): MasteryState {
  return { theta: 0, precision: 1, attempts: 0, correct: 0, box: 0, last_at: null, next_review_at: null };
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Precision after forgetting: the evidence above the prior halves every 30 days without practice. */
export function effectivePrecision(state: MasteryState, now: Date): number {
  if (!state.last_at) return state.precision;
  const days = Math.max(0, (now.getTime() - Date.parse(state.last_at)) / DAY);
  return 1 + (state.precision - 1) * 0.5 ** (days / HALF_LIFE_DAYS);
}

/** Chance of answering an item of difficulty `b` correctly, allowing for the uncertainty in theta. */
export function successProbability(state: MasteryState, now: Date, b = 0): number {
  const variance = 1 / effectivePrecision(state, now);
  return logistic((state.theta - b) / Math.sqrt(1 + (Math.PI * variance) / 8));
}

/** Mastery as the chance of answering a medium item, from 0 to 1. */
export function masteryLevel(state: MasteryState, now: Date): number {
  return successProbability(state, now, 0);
}

export interface Answer {
  correct: boolean;
  difficulty: number;
  hints_used?: number;
  at: Date;
}

/** A correct answer reached with hints counts as partial evidence. */
export function answerScore(answer: Answer): number {
  if (!answer.correct) return 0;
  return (answer.hints_used ?? 0) > 0 ? 0.6 : 1;
}

export function updateMastery(state: MasteryState, answer: Answer): MasteryState {
  const precision = effectivePrecision(state, answer.at);
  const p = logistic(state.theta - answer.difficulty);
  const information = p * (1 - p);
  const theta = clamp(state.theta + (answerScore(answer) - p) / (precision + information), -4, 4);
  const box = answer.correct && !(answer.hints_used ?? 0) ? Math.min(REVIEW_DAYS.length - 1, state.box + 1) : 0;
  return {
    theta,
    precision: precision + information,
    attempts: state.attempts + 1,
    correct: state.correct + (answer.correct ? 1 : 0),
    box,
    last_at: answer.at.toISOString(),
    next_review_at: new Date(answer.at.getTime() + REVIEW_DAYS[box] * DAY).toISOString(),
  };
}

/** A wrong answer on a topic the learner usually gets right is probably a slip, not a gap. */
export function classifyError(before: MasteryState, now: Date, difficulty: number): 'slip' | 'concept' {
  return before.attempts >= 5 && successProbability(before, now, difficulty) >= 0.7 ? 'slip' : 'concept';
}

/** The difficulty band to practise next: a little below ability, for roughly a 60–65% success rate. */
export function targetDifficulty(state: MasteryState): Difficulty {
  const b = state.theta - 0.5;
  return b < -0.5 ? 'easy' : b > 0.5 ? 'hard' : 'medium';
}
