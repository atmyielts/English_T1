// The workspace overview (/w/:org): KPIs, level map, departments, monthly level
// trend, weekly activity, things to do, and plan usage with a seats request.
import { HR_ROLES, isLevel, LEAD_ROLES, type Level } from '../../../../packages/company-core/src/mod.ts';
import { check, type Ctx, type MemberRow, type Route } from '../types.ts';
import { int, obj, text } from '../util.ts';
import {
  activitySummary, addDays, averageScore, dayStart, displayName, emptyLevels, fetchAll, gradedStaffAttempts, isLearner, levelsAt,
  loadScope, localDate, meetsTarget, memberScore, monthOf, sharingIds, weekOf, type LevelCounts, type Viewer,
} from './common.ts';
import { visibleChallenge, type ChallengeRow } from './challenges.ts';
import { invited, type SessionRow } from './sessions.ts';

export interface AssignmentRow { id: string; track_code: string | null; target_level: string | null; due_date: string | null; department_id: string | null; member_id: string | null; status: string; note: string | null; created_at: string }

/** Assignments that concern the viewer's people: a manager sees their department's and their people's. */
export function assignmentsInScope(rows: AssignmentRow[], viewer: Viewer, members: MemberRow[]): AssignmentRow[] {
  if (viewer.hr) return rows;
  const ids = new Set(members.map((member) => member.id));
  return rows.filter((row) => (row.department_id && row.department_id === viewer.departmentId) || (row.member_id && ids.has(row.member_id)));
}

/** Contact details Schood staff put on the workspace (settings.schood_contact_email / _phone). */
export function schoodContact(settings: Record<string, unknown>): { email: string | null; phone: string | null } {
  const email = typeof settings?.schood_contact_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.schood_contact_email) ? settings.schood_contact_email : null;
  const phone = typeof settings?.schood_contact_phone === 'string' && /^\+?[\d\s()-]{5,25}$/.test(settings.schood_contact_phone) ? settings.schood_contact_phone.trim() : null;
  return { email, phone };
}

/** Reads one of this area's own tables; empty when its migration is not applied yet. */
export async function optional<T>(read: () => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>, fallback: T): Promise<T> {
  try {
    const { data, error } = await read();
    if (error) {
      console.error(JSON.stringify({ company_insights: 'optional_read_failed', error: error.message }));
      return fallback;
    }
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

const SEATS_SOURCE = 'company_seats';

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/overview', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      return await overview(ctx);
    },
  },
  {
    // "Talk to Schood about seats": a request in the Schood sales pipeline, at most once a day.
    method: 'POST', path: 'orgs/:org/insights/seats-request', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, _params, body) {
      const org = ctx.org!;
      const input = obj(body ?? {});
      const seats = int(input.seats, 'seats', { min: 1, max: 100_000, optional: true });
      const message = text(input.message, 'message', { max: 1000, optional: true });
      const phone = text(input.phone, 'phone', { max: 40, optional: true });
      const since = new Date(ctx.now().getTime() - 86_400_000).toISOString();
      const recent = check<{ id: string; created_at: string }[]>(await ctx.db.from('company_leads').select('id,created_at').eq('org_id', org.id).eq('source', SEATS_SOURCE).gte('created_at', since).limit(1));
      if (recent.length) return { requested_at: recent[0].created_at, duplicate: true };
      const name = (ctx.member?.full_name || ctx.email || 'HR').slice(0, 120);
      const need = [`Learning seats for workspace "${org.name}" (${org.status}).`, seats ? `Seats wanted: ${seats}.` : null, message].filter(Boolean).join('\n').slice(0, 2000);
      const lead = check<{ id: string; created_at: string }>(await ctx.db.from('company_leads').insert({
        name, company: org.name.slice(0, 160), phone: phone ?? org.contact_phone, email: ctx.email ?? org.billing_email, size_band: org.size_band, industry: org.industry,
        need, locale: typeof org.settings?.locale === 'string' ? org.settings.locale : null, status: 'new', org_id: org.id, source: SEATS_SOURCE, ip_hash: ctx.ipHash,
      }).select('id,created_at').single());
      await ctx.audit('insights.seats_requested', lead.id, { seats });
      return { requested_at: lead.created_at, duplicate: false };
    },
  },
];

async function overview(ctx: Ctx) {
  const org = ctx.org!, now = ctx.now(), today = localDate(now);
  const { viewer, members, departments, department } = await loadScope(ctx);
  const active = members.filter((member) => member.status === 'active');
  const learners = active.filter(isLearner);
  const scopeIds = new Set(members.map((member) => member.id));
  const sharing = sharingIds(active);
  const tomorrow = dayStart(addDays(today, 1));
  const monthStart = dayStart(monthOf(today));
  const firstWeek = addDays(weekOf(today), -7 * 7);

  const [last30, last7, month, weekly, attempts, assignmentRows, candidates, waiting, sessions, challenges, seatsLead] = await Promise.all([
    activitySummary(ctx.db, org.id, dayStart(addDays(today, -29)), tomorrow, sharing),
    activitySummary(ctx.db, org.id, dayStart(addDays(today, -6)), tomorrow, sharing),
    activitySummary(ctx.db, org.id, monthStart, tomorrow, sharing),
    activitySummary(ctx.db, org.id, dayStart(firstWeek), tomorrow, sharing),
    gradedStaffAttempts(ctx.db, org.id),
    fetchAll<AssignmentRow>(() => ctx.db.from('company_assignments').select('id,track_code,target_level,due_date,department_id,member_id,status,note,created_at').eq('org_id', org.id).eq('status', 'active').order('id'), 5000),
    viewer.hr ? ctx.db.from('company_attempts').select('id', { count: 'exact', head: true }).eq('org_id', org.id).is('member_id', null).eq('status', 'graded').gte('graded_at', monthStart.toISOString()) : null,
    viewer.hr ? ctx.db.from('company_attempts').select('id', { count: 'exact', head: true }).eq('org_id', org.id).is('member_id', null).eq('status', 'graded').is('decision', null) : null,
    optional<SessionRow[]>(() => ctx.db.from('company_sessions').select('*').eq('org_id', org.id).eq('status', 'scheduled').gte('starts_at', new Date(now.getTime() - 8 * 3_600_000).toISOString()).order('starts_at').limit(50), []),
    optional<ChallengeRow[]>(() => ctx.db.from('company_challenges').select('*').eq('org_id', org.id).is('ended_at', null).gte('ends_on', today).order('starts_on').limit(20), []),
    viewer.hr ? optional<{ created_at: string }[]>(() => ctx.db.from('company_leads').select('created_at').eq('org_id', org.id).eq('source', SEATS_SOURCE).order('created_at', { ascending: false }).limit(1), []) : [],
  ]);

  const staffAttempts = attempts.filter((attempt) => attempt.member_id && scopeIds.has(attempt.member_id));
  const activeIn = (summary: typeof last30) => new Set(summary.members.filter((row) => row.events > 0).map((row) => row.member_id));
  const active30 = activeIn(last30), active7 = activeIn(last7);
  const by30 = new Map(last30.members.map((row) => [row.member_id, row]));

  // Current level map: everyone with a level, plus learners not tested yet.
  const levels: LevelCounts = emptyLevels();
  for (const member of active) {
    if (isLevel(member.level)) levels[member.level] += 1;
    else if (isLearner(member)) levels.none += 1;
  }
  const withTarget = active.filter((member) => isLevel(member.target_level));
  const atTarget = withTarget.filter((member) => meetsTarget(member.level, member.target_level));
  const average = averageScore(active.filter((member) => isLevel(member.level)).map(memberScore));

  // Departments (HR also gets a "no department" row when some people have none).
  const groups: { id: string | null; name: string | null }[] = departments.map((entry) => ({ id: entry.id, name: entry.name }));
  if (viewer.hr && active.some((member) => !member.department_id)) groups.push({ id: null, name: null });
  const departmentRows = groups.map((group) => {
    const people = active.filter((member) => (member.department_id ?? null) === group.id);
    const targeted = people.filter((member) => isLevel(member.target_level));
    const avg = averageScore(people.filter((member) => isLevel(member.level)).map(memberScore));
    return {
      id: group.id, name: group.name, people: people.length, tested: people.filter((member) => isLevel(member.level)).length,
      sharing: people.filter((member) => member.consent_at).length, seats: people.filter((member) => member.seat).length,
      avg_score: avg.score, avg_level: avg.level, with_target: targeted.length, at_target: targeted.filter((member) => meetsTarget(member.level, member.target_level)).length,
      active30: people.filter((member) => active30.has(member.id)).length,
      minutes30: people.reduce((sum, member) => sum + (by30.get(member.id)?.minutes ?? 0), 0),
    };
  });

  // Level trend: everyone's latest graded result at the end of each of the last six months.
  const trend = [];
  for (let offset = -5; offset <= 0; offset++) {
    const monthDate = monthOf(today, offset);
    const end = offset === 0 ? now : dayStart(monthOf(today, offset + 1));
    const latest = levelsAt(staffAttempts, end);
    const counts = emptyLevels();
    for (const attempt of latest.values()) counts[attempt.overall_level as Level] += 1;
    const graded = staffAttempts.filter((attempt) => Date.parse(attempt.graded_at!) >= dayStart(monthDate).getTime() && Date.parse(attempt.graded_at!) < end.getTime()).length;
    trend.push({ month: monthDate.slice(0, 7), tested: latest.size, graded, counts, avg: averageScore([...latest.values()].map((attempt) => attempt.overall_score)) });
  }

  const weeks = [];
  for (let index = 0; index < 8; index++) {
    const week = addDays(firstWeek, index * 7);
    const found = weekly.weeks.find((row) => row.week === week);
    weeks.push({ week, minutes: found?.minutes ?? 0, learners: found?.learners ?? 0, events: found?.events ?? 0 });
  }

  // Things to do.
  const assignments = assignmentsInScope(assignmentRows, viewer, members);
  const overdue = assignments.filter((row) => row.due_date && row.due_date < today);
  const untested = learners.filter((member) => !isLevel(member.level));
  const notSharing = learners.filter((member) => !member.consent_at);
  const pending = members.filter((member) => member.status === 'invited');
  const soon = learners.filter((member) => member.target_date && member.target_date >= today && member.target_date <= addDays(today, 30) && isLevel(member.target_level) && !meetsTarget(member.level, member.target_level));
  const unseated = learners.filter((member) => !member.seat);
  const seatsUsed = active.filter((member) => member.seat).length;
  const seatsFree = Math.max(0, org.seats_limit - (viewer.hr ? seatsUsed : 0));
  const pick = (list: MemberRow[]) => list.slice(0, 5).map((member) => ({ id: member.id, name: displayName(member) }));
  const todo = [
    untested.length && { kind: 'no_placement', count: untested.length, people: pick(untested) },
    overdue.length && { kind: 'overdue_assignments', count: overdue.length },
    viewer.hr && (waiting?.count ?? 0) > 0 && { kind: 'candidates_waiting', count: waiting!.count },
    soon.length && { kind: 'target_soon', count: soon.length, people: pick(soon) },
    notSharing.length && { kind: 'no_consent', count: notSharing.length },
    viewer.hr && pending.length && { kind: 'invites_pending', count: pending.length },
    viewer.hr && org.status === 'active' && seatsFree > 0 && unseated.length && { kind: 'seats_free', count: Math.min(seatsFree, unseated.length) },
  ].filter(Boolean);

  const visibleSessions = sessions.filter((session) => Date.parse(session.starts_at) + session.duration_minutes * 60_000 > now.getTime() && invited(session, viewer, ctx.member));
  const challenge = challenges.find((row) => row.starts_on <= today && visibleChallenge(row, viewer, ctx.member)) ?? null;

  const staffGradedMonth = staffAttempts.filter((attempt) => Date.parse(attempt.graded_at!) >= monthStart.getTime()).length;
  return {
    generated_at: now.toISOString(),
    today,
    scope: { department, unassigned: viewer.manager && !viewer.departmentId },
    kpis: {
      people: active.length, learners: learners.length, invited: pending.length, sharing: sharing.length,
      tested: active.filter((member) => isLevel(member.level)).length,
      active7: active7.size, active30: active30.size,
      minutes_month: month.members.reduce((sum, row) => sum + row.minutes, 0),
      lessons_month: month.members.reduce((sum, row) => sum + row.lessons, 0),
      tests_month: staffGradedMonth + (candidates?.count ?? 0),
      candidates_month: candidates?.count ?? 0,
      avg_score: average.score, avg_level: average.level,
      with_target: withTarget.length, at_target: atTarget.length,
      seats: seatsUsed,
    },
    levels,
    departments: departmentRows,
    trend,
    weeks,
    kinds: last30.kinds,
    todo,
    next_session: visibleSessions[0] ? { id: visibleSessions[0].id, title: visibleSessions[0].title, starts_at: visibleSessions[0].starts_at, duration_minutes: visibleSessions[0].duration_minutes, kind: visibleSessions[0].kind } : null,
    upcoming_sessions: visibleSessions.length,
    challenge: challenge ? { id: challenge.id, title: challenge.title, metric: challenge.metric, starts_on: challenge.starts_on, ends_on: challenge.ends_on } : null,
    usage: viewer.hr ? { status: org.status, tests_used: org.tests_used, tests_limit: org.tests_limit, seats_used: seatsUsed, seats_limit: org.seats_limit, contract_ends_at: org.contract_ends_at } : null,
    contact: viewer.hr ? schoodContact(org.settings ?? {}) : null,
    seats_requested_at: seatsLead[0]?.created_at ?? null,
  };
}
