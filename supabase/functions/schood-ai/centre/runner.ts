import { featureAccess, type AccessDecision, type PlanCode } from '../../../../packages/ai-core/src/mod.ts';
import { SchoodAIError, type ActionView, type Locale, type RequestContext, type Workspace, type WorkspaceAccess } from '../types.ts';
import { centreDeps } from './binding.ts';

// Work the centre does with nobody signed in: its Telegram bot and website widgets
// (core's anonymous routes) and its scheduled jobs (system routes). The request
// context there has no person, so this gives the centre's own code a view of it:
//   - ctx.ai is the centre's pool, through core's ctx.paidBy(centre), and nothing else;
//   - ctx.workspace() answers with the centre and the owner role (nobody is acting as
//     the owner: ctx.user still throws, the ledger has no user, audits have no actor);
//   - feature checks use the plan the centre last showed a manager (refreshLimits
//     stores it), since core has no ctx.planFor yet; every charge is still checked
//     against the live plan by ctx.paidBy;
//   - actions are proposed by nobody (proposedBy null) for staff to approve.

/** What the plan allowed when a manager last opened the centre (settings.limits.access). */
export interface CachedAccess { plans: PlanCode[]; beta: boolean; grants: string[] }

export function cachedAccess(limits: Record<string, unknown>): CachedAccess | null {
  const access = limits.access as Partial<CachedAccess> | undefined;
  if (!access || !Array.isArray(access.plans)) return null;
  return { plans: access.plans as PlanCode[], beta: access.beta === true, grants: Array.isArray(access.grants) ? access.grants.map(String) : [] };
}

/** A feature decision from the cached plan; without one, nothing is on. */
export function cachedDecision(access: CachedAccess | null, feature: string): AccessDecision {
  if (!access) return { allowed: false, reason: 'plan_required', plans: [] };
  return featureAccess(feature, { plans: access.plans, workspaceKind: 'centre', role: 'owner', beta: access.beta, grants: access.grants });
}

/** The proposals the centre makes with nobody signed in. */
export interface CentreProposal { kind: string; payload: Record<string, unknown>; summary: string; expiresInHours: number }

/** The request context for the centre's own work on anonymous and system routes. */
export async function asCentre(ctx: RequestContext, workspace: Workspace, locale: Locale): Promise<RequestContext> {
  if (ctx.caller !== 'anonymous' && ctx.caller !== 'system') throw new Error('asCentre is for anonymous and system routes');
  if (workspace.kind !== 'centre' || workspace.status !== 'active') throw new SchoodAIError('workspace_not_found', 'Workspace not found.', 404);
  const deps = await centreDeps(ctx);
  const [settings, member] = await Promise.all([
    deps.store.table('settings').get({ workspace_id: workspace.id }),
    ctx.repo.membership(workspace.id, workspace.ownerId),
  ]);
  const plan = cachedAccess((settings?.limits ?? {}) as Record<string, unknown>);
  const access: WorkspaceAccess = {
    workspace,
    member: member ?? { workspaceId: workspace.id, userId: workspace.ownerId, role: 'owner', status: 'active', creditBudget: null, budgetPeriod: null, budgetUsed: 0 },
    role: 'owner',
  };
  // The only way this work pays for AI: the centre's pool, under its live plan (resolved at the first charge).
  const ai = await ctx.paidBy(workspace.id);
  const decide = (feature: string) => cachedDecision(plan, feature);
  const actionView = (row: ActionView | Omit<ActionView, 'display' | 'interrupted' | 'retrySafe' | 'canApprove'>): ActionView => ({ display: {}, interrupted: false, retrySafe: false, canApprove: false, ...row });
  const view = Object.create(ctx) as RequestContext;
  Object.defineProperties(view, {
    locale: { value: locale },
    ai: { value: ai },
    workspace: { value: () => Promise.resolve(access) },
    access: { value: (feature: string) => Promise.resolve(decide(feature)) },
    // Audits name the centre (these routes carry no workspace in the URL) and no actor.
    audit: {
      value: async (event: string, details: Record<string, unknown> = {}, target?: { type: string; id: string }) => {
        try {
          await ctx.repo.audit({ workspaceId: workspace.id, actorId: null, event, targetType: target?.type ?? null, targetId: target?.id ?? null, details });
        } catch (cause) {
          console.error(JSON.stringify({ event: 'schood_ai_centre_audit_failed', audit: event, error: String(cause).slice(0, 200) }));
        }
      },
    },
    requireFeature: {
      value: (feature: string) => {
        const decision = decide(feature);
        if (decision.allowed) return Promise.resolve(access);
        return Promise.reject(new SchoodAIError('plan_required', 'This centre’s plan does not include this.', 402, { feature }));
      },
    },
    actions: {
      value: {
        list: async (options: { statuses?: ActionView['status'][]; limit?: number } = {}) => (await ctx.repo.actions(workspace.id, { statuses: options.statuses, limit: Math.min(options.limit ?? 50, 100) })).map(actionView),
        propose: () => Promise.reject(new Error('use proposeAsCentre on anonymous and system routes')),
        get: () => Promise.reject(new Error('no person to show an action to')),
        decide: () => Promise.reject(new Error('only a person decides an action')),
      },
    },
  });
  return view;
}

/** Queues an Approve & run action that nobody proposed (the admissions agent, a schedule); staff approve it. */
export async function proposeAsCentre(ctx: RequestContext, workspaceId: string, proposal: CentreProposal): Promise<{ id: string }> {
  const row = await ctx.repo.createAction({
    workspaceId, kind: proposal.kind, payload: proposal.payload, summary: proposal.summary.trim().slice(0, 500) || proposal.kind, proposedBy: null,
    threadId: null, messageId: null, expiresAt: new Date(ctx.now().getTime() + proposal.expiresInHours * 3_600_000).toISOString(),
  });
  await ctx.repo.audit({ workspaceId, actorId: null, event: 'action.proposed', targetType: 'action', targetId: row.id, details: { kind: proposal.kind, by: 'centre' } });
  return { id: row.id };
}

/** Who did it, for audits: the signed-in person, or nobody on anonymous and system routes. */
export const actorOf = (ctx: RequestContext): string | null => (ctx.caller === 'user' || ctx.caller === 'service' ? ctx.user.id : null);
