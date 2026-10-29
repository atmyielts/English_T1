import { cleanSwitches, featureAccess, isCreditKey, MANAGER_ROLES, quoteCredits, STAFF_ROLES } from '../../../../packages/ai-core/src/mod.ts';
import { switchesOf } from '../ai.ts';
import { selfViewKinds } from '../context.ts';
import { bool, isUuid, jsonObject, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { listSpecialists } from '../specialists.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { MAX_MESSAGE_CHARS } from './chat.ts';
import { actionJson, balanceJson, brandingView, budgetJson, generationJson, messageJson, threadJson, workspaceView } from './views.ts';

// The core routes besides chat. Every route resolves the caller's workspace and
// membership through ctx.workspace() and checks roles there; nothing here trusts
// an id from the browser without that check.

/** GET core/me: who you are, where you are, your plan, credits, switches and assistants. */
export async function me(ctx: RequestContext) {
  const access = await ctx.workspace();
  // Everyone has a personal workspace, even when they arrive in a centre's.
  if (access.workspace.kind !== 'personal') await ctx.repo.ensurePersonalWorkspace(ctx.user.id, ctx.user.email?.split('@')[0] || 'My workspace');
  const [plan, memberships, overrides, settings, admin, profile] = await Promise.all([
    ctx.plan(), ctx.repo.memberships(ctx.user.id), ctx.repo.specialists(access.workspace.id), ctx.repo.settings(), ctx.isSchoodAdmin(), ctx.repo.profile(ctx.user.id),
  ]);
  const balance = await ctx.repo.creditBalance(access.workspace.id, plan.grant, plan.anchor);
  const decide = (feature: string) => featureAccess(feature, { plans: plan.plans, workspaceKind: access.workspace.kind, role: access.role, beta: plan.beta, grants: plan.features });
  return {
    user: { id: ctx.user.id, email: ctx.user.email, name: profile?.name ?? null, is_schood_admin: admin },
    workspace: workspaceView(access.workspace, access.role),
    workspaces: memberships.filter((row) => row.member.status === 'active' && row.workspace.status === 'active').map((row) => workspaceView(row.workspace, row.member.role)),
    plan: { plans: plan.plans, features: plan.features, beta: plan.beta, grant: plan.grant },
    credits: { ...balanceJson(balance), budget: budgetJson(access, ctx.now()) },
    ai: { enabled: settings.aiEnabled, switches: { ...settings.features, ...(switchesOf(access) ?? {}) } },
    specialists: listSpecialists(access.workspace, access.role, overrides).map((specialist) => ({
      key: specialist.key, name: specialist.name[ctx.locale], description: specialist.description[ctx.locale], credit_key: specialist.creditKey,
      credits: quoteCredits(specialist.creditKey).credits, available: decide(quoteCredits(specialist.creditKey).feature).allowed,
      suggestions: specialist.suggestions[ctx.locale] ?? [], custom: specialist.custom,
    })),
    limits: { message_chars: MAX_MESSAGE_CHARS },
  };
}

async function ownThread(ctx: RequestContext, id: string) {
  const access = await ctx.workspace();
  const thread = await ctx.repo.thread(id);
  if (!thread || thread.userId !== ctx.user.id || thread.workspaceId !== access.workspace.id) throw new SchoodAIError('not_found', 'Conversation not found.', 404);
  return thread;
}

export const threads = {
  async GET(ctx: RequestContext) {
    const access = await ctx.workspace();
    return { threads: (await ctx.repo.threads(access.workspace.id, ctx.user.id, 100)).map(threadJson) };
  },
  async PATCH(ctx: RequestContext) {
    const body = record(await ctx.body());
    const thread = await ownThread(ctx, uuid(body.id, 'id'));
    const patch = {
      ...(body.title !== undefined ? { title: text(body.title, 'title', { max: 120 }) } : {}),
      ...(body.pinned !== undefined ? { pinned: bool(body.pinned, 'pinned') } : {}),
    };
    return { thread: threadJson((await ctx.repo.updateThread(thread.id, patch))!) };
  },
  /** One conversation, or `{ all: true }` for the whole history in this workspace. */
  async DELETE(ctx: RequestContext) {
    const body = record(await ctx.body());
    const access = await ctx.workspace();
    if (body.all === true) return { deleted: await ctx.repo.deleteThreads(access.workspace.id, ctx.user.id, 'all') };
    const thread = await ownThread(ctx, uuid(body.id, 'id'));
    return { deleted: await ctx.repo.deleteThreads(access.workspace.id, ctx.user.id, [thread.id]) };
  },
};

export async function messages(ctx: RequestContext) {
  const thread = await ownThread(ctx, uuid(ctx.query.get('thread_id'), 'thread_id'));
  return { thread: threadJson(thread), messages: (await ctx.repo.messages(thread.id, 200)).map(messageJson) };
}

export const credits = {
  /** Balance, your monthly budget in a centre, and the recent ledger (managers see the whole workspace). */
  async GET(ctx: RequestContext) {
    const access = await ctx.workspace();
    const plan = await ctx.plan();
    const balance = await ctx.repo.creditBalance(access.workspace.id, plan.grant, plan.anchor);
    const manager = MANAGER_ROLES.includes(access.role);
    const rows = await ctx.repo.ledger(access.workspace.id, { userId: manager ? undefined : ctx.user.id, limit: 100 });
    return {
      balance: balanceJson(balance), budget: budgetJson(access, ctx.now()), grant: plan.grant,
      ledger: rows.map((row) => ({ id: row.id, kind: row.kind, bucket: row.bucket, delta: row.delta, credit_key: row.creditKey, mine: row.userId === ctx.user.id, created_at: row.createdAt })),
    };
  },
  /** A quote before an action: the exact cost, whether it is allowed here and whether the balance covers it. */
  async POST(ctx: RequestContext) {
    const body = record(await ctx.body());
    const key = text(body.key, 'key', { max: 62 });
    if (!isCreditKey(key)) throw new SchoodAIError('invalid_request', 'Unknown AI action.', 400, { field: 'key' });
    const addOns = body.add_ons === undefined ? [] : stringList(body.add_ons, 'add_ons', { max: 5, pattern: /^[a-z_.]{3,62}$/ });
    let quote;
    try { quote = quoteCredits(key, addOns); } catch { throw new SchoodAIError('invalid_request', 'That add-on is not available for this action.', 400, { field: 'add_ons' }); }
    const access = await ctx.workspace();
    const [decision, plan] = await Promise.all([ctx.access(quote.feature), ctx.plan()]);
    const balance = await ctx.repo.creditBalance(access.workspace.id, plan.grant, plan.anchor);
    const budget = budgetJson(access, ctx.now());
    const available = Math.min(balance.total, budget ? budget.left : Number.MAX_SAFE_INTEGER);
    return { key: quote.key, add_ons: quote.addOns, credits: quote.credits, access: decision, available, enough: available >= quote.credits };
  },
};

export const actions = {
  async GET(ctx: RequestContext) {
    const status = ctx.query.get('status');
    const statuses = status === 'open' ? ['pending', 'running', 'failed'] as const : undefined;
    return { actions: (await ctx.actions.list({ statuses: statuses ? [...statuses] : undefined })).map((row) => actionJson(row, ctx.user.id)) };
  },
  async POST(ctx: RequestContext) {
    const body = record(await ctx.body());
    const view = await ctx.actions.decide(uuid(body.id, 'id'), oneOf(body.decision, 'decision', ['approve', 'decline', 'retry'] as const));
    return { action: actionJson(view, ctx.user.id) };
  },
};

/** POST core/report: report an AI answer; it goes to the Schood admin queue. */
export async function report(ctx: RequestContext) {
  const body = record(await ctx.body());
  const message = await ctx.repo.message(uuid(body.message_id, 'message_id'));
  if (!message || message.role !== 'assistant') throw new SchoodAIError('not_found', 'Answer not found.', 404);
  const thread = await ownThread(ctx, message.threadId);
  const created = await ctx.repo.createReport({
    messageId: message.id, workspaceId: thread.workspaceId, reporterId: ctx.user.id,
    reason: oneOf(body.reason, 'reason', ['harmful', 'incorrect', 'inappropriate', 'privacy', 'other'] as const),
    note: optionalText(body.note, 'note', { max: 1000 }), excerpt: message.content.slice(0, 4000),
  });
  return { report_id: created.id, created: created.created };
}

const HEX = /^#[0-9a-f]{6}$/i;
export const settings = {
  async GET(ctx: RequestContext) {
    const access = await ctx.workspace();
    const service = await ctx.repo.settings();
    return {
      workspace: { ...workspaceView(access.workspace, access.role), house_style: access.workspace.houseStyle, features: switchesOf(access) ?? {} },
      service: { ai_enabled: service.aiEnabled, features: service.features },
      can_edit: MANAGER_ROLES.includes(access.role),
    };
  },
  /** Owners and admins: name, branding, house style and the workspace's feature switches. */
  async PATCH(ctx: RequestContext) {
    const access = await ctx.workspace({ roles: MANAGER_ROLES });
    const body = record(await ctx.body());
    const patch: Parameters<typeof ctx.repo.updateWorkspace>[1] = {};
    if (body.name !== undefined) patch.name = text(body.name, 'name', { max: 120 });
    if (body.branding !== undefined) {
      const branding = jsonObject(body.branding, 'branding', 4000);
      if (branding.logo_url !== undefined && branding.logo_url !== null && !(typeof branding.logo_url === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(branding.logo_url))) throw new SchoodAIError('invalid_request', 'The logo must be an https address.', 400, { field: 'branding.logo_url' });
      for (const key of ['primary_color', 'accent_color']) if (branding[key] !== undefined && branding[key] !== null && !(typeof branding[key] === 'string' && HEX.test(branding[key] as string))) throw new SchoodAIError('invalid_request', 'Colours are #RRGGBB.', 400, { field: `branding.${key}` });
      patch.branding = brandingView(branding);
    }
    if (body.house_style !== undefined) {
      const style = jsonObject(body.house_style, 'house_style', 8000);
      patch.houseStyle = {
        ...(style.tone !== undefined ? { tone: optionalText(style.tone, 'house_style.tone', { max: 300 }) } : {}),
        ...(style.instruction_language !== undefined ? { instruction_language: oneOf(style.instruction_language, 'house_style.instruction_language', ['en', 'uz', 'ru'] as const) } : {}),
        ...(style.worksheet_template !== undefined ? { worksheet_template: optionalText(style.worksheet_template, 'house_style.worksheet_template', { max: 60 }) } : {}),
      };
    }
    if (body.features !== undefined) patch.settings = { ...access.workspace.settings, features: cleanSwitches(body.features) };
    const workspace = await ctx.repo.updateWorkspace(access.workspace.id, patch);
    await ctx.audit('workspace.settings', { fields: Object.keys(patch) }, { type: 'workspace', id: workspace.id });
    return { workspace: workspaceView(workspace, access.role) };
  },
};

export const generations = {
  /** One job (`?id=`) for polling, or your recent jobs here. */
  async GET(ctx: RequestContext) {
    const access = await ctx.workspace();
    const id = ctx.query.get('id');
    if (id) {
      const row = isUuid(id) ? await ctx.repo.generation(id.toLowerCase()) : null;
      if (!row || row.workspaceId !== access.workspace.id || (row.userId !== ctx.user.id && !STAFF_ROLES.includes(access.role))) throw new SchoodAIError('not_found', 'Job not found.', 404);
      return { generation: generationJson(row) };
    }
    return { generations: (await ctx.repo.generations(access.workspace.id, ctx.user.id, 50)).map(generationJson) };
  },
  /** Approve & save or decline a ready draft. Nothing generated reaches students before this. */
  async POST(ctx: RequestContext) {
    const body = record(await ctx.body());
    const access = await ctx.workspace();
    const row = await ctx.repo.generation(uuid(body.id, 'id'));
    if (!row || row.workspaceId !== access.workspace.id) throw new SchoodAIError('not_found', 'Job not found.', 404);
    const mayDecide = access.workspace.kind === 'personal' ? row.userId === ctx.user.id : STAFF_ROLES.includes(access.role);
    if (!mayDecide) throw new SchoodAIError('role_required', 'A teacher must review this.', 403, { roles: STAFF_ROLES });
    const decision = oneOf(body.decision, 'decision', ['approve', 'reject'] as const);
    const status = decision === 'approve' ? 'approved' : 'rejected';
    if (row.status === status) return { generation: generationJson(row) };
    const updated = await ctx.repo.updateGeneration(row.id, { status, decidedBy: ctx.user.id, decidedAt: ctx.now().toISOString() }, ['ready']);
    if (!updated) throw new SchoodAIError('not_ready', 'This draft is not ready for review.', 409, { status: row.status });
    await ctx.audit(`generation.${status}`, { feature: row.feature }, { type: 'generation', id: row.id });
    return { generation: generationJson(updated) };
  },
};

/** GET core/context?kind=: what Schood AI knows about you, exactly as the model sees it. */
export async function context(ctx: RequestContext) {
  const kind = ctx.query.get('kind') ?? 'learner_profile';
  if (!selfViewKinds().includes(kind)) throw new SchoodAIError('not_found', 'Unknown context.', 404);
  return { blocks: await ctx.context([kind]) };
}
