// Custom reports: choose rows, columns, filters and a period; run, export to a
// formula-safe CSV, or save the choice for the whole workspace. Activity columns
// count only people who share their progress, and a person row leaves them empty
// for anyone who does not. Managers always get only their own department.
import { isJobRole, isLevel, LEAD_ROLES, levelIndex, type Level } from '../../../../packages/company-core/src/mod.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, obj, oneOf, text } from '../util.ts';
import {
  activitySummary, addDays, averageScore, csv, displayName, fetchAll, gradedStaffAttempts, isLearner, loadScope, localDate, memberScore, monthOf, parseRange,
  sharingIds, viewerOf, type GradedAttempt, type MemberTotals, type Range,
} from './common.ts';
import { movementOf, type Movement } from './cohorts.ts';
import { gradedWithSkills, latestSkills, monthEnd, readRequirements, standingOf, type RequirementRow, type SkillResults } from './framework.ts';

export const ROWS = ['department', 'job_role', 'level', 'month', 'person'] as const;
export type RowBy = (typeof ROWS)[number];
export const COLUMNS = [
  'people', 'tested', 'avg_score', 'avg_level', 'with_requirement', 'meets_requirement', 'compliance_pct', 'moved_up', 'levels_gained',
  'sharing', 'active', 'minutes', 'hours', 'lessons', 'points', 'minutes_per_active', 'tests_graded', 'sessions_attended',
] as const;
export type Column = (typeof COLUMNS)[number];
const LEARNING: readonly Column[] = ['active', 'minutes', 'hours', 'lessons', 'points', 'minutes_per_active', 'sessions_attended'];
const PRESETS = ['this_month', 'last_month', 'last_30', 'last_90', 'this_year', 'custom'] as const;
type Preset = (typeof PRESETS)[number];

export interface ViewConfig {
  rows: RowBy;
  columns: Column[];
  filters: { department_ids: string[]; job_roles: string[]; levels: string[]; seat: 'any' | 'yes' | 'no' };
  period: { preset: Preset; from?: string; to?: string };
}

function list(value: unknown, field: string, allowed: (item: string) => boolean, max = 100): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string' || !allowed(item))) throw new CompanyError('invalid_field', `${field} has a value that cannot be used.`, 400, { field });
  return [...new Set(value as string[])];
}

/** Validates what the page sends; what comes back is also what a saved view stores. */
export function parseConfig(raw: unknown): ViewConfig {
  const input = obj(raw);
  const filters = obj(input.filters ?? {});
  const period = obj(input.period ?? {});
  const columns = list(input.columns, 'columns', (item) => (COLUMNS as readonly string[]).includes(item), COLUMNS.length) as Column[];
  if (!columns.length) throw new CompanyError('invalid_field', 'Choose at least one column.', 400, { field: 'columns' });
  const preset = oneOf<Preset>(period.preset, PRESETS, 'preset', 'this_month');
  return {
    rows: oneOf<RowBy>(input.rows, ROWS, 'rows'),
    columns,
    filters: {
      department_ids: list(filters.department_ids, 'department_ids', (item) => item === 'none' || UUID.test(item)),
      job_roles: list(filters.job_roles, 'job_roles', isJobRole),
      levels: list(filters.levels, 'levels', (item) => item === 'none' || isLevel(item)),
      seat: oneOf(filters.seat, ['any', 'yes', 'no'] as const, 'seat', 'any'),
    },
    period: preset === 'custom' ? { preset, from: String(period.from ?? ''), to: String(period.to ?? '') } : { preset },
  };
}

/** A saved view keeps its period as words, so "last 30 days" stays the last 30 days. */
export function periodRange(period: ViewConfig['period'], now: Date): Range {
  const today = localDate(now);
  const pick = (from: string, to = today) => parseRange({ from, to }, now, 731);
  switch (period.preset) {
    case 'last_month': return pick(monthOf(today, -1), addDays(monthOf(today), -1));
    case 'last_30': return pick(addDays(today, -29));
    case 'last_90': return pick(addDays(today, -89));
    case 'this_year': return pick(`${today.slice(0, 4)}-01-01`);
    case 'custom': return parseRange({ from: period.from, to: period.to }, now, 731);
    default: return pick(monthOf(today));
  }
}

interface Window {
  totals: Map<string, MemberTotals>;
  movement: Movement;
  attended: Map<string, number>;
  graded: Map<string, number>;
  levelOf: (member: MemberRow) => string | null;
  scoreOf: (member: MemberRow) => number | null;
  skills: Map<string, SkillResults>;
  requirements: RequirementRow[];
  day: string;
}

type Value = number | string | null;

function cells(people: MemberRow[], window: Window, columns: readonly Column[], asPerson = false): Partial<Record<Column, Value>> {
  const sharers = people.filter((member) => member.consent_at);
  const rows = sharers.map((member) => window.totals.get(member.id)).filter((row): row is MemberTotals => Boolean(row));
  const sum = (pick: (row: MemberTotals) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const tested = people.filter((member) => isLevel(window.levelOf(member)));
  const average = averageScore(tested.map(window.scoreOf).filter((value): value is number => value !== null));
  const standings = people.map((member) => standingOf(window.requirements, member, window.levelOf(member), window.skills.get(member.id), window.day)).filter((row) => row.requirement);
  const meets = standings.filter((row) => row.meets).length;
  const ids = new Set(people.map((member) => member.id));
  const moves = window.movement.moves.filter((move) => ids.has(move.member.id));
  const active = rows.filter((row) => row.events > 0).length;
  const minutes = sum((row) => row.minutes);
  const out: Partial<Record<Column, Value>> = {};
  for (const column of columns) {
    // No one here shares their progress: blank, not a misleading zero.
    if (LEARNING.includes(column) && !sharers.length) { out[column] = null; continue; }
    switch (column) {
      case 'people': out[column] = people.length; break;
      case 'tested': out[column] = tested.length; break;
      case 'avg_score': out[column] = average.score; break;
      case 'avg_level': out[column] = asPerson ? window.levelOf(people[0]) : average.level; break;
      case 'with_requirement': out[column] = standings.length; break;
      case 'meets_requirement': out[column] = meets; break;
      case 'compliance_pct': out[column] = standings.length ? Math.round(meets / standings.length * 100) : null; break;
      case 'moved_up': out[column] = moves.filter((move) => move.change > 0).length; break;
      case 'levels_gained': out[column] = moves.reduce((total, move) => total + Math.max(0, move.change), 0); break;
      case 'sharing': out[column] = sharers.length; break;
      case 'active': out[column] = active; break;
      case 'minutes': out[column] = minutes; break;
      case 'hours': out[column] = Math.round(minutes / 6) / 10; break;
      case 'lessons': out[column] = sum((row) => row.lessons); break;
      case 'points': out[column] = sum((row) => row.points); break;
      case 'minutes_per_active': out[column] = active ? Math.round(minutes / active) : null; break;
      case 'tests_graded': out[column] = people.reduce((total, member) => total + (window.graded.get(member.id) ?? 0), 0); break;
      case 'sessions_attended': out[column] = sharers.reduce((total, member) => total + (window.attended.get(member.id) ?? 0), 0); break;
    }
  }
  return out;
}

export interface BuiltRow { key: string; label: string | null; kind: RowBy; values: Partial<Record<Column, Value>> }

export async function runView(ctx: Ctx, config: ViewConfig) {
  const org = ctx.org!, now = ctx.now(), today = localDate(now);
  const range = periodRange(config.period, now);
  const { viewer, members, departments, department } = await loadScope(ctx);
  const { filters } = config;
  const people = members.filter(isLearner).filter((member) => {
    if (filters.department_ids.length && !filters.department_ids.includes(member.department_id ?? 'none')) return false;
    if (filters.job_roles.length && !filters.job_roles.includes(member.job_role)) return false;
    if (filters.levels.length && !filters.levels.includes(isLevel(member.level) ? member.level : 'none')) return false;
    if (filters.seat !== 'any' && member.seat !== (filters.seat === 'yes')) return false;
    return true;
  });
  const ids = new Set(people.map((member) => member.id));
  const sharing = sharingIds(people);
  const needsLearning = config.columns.some((column) => LEARNING.includes(column));
  const needsStanding = config.columns.some((column) => ['with_requirement', 'meets_requirement', 'compliance_pct'].includes(column));
  const [attemptsRaw, requirements, attendance] = await Promise.all([
    needsStanding ? gradedWithSkills(ctx.db, org.id) : gradedStaffAttempts(ctx.db, org.id),
    needsStanding ? readRequirements(ctx.db, org.id) : Promise.resolve([] as RequirementRow[]),
    config.columns.includes('sessions_attended') && sharing.length
      ? inChunks(sharing, (chunk) => fetchAll<{ member_id: string; marked_at: string }>(() => ctx.db.from('company_session_attendance').select('member_id,marked_at').eq('org_id', org.id).gte('marked_at', range.start.toISOString()).lt('marked_at', range.end.toISOString()).in('member_id', chunk).order('member_id'), 50_000))
      : Promise.resolve([] as { member_id: string; marked_at: string }[]),
  ]);
  const attempts = (attemptsRaw as GradedAttempt[]).filter((attempt) => attempt.member_id && ids.has(attempt.member_id));

  const windowFor = async (from: Range | { start: Date; end: Date; to: string }, live: boolean): Promise<Window> => {
    const summary = needsLearning ? await activitySummary(ctx.db, org.id, from.start, from.end, sharing) : { members: [] as MemberTotals[] };
    const graded = new Map<string, number>();
    for (const attempt of attempts) {
      const at = Date.parse(attempt.graded_at!);
      if (at >= from.start.getTime() && at < from.end.getTime()) graded.set(attempt.member_id!, (graded.get(attempt.member_id!) ?? 0) + 1);
    }
    const attended = new Map<string, number>();
    for (const row of attendance) {
      const at = Date.parse(row.marked_at);
      if (at >= from.start.getTime() && at < from.end.getTime()) attended.set(row.member_id, (attended.get(row.member_id) ?? 0) + 1);
    }
    const before = attempts.filter((attempt) => Date.parse(attempt.graded_at!) < from.end.getTime());
    const latest = new Map<string, GradedAttempt>();
    for (const attempt of before) latest.set(attempt.member_id!, attempt);
    return {
      totals: new Map(summary.members.map((row) => [row.member_id, row])),
      movement: movementOf(attempts, people, { start: from.start, end: from.end }),
      attended, graded, requirements,
      levelOf: (member) => live ? member.level : latest.get(member.id)?.overall_level ?? null,
      scoreOf: (member) => live ? memberScore(member) : (() => { const score = latest.get(member.id)?.overall_score; return score === null || score === undefined ? null : Number(score); })(),
      skills: needsStanding ? latestSkills(attemptsRaw as never, live ? undefined : from.end) : new Map(),
      day: from.to < today ? from.to : today,
    };
  };

  const rows: BuiltRow[] = [];
  let total: BuiltRow['values'];
  const liveWindow = await windowFor(range, true);
  total = cells(people, liveWindow, config.columns);

  if (config.rows === 'month') {
    // One period per calendar month, cut to the chosen dates. Levels are as tests had shown them by each month's end.
    for (let month = monthOf(range.from); month <= range.to; month = monthOf(month, 1)) {
      const start = month < range.from ? range.from : month;
      const endExclusive = monthEnd(month);
      const lastDay = addDays(monthOf(month, 1), -1);
      const to = lastDay > range.to ? range.to : lastDay;
      const piece = parseRange({ from: start, to }, now, 62);
      const window = await windowFor(piece, to >= today && endExclusive.getTime() > now.getTime());
      rows.push({ key: month.slice(0, 7), label: month.slice(0, 7), kind: 'month', values: cells(people, window, config.columns) });
    }
  } else if (config.rows === 'person') {
    const names = new Map(departments.map((entry) => [entry.id, entry.name]));
    for (const member of [...people].sort((a, b) => displayName(a).localeCompare(displayName(b))).slice(0, 5000)) {
      rows.push({ key: member.id, label: `${displayName(member)}${member.department_id && names.get(member.department_id) ? ` · ${names.get(member.department_id)}` : ''}`, kind: 'person', values: cells([member], liveWindow, config.columns, true) });
    }
  } else {
    const groupOf = (member: MemberRow) => config.rows === 'department' ? member.department_id ?? 'none' : config.rows === 'job_role' ? member.job_role : isLevel(member.level) ? member.level : 'none';
    const names = new Map(departments.map((entry) => [entry.id, entry.name]));
    const keys = [...new Set(people.map(groupOf))];
    keys.sort((a, b) => {
      if (config.rows === 'level') return (isLevel(b) ? levelIndex(b as Level) : -1) - (isLevel(a) ? levelIndex(a as Level) : -1);
      return String(names.get(a) ?? a).localeCompare(String(names.get(b) ?? b));
    });
    for (const key of keys) {
      rows.push({ key, kind: config.rows, label: config.rows === 'department' ? (key === 'none' ? null : names.get(key) ?? null) : key, values: cells(people.filter((member) => groupOf(member) === key), liveWindow, config.columns) });
    }
  }

  return {
    config, range: { from: range.from, to: range.to, days: range.days },
    rows, total,
    people: people.length, sharing: sharing.length,
    scope: { department, unassigned: viewer.manager && !viewer.departmentId },
    departments,
  };
}

const nameTaken = () => new CompanyError('view_name_taken', 'A saved view already has this name.', 409);

interface ViewRow { id: string; org_id: string; name: string; config: ViewConfig; created_by: string | null; created_at: string; updated_at: string }
const VIEW_COLUMNS = 'id,org_id,name,config,created_by,created_at,updated_at';
const MAX_VIEWS = 50;
const hr = (ctx: Ctx) => viewerOf(ctx).hr;

async function loadView(ctx: Ctx, id: string): Promise<ViewRow> {
  if (!UUID.test(id)) throw new CompanyError('view_not_found', 'Saved view not found.', 404);
  const row = check<ViewRow | null>(await ctx.db.from('company_saved_views').select(VIEW_COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('view_not_found', 'Saved view not found.', 404);
  return row;
}
const mayEdit = (ctx: Ctx, view: Pick<ViewRow, 'created_by'>) => hr(ctx) || view.created_by === ctx.user;

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/views', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const rows = check<ViewRow[]>(await ctx.db.from('company_saved_views').select(VIEW_COLUMNS).eq('org_id', ctx.org!.id).order('name').limit(MAX_VIEWS));
      return { views: rows.map((row) => ({ id: row.id, name: row.name, config: row.config, can_edit: mayEdit(ctx, row), updated_at: row.updated_at })) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/insights/views', access: 'org', roles: LEAD_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const name = text(input.name, 'name', { min: 2, max: 80 })!;
      const config = parseConfig(input.config);
      // Chosen dates must work now, or the saved report could never run.
      periodRange(config.period, ctx.now());
      const { count } = await ctx.db.from('company_saved_views').select('id', { count: 'exact', head: true }).eq('org_id', ctx.org!.id);
      if ((count ?? 0) >= MAX_VIEWS) throw new CompanyError('too_many_views', `A workspace can keep ${MAX_VIEWS} saved views. Remove one first.`, 409, { max: MAX_VIEWS });
      const row = checkUnique<ViewRow>(await ctx.db.from('company_saved_views').insert({ org_id: ctx.org!.id, name, config, created_by: ctx.user }).select(VIEW_COLUMNS).single(), nameTaken);
      await ctx.audit('view.saved', row.id, { name });
      return { view: { id: row.id, name: row.name, config: row.config, can_edit: true, updated_at: row.updated_at } };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/insights/views/:view', access: 'org', roles: LEAD_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body);
      const current = await loadView(ctx, params.view);
      if (!mayEdit(ctx, current)) throw new CompanyError('forbidden', 'Only the person who saved this view or HR can change it.', 403);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = text(input.name, 'name', { min: 2, max: 80 });
      if (input.config !== undefined) {
        patch.config = parseConfig(input.config);
        periodRange((patch.config as ViewConfig).period, ctx.now());
      }
      if (!Object.keys(patch).length) return { view: current };
      const row = checkUnique<ViewRow>(await ctx.db.from('company_saved_views').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(VIEW_COLUMNS).single(), nameTaken);
      await ctx.audit('view.updated', row.id);
      return { view: { id: row.id, name: row.name, config: row.config, can_edit: true, updated_at: row.updated_at } };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/insights/views/:view', access: 'org', roles: LEAD_ROLES,
    async handle(ctx, params) {
      const current = await loadView(ctx, params.view);
      if (!mayEdit(ctx, current)) throw new CompanyError('forbidden', 'Only the person who saved this view or HR can remove it.', 403);
      check(await ctx.db.from('company_saved_views').delete().eq('id', current.id).eq('org_id', ctx.org!.id));
      await ctx.audit('view.deleted', current.id, { name: current.name });
      return { ok: true };
    },
  },
  {
    // A read, sent as POST because the choice does not fit in a URL. Stays open while suspended, like other reports.
    method: 'POST', path: 'orgs/:org/insights/builder/run', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, body) {
      return await runView(ctx, parseConfig(body));
    },
  },
  {
    method: 'POST', path: 'orgs/:org/insights/builder/export', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const config = parseConfig(input.config);
      const labels = (input.labels && typeof input.labels === 'object' ? input.labels : {}) as Record<string, unknown>;
      const label = (key: string, fallback: string) => (typeof labels[key] === 'string' ? text(labels[key], 'labels', { max: 80 }) : fallback) ?? fallback;
      const result = await runView(ctx, config);
      const lines = result.rows.map((row) => [label(`row:${row.key}`, row.label ?? ''), ...config.columns.map((column) => row.values[column] ?? '')]);
      lines.push([label('total', 'Total'), ...config.columns.map((column) => result.total[column] ?? '')]);
      await ctx.audit('view.exported', null, { rows: result.rows.length, by: config.rows, from: result.range.from, to: result.range.to });
      return {
        filename: `schood-company-report-${result.range.from}-${result.range.to}.csv`, rows: result.rows.length,
        csv: csv([label(`rows:${config.rows}`, config.rows), ...config.columns.map((column) => label(`col:${column}`, column))], lines),
      };
    },
  },
];
