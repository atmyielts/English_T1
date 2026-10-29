import { optionalText, record, stringList, text, uuid, oneOf } from '../input.ts';
import { SchoodAIError, type ContextBlock, type RequestContext } from '../types.ts';
import { centreAcademy } from './academy.ts';
import { centreDeps } from './binding.ts';
import { asList, isManager, requireCentre, type Centre } from './shared.ts';
import type { GroupRow, HintPolicy } from './store.ts';

// Groups and the Student Assistant's per-group rules (C2): hints only while a
// homework is open (the default), always, or off, plus topics to focus on and a
// note from the teacher. A group mirrors an Academy classroom when the centre uses
// Academy (synced with the person's own Academy token), or is made in Schood AI.
// The `centre_rules` context provider gives a student's rules to the learner's
// homework helper (L7) and the Student Assistant; see README.md for its shape.

const POLICIES = ['during_homework', 'always', 'off'] as const;
const STRICTNESS: Record<HintPolicy, number> = { off: 0, during_homework: 1, always: 2 };
const TOPIC = /^[\p{L}\p{N}][\p{L}\p{N} '’‘\-.,/()]{0,59}$/u;

const groupJson = (row: GroupRow, members: number) => ({
  id: row.id, name: row.name, level: row.level, teacher_ids: row.teacher_ids, hint_policy: row.hint_policy, focus_topics: row.focus_topics, note: row.note,
  academy_linked: !!row.academy_classroom_id, archived: row.archived, members, updated_at: row.updated_at,
});

async function teachesOr403(ctx: RequestContext, centre: Centre, group: GroupRow) {
  if (isManager(centre.access.role)) return;
  if (centre.access.role === 'teacher' && group.teacher_ids.includes(ctx.user.id)) return;
  throw new SchoodAIError('role_required', 'Only the group’s teacher or the office can change it.', 403);
}
async function staffIds(centre: Centre, ids: string[]) {
  const staff = new Set((await centre.deps.store.members(centre.access.workspace.id)).filter((m) => m.status === 'active' && ['owner', 'admin', 'teacher'].includes(m.role)).map((m) => m.userId));
  if (ids.some((id) => !staff.has(id))) throw new SchoodAIError('invalid_request', 'Teachers must be staff of this centre.', 400, { field: 'teacher_ids' });
  return ids;
}
function rules(body: Record<string, unknown>) {
  return {
    ...(body.hint_policy !== undefined ? { hint_policy: oneOf(body.hint_policy, 'hint_policy', POLICIES) } : {}),
    ...(body.focus_topics !== undefined ? { focus_topics: stringList(body.focus_topics, 'focus_topics', { max: 12, pattern: TOPIC }) } : {}),
    ...(body.note !== undefined ? { note: optionalText(body.note, 'note', { max: 500 }) } : {}),
  };
}

export const groups = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const ws = centre.access.workspace;
    const [rows, memberships] = await Promise.all([
      centre.deps.store.table('groups').list({ workspace_id: ws.id, ...(ctx.query.get('archived') === '1' ? {} : { archived: false }) }, { order: 'name' }),
      centre.deps.store.table('group_members').list({ workspace_id: ws.id }),
    ]);
    const counts = new Map<string, number>();
    for (const row of memberships) counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
    const id = ctx.query.get('id');
    if (id) {
      const group = rows.find((row) => row.id === id);
      if (!group) throw new SchoodAIError('not_found', 'Group not found.', 404);
      return { group: groupJson(group, counts.get(group.id) ?? 0), member_ids: memberships.filter((row) => row.group_id === id).map((row) => row.user_id), can_edit: isManager(centre.access.role) || group.teacher_ids.includes(ctx.user.id) };
    }
    return {
      groups: rows.map((row) => ({ ...groupJson(row, counts.get(row.id) ?? 0), can_edit: isManager(centre.access.role) || row.teacher_ids.includes(ctx.user.id) })),
      can_create: isManager(centre.access.role), academy_linked: !!ws.academyTenantId,
    };
  },
  /** { name, level?, teacher_ids?, hint_policy?, focus_topics?, note? } (office). */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const row = await centre.deps.store.table('groups').insert({
      workspace_id: centre.access.workspace.id, name: text(body.name, 'name', { max: 120 }), level: optionalText(body.level, 'level', { max: 40 }),
      teacher_ids: await staffIds(centre, body.teacher_ids === undefined ? [] : stringList(body.teacher_ids, 'teacher_ids', { max: 20, pattern: /^[0-9a-f-]{36}$/ })),
      created_by: ctx.user.id, ...rules(body),
    });
    await ctx.audit('centre.group_created', { name: row.name }, { type: 'group', id: row.id });
    return { group: groupJson(row, 0) };
  },
  /** { id, name?, level?, teacher_ids?, hint_policy?, focus_topics?, note?, archived? }. Teachers of the group may change its rules. */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const body = record(await ctx.body());
    const group = await centre.deps.store.table('groups').get({ id: uuid(body.id, 'id'), workspace_id: centre.access.workspace.id });
    if (!group) throw new SchoodAIError('not_found', 'Group not found.', 404);
    await teachesOr403(ctx, centre, group);
    const manager = isManager(centre.access.role);
    if (!manager && (body.name !== undefined || body.teacher_ids !== undefined || body.archived !== undefined || body.level !== undefined)) throw new SchoodAIError('role_required', 'Only the office changes a group’s name, level and teachers.', 403);
    const patch = {
      ...rules(body),
      ...(body.name !== undefined ? { name: text(body.name, 'name', { max: 120 }) } : {}),
      ...(body.level !== undefined ? { level: optionalText(body.level, 'level', { max: 40 }) } : {}),
      ...(body.teacher_ids !== undefined ? { teacher_ids: await staffIds(centre, stringList(body.teacher_ids, 'teacher_ids', { max: 20, pattern: /^[0-9a-f-]{36}$/ })) } : {}),
      ...(body.archived !== undefined ? { archived: body.archived === true } : {}),
    };
    const [updated] = await centre.deps.store.table('groups').update({ id: group.id }, patch);
    await ctx.audit('centre.group_updated', { fields: Object.keys(patch) }, { type: 'group', id: group.id });
    const members = await centre.deps.store.table('group_members').list({ group_id: group.id });
    return { group: groupJson(updated, members.length) };
  },
};

/** PUT centre/group-members { group_id, user_ids }: the students of a group (members of the centre only). */
export async function groupMembers(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  const body = record(await ctx.body());
  const group = await centre.deps.store.table('groups').get({ id: uuid(body.group_id, 'group_id'), workspace_id: centre.access.workspace.id });
  if (!group) throw new SchoodAIError('not_found', 'Group not found.', 404);
  await teachesOr403(ctx, centre, group);
  const wanted = stringList(body.user_ids, 'user_ids', { max: 400, pattern: /^[0-9a-f-]{36}$/ });
  const students = new Set((await centre.deps.store.members(centre.access.workspace.id)).filter((m) => m.role === 'student').map((m) => m.userId));
  const unknown = wanted.filter((id) => !students.has(id));
  if (unknown.length) throw new SchoodAIError('invalid_request', 'Only students of this centre can join a group.', 400, { field: 'user_ids', unknown: unknown.length });
  const current = new Set((await centre.deps.store.table('group_members').list({ group_id: group.id })).map((row) => row.user_id));
  for (const id of wanted) if (!current.has(id)) await centre.deps.store.table('group_members').insert({ group_id: group.id, workspace_id: group.workspace_id, user_id: id });
  const removed = [...current].filter((id) => !wanted.includes(id));
  if (removed.length) await centre.deps.store.table('group_members').remove({ group_id: group.id }, { in: { user_id: removed } });
  await ctx.audit('centre.group_members', { added: wanted.filter((id) => !current.has(id)).length, removed: removed.length }, { type: 'group', id: group.id });
  return { members: wanted.length };
}

/**
 * POST centre/groups-sync: mirrors the Academy classrooms the person can see as groups,
 * and adds each classroom's students who are also students of this centre (matched
 * by their Schood account). Groups keep their rules; nothing is removed in Academy.
 */
export async function syncGroups(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const ws = centre.access.workspace, client = centreAcademy(ctx, ws);
  const classrooms = asList((await client.get('classrooms', { limit: '300' })).classrooms).filter((row) => row.is_active !== false);
  const contacts = new Map(asList((await client.get('contacts', { limit: '300' })).contacts).map((row) => [String(row.id), typeof row.user_id === 'string' ? row.user_id : null]));
  const students = new Set((await centre.deps.store.members(ws.id)).filter((m) => m.role === 'student' && m.status === 'active').map((m) => m.userId));
  let created = 0, linked = 0;
  for (const room of classrooms.slice(0, 200)) {
    const classroomId = String(room.id);
    let group = await centre.deps.store.table('groups').get({ workspace_id: ws.id, academy_classroom_id: classroomId });
    if (!group) {
      group = await centre.deps.store.table('groups').insert({ workspace_id: ws.id, academy_classroom_id: classroomId, name: String(room.name ?? 'Group').slice(0, 120), created_by: ctx.user.id });
      created++;
    } else if (group.name !== room.name && typeof room.name === 'string') {
      await centre.deps.store.table('groups').update({ id: group.id }, { name: room.name.slice(0, 120) });
    }
    const memberships = asList((await client.get('classroom-memberships', { classroom_id: classroomId, limit: '1000' })).classroom_memberships)
      .filter((row) => row.role === 'student' && row.status === 'active');
    const current = new Set((await centre.deps.store.table('group_members').list({ group_id: group.id })).map((row) => row.user_id));
    for (const membership of memberships) {
      const userId = contacts.get(String(membership.contact_id));
      if (!userId || !students.has(userId) || current.has(userId)) continue;
      await centre.deps.store.table('group_members').insert({ group_id: group.id, workspace_id: ws.id, user_id: userId });
      current.add(userId);
      linked++;
    }
  }
  await ctx.audit('centre.groups_synced', { classrooms: classrooms.length, created, linked }, { type: 'workspace', id: ws.id });
  return { classrooms: classrooms.length, created, linked };
}

/** The rules for a student, strictest policy first; null outside a centre or without groups. */
export async function rulesFor(ctx: RequestContext): Promise<ContextBlock | null> {
  const access = await ctx.workspace();
  if (access.workspace.kind !== 'centre') return null;
  const deps = await centreDeps(ctx);
  const memberships = await deps.store.table('group_members').list({ workspace_id: access.workspace.id, user_id: ctx.user.id });
  const rows = memberships.length ? (await deps.store.table('groups').list({ workspace_id: access.workspace.id, archived: false }, { in: { id: memberships.map((row) => row.group_id) } })) : [];
  // A student in no group still gets the centre default: hints while homework is open.
  const policy: HintPolicy = rows.reduce<HintPolicy>((strictest, row) => (STRICTNESS[row.hint_policy] > STRICTNESS[strictest] ? row.hint_policy : strictest), rows.length ? 'off' : 'during_homework');
  const describe: Record<HintPolicy, string> = {
    always: 'Give hints and guiding questions, never the final answers, for any exercise.',
    during_homework: 'While a homework of this centre is open, give hints and guiding questions, never the final answers to that homework. Otherwise teach normally.',
    off: 'No hint-only rule from the centre; still prefer the learner doing the work.',
  };
  return {
    kind: 'centre_rules',
    title: `${access.workspace.name}: rules for this student`,
    data: {
      centre: access.workspace.name,
      hint_policy: policy,
      rule: describe[policy],
      focus_topics: [...new Set(rows.flatMap((row) => row.focus_topics))].slice(0, 12),
      groups: rows.map((row) => ({ name: row.name, level: row.level, hint_policy: row.hint_policy, focus_topics: row.focus_topics, teacher_note: row.note })),
    },
  };
}
