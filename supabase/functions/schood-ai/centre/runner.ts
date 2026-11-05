import { featureAccess } from '../../../../packages/ai-core/src/mod.ts';
import { SchoodAIError, type ActionView, type Locale, type RequestContext, type Workspace, type WorkspaceAccess } from '../types.ts';

// Work the centre does with nobody signed in: its Telegram bot and website widgets
// (core's anonymous routes) and its scheduled jobs (core's system jobs). The request
// context there has no person, so this gives the centre's own code a view of it:
//   - ctx.ai is the centre's pool, through core's ctx.paidBy(centre), and nothing else;
//   - ctx.workspace() answers with the centre and the owner role (nobody is acting as
//     the owner: ctx.user still throws, the ledger has no user, audits have no actor);
//   - feature checks use the centre's plan now (core's ctx.planFor);
//   - actions are proposed by nobody (proposedBy null) for staff to approve.

/** The request context for the centre's own work on anonymous routes and system jobs. */
export async function asCentre(ctx: RequestContext, workspace: Workspace, locale: Locale): Promise<RequestContext> {
  if (ctx.caller !== 'anonymous' && ctx.caller !== 'system') throw new Error('asCentre is for anonymous routes and system jobs');
  if (workspace.kind !== 'centre' || workspace.status !== 'active') throw new SchoodAIError('workspace_not_found', 'Workspace not found.', 404);
  const [plan, member] = await Promise.all([ctx.planFor(workspace.id), ctx.repo.membership(workspace.id, workspace.ownerId)]);
  const access: WorkspaceAccess = {
    workspace,
    member: member ?? { workspaceId: workspace.id, userId: workspace.ownerId, role: 'owner', status: 'active', creditBudget: null, budgetPeriod: null, budgetUsed: 0 },
    role: 'owner',
  };
  // The only way this work pays for AI: the centre's pool, under its live plan.
  const ai = await ctx.paidBy(workspace.id);
  const decide = (feature: string) => featureAccess(feature, { plans: plan.plans, workspaceKind: 'centre', role: 'owner', beta: plan.beta, grants: plan.features });
  const actionView = (row: Omit<ActionView, 'display' | 'interrupted' | 'retrySafe' | 'canApprove'>): ActionView => ({ display: {}, interrupted: false, retrySafe: false, canApprove: false, ...row });
  const view = Object.create(ctx) as RequestContext;
  Object.defineProperties(view, {
    locale: { value: locale },
    ai: { value: ai },
    workspace: { value: () => Promise.resolve(access) },
    plan: { value: () => Promise.resolve(plan) },
    access: { value: (feature: string) => Promise.resolve(decide(feature)) },
    requireFeature: {
      value: (feature: string) => {
        const decision = decide(feature);
        if (decision.allowed) return Promise.resolve(access);
        return Promise.reject(new SchoodAIError('plan_required', 'This centre’s plan does not include this.', 402, { feature }));
      },
    },
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
    actions: {
      value: {
        list: async (options: { statuses?: ActionView['status'][]; limit?: number } = {}) => (await ctx.repo.actions(workspace.id, { statuses: options.statuses, limit: Math.min(options.limit ?? 50, 100) })).map(actionView),
        propose: () => Promise.reject(new Error('use proposeAsCentre with nobody signed in')),
        get: () => Promise.reject(new Error('no person to show an action to')),
        decide: () => Promise.reject(new Error('only a person decides an action')),
      },
    },
  });
  return view;
}

/** The proposals the centre makes with nobody signed in. */
export interface CentreProposal { kind: string; payload: Record<string, unknown>; summary: string; expiresInHours: number }

/** Queues an Approve & run action that nobody proposed (the admissions agent); staff approve it. */
export async function proposeAsCentre(ctx: RequestContext, workspaceId: string, proposal: CentreProposal): Promise<{ id: string }> {
  const row = await ctx.repo.createAction({
    workspaceId, kind: proposal.kind, payload: proposal.payload, summary: proposal.summary.trim().slice(0, 500) || proposal.kind, proposedBy: null,
    threadId: null, messageId: null, expiresAt: new Date(ctx.now().getTime() + proposal.expiresInHours * 3_600_000).toISOString(),
  });
  await ctx.repo.audit({ workspaceId, actorId: null, event: 'action.proposed', targetType: 'action', targetId: row.id, details: { kind: proposal.kind, by: 'centre' } });
  return { id: row.id };
}

/** Who did it, for audits: the signed-in person, or nobody on anonymous routes and system jobs. */
export const actorOf = (ctx: RequestContext): string | null => (ctx.caller === 'user' || ctx.caller === 'service' ? ctx.user.id : null);
