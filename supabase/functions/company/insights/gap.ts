// Skills-gap matrix: department by skill and job role by level, who meets the
// requirement, compliance percent and its trend, and a drill-down to people.
// Everything here comes from company test results, so it holds without consent;
// managers get only their department because loadScope gives them only that.
import { isJobRole, isLevel, isSkill, LEAD_ROLES, levelIndex, SKILLS, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { CompanyError, UUID, type MemberRow, type Route } from '../types.ts';
import { oneOf } from '../util.ts';
import { averageScore, displayName, emptyLevels, levelsAt, memberScore, monthOf, type GradedAttempt } from './common.ts';
import { latestSkills, loadFramework, monthEnd, percent, standingOf, type SkillResults, type Standing } from './framework.ts';

export interface Cell { avg: number | null; level: Level | null; tested: number; met: number; with_requirement: number }

/** One skill's average and how many of the people who answer for it reach the bar: the skill's own level, else the overall one. */
function skillCell(people: MemberRow[], skill: Skill, skills: Map<string, SkillResults>, standings: Map<string, Standing>): Cell {
  const scores: number[] = [];
  let met = 0, withRequirement = 0, tested = 0;
  for (const member of people) {
    const result = skills.get(member.id)?.[skill];
    if (result) { tested += 1; if (result.score !== null) scores.push(result.score); }
    const requirement = standings.get(member.id)?.requirement;
    if (!requirement) continue;
    // A skill no test here measured and no one asked for separately says nothing about the person.
    if (!result && !requirement.skills?.[skill]) continue;
    const want = requirement.skills?.[skill] ?? requirement.level;
    withRequirement += 1;
    if (result && levelIndex(result.level) >= levelIndex(want)) met += 1;
  }
  const average = averageScore(scores);
  return { avg: average.score, level: average.level, tested, met, with_requirement: withRequirement };
}

function overallCell(people: MemberRow[], standings: Map<string, Standing>): Cell {
  const tested = people.filter((member) => isLevel(member.level));
  const average = averageScore(tested.map(memberScore));
  const answering = people.filter((member) => standings.get(member.id)?.requirement);
  return { avg: average.score, level: average.level, tested: tested.length, met: answering.filter((member) => standings.get(member.id)!.meets).length, with_requirement: answering.length };
}

const tally = (people: MemberRow[], standings: Map<string, Standing>) => {
  const answering = people.map((member) => standings.get(member.id)).filter((entry): entry is Standing => Boolean(entry?.requirement));
  const meets = answering.filter((entry) => entry.meets).length;
  return {
    people: people.length, with_requirement: answering.length, meets, percent: percent(meets, answering.length),
    overdue: answering.filter((entry) => entry.overdue).length, due_soon: answering.filter((entry) => entry.due_soon).length,
    untested: answering.filter((entry) => entry.untested).length,
  };
};

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/skills-gap', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const { viewer, today, requirements, learners, skills, standings, attempts, departments, department } = await loadFramework(ctx);
      // Departments the viewer sees, plus "no department" for HR when someone has none.
      const groups: { id: string | null; name: string | null }[] = departments.map((entry) => ({ id: entry.id, name: entry.name }));
      if (viewer.hr && learners.some((member) => !member.department_id)) groups.push({ id: null, name: null });

      const heat = groups.map((group) => {
        const people = learners.filter((member) => (member.department_id ?? null) === group.id);
        return {
          id: group.id, name: group.name, ...tally(people, standings), overall: overallCell(people, standings),
          skills: Object.fromEntries(SKILLS.map((skill) => [skill, skillCell(people, skill, skills, standings)])),
        };
      });

      const roles = [...new Set(learners.map((member) => member.job_role))].sort().map((role) => {
        const people = learners.filter((member) => member.job_role === role);
        const counts = emptyLevels();
        for (const member of people) counts[isLevel(member.level) ? member.level : 'none'] += 1;
        const requirement = requirements.find((row) => row.job_role === role && !row.department_id) ?? null;
        return { job_role: role, ...tally(people, standings), counts, requirement: requirement ? { level: requirement.level, skills: requirement.skills, due_date: requirement.due_date, source: requirement.source } : null };
      });

      // Compliance month by month, measured against today's requirements so the line shows people moving, not the bar.
      const trend = [];
      for (let offset = -5; offset <= 0; offset++) {
        const month = monthOf(today, offset);
        if (offset === 0) {
          const now = tally(learners, standings);
          trend.push({ month: month.slice(0, 7), with_requirement: now.with_requirement, meets: now.meets, percent: now.percent });
          continue;
        }
        const end = monthEnd(month);
        const latest = levelsAt(attempts as GradedAttempt[], end);
        const skillsThen = latestSkills(attempts, end);
        let answering = 0, meets = 0;
        for (const member of learners) {
          const standing = standingOf(requirements, member, latest.get(member.id)?.overall_level ?? null, skillsThen.get(member.id), today);
          if (!standing.requirement) continue;
          answering += 1;
          if (standing.meets) meets += 1;
        }
        trend.push({ month: month.slice(0, 7), with_requirement: answering, meets, percent: percent(meets, answering) });
      }

      return {
        today, scope: { department, unassigned: viewer.manager && !viewer.departmentId }, skills: SKILLS, has_requirements: requirements.length > 0,
        compliance: tally(learners, standings), trend, heat, roles,
      };
    },
  },
  {
    // Who is behind a cell of the matrix. Test results only, in the viewer's scope.
    method: 'GET', path: 'orgs/:org/insights/skills-gap/people', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const { learners, skills, standings, departments } = await loadFramework(ctx);
      const departmentParam = query.get('department');
      if (departmentParam && departmentParam !== 'none' && !UUID.test(departmentParam)) throw new CompanyError('invalid_field', 'department must be a department.', 400, { field: 'department' });
      const role = query.get('job_role');
      if (role && !isJobRole(role)) throw new CompanyError('invalid_field', 'job_role is not a job role.', 400, { field: 'job_role' });
      const skill = query.get('skill');
      if (skill && !isSkill(skill) && skill !== 'overall') throw new CompanyError('invalid_field', 'skill is not a skill.', 400, { field: 'skill' });
      const level = query.get('level');
      if (level && !isLevel(level) && level !== 'none') throw new CompanyError('invalid_field', 'level is not a level.', 400, { field: 'level' });
      const status = oneOf(query.get('status') ?? 'all', ['all', 'gap', 'meets', 'untested', 'overdue'] as const, 'status');
      const names = new Map(departments.map((entry) => [entry.id, entry.name]));

      const rows = learners.filter((member) => {
        if (departmentParam && (departmentParam === 'none' ? member.department_id !== null : member.department_id !== departmentParam)) return false;
        if (role && member.job_role !== role) return false;
        if (level && (level === 'none' ? isLevel(member.level) : member.level !== level)) return false;
        const standing = standings.get(member.id)!;
        const hasGap = skill && skill !== 'overall' && isSkill(skill) ? standing.requirement && !skillReached(skills.get(member.id), skill, standing) : standing.requirement && !standing.meets;
        if (status === 'gap' && !hasGap) return false;
        if (status === 'meets' && (!standing.requirement || hasGap)) return false;
        if (status === 'untested' && !standing.untested) return false;
        if (status === 'overdue' && !standing.overdue) return false;
        return true;
      }).sort((a, b) => displayName(a).localeCompare(displayName(b)));

      return {
        total: rows.length,
        people: rows.slice(0, 500).map((member) => {
          const standing = standings.get(member.id)!;
          return {
            member_id: member.id, name: displayName(member), department: member.department_id ? names.get(member.department_id) ?? null : null, job_role: member.job_role,
            level: isLevel(member.level) ? member.level : null, level_score: member.level_score === null || member.level_score === undefined ? null : Number(member.level_score),
            requirement: standing.requirement ? { level: standing.requirement.level, skills: standing.requirement.skills, due_date: standing.requirement.due_date, source: standing.requirement.source } : null,
            meets: standing.requirement ? standing.meets : null, overdue: standing.overdue, due_soon: standing.due_soon, gaps: standing.gaps,
            skills: skills.get(member.id) ?? {},
          };
        }),
      };
    },
  },
];

function skillReached(skills: SkillResults | undefined, skill: Skill, standing: Standing): boolean {
  const want = standing.requirement?.skills?.[skill] ?? standing.requirement?.level;
  const have = skills?.[skill]?.level;
  return Boolean(want && have && levelIndex(have) >= levelIndex(want));
}
