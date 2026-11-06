// Competency framework: the level HR requires for a job role and/or department,
// overall and per skill, with a due date. A person answers to the most specific
// requirement that matches them. Level results come from company tests, which HR
// may see without consent, so nothing here reads learning detail.
import {
  HR_ROLES, INDUSTRY_ROLES, isJobRole, isLevel, isSkill, JOB_ROLES, LEAD_ROLES, LEVELS, levelIndex, scoreToLevel,
  type JobRole, type Level, type Skill,
} from '../../../../packages/company-core/src/mod.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type Db, type MemberRow, type Route } from '../types.ts';
import { inChunks, isCalendarDate, obj, oneOf, text } from '../util.ts';
import { addDays, dayStart, fetchAll, isLearner, loadScope, localDate, type Department } from './common.ts';

export interface RequirementRow {
  id: string; org_id: string; job_role: string | null; department_id: string | null; level: Level; skills: Partial<Record<Skill, Level>>;
  due_date: string | null; source: 'hr' | 'suggestion'; note: string | null; created_at?: string; updated_at?: string;
}
export const REQUIREMENT_COLUMNS = 'id,org_id,job_role,department_id,level,skills,due_date,source,note,created_at,updated_at';

/**
 * Starting points by job role, offered and always marked as Schood suggestions.
 * They are this product's opinion of what a role tends to use day to day, not a
 * standard or research finding, and HR is expected to change them.
 */
type Suggestion = { level: Level; skills: Partial<Record<Skill, Level>> };
export const SUGGESTIONS: Partial<Record<JobRole, Suggestion>> = {
  general: { level: 'b1', skills: {} },
  customer_service: { level: 'b1', skills: { speaking: 'b1', listening: 'b1' } },
  sales: { level: 'b2', skills: { speaking: 'b2' } },
  hospitality: { level: 'b1', skills: { speaking: 'b1', listening: 'b1' } },
  banking_finance: { level: 'b1', skills: { reading: 'b1', writing: 'b1' } },
  it_software: { level: 'b1', skills: { reading: 'b2' } },
  healthcare: { level: 'b1', skills: { listening: 'b1', speaking: 'b1' } },
  logistics: { level: 'a2', skills: { reading: 'b1' } },
  office_admin: { level: 'b1', skills: { writing: 'b1' } },
  management: { level: 'b2', skills: { speaking: 'b2', writing: 'b1' } },
  engineering: { level: 'b1', skills: { reading: 'b1' } },
  call_centre: { level: 'b1', skills: { speaking: 'b1', listening: 'b1' } },
  retail: { level: 'a2', skills: { speaking: 'b1' } },
  tourism: { level: 'b1', skills: { speaking: 'b1', listening: 'b1' } },
};
/** A job role added later gets the plain workplace suggestion until it has its own. */
const suggestionFor = (role: JobRole): Suggestion => SUGGESTIONS[role] ?? SUGGESTIONS.general!;
function isSuggested(role: string | null, level: Level, skills: Partial<Record<Skill, Level>>): boolean {
  if (!role || !isJobRole(role)) return false;
  const suggested = suggestionFor(role);
  const same = (a: Partial<Record<Skill, Level>>, b: Partial<Record<Skill, Level>>) => Object.entries(a).every(([skill, value]) => b[skill as Skill] === value);
  return suggested.level === level && same(suggested.skills, skills) && same(skills, suggested.skills);
}

// ---------------------------------------------------------------------------
// Who answers to which requirement
// ---------------------------------------------------------------------------

const specificity = (row: Pick<RequirementRow, 'job_role' | 'department_id'>) => row.job_role && row.department_id ? 3 : row.department_id ? 2 : row.job_role ? 1 : 0;

/** The most specific requirement for a member: role and department, then department, then role, then the whole company. */
export function requirementFor(rows: RequirementRow[], member: Pick<MemberRow, 'job_role' | 'department_id'>): RequirementRow | null {
  let best: RequirementRow | null = null;
  for (const row of rows) {
    if (row.job_role && row.job_role !== member.job_role) continue;
    if (row.department_id && row.department_id !== member.department_id) continue;
    if (!best || specificity(row) > specificity(best)) best = row;
  }
  return best;
}

export type SkillResults = Partial<Record<Skill, { score: number | null; level: Level }>>;
export interface AttemptWithSkills {
  id: string; member_id: string | null; overall_level: string | null; overall_score: number | null; graded_at: string | null; started_at?: string;
  skill_results: Record<string, { score?: unknown; level?: unknown }> | null; status: string; decision?: string | null; assessment_id?: string;
}

/** Graded staff attempts with skill results, oldest first, read a page at a time. */
export async function gradedWithSkills(db: Db, orgId: string, before?: Date): Promise<AttemptWithSkills[]> {
  const rows = await fetchAll<AttemptWithSkills>(() => {
    let query = db.from('company_attempts').select('id,member_id,assessment_id,overall_level,overall_score,skill_results,graded_at,started_at,status,decision')
      .eq('org_id', orgId).eq('status', 'graded').not('member_id', 'is', null);
    if (before) query = query.lt('graded_at', before.toISOString());
    return query.order('graded_at', { ascending: true }).order('id');
  }, 20_000);
  return rows.filter((row) => row.graded_at && isLevel(row.overall_level));
}

/** Each member's latest result per skill before `at` (or ever). */
export function latestSkills(attempts: AttemptWithSkills[], at?: Date): Map<string, SkillResults> {
  const out = new Map<string, SkillResults>();
  for (const attempt of attempts) {
    if (!attempt.member_id || !attempt.graded_at || (at && Date.parse(attempt.graded_at) >= at.getTime())) continue;
    const skills = out.get(attempt.member_id) ?? {};
    for (const [skill, result] of Object.entries(attempt.skill_results ?? {})) {
      if (!isSkill(skill) || !result) continue;
      const score = Number(result.score);
      const known = Number.isFinite(score);
      const level = isLevel(result.level) ? result.level : known ? scoreToLevel(score) : null;
      if (level) skills[skill] = { score: known ? score : null, level };
    }
    out.set(attempt.member_id, skills);
  }
  return out;
}

export interface Gap { skill: Skill | 'overall'; have: Level | null; want: Level }
export interface Standing { requirement: RequirementRow | null; meets: boolean; gaps: Gap[]; overdue: boolean; due_soon: boolean; untested: boolean }
const below = (have: Level | null | undefined, want: Level) => !have || levelIndex(have) < levelIndex(want);

/** How one person stands against their requirement. `level` is their level at the moment being judged. */
export function standingOf(rows: RequirementRow[], member: Pick<MemberRow, 'job_role' | 'department_id'>, level: string | null, skills: SkillResults | undefined, today: string): Standing {
  const requirement = requirementFor(rows, member);
  const have = isLevel(level) ? level : null;
  if (!requirement) return { requirement: null, meets: false, gaps: [], overdue: false, due_soon: false, untested: !have };
  const gaps: Gap[] = [];
  if (below(have, requirement.level)) gaps.push({ skill: 'overall', have, want: requirement.level });
  for (const [skill, want] of Object.entries(requirement.skills ?? {})) {
    if (isSkill(skill) && isLevel(want) && below(skills?.[skill]?.level, want)) gaps.push({ skill, have: skills?.[skill]?.level ?? null, want });
  }
  const meets = gaps.length === 0;
  const due = requirement.due_date;
  return { requirement, meets, gaps, overdue: !meets && Boolean(due && due < today), due_soon: !meets && Boolean(due && due >= today && due <= addDays(today, 30)), untested: !have };
}

export const percent = (part: number, whole: number): number | null => whole > 0 ? Math.round(part / whole * 100) : null;

/** Everything the gap views need, in the viewer's scope. */
export async function loadFramework(ctx: Ctx) {
  const today = localDate(ctx.now());
  const [scope, requirements, attempts] = await Promise.all([
    loadScope(ctx),
    readRequirements(ctx.db, ctx.org!.id),
    gradedWithSkills(ctx.db, ctx.org!.id),
  ]);
  const inScope = new Set(scope.members.map((member) => member.id));
  const scoped = attempts.filter((attempt) => attempt.member_id && inScope.has(attempt.member_id));
  const learners = scope.members.filter(isLearner);
  const skills = latestSkills(scoped);
  const standings = new Map(learners.map((member) => [member.id, standingOf(requirements, member, member.level, skills.get(member.id), today)]));
  return { ...scope, today, requirements, attempts: scoped, learners, skills, standings };
}

export const readRequirements = async (db: Db, orgId: string): Promise<RequirementRow[]> =>
  (check<RequirementRow[]>(await db.from('company_level_requirements').select(REQUIREMENT_COLUMNS).eq('org_id', orgId).order('created_at').limit(1000)) ?? []).map((row) => ({ ...row, skills: row.skills ?? {} }));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function skillsInput(value: unknown): Partial<Record<Skill, Level>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new CompanyError('invalid_field', 'skills must list a level per skill.', 400, { field: 'skills' });
  const out: Partial<Record<Skill, Level>> = {};
  for (const [skill, level] of Object.entries(value as Record<string, unknown>)) {
    if (level === null || level === '') continue;
    if (!isSkill(skill) || !isLevel(level)) throw new CompanyError('invalid_field', 'skills must list a level per skill.', 400, { field: 'skills' });
    out[skill] = level;
  }
  return out;
}

function dueInput(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isCalendarDate(value)) throw new CompanyError('invalid_field', 'due_date must be a date.', 400, { field: 'due_date' });
  return value;
}

async function departmentInput(ctx: Ctx, value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw new CompanyError('invalid_field', 'department_id must be a department.', 400, { field: 'department_id' });
  const found = check<{ id: string } | null>(await ctx.db.from('company_departments').select('id').eq('org_id', ctx.org!.id).eq('id', value).maybeSingle());
  if (!found) throw new CompanyError('invalid_field', 'Choose a department of this workspace.', 400, { field: 'department_id' });
  return value;
}

const roleInput = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (!isJobRole(value)) throw new CompanyError('invalid_field', 'job_role is not a job role.', 400, { field: 'job_role' });
  return String(value);
};

const scopeTaken = () => new CompanyError('requirement_exists', 'There is already a requirement for this role and department. Change that one.', 409);

async function loadRow(ctx: Ctx, id: string): Promise<RequirementRow> {
  if (!UUID.test(id)) throw new CompanyError('requirement_not_found', 'Requirement not found.', 404);
  const row = check<RequirementRow | null>(await ctx.db.from('company_level_requirements').select(REQUIREMENT_COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('requirement_not_found', 'Requirement not found.', 404);
  return row;
}

/** How many learners a requirement currently decides for, so HR sees what a row does. */
function coverage(rows: RequirementRow[], learners: MemberRow[]) {
  const counts = new Map<string, number>();
  let none = 0;
  for (const member of learners) {
    const requirement = requirementFor(rows, member);
    if (requirement) counts.set(requirement.id, (counts.get(requirement.id) ?? 0) + 1);
    else none += 1;
  }
  return { counts, none };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/requirements', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const { requirements, learners, departments, viewer } = await loadFramework(ctx);
      const { counts, none } = coverage(requirements, learners);
      const roles = new Set(learners.map((member) => member.job_role));
      const covered = (role: string) => requirements.some((row) => row.job_role === role && !row.department_id);
      // The workspace's own job roles first, then those its industry usually has.
      const first = [...new Set([...roles, ...(INDUSTRY_ROLES[ctx.org!.industry as keyof typeof INDUSTRY_ROLES] ?? [])])];
      const ordered = [...first, ...JOB_ROLES.filter((role) => !first.includes(role))].filter(isJobRole);
      return {
        can_manage: viewer.hr,
        requirements: requirements.map((row) => ({ ...row, people: counts.get(row.id) ?? 0 })),
        without_requirement: none,
        departments: departments as Department[],
        suggestions: ordered.map((role) => ({ job_role: role, ...suggestionFor(role as JobRole), in_use: roles.has(role), covered: covered(role) })),
      };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/insights/requirements', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const job_role = roleInput(input.job_role), level = oneOf<Level>(input.level, LEVELS, 'level'), skills = skillsInput(input.skills);
      const row = checkUnique<RequirementRow>(await ctx.db.from('company_level_requirements').insert({
        org_id: ctx.org!.id,
        job_role,
        department_id: await departmentInput(ctx, input.department_id),
        level,
        skills,
        due_date: dueInput(input.due_date),
        // It carries the Schood label only while it still says what Schood suggested.
        source: oneOf(input.source, ['hr', 'suggestion'] as const, 'source', 'hr') === 'suggestion' && isSuggested(job_role, level, skills) ? 'suggestion' : 'hr',
        note: text(input.note, 'note', { max: 500, optional: true }),
        created_by: ctx.user,
      }).select(REQUIREMENT_COLUMNS).single(), scopeTaken);
      await ctx.audit('requirement.created', row.id, { job_role: row.job_role, department_id: row.department_id, level: row.level });
      return { requirement: row };
    },
  },
  {
    // Adds the suggestion for every job role in use that has no requirement yet. Running it twice adds nothing.
    method: 'POST', path: 'orgs/:org/insights/requirements/apply-suggestions', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body ?? {});
      const due = dueInput(input.due_date);
      const { requirements, learners } = await loadFramework(ctx);
      const wanted = [...new Set(learners.map((member) => member.job_role))].filter(isJobRole)
        .filter((role) => !requirements.some((row) => row.job_role === role && !row.department_id));
      if (!wanted.length) return { added: 0 };
      const rows = wanted.map((role) => ({ org_id: ctx.org!.id, job_role: role, department_id: null, ...suggestionFor(role as JobRole), due_date: due, source: 'suggestion', created_by: ctx.user }));
      let added = 0;
      for (const row of rows) {
        // One at a time: a tab that got there first must not fail the rest.
        const { error } = await ctx.db.from('company_level_requirements').insert(row);
        if (!error) added += 1;
        else if (error.code !== '23505') check({ data: null, error });
      }
      await ctx.audit('requirement.suggestions_applied', null, { added });
      return { added };
    },
  },
  {
    // Copies each person's requirement to their own target, for those who have none, so it shows in My English.
    method: 'POST', path: 'orgs/:org/insights/requirements/sync-targets', access: 'org', roles: HR_ROLES,
    async handle(ctx) {
      const { learners, standings } = await loadFramework(ctx);
      const groups = new Map<string, { level: Level; due: string | null; ids: string[] }>();
      for (const member of learners) {
        const requirement = standings.get(member.id)?.requirement;
        if (!requirement || member.target_level) continue;
        const key = `${requirement.level}|${requirement.due_date ?? ''}`;
        const group = groups.get(key) ?? { level: requirement.level, due: requirement.due_date, ids: [] };
        group.ids.push(member.id);
        groups.set(key, group);
      }
      let updated = 0;
      for (const group of groups.values()) {
        await inChunks(group.ids, async (chunk) => {
          check(await ctx.db.from('company_members').update({ target_level: group.level, target_date: group.due }).eq('org_id', ctx.org!.id).is('target_level', null).in('id', chunk));
          return [];
        });
        updated += group.ids.length;
      }
      if (updated) await ctx.audit('requirement.targets_synced', null, { updated });
      return { updated };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/insights/requirements/:requirement', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body);
      const current = await loadRow(ctx, params.requirement);
      const patch: Record<string, unknown> = {};
      if (input.level !== undefined) patch.level = oneOf<Level>(input.level, LEVELS, 'level');
      if (input.skills !== undefined) patch.skills = skillsInput(input.skills);
      if (input.due_date !== undefined) patch.due_date = dueInput(input.due_date);
      if (input.note !== undefined) patch.note = text(input.note, 'note', { max: 500, optional: true });
      if (input.job_role !== undefined) patch.job_role = roleInput(input.job_role);
      if (input.department_id !== undefined) patch.department_id = await departmentInput(ctx, input.department_id);
      if (!Object.keys(patch).length) return { requirement: current };
      // Once HR changes it, it is theirs: it stops being marked as a Schood suggestion.
      patch.source = 'hr';
      const row = checkUnique<RequirementRow>(await ctx.db.from('company_level_requirements').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(REQUIREMENT_COLUMNS).single(), scopeTaken);
      await ctx.audit('requirement.updated', row.id, { fields: Object.keys(patch) });
      return { requirement: row };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/insights/requirements/:requirement', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await loadRow(ctx, params.requirement);
      check(await ctx.db.from('company_level_requirements').delete().eq('id', current.id).eq('org_id', ctx.org!.id));
      await ctx.audit('requirement.deleted', current.id, { job_role: current.job_role, department_id: current.department_id });
      return { ok: true };
    },
  },
];

/** The start of the month after `month` (YYYY-MM-01) as an instant in Tashkent. */
export const monthEnd = (month: string): Date => {
  const [year, value] = month.split('-').map(Number);
  return dayStart(new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10));
};
