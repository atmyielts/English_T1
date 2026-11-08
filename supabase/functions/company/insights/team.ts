// Manager home: one screen for a manager's department. How the team stands, who
// needs a nudge, what is coming up and what is overdue. HR can open it for any
// department to see what the manager sees.
import { isLevel, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { check, CompanyError, UUID, type MemberRow, type Route } from '../types.ts';
import { int } from '../util.ts';
import { activitySummary, addDays, dayStart, displayName, emptyLevels, fetchAll, isLearner, viewerOf } from './common.ts';
import { assignmentsInScope, type AssignmentRow } from './overview.ts';
import { loadFramework, percent } from './framework.ts';
import { riskList } from './risk.ts';
import { isInvitee, type SessionRow } from './sessions.ts';

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/team', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const org = ctx.org!, now = ctx.now();
      const viewer = viewerOf(ctx);
      const asked = query.get('department');
      if (asked && !UUID.test(asked)) throw new CompanyError('invalid_field', 'department must be a department.', 400, { field: 'department' });
      // A manager's department is theirs whatever the URL says; HR picks, first department by default.
      const all = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
      const departmentId = viewer.manager ? viewer.departmentId : asked ?? all[0]?.id ?? null;
      const department = all.find((entry) => entry.id === departmentId) ?? null;
      if (asked && viewer.hr && !department) throw new CompanyError('department_not_found', 'Department not found.', 404);
      const inactiveDays = int(query.get('inactive_days') ?? 14, 'inactive_days', { min: 3, max: 120 })!;
      if (!department) return { department: null, departments: viewer.hr ? all : [], unassigned: viewer.manager, can_assign: false };

      const risk = await riskList(ctx, { inactiveDays, department: department.id });
      const people = (await fetchAll<MemberRow>(() => ctx.db.from('company_members').select('id,org_id,user_id,email,full_name,role,department_id,job_role,status,seat,level,level_score,level_source,level_at,target_level,target_date,consent_at,joined_at').eq('org_id', org.id).eq('department_id', department.id).eq('status', 'active').order('id')));
      const learners = people.filter(isLearner);
      const sharing = learners.filter((member) => member.consent_at).map((member) => member.id);
      const tomorrow = new Date(now.getTime() + 1);
      const [week, assignments, sessions] = await Promise.all([
        activitySummary(ctx.db, org.id, dayStart(addDays(risk.today, -6)), tomorrow, sharing),
        fetchAll<AssignmentRow>(() => ctx.db.from('company_assignments').select('id,track_code,target_level,due_date,department_id,member_id,status,note,created_at').eq('org_id', org.id).eq('status', 'active').order('id'), 5000),
        check<SessionRow[]>(await ctx.db.from('company_sessions').select('id,org_id,title,kind,trainer,starts_at,duration_minutes,location,link,department_ids,member_ids,status').eq('org_id', org.id).eq('status', 'scheduled')
          .gte('starts_at', now.toISOString()).lt('starts_at', new Date(now.getTime() + 21 * 86_400_000).toISOString()).order('starts_at').limit(200)),
      ]);
      const levels = emptyLevels();
      for (const member of learners) levels[isLevel(member.level) ? member.level : 'none'] += 1;
      const { standings } = await loadFramework(ctx);
      const answering = learners.filter((member) => standings.get(member.id)?.requirement);
      const meets = answering.filter((member) => standings.get(member.id)!.meets).length;
      const ids = new Set(learners.map((member) => member.id));

      const overdue = assignmentsInScope(assignments, { hr: false, lead: true, manager: true, memberId: null, departmentId: department.id }, learners)
        .filter((row) => row.due_date && row.due_date < risk.today)
        .map((row) => {
          const targets = row.member_id ? learners.filter((member) => member.id === row.member_id) : learners;
          return { id: row.id, track_code: row.track_code, target_level: row.target_level, due_date: row.due_date, scope: row.member_id ? 'person' : row.department_id ? 'department' : 'all', people: targets.length, person: row.member_id && targets[0] ? displayName(targets[0]) : null };
        });

      return {
        today: risk.today, department, departments: viewer.hr ? all : [], unassigned: false, inactive_days: inactiveDays,
        can_assign: viewer.hr && org.status === 'active',
        kpis: {
          people: learners.length, tested: learners.filter((member) => isLevel(member.level)).length, sharing: sharing.length,
          active7: week.members.filter((row) => row.events > 0).length, minutes7: week.members.reduce((sum, row) => sum + row.minutes, 0),
          with_requirement: answering.length, meets, percent: percent(meets, answering.length),
        },
        levels,
        untracked: risk.untracked,
        nudge: risk.people,
        upcoming: sessions.filter((session) => !session.department_ids?.length && !session.member_ids?.length || (session.department_ids ?? []).includes(department.id) || (session.member_ids ?? []).some((id) => ids.has(id)))
          .slice(0, 8)
          .map((session) => ({ id: session.id, title: session.title, kind: session.kind, starts_at: session.starts_at, duration_minutes: session.duration_minutes, trainer: session.trainer, location: session.location, invited: learners.filter((member) => isInvitee(session, member)).length })),
        overdue,
      };
    },
  },
];
