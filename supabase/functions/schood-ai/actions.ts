import { ROLES } from '../../../packages/ai-core/src/mod.ts';
import { SchoodAIError, type ActionRow, type ActionService, type ActionStatus, type ActionView, type Area, type Locale, type RequestContext, type Role } from './types.ts';

// The Approve & run queue (ai_actions). Anything that acts on the outside world
// (a parent message, a homework assignment, a channel post, a booking) is proposed
// with its exact payload, shown to a person with the right role as stored, and
// runs only when they approve, with that person's own permissions. Approving twice
// runs once; a run that died mid-way shows as interrupted and is retried only for
// kinds that say a retry is safe. Pattern from CopilotKit/OpenDots (MIT).

export interface ActionKind<P = Record<string, unknown>> {
  kind: string;
  area: Area;
  /** Roles in the action's workspace that may approve and run it. */
  approverRoles: Role[];
  /** Validates and normalises the payload, both when proposed and again before running. */
  parse(payload: unknown): P;
  /** One line for the card, made by the server from the payload, never by the model. */
  summary(payload: P, locale: Locale): string;
  /** Label → value pairs shown on the card; defaults to the payload's own fields. */
  display?(payload: P): Record<string, string>;
  /** Performs the action as the approving person (ctx.user, ctx.functions with their token). */
  run(ctx: RequestContext, payload: P, action: ActionRow): Promise<Record<string, unknown>>;
  /** Running it twice does no harm, so a failed or interrupted run may be retried. */
  retrySafe?: boolean;
  expiresInHours?: number;
}

const kinds = new Map<string, ActionKind<unknown>>();
const KIND = /^[a-z][a-z0-9_]{1,60}$/;
/** A run older than this that never finished was interrupted (the function died). */
const INTERRUPTED_MS = 10 * 60_000;

export function registerActionKind<P>(definition: ActionKind<P>): void {
  if (!KIND.test(definition.kind)) throw new Error(`action kind ${definition.kind} is invalid`);
  if (kinds.has(definition.kind)) throw new Error(`action kind ${definition.kind} is already registered`);
  if (!definition.approverRoles.length || definition.approverRoles.some((role) => !ROLES.includes(role))) throw new Error(`action kind ${definition.kind}: approver roles`);
  kinds.set(definition.kind, definition as ActionKind<unknown>);
}

const flatten = (payload: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(payload).slice(0, 20).map(([key, value]) => [key, (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 2000)]));

export function createActionService(ctx: RequestContext): ActionService {
  const now = () => ctx.now();
  async function memberRole(workspaceId: string): Promise<Role> {
    const member = await ctx.repo.membership(workspaceId, ctx.user.id);
    if (!member || member.status !== 'active') throw new SchoodAIError('not_found', 'Action not found.', 404);
    return member.role;
  }
  function view(row: ActionRow, role: Role): ActionView {
    const kind = kinds.get(row.kind);
    const interrupted = row.status === 'running' && !!row.startedAt && now().getTime() - Date.parse(row.startedAt) > INTERRUPTED_MS;
    let display: Record<string, string> = {};
    try { display = kind?.display ? kind.display(kind.parse(row.payload)) : flatten(row.payload); } catch { display = flatten(row.payload); }
    return { ...row, display, interrupted, retrySafe: !!kind?.retrySafe, canApprove: !!kind && kind.approverRoles.includes(role) && (row.status === 'pending' || ((row.status === 'failed' || interrupted) && !!kind.retrySafe)) };
  }
  async function run(row: ActionRow, kind: ActionKind<unknown>, role: Role): Promise<ActionView> {
    try {
      const result = await kind.run(ctx, kind.parse(row.payload), row);
      const done = await ctx.repo.transitionAction(row.id, ['running'], { status: 'done', result: JSON.parse(JSON.stringify(result ?? {})), finishedAt: now().toISOString(), errorCode: null });
      await ctx.audit('action.done', { kind: row.kind }, { type: 'action', id: row.id });
      return view(done ?? (await ctx.repo.action(row.id))!, role);
    } catch (cause) {
      const code = cause instanceof SchoodAIError ? cause.code : 'run_failed';
      if (!(cause instanceof SchoodAIError)) console.error(JSON.stringify({ event: 'schood_ai_action_failed', kind: row.kind, action: row.id, error: String(cause).slice(0, 300) }));
      const failed = await ctx.repo.transitionAction(row.id, ['running'], { status: 'failed', errorCode: code.slice(0, 64), finishedAt: now().toISOString() });
      await ctx.audit('action.failed', { kind: row.kind, code }, { type: 'action', id: row.id });
      return view(failed ?? (await ctx.repo.action(row.id))!, role);
    }
  }
  return {
    async propose(input) {
      const kind = kinds.get(input.kind);
      if (!kind) throw new SchoodAIError('unknown_action_kind', 'This kind of action is not available.', 400);
      const access = await ctx.workspace();
      const payload = kind.parse(input.payload) as Record<string, unknown>;
      const summary = kind.summary(payload, ctx.locale).trim().slice(0, 500) || input.kind;
      const row = await ctx.repo.createAction({
        workspaceId: access.workspace.id, kind: input.kind, payload, summary, proposedBy: ctx.user.id,
        threadId: input.threadId ?? null, messageId: input.messageId ?? null,
        expiresAt: new Date(now().getTime() + (kind.expiresInHours ?? 168) * 3_600_000).toISOString(),
      });
      await ctx.audit('action.proposed', { kind: input.kind }, { type: 'action', id: row.id });
      return view(row, access.role);
    },
    async list(options = {}) {
      const access = await ctx.workspace();
      const rows = await ctx.repo.actions(access.workspace.id, { statuses: options.statuses, limit: Math.min(options.limit ?? 50, 100) });
      // People see what they proposed and what they may approve.
      return rows.filter((row) => row.proposedBy === ctx.user.id || !!kinds.get(row.kind)?.approverRoles.includes(access.role)).map((row) => view(row, access.role));
    },
    async decide(id, decision) {
      let row = await ctx.repo.action(id);
      if (!row) throw new SchoodAIError('not_found', 'Action not found.', 404);
      const role = await memberRole(row.workspaceId);
      const kind = kinds.get(row.kind);
      if (!kind) throw new SchoodAIError('unknown_action_kind', 'This kind of action is not available.', 409);
      if (!kind.approverRoles.includes(role)) throw new SchoodAIError('role_required', 'Someone with another role must approve this.', 403, { roles: kind.approverRoles });
      if (row.status === 'pending' && Date.parse(row.expiresAt) <= now().getTime()) {
        row = (await ctx.repo.transitionAction(id, ['pending'], { status: 'expired' })) ?? (await ctx.repo.action(id))!;
      }
      const stamp = { decidedBy: ctx.user.id, decidedAt: now().toISOString() };
      if (decision === 'decline') {
        const declined = await ctx.repo.transitionAction(id, ['pending'], { status: 'declined', ...stamp });
        if (declined) await ctx.audit('action.declined', { kind: row.kind }, { type: 'action', id });
        return view(declined ?? (await ctx.repo.action(id))!, role);
      }
      const current = view(row, role);
      const from: ActionStatus[] = decision === 'approve' ? ['pending'] : current.retrySafe && (row.status === 'failed' || current.interrupted) ? [row.status] : [];
      // Someone else already decided, or this is a second click: show what happened.
      if (!from.length) return current;
      const claimed = await ctx.repo.transitionAction(id, from, { status: 'running', ...stamp, startedAt: now().toISOString(), attempts: row.attempts + 1, errorCode: null });
      if (!claimed) return view((await ctx.repo.action(id))!, role);
      await ctx.audit(decision === 'approve' ? 'action.approved' : 'action.retried', { kind: row.kind }, { type: 'action', id });
      return run(claimed, kind, role);
    },
  };
}
