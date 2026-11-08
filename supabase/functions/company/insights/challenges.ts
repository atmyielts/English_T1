// Team challenges: HR sets a goal window and a metric (points, minutes, lessons or
// active days) for everyone, chosen departments or teams of departments; standings
// come from company_activity and count only people who share their progress. When a
// challenge finishes its standings are frozen, so winners stay winners.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, obj, oneOf, text } from '../util.ts';
import { activitySummary, addDays, canSee, dayStart, DAY, displayName, fetchAll, isDate, isLearner, localDate, shortName, viewerOf, type Viewer } from './common.ts';

export const METRICS = ['points', 'minutes', 'lessons', 'active_days'] as const;
export type Metric = (typeof METRICS)[number];
export const MAX_CHALLENGE_DAYS = 92;
export const MODES = ['individual', 'teams'] as const;
export type Mode = (typeof MODES)[number];
/** Ready-made starting points; the page fills the form from these and keeps the code on the row. */
export const TEMPLATES = ['habit_30', 'minutes_marathon', 'lesson_sprint', 'department_cup'] as const;
const MAX_TEAMS = 8;
/** Finished challenges frozen per page view, so one read of the list stays quick. */
const FINISH_PER_READ = 5;

export interface Team { id: string; name: string; department_ids: string[] }
interface GroupStanding { id: string; name: string; participants: number; active: number; total: number; average: number; rank: number }
export interface FinalResults {
  finished_at: string; participants: number; active: number; total: number;
  /** department_id is the person's department at freeze time; results frozen before it was kept lack it. */
  people: { member_id: string; value: number; rank: number; department_id?: string | null }[];
  departments: GroupStanding[]; teams: GroupStanding[];
}

export interface ChallengeRow {
  id: string; org_id: string; title: string; description: string | null; metric: Metric; starts_on: string; ends_on: string;
  department_ids: string[]; ended_at: string | null; created_by: string | null; created_at: string; updated_at: string;
  template: string | null; mode: Mode; teams: Team[]; prize: string | null; final_results: FinalResults | null; finished_at: string | null;
}
const COLUMNS = 'id,org_id,title,description,metric,starts_on,ends_on,department_ids,ended_at,created_by,created_at,updated_at,template,mode,teams,prize,final_results,finished_at';

const normal = (row: ChallengeRow): ChallengeRow => ({ ...row, department_ids: row.department_ids ?? [], teams: row.teams ?? [], mode: row.mode ?? 'individual' });
/** What clients get: the frozen results are read through standings, where names follow the viewer's rights. */
function outward(row: ChallengeRow) {
  const { final_results: _final, ...rest } = normal(row);
  return rest;
}

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
  return normal(row);
}

/** Teams of departments: at least two, each department in one team at most. Returns the departments the challenge covers too. */
async function teamsInput(ctx: Ctx, value: unknown): Promise<{ teams: Team[]; department_ids: string[] }> {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_TEAMS) throw new CompanyError('invalid_field', `Choose 2 to ${MAX_TEAMS} teams.`, 400, { field: 'teams' });
  const seen = new Set<string>();
  const teams = value.map((entry, index) => {
    const input = obj(entry);
    const ids = input.department_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) throw new CompanyError('invalid_field', 'Each team needs at least one department.', 400, { field: 'teams' });
    for (const id of ids as string[]) {
      if (seen.has(id)) throw new CompanyError('invalid_field', 'A department can be in one team only.', 400, { field: 'teams' });
      seen.add(id);
    }
    return { id: `team-${index + 1}`, name: text(input.name, 'team name', { min: 1, max: 60 })!, department_ids: [...new Set(ids as string[])] };
  });
  const all = [...seen];
  const found = check<{ id: string }[]>(await ctx.db.from('company_departments').select('id').eq('org_id', ctx.org!.id).in('id', all));
  if (found.length !== all.length) throw new CompanyError('invalid_field', 'Choose departments of this workspace.', 400, { field: 'teams' });
  return { teams, department_ids: all };
}

const templateInput = (value: unknown): string | null => value === undefined || value === null || value === '' ? null : oneOf(value, TEMPLATES, 'template');

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
      await finishDue(ctx, rows.map(normal), today);
      const order = { running: 0, upcoming: 1, finished: 2 };
      const challenges = rows.map(outward)
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
      const mode = oneOf<Mode>(input.mode, MODES, 'mode', 'individual');
      const audience = mode === 'teams' ? await teamsInput(ctx, input.teams) : { teams: [] as Team[], department_ids: await departmentIds(ctx, input.department_ids) };
      const row = check<ChallengeRow>(await ctx.db.from('company_challenges').insert({
        org_id: ctx.org!.id,
        title: text(input.title, 'title', { min: 2, max: 120 }),
        description: text(input.description, 'description', { max: 600, optional: true }),
        metric: oneOf<Metric>(input.metric, METRICS, 'metric', 'points'),
        ...dates(input, null, today),
        ...audience,
        mode,
        template: templateInput(input.template),
        prize: text(input.prize, 'prize', { max: 200, optional: true }),
        created_by: ctx.user,
      }).select(COLUMNS).single());
      await ctx.audit('challenge.created', row.id, { title: row.title, metric: row.metric, mode });
      return { challenge: { ...outward(row), status: challengeStatus(row, today) } };
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
      if (input.prize !== undefined) patch.prize = text(input.prize, 'prize', { max: 200, optional: true });
      const changesRules = input.metric !== undefined || input.starts_on !== undefined || input.ends_on !== undefined || input.department_ids !== undefined || input.teams !== undefined;
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
        if (current.mode === 'teams') {
          if (input.teams !== undefined) {
            if (status === 'running') throw new CompanyError('challenge_running', 'Teams cannot change once the challenge has started.', 409, { field: 'teams' });
            Object.assign(patch, await teamsInput(ctx, input.teams));
          }
        } else if (input.department_ids !== undefined) patch.department_ids = await departmentIds(ctx, input.department_ids);
      }
      if (!Object.keys(patch).length) return { challenge: { ...outward(current), status } };
      const row = check<ChallengeRow>(await ctx.db.from('company_challenges').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('challenge.updated', row.id, { fields: Object.keys(patch) });
      return { challenge: { ...outward(row), status: challengeStatus(row, today) } };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/challenges/:challenge/end', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await load(ctx, params.challenge), today = localDate(ctx.now());
      if (current.ended_at) return { challenge: { ...outward(current), status: 'finished' } };
      if (challengeStatus(current, today) === 'upcoming') throw new CompanyError('challenge_not_started', 'This challenge has not started. Delete it instead.', 409);
      const row = check<ChallengeRow>(await ctx.db.from('company_challenges').update({ ended_at: ctx.now().toISOString(), ends_on: current.ends_on < today ? current.ends_on : today })
        .eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('challenge.ended', row.id);
      return { challenge: { ...outward(row), status: 'finished' } };
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
    // Before :challenge, which would otherwise take this path.
    method: 'GET', path: 'orgs/:org/challenges/winners', access: 'org', allowSuspended: true,
    async handle(ctx) {
      return await winners(ctx);
    },
  },
  {
    method: 'GET', path: 'orgs/:org/challenges/:challenge', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      return await standings(ctx, await load(ctx, params.challenge));
    },
  },
];

type Totals = { points: number; minutes: number; lessons: number; days: number };
const valueOf = (metric: Metric, totals: Totals | undefined) => !totals ? 0 : metric === 'active_days' ? totals.days : totals[metric];

/** Ranks groups by what each person in them did on average, so a big department has no head start. */
function rankGroups(groups: { id: string; name: string; people: MemberRow[] }[], metric: Metric, totals: Map<string, Totals>): GroupStanding[] {
  return rank(groups.map(({ id, name, people }) => {
    const total = people.reduce((sum, member) => sum + valueOf(metric, totals.get(member.id)), 0);
    return { id, name, participants: people.length, active: people.filter((member) => valueOf(metric, totals.get(member.id)) > 0).length, total, average: people.length ? Math.round(total / people.length * 10) / 10 : 0 };
  }), (row) => row.average * 1e6 + row.total);
}

/** The numbers of a challenge as they stand now. */
async function measure(ctx: Ctx, challenge: ChallengeRow) {
  const today = localDate(ctx.now()), org = ctx.org!;
  const [members, departments] = await Promise.all([
    fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('status', 'active').order('id')),
    check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name')),
  ]);
  const scoped = challenge.department_ids.length ? departments.filter((entry) => challenge.department_ids.includes(entry.id)) : departments;
  const inScope = (member: MemberRow) => !challenge.department_ids.length || (member.department_id !== null && challenge.department_ids.includes(member.department_id));
  // Participants share their progress with the company; others are not counted.
  // Owners and HR admins who run the workspace count only once they have learned.
  const sharing = members.filter((member) => inScope(member) && member.consent_at);
  const status = challengeStatus(challenge, today);
  const { start, end } = challengeWindow(challenge);
  const summary = status === 'upcoming' ? { members: [] } : await activitySummary(ctx.db, org.id, start, new Date(Math.min(end.getTime(), ctx.now().getTime() + 1)), sharing.map((member) => member.id));
  const totals = new Map(summary.members.map((row) => [row.member_id, row]));
  const participants = sharing.filter((member) => isLearner(member) || valueOf(challenge.metric, totals.get(member.id)) > 0);
  const departmentRows = rankGroups(scoped.map((entry) => ({ id: entry.id, name: entry.name, people: participants.filter((member) => member.department_id === entry.id) })), challenge.metric, totals);
  const teamRows = challenge.mode === 'teams'
    ? rankGroups(challenge.teams.map((team) => ({ id: team.id, name: team.name, people: participants.filter((member) => member.department_id !== null && team.department_ids.includes(member.department_id)) })), challenge.metric, totals)
    : [];
  const ranked = rank(participants.map((member) => ({ member, value: valueOf(challenge.metric, totals.get(member.id)) })).filter((row) => row.value > 0), (row) => row.value);
  return { members, departments, participants, status, departmentRows, teamRows, ranked };
}

/** Freezes a finished challenge once. Of two simultaneous reads, the first write wins and the second changes nothing. */
async function finish(ctx: Ctx, challenge: ChallengeRow): Promise<FinalResults> {
  const { participants, departmentRows, teamRows, ranked } = await measure(ctx, challenge);
  const final: FinalResults = {
    finished_at: ctx.now().toISOString(), participants: participants.length, active: ranked.length, total: ranked.reduce((sum, row) => sum + row.value, 0),
    people: ranked.slice(0, 500).map((row) => ({ member_id: row.member.id, value: row.value, rank: row.rank, department_id: row.member.department_id })),
    departments: departmentRows, teams: teamRows,
  };
  const { error } = await ctx.db.from('company_challenges').update({ final_results: final, finished_at: final.finished_at }).eq('id', challenge.id).eq('org_id', ctx.org!.id).is('final_results', null);
  if (error) console.error(JSON.stringify({ company_insights: 'challenge_finish_failed', error: error.message }));
  return final;
}

/**
 * A frozen result without one person's numbers, for when their learning is erased: they leave
 * the ranking, and their value comes off the totals of the challenge and of the department and
 * team they were in when it froze. A result frozen before that department was recorded keeps its
 * group totals, rather than taking from a group the person may never have been in. Null when they
 * were not in it.
 */
export function withoutMember(final: FinalResults, member: { id: string }, teams: Team[]): FinalResults | null {
  const row = final.people.find((person) => person.member_id === member.id);
  if (!row) return null;
  const value = row.value;
  const people = rank(final.people.filter((person) => person.member_id !== member.id).map(({ rank: _rank, ...person }) => person), (person) => person.value);
  const regroup = (groups: GroupStanding[], has: (group: Omit<GroupStanding, 'rank'>) => boolean) => rank(groups.map(({ rank: _rank, ...group }): Omit<GroupStanding, 'rank'> => {
    if (!has(group)) return group;
    const total = Math.max(0, group.total - value);
    return { ...group, total, active: Math.max(0, group.active - (value > 0 ? 1 : 0)), average: group.participants ? Math.round(total / group.participants * 10) / 10 : 0 };
  }), (group) => group.average * 1e6 + group.total);
  // undefined: frozen before departments were recorded, so no group is adjusted.
  const department = row.department_id;
  const teamIds = new Set(teams.filter((team) => typeof department === 'string' && team.department_ids.includes(department)).map((team) => team.id));
  return {
    ...final, people, total: Math.max(0, final.total - value), active: Math.max(0, final.active - (value > 0 ? 1 : 0)),
    departments: regroup(final.departments ?? [], (group) => typeof department === 'string' && group.id === department),
    teams: regroup(final.teams ?? [], (group) => teamIds.has(group.id)),
  };
}

/** Auto-finish: challenges that passed their end date get their winners when anyone next looks. */
async function finishDue(ctx: Ctx, rows: ChallengeRow[], today: string): Promise<void> {
  const due = rows.filter((row) => !row.final_results && challengeStatus(row, today) === 'finished').slice(0, FINISH_PER_READ);
  for (const row of due) row.final_results = await finish(ctx, row);
}

async function standings(ctx: Ctx, challenge: ChallengeRow) {
  const viewer = viewerOf(ctx), today = localDate(ctx.now());
  const status = challengeStatus(challenge, today);
  const measured = await measure(ctx, challenge);
  const { members, departments, participants } = measured;
  const departmentName = new Map(departments.map((entry) => [entry.id, entry.name]));
  const final = status === 'finished' ? challenge.final_results ?? await finish(ctx, challenge) : null;
  const memberById = new Map(members.map((member) => [member.id, member]));
  // Frozen rows name someone only while they are still here and still sharing.
  const ranked: { member: MemberRow | null; value: number; rank: number }[] = final
    ? final.people.map((row) => ({ member: memberById.get(row.member_id) ?? null, value: row.value, rank: row.rank }))
    : measured.ranked;
  const departmentRows = final ? final.departments : measured.departmentRows;
  const teamRows = final ? final.teams : measured.teamRows;
  const mine = ranked.find((row) => row.member?.id === viewer.memberId) ?? null;
  const limit = viewer.hr ? 200 : viewer.manager ? 20 : 10;
  const nameFor = (member: MemberRow | null) => !member || !member.consent_at ? null : viewer.hr || (viewer.manager && member.department_id === viewer.departmentId) || member.id === viewer.memberId ? displayName(member) : shortName(member);
  const people = ranked.slice(0, limit);
  if (mine && !people.includes(mine)) people.push(mine);
  // Days left including today; for an upcoming challenge, days until it starts.
  const daysLeft = status === 'finished' ? 0 : Math.round((Date.parse(challenge.ends_on) - Date.parse(today)) / DAY) + 1;
  const startsIn = status === 'upcoming' ? Math.round((Date.parse(challenge.starts_on) - Date.parse(today)) / DAY) : 0;

  return {
    challenge: { ...outward(challenge), status },
    today,
    days_left: daysLeft,
    starts_in: startsIn,
    participants: final ? final.participants : participants.length,
    active: final ? final.active : ranked.length,
    total: final ? final.total : ranked.reduce((sum, row) => sum + row.value, 0),
    frozen_at: final?.finished_at ?? null,
    departments: departmentRows,
    teams: teamRows,
    people: people.map((row) => ({
      rank: row.rank, member_id: row.member && viewer.lead && canSee(viewer, row.member) ? row.member.id : null, name: nameFor(row.member),
      department: row.member?.department_id ? departmentName.get(row.member.department_id) ?? null : null, value: row.value, me: Boolean(row.member && row.member.id === viewer.memberId),
    })),
    me: viewer.memberId ? {
      participating: participants.some((member) => member.id === viewer.memberId),
      sharing: Boolean(ctx.member?.consent_at),
      rank: mine?.rank ?? null, value: mine?.value ?? 0,
    } : null,
    can_manage: viewer.hr,
  };
}

/** The winners page: every finished challenge the viewer may see, newest first. */
async function winners(ctx: Ctx) {
  const viewer = viewerOf(ctx), today = localDate(ctx.now()), org = ctx.org!;
  const rows = check<ChallengeRow[]>(await ctx.db.from('company_challenges').select(COLUMNS).eq('org_id', org.id).order('ends_on', { ascending: false }).limit(200)).map(normal)
    .filter((row) => challengeStatus(row, today) === 'finished' && visibleChallenge(row, viewer, ctx.member));
  await finishDue(ctx, rows, today);
  const shown = rows.filter((row) => row.final_results).slice(0, 24);
  const wanted = [...new Set(shown.flatMap((row) => row.final_results!.people.filter((person) => person.rank <= 3).map((person) => person.member_id)))];
  const members = await inChunks(wanted, (chunk) => fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('status', 'active').in('id', chunk).order('id')));
  const byId = new Map(members.map((member) => [member.id, member]));
  const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id));
  const departmentName = new Map(departments.map((entry) => [entry.id, entry.name]));
  const nameFor = (member: MemberRow | undefined) => !member || !member.consent_at ? null : viewer.hr || (viewer.manager && member.department_id === viewer.departmentId) || member.id === viewer.memberId ? displayName(member) : shortName(member);
  return {
    can_manage: viewer.hr,
    winners: shown.map((row) => {
      const final = row.final_results!;
      return {
        id: row.id, title: row.title, metric: row.metric, mode: row.mode, starts_on: row.starts_on, ends_on: row.ends_on, prize: row.prize,
        participants: final.participants, active: final.active, total: final.total,
        team: final.teams.find((entry) => entry.rank === 1 && entry.total > 0) ?? null,
        department: final.departments.find((entry) => entry.rank === 1 && entry.total > 0) ?? null,
        top: final.people.filter((person) => person.rank <= 3).slice(0, 5).map((person) => {
          const member = byId.get(person.member_id);
          return { rank: person.rank, name: nameFor(member), department: member?.department_id ? departmentName.get(member.department_id) ?? null : null, value: person.value, me: person.member_id === viewer.memberId };
        }),
      };
    }),
  };
}
