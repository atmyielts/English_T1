import { edge } from './api';
import type { CefrLevel } from './skills';

export type GoalStatus =
  | 'no_level'
  | 'reached'
  | 'no_date'
  | 'date_passed'
  | 'not_enough_data'
  | 'on_track'
  | 'slightly_behind'
  | 'behind';

/** GET /hub/goal: the learner's goal date plan, built from real practice time. */
export type GoalPlan = {
  status: GoalStatus;
  target_level: CefrLevel | null;
  /** Learner calendar date, YYYY-MM-DD. */
  target_date: string | null;
  current_level: CefrLevel | null;
  levels_used: Record<string, CefrLevel>;
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

export type GoalUpdate = {
  target_cefr?: CefrLevel;
  /** null clears the date. */
  target_date?: string | null;
  daily_time_minutes?: number;
};

export const getGoal = (signal?: AbortSignal) =>
  edge<GoalPlan>('hub', '/goal', { query: { language_code: 'en' }, signal });

export const saveGoal = (body: GoalUpdate) =>
  edge<GoalPlan>('hub', '/goal', { query: { language_code: 'en' }, body });

const ymd = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The learner's local date `days` from today, as YYYY-MM-DD. */
export const daysFromToday = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return ymd(date);
};

/** The learner's local date `months` from today, as YYYY-MM-DD. */
export const monthsFromToday = (months: number): string => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return ymd(date);
};

/** A YYYY-MM-DD date read at midday, so formatting never shifts it a day. */
export const goalDateValue = (date: string): string => `${date}T12:00:00`;

/** Advice tone for the status pill. */
export const goalTone = (status: GoalStatus): 'good' | 'warn' | 'bad' | 'neutral' =>
  status === 'on_track' || status === 'reached'
    ? 'good'
    : status === 'slightly_behind'
      ? 'warn'
      : status === 'behind' || status === 'date_passed'
        ? 'bad'
        : 'neutral';
