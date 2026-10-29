// Shared pieces of the insights area: who may see what, Tashkent calendar
// helpers, paged reads, and the activity summary (SQL function with an
// in-process fallback that gives the same shape).
import { isLevel, LEVELS, levelIndex, scoreToLevel, type Level } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type Db, type MemberRow } from '../types.ts';

export const DAY = 86_400_000;
const TASHKENT = 5 * 3_600_000;

// ---------------------------------------------------------------------------
// Calendar (Tashkent, UTC+5, no daylight saving)
// ---------------------------------------------------------------------------

/** YYYY-MM-DD in Tashkent for an instant. */
export const localDate = (at: Date | string | number): string => new Date(new Date(at).getTime() + TASHKENT).toISOString().slice(0, 10);
/** The instant a Tashkent calendar day starts. */
export const dayStart = (date: string): Date => new Date(Date.parse(`${date}T00:00:00Z`) - TASHKENT);
/** YYYY-MM-DD plus whole days. */
export const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** Monday of the Tashkent week that contains `date`. */
export const weekOf = (date: string): string => {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
};
/** First day of the month `offset` months from the one containing `date`. */
export const monthOf = (date: string, offset = 0): string => {
  const [year, month] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1 + offset, 1));
  return value.toISOString().slice(0, 10);
};
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (value: unknown): value is string => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export interface Range { from: string; to: string; start: Date; end: Date; days: number }

/** `from`/`to` (inclusive Tashkent dates) from the query; this month to today by default. */
export function parseRange(query: URLSearchParams | Record<string, unknown>, now: Date, maxDays = 366): Range {
  const get = (key: string) => query instanceof URLSearchParams ? query.get(key) : query[key];
  const today = localDate(now);
  const rawFrom = get('from'), rawTo = get('to');
  const from = rawFrom === null || rawFrom === undefined || rawFrom === '' ? monthOf(today) : rawFrom;
  const to = rawTo === null || rawTo === undefined || rawTo === '' ? today : rawTo;
  if (!isDate(from)) throw new CompanyError('invalid_field', 'from must be a date (YYYY-MM-DD).', 400, { field: 'from' });
  if (!isDate(to)) throw new CompanyError('invalid_field', 'to must be a date (YYYY-MM-DD).', 400, { field: 'to' });
  if (to < from) throw new CompanyError('invalid_range', 'The end date is before the start date.', 400, { field: 'to' });
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  if (days > maxDays) throw new CompanyError('invalid_range', `Choose at most ${maxDays} days.`, 400, { field: 'from', max: maxDays });
  return { from, to, start: dayStart(from), end: dayStart(addDays(to, 1)), days };
}

// ---------------------------------------------------------------------------
// Who is asking and whom they may see
// ---------------------------------------------------------------------------

export interface Viewer {
  /** Owner, HR admin or Schood staff: the whole workspace. */
  hr: boolean;
  /** HR or a manager. */
  lead: boolean;
  manager: boolean;
  memberId: string | null;
  /** A manager's department; managers see only it. */
  departmentId: string | null;
}

export function viewerOf(ctx: Ctx): Viewer {
  const role = ctx.member?.role;
  const hr = ctx.staff || role === 'owner' || role === 'admin';
  const manager = !hr && role === 'manager';
  return { hr, lead: hr || manager, manager, memberId: ctx.member?.id ?? null, departmentId: manager ? ctx.member?.department_id ?? null : null };
}

/** Whether the viewer may see this member at all. */
export function canSee(viewer: Viewer, member: Pick<MemberRow, 'id' | 'department_id'>): boolean {
  if (viewer.hr) return true;
  if (viewer.manager) return viewer.departmentId !== null && member.department_id === viewer.departmentId;
  return member.id === viewer.memberId;
}

/** Shares learning activity with the company (or it is the person themself). */
export const shares = (member: Pick<MemberRow, 'consent_at'>): boolean => Boolean(member.consent_at);

/** Reads every row of a query page by page (PostgREST returns at most 1000 at a time). */
export async function fetchAll<T>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }> }, cap = 20_000, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += page) {
    const rows = check<T[]>(await build().range(from, Math.min(cap, from + page) - 1)) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export interface Department { id: string; name: string }

/** Members (not removed) and departments the viewer may see. */
export async function loadScope(ctx: Ctx): Promise<{ viewer: Viewer; members: MemberRow[]; departments: Department[]; department: Department | null }> {
  const viewer = viewerOf(ctx);
  const orgId = ctx.org!.id;
  const [allDepartments, rows] = await Promise.all([
    check<Department[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', orgId).order('name')),
    fetchAll<MemberRow>(() => {
      let query = ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', orgId).neq('status', 'removed');
      if (viewer.manager) query = query.eq('department_id', viewer.departmentId ?? '00000000-0000-0000-0000-000000000000');
      return query.order('id');
    }),
  ]);
  const department = viewer.manager ? allDepartments.find((entry) => entry.id === viewer.departmentId) ?? null : null;
  return {
    viewer,
    members: rows.filter((member) => canSee(viewer, member)),
    departments: viewer.manager ? (department ? [department] : []) : allDepartments,
    department,
  };
}

/** A member who learns: active, not an owner/HR admin who only runs the workspace. */
export const isLearner = (member: MemberRow): boolean => member.status === 'active' && member.role !== 'owner' && member.role !== 'admin';

export const displayName = (member: Pick<MemberRow, 'full_name' | 'email'>): string => member.full_name?.trim() || member.email || '—';
/** "Malika Y." — for standings shown to colleagues. */
export const shortName = (member: Pick<MemberRow, 'full_name' | 'email'>): string => {
  const parts = (member.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return (member.email ?? '—').split('@')[0];
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export type LevelCounts = Record<Level | 'none', number>;
export const emptyLevels = (): LevelCounts => Object.fromEntries([...LEVELS, 'none'].map((level) => [level, 0])) as LevelCounts;
export const meetsTarget = (level: string | null, target: string | null): boolean =>
  isLevel(level) && isLevel(target) && levelIndex(level) >= levelIndex(target);

/** Mean of 0–100 scores, rounded to one decimal, with the level it maps to. */
export function averageScore(scores: (number | null | undefined)[]): { score: number | null; level: Level | null } {
  const values = scores.map(Number).filter((value) => Number.isFinite(value) && value >= 0) as number[];
  if (!values.length) return { score: null, level: null };
  const score = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
  return { score, level: scoreToLevel(score) };
}

/** A member's score for averages: the stored score, else the middle of their level band. */
const BAND_MIDDLE: Record<Level, number> = { pre_a1: 8, a1: 24, a2: 40, b1: 56, b2: 72, c1: 86, c2: 96 };
export const memberScore = (member: Pick<MemberRow, 'level' | 'level_score'>): number | null =>
  member.level_score !== null && member.level_score !== undefined && Number.isFinite(Number(member.level_score)) ? Number(member.level_score)
    : isLevel(member.level) ? BAND_MIDDLE[member.level] : null;

// ---------------------------------------------------------------------------
// Activity summary
// ---------------------------------------------------------------------------

export interface MemberTotals { member_id: string; minutes: number; points: number; lessons: number; events: number; days: number; last_at: string | null }
export interface WeekTotals { week: string; minutes: number; points: number; events: number; learners: number }
export interface ActivitySummary { members: MemberTotals[]; weeks: WeekTotals[]; kinds: Record<string, { events: number; minutes: number }> }
export interface ActivityRow { member_id: string | null; kind: string; minutes: number; points: number; created_at: string }

export const emptySummary = (): ActivitySummary => ({ members: [], weeks: [], kinds: {} });

/** Same result as the SQL function company_activity_summary, from raw rows. */
export function summarize(rows: ActivityRow[], allowed: Set<string>): ActivitySummary {
  const members = new Map<string, MemberTotals & { dayset: Set<string> }>();
  const weeks = new Map<string, WeekTotals & { people: Set<string> }>();
  const kinds: ActivitySummary['kinds'] = {};
  for (const row of rows) {
    if (!row.member_id || !allowed.has(row.member_id)) continue;
    const minutes = Number(row.minutes) || 0, points = Number(row.points) || 0, day = localDate(row.created_at);
    let member = members.get(row.member_id);
    if (!member) members.set(row.member_id, member = { member_id: row.member_id, minutes: 0, points: 0, lessons: 0, events: 0, days: 0, last_at: null, dayset: new Set() });
    member.minutes += minutes; member.points += points; member.events += 1;
    if (row.kind === 'lesson') member.lessons += 1;
    member.dayset.add(day);
    if (!member.last_at || Date.parse(row.created_at) > Date.parse(member.last_at)) member.last_at = new Date(row.created_at).toISOString();
    const key = weekOf(day);
    let week = weeks.get(key);
    if (!week) weeks.set(key, week = { week: key, minutes: 0, points: 0, events: 0, learners: 0, people: new Set() });
    week.minutes += minutes; week.points += points; week.events += 1; week.people.add(row.member_id);
    const kind = kinds[row.kind] ??= { events: 0, minutes: 0 };
    kind.events += 1; kind.minutes += minutes;
  }
  return {
    members: [...members.values()].map(({ dayset, ...rest }) => ({ ...rest, days: dayset.size })),
    weeks: [...weeks.values()].map(({ people, ...rest }) => ({ ...rest, learners: people.size })).sort((a, b) => a.week.localeCompare(b.week)),
    kinds,
  };
}

function normalize(raw: unknown): ActivitySummary {
  const value = (raw ?? {}) as Record<string, unknown>;
  const num = (input: unknown) => Number(input) || 0;
  return {
    members: (Array.isArray(value.members) ? value.members : []).map((row: Record<string, unknown>) => ({
      member_id: String(row.member_id), minutes: num(row.minutes), points: num(row.points), lessons: num(row.lessons), events: num(row.events), days: num(row.days),
      last_at: row.last_at ? new Date(String(row.last_at)).toISOString() : null,
    })),
    weeks: (Array.isArray(value.weeks) ? value.weeks : []).map((row: Record<string, unknown>) => ({
      week: String(row.week).slice(0, 10), minutes: num(row.minutes), points: num(row.points), events: num(row.events), learners: num(row.learners),
    })).sort((a, b) => a.week.localeCompare(b.week)),
    kinds: Object.fromEntries(Object.entries((value.kinds ?? {}) as Record<string, Record<string, unknown>>).map(([kind, totals]) => [kind, { events: num(totals?.events), minutes: num(totals?.minutes) }])),
  };
}

/**
 * Learning activity of `memberIds` in [start, end), counting only members who
 * share their progress. One SQL aggregate when the insights migration is in;
 * otherwise a bounded scan of company_activity.
 */
export async function activitySummary(db: Db, orgId: string, start: Date, end: Date, memberIds: string[]): Promise<ActivitySummary> {
  if (!memberIds.length) return emptySummary();
  const { data, error } = await db.rpc('company_activity_summary', { p_org: orgId, p_from: start.toISOString(), p_to: end.toISOString(), p_members: memberIds });
  if (!error && data) return normalize(data);
  if (error && error.code !== 'PGRST202') console.error(JSON.stringify({ company_insights: 'summary_rpc_failed', error: error.message }));
  const rows = await fetchAll<ActivityRow>(() => db.from('company_activity').select('member_id,kind,minutes,points,created_at')
    .eq('org_id', orgId).gte('created_at', start.toISOString()).lt('created_at', end.toISOString()).order('id'), 50_000);
  return summarize(rows, new Set(memberIds));
}

/** Member ids whose learning may be counted: in scope and sharing progress. */
export const sharingIds = (members: MemberRow[]): string[] => members.filter((member) => member.status === 'active' && shares(member)).map((member) => member.id);

// ---------------------------------------------------------------------------
// Graded attempts (company tests: visible without consent)
// ---------------------------------------------------------------------------

export interface GradedAttempt { id: string; member_id: string | null; assessment_id: string; overall_level: string | null; overall_score: number | null; graded_at: string | null; started_at: string; status: string; decision: string | null }

/** Graded staff attempts of the workspace, oldest first. */
export async function gradedStaffAttempts(db: Db, orgId: string, before?: Date): Promise<GradedAttempt[]> {
  const rows = await fetchAll<GradedAttempt>(() => {
    let query = db.from('company_attempts').select('id,member_id,assessment_id,overall_level,overall_score,graded_at,started_at,status,decision')
      .eq('org_id', orgId).eq('status', 'graded').not('member_id', 'is', null);
    if (before) query = query.lt('graded_at', before.toISOString());
    return query.order('graded_at', { ascending: true }).order('id');
  }, 20_000);
  return rows.filter((row) => row.graded_at && isLevel(row.overall_level));
}

/** The latest graded result per member at an instant. */
export function levelsAt(attempts: GradedAttempt[], at: Date): Map<string, GradedAttempt> {
  const latest = new Map<string, GradedAttempt>();
  for (const attempt of attempts) {
    if (!attempt.member_id || !attempt.graded_at || Date.parse(attempt.graded_at) >= at.getTime()) continue;
    const current = latest.get(attempt.member_id);
    if (!current || Date.parse(current.graded_at!) <= Date.parse(attempt.graded_at)) latest.set(attempt.member_id, attempt);
  }
  return latest;
}

/** Text for a CSV cell: quoted, and formulas neutralised for spreadsheets. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export const csv = (header: string[], rows: unknown[][]): string => [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
