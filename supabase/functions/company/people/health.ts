// Workspace health for Schood staff: a score from real signals (active learners, tests,
// seats, when HR was last here), a churn-risk list and usage week by week. Only counts:
// no person's learning detail reaches this page, and Schood English minutes count only
// from the later of joining and agreeing.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { ORG_COLUMNS } from '../handler.ts';
import { check, type Ctx, type OrgRow, type Route } from '../types.ts';
import { tashkentDay } from '../util.ts';
import { DAY, fetchAll } from './shared.ts';
import { loadOrg } from './staffshared.ts';

export const HEALTH_WINDOW_DAYS = 30;

export interface HealthSignals {
  /** People who can learn: active employees and managers, or those with a seat. */
  people: number;
  /** Of them, how many did anything in the last 30 days. */
  active_learners: number;
  seats_used: number;
  seats_limit: number;
  tests_used: number;
  tests_limit: number | null;
  /** Test attempts started in the last 30 days. */
  tests_recent: number;
  /** Last time an owner or HR admin was seen or changed something. */
  last_hr_at: string | null;
}

export type HealthBand = 'healthy' | 'watch' | 'at_risk';
export type HealthReason = 'no_learners' | 'few_learners' | 'seats_idle' | 'no_tests' | 'tests_idle' | 'hr_silent' | 'hr_never' | 'no_people' | 'contract_ending' | 'contract_ended';

/**
 * 0–100. Learners 40, tests 20, seats 20, HR 20. A pilot has no seats, so that part is left
 * out and the rest is scaled up: a pilot is not marked down for what it cannot have.
 */
export function healthScore(signals: HealthSignals, org: Pick<OrgRow, 'status' | 'contract_ends_at'>, now: Date): { score: number; band: HealthBand; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];
  let got = 0, possible = 0;

  possible += 40;
  if (!signals.people) reasons.push('no_people');
  else {
    const share = signals.active_learners / signals.people;
    got += Math.round(40 * Math.min(1, share / 0.6));
    if (signals.active_learners === 0) reasons.push('no_learners');
    else if (share < 0.25) reasons.push('few_learners');
  }

  possible += 20;
  if (signals.tests_recent > 0) got += 20;
  else if (signals.tests_used > 0) { got += 8; reasons.push('tests_idle'); }
  else reasons.push('no_tests');

  if (signals.seats_limit > 0) {
    possible += 20;
    const share = signals.seats_used / signals.seats_limit;
    got += Math.round(20 * Math.min(1, share / 0.7));
    if (share < 0.3) reasons.push('seats_idle');
  }

  possible += 20;
  if (!signals.last_hr_at) reasons.push('hr_never');
  else {
    const days = (now.getTime() - Date.parse(signals.last_hr_at)) / DAY;
    if (days <= 14) got += 20;
    else if (days <= 30) got += 10;
    else reasons.push('hr_silent');
  }

  if (org.contract_ends_at) {
    const left = (Date.parse(org.contract_ends_at) - now.getTime()) / DAY;
    if (left <= 0) reasons.push('contract_ended');
    else if (left <= 45) reasons.push('contract_ending');
  }
  const score = Math.round(got / possible * 100);
  return { score, band: score >= 70 ? 'healthy' : score >= 40 ? 'watch' : 'at_risk', reasons };
}

interface MemberBits { id: string; org_id: string; role: string; status: string; seat: boolean; consent_at: string | null; joined_at: string | null; last_seen_at: string | null; user_id: string | null }
interface ActivityBits { org_id: string; member_id: string | null; kind: string; minutes: number; created_at: string }

const MEMBER_BITS = 'id,org_id,role,status,seat,consent_at,joined_at,last_seen_at,user_id';
const isHrRole = (role: string) => (HR_ROLES as readonly string[]).includes(role);

/** Schood English rows count only once the person has both joined and agreed. */
export function countsForCompany(row: Pick<ActivityBits, 'kind' | 'created_at'>, member: Pick<MemberBits, 'joined_at' | 'consent_at'> | undefined): boolean {
  if (row.kind !== 'english') return true;
  if (!member?.consent_at || !member.joined_at) return false;
  const from = Math.max(Date.parse(member.joined_at), Date.parse(member.consent_at));
  return Date.parse(row.created_at) >= from;
}

/** Staff reports follow the same consent boundary as HR reports, including aggregates. */
function visibleActivity(row: ActivityBits, member: MemberBits | undefined): boolean {
  return Boolean(member && member.status !== 'removed' && member.consent_at && countsForCompany(row, member));
}

function signalsOf(org: OrgRow, members: MemberBits[], activity: ActivityBits[], testsRecent: number, lastAudit: string | null): HealthSignals {
  const here = members.filter((row) => row.status === 'active');
  const learners = here.filter((row) => row.seat || !isHrRole(row.role));
  const byId = new Map(members.map((row) => [row.id, row]));
  const active = new Set(activity.filter((row) => row.member_id && visibleActivity(row, byId.get(row.member_id))).map((row) => row.member_id));
  const seen = [lastAudit, ...here.filter((row) => isHrRole(row.role)).map((row) => row.last_seen_at)].filter((value): value is string => Boolean(value)).sort();
  return {
    people: learners.length, active_learners: learners.filter((row) => active.has(row.id)).length,
    seats_used: members.filter((row) => row.seat && row.status !== 'removed').length, seats_limit: org.seats_limit,
    tests_used: org.tests_used, tests_limit: org.tests_limit, tests_recent: testsRecent, last_hr_at: seen.at(-1) ?? null,
  };
}

/** Monday of a Tashkent day. */
function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY).toISOString().slice(0, 10);
}

/** Weekly counts for one workspace. Only company-visible rows; no names. */
export async function weeklyUsage(ctx: Ctx, orgId: string, weeks = 12) {
  const now = ctx.now(), first = weekStart(tashkentDay(new Date(now.getTime() - (weeks - 1) * 7 * DAY)));
  const since = new Date(`${first}T00:00:00+05:00`).toISOString();
  const members = await fetchAll<MemberBits>(() => ctx.db.from('company_members').select(MEMBER_BITS).eq('org_id', orgId).order('id'));
  const byId = new Map(members.map((row) => [row.id, row]));
  const activity = await fetchAll<ActivityBits>(() => ctx.db.from('company_activity').select('org_id,member_id,kind,minutes,created_at').eq('org_id', orgId).gte('created_at', since).order('created_at').order('id'), 100_000);
  const attempts = await fetchAll<{ started_at: string }>(() => ctx.db.from('company_attempts').select('started_at').eq('org_id', orgId).gte('started_at', since).order('started_at').order('id'));
  const out = Array.from({ length: weeks }, (_, index) => ({ week: new Date(Date.parse(`${first}T00:00:00Z`) + index * 7 * DAY).toISOString().slice(0, 10), learners: 0, minutes: 0, tests: 0 }));
  const slot = new Map(out.map((row) => [row.week, row]));
  const people = new Map(out.map((row) => [row.week, new Set<string>()]));
  for (const row of activity) {
    if (!visibleActivity(row, row.member_id ? byId.get(row.member_id) : undefined)) continue;
    const week = weekStart(tashkentDay(new Date(row.created_at)));
    const entry = slot.get(week);
    if (!entry) continue;
    entry.minutes += Number(row.minutes) || 0;
    if (row.member_id) people.get(week)!.add(row.member_id);
  }
  for (const row of attempts) {
    const entry = slot.get(weekStart(tashkentDay(new Date(row.started_at))));
    if (entry) entry.tests++;
  }
  for (const entry of out) entry.learners = people.get(entry.week)!.size;
  return out;
}

export async function healthData(ctx: Ctx) {
  const now = ctx.now(), since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * DAY).toISOString();
  const orgs = (await fetchAll<OrgRow>(() => ctx.db.from('company_orgs').select(ORG_COLUMNS).neq('status', 'closed').order('id')));
  const members = await fetchAll<MemberBits>(() => ctx.db.from('company_members').select(MEMBER_BITS).neq('status', 'removed').order('id'), 100_000);
  const activity = await fetchAll<ActivityBits>(() => ctx.db.from('company_activity').select('org_id,member_id,kind,minutes,created_at').gte('created_at', since).order('created_at').order('id'), 200_000);
  const attempts = await fetchAll<{ org_id: string }>(() => ctx.db.from('company_attempts').select('org_id').gte('started_at', since).order('id'), 100_000);
  // HR's own changes count as presence too: audit rows by owners and admins.
  const hrUsers = new Map<string, Set<string>>();
  for (const row of members) if (isHrRole(row.role) && row.user_id) (hrUsers.get(row.org_id) ?? hrUsers.set(row.org_id, new Set()).get(row.org_id)!).add(row.user_id);
  const audit = await fetchAll<{ org_id: string; actor: string | null; created_at: string }>(() => ctx.db.from('company_audit').select('org_id,actor,created_at').not('org_id', 'is', null).not('actor', 'is', null).gte('created_at', new Date(now.getTime() - 120 * DAY).toISOString()).order('created_at').order('id'), 100_000);
  const lastAudit = new Map<string, string>();
  for (const row of audit) if (hrUsers.get(row.org_id)?.has(row.actor!)) lastAudit.set(row.org_id, row.created_at);
  const rows = orgs.map((org) => {
    const signals = signalsOf(org, members.filter((row) => row.org_id === org.id), activity.filter((row) => row.org_id === org.id), attempts.filter((row) => row.org_id === org.id).length, lastAudit.get(org.id) ?? null);
    return { id: org.id, name: org.name, status: org.status, contract_ends_at: org.contract_ends_at, created_at: org.created_at, signals, ...healthScore(signals, org, now) };
  }).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const counts = { healthy: 0, watch: 0, at_risk: 0 };
  for (const row of rows) counts[row.band]++;
  // Worth a call: a real customer that is sliding. A brand-new workspace gets two weeks first.
  const churn_risk = rows.filter((row) => row.band === 'at_risk' && (row.status === 'active' || Date.parse(row.created_at) < now.getTime() - 14 * DAY));
  return { workspaces: rows, counts, churn_risk: churn_risk.map((row) => row.id) };
}

export const healthRoutes: Route[] = [
  {
    // Every live workspace with its score, worst first.
    method: 'GET', path: 'staff/health', access: 'staff',
    handle: (ctx) => healthData(ctx),
  },
  {
    method: 'GET', path: 'staff/orgs/:org/usage', access: 'staff',
    async handle(ctx, params) {
      const org = await loadOrg(ctx, params.org), now = ctx.now(), since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * DAY).toISOString();
      const members = await fetchAll<MemberBits>(() => ctx.db.from('company_members').select(MEMBER_BITS).eq('org_id', org.id).neq('status', 'removed').order('id'));
      const activity = await fetchAll<ActivityBits>(() => ctx.db.from('company_activity').select('org_id,member_id,kind,minutes,created_at').eq('org_id', org.id).gte('created_at', since).order('created_at').order('id'), 100_000);
      const { count, error } = await ctx.db.from('company_attempts').select('id', { count: 'exact', head: true }).eq('org_id', org.id).gte('started_at', since);
      if (error) throw new Error(error.message);
      const hr = new Set(members.filter((row) => isHrRole(row.role) && row.user_id).map((row) => row.user_id));
      const audit = check<{ actor: string | null; created_at: string }[]>(await ctx.db.from('company_audit').select('actor,created_at').eq('org_id', org.id).not('actor', 'is', null).order('created_at', { ascending: false }).limit(500));
      const lastAudit = audit.find((row) => hr.has(row.actor))?.created_at ?? null;
      const signals = signalsOf(org, members, activity, count ?? 0, lastAudit);
      return { signals, ...healthScore(signals, org, now), weeks: await weeklyUsage(ctx, org.id) };
    },
  },
];
