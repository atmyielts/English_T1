import { isRole, tashkentMonth } from '../../../../packages/ai-core/src/mod.ts';
import { balanceView } from '../ai.ts';
import { brandingView } from '../core/views.ts';
import { bool, integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext, type Role } from '../types.ts';
import { academySnapshot, centreAcademy, myAcademies } from './academy.ts';
import { centreDeps } from './binding.ts';
import { humanCode, randomToken, sha256Hex } from './crypto.ts';
import { isManager, requireCentre, seatLimits, type Centre } from './shared.ts';
import type { InviteRow, SnapshotRow } from './store.ts';

// C1 centre workspace and the seats/invites/budgets part of C7: create a centre
// (linked to an Academy tenant the person owns or runs, or by a Schood admin),
// invite people by link or code with a role and an expiry, keep teacher seats and
// student places within the plan, set monthly credit budgets, manage members.

const INVITE_ROLES = ['admin', 'teacher', 'student', 'parent'] as const;
const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const SNAPSHOT_MAX_AGE_MS = 12 * 3_600_000;

/** The centre's seats and places now: its plan (core's ctx.planFor) plus add-ons. */
export async function refreshLimits(ctx: RequestContext, centre: Pick<Centre, 'settings'> & { access: { workspace: { id: string } } }): Promise<ReturnType<typeof seatLimits>> {
  const plan = await ctx.planFor(centre.access.workspace.id);
  return seatLimits(plan.plans, plan.beta, centre.settings);
}

async function counts(centre: Centre) {
  const members = await centre.deps.store.members(centre.access.workspace.id);
  const active = members.filter((m) => m.status === 'active');
  return {
    members,
    byRole: Object.fromEntries((['owner', 'admin', 'teacher', 'student', 'parent'] as const).map((role) => [role, active.filter((m) => m.role === role).length])) as Record<Role, number>,
  };
}

/** GET centre/academies: Academy tenants the person may link (owner or admin with manageAcademy), and which are linked. */
export async function academies(ctx: RequestContext) {
  const deps = await centreDeps(ctx);
  const list = await myAcademies(ctx);
  return {
    academies: await Promise.all(list.map(async (row) => {
      const workspaceId = await deps.store.workspaceIdByTenant(row.id);
      const member = workspaceId ? await ctx.repo.membership(workspaceId, ctx.user.id) : null;
      return { id: row.id, name: row.name, role: row.role, can_link: ['owner', 'admin'].includes(row.role) && row.manageAcademy, linked: !!workspaceId, workspace_id: member?.status === 'active' ? workspaceId : null };
    })),
  };
}

/**
 * POST centre/create
 *   { academy_id }                        link an Academy tenant the caller owns or runs (checked through Academy's API);
 *   { name, owner_user_id, contract_until? } a Schood admin creates one (Enterprise when contract_until is given).
 */
export async function create(ctx: RequestContext) {
  const body = record(await ctx.body());
  const deps = await centreDeps(ctx);
  let created: { created: boolean; workspaceId: string };
  if (body.academy_id !== undefined) {
    const academyId = uuid(body.academy_id, 'academy_id');
    const found = (await myAcademies(ctx)).find((row) => row.id === academyId);
    if (!found || !['owner', 'admin'].includes(found.role) || !found.manageAcademy) throw new SchoodAIError('academy_role_required', 'Only an owner or admin of this Academy can connect it.', 403);
    created = await deps.store.createCentre({
      name: found.name || 'Centre', ownerId: ctx.user.id, academyTenantId: academyId, contractPlan: null, contractUntil: null, via: 'academy', createdBy: ctx.user.id, publicKey: randomToken(18),
    });
    if (!created.created) {
      const member = await ctx.repo.membership(created.workspaceId, ctx.user.id);
      if (!member || member.status !== 'active') throw new SchoodAIError('academy_already_linked', 'This Academy is already connected to a Schood AI centre. Ask its owner for an invite.', 409);
    }
  } else {
    if (!await ctx.isSchoodAdmin()) throw new SchoodAIError('admin_required', 'Only Schood admins can create a centre without Academy.', 403);
    const owner = uuid(body.owner_user_id, 'owner_user_id');
    const profile = await ctx.repo.profile(owner);
    if (!profile || !profile.isActive) throw new SchoodAIError('owner_not_found', 'That owner account does not exist.', 404);
    const until = body.contract_until === undefined || body.contract_until === null ? null : text(body.contract_until, 'contract_until', { max: 40 });
    if (until !== null && (!Number.isFinite(Date.parse(until)) || Date.parse(until) <= ctx.now().getTime())) throw new SchoodAIError('invalid_request', 'contract_until must be a future date.', 400, { field: 'contract_until' });
    created = await deps.store.createCentre({
      name: text(body.name, 'name', { max: 120 }), ownerId: owner, academyTenantId: null, contractPlan: until ? 'enterprise' : null, contractUntil: until ? new Date(until).toISOString() : null,
      via: 'admin', createdBy: ctx.user.id, publicKey: randomToken(18),
    });
  }
  const workspace = (await ctx.repo.workspace(created.workspaceId))!;
  if (created.created) await ctx.repo.audit({ workspaceId: workspace.id, actorId: ctx.user.id, event: 'centre.created', targetType: 'workspace', targetId: workspace.id, details: { via: body.academy_id !== undefined ? 'academy' : 'admin' } });
  return { workspace: { id: workspace.id, name: workspace.name, kind: workspace.kind, academy_linked: !!workspace.academyTenantId }, created: created.created };
}

/** GET centre/overview: the owner's dashboard. Refreshes the Academy snapshot after the response when it is old. */
export async function overview(ctx: RequestContext) {
  const centre = await requireCentre(ctx);
  const { access, deps } = centre, ws = access.workspace;
  const [plan, limits, { byRole }, invites, admissions, groups, snapshot, actions, results] = await Promise.all([
    ctx.plan(), refreshLimits(ctx, centre), counts(centre), deps.store.table('invites').list({ workspace_id: ws.id, revoked_at: null }),
    deps.store.table('admissions').get({ workspace_id: ws.id }), deps.store.table('groups').list({ workspace_id: ws.id, archived: false }),
    deps.store.table('snapshots').list({ workspace_id: ws.id }, { order: 'captured_at', desc: true, limit: 1 }), ctx.actions.list({ statuses: ['pending'] }),
    deps.store.table('results').list({ workspace_id: ws.id, verified: true }, { limit: 1 }),
  ]);
  const balance = await ctx.repo.creditBalance(ws.id, plan.grant, plan.anchor);
  const latest: SnapshotRow | undefined = snapshot[0];
  const stale = !latest || ctx.now().getTime() - Date.parse(latest.captured_at) > SNAPSHOT_MAX_AGE_MS;
  if (stale && ws.academyTenantId && ctx.user.token && isManager(access.role)) ctx.after(() => captureSnapshot(ctx, centre));
  const budgets = centre.settings.budget_defaults as Record<string, unknown>;
  return {
    workspace: { id: ws.id, name: ws.name, role: access.role, academy_linked: !!ws.academyTenantId, created_via: centre.settings.created_via },
    plan: { plans: plan.plans, beta: plan.beta, grant: plan.grant, seats_plan: limits.plan },
    credits: balanceView(balance),
    seats: {
      teachers: { used: byRole.admin + byRole.teacher, limit: limits.teachers },
      students: { used: byRole.student, limit: limits.students },
      parents: byRole.parent, owners: byRole.owner,
    },
    checklist: {
      invites: invites.length > 0 || byRole.teacher + byRole.student > 0,
      budgets: typeof budgets.student === 'number' || typeof budgets.teacher === 'number',
      groups: groups.length > 0,
      admissions: admissions?.enabled === true,
      brief: (centre.settings.brief as Record<string, unknown>).enabled === true,
      results: results.length > 0,
    },
    approvals: actions.filter((row) => row.canApprove).length,
    academy: latest ? { captured_at: latest.captured_at, data: latest.data } : null,
  };
}

export async function captureSnapshot(ctx: RequestContext, centre: Centre): Promise<SnapshotRow | null> {
  const ws = centre.access.workspace;
  if (!ws.academyTenantId || !ctx.user.token) return null;
  const data = await academySnapshot(centreAcademy(ctx, ws), ctx.now());
  if (!data.parts.some((part) => part.ok)) return null;
  const row = await centre.deps.store.table('snapshots').insert({ workspace_id: ws.id, captured_by: ctx.user.id, captured_at: ctx.now().toISOString(), data: data as unknown as Record<string, unknown> });
  // Keep the newest ten.
  const all = await centre.deps.store.table('snapshots').list({ workspace_id: ws.id }, { order: 'captured_at', desc: true });
  for (const old of all.slice(10)) await centre.deps.store.table('snapshots').remove({ id: old.id });
  return row;
}

/** POST centre/snapshot: refresh the Academy numbers now (managers). */
export async function snapshotNow(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  centreAcademy(ctx, centre.access.workspace);
  const row = await captureSnapshot(ctx, centre);
  if (!row) throw new SchoodAIError('academy_unavailable', 'Academy did not return any numbers you may see.', 502);
  return { academy: { captured_at: row.captured_at, data: row.data } };
}

// --- Members --------------------------------------------------------------------------------

export const members = {
  /** Everyone in the centre with role, status, budget and this month's use. Staff see the list; managers can change it. */
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const ws = centre.access.workspace, month = tashkentMonth(ctx.now());
    const [list, groups, memberships, limits] = await Promise.all([
      centre.deps.store.members(ws.id), centre.deps.store.table('groups').list({ workspace_id: ws.id, archived: false }),
      centre.deps.store.table('group_members').list({ workspace_id: ws.id }), refreshLimits(ctx, centre),
    ]);
    const groupName = new Map(groups.map((group) => [group.id, group.name]));
    const manager = isManager(centre.access.role);
    return {
      can_manage: manager,
      limits: { teachers: limits.teachers, students: limits.students },
      budget_defaults: centre.settings.budget_defaults,
      members: list.filter((m) => manager || m.role !== 'parent').map((m) => ({
        user_id: m.userId, name: m.name, role: m.role, status: m.status, joined_at: m.joinedAt, is_me: m.userId === ctx.user.id,
        budget: m.creditBudget, used_this_month: m.budgetPeriod === month ? m.budgetUsed : 0,
        groups: memberships.filter((row) => row.user_id === m.userId).map((row) => groupName.get(row.group_id)).filter(Boolean),
      })),
    };
  },
  /** { user_id, role?, status?, credit_budget? }. Only the owner manages admins; nobody changes the owner. */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const ws = centre.access.workspace, userId = uuid(body.user_id, 'user_id');
    const target = await ctx.repo.membership(ws.id, userId);
    if (!target) throw new SchoodAIError('not_found', 'Member not found.', 404);
    if (target.role === 'owner') throw new SchoodAIError('owner_protected', 'The owner cannot be changed here.', 403);
    const role = body.role === undefined ? undefined : oneOf(body.role, 'role', INVITE_ROLES);
    if (centre.access.role !== 'owner' && (target.role === 'admin' || role === 'admin')) throw new SchoodAIError('role_required', 'Only the owner manages admins.', 403, { roles: ['owner'] });
    const status = body.status === undefined ? undefined : oneOf(body.status, 'status', ['active', 'suspended'] as const);
    const budget = body.credit_budget === undefined ? undefined : body.credit_budget === null ? null : integer(body.credit_budget, 'credit_budget', 0, 10_000_000);
    // Moving someone into a seat or a student place, or reactivating them, must fit the plan.
    const kind = (r: Role) => (r === 'admin' || r === 'teacher' ? 'seat' : r === 'student' ? 'place' : null);
    const before = target.status === 'active' ? kind(target.role) : null, after = (status ?? target.status) === 'active' ? kind(role ?? target.role) : null;
    if (after && after !== before) {
      const limits = await refreshLimits(ctx, centre);
      const { byRole } = await counts(centre);
      if (after === 'seat' && limits.teachers !== null && byRole.admin + byRole.teacher >= limits.teachers) throw new SchoodAIError('seats_full', 'All teacher seats are taken.', 409, { limit: limits.teachers });
      if (after === 'place' && limits.students !== null && byRole.student >= limits.students) throw new SchoodAIError('students_full', 'All student places are taken.', 409, { limit: limits.students });
    }
    await centre.deps.store.updateMember(ws.id, userId, { role, status, creditBudget: budget });
    await ctx.audit('centre.member_updated', { user_id: userId, ...(role ? { role } : {}), ...(status ? { status } : {}), ...(budget !== undefined ? { credit_budget: budget } : {}) }, { type: 'member', id: userId });
    return { ok: true };
  },
  /** { user_id }: removes a member (their chats in the centre stay theirs until retention). */
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const userId = uuid(record(await ctx.body()).user_id, 'user_id');
    const target = await ctx.repo.membership(centre.access.workspace.id, userId);
    if (!target) throw new SchoodAIError('not_found', 'Member not found.', 404);
    if (target.role === 'owner') throw new SchoodAIError('owner_protected', 'The owner cannot be removed.', 403);
    if (target.role === 'admin' && centre.access.role !== 'owner') throw new SchoodAIError('role_required', 'Only the owner manages admins.', 403, { roles: ['owner'] });
    await centre.deps.store.removeMember(centre.access.workspace.id, userId);
    await ctx.audit('centre.member_removed', { user_id: userId, role: target.role }, { type: 'member', id: userId });
    return { ok: true };
  },
};

/** POST centre/leave: leave a centre you were invited to (not the owner). */
export async function leave(ctx: RequestContext) {
  const centre = await requireCentre(ctx);
  if (centre.access.role === 'owner') throw new SchoodAIError('owner_protected', 'The owner cannot leave the centre.', 403);
  await centre.deps.store.removeMember(centre.access.workspace.id, ctx.user.id);
  await ctx.audit('centre.member_left', { role: centre.access.role }, { type: 'member', id: ctx.user.id });
  return { ok: true };
}

/** POST centre/budgets: default monthly budgets by role, optionally applied to everyone in that role now. */
export async function budgets(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const body = record(await ctx.body());
  const defaults: Record<string, number | null> = {};
  for (const role of ['admin', 'teacher', 'student', 'parent'] as const) {
    const value = record(body.defaults ?? {}, 'defaults')[role];
    if (value !== undefined) defaults[role] = value === null ? null : integer(value, `defaults.${role}`, 0, 10_000_000);
  }
  const apply = body.apply_to_existing === undefined ? false : bool(body.apply_to_existing, 'apply_to_existing');
  const merged = { ...centre.settings.budget_defaults, ...defaults };
  for (const [key, value] of Object.entries(merged)) if (value === null) delete merged[key];
  await centre.deps.store.table('settings').update({ workspace_id: centre.access.workspace.id }, { budget_defaults: merged, updated_by: ctx.user.id });
  let applied = 0;
  if (apply) {
    for (const m of await centre.deps.store.members(centre.access.workspace.id)) {
      if (m.role === 'owner' || !(m.role in defaults)) continue;
      if (centre.access.role !== 'owner' && m.role === 'admin') continue;
      if (await centre.deps.store.updateMember(centre.access.workspace.id, m.userId, { creditBudget: defaults[m.role] ?? null })) applied++;
    }
  }
  await ctx.audit('centre.budgets', { defaults, applied }, { type: 'workspace', id: centre.access.workspace.id });
  return { budget_defaults: merged, applied };
}

// --- Invites --------------------------------------------------------------------------------

const inviteJson = (row: InviteRow, now: Date) => ({
  id: row.id, role: row.role, label: row.label, max_uses: row.max_uses, uses: row.uses, expires_at: row.expires_at, created_at: row.created_at,
  state: row.revoked_at ? 'revoked' : Date.parse(row.expires_at) <= now.getTime() ? 'expired' : row.uses >= row.max_uses ? 'used_up' : 'active',
});

export const invites = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const rows = await centre.deps.store.table('invites').list({ workspace_id: centre.access.workspace.id }, { order: 'created_at', desc: true, limit: 200 });
    return { invites: rows.map((row) => inviteJson(row, ctx.now())) };
  },
  /** { role, max_uses?, expires_in_days?, label? }: the code is shown once and stored only as a hash. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const role = oneOf(body.role, 'role', INVITE_ROLES);
    if (role === 'admin' && centre.access.role !== 'owner') throw new SchoodAIError('role_required', 'Only the owner invites admins.', 403, { roles: ['owner'] });
    const maxUses = body.max_uses === undefined ? (role === 'student' ? 50 : 1) : integer(body.max_uses, 'max_uses', 1, 1000);
    const days = body.expires_in_days === undefined ? 14 : integer(body.expires_in_days, 'expires_in_days', 1, 60);
    const code = humanCode(10);
    const row = await centre.deps.store.table('invites').insert({
      workspace_id: centre.access.workspace.id, role, code_hash: await sha256Hex(code), label: optionalText(body.label, 'label', { max: 120 }),
      max_uses: maxUses, uses: 0, expires_at: new Date(ctx.now().getTime() + days * 86_400_000).toISOString(), created_by: ctx.user.id,
    });
    await ctx.audit('centre.invite_created', { role, max_uses: maxUses, expires_in_days: days }, { type: 'invite', id: row.id });
    const pretty = `${code.slice(0, 5)}-${code.slice(5)}`;
    return { invite: inviteJson(row, ctx.now()), code: pretty, link: `${centre.deps.config.appUrl}/join?code=${pretty}` };
  },
  /** { id }: revokes an invite; people who already joined stay. */
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const id = uuid(record(await ctx.body()).id, 'id');
    const updated = await centre.deps.store.table('invites').update({ id, workspace_id: centre.access.workspace.id, revoked_at: null }, { revoked_at: ctx.now().toISOString() });
    if (!updated.length) throw new SchoodAIError('not_found', 'Invite not found.', 404);
    await ctx.audit('centre.invite_revoked', {}, { type: 'invite', id });
    return { invite: inviteJson(updated[0], ctx.now()) };
  },
};

/** POST centre/join { code }: joins the centre the code belongs to. Works from any workspace. */
export async function join(ctx: RequestContext) {
  const code = normaliseCode(text(record(await ctx.body()).code, 'code', { max: 40 }));
  if (code.length !== 10) throw new SchoodAIError('invite_invalid', 'This invite code is not valid.', 404);
  const deps = await centreDeps(ctx);
  const hash = await sha256Hex(code);
  const invite = await deps.store.table('invites').get({ code_hash: hash });
  const settings = invite ? await deps.store.table('settings').get({ workspace_id: invite.workspace_id }) : null;
  // The joiner is not a member yet: the seats come from the centre's own plan (core's ctx.planFor).
  const limits = settings ? await refreshLimits(ctx, { settings, access: { workspace: { id: settings.workspace_id } } }).catch(() => null) : null;
  const fallback = seatLimits([], false, settings ?? { extra_teacher_seats: 0, extra_students: 0 });
  const budgets = Object.fromEntries(Object.entries(settings?.budget_defaults ?? {}).filter(([key, value]) => isRole(key) && typeof value === 'number')) as Record<string, number>;
  const result = await deps.store.acceptInvite({
    codeHash: hash, userId: ctx.user.id, now: ctx.now(), budgets,
    teacherSeats: (limits ?? fallback).teachers,
    studentSeats: (limits ?? fallback).students,
  });
  if (!result.ok) {
    const messages: Record<string, string> = { invite_invalid: 'This invite code is not valid.', invite_revoked: 'This invite was withdrawn.', invite_expired: 'This invite has expired.', invite_used_up: 'This invite has been used up.', seats_full: 'All teacher seats in this centre are taken.', students_full: 'All student places in this centre are taken.' };
    throw new SchoodAIError(result.code, messages[result.code], result.code === 'invite_invalid' ? 404 : 409, result.limit !== undefined ? { limit: result.limit } : {});
  }
  const workspace = (await ctx.repo.workspace(result.workspaceId))!;
  if (!result.already) await ctx.repo.audit({ workspaceId: workspace.id, actorId: ctx.user.id, event: 'centre.member_joined', targetType: 'member', targetId: ctx.user.id, details: { role: result.role, invite_id: invite?.id ?? null } });
  return { workspace: { id: workspace.id, name: workspace.name }, role: result.role, status: result.status, already: result.already };
}

/** GET centre/invite-preview?code=: the centre's name and role before joining (no other data). */
export async function invitePreview(ctx: RequestContext) {
  const code = normaliseCode(ctx.query.get('code') ?? '');
  if (code.length !== 10) throw new SchoodAIError('invite_invalid', 'This invite code is not valid.', 404);
  const deps = await centreDeps(ctx);
  const invite = await deps.store.table('invites').get({ code_hash: await sha256Hex(code) });
  const workspace = invite ? await ctx.repo.workspace(invite.workspace_id) : null;
  if (!invite || !workspace || workspace.status !== 'active') throw new SchoodAIError('invite_invalid', 'This invite code is not valid.', 404);
  const member = await ctx.repo.membership(workspace.id, ctx.user.id);
  return { centre: { name: workspace.name, logo_url: brandingView(workspace.branding).logo_url, primary_color: brandingView(workspace.branding).primary_color }, role: invite.role, state: inviteJson(invite, ctx.now()).state, member: !!member };
}
