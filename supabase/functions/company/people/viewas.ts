// "View as this workspace": what its HR sees, read-only, for Schood staff. It is not
// impersonation: nobody signs in as anyone, it is served from one GET route, and every
// opening goes in the audit log. Consent holds here as well: without it, a person shows
// membership and company test results only.
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, type MemberRow, type Route } from '../types.ts';
import { DAY, fetchAll } from './shared.ts';
import { countsForCompany, weeklyUsage } from './health.ts';
import { onboardingState } from './onboarding.ts';
import { loadOrg } from './staffshared.ts';

export const viewRoutes: Route[] = [
  {
    method: 'GET', path: 'staff/orgs/:org/view', access: 'staff',
    async handle(ctx, params) {
      const org = await loadOrg(ctx, params.org), now = ctx.now();
      await ctx.audit('staff.view_as', org.id, { name: org.name });
      const members = await fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).neq('status', 'removed').order('full_name').order('id'));
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
      const tests = await fetchAll<{ id: string; title: string; kind: string; status: string; created_at: string }>(() => ctx.db.from('company_assessments').select('id,title,kind,status,created_at').eq('org_id', org.id).order('created_at', { ascending: false }).order('id'));
      const attempts = await fetchAll<{ assessment_id: string; member_id: string | null; status: string; overall_level: string | null; graded_at: string | null }>(() => ctx.db.from('company_attempts').select('assessment_id,member_id,status,overall_level,graded_at').eq('org_id', org.id).order('id'));
      const since = new Date(now.getTime() - 30 * DAY).toISOString();
      const activity = await fetchAll<{ member_id: string | null; kind: string; minutes: number; created_at: string }>(() => ctx.db.from('company_activity').select('member_id,kind,minutes,created_at').eq('org_id', org.id).gte('created_at', since).order('created_at').order('id'), 100_000);
      const byId = new Map(members.map((row) => [row.id, row]));
      const minutes = new Map<string, number>();
      for (const row of activity) {
        if (!row.member_id) continue;
        const member = byId.get(row.member_id);
        if (!member?.consent_at || !countsForCompany(row, member)) continue;
        minutes.set(row.member_id, (minutes.get(row.member_id) ?? 0) + (Number(row.minutes) || 0));
      }
      const departmentName = new Map(departments.map((row) => [row.id, row.name]));
      const graded = new Map<string, number>(), started = new Map<string, number>();
      for (const row of attempts) {
        started.set(row.assessment_id, (started.get(row.assessment_id) ?? 0) + 1);
        if (row.status === 'graded') graded.set(row.assessment_id, (graded.get(row.assessment_id) ?? 0) + 1);
      }
      const seatsUsed = members.filter((row) => row.seat).length;
      return {
        read_only: true,
        org: { id: org.id, name: org.name, status: org.status, industry: org.industry, size_band: org.size_band, city: org.city, seats_limit: org.seats_limit, tests_limit: org.tests_limit, tests_used: org.tests_used, contract_ends_at: org.contract_ends_at },
        usage: { seats_used: seatsUsed, seats_limit: org.seats_limit, tests_used: org.tests_used, tests_limit: org.tests_limit },
        departments: departments.map((row) => ({ ...row, people: members.filter((member) => member.department_id === row.id).length })),
        people: members.map((row) => ({
          id: row.id, name: row.full_name || row.email, role: row.role, status: row.status, seat: row.seat, department: row.department_id ? departmentName.get(row.department_id) ?? null : null,
          job_role: row.job_role, level: row.level, consent: Boolean(row.consent_at),
          // Learning detail only with consent.
          minutes_30d: row.consent_at ? minutes.get(row.id) ?? 0 : null,
        })),
        tests: tests.map((row) => ({ ...row, started: started.get(row.id) ?? 0, graded: graded.get(row.id) ?? 0 })),
        weeks: await weeklyUsage(ctx, org.id),
        onboarding: await onboardingState(ctx, org),
      };
    },
  },
];
