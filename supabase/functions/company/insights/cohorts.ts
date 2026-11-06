// Before-and-after cohorts: level movement between two dates, per department and
// in total, and the list of people who moved up. Company test results only, so
// this holds without consent; managers get only their department through loadScope.
import { isLevel, LEAD_ROLES, levelIndex, type Level } from '../../../../packages/company-core/src/mod.ts';
import { CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { oneOf } from '../util.ts';
import { averageScore, csv, displayName, gradedStaffAttempts, isLearner, loadScope, parseRange, type GradedAttempt, type Range } from './common.ts';
import { gradedWithSkills, latestSkills, readRequirements, standingOf, type AttemptWithSkills } from './framework.ts';

export interface Move { member: MemberRow; from: GradedAttempt | AttemptWithSkills; to: GradedAttempt | AttemptWithSkills; change: number }
export interface Movement { up: number; same: number; down: number; first: number; levels_gained: number; moves: Move[]; before: Map<string, GradedAttempt | AttemptWithSkills>; after: Map<string, GradedAttempt | AttemptWithSkills> }

/**
 * Compares each person's latest result before the period (or, if they were first
 * tested in it, their first result in it) with their latest result by its end.
 */
export function movementOf(attempts: (GradedAttempt | AttemptWithSkills)[], members: MemberRow[], range: Pick<Range, 'start' | 'end'>): Movement {
  const before = new Map<string, GradedAttempt | AttemptWithSkills>(), after = new Map<string, GradedAttempt | AttemptWithSkills>(), firstIn = new Map<string, GradedAttempt | AttemptWithSkills>();
  // Oldest first, so a later result simply replaces an earlier one.
  for (const attempt of attempts) {
    if (!attempt.member_id || !attempt.graded_at) continue;
    const at = Date.parse(attempt.graded_at);
    if (at >= range.end.getTime()) continue;
    after.set(attempt.member_id, attempt);
    if (at < range.start.getTime()) before.set(attempt.member_id, attempt);
    else if (!firstIn.has(attempt.member_id)) firstIn.set(attempt.member_id, attempt);
  }
  let up = 0, same = 0, down = 0, first = 0, gained = 0;
  const moves: Move[] = [];
  for (const member of members) {
    const to = after.get(member.id);
    if (!to) continue;
    const baseline = before.get(member.id) ?? firstIn.get(member.id)!;
    if (!before.has(member.id)) first += 1;
    if (baseline.id === to.id) { if (before.has(member.id)) same += 1; continue; }
    const change = levelIndex(to.overall_level as Level) - levelIndex(baseline.overall_level as Level);
    if (change > 0) { up += 1; gained += change; } else if (change < 0) down += 1; else same += 1;
    moves.push({ member, from: baseline, to, change });
  }
  return { up, same, down, first, levels_gained: gained, moves, before, after };
}

const score = (attempt: { overall_score: number | null } | undefined) => attempt && attempt.overall_score !== null && attempt.overall_score !== undefined ? Number(attempt.overall_score) : null;

function totals(movement: Movement, people: MemberRow[]) {
  const ids = new Set(people.map((member) => member.id));
  const moves = movement.moves.filter((move) => ids.has(move.member.id));
  const starts = people.map((member) => movement.before.get(member.id)).filter(Boolean);
  const ends = people.map((member) => movement.after.get(member.id)).filter(Boolean);
  const first = people.filter((member) => movement.after.has(member.id) && !movement.before.has(member.id)).length;
  const onlyOnce = people.filter((member) => movement.after.has(member.id) && movement.before.has(member.id) && movement.before.get(member.id)!.id === movement.after.get(member.id)!.id).length;
  return {
    people: people.length,
    compared: moves.length + onlyOnce,
    up: moves.filter((move) => move.change > 0).length,
    same: moves.filter((move) => move.change === 0).length + onlyOnce,
    down: moves.filter((move) => move.change < 0).length,
    first,
    not_tested: people.filter((member) => !movement.after.has(member.id)).length,
    levels_gained: moves.reduce((sum, move) => sum + Math.max(0, move.change), 0),
    avg_start: averageScore(starts.map((attempt) => score(attempt)).filter((value) => value !== null)),
    avg_end: averageScore(ends.map((attempt) => score(attempt)).filter((value) => value !== null)),
  };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/cohorts', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const range = parseRange(query, ctx.now(), 731);
      const departmentParam = query.get('department');
      if (departmentParam && departmentParam !== 'none' && !UUID.test(departmentParam)) throw new CompanyError('invalid_field', 'department must be a department.', 400, { field: 'department' });
      const format = oneOf(query.get('format') ?? 'json', ['json', 'csv'] as const, 'format');
      const { viewer, members, departments, department } = await loadScope(ctx);
      const learners = members.filter(isLearner).filter((member) => !departmentParam || (departmentParam === 'none' ? !member.department_id : member.department_id === departmentParam));
      const [attempts, requirements] = await Promise.all([gradedStaffAttempts(ctx.db, ctx.org!.id, range.end), readRequirements(ctx.db, ctx.org!.id)]);
      const ids = new Set(learners.map((member) => member.id));
      const scoped = attempts.filter((attempt) => attempt.member_id && ids.has(attempt.member_id));
      const movement = movementOf(scoped, learners, range);
      const names = new Map(departments.map((entry) => [entry.id, entry.name]));
      const skills = requirements.some((row) => Object.keys(row.skills ?? {}).length) ? await skillsFor(ctx, ids) : new Map();

      const promotion = movement.moves.filter((move) => move.change > 0).map((move) => {
        const standing = standingOf(requirements, move.member, move.to.overall_level, skills.get(move.member.id), range.to);
        return {
          member_id: move.member.id, name: displayName(move.member), email: move.member.email, department: move.member.department_id ? names.get(move.member.department_id) ?? null : null, job_role: move.member.job_role,
          from_level: move.from.overall_level as Level, to_level: move.to.overall_level as Level, levels: move.change,
          from_score: score(move.from), to_score: score(move.to), tested_at: move.to.graded_at,
          meets_requirement: standing.requirement ? standing.meets : null,
        };
      }).sort((a, b) => b.levels - a.levels || (b.to_score ?? 0) - (a.to_score ?? 0));

      if (format === 'csv') {
        const lines = promotion.map((row) => [row.name, row.email, row.department ?? '', row.job_role, row.from_level, row.to_level, row.levels, row.from_score ?? '', row.to_score ?? '', row.tested_at?.slice(0, 10) ?? '', row.meets_requirement === null ? '' : row.meets_requirement ? 'yes' : 'no']);
        await ctx.audit('cohort.exported', null, { from: range.from, to: range.to, rows: lines.length });
        return { filename: `schood-company-moved-up-${range.from}-${range.to}.csv`, rows: lines.length, csv: csv(['name', 'email', 'department', 'job_role', 'from_level', 'to_level', 'levels_gained', 'from_score', 'to_score', 'tested_on', 'meets_requirement'], lines) };
      }

      // Who went from which level to which, including people who stayed.
      const matrix = new Map<string, { from: Level; to: Level; count: number }>();
      for (const member of learners) {
        const after = movement.after.get(member.id);
        if (!after) continue;
        const start = movement.before.get(member.id) ?? scoped.find((attempt) => attempt.member_id === member.id && Date.parse(attempt.graded_at!) >= range.start.getTime());
        if (!start || !isLevel(start.overall_level) || !isLevel(after.overall_level)) continue;
        const key = `${start.overall_level}|${after.overall_level}`;
        const entry = matrix.get(key) ?? { from: start.overall_level, to: after.overall_level, count: 0 };
        entry.count += 1;
        matrix.set(key, entry);
      }

      const groups: { id: string | null; name: string | null }[] = departments.map((entry) => ({ id: entry.id, name: entry.name }));
      if (viewer.hr && learners.some((member) => !member.department_id)) groups.push({ id: null, name: null });
      return {
        range: { from: range.from, to: range.to, days: range.days },
        scope: { department, unassigned: viewer.manager && !viewer.departmentId },
        departments_list: departments,
        total: totals(movement, learners),
        matrix: [...matrix.values()],
        departments: groups.map((group) => {
          const people = learners.filter((member) => (member.department_id ?? null) === group.id);
          return { id: group.id, name: group.name, ...totals(movement, people) };
        }).filter((row) => row.people > 0),
        promotion: promotion.map(({ email: _email, ...row }) => row),
      };
    },
  },
];

async function skillsFor(ctx: Ctx, ids: Set<string>) {
  return latestSkills((await gradedWithSkills(ctx.db, ctx.org!.id)).filter((attempt) => attempt.member_id && ids.has(attempt.member_id)));
}
