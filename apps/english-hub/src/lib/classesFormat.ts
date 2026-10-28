// Pure helpers for the classes pages (no network), so Deno tests can import them.
import type { CefrLevel, SkillKey } from './skills.ts';

export type PlanTier = 'free' | 'partial' | 'full';

export type CsvRosterRow = {
  name: string;
  levels: Partial<Record<SkillKey, CefrLevel | null>>;
  streak: number;
  minutes_week: number;
  activities_week: number;
  last_active: string | null;
  assignments_done: number;
  assignments_total: number;
  plan: PlanTier;
};

/** The learner's local date (YYYY-MM-DD) plus `days`. */
export const dateAfter = (days: number, from: Date = new Date()): string => {
  const shifted = new Date(from.getTime() - from.getTimezoneOffset() * 60_000 + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
};

/** Whole days from today (learner time, UTC+5) to a due date: 0 today, 1 tomorrow, -1 yesterday. */
export const daysUntil = (dueDate: string, now: Date = new Date()): number => {
  const today = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
};

/** One CSV cell: quoted, with formula-looking values neutralised for spreadsheets. */
export const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (rows: unknown[][]): string => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

/** The class roster as CSV rows (header first). Labels are passed in so the file follows the UI language. */
export const rosterCsv = (
  roster: CsvRosterRow[],
  skills: SkillKey[],
  labels: { name: string; skill: (skill: SkillKey) => string; streak: string; minutes: string; activities: string; lastActive: string; assignments: string; plan: string; planLabel: (plan: PlanTier) => string },
): string =>
  toCsv([
    [labels.name, ...skills.map(labels.skill), labels.streak, labels.minutes, labels.activities, labels.lastActive, labels.assignments, labels.plan],
    ...roster.map((row) => [
      row.name,
      ...skills.map((skill) => row.levels[skill] ?? ''),
      row.streak,
      row.minutes_week,
      row.activities_week,
      row.last_active ? row.last_active.slice(0, 10) : '',
      `${row.assignments_done}/${row.assignments_total}`,
      labels.planLabel(row.plan),
    ]),
  ]);
