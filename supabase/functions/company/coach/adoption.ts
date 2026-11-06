// Is the habit sticking? A view for HR and managers built only from company_activity of
// people who agreed to share. It has no names, no phrases and no streaks, and a group too
// small to hide one person's pattern is left out. Managers see only their department.
import { LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { addDays, fetchAll, isLearner, loadScope, localDate, shares, weekOf } from '../insights/common.ts';
import { englishVisibleFrom } from '../insights/english.ts';
import type { MemberRow, Route } from '../types.ts';

/** Below this many sharing people a group's numbers could point at one person. */
export const MIN_GROUP = 3;
const WEEKS = 8;
const LEARNING = new Set(['lesson', 'lesson_retry', 'roleplay', 'writing', 'glossary', 'session', 'english']);

interface ActivityRow { member_id: string | null; kind: string; created_at: string }

/** For a group: how many practised in the last week, how many on three days or more, and the average practice days over four weeks. */
function groupNumbers(people: MemberRow[], daysOf: Map<string, Set<string>>, today: string) {
  const lastWeek = addDays(today, -6), lastMonth = addDays(today, -27);
  const count = (member: MemberRow, from: string) => [...daysOf.get(member.id) ?? []].filter((day) => day >= from && day <= today).length;
  const monthDays = people.reduce((sum, member) => sum + count(member, lastMonth), 0);
  return {
    people: people.length,
    active_week: people.filter((member) => count(member, lastWeek) > 0).length,
    regular_week: people.filter((member) => count(member, lastWeek) >= 3).length,
    days_per_person: people.length ? Math.round(monthDays / people.length * 10) / 10 : 0,
  };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/coach/adoption', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const { members, departments } = await loadScope(ctx);
      const learners = members.filter((member) => isLearner(member) && member.seat);
      const sharing = learners.filter(shares);
      const base = { min_group: MIN_GROUP, seated: learners.length, sharing: sharing.length, not_sharing: learners.length - sharing.length };
      if (sharing.length < MIN_GROUP) return { ...base, enough: false, overall: null, weeks: [], departments: [] };

      const today = localDate(ctx.now());
      const since = addDays(weekOf(today), -7 * (WEEKS - 1));
      const shown = new Map(sharing.map((member) => [member.id, member]));
      const rows = await fetchAll<ActivityRow>(() => ctx.db.from('company_activity').select('member_id,kind,created_at').eq('org_id', ctx.org!.id).gte('created_at', new Date(`${since}T00:00:00+05:00`).toISOString()).order('id'), 100_000);
      const daysOf = new Map<string, Set<string>>();
      for (const row of rows) {
        const member = row.member_id ? shown.get(row.member_id) : undefined;
        if (!member || !LEARNING.has(row.kind)) continue;
        // Schood English counts only from when the person joined and agreed.
        if (row.kind === 'english' && row.created_at < englishVisibleFrom(member, ctx.now()).toISOString()) continue;
        const days = daysOf.get(member.id) ?? new Set<string>();
        days.add(localDate(row.created_at));
        daysOf.set(member.id, days);
      }
      const weeks = Array.from({ length: WEEKS }, (_, index) => {
        const monday = addDays(since, index * 7), sunday = addDays(monday, 6);
        const active = sharing.filter((member) => [...daysOf.get(member.id) ?? []].some((day) => day >= monday && day <= sunday)).length;
        return { monday, active, percent: Math.round(active / sharing.length * 100) };
      });
      const groups = [...departments, { id: null as string | null, name: null as string | null }].map((department) => {
        const people = sharing.filter((member) => member.department_id === department.id);
        if (people.length === 0) return null;
        return people.length < MIN_GROUP
          ? { id: department.id, name: department.name, hidden: true as const }
          : { id: department.id, name: department.name, hidden: false as const, ...groupNumbers(people, daysOf, today) };
      }).filter((row) => row !== null);
      return { ...base, enough: true, overall: groupNumbers(sharing, daysOf, today), weeks, departments: groups };
    },
  },
];
