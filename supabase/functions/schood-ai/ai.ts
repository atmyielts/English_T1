import { featureSwitch, nextTashkentMidnight, quoteCredits, type CallMode, type CreditQuote, type Schema } from '../../../packages/ai-core/src/mod.ts';
import { requireAdult } from './age.ts';
import type { Gateway, GatewayFailure, GatewayRequest, GatewayResult, Ticket } from './gateway.ts';
import {
  SchoodAIError, type Balance, type ChargedAI, type ChargedCall, type ChargedSession, type ChargeReceipt, type PlanState, type RequestContext,
  type SchoodAIRepository, type SpendReceipt, type WorkspaceAccess,
} from './types.ts';

// Charged model calls: the only way a route uses AI. In order:
//   plan and role (plan_required / role_required) → switches, route and caps
//   (gateway.reserve) → charge the exact price from ai-core → call → refund on any
//   failure. A stop by the person keeps the charge. Credits charged and the call
//   are linked in ai_calls and the ledger.

export function failureError(failure: GatewayFailure, now: Date): SchoodAIError {
  switch (failure.status) {
    case 'disabled': return new SchoodAIError('ai_disabled', 'Schood AI is switched off for this right now.', 503, { scope: failure.scope });
    case 'unavailable': return new SchoodAIError('ai_unavailable', 'No AI model is set up for this yet.', 503, { reason: failure.reason });
    case 'capped': return new SchoodAIError('capped', 'Schood AI has reached its limit for today. Try again later.', 429, { scope: failure.scope, retry_after: nextTashkentMidnight(now).toISOString() });
    case 'stopped': return new SchoodAIError('stopped', 'Stopped.', 409);
    default: return new SchoodAIError('ai_failed', 'The AI could not answer just now. Your credits were returned.', 502, { reason: failure.code });
  }
}

const balanceView = (balance: Balance) => ({ plan: balance.plan, plan_grant: balance.planGrant, pack: balance.pack, total: balance.total, cycle_ends_at: balance.cycleEndsAt });

/**
 * Who pays and what they may use. A signed-in route's scope is the caller in their
 * workspace (ctx.ai); ctx.paidBy builds one for a named workspace with no user.
 */
export interface ChargeScope {
  requestId: string;
  idempotencyKey: string | null;
  /** The person charged within a centre budget; null when the workspace itself pays. */
  readonly userId: string | null;
  gateway: Gateway;
  repo: SchoodAIRepository;
  now(): Date;
  requireFeature(feature: string): Promise<WorkspaceAccess>;
  plan(): Promise<PlanState>;
  /** For adultsOnly price entries. */
  requireAdult(): Promise<void>;
}

/** The scope of a signed-in route (or the worker acting for a linked person). */
export function scopeOf(ctx: RequestContext): ChargeScope {
  return {
    requestId: ctx.requestId, idempotencyKey: ctx.idempotencyKey, gateway: ctx.gateway, repo: ctx.repo,
    get userId() { return ctx.user.id; },
    now: () => ctx.now(),
    requireFeature: (feature) => ctx.requireFeature(feature),
    plan: () => ctx.plan(),
    requireAdult: () => requireAdult(ctx, ctx.user.id),
  };
}

const quoteFor = (input: { key: string; addOns?: string[] }): CreditQuote => {
  try { return quoteCredits(input.key, input.addOns ?? []); } catch { throw new SchoodAIError('invalid_request', 'Unknown AI action.', 400, { field: 'key' }); }
};

/** Charges a quote within a scope, or throws the refusal as a clear SchoodAIError. */
async function chargeQuote(scope: ChargeScope, quote: CreditQuote, access: WorkspaceAccess, plan: PlanState, reference: string): Promise<ChargeReceipt> {
  const charge = await scope.repo.charge({ workspaceId: access.workspace.id, userId: scope.userId, cost: quote.credits, creditKey: quote.key, reference, grant: plan.grant, anchor: plan.anchor });
  if (!charge.ok) {
    if (charge.code === 'reference_refunded') throw new SchoodAIError('retry_with_new_key', 'That attempt failed and was refunded. Try again.', 409);
    if (charge.code === 'not_member') throw new SchoodAIError('not_member', 'You are not an active member of this workspace.', 403);
    throw new SchoodAIError(charge.code, charge.code === 'budget_exhausted' ? 'Your credit budget for this month is used up.' : 'Not enough credits for this.', 402, {
      cost: quote.credits, ...(charge.available !== undefined ? { available: charge.available } : {}), ...(charge.budget !== undefined ? { budget: charge.budget, used: charge.used } : {}),
      ...(charge.balance ? { balance: balanceView(charge.balance) } : {}),
    });
  }
  return { credits: quote.credits, chargeId: charge.chargeId, balance: charge.balance, replayed: charge.replayed };
}

/** ctx.credits.spend: a priced action with no model call. Plan, role, age and switches apply; no route or call cap. */
export function createSpend(scope: ChargeScope) {
  return async (input: { key: string; addOns?: string[]; reference?: string }): Promise<SpendReceipt> => {
    const quote = quoteFor(input);
    const access = await scope.requireFeature(quote.feature);
    if (quote.adultsOnly) await scope.requireAdult();
    const settings = await scope.repo.settings();
    const switched = featureSwitch({ enabled: settings.aiEnabled, features: settings.features, workspace: switchesOf(access) }, quote.key);
    if (!switched.on) throw failureError({ status: 'disabled', scope: switched.scope, callId: '' }, scope.now());
    const plan = await scope.plan();
    const reference = (input.reference ?? (scope.idempotencyKey ? `${quote.key}:${scope.idempotencyKey}` : crypto.randomUUID())).slice(0, 200);
    const receipt = await chargeQuote(scope, quote, access, plan, reference);
    return { ...receipt, refund: async () => { await scope.repo.refund(receipt.chargeId); } };
  };
}

export function createChargedAI(ctx: RequestContext): ChargedAI {
  return createChargedAIFor(scopeOf(ctx));
}

export function createChargedAIFor(scope: ChargeScope): ChargedAI {
  const ctx = scope;
  async function prepare(input: { key: string; addOns?: string[]; reference?: string; requires?: ChargedCall['requires'] }, mode: CallMode, request: Omit<GatewayRequest, 'feature' | 'userId' | 'workspaceId' | 'requestId' | 'workspaceSwitches'>) {
    const quote = quoteFor(input);
    const access = await ctx.requireFeature(quote.feature);
    if (quote.adultsOnly) await ctx.requireAdult();
    const plan = await ctx.plan();
    const base: GatewayRequest = {
      ...request,
      feature: quote.key, tier: quote.tier,
      requires: { capabilities: [...quote.requires, ...(input.requires?.capabilities ?? [])], noTraining: input.requires?.noTraining },
      userId: ctx.userId, workspaceId: access.workspace.id, requestId: ctx.requestId,
      workspaceSwitches: switchesOf(access),
    };
    const ticket = await ctx.gateway.reserve(base, mode);
    if (!ticket.ok) throw failureError(ticket.failure, ctx.now());
    const reference = (input.reference ?? (ctx.idempotencyKey ? `${quote.key}:${ctx.idempotencyKey}` : crypto.randomUUID())).slice(0, 200);
    // On the workspace's own key (C15) the platform fee replaces the credit price; a fee of 0 charges nothing.
    const own = ticket.ownKey;
    const receipt = !own ? await chargeQuote(ctx, quote, access, plan, reference)
      : own.feeCredits > 0 ? await chargeQuote(ctx, { ...quote, credits: own.feeCredits }, access, plan, reference)
      : { credits: 0, chargeId: '', balance: await ctx.repo.creditBalance(access.workspace.id, plan.grant, plan.anchor), replayed: false };
    return { base: { ...base, credits: receipt.credits, chargeId: receipt.chargeId || null }, ticket, receipt, access };
  }

  async function refund(chargeId: string): Promise<Balance | null> {
    if (!chargeId) return null; // nothing was charged (a workspace's own key with no fee)
    try {
      await ctx.repo.refund(chargeId);
      return null;
    } catch (cause) {
      // The person must get their credits back: this is logged for the operator.
      console.error(JSON.stringify({ event: 'schood_ai_refund_failed', charge_id: chargeId, error: String(cause).slice(0, 200) }));
      return null;
    }
  }
  async function settle<T>(receipt: ChargeReceipt, result: GatewayResult<T>): Promise<{ data: T; callId: string }> {
    if (result.status === 'ok') return { data: result.data, callId: result.callId };
    await refund(receipt.chargeId);
    throw failureError(result, ctx.now());
  }
  const chat = (input: ChargedCall) => ({ messages: input.messages, maxTokens: input.maxTokens, temperature: input.temperature, signal: input.signal });

  const ai: ChargedAI = {
    async text(input) {
      const { base, ticket, receipt } = await prepare(input, 'text', chat(input));
      const out = await settle(receipt, await ctx.gateway.text(base, ticket as Ticket));
      return { ...receipt, text: out.data, callId: out.callId };
    },
    async json(input) {
      const { base, ticket, receipt } = await prepare(input, 'json', chat(input));
      const out = await settle(receipt, await ctx.gateway.json(base, input.schema, ticket as Ticket));
      return { ...receipt, data: out.data, callId: out.callId };
    },
    async stream(input) {
      const { base, ticket, receipt } = await prepare(input, 'stream', chat(input));
      const held = ticket as Ticket;
      return {
        ...receipt,
        callId: held.callId,
        async run(onDelta, signal) {
          try {
            const result = await ctx.gateway.stream({ ...base, signal: signal ?? base.signal }, onDelta, held);
            if (result.status === 'ok') return { status: 'ok', text: result.data, modelKey: result.modelKey };
            if (result.status === 'stopped') return { status: 'stopped', text: result.partial, modelKey: null };
            await refund(receipt.chargeId);
            return { status: 'failed', text: result.status === 'failed' ? result.partial ?? '' : '', code: result.status === 'failed' ? result.code : result.status, modelKey: null };
          } catch (cause) {
            console.error(JSON.stringify({ event: 'schood_ai_stream_failed', request_id: ctx.requestId, error: String(cause).slice(0, 200) }));
            await refund(receipt.chargeId);
            return { status: 'failed', text: '', code: 'internal_error', modelKey: null };
          }
        },
      };
    },
    async transcribe(input) {
      if (input.audio.length < 100 || input.audio.length > 10_000_000) throw new SchoodAIError('invalid_request', 'The recording must be between 0.1 KB and 10 MB.', 400, { field: 'audio' });
      const { base, ticket, receipt } = await prepare(input, 'stt', { messages: [] });
      const out = await settle(receipt, await ctx.gateway.transcribe({ ...base, audio: input.audio, mime: input.mime, language: input.language }, ticket as Ticket));
      return { ...receipt, transcript: out.data };
    },
    async speak(input) {
      if (!input.text.trim() || input.text.length > 4000) throw new SchoodAIError('invalid_request', 'Text to speak must be 1 to 4000 characters.', 400, { field: 'text' });
      const { base, ticket, receipt } = await prepare(input, 'tts', { messages: [] });
      const out = await settle(receipt, await ctx.gateway.speak({ ...base, text: input.text, voice: input.voice, format: input.format }, ticket as Ticket));
      return { ...receipt, ...out.data };
    },
    async charged(input, work) {
      // The reserved ticket serves the first call of the same mode; later calls reserve their own cap slot.
      const mode = input.mode ?? 'text';
      const { base, ticket, receipt } = await prepare(input, mode, { messages: [] });
      let reserved: Ticket | undefined = ticket as Ticket;
      const take = (wanted: CallMode) => { const held = reserved?.mode === wanted ? reserved : undefined; reserved = undefined; return held; };
      const call = async <T>(result: Promise<GatewayResult<T>>) => {
        const value = await result;
        if (value.status !== 'ok') throw failureError(value, ctx.now());
        return value.data;
      };
      const session: ChargedSession = {
        text: (request) => call(ctx.gateway.text({ ...base, ...request, requires: merge(base, request.requires) }, take('text'))),
        json: (request) => call(ctx.gateway.json({ ...base, ...request, requires: merge(base, request.requires) }, request.schema as Schema<never>, take('json'))),
        transcribe: (request) => call(ctx.gateway.transcribe({ ...base, ...request }, take('stt'))),
        speak: (request) => call(ctx.gateway.speak({ ...base, ...request }, take('tts'))),
      };
      try {
        return { ...receipt, result: await work(session) };
      } catch (cause) {
        await refund(receipt.chargeId);
        throw cause;
      }
    },
  };
  return ai;
}

const merge = (base: GatewayRequest, requires: ChargedCall['requires']) => ({
  capabilities: [...(base.requires?.capabilities ?? []), ...(requires?.capabilities ?? [])],
  noTraining: !!(base.requires?.noTraining || requires?.noTraining),
});
export const switchesOf = (access: WorkspaceAccess) => {
  const features = (access.workspace.settings as { features?: unknown }).features;
  return features && typeof features === 'object' && !Array.isArray(features) ? features as Record<string, boolean> : null;
};
export { balanceView };
