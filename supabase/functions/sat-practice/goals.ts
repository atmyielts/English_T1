// Goal validation and streaks for SAT Practice (pure; covered by goals.test.ts).
type Goals = { target_score?: unknown; test_date?: unknown; hours_per_week?: unknown; metadata?: unknown };
export type GoalPatch = { value: { target_score: number; test_date: string | null; hours_per_week: number; metadata: Record<string, unknown> } }
  | { error: string; code: string };

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Defaults are created silently, so a learner has "set a goal" only after onboarding or choosing a test date. */
export const goalsSet = (goals: Goals | null | undefined): boolean =>
  (isRecord(goals?.metadata) && goals!.metadata.onboarding_completed === true) || Boolean(goals?.test_date);

/** PATCH semantics: omitted fields keep their saved value; invalid values are refused, never clamped silently. */
export function validGoalPatch(body: Record<string, unknown>, current: Goals, today: string): GoalPatch {
  const target = body.target_score === undefined ? Number(current.target_score ?? 1400) : Number(body.target_score);
  if (!Number.isInteger(target) || target < 400 || target > 1600 || target % 10 !== 0) {
    return { error: 'Choose a target score from 400 to 1600 in steps of 10.', code: 'invalid_target' };
  }
  const hours = body.hours_per_week === undefined ? Number(current.hours_per_week ?? 3) : Number(body.hours_per_week);
  if (!Number.isInteger(hours) || hours < 1 || hours > 40) return { error: 'Choose between 1 and 40 hours a week.', code: 'invalid_hours' };
  let testDate: string | null = typeof current.test_date === 'string' ? current.test_date : null;
  if (body.test_date !== undefined) {
    if (body.test_date === null || body.test_date === '') testDate = null;
    else if (typeof body.test_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.test_date) || Number.isNaN(Date.parse(`${body.test_date}T00:00:00Z`))
      || new Date(`${body.test_date}T00:00:00Z`).toISOString().slice(0, 10) !== body.test_date) {
      return { error: 'Enter the test date as a calendar date.', code: 'invalid_test_date' };
    } else {
      const maxDate = new Date(`${today}T00:00:00Z`); maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 2);
      if (body.test_date !== current.test_date && body.test_date < today) return { error: 'Choose a test date that has not passed yet.', code: 'past_test_date' };
      if (body.test_date > maxDate.toISOString().slice(0, 10)) return { error: 'Choose a test date within the next two years.', code: 'invalid_test_date' };
      testDate = body.test_date;
    }
  }
  const metadata: Record<string, unknown> = isRecord(current.metadata) ? { ...current.metadata } : {};
  if (isRecord(body.metadata) && body.metadata.onboarding_completed === true) metadata.onboarding_completed = true;
  return { value: { target_score: target, test_date: testDate, hours_per_week: hours, metadata } };
}

/** Consecutive UTC days with practice, ending today or (if today is not practised yet) yesterday. */
export function computeStreak(rows: Array<{ day?: unknown; minutes_studied?: unknown; attempts?: unknown }>, today: string): number {
  const days = new Set(rows.filter(r => Number(r.minutes_studied ?? 0) > 0 || Number(r.attempts ?? 0) > 0).map(r => String(r.day)));
  const cursor = new Date(`${today}T00:00:00.000Z`);
  if (!days.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return streak;
}
