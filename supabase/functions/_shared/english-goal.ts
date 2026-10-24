// Goal date plan: "B2 by 1 June 2027". Pure maths so it can be tested; the hub
// loads the learner's levels and practice time and calls buildGoalPlan.
//
// Study hours come from published cumulative guided-learning-hour ranges for
// the CEFR levels (Cambridge English guidance). They are an estimate: everyone
// learns at a different speed, and the UI says so.
import { type Cefr, CEFR_ORDER, isCefr } from "./english-today.ts";
import { perSkillLevels, readLevelHistory } from "./english-levels.ts";

/** Cumulative hours from beginner to reaching each level, [low, high]. */
export const GUIDED_HOURS: Record<Cefr, readonly [number, number]> = {
  A1: [90, 100],
  A2: [180, 200],
  B1: [350, 400],
  B2: [500, 600],
  C1: [700, 800],
  C2: [1000, 1200],
};

export const LEARNER_UTC_OFFSET_HOURS = 5;
const DAY_MS = 86_400_000;
/** A session longer than this is treated as a tab left open. */
export const MAX_SESSION_MINUTES = 90;
export const PACE_WINDOW_DAYS = 28;
export const MIN_DATA_DAYS = 7;
export const WEEKS_SHOWN = 8;
/** Furthest goal date a learner can choose. */
export const MAX_GOAL_YEARS = 5;

export type GoalStatus =
  | "no_level"
  | "reached"
  | "no_date"
  | "date_passed"
  | "not_enough_data"
  | "on_track"
  | "slightly_behind"
  | "behind";

export type PracticeSession = { at: string; minutes: number };

export type GoalInput = {
  now: Date;
  targetLevel: Cefr | null;
  /** Learner calendar date, YYYY-MM-DD. */
  targetDate: string | null;
  /** Per-skill levels from the latest placement, check or move-up. */
  levels: Partial<Record<string, Cefr>>;
  /** Used when no per-skill level is known. */
  overallLevel: Cefr | null;
  /** When the levels above were last measured; practice since then counts towards the goal. */
  levelMeasuredAt: string | null;
  dailyMinutes: number;
  sessions: PracticeSession[];
  /** The learner's first ever practice, which may be older than `sessions`. */
  firstActivityAt: string | null;
};

export type GoalPlan = {
  status: GoalStatus;
  target_level: Cefr | null;
  target_date: string | null;
  current_level: Cefr | null;
  levels_used: Record<string, Cefr>;
  daily_minutes: number;
  estimate: {
    hours_low: number;
    hours_high: number;
    hours_needed: number;
    hours_done_since_level: number;
    hours_remaining: number;
  } | null;
  pace: { minutes_per_week: number; days_of_data: number; enough_data: boolean };
  this_week: { start: string; minutes: number; target_minutes: number };
  weeks: Array<{ start: string; minutes: number }>;
  projection: {
    projected_date: string | null;
    required_minutes_per_week: number | null;
    suggested_daily_minutes: number | null;
    weeks_left: number | null;
  };
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The learner's calendar date (Tashkent, UTC+5). */
export const learnerDate = (at: Date | string): string =>
  new Date(new Date(at).getTime() + LEARNER_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);

/** Monday of the week that contains `date`. */
export const weekStart = (date: string): string => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
};

export const isGoalDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

/** Minutes for one attempt: time on task, else the item's estimate; capped. */
export const attemptMinutes = (timeSpentSeconds: unknown, estimatedMinutes: unknown): number => {
  const seconds = Number(timeSpentSeconds);
  const minutes = Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : Number(estimatedMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(MAX_SESSION_MINUTES, minutes);
};

/**
 * Hours from the learner's level to the target, averaged over the skills we
 * have levels for. A skill already at or above the target needs nothing.
 */
export const hoursToTarget = (
  levels: Partial<Record<string, Cefr>>,
  overall: Cefr | null,
  target: Cefr,
): { low: number; high: number; mid: number; used: Record<string, Cefr> } | null => {
  const used: Record<string, Cefr> = {};
  for (const [skill, level] of Object.entries(levels)) if (isCefr(level)) used[skill] = level;
  const list = Object.values(used);
  if (!list.length && overall) list.push(overall);
  if (!list.length) return null;
  const [targetLow, targetHigh] = GUIDED_HOURS[target];
  let low = 0;
  let high = 0;
  for (const level of list) {
    if (CEFR_ORDER.indexOf(level) >= CEFR_ORDER.indexOf(target)) continue;
    const [levelLow, levelHigh] = GUIDED_HOURS[level];
    low += Math.max(0, targetLow - levelLow);
    high += Math.max(0, targetHigh - levelHigh);
  }
  low /= list.length;
  high /= list.length;
  return { low: Math.round(low), high: Math.round(high), mid: (low + high) / 2, used };
};

export const buildGoalPlan = (input: GoalInput): GoalPlan => {
  const today = learnerDate(input.now);
  const nowMs = input.now.getTime();
  const dailyMinutes = Math.max(5, Math.min(240, Math.round(input.dailyMinutes || 20)));
  const sessions = input.sessions
    .filter((session) => Number.isFinite(Date.parse(session.at)) && Date.parse(session.at) <= nowMs && session.minutes > 0);

  // Last 8 calendar weeks (Monday start, learner time), oldest first.
  const thisWeekStart = weekStart(today);
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, index) => ({
    start: addDays(thisWeekStart, (index - WEEKS_SHOWN + 1) * 7),
    minutes: 0,
  }));
  for (const session of sessions) {
    const week = weeks.find((entry) => entry.start === weekStart(learnerDate(session.at)));
    if (week) week.minutes += session.minutes;
  }
  for (const week of weeks) week.minutes = Math.round(week.minutes);

  // Pace: recent four weeks, or fewer if the learner started more recently.
  const first = [input.firstActivityAt, ...sessions.map((session) => session.at)]
    .filter((at): at is string => typeof at === "string" && Number.isFinite(Date.parse(at)))
    .reduce<number | null>((min, at) => Math.min(min ?? Infinity, Date.parse(at)), null);
  const daysOfData = first === null ? 0 : Math.max(0, Math.floor((nowMs - first) / DAY_MS));
  const enoughData = daysOfData >= MIN_DATA_DAYS;
  const windowDays = Math.min(PACE_WINDOW_DAYS, Math.max(MIN_DATA_DAYS, daysOfData));
  const windowMinutes = sessions
    .filter((session) => Date.parse(session.at) > nowMs - windowDays * DAY_MS)
    .reduce((sum, session) => sum + session.minutes, 0);
  const pacePerWeek = first === null ? 0 : Math.round((windowMinutes * 7) / windowDays);

  const target = input.targetLevel;
  const hours = target ? hoursToTarget(input.levels, input.overallLevel, target) : null;
  const measuredAt = input.levelMeasuredAt && Number.isFinite(Date.parse(input.levelMeasuredAt))
    ? Date.parse(input.levelMeasuredAt)
    : null;
  const minutesSinceLevel = measuredAt === null
    ? 0
    : sessions.filter((session) => Date.parse(session.at) >= measuredAt).reduce((sum, session) => sum + session.minutes, 0);
  const estimate = hours
    ? {
      hours_low: hours.low,
      hours_high: hours.high,
      hours_needed: round1(hours.mid),
      hours_done_since_level: hours.mid > 0 ? round1(minutesSinceLevel / 60) : 0,
      hours_remaining: round1(Math.max(0, hours.mid - minutesSinceLevel / 60)),
    }
    : null;
  const remainingMinutes = estimate ? estimate.hours_remaining * 60 : 0;

  const targetDate = isGoalDate(input.targetDate) ? input.targetDate : null;
  const daysLeft = targetDate ? daysBetween(today, targetDate) : null;
  const weeksLeft = daysLeft !== null && daysLeft > 0 ? daysLeft / 7 : null;
  const required = estimate && weeksLeft !== null ? Math.ceil(remainingMinutes / weeksLeft) : null;
  const projectedDate = estimate && remainingMinutes > 0 && pacePerWeek > 0 && enoughData
    ? addDays(today, Math.ceil((remainingMinutes / pacePerWeek) * 7))
    : null;
  const suggestedDaily = required !== null && required > 0
    ? Math.max(5, Math.min(240, Math.ceil(required / 7 / 5) * 5))
    : null;

  const hasLevel = Boolean(input.overallLevel) || Object.values(input.levels).some(isCefr);
  let status: GoalStatus;
  if (!hasLevel) status = "no_level";
  else if (!target || !hours) status = "no_date";
  else if (hours.mid === 0) status = "reached";
  else if (!targetDate) status = "no_date";
  else if (daysLeft !== null && daysLeft <= 0) status = "date_passed";
  else if (!enoughData) status = "not_enough_data";
  else if (!required || pacePerWeek >= required) status = "on_track";
  else if (pacePerWeek >= required * 0.75) status = "slightly_behind";
  else status = "behind";

  const current = weeks[weeks.length - 1]!;
  const targetMinutes = required !== null && status !== "reached" ? required : dailyMinutes * 7;
  return {
    status,
    target_level: target,
    target_date: targetDate,
    current_level: input.overallLevel,
    levels_used: hours?.used ?? {},
    daily_minutes: dailyMinutes,
    estimate,
    pace: { minutes_per_week: pacePerWeek, days_of_data: daysOfData, enough_data: enoughData },
    this_week: { start: current.start, minutes: current.minutes, target_minutes: targetMinutes },
    weeks,
    projection: {
      projected_date: projectedDate,
      required_minutes_per_week: required,
      suggested_daily_minutes: suggestedDaily,
      weeks_left: weeksLeft === null ? null : round1(weeksLeft),
    },
  };
};

type Meta = Record<string, unknown>;
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** The stored goal date (metadata.goal_plan.target_date), if valid. */
export const readGoalDate = (meta: Meta | null | undefined): string | null => {
  const value = asObject(asObject(meta).goal_plan).target_date;
  return isGoalDate(value) ? value : null;
};

/** Current per-skill levels and when they were measured. */
export const readCurrentLevels = (meta: Meta | null | undefined) => {
  const safe = asObject(meta);
  const history = readLevelHistory(safe);
  const fromPlacement = perSkillLevels(safe.placement);
  const last = history.at(-1);
  return {
    levels: Object.keys(fromPlacement).length ? fromPlacement : last?.per_skill ?? {},
    measuredAt: last?.at ?? (typeof asObject(safe.placement).completed_at === "string" ? String(asObject(safe.placement).completed_at) : null),
  };
};

export type GoalUpdate = {
  target_cefr?: Cefr;
  /** null clears the date. */
  target_date?: string | null;
  daily_time_minutes?: number;
};

/** Validates a POST /hub/goal body. A goal date must be after today and within five years. */
export const parseGoalUpdate = (
  body: unknown,
  now = new Date(),
): { ok: true; update: GoalUpdate } | { ok: false; code: string } => {
  const input = asObject(body);
  const update: GoalUpdate = {};
  if (input.target_cefr !== undefined) {
    const level = String(input.target_cefr ?? "").toUpperCase();
    if (!isCefr(level) || level === "A1") return { ok: false, code: "invalid_target_level" };
    update.target_cefr = level;
  }
  if (input.target_date !== undefined) {
    if (input.target_date === null || input.target_date === "") update.target_date = null;
    else {
      const today = learnerDate(now);
      const value = input.target_date;
      const latest = addDays(today, Math.round(MAX_GOAL_YEARS * 365.25));
      if (!isGoalDate(value) || value <= today || value > latest) return { ok: false, code: "invalid_target_date" };
      update.target_date = value;
    }
  }
  if (input.daily_time_minutes !== undefined) {
    const minutes = Number(input.daily_time_minutes);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) return { ok: false, code: "invalid_daily_minutes" };
    update.daily_time_minutes = Math.round(minutes);
  }
  if (!Object.keys(update).length) return { ok: false, code: "empty_goal_update" };
  return { ok: true, update };
};
