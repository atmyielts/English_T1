// Team challenges: HR sets a goal window and a metric (points, minutes or
// lessons) for everyone or chosen departments; standings come from
// company_activity and count only people who share their progress.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, oneOf, text } from '../util.ts';
import { activitySummary, addDays, dayStart, DAY, displayName, fetchAll, isDate, localDate, shortName, viewerOf, type Viewer } from './common.ts';

export const METRICS = ['points', 'minutes', 'lessons'] as const;
export type Metric = (typeof METRICS)[number];
export const MAX_CHALLENGE_DAYS = 92;

export interface ChallengeRow {
  id: string; org_id: string; title: string; description: string | null; metric: Metric; starts_on: string; ends_on: string;
  department_ids: string[]; ended_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}
const COLUMNS = 'id,org_id,title,description,metric,starts_on,ends_on,department_ids,ended_at,created_by,created_at,updated_at';

/** Everyone sees all-company challenges; a department challenge is seen by its departments and HR. */
export function visibleChallenge(row: Pick<ChallengeRow, 'department_ids'>, viewer: Viewer, member: Pick<MemberRow, 'department_id'> | null): boolean {
  if (viewer.hr || !row.department_ids?.length) return true;
  return Boolean(member?.department_id && row.department_ids.includes(member.department_id));
}

export function challengeStatus(row: Pick<ChallengeRow, 'starts_on' | 'ends_on' | 'ended_at'>, today: string): 'upcoming' | 'running' | 'finished' {
  if (row.ended_at || today > row.ends_on) return 'finished';
  return today < row.starts_on ? 'upcoming' : 'running';
}

/** [start, end) of the challenge, cut short when HR ended it early. */
export function challengeWindow(row: Pick<ChallengeRow, 'starts_on' | 'ends_on' | 'ended_at'>): { start: Date; end: Date } {
  const start = dayStart(row.starts_on);
  let end = dayStart(addDays(row.ends_on, 1));
  if (row.ended_at && Date.parse(row.ended_at) < end.getTime()) end = new Date(Math.max(start.getTime(), Date.parse(row.ended_at)));
  return { start, end };
}

/** Competition ranking: equal values share a rank (1, 1, 3). */
export function rank<T>(rows: T[], value: (row: T) => number): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  let previous = Number.NaN, current = 0;
  return sorted.map((row, index) => {
    if (value(row) !== previous) { current = index + 1; previous = value(row); }
    return { ...row, rank: current };
  });
}

async function departmentIds(ctx: Ctx, value: unknown): Promise<string[]> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100 || value.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    throw new CompanyError('invalid_field', 'department_ids must be a list of departments.', 400, { field: 'department_ids' });
  }
  const unique = [...new Set(value as string[])];
  if (!unique.length) return [];
  const found = check<{ id: string }[]>(await ctx.db.from('company_departments').select('id').eq('org_id', ctx.org!.id).in('id', unique));
  if (found.length !== unique.length) throw new CompanyError('invalid_field', 'Choose departments of this workspace.', 400, { field: 'department_ids' });
  return unique;
}

async function load(ctx: Ctx, id: string): Promise<ChallengeRow> {
  if (!UUID.test(id)) throw new CompanyError('challenge_not_found', 'Challenge not found.', 404);
  const row = check<ChallengeRow | null>(await ctx.db.from('company_challenges').select(COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row || !visibleChallenge(row, viewerOf(ctx), ctx.member)) throw new CompanyError('challenge_not_found', 'Challenge not found.', 404);
  return { ...row, department_ids: row.department_ids ?? [] };
}

function dates(input: Record<string, unknown>, current: Pick<ChallengeRow, 'starts_on' | 'ends_on'> | null, today: string) {
  const starts = input.starts_on === undefined && current ? current.starts_on : input.starts_on;
  const ends = input.ends_on === undefined && current ? current.ends_on : input.ends_on;
  if (!isDate(starts)) throw new CompanyError('invalid_field', 'starts_on must be a date.', 400, { field: 'starts_on' });
  if (!isDate(ends)) throw new CompanyError('invalid_field', 'ends_on must be a date.', 400, { field: 'ends_on' });
  if (ends < starts) throw new CompanyError('invalid_range', 'The challenge ends before it starts.', 400, { field: 'ends_on' });
  if ((Date.parse(ends) - Date.parse(starts)) / DAY + 1 > MAX_CHALLENGE_DAYS) throw new CompanyError('invalid_range', `A challenge lasts at most ${MAX_CHALLENGE_DAYS} days.`, 400, { field: 'ends_on', max: MAX_CHALLENGE_DAYS });
  if (ends < today) throw new CompanyError('invalid_range', 'The end date has already passed.', 400, { field: 'ends_on' });
  if (starts < addDays(today, -60)) throw new CompanyError('invalid_range', 'The start can be at most 60 days ago.', 400, { field: 'starts_on' });
  return { starts_on: starts, ends_on: ends };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/challenges', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const viewer = viewerOf(ctx), today = localDate(ctx.now());
      const [rows, departments] = await Promise.all([
        check<ChallengeRow[]>(await ctx.db.from('company_challenges').select(COLUMNS).eq('org_id', ctx.org!.id).order('starts_on', { ascending: false }).limit(200)),
        check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', ctx.org!.id).order('name')),
      ]);
      const order = { running: 0, upcoming: 1, finished: 2 };
      const challenges = rows.map((row) => ({ ...row, department_ids: row.department_ids ?? [] }))
        .filter((row) => visibleChallenge(row, viewer, ctx.member))
        .map((row) => ({ ...row, status: challengeStatus(row, today) }))
        .sort((a, b) => order[a.status] - order[b.status] || (a.status === 'finished' ? b.ends_on.localeCompare(a.ends_on) : a.starts_on.localeCompare(b.starts_on)));
      return { today, challenges, departments: viewer.hr ? departments : departments.filter((entry) => challenges.some((row) => row.department_ids.includes(entry.id))), can_manage: viewer.hr };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/challenges', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body), today = localDate(ctx.now());
      const row = check<ChallengeRow>(await ctx.db.from('company_challenges').insert({
        org_id: ctx.org!.id,
        title: text(input.title, 'title', { min: 2, max: 120 }),
        description: text(input.description, 'description', { max: 600, optional: true }),
        metric: oneOf<Metric>(input.metric, METRICS, 'metric', 'points'),
        ...dates(input, null, today),
        department_ids: await departmentIds(ctx, input.department_ids),
        created_by: ctx.user,
      }).select(COLUMNS).single());
      await ctx.audit('challenge.created', row.id, { title: row.title, metric: row.metric });
      return { challenge: { ...row, status: challengeStatus(row, today) } };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/challenges/:challenge', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body), today = localDate(ctx.now());
      const current = await load(ctx, params.challenge);
      const status = challengeStatus(current, today);
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = text(input.title, 'title', { min: 2, max: 120 });
      if (input.description !== undefined) patch.description = text(input.description, 'description', { max: 600, optional: true });
      const changesRules = input.metric !== undefined || input.starts_on !== undefined || input.ends_on !== undefined || input.department_ids !== undefined;
      if (changesRules) {
        if (status === 'finished') throw new CompanyError('challenge_finished', 'This challenge has finished; only its name and description can change.', 409);
        if (input.metric !== undefined) {
          const metric = oneOf<Metric>(input.metric, METRICS, 'metric');
          if (status === 'running' && metric !== current.metric) throw new CompanyError('challenge_running', 'The metric cannot change once the challenge has started.', 409, { field: 'metric' });
          patch.metric = metric;
        }
        if (input.starts_on !== undefined || input.ends_on !== undefined) {
          const next = dates(input, current, today);
          if (status === 'running' && next.starts_on !== current.starts_on) throw new CompanyError('challenge_running', 'The start date cannot change once the challenge has started.', 409, { field: 'starts_on' });
          Object.assign(patch, next);
        }
        if (input.department_ids !== undefined) patch.department_ids = await departmentIds(ctx, input.department_ids);
      }
      if (!Object.keys(patch).length) return { challenge: { ...current, status } };
      const row = check<ChallengeRow>(await ctx.db.from('company_challenges').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('challenge.updated', row.id, { fields: Object.keys(patch) });
      return { challenge: { ...row, status: challengeStatus(row, today) } };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/challenges/:challenge/end', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await load(ctx, params.challenge), today = localDate(ctx.now());
      if (current.ended_at) return { challenge: { ...current, status: 'finished' } };
      if (challengeStatus(current, today) === 'upcoming') throw new CompanyError('challenge_not_started', 'This challenge has not started. Delete it instead.', 409);
      const row = check<ChallengeRow>(await ctx.db.from('company_challenges').update({ ended_at: ctx.now().toISOString(), ends_on: current.ends_on < today ? current.ends_on : today })
        .eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('challenge.ended', row.id);
      return { challenge: { ...row, status: 'finished' } };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/challenges/:challenge', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await load(ctx, params.challenge);
      if (challengeStatus(current, localDate(ctx.now())) !== 'upcoming') throw new CompanyError('challenge_started', 'Only a challenge that has not started can be deleted. End it instead.', 409);
      check(await ctx.db.from('company_challenges').delete().eq('id', current.id).eq('org_id', ctx.org!.id));
      await ctx.audit('challenge.deleted', current.id, { title: current.title });
      return { ok: true };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/challenges/:challenge', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      return await standings(ctx, await load(ctx, params.challenge));
    },
  },
];

const valueOf = (metric: Metric, totals: { points: number; minutes: number; lessons: number } | undefined) => totals ? totals[metric] : 0;

async function standings(ctx: Ctx, challenge: ChallengeRow) {
  const viewer = viewerOf(ctx), today = localDate(ctx.now()), org = ctx.org!;
  const [members, departments] = await Promise.all([
    fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('status', 'active').order('id')),
    check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name')),
  ]);
  const scoped = challenge.department_ids.length ? departments.filter((entry) => challenge.department_ids.includes(entry.id)) : departments;
  const inScope = (member: MemberRow) => !challenge.department_ids.length || (member.department_id !== null && challenge.department_ids.includes(member.department_id));
  // Participants share their progress with the company; others are not counted.
  const participants = members.filter((member) => inScope(member) && member.consent_at);
  const status = challengeStatus(challenge, today);
  const { start, end } = challengeWindow(challenge);
  const summary = status === 'upcoming' ? { members: [] } : await activitySummary(ctx.db, org.id, start, new Date(Math.min(end.getTime(), ctx.now().getTime() + 1)), participants.map((member) => member.id));
  const totals = new Map(summary.members.map((row) => [row.member_id, row]));
  const departmentName = new Map(departments.map((entry) => [entry.id, entry.name]));

  const departmentRows = rank(scoped.map((entry) => {
    const people = participants.filter((member) => member.department_id === entry.id);
    const total = people.reduce((sum, member) => sum + valueOf(challenge.metric, totals.get(member.id)), 0);
    return {
      id: entry.id, name: entry.name, participants: people.length, active: people.filter((member) => valueOf(challenge.metric, totals.get(member.id)) > 0).length,
      total, average: people.length ? Math.round(total / people.length * 10) / 10 : 0,
    };
  }), (row) => row.average * 1e6 + row.total);

  const ranked = rank(participants.map((member) => ({ member, value: valueOf(challenge.metric, totals.get(member.id)) })).filter((row) => row.value > 0), (row) => row.value);
  const mine = ranked.find((row) => row.member.id === viewer.memberId) ?? null;
  const limit = viewer.hr ? 200 : viewer.manager ? 20 : 10;
  const nameFor = (member: MemberRow) => viewer.hr || (viewer.manager && member.department_id === viewer.departmentId) || member.id === viewer.memberId ? displayName(member) : shortName(member);
  const people = ranked.slice(0, limit);
  if (mine && !people.includes(mine)) people.push(mine);
  // Days left including today; for an upcoming challenge, days until it starts.
  const daysLeft = status === 'finished' ? 0 : Math.round((Date.parse(challenge.ends_on) - Date.parse(today)) / DAY) + 1;
  const startsIn = status === 'upcoming' ? Math.round((Date.parse(challenge.starts_on) - Date.parse(today)) / DAY) : 0;

  return {
    challenge: { ...challenge, status },
    today,
    days_left: daysLeft,
    starts_in: startsIn,
    participants: participants.length,
    active: ranked.length,
    total: ranked.reduce((sum, row) => sum + row.value, 0),
    departments: departmentRows,
    people: people.map((row) => ({
      rank: row.rank, member_id: viewer.lead ? row.member.id : null, name: nameFor(row.member),
      department: row.member.department_id ? departmentName.get(row.member.department_id) ?? null : null, value: row.value, me: row.member.id === viewer.memberId,
    })),
    me: viewer.memberId ? {
      participating: participants.some((member) => member.id === viewer.memberId),
      sharing: Boolean(ctx.member?.consent_at),
      rank: mine?.rank ?? null, value: mine?.value ?? 0,
    } : null,
    can_manage: viewer.hr,
  };
}
