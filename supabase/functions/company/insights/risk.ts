// At-risk learners: rules anyone can read, each with a suggested action. A lead can
// copy a nudge to send themselves (nothing is sent from here), HR can assign a track
// in one click, and either can snooze someone they are already looking after.
//   no_placement, falling_score, behind_requirement: company tests, visible without consent.
//   inactive, behind_assignment (lessons): learning detail, so only with consent and a working seat.
import { HR_ROLES, isLevel, LEAD_ROLES, levelIndex, type Level } from '../../../../packages/company-core/src/mod.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { appliesTo, ASSIGNMENT_COLUMNS, type AssignmentRow } from '../training/assignments.ts';
import { seatBlock } from '../training/shared.ts';
import { findTrack } from '../training/tracks/index.ts';
import { inChunks, int, isCalendarDate, obj, oneOf } from '../util.ts';
import { activitySummary, addDays, csv, DAY, dayStart, displayName, fetchAll, localDate, type Department } from './common.ts';
import { loadFramework, type AttemptWithSkills, type Standing } from './framework.ts';

export const REASONS = ['no_placement', 'inactive', 'behind_assignment', 'falling_score', 'behind_requirement'] as const;
export type Reason = (typeof REASONS)[number];
const FALLING_POINTS = 5;
/** Lessons this far behind the even pace to the due date count as behind. */
const PACE_MARGIN = 0.25;
const LOOKBACK_DAYS = 180;

export interface RiskRow {
  member_id: string; name: string; department: string | null; job_role: string; level: Level | null; seat: boolean; shares: boolean;
  reasons: { code: Reason; days?: number; capped?: boolean; assignment_id?: string; track_code?: string | null; due_date?: string | null; done?: number; total?: number; from_score?: number | null; to_score?: number | null; want?: Level }[];
  suggestion: { action: 'placement' | 'assign' | 'nudge'; track_code: string | null; target_level: Level | null; due_date: string | null };
  last_nudge: string | null; last_assign: string | null; snoozed_until: string | null;
}

interface ActionRow { member_id: string; kind: 'assign' | 'nudge' | 'snooze'; day: string; until: string | null; created_at?: string }

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The drop between someone's last two company tests, when it is large enough to mention. */
function falling(attempts: AttemptWithSkills[]): { from_score: number | null; to_score: number | null } | null {
  if (attempts.length < 2) return null;
  const last = attempts[attempts.length - 1], previous = attempts[attempts.length - 2];
  const levelDrop = isLevel(last.overall_level) && isLevel(previous.overall_level) && levelIndex(last.overall_level) < levelIndex(previous.overall_level);
  const from = previous.overall_score === null ? null : Number(previous.overall_score), to = last.overall_score === null ? null : Number(last.overall_score);
  if (levelDrop || (from !== null && to !== null && from - to >= FALLING_POINTS)) return { from_score: from, to_score: to };
  return null;
}

/** Everyone at risk in the viewer's scope (or in one department), most reasons first. */
export async function riskList(ctx: Ctx, options: { inactiveDays: number; department?: string | null; includeSnoozed?: boolean }) {
  const org = ctx.org!;
  const { today, viewer, learners: all, attempts, standings, departments, department } = await loadFramework(ctx);
  const learners = options.department ? all.filter((member) => member.department_id === options.department) : all;
  const names = new Map(departments.map((entry: Department) => [entry.id, entry.name]));
  const history = new Map<string, AttemptWithSkills[]>();
  for (const attempt of attempts) history.set(attempt.member_id!, [...(history.get(attempt.member_id!) ?? []), attempt]);

  // Learning signals apply only to people who agreed to share and have a working seat.
  const tracked = learners.filter((member) => member.consent_at && seatBlock(ctx, member) === null);
  const trackedIds = tracked.map((member) => member.id);
  const windowStart = dayStart(addDays(today, -LOOKBACK_DAYS));
  const [summary, assignments, progress, actions] = await Promise.all([
    trackedIds.length ? activitySummary(ctx.db, org.id, windowStart, new Date(ctx.now().getTime() + 1), trackedIds) : { members: [] as { member_id: string; last_at: string | null }[] },
    fetchAll<AssignmentRow>(() => ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('org_id', org.id).eq('status', 'active').order('id'), 5000),
    inChunks(trackedIds, (chunk) => fetchAll<{ member_id: string; lesson_code: string }>(() => ctx.db.from('company_lesson_progress').select('member_id,lesson_code').eq('org_id', org.id).eq('status', 'completed').in('member_id', chunk).order('id'), 50_000)),
    fetchAll<ActionRow>(() => ctx.db.from('company_risk_actions').select('member_id,kind,day,until').eq('org_id', org.id).gte('day', addDays(today, -LOOKBACK_DAYS)).order('id'), 20_000),
  ]);
  const lastActive = new Map(summary.members.map((row) => [row.member_id, row.last_at]));
  const completed = new Set(progress.map((row) => `${row.member_id}:${row.lesson_code}`));
  const lastAction = (id: string, kind: ActionRow['kind']) => actions.filter((row) => row.member_id === id && row.kind === kind).map((row) => row.day).sort().pop() ?? null;

  const out: RiskRow[] = [];
  for (const member of learners) {
    const standing = standings.get(member.id) as Standing;
    const reasons: RiskRow['reasons'] = [];
    const isTracked = Boolean(member.consent_at && seatBlock(ctx, member) === null);

    if (!isLevel(member.level)) reasons.push({ code: 'no_placement' });

    const drop = falling(history.get(member.id) ?? []);
    if (drop) reasons.push({ code: 'falling_score', ...drop });

    if (standing.requirement && (standing.overdue || standing.due_soon)) reasons.push({ code: 'behind_requirement', due_date: standing.requirement.due_date, want: standing.requirement.level });

    if (isTracked) {
      // Quiet time starts when the company could first see them: nothing before that is theirs to answer for.
      const visibleFrom = [member.joined_at, member.consent_at].filter((value): value is string => Boolean(value)).map((value) => localDate(value)).sort().pop() ?? today;
      const last = lastActive.get(member.id);
      const since = last ? localDate(last) : visibleFrom;
      const quiet = days(since > visibleFrom ? since : visibleFrom, today);
      if (quiet >= options.inactiveDays) reasons.push({ code: 'inactive', days: Math.min(quiet, LOOKBACK_DAYS), capped: quiet >= LOOKBACK_DAYS });
    }

    for (const assignment of assignments) {
      if (!appliesTo(assignment, member)) continue;
      const track = assignment.track_code ? findTrack(assignment.track_code) : undefined;
      const targetMissed = assignment.target_level && (!isLevel(member.level) || levelIndex(member.level) < levelIndex(assignment.target_level));
      if (track) {
        if (!isTracked) continue;
        const total = track.lessons.length;
        const done = track.lessons.filter((lesson) => completed.has(`${member.id}:${lesson.code}`)).length;
        if (done >= total) continue;
        const overdue = Boolean(assignment.due_date && assignment.due_date < today);
        let behind = overdue;
        if (!overdue && assignment.due_date) {
          const startDay = localDate(assignment.created_at), span = days(startDay, assignment.due_date);
          behind = span > 0 && days(startDay, today) / span - done / total > PACE_MARGIN;
        }
        if (behind) { reasons.push({ code: 'behind_assignment', assignment_id: assignment.id, track_code: assignment.track_code, due_date: assignment.due_date, done, total }); break; }
      } else if (targetMissed && assignment.due_date && assignment.due_date < today) {
        // A level target with no lessons is judged on company tests alone.
        reasons.push({ code: 'behind_assignment', assignment_id: assignment.id, track_code: null, due_date: assignment.due_date, want: assignment.target_level as Level });
        break;
      }
    }
    if (!reasons.length) continue;

    const snoozedUntil = actions.filter((row) => row.member_id === member.id && row.kind === 'snooze' && row.until && row.until >= today).map((row) => row.until!).sort().pop() ?? null;
    if (snoozedUntil && !options.includeSnoozed) continue;

    const roleTrack = findTrack(member.job_role) ? member.job_role : 'general';
    // Someone already on their track needs encouragement, not the same assignment again.
    const onTrack = assignments.some((assignment) => assignment.track_code === roleTrack && appliesTo(assignment, member));
    const requirement = standing.requirement;
    const dueLater = requirement?.due_date && requirement.due_date > today ? requirement.due_date : addDays(today, 30);
    const action: RiskRow['suggestion']['action'] = !isLevel(member.level) ? 'placement'
      : !onTrack && reasons.some((reason) => reason.code === 'falling_score' || reason.code === 'behind_requirement') ? 'assign'
      : 'nudge';
    out.push({
      member_id: member.id, name: displayName(member), department: member.department_id ? names.get(member.department_id) ?? null : null, job_role: member.job_role,
      level: isLevel(member.level) ? member.level : null, seat: member.seat, shares: Boolean(member.consent_at), reasons,
      suggestion: { action, track_code: onTrack ? null : roleTrack, target_level: requirement?.level ?? null, due_date: dueLater },
      last_nudge: lastAction(member.id, 'nudge'), last_assign: lastAction(member.id, 'assign'), snoozed_until: snoozedUntil,
    });
  }
  out.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(REASONS.map((reason) => [reason, out.filter((row) => row.reasons.some((entry) => entry.code === reason)).length])) as Record<Reason, number>;
  return {
    today, viewer, department, people: out, counts, departments, learners: learners.length, tracked: tracked.length,
    // People whose learning we may not look at: only their test results can raise a flag.
    untracked: learners.length - tracked.length,
    learning_signals: org.status === 'active',
  };
}

async function memberInScope(ctx: Ctx, id: string): Promise<MemberRow> {
  if (!UUID.test(id)) throw new CompanyError('member_not_found', 'Person not found.', 404);
  const member = check<MemberRow | null>(await ctx.db.from('company_members').select('id,org_id,user_id,email,full_name,role,department_id,job_role,status,seat,level,level_score,level_source,level_at,target_level,target_date,consent_at,joined_at').eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!member || member.status !== 'active') throw new CompanyError('member_not_found', 'Person not found.', 404);
  const hr = ctx.staff || ctx.member?.role === 'owner' || ctx.member?.role === 'admin';
  if (!hr && (!ctx.member?.department_id || member.department_id !== ctx.member.department_id)) throw new CompanyError('member_not_found', 'Person not found.', 404);
  return member;
}

const alreadyAssigned = () => new CompanyError('already_assigned', 'This person was given this assignment today.', 409);

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/at-risk', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const inactiveDays = int(query.get('inactive_days') ?? 14, 'inactive_days', { min: 3, max: 120 })!;
      const departmentParam = query.get('department');
      if (departmentParam && !UUID.test(departmentParam)) throw new CompanyError('invalid_field', 'department must be a department.', 400, { field: 'department' });
      const list = await riskList(ctx, { inactiveDays, department: departmentParam, includeSnoozed: query.get('snoozed') === '1' });
      if (query.get('format') === 'csv') {
        await ctx.audit('risk.exported', null, { rows: list.people.length });
        return {
          filename: `schood-company-at-risk-${list.today}.csv`, rows: list.people.length,
          csv: csv(['name', 'department', 'job_role', 'level', 'reasons', 'suggested', 'last_reminded', 'last_assigned', 'snoozed_until'], list.people.map((row) => [
            row.name, row.department ?? '', row.job_role, row.level ?? '', row.reasons.map((reason) => reason.code).join('; '), row.suggestion.action, row.last_nudge ?? '', row.last_assign ?? '', row.snoozed_until ?? '',
          ])),
        };
      }
      return {
        today: list.today, inactive_days: inactiveDays, can_assign: list.viewer.hr && ctx.org!.status === 'active',
        people: list.people, counts: list.counts, departments: list.departments, learners: list.learners, untracked: list.untracked,
        learning_signals: list.learning_signals, scope: { department: list.department, unassigned: list.viewer.manager && !list.viewer.departmentId },
      };
    },
  },
  {
    // One click: this person gets their job-role track, with their requirement as the target when they have one.
    method: 'POST', path: 'orgs/:org/insights/at-risk/:member/assign', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body ?? {}), today = localDate(ctx.now());
      const member = await memberInScope(ctx, params.member);
      const block = seatBlock(ctx, member);
      if (block) throw new CompanyError('seat_required', block === 'no_seat' ? 'This person needs a learning seat first.' : 'Assignments need an active agreement with Schood.', 402, { reason: block });
      const trackCode = String(input.track_code ?? (findTrack(member.job_role) ? member.job_role : 'general'));
      if (!findTrack(trackCode)) throw new CompanyError('invalid_field', 'track_code is not a track.', 400, { field: 'track_code' });
      const target = input.target_level === undefined || input.target_level === null || input.target_level === '' ? null : input.target_level;
      if (target !== null && !isLevel(target)) throw new CompanyError('invalid_field', 'target_level is not a level.', 400, { field: 'target_level' });
      const due = input.due_date === undefined || input.due_date === null || input.due_date === '' ? addDays(today, 30) : input.due_date;
      if (!isCalendarDate(due) || due < today) throw new CompanyError('invalid_field', 'due_date must be today or later.', 400, { field: 'due_date' });
      const reason = oneOf<Reason>(input.reason, REASONS, 'reason', 'behind_requirement');

      const existing = check<{ id: string }[]>(await ctx.db.from('company_assignments').select('id').eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('track_code', trackCode).eq('status', 'active').limit(1));
      if (existing.length) throw new CompanyError('already_assigned', 'This person already has this track assigned.', 409);
      // The unique row is the lock: of two tabs or a double click, only one gets past here.
      checkUnique(await ctx.db.from('company_risk_actions').insert({ org_id: ctx.org!.id, member_id: member.id, kind: 'assign', reason: 'one_click', day: today, actor: ctx.user }).select('id').single(), alreadyAssigned);
      const { data, error } = await ctx.db.from('company_assignments').insert({
        org_id: ctx.org!.id, track_code: trackCode, target_level: target, due_date: due, department_id: null, member_id: member.id, status: 'active', created_by: ctx.user,
      }).select(ASSIGNMENT_COLUMNS).single();
      if (error) {
        // Give the lock back so HR can try again.
        await ctx.db.from('company_risk_actions').delete().eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('kind', 'assign').eq('reason', 'one_click').eq('day', today);
        throw new Error(`${error.code ?? 'db'}: ${error.message}`);
      }
      await ctx.audit('risk.assigned', member.id, { track_code: trackCode, target_level: target, due_date: due, reason });
      return { assignment: data as AssignmentRow };
    },
  },
  {
    // Records that a nudge was copied or that someone is snoozed. Nothing is sent from here.
    method: 'POST', path: 'orgs/:org/insights/at-risk/:member/action', access: 'org', roles: LEAD_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body), today = localDate(ctx.now());
      const member = await memberInScope(ctx, params.member);
      const kind = oneOf(input.kind, ['nudge', 'snooze'] as const, 'kind');
      if (kind === 'nudge') {
        const reason = oneOf<Reason>(input.reason, REASONS, 'reason');
        // Copying twice in a day is one nudge.
        check(await ctx.db.from('company_risk_actions').upsert({ org_id: ctx.org!.id, member_id: member.id, kind, reason, day: today, actor: ctx.user }, { onConflict: 'org_id,member_id,kind,reason,day', ignoreDuplicates: true }));
        await ctx.audit('risk.nudged', member.id, { reason });
        return { day: today };
      }
      const until = addDays(today, int(input.days ?? 14, 'days', { min: 1, max: 90 })!);
      check(await ctx.db.from('company_risk_actions').upsert({ org_id: ctx.org!.id, member_id: member.id, kind, reason: 'all', day: today, until, actor: ctx.user }, { onConflict: 'org_id,member_id,kind,reason,day' }));
      await ctx.audit('risk.snoozed', member.id, { until });
      return { until };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/insights/at-risk/:member/snooze', access: 'org', roles: LEAD_ROLES,
    async handle(ctx, params) {
      const member = await memberInScope(ctx, params.member);
      check(await ctx.db.from('company_risk_actions').delete().eq('org_id', ctx.org!.id).eq('member_id', member.id).eq('kind', 'snooze'));
      await ctx.audit('risk.unsnoozed', member.id);
      return { ok: true };
    },
  },
];
