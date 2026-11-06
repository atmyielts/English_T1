// What a member still has to do, with dates: the in-app reminders' source, and HR's bulk
// re-assign of overdue work. GET orgs/:org/training/due is the contract the connect
// area reads; nothing here sends a message to anyone.
import { HR_ROLES, isLevel, levelIndex } from '../../../../packages/company-core/src/mod.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, isCalendarDate, obj, oneOf, tashkentDay, text, uuid } from '../util.ts';
import { activeAssignments, appliesTo, ASSIGNMENT_COLUMNS, assignedContent, context, type AssignmentRow } from './assignments.ts';
import type { Localized } from './content.ts';
import { liveCourses } from './custom.ts';
import { memberProgress } from './lessons.ts';
import { myPath } from './paths.ts';

const DAY = 86_400_000;
/** Due within this many days counts as due soon. */
export const DUE_SOON_DAYS = 7;
const MAX_BULK = 200;

export interface DueItem {
  id: string; kind: 'assignment' | 'path'; title: Localized | null; target_level: string | null; due_date: string | null; note: string | null;
  overdue: boolean; due_soon: boolean; days_left: number | null; lessons_done: number; lessons_total: number; href: string;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const meets = (member: Pick<MemberRow, 'level'>, target: string | null) => !target || (isLevel(member.level) && isLevel(target) && levelIndex(member.level) >= levelIndex(target));

function dated(due: string | null, today: string) {
  const left = due ? daysBetween(today, due) : null;
  return { due_date: due, days_left: left, overdue: left !== null && left < 0, due_soon: left !== null && left >= 0 && left <= DUE_SOON_DAYS };
}

/** Everything still open for this member, most urgent first. */
export async function dueFor(ctx: Ctx, member: MemberRow): Promise<DueItem[]> {
  const org = ctx.org!.id, today = tashkentDay(ctx.now());
  const [rows, progress, courses] = await Promise.all([activeAssignments(ctx, member), memberProgress(ctx, member.id), liveCourses(ctx)]);
  const completed = new Set(progress.filter((row) => row.status === 'completed').map((row) => row.lesson_code));
  const items: DueItem[] = [];
  for (const row of rows.filter((entry) => appliesTo(entry, member))) {
    const content = assignedContent(row.track_code, courses);
    const done = content ? content.codes.filter((code) => completed.has(code)).length : 0;
    const total = content?.codes.length ?? 0;
    if (done >= total && meets(member, row.target_level)) continue;
    items.push({
      id: row.id, kind: 'assignment', title: content?.title ?? null, target_level: row.target_level, note: row.note, ...dated(row.due_date, today), lessons_done: done, lessons_total: total,
      href: row.track_code ? `/w/${org}/learn?track=${encodeURIComponent(row.track_code)}` : `/w/${org}/me`,
    });
  }
  const path = await myPath(ctx, member);
  if (path.source !== 'suggested' && path.due_date) {
    const total = path.steps.reduce((sum, step) => sum + step.lessons, 0), done = path.steps.reduce((sum, step) => sum + (step.done ?? 0), 0);
    if (done < total) items.push({ id: `path-${member.id}`, kind: 'path', title: null, target_level: path.target_level, note: null, ...dated(path.due_date, today), lessons_done: done, lessons_total: total, href: `/w/${org}/my-path` });
  }
  return items.sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : (a.due_date ?? '9999') > (b.due_date ?? '9999') ? 1 : 0);
}

export const routes: Route[] = [
  {
    // The signed-in member's own open items, for the reminders list and the bell.
    method: 'GET', path: 'orgs/:org/training/due', access: 'org', allowSuspended: true,
    async handle(ctx) {
      if (!ctx.member) return { items: [], overdue: 0, due_soon: 0 };
      const items = await dueFor(ctx, ctx.member);
      return { items, overdue: items.filter((item) => item.overdue).length, due_soon: items.filter((item) => item.due_soon).length };
    },
  },
  {
    // HR moves overdue work on. `extend` gives the selected assignments a new date. `unfinished` closes a
    // group assignment and gives each person not known to have finished a personal one with the new date.
    // Someone who has not agreed to share counts as unfinished: HR must not learn from this who has finished.
    method: 'POST', path: 'orgs/:org/assignments/reassign', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const mode = oneOf(input.mode, ['extend', 'unfinished'] as const, 'mode');
      const ids = Array.isArray(input.assignment_ids) ? [...new Set(input.assignment_ids.map((id) => uuid(id, 'assignment_ids')))] : [];
      if (!ids.length || ids.length > MAX_BULK) throw new CompanyError('invalid_field', `Choose 1–${MAX_BULK} assignments.`, 400, { field: 'assignment_ids' });
      const due = String(input.due_date ?? '');
      if (!isCalendarDate(due)) throw new CompanyError('invalid_field', 'due_date must be a date.', 400, { field: 'due_date' });
      if (due < tashkentDay(ctx.now())) throw new CompanyError('invalid_field', 'due_date is in the past.', 400, { field: 'due_date' });
      const note = text(input.note, 'note', { max: 1000, optional: true });
      const rows = await inChunks(ids, async (chunk) => check<AssignmentRow[]>(await ctx.db.from('company_assignments').select(ASSIGNMENT_COLUMNS).in('id', chunk).eq('org_id', ctx.org!.id)));
      if (rows.length !== ids.length) throw new CompanyError('assignment_not_found', 'Assignment not found.', 404);
      let extended = 0, created = 0, skipped = 0;
      const { members, completed, courses } = mode === 'unfinished' ? await context(ctx) : { members: [] as MemberRow[], completed: new Set<string>(), courses: [] as Awaited<ReturnType<typeof liveCourses>> };
      for (const row of rows) {
        if (mode === 'extend' || row.member_id) {
          check(await ctx.db.from('company_assignments').update({ due_date: due, status: 'active', ...(note ? { note } : {}) }).eq('id', row.id));
          extended++;
          continue;
        }
        // The database picks one request, so a double click makes the personal assignments once.
        const claimed = check<{ id: string }[]>(await ctx.db.from('company_assignments').update({ status: 'done' }).eq('id', row.id).eq('status', 'active').select('id'));
        if (!claimed.length) { skipped++; continue; }
        const content = assignedContent(row.track_code, courses);
        const unfinished = members.filter((member) => appliesTo(row, member)).filter((member) => {
          if (!member.consent_at) return true;
          const lessonsDone = content ? content.codes.every((code) => completed.has(`${member.id}:${code}`)) : true;
          return !(lessonsDone && meets(member, row.target_level));
        });
        for (let from = 0; from < unfinished.length; from += 200) {
          const fresh = unfinished.slice(from, from + 200).map((member) => ({ org_id: row.org_id, track_code: row.track_code, target_level: row.target_level, due_date: due, department_id: null, member_id: member.id, note: note ?? row.note, status: 'active', created_by: ctx.user }));
          check(await ctx.db.from('company_assignments').insert(fresh));
        }
        created += unfinished.length;
      }
      await ctx.audit('assignment.reassigned', null, { mode, assignments: ids.length, extended, created, skipped, due_date: due });
      return { extended, created, skipped };
    },
  },
];
