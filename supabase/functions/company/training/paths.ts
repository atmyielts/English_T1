// Learning paths: from a person's level, target and job role, an ordered path across
// built-in tracks and company courses, with a planning estimate of the time to the
// target. HR can edit it, save it for a person or a whole department, and follow
// progress. Without consent HR sees the path but not the progress; managers see
// only their own department. The estimate is a planning figure, never a promise.
import { HR_ROLES, isJobRole, isLevel, LEAD_ROLES, LEVELS, levelGap, levelIndex, type Level } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { fetchAll, loadMember } from '../people/shared.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { isCalendarDate, obj, tashkentDay, uuid } from '../util.ts';
import type { Localized } from './content.ts';
import { courseIdOf, liveCourses, type LiveCourse } from './custom.ts';
import { memberProgress } from './lessons.ts';
import { canLearn, daysAgo, isHr, learner, seatReason } from './shared.ts';
import { findTrack, TRACKS } from './tracks/index.ts';

export type StepStage = 'foundation' | 'professional';
export interface PathStep { kind: 'track' | 'course'; code: string; stage?: StepStage | null }
export interface PathRow {
  id: string; org_id: string; member_id: string | null; department_id: string | null; target_level: Level | null; due_date: string | null;
  steps: PathStep[]; status: 'active' | 'archived'; created_at: string; updated_at: string;
}
const COLUMNS = 'id,org_id,member_id,department_id,target_level,due_date,steps,status,created_at,updated_at';

const MAX_STEPS = 30;
/** Planning figures, not measurements: about how long a lesson takes, and study hours per CEFR step up. */
export const LESSON_MINUTES = 25;
export const LEVEL_STEP_HOURS: Record<Level, number> = { pre_a1: 0, a1: 40, a2: 60, b1: 80, b2: 100, c1: 120, c2: 140 };
export const DEFAULT_MINUTES_PER_WEEK = 120;

const stageLessons = (code: string, stage?: StepStage | null) => {
  const track = findTrack(code);
  if (!track) return [];
  return track.lessons.filter((lesson) => !stage || lesson.stage === stage).map((lesson) => lesson.code);
};

/** The default target: one level up, and at least B1. */
export function defaultTarget(level: Level | null): Level {
  const next = Math.min(LEVELS.length - 1, (level ? levelIndex(level) : 0) + 1);
  return LEVELS[Math.max(next, levelIndex('b1'))];
}

/**
 * Orders the steps for one person. Basics first if they need them, then the job-role
 * track, the company's own courses as soon as the person can follow them, then the
 * professional stage. Pure, so the app's preview and the tests use the same rule.
 */
export function suggestPath(input: { level: Level | null; target: Level | null; jobRole: string; courses: Pick<LiveCourse, 'code' | 'job_role'>[] }): { steps: PathStep[]; target: Level } {
  const target = input.target ?? defaultTarget(input.level);
  const from = input.level ? levelIndex(input.level) : levelIndex('a2');
  const role = findTrack(input.jobRole) ? input.jobRole : 'general';
  const steps: PathStep[] = [];
  const add = (step: PathStep) => { if (!steps.some((entry) => entry.kind === step.kind && entry.code === step.code && entry.stage === step.stage)) steps.push(step); };
  if (from <= levelIndex('a1') && role !== 'general') add({ kind: 'track', code: 'general', stage: 'foundation' });
  if (from <= levelIndex('a2')) add({ kind: 'track', code: role, stage: 'foundation' });
  // Courses written for this job role come first, then those for everyone; another role's course is left out.
  const courses = input.courses.filter((course) => !course.job_role || course.job_role === role);
  for (const course of courses.filter((entry) => entry.job_role === role)) add({ kind: 'course', code: course.code });
  for (const course of courses.filter((entry) => !entry.job_role)) add({ kind: 'course', code: course.code });
  if (from === levelIndex('b1')) add({ kind: 'track', code: role, stage: 'foundation' });
  add({ kind: 'track', code: role, stage: 'professional' });
  if (levelIndex(target) >= levelIndex('b2') && role !== 'general') add({ kind: 'track', code: 'general', stage: 'professional' });
  return { steps, target };
}

export interface StepView { kind: 'track' | 'course'; code: string; stage: StepStage | null; title: Localized | null; lessons: number; done: number | null; next: { code: string; track_code: string } | null; available: boolean }

/** Steps with titles; `completed` is null when the viewer may not see this person's progress. */
export function stepViews(steps: PathStep[], courses: LiveCourse[], completed: Set<string> | null): StepView[] {
  return steps.map((step) => {
    const course = step.kind === 'course' ? courses.find((entry) => entry.code === step.code) : undefined;
    const track = step.kind === 'track' ? findTrack(step.code) : undefined;
    const codes = course ? course.lessons.map((lesson) => lesson.code) : track ? stageLessons(step.code, step.stage) : [];
    const nextCode = completed ? codes.find((code) => !completed.has(code)) : codes[0];
    return {
      kind: step.kind, code: step.code, stage: step.stage ?? null, title: course?.title ?? track?.title ?? null, lessons: codes.length,
      done: completed ? codes.filter((code) => completed.has(code)).length : null,
      next: nextCode ? { code: nextCode, track_code: step.code } : null,
      available: Boolean(course || track),
    };
  });
}

/** A planning estimate: remaining lessons or the level gap, whichever is more work, at this pace. */
export function estimate(views: StepView[], level: Level | null, target: Level | null, minutesPerWeek: number) {
  const remaining = views.reduce((sum, view) => sum + Math.max(0, view.lessons - (view.done ?? 0)), 0);
  const lessonHours = Math.round(remaining * LESSON_MINUTES / 6) / 10;
  const levelHours = !target ? 0 : LEVELS.slice((level ? levelIndex(level) : 0) + 1, levelIndex(target) + 1).reduce((sum, step) => sum + LEVEL_STEP_HOURS[step], 0);
  const hours = Math.max(lessonHours, levelHours);
  const pace = Math.max(15, minutesPerWeek);
  return { lessons_left: remaining, lesson_hours: lessonHours, level_hours: levelHours, hours, weeks: Math.ceil(hours * 60 / pace), minutes_per_week: pace };
}

/** Minutes a week over the last four weeks, when there is enough to go on. */
async function recentPace(ctx: Ctx, member: MemberRow): Promise<number | null> {
  const since = daysAgo(ctx.now(), 28).toISOString();
  const rows = await fetchAll<{ minutes: number }>(() => ctx.db.from('company_activity').select('minutes').eq('member_id', member.id).gte('created_at', since).order('id'), 5000);
  const total = rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0);
  return total >= 30 ? Math.round(total / 4) : null;
}

function readSteps(value: unknown, courses: LiveCourse[]): PathStep[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STEPS) throw new CompanyError('invalid_field', `A path has 1–${MAX_STEPS} steps.`, 400, { field: 'steps' });
  const seen = new Set<string>();
  return value.map((entry) => {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const code = String(raw.code ?? '');
    let step: PathStep;
    if (raw.kind === 'track') {
      if (!findTrack(code)) throw new CompanyError('invalid_field', 'A step is not a track.', 400, { field: 'steps' });
      step = { kind: 'track', code, stage: raw.stage === 'foundation' || raw.stage === 'professional' ? raw.stage : null };
    } else if (raw.kind === 'course') {
      if (!courseIdOf(code) || !courses.some((course) => course.code === code)) throw new CompanyError('invalid_field', 'A step is not a published course.', 400, { field: 'steps' });
      step = { kind: 'course', code };
    } else throw new CompanyError('invalid_field', 'A step is not a track or a course.', 400, { field: 'steps' });
    const key = `${step.kind}:${step.code}:${step.stage ?? ''}`;
    if (seen.has(key)) throw new CompanyError('invalid_field', 'A step repeats.', 400, { field: 'steps' });
    seen.add(key);
    return step;
  });
}

function readTarget(value: unknown): Level | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isLevel(value)) throw new CompanyError('invalid_field', 'target_level is not a level.', 400, { field: 'target_level' });
  return value;
}
function readDue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isCalendarDate(value)) throw new CompanyError('invalid_field', 'due_date must be a date.', 400, { field: 'due_date' });
  return value;
}

const activePaths = (ctx: Ctx) => fetchAll<PathRow>(() => ctx.db.from('company_learning_paths').select(COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'active').order('id'), 5000);

/** The path that applies to this person: their own, else their department's. */
export const pathFor = (paths: PathRow[], member: Pick<MemberRow, 'id' | 'department_id'>) =>
  paths.find((path) => path.member_id === member.id) ?? (member.department_id ? paths.find((path) => path.department_id === member.department_id) : undefined);

/** The learner's own view: their path or, until HR sets one, a suggestion. */
export async function myPath(ctx: Ctx, member: MemberRow) {
  const [paths, courses, progress, pace] = await Promise.all([activePaths(ctx), liveCourses(ctx), memberProgress(ctx, member.id), recentPace(ctx, member)]);
  const completed = new Set(progress.filter((row) => row.status === 'completed').map((row) => row.lesson_code));
  const saved = pathFor(paths, member);
  const level = isLevel(member.level) ? member.level : null;
  const memberTarget = isLevel(member.target_level) ? member.target_level : null;
  const suggestion = saved ? null : suggestPath({ level, target: memberTarget, jobRole: member.job_role, courses });
  const steps = saved?.steps ?? suggestion!.steps;
  const target = saved?.target_level ?? memberTarget ?? suggestion?.target ?? null;
  const views = stepViews(steps, courses, completed);
  return {
    source: saved ? (saved.member_id ? 'member' : 'department') : 'suggested',
    level, target_level: target, due_date: saved?.due_date ?? member.target_date,
    steps: views,
    can_learn: canLearn(ctx),
    seat_reason: seatReason(ctx),
    gap: target ? levelGap(level, target) : null,
    estimate: { ...estimate(views, level, target, pace ?? DEFAULT_MINUTES_PER_WEEK), pace: pace === null ? 'assumed' : 'recent' },
  };
}

const catalog = (courses: LiveCourse[]) => ({
  tracks: TRACKS.map((track) => ({ code: track.code, title: track.title, foundation: stageLessons(track.code, 'foundation').length, professional: stageLessons(track.code, 'professional').length })),
  courses: courses.map((course) => ({ code: course.code, title: course.title, lessons: course.lessons.length, job_role: course.job_role })),
});

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/my/path', access: 'org', allowSuspended: true,
    async handle(ctx) {
      return myPath(ctx, learner(ctx));
    },
  },
  {
    // Everyone's path at a glance. Managers see their own department only.
    method: 'GET', path: 'orgs/:org/paths', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!.id;
      const [members, paths, courses, progress] = await Promise.all([
        fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org).eq('status', 'active').order('id')),
        activePaths(ctx),
        liveCourses(ctx),
        fetchAll<{ member_id: string; lesson_code: string }>(() => ctx.db.from('company_lesson_progress').select('member_id,lesson_code').eq('org_id', org).eq('status', 'completed').order('id'), 200_000),
      ]);
      const hr = isHr(ctx), department = ctx.member?.department_id ?? null;
      const scoped = members.filter((member) => (member.role === 'employee' || member.role === 'manager') && (hr || (department !== null && member.department_id === department)));
      const completed = new Map<string, Set<string>>();
      for (const row of progress) (completed.get(row.member_id) ?? completed.set(row.member_id, new Set()).get(row.member_id)!).add(row.lesson_code);
      return {
        can_manage: hr,
        catalog: catalog(courses),
        department_paths: paths.filter((path) => path.department_id && (hr || path.department_id === department)).map((path) => ({ ...path, steps: stepViews(path.steps, courses, null) })),
        people: scoped.map((member) => {
          const path = pathFor(paths, member);
          const shared = Boolean(member.consent_at);
          const views = path ? stepViews(path.steps, courses, shared ? completed.get(member.id) ?? new Set() : null) : [];
          const total = views.reduce((sum, view) => sum + view.lessons, 0);
          return {
            id: member.id, full_name: member.full_name, email: member.email, department_id: member.department_id, job_role: member.job_role, level: member.level, target_level: member.target_level,
            shared,
            path: path ? { id: path.id, source: path.member_id ? 'member' : 'department', steps: views.length, target_level: path.target_level, due_date: path.due_date, lessons: total, done: shared ? views.reduce((sum, view) => sum + (view.done ?? 0), 0) : null } : null,
          };
        }),
      };
    },
  },
  {
    // One person's path, with a suggestion to start from. Progress only with their consent.
    method: 'GET', path: 'orgs/:org/paths/member/:member', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const member = await loadMember(ctx, ctx.org!.id, params.member);
      if (!isHr(ctx) && (!ctx.member?.department_id || member.department_id !== ctx.member.department_id)) throw new CompanyError('member_not_found', 'Person not found.', 404);
      const shared = Boolean(member.consent_at);
      const [paths, courses, progress] = await Promise.all([activePaths(ctx), liveCourses(ctx), shared ? memberProgress(ctx, member.id) : Promise.resolve([])]);
      const completed = shared ? new Set(progress.filter((row) => row.status === 'completed').map((row) => row.lesson_code)) : null;
      const path = pathFor(paths, member);
      const level = isLevel(member.level) ? member.level : null;
      const suggestion = suggestPath({ level, target: isLevel(member.target_level) ? member.target_level : null, jobRole: member.job_role, courses });
      const steps = path?.steps ?? suggestion.steps;
      const target = path?.target_level ?? suggestion.target;
      const views = stepViews(steps, courses, completed);
      return {
        member: { id: member.id, full_name: member.full_name, email: member.email, job_role: member.job_role, department_id: member.department_id, level: member.level, target_level: member.target_level },
        shared,
        path: path ? { ...path, source: path.member_id ? 'member' : 'department' } : null,
        steps: views,
        suggestion: { steps: suggestion.steps, target: suggestion.target },
        target_level: target,
        estimate: { ...estimate(views, level, target, DEFAULT_MINUTES_PER_WEEK), pace: 'assumed' },
        can_manage: isHr(ctx),
        catalog: catalog(courses),
      };
    },
  },
  {
    // A suggestion for a department: its usual job role and a target, no one's data.
    method: 'POST', path: 'orgs/:org/paths/suggest', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const courses = await liveCourses(ctx);
      const level = isLevel(input.level) ? input.level : null;
      const jobRole = isJobRole(input.job_role) ? input.job_role : 'general';
      const { steps, target } = suggestPath({ level, target: readTarget(input.target_level), jobRole, courses });
      const views = stepViews(steps, courses, null);
      return { steps: views, target_level: target, estimate: { ...estimate(views, level, target, DEFAULT_MINUTES_PER_WEEK), pace: 'assumed' } };
    },
  },
  {
    // Saves a person's or a department's path; a second save replaces the first.
    method: 'POST', path: 'orgs/:org/paths', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const memberId = input.member_id ? uuid(input.member_id, 'member_id') : null;
      const departmentId = input.department_id ? uuid(input.department_id, 'department_id') : null;
      if (Boolean(memberId) === Boolean(departmentId)) throw new CompanyError('invalid_field', 'Choose a person or a department.', 400, { field: 'member_id' });
      if (memberId) {
        const person = await loadMember(ctx, ctx.org!.id, memberId);
        if (person.status === 'removed') throw new CompanyError('member_not_found', 'Person not found.', 404);
      }
      else if (!check<{ id: string } | null>(await ctx.db.from('company_departments').select('id').eq('id', departmentId).eq('org_id', ctx.org!.id).maybeSingle())) throw new CompanyError('invalid_field', 'Choose a department of this workspace.', 400, { field: 'department_id' });
      const fields = { steps: readSteps(input.steps, await liveCourses(ctx)), target_level: readTarget(input.target_level), due_date: readDue(input.due_date) };
      const scope = memberId ? 'member_id' : 'department_id', scopeId = memberId ?? departmentId;
      const read = () => ctx.db.from('company_learning_paths').select(COLUMNS).eq('org_id', ctx.org!.id).eq(scope, scopeId).eq('status', 'active').maybeSingle();
      const existing = check<PathRow | null>(await read());
      // A date already on the path may stay when HR changes something else; a new one cannot be in the past.
      if (fields.due_date && fields.due_date < tashkentDay(ctx.now()) && fields.due_date !== existing?.due_date) throw new CompanyError('invalid_field', 'due_date is in the past.', 400, { field: 'due_date' });
      if (existing) {
        check(await ctx.db.from('company_learning_paths').update(fields).eq('id', existing.id));
        await ctx.audit('path.updated', existing.id, { scope, steps: fields.steps.length });
        return { path: { ...existing, ...fields } };
      }
      const created = await ctx.db.from('company_learning_paths').insert({ org_id: ctx.org!.id, member_id: memberId, department_id: departmentId, ...fields, status: 'active', created_by: ctx.user }).select(COLUMNS).single();
      // Saved twice at once: the unique index let the other request make the row, so this one updates it.
      if (created.error?.code === '23505') {
        const other = check<PathRow | null>(await read());
        if (!other) throw new CompanyError('path_conflict', 'This path was just changed. Reload the page.', 409);
        check(await ctx.db.from('company_learning_paths').update(fields).eq('id', other.id));
        return { path: { ...other, ...fields } };
      }
      const row = check<PathRow>(created);
      await ctx.audit('path.created', row.id, { scope, steps: fields.steps.length });
      return { path: row };
    },
  },
  {
    // Removing a path just stops it applying; people's lessons stay done.
    method: 'DELETE', path: 'orgs/:org/paths/:path', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const id = uuid(params.path, 'path');
      const row = check<PathRow | null>(await ctx.db.from('company_learning_paths').select(COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
      if (!row) throw new CompanyError('path_not_found', 'This path was not found.', 404);
      check(await ctx.db.from('company_learning_paths').update({ status: 'archived' }).eq('id', id));
      await ctx.audit('path.removed', id);
      return { ok: true };
    },
  },
];
