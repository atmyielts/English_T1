import { CREDIT_PRICES, FEATURES, quoteCredits } from '../../../../packages/ai-core/src/mod.ts';
import { balanceView, switchesOf } from '../ai.ts';
import { bool, integer, record, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { centreDeps } from './binding.ts';
import { actorOf } from './runner.ts';
import { requireCentre, type Centre } from './shared.ts';

// C7 admin besides seats and invites (workspace.ts): feature switches (stored by
// core's settings route), data retention, the audit log and a usage and cost
// report. Add-ons granted by Schood support (extra seats, student places, the
// bring-your-own-key fee) are set by Schood admins only.

/** Whether the parent features (P1, P2) are on: the centre opted in. */
export const parentFeaturesOn = (switches: Record<string, boolean> | null) => switches?.parent === true || switches?.['parent.brief'] === true;

/** Centre features that can be switched off for the centre's members, by credit-key area. */
export function switchableAreas() {
  const areas = new Map<string, { area: string; features: string[]; keys: string[] }>();
  for (const [key, price] of Object.entries(CREDIT_PRICES)) {
    const feature = FEATURES[price.feature];
    if (!feature || !['centre', 'learner', 'teacher', 'core'].includes(feature.audience) || !feature.plans.some((plan) => ['centre', 'centre_pro', 'enterprise'].includes(plan))) continue;
    // Parent brief and questions (P1, P2) are opt-in for a centre: the parent switch below.
    if (price.feature === 'P1' || price.feature === 'P2') continue;
    const area = key === 'parent.message' ? key : key.split('.')[0];
    const entry = areas.get(area) ?? { area, features: [], keys: [] };
    if (!entry.features.includes(price.feature)) entry.features.push(price.feature);
    entry.keys.push(key);
    areas.set(area, entry);
  }
  return [...areas.values()].sort((a, b) => a.features[0].localeCompare(b.features[0]));
}

export const admin = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const plan = await ctx.plan();
    return {
      retention_days: centre.settings.retention_days,
      switches: switchesOf(centre.access) ?? {},
      parent_features: parentFeaturesOn(switchesOf(centre.access)),
      areas: switchableAreas(),
      budget_defaults: centre.settings.budget_defaults,
      add_ons: { extra_teacher_seats: centre.settings.extra_teacher_seats, extra_students: centre.settings.extra_students },
      plan: { plans: plan.plans, beta: plan.beta },
    };
  },
  /**
   * { retention_days? (30-180), parent_features? }. Parent features (P1 parent brief, P2
   * ask about my child) are off until the centre switches them on: `features.parent = true`.
   */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const body = record(await ctx.body());
    const ws = centre.access.workspace, out: Record<string, unknown> = {};
    if (body.retention_days !== undefined) {
      // Core deletes every conversation after 180 days, so a centre can only shorten it.
      const days = integer(body.retention_days, 'retention_days', 30, 180);
      await centre.deps.store.table('settings').update({ workspace_id: ws.id }, { retention_days: days, updated_by: ctx.user.id });
      await ctx.audit('centre.retention', { retention_days: days }, { type: 'workspace', id: ws.id });
      out.retention_days = days;
    }
    if (body.parent_features !== undefined) {
      const on = bool(body.parent_features, 'parent_features');
      const features = { ...(switchesOf(centre.access) ?? {}) };
      delete features.parent; delete features['parent.brief']; delete features['parent.ask'];
      if (on) features.parent = true;
      await ctx.repo.updateWorkspace(ws.id, { settings: { ...ws.settings, features } });
      await ctx.audit('centre.parent_features', { on }, { type: 'workspace', id: ws.id });
      out.parent_features = on;
    }
    if (!Object.keys(out).length) throw new SchoodAIError('invalid_request', 'Nothing to change.', 400);
    return out;
  },
};

/** PATCH centre/grants { workspace_id, extra_teacher_seats?, extra_students?, byok_uzs_per_1000_calls? }: Schood admins only. */
export async function grants(ctx: RequestContext) {
  if (!await ctx.isSchoodAdmin()) throw new SchoodAIError('admin_required', 'Only Schood admins grant add-ons.', 403);
  const body = record(await ctx.body());
  const workspaceId = uuid(body.workspace_id, 'workspace_id');
  const workspace = await ctx.repo.workspace(workspaceId);
  if (!workspace || workspace.kind !== 'centre') throw new SchoodAIError('not_found', 'Centre not found.', 404);
  const deps = await centreDeps(ctx);
  const patch: Record<string, unknown> = { updated_by: ctx.user.id };
  if (body.extra_teacher_seats !== undefined) patch.extra_teacher_seats = integer(body.extra_teacher_seats, 'extra_teacher_seats', 0, 1000);
  if (body.extra_students !== undefined) patch.extra_students = integer(body.extra_students, 'extra_students', 0, 100000);
  if (body.byok_uzs_per_1000_calls !== undefined) patch.byok_fee = body.byok_uzs_per_1000_calls === null ? {} : { uzs_per_1000_calls: integer(body.byok_uzs_per_1000_calls, 'byok_uzs_per_1000_calls', 0, 100_000_000) };
  const [row] = await deps.store.table('settings').update({ workspace_id: workspaceId }, patch);
  if (!row) throw new SchoodAIError('not_found', 'Centre not found.', 404);
  await ctx.repo.audit({ workspaceId, actorId: ctx.user.id, event: 'centre.add_ons_granted', targetType: 'workspace', targetId: workspaceId, details: Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'updated_by')) });
  return { extra_teacher_seats: row.extra_teacher_seats, extra_students: row.extra_students, byok_fee: row.byok_fee };
}

/** GET centre/audit?before=: the centre's audit log, newest first, with who did it. */
export async function audit(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const before = ctx.query.get('before');
  const rows = await centre.deps.store.auditEvents(centre.access.workspace.id, { limit: 100, before: before ? integer(Number(before), 'before', 1, Number.MAX_SAFE_INTEGER) : undefined });
  const names = await memberNames(centre);
  return {
    events: rows.map((row) => ({ id: row.id, event: row.event, actor: row.actor_id ? { id: row.actor_id, name: names.get(row.actor_id) ?? null } : null, target_type: row.target_type, target_id: row.target_id, details: row.details, created_at: row.created_at })),
    next: rows.length === 100 ? rows.at(-1)!.id : null,
  };
}

async function memberNames(centre: Centre) {
  return new Map((await centre.deps.store.members(centre.access.workspace.id)).map((m) => [m.userId, m.name]));
}

/** GET centre/usage?days=30: credits by feature, member and day, model cost and calls, and the pool. */
export async function usage(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const days = ctx.query.get('days') ? integer(Number(ctx.query.get('days')), 'days', 1, 366) : 30;
  const since = new Date(ctx.now().getTime() - days * 86_400_000);
  const [report, plan, members] = await Promise.all([centre.deps.store.usage(centre.access.workspace.id, since), ctx.plan(), centre.deps.store.members(centre.access.workspace.id)]);
  const balance = await ctx.repo.creditBalance(centre.access.workspace.id, plan.grant, plan.anchor);
  const byId = new Map(members.map((m) => [m.userId, m]));
  const label = (key: string) => { try { return quoteCredits(key).feature; } catch { return null; } };
  return {
    days, since: since.toISOString(), credits: balanceView(balance), grant: plan.grant,
    features: report.features.map((row) => ({ ...row, feature: label(row.key) })),
    members: report.members.map((row) => ({ ...row, name: byId.get(row.user_id)?.name ?? null, role: byId.get(row.user_id)?.role ?? null, budget: byId.get(row.user_id)?.creditBudget ?? null })),
    by_day: report.days,
    cost: { usd: Math.round(report.cost.usd * 10000) / 10000, calls: report.cost.calls, failed: report.cost.failed },
    byok: report.byok,
  };
}

/** Deletes chats of students and parents and admissions conversations older than the centre's retention (core's own 180-day purge covers the rest). */
export async function runRetention(ctx: RequestContext, centre: Centre): Promise<{ chats: number; conversations: number }> {
  const ws = centre.access.workspace;
  const cutoff = ctx.now().getTime() - centre.settings.retention_days * 86_400_000;
  let chats = 0;
  for (const member of await centre.deps.store.members(ws.id)) {
    if (member.role !== 'student' && member.role !== 'parent') continue;
    const old = (await ctx.repo.threads(ws.id, member.userId, 1000)).filter((thread) => !thread.pinned && Date.parse(thread.lastMessageAt) < cutoff);
    if (old.length) chats += await ctx.repo.deleteThreads(ws.id, member.userId, old.map((thread) => thread.id));
  }
  const conversations = await centre.deps.store.table('threads').remove({ workspace_id: ws.id }, { lt: { last_message_at: new Date(cutoff).toISOString() } });
  await centre.deps.store.table('tg_updates').remove({ workspace_id: ws.id }, { lt: { received_at: new Date(ctx.now().getTime() - 3 * 86_400_000).toISOString() } });
  if (chats || conversations) await ctx.repo.audit({ workspaceId: ws.id, actorId: actorOf(ctx), event: 'centre.retention_run', targetType: 'workspace', targetId: ws.id, details: { chats, conversations, retention_days: centre.settings.retention_days } });
  return { chats, conversations };
}

/** POST centre/retention-run: applies the retention now (it also runs every day). */
export async function retentionNow(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  return await runRetention(ctx, centre);
}
