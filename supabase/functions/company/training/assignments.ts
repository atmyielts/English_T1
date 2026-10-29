// Training plan: HR assigns a track, a target level and a due date to everyone,
// departments or people (company_assignments) and sees completion. Progress of
// people who have not agreed to share it is left out of the numbers.
import { HR_ROLES, LEAD_ROLES, LEVELS, levelIndex, isLevel, type Level } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, oneOf, text, uuid } from '../util.ts';
import { isHr } from './shared.ts';
import { findTrack, TRACKS } from './tracks/index.ts';

export interface AssignmentRow {
  id: string; org_id: string; track_code: string | null; target_level: Level | null; due_date: string | null;
  department_id: string | null; member_id: string | null; note: string | null; status: 'active' | 'done' | 'cancelled';
  created_by: string | null; created_at: string; updated_at?: string;
}
export const ASSIGNMENT_COLUMNS = 'id,org_id,track_code,target_level,due_date,department_id,member_id,note,status,created_by,created_at,updated_at';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PEOPLE = 500;

/** Whether the assignment is meant for this member. */
export const appliesTo = (assignment: AssignmentRow, member: Pick<MemberRow, 'id' | 'department_id' | 'role'>) =>
  assignment.member_id ? assignment.member_id === member.id
    : assignment.department_id ? assignment.department_id === member.department_id
    : member.role === 'employee' || member.role === 'manager';

export interface PersonProgress {
  member_id: string; full_name: string | null; email: string | null; department_id: string | null; level: string | null;
  shared: boolean; lessons_done: number | null; lessons_total: number; meets_target: boolean | null; done: boolean | null; last_active: string | null;
}

/** One person's standing against an assignment (null fields when they have not agreed to share). */
export function personProgress(assignment: AssignmentRow, member: MemberRow, completed: Set<string>, lastActive: string | null): PersonProgress {
  const track = assignment.track_code ? findTrack(assignment.track_code) : undefined;
  const total = track?.lessons.length ?? 0;
  const shared = Boolean(member.consent_at);
  const done = track ? track.lessons.filter((lesson) => completed.has(`${member.id}:${lesson.code}`)).length : 0;
  // The level comes from company tests, which HR may always see.
  const meets = assignment.target_level ? Boolean(member.level && isLevel(member.level) && levelIndex(member.level) >= levelIndex(assignment.target_level)) : true;
  return {
    member_id: member.id, full_name: member.full_name, email: member.email, department_id: member.department_id, level: member.level,
    shared, lessons_total: total, lessons_done: shared ? done : null,
    meets_target: assignment.target_level ? meets : null,
    done: shared ? (done >= total) && meets : null,
    last_active: shared ? lastActive : null,
  };
}

export function summarise(people: PersonProgress[], today: string, assignment: AssignmentRow) {
  const shared = people.filter((person) => person.shared);
  const done = shared.filter((person) => person.done).length;
  const lessonShare = shared.length && assignment.track_code
    ? Math.round(shared.reduce((sum, person) => sum + (person.lessons_total ? (person.lessons_done ?? 0) / person.lessons_total : 0), 0) / shared.length * 100)
    : null;
  return {
    people: people.length, shared: shared.length, hidden: people.length - shared.length, done,
    completion: shared.length ? Math.round(done / shared.length * 100) : null,
    lessons_percent: lessonShare,
    at_target: assignment.target_level ? people.filter((person) => person.meets_target).length : null,
    overdue: assignment.status === 'active' && assignment.due_date !== null && assignment.due_date < today,
  };
}

async function context(ctx: Ctx) {
  const members = check<MemberRow[]>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'active'));
  const progress = check<{ member_id: string; lesson_code: string; status: string; updated_at: string | null }[]>(
    await ctx.db.from('company_lesson_progress').select('member_id,lesson_code,status,updated_at').eq('org_id', ctx.org!.id),
  );
  const completed = new Set(progress.filter((row) => row.status === 'completed').map((row) => `${row.member_id}:${row.lesson_code}`));
  const last = new Map<string, string>();
  for (const row of progress) if (row.updated_at && (last.get(row.member_id) ?? '') < row.updated_at) last.set(row.member_id, row.updated_at);
  return { members, completed, last };
}

/** Managers see assignments for their department, their people or everyone. */
function visibleTo(ctx: Ctx, members: MemberRow[]) {
  if (isHr(ctx)) return () => true;
  const department = ctx.member?.department_id ?? null;
  const mine = new Set(members.filter((member) => department && member.department_id === department).map((member) => member.id));
  return (row: AssignmentRow) => (!row.department_id && !row.member_id) || (department !== null && row.department_id === department) || (row.member_id !== null && mine.has(row.member_id));
}

function assignmentView(row: AssignmentRow, members: MemberRow[], completed: Set<string>, last: Map<string, string>, today: string, departmentOf?: string | null) {
  const people = members.filter((member) => appliesTo(row, member) && (departmentOf === undefined || member.department_id === departmentOf))
    .map((member) => personProgress(row, member, completed, last.get(member.id) ?? null));
  const track = row.track_code ? findTrack(row.track_code) : undefined;
  return { assignment: { ...row, track_title: track?.title ?? null, track_lessons: track?.lessons.length ?? 0 }, people, stats: summarise(people, today, row) };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/assignments', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const rows = check<AssignmentRow[]>(await ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('org_id', ctx.org!.id).order('created_at', { ascending: false }));
      const { members, completed, last } = await context(ctx);
      const today = ctx.now().toISOString().slice(0, 10);
      // Managers count only their own department's people.
      const scope = isHr(ctx) ? undefined : ctx.member?.department_id ?? null;
      const visible = visibleTo(ctx, members);
      return {
        can_manage: isHr(ctx),
        tracks: TRACKS.map((track) => ({ code: track.code, title: track.title, lessons: track.lessons.length })),
        people: isHr(ctx) ? members.filter((member) => member.role === 'employee' || member.role === 'manager').map((member) => ({ id: member.id, full_name: member.full_name, email: member.email, department_id: member.department_id, job_role: member.job_role, level: member.level })) : [],
        assignments: rows.filter(visible).map((row) => {
          const { assignment, stats } = assignmentView(row, members, completed, last, today, scope);
          const person = row.member_id ? members.find((member) => member.id === row.member_id) : null;
          return { ...assignment, person_name: person ? person.full_name ?? person.email : null, stats };
        }),
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/assignments/:assignment', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const row = check<AssignmentRow | null>(await ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('id', uuid(params.assignment, 'assignment')).eq('org_id', ctx.org!.id).maybeSingle());
      const { members, completed, last } = await context(ctx);
      if (!row || !visibleTo(ctx, members)(row)) throw new CompanyError('assignment_not_found', 'Assignment not found.', 404);
      const scope = isHr(ctx) ? undefined : ctx.member?.department_id ?? null;
      return assignmentView(row, members, completed, last, ctx.now().toISOString().slice(0, 10), scope);
    },
  },
  {
    // One row per department or person; `scope: 'all'` makes one row for everyone.
    method: 'POST', path: 'orgs/:org/assignments', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const trackCode = input.track_code === undefined || input.track_code === null || input.track_code === '' ? null : String(input.track_code);
      if (trackCode && !findTrack(trackCode)) throw new CompanyError('invalid_field', 'track_code is not a track.', 400, { field: 'track_code' });
      const target = input.target_level === undefined || input.target_level === null || input.target_level === '' ? null : oneOf<Level>(input.target_level, LEVELS, 'target_level');
      if (!trackCode && !target) throw new CompanyError('assignment_empty', 'Choose a track, a target level or both.', 400, { field: 'track_code' });
      const due = input.due_date === undefined || input.due_date === null || input.due_date === '' ? null : String(input.due_date);
      if (due && (!DATE.test(due) || Number.isNaN(Date.parse(due)))) throw new CompanyError('invalid_field', 'due_date must be a date.', 400, { field: 'due_date' });
      if (due && due < ctx.now().toISOString().slice(0, 10)) throw new CompanyError('invalid_field', 'due_date is in the past.', 400, { field: 'due_date' });
      const note = text(input.note, 'note', { max: 1000, optional: true });
      const scope = oneOf(input.scope, ['all', 'departments', 'people'] as const, 'scope');
      const base = { org_id: ctx.org!.id, track_code: trackCode, target_level: target, due_date: due, note, status: 'active', created_by: ctx.user };
      let rows: Record<string, unknown>[];
      if (scope === 'all') rows = [{ ...base, department_id: null, member_id: null }];
      else if (scope === 'departments') {
        const wanted = Array.isArray(input.department_ids) ? [...new Set(input.department_ids.map((id) => uuid(id, 'department_ids')))] : [];
        const departments = new Set(check<{ id: string }[]>(await ctx.db.from('company_departments').select('id').eq('org_id', ctx.org!.id)).map((row) => row.id));
        if (!wanted.length || wanted.some((id) => !departments.has(id))) throw new CompanyError('invalid_field', 'Choose departments of this workspace.', 400, { field: 'department_ids' });
        rows = wanted.map((id) => ({ ...base, department_id: id, member_id: null }));
      } else {
        const wanted = Array.isArray(input.member_ids) ? [...new Set(input.member_ids.map((id) => uuid(id, 'member_ids')))] : [];
        if (wanted.length > MAX_PEOPLE) throw new CompanyError('invalid_field', `Choose up to ${MAX_PEOPLE} people.`, 400, { field: 'member_ids' });
        const members = new Set(check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', ctx.org!.id).neq('status', 'removed')).map((row) => row.id));
        if (!wanted.length || wanted.some((id) => !members.has(id))) throw new CompanyError('invalid_field', 'Choose people of this workspace.', 400, { field: 'member_ids' });
        rows = wanted.map((id) => ({ ...base, department_id: null, member_id: id }));
      }
      const created = check<AssignmentRow[]>(await ctx.db.from('company_assignments').insert(rows).select(ASSIGNMENT_COLUMNS));
      await ctx.audit('assignment.created', null, { count: created.length, scope, track_code: trackCode, target_level: target, due_date: due });
      return { created: created.length, assignments: created };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/assignments/:assignment', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const id = uuid(params.assignment, 'assignment');
      const row = check<AssignmentRow | null>(await ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
      if (!row) throw new CompanyError('assignment_not_found', 'Assignment not found.', 404);
      const input = obj(body);
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = oneOf(input.status, ['active', 'done', 'cancelled'] as const, 'status');
      if (input.due_date !== undefined) {
        const due = input.due_date === null || input.due_date === '' ? null : String(input.due_date);
        if (due && (!DATE.test(due) || Number.isNaN(Date.parse(due)))) throw new CompanyError('invalid_field', 'due_date must be a date.', 400, { field: 'due_date' });
        patch.due_date = due;
      }
      if (input.note !== undefined) patch.note = text(input.note, 'note', { max: 1000, optional: true });
      if (!Object.keys(patch).length) return { assignment: row };
      check(await ctx.db.from('company_assignments').update(patch).eq('id', id));
      await ctx.audit('assignment.updated', id, patch);
      return { assignment: { ...row, ...patch } };
    },
  },
];
