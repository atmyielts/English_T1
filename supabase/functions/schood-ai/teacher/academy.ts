import { isUuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { teacherDeps } from './deps.ts';

// Academy, read and written only through its own API with the teacher's token, so
// Academy's roles decide (a teacher sees and assigns to their own classrooms only).
//   academy           action `academies`, `classrooms`, `create_assignment`
//   academy-learning  action `homework_mistakes` (Homework OS mistake tags per group)

export interface AcademyGroupView { academy_id: string; academy_name: string; classroom_id: string; name: string; students: number | null }
interface AcademyRow { id?: unknown; name?: unknown }
interface ClassroomRow { id?: unknown; name?: unknown; member_count?: unknown; is_active?: unknown }

const call = async <T>(ctx: RequestContext, name: string, body: Record<string, unknown>) => (await teacherDeps()).callFunction<T>(ctx, name, '', { method: 'POST', body, timeoutMs: 8_000 });

/** The teacher's academies and active classrooms; [] when they have none or Academy is unreachable. */
export async function academyGroups(ctx: RequestContext): Promise<{ groups: AcademyGroupView[]; unavailable: boolean }> {
  const access = await ctx.workspace();
  let academies: { id: string; name: string }[] = [];
  try {
    const data = await call<{ academies?: AcademyRow[] }>(ctx, 'academy', { action: 'academies' });
    academies = (data?.academies ?? []).filter((row) => isUuid(row?.id)).map((row) => ({ id: String(row.id), name: String(row.name ?? '').slice(0, 200) }));
  } catch (cause) {
    if (cause instanceof SchoodAIError && cause.code === 'user_token_required') throw cause;
    return { groups: [], unavailable: true };
  }
  // A centre workspace linked to an Academy tenant shows only that academy.
  if (access.workspace.academyTenantId) academies = academies.filter((academy) => academy.id === access.workspace.academyTenantId);
  const groups: AcademyGroupView[] = [];
  let unavailable = false;
  for (const academy of academies.slice(0, 5)) {
    try {
      const data = await call<{ classrooms?: ClassroomRow[] }>(ctx, 'academy', { action: 'classrooms', academy_id: academy.id, limit: 100 });
      for (const row of data?.classrooms ?? []) {
        if (typeof row?.id !== 'string' || row.is_active === false) continue;
        groups.push({ academy_id: academy.id, academy_name: academy.name, classroom_id: row.id.slice(0, 64), name: String(row.name ?? '').slice(0, 200), students: typeof row.member_count === 'number' ? row.member_count : null });
      }
    } catch { unavailable = true; }
  }
  return { groups, unavailable };
}

export interface WeakSpot { tag: string; open: number; total: number; label: string }
/** A group's most common open homework mistakes (Homework OS tags), most open first. */
export async function weakSpots(ctx: RequestContext, academyId: string, classroomId: string): Promise<WeakSpot[]> {
  const data = await call<{ tags?: { tag?: unknown; open?: unknown; total?: unknown }[] }>(ctx, 'academy-learning', { action: 'homework_mistakes', academy_id: academyId, classroom_id: classroomId });
  return (data?.tags ?? [])
    .filter((row) => typeof row?.tag === 'string' && row.tag.trim())
    .map((row) => ({ tag: String(row.tag).slice(0, 60), open: Number(row.open ?? 0) || 0, total: Number(row.total ?? 0) || 0 }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.open - a.open || b.total - a.total)
    .slice(0, 8)
    .map((row) => ({ ...row, label: `${row.tag.replace(/[_-]+/g, ' ')} (${row.open} open of ${row.total})` }));
}

export interface AssignmentInput { academy_id: string; classroom_id: string; title: string; description: string; due_at: string | null; max_score: number | null; metadata: Record<string, unknown> }
/** Creates the Homework OS assignment as the approving teacher; Academy checks their classroom access. */
export async function createAssignment(ctx: RequestContext, input: AssignmentInput): Promise<{ assignment_id: string; classroom_id: string }> {
  const data = await call<{ assignment?: { id?: unknown; classroom_id?: unknown } }>(ctx, 'academy', {
    action: 'create_assignment', academy_id: input.academy_id, classroom_id: input.classroom_id, title: input.title, description: input.description,
    ...(input.due_at ? { due_at: input.due_at } : {}), ...(input.max_score ? { max_score: input.max_score } : {}),
    assignment_type: 'task', allow_late_submission: true, metadata: input.metadata,
  });
  if (typeof data?.assignment?.id !== 'string') throw new SchoodAIError('upstream_failed', 'Academy did not create the assignment.', 502, { service: 'academy' });
  return { assignment_id: data.assignment.id, classroom_id: String(data.assignment.classroom_id ?? input.classroom_id) };
}
