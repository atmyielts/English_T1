// Grammar unit mastery and spaced re-checks.
//
// A lesson done once is not a rule learned. Mastery is read from the
// learner's own lesson results (learning_attempts on grammar.unit items), so
// nothing extra is stored:
//
//   0 new         never tried
//   1 started     tried, best result under 60%
//   2 practising  60%+ at least once, never 80%
//   3 secure      80%+ (a "pass")
//   4 mastered    three counted passes (the lesson, then re-checks 3 and 10 days later)
//
// A pass counts only when it comes at least the current gap after the
// previous counted pass: 3 days after the first, then 10, then 30, then 60.
// After every counted pass the unit is due for a re-check after that gap. A
// result under 60% after a pass takes one pass away, sets the unit back to
// "practising" and asks for a re-check the next day; the next pass counts at once.
//
// Pure module with no imports.

export const PASS = 0.8;
export const PRACTISE = 0.6;
/** Days between counted passes: the 1st re-check after 3 days, then 10, then 30; 60 once mastered. */
export const RECHECK_GAPS_DAYS = [3, 10, 30] as const;
export const MASTERED_GAP_DAYS = 60;
const DAY_MS = 86_400_000;

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;
export const MASTERY_NAMES = ["new", "started", "practising", "secure", "mastered"] as const;
export type MasteryName = (typeof MASTERY_NAMES)[number];

export type UnitAttempt = { score: number | null; submitted_at: string };

export type UnitMastery = {
  level: MasteryLevel;
  name: MasteryName;
  attempts: number;
  /** Best result, 0..1. */
  best: number | null;
  last: number | null;
  last_at: string | null;
  /** Spaced passes so far (0..3+). */
  passes: number;
  /** When the next re-check is due (null: never passed, so there is nothing to re-check). */
  recheck_at: string | null;
  recheck_due: boolean;
};

/** Days after the n-th counted pass until the re-check (and before another pass counts). */
export const gapAfter = (passes: number): number =>
  passes <= 0 ? 0 : passes <= RECHECK_GAPS_DAYS.length ? RECHECK_GAPS_DAYS[passes - 1]! : MASTERED_GAP_DAYS;

export const unitMastery = (raw: UnitAttempt[], now: Date = new Date()): UnitMastery => {
  const attempts = raw
    .filter((attempt) => Number.isFinite(Date.parse(attempt.submitted_at)))
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const scored = attempts.filter((attempt): attempt is { score: number; submitted_at: string } => typeof attempt.score === "number" && Number.isFinite(attempt.score));
  if (!attempts.length) {
    return { level: 0, name: "new", attempts: 0, best: null, last: null, last_at: null, passes: 0, recheck_at: null, recheck_due: false };
  }

  let passes = 0;
  let lastCounted: number | null = null;
  let setBack = false;
  let setBackAt: number | null = null;
  for (const attempt of scored) {
    const at = Date.parse(attempt.submitted_at);
    if (attempt.score >= PASS) {
      if (lastCounted === null || setBack || (at - lastCounted) / DAY_MS >= gapAfter(passes)) {
        passes += 1;
        lastCounted = at;
      }
      setBack = false;
      setBackAt = null;
    } else if (attempt.score < PRACTISE && passes > 0) {
      // Forgotten: back to practising until the next pass, which counts at once.
      setBack = true;
      setBackAt = at;
      passes = Math.max(0, passes - 1);
    }
  }

  const best = scored.length ? Math.max(...scored.map((attempt) => attempt.score)) : null;
  const lastAttempt = attempts[attempts.length - 1]!;
  const last = scored.length ? scored[scored.length - 1]!.score : null;
  let level: MasteryLevel;
  if (setBack) level = 2;
  else if (passes >= RECHECK_GAPS_DAYS.length) level = 4;
  else if (passes >= 1) level = 3;
  else if (best !== null && best >= PRACTISE) level = 2;
  else level = 1;

  let recheckAt: number | null = null;
  if (setBack && setBackAt !== null) recheckAt = setBackAt + DAY_MS;
  else if (lastCounted !== null) recheckAt = lastCounted + gapAfter(passes) * DAY_MS;

  return {
    level,
    name: MASTERY_NAMES[level],
    attempts: attempts.length,
    best,
    last,
    last_at: lastAttempt.submitted_at,
    passes,
    recheck_at: recheckAt === null ? null : new Date(recheckAt).toISOString(),
    recheck_due: recheckAt !== null && recheckAt <= now.getTime(),
  };
};

/** Units whose re-check is due, the longest overdue first. */
export const dueRechecks = <T extends { mastery: UnitMastery }>(units: T[]): T[] =>
  units
    .filter((unit) => unit.mastery.recheck_due)
    .sort((a, b) => Date.parse(a.mastery.recheck_at ?? "") - Date.parse(b.mastery.recheck_at ?? ""));
