import {
  candidateModels, costUsd, estimateTokens, featureSwitch, keyEnvAllowed, keyMayReach, modeCapabilities, pickRoute, SchemaError, tashkentDay,
  type CallMode, type Candidate, type Capability, type ModelTier, type Registry, type RegistryModel, type RegistryRoute, type Schema, type Switches,
} from '../../../packages/ai-core/src/mod.ts';
import { parseModelJson } from '../_shared/sat-ai.ts';
import { ADAPTERS, ProviderError, type Adapter, type ChatInput, type ChatMessage, type ContentPart, type ProviderTarget, type SpeechAudio, type Transcript } from './providers/mod.ts';
import type { CallRecord, CallStatus, CapScope, ServiceSettings } from './types.ts';

// The one gateway for every Schood AI model call. Callers name a feature (a credit
// key) and what it needs; the gateway never takes a model or a provider. For each
// call it:
//   1. applies the global, per-feature and workspace switches (ai_settings, workspace);
//   2. picks the route for the feature from the registry and keeps the route's models
//      that are enabled, have the capabilities and policy, are healthy (circuit
//      breaker) and have their key configured;
//   3. takes one call from the daily caps (global, spend, workspace, person);
//   4. tries the models in order with a timeout well under the Edge limit, falling
//      back on any provider failure, and repairs invalid JSON once;
//   5. records every attempt in ai_calls with tokens, latency, status and USD cost.
// It never throws for provider trouble; it returns a typed result.
//
// A workspace's own model keys (C15, registerOwnKeyResolver): only when the workspace's
// plan grants C15 (the request says so) is the resolver asked. When the workspace has a
// key for a provider on the route, only those models are tried, with that key, and
// never Schood's keys. A workspace that has keys but whose plan no longer grants C15 is
// refused (own_key_plan → plan_required), never moved to Schood's keys without notice. The log names the provider `byok:<label>` with no USD cost,
// and the shared circuit breaker ignores those attempts (one centre's bad key must not
// switch a model off for everyone). The key itself is never logged or stored. If the key
// store cannot answer, a centre's call is refused (ai_unavailable, own_key_check).

export interface Timeouts {
  /** One non-streaming attempt. */
  attemptMs: number;
  /** All attempts of one non-streaming call together. */
  totalMs: number;
  /** A stream must start within this, then may not go quiet for longer than idleMs. */
  firstByteMs: number;
  idleMs: number;
  streamTotalMs: number;
  speechMs: number;
}
export const DEFAULT_TIMEOUTS: Timeouts = { attemptMs: 35_000, totalMs: 55_000, firstByteMs: 25_000, idleMs: 20_000, streamTotalMs: 100_000, speechMs: 60_000 };

/** Skips a model after repeated provider failures, then lets one trial through. Per isolate. */
export class CircuitBreaker {
  private state = new Map<string, { failures: number; openUntil: number; tripped: boolean }>();
  constructor(private threshold = 3, private openMs = 60_000) {}
  healthy(key: string, now: number): boolean {
    const entry = this.state.get(key);
    return !entry || entry.openUntil <= now;
  }
  failure(key: string, now: number): void {
    const entry = this.state.get(key) ?? { failures: 0, openUntil: 0, tripped: false };
    if (entry.tripped) entry.openUntil = now + this.openMs;
    else if (++entry.failures >= this.threshold) Object.assign(entry, { tripped: true, openUntil: now + this.openMs });
    this.state.set(key, entry);
  }
  success(key: string): void {
    this.state.delete(key);
  }
}
const BREAKER_CODES = new Set(['rate_limited', 'server_error', 'timeout', 'network', 'auth', 'not_found', 'invalid_response']);

export interface GatewayDeps {
  registry(): Promise<Registry>;
  settings(): Promise<ServiceSettings>;
  takeCall(input: { day: string; userId: string | null; workspaceId: string | null; globalCap: number; userCap: number; workspaceCap: number; globalUsd: number | null }): Promise<{ ok: true } | { ok: false; scope: CapScope }>;
  /** Fire and forget: writing the log never delays or fails a call. */
  record(rows: CallRecord[]): void;
  env(name: string): string | undefined;
  fetch: typeof fetch;
  now(): Date;
  adapters?: Partial<Record<string, Adapter>>;
  breaker?: CircuitBreaker;
  /** SCHOOD_AI_GLOBAL_DAILY_CALLS: a deploy-time ceiling the settings row cannot raise. */
  globalCeiling?: number | null;
  timeouts?: Partial<Timeouts>;
  /** A workspace's own key for a provider (C15); null when it has none. Never logged. */
  ownKey?(input: { workspaceId: string; providerKey: string }): Promise<OwnKey | null>;
  /** Whether the workspace has own keys at all, without unsealing one (asked only when its plan lacks C15). */
  ownKeyConfigured?(input: { workspaceId: string }): Promise<boolean>;
}
/** A workspace's own provider key, unsealed. feeCredits: the platform fee charged per call instead of the credit price (0 when billed by contract). */
export interface OwnKey { label: string; apiKey: string; feeCredits?: number }

export interface GatewayRequest {
  /** A credit key (`tutor.reply`): selects the route and the switches, and labels the log. */
  feature: string;
  tier?: ModelTier;
  /** System messages first (joined), then the conversation. */
  messages: ChatMessage[];
  requires?: { capabilities?: Capability[]; noTraining?: boolean };
  maxTokens?: number;
  temperature?: number;
  userId?: string | null;
  workspaceId?: string | null;
  requestId?: string | null;
  workspaceSwitches?: Switches | null;
  credits?: number;
  chargeId?: string | null;
  signal?: AbortSignal;
  /** Set by charged calls in a centre workspace: whether its plan grants C15 (own keys), and the plans that would. Left out: no own keys (a personal workspace). */
  ownKeys?: { allowed: boolean; plans: string[] };
}
export type SpeechInRequest = Omit<GatewayRequest, 'messages' | 'maxTokens' | 'temperature'> & { audio: Uint8Array; mime: string; language?: string | null; prompt?: string | null };
export type SpeechOutRequest = Omit<GatewayRequest, 'messages' | 'maxTokens' | 'temperature'> & { text: string; voice?: string | null; format?: 'mp3' | 'opus' | 'wav' };

export type GatewayFailure =
  | { status: 'disabled'; scope: 'global' | 'feature' | 'workspace'; callId: string }
  | { status: 'unavailable'; reason: 'no_route' | 'no_model' | 'no_key' | 'own_key_check'; callId: string }
  | { status: 'refused'; reason: 'own_key_plan'; plans: string[]; callId: string }
  | { status: 'capped'; scope: CapScope; callId: string }
  | { status: 'failed'; code: string; callId: string; partial?: string }
  | { status: 'stopped'; callId: string; partial: string };
export interface GatewaySuccess<T> { status: 'ok'; data: T; callId: string; modelKey: string; inputTokens: number; outputTokens: number; costUsd: number }
export type GatewayResult<T> = GatewaySuccess<T> | GatewayFailure;

/** A call that passed switches, routing and caps; running it uses no further checks. */
export interface Ticket {
  ok: true; callId: string; mode: CallMode; route: RegistryRoute;
  /** logKey: `byok:<label>` for a workspace's own key, logged in place of the provider. */
  candidates: (Candidate & { apiKey: string; logKey?: string })[];
  /** Set when the call runs on the workspace's own key: no credits, the platform fee instead. */
  ownKey?: { label: string; feeCredits: number } | null;
}

export type Gateway = ReturnType<typeof createGateway>;

const MAX_INPUT_CHARS = 200_000;

export function createGateway(deps: GatewayDeps) {
  const adapters = { ...ADAPTERS, ...deps.adapters } as Record<string, Adapter>;
  const breaker = deps.breaker ?? new CircuitBreaker();
  const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };
  const nowMs = () => deps.now().getTime();

  const base = (req: GatewayRequest, callId: string, mode: CallMode): Omit<CallRecord, 'attempt' | 'status' | 'errorCode' | 'routeKey' | 'providerKey' | 'modelKey' | 'latencyMs' | 'inputTokens' | 'outputTokens' | 'usageEstimated' | 'costUsd'> => ({
    callId, requestId: req.requestId ?? null, feature: req.feature, userId: req.userId ?? null, workspaceId: req.workspaceId ?? null,
    credits: 0, chargeId: req.chargeId ?? null, streamed: mode === 'stream',
  });
  const refusal = (req: GatewayRequest, callId: string, mode: CallMode, status: CallStatus, errorCode: string, routeKey: string | null = null): CallRecord => ({
    ...base(req, callId, mode), attempt: 1, status, errorCode, routeKey, providerKey: null, modelKey: null, latencyMs: null, inputTokens: null, outputTokens: null, usageEstimated: false, costUsd: 0,
  });
  const record = (rows: CallRecord[]) => {
    try { deps.record(rows); } catch { /* logging never fails a call */ }
  };

  /** Switches, route and models, then one call from the caps. */
  async function reserve(req: GatewayRequest, mode: CallMode): Promise<Ticket | { ok: false; failure: GatewayFailure }> {
    const callId = crypto.randomUUID();
    const refuse = (failure: GatewayFailure, status: CallStatus, code: string, routeKey: string | null = null) => {
      record([refusal(req, callId, mode, status, code, routeKey)]);
      return { ok: false as const, failure };
    };
    const settings = await deps.settings();
    const switched = featureSwitch({ enabled: settings.aiEnabled, features: settings.features, workspace: req.workspaceSwitches }, req.feature);
    if (!switched.on) return refuse({ status: 'disabled', scope: switched.scope, callId }, 'disabled', `switch_${switched.scope}`);
    const registry = await deps.registry();
    const route = pickRoute(registry.routes, req.feature, req.tier ?? 'standard', mode);
    if (!route) return refuse({ status: 'unavailable', reason: 'no_route', callId }, 'unavailable', 'no_route');
    const images = 'messages' in req && req.messages.some((entry) => Array.isArray(entry.content) && entry.content.some((part) => part.type === 'image'));
    const capabilities: Capability[] = [...modeCapabilities(mode), ...(images ? ['vision' as const] : []), ...(req.requires?.capabilities ?? [])];
    const { candidates } = candidateModels(registry, route, { capabilities, noTraining: req.requires?.noTraining === true }, (key) => breaker.healthy(key, nowMs()));
    if (!candidates.length) return refuse({ status: 'unavailable', reason: 'no_model', callId }, 'unavailable', 'no_model', route.key);
    // The workspace's own keys first (C15): then only those models, never Schood's keys.
    // The resolver is asked only when the plan grants C15; keys without it are refused.
    let own: Exclude<Awaited<ReturnType<typeof ownKeys>>, 'unknown'> = null;
    if (req.workspaceId && req.ownKeys && deps.ownKey) {
      if (req.ownKeys.allowed) {
        const found = await ownKeys(req.workspaceId, candidates);
        if (found === 'unknown') return refuse({ status: 'unavailable', reason: 'own_key_check', callId }, 'unavailable', 'own_key_check', route.key);
        own = found;
      } else {
        const configured = await keysConfigured(req.workspaceId);
        if (configured === 'unknown') return refuse({ status: 'unavailable', reason: 'own_key_check', callId }, 'unavailable', 'own_key_check', route.key);
        if (configured) return refuse({ status: 'refused', reason: 'own_key_plan', plans: req.ownKeys.plans.length ? req.ownKeys.plans : ['enterprise'], callId }, 'unavailable', 'own_key_plan', route.key);
      }
    }
    // Otherwise a key must be configured and allowed to reach this provider's host.
    const keyed: Ticket['candidates'] = own?.candidates ?? candidates.flatMap((candidate) => {
      const env = candidate.provider.apiKeyEnv;
      const apiKey = keyEnvAllowed(env) && keyMayReach(env, candidate.provider.baseUrl) ? deps.env(env) ?? '' : '';
      return apiKey ? [{ ...candidate, apiKey }] : [];
    });
    if (!keyed.length) return refuse({ status: 'unavailable', reason: 'no_key', callId }, 'unavailable', 'no_key', route.key);
    const ceiling = deps.globalCeiling && deps.globalCeiling > 0 ? deps.globalCeiling : Number.MAX_SAFE_INTEGER;
    const cap = await deps.takeCall({
      day: tashkentDay(deps.now()), userId: req.userId ?? null, workspaceId: req.workspaceId ?? null,
      globalCap: Math.min(settings.globalDailyCalls, ceiling), userCap: settings.userDailyCalls, workspaceCap: settings.workspaceDailyCalls, globalUsd: settings.globalDailyUsd,
    });
    if (!cap.ok) return refuse({ status: 'capped', scope: cap.scope, callId }, 'capped', `cap_${cap.scope}`, route.key);
    return { ok: true, callId, mode, route, candidates: keyed, ownKey: own?.ownKey ?? null };
  }

  /** Whether a centre without C15 still has own keys; 'unknown' when the check failed (the call is refused, never moved). */
  async function keysConfigured(workspaceId: string): Promise<boolean | 'unknown'> {
    if (!deps.ownKeyConfigured) return false;
    try { return (await deps.ownKeyConfigured({ workspaceId })) === true; } catch (cause) {
      console.error(JSON.stringify({ event: 'schood_ai_own_key_check_failed', error: String(cause instanceof Error ? cause.name : 'error') }));
      return 'unknown';
    }
  }
  /** The workspace's own keys for the route's providers, or null when it has none (or the resolver failed). */
  async function ownKeys(workspaceId: string, candidates: Candidate[]): Promise<{ candidates: Ticket['candidates']; ownKey: { label: string; feeCredits: number } } | 'unknown' | null> {
    if (!deps.ownKey) return null;
    const found = new Map<string, OwnKey | null>();
    for (const providerKey of new Set(candidates.map((candidate) => candidate.provider.key))) {
      let key: OwnKey | null = null;
      try { key = await deps.ownKey({ workspaceId, providerKey }); } catch (cause) {
        // Never the key: only that the lookup failed. The call is refused, never moved to Schood's keys.
        console.error(JSON.stringify({ event: 'schood_ai_own_key_failed', provider: providerKey, error: String(cause instanceof Error ? cause.name : 'error') }));
        return 'unknown';
      }
      const valid = key && /^[a-z0-9][a-z0-9_-]{0,40}$/.test(key.label) && typeof key.apiKey === 'string' && /^[\x21-\x7e]{8,4096}$/.test(key.apiKey)
        && (key.feeCredits === undefined || (Number.isInteger(key.feeCredits) && key.feeCredits >= 0 && key.feeCredits <= 1000));
      found.set(providerKey, valid ? key : null);
    }
    const keyed = candidates.flatMap((candidate) => {
      const key = found.get(candidate.provider.key);
      return key ? [{ ...candidate, apiKey: key.apiKey, logKey: `byok:${key.label}` }] : [];
    });
    if (!keyed.length) return null;
    const first = found.get(keyed[0].provider.key)!;
    return { candidates: keyed, ownKey: { label: first.label, feeCredits: first.feeCredits ?? 0 } };
  }
  /** USD cost for the log: none on a workspace's own key (it is not Schood's spend). */
  const priced = (candidate: Ticket['candidates'][number], input: number, output: number) => (candidate.logKey ? 0 : costUsd(candidate.model, input, output));
  /** The shared breaker learns only from Schood's own keys. */
  const healthy = (candidate: Ticket['candidates'][number]) => { if (!candidate.logKey) breaker.success(candidate.model.key); };
  const unhealthy = (candidate: Ticket['candidates'][number], code: string) => { if (!candidate.logKey && BREAKER_CODES.has(code)) breaker.failure(candidate.model.key, nowMs()); };

  function chatInput(req: GatewayRequest, model: RegistryModel, route: RegistryRoute, schema: Schema<unknown> | null): ChatInput {
    const system = req.messages.filter((entry) => entry.role === 'system').map((entry) => textOf(entry.content)).join('\n\n');
    const strict = !!schema && model.capabilities.includes('json_schema');
    const shape = schema ? `\n\nReply with one JSON object only: no prose, no Markdown fences. It must match this JSON Schema:\n${JSON.stringify(schema.json)}` : '';
    const ceiling = model.maxOutput ?? 4096;
    return {
      system: system + shape,
      messages: req.messages.filter((entry) => entry.role !== 'system'),
      json: schema ? { schema: schema.json, strict } : null,
      maxTokens: Math.max(16, Math.min(req.maxTokens ?? route.maxOutputTokens ?? 1500, ceiling)),
      temperature: req.temperature ?? route.temperature ?? 0.3,
    };
  }

  /** Runs one attempt with its own timeout, turning aborts into typed provider errors. */
  async function attempt<T>(ms: number, signal: AbortSignal | undefined, work: (signal: AbortSignal, touch: () => void) => Promise<T>, idleMs?: number): Promise<T> {
    const controller = new AbortController();
    const stop = () => controller.abort(new ProviderError('aborted'));
    if (signal?.aborted) throw new ProviderError('aborted');
    signal?.addEventListener('abort', stop);
    const total = setTimeout(() => controller.abort(new ProviderError('timeout')), ms);
    let idle: ReturnType<typeof setTimeout> | undefined;
    const touch = () => {
      if (!idleMs) return;
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(new ProviderError('timeout')), idleMs);
    };
    try {
      return await work(controller.signal, touch);
    } catch (cause) {
      if (controller.signal.aborted && controller.signal.reason instanceof ProviderError) throw controller.signal.reason;
      throw cause instanceof ProviderError ? cause : new ProviderError('invalid_response');
    } finally {
      clearTimeout(total);
      clearTimeout(idle);
      signal?.removeEventListener('abort', stop);
    }
  }

  const statusFor = (code: string): CallStatus => (code === 'timeout' ? 'timeout' : code === 'rate_limited' ? 'rate_limited' : code === 'aborted' ? 'stopped' : 'failed');

  async function runChat<T>(req: GatewayRequest, ticket: Ticket, schema: Schema<T> | null, onDelta: ((text: string) => void) | null): Promise<GatewayResult<T>> {
    const rows: CallRecord[] = [];
    const started = nowMs();
    const inputChars = req.messages.reduce((sum, entry) => sum + textOf(entry.content).length, 0);
    if (inputChars > MAX_INPUT_CHARS) {
      record([refusal(req, ticket.callId, ticket.mode, 'failed', 'input_too_large', ticket.route.key)]);
      return { status: 'failed', code: 'input_too_large', callId: ticket.callId };
    }
    let lastCode = 'no_model', partial = '';
    try {
      for (const candidate of ticket.candidates) {
        const remaining = (onDelta ? timeouts.streamTotalMs : timeouts.totalMs) - (nowMs() - started);
        if (remaining < 2_000) { lastCode = 'timeout'; break; }
        const adapter = adapters[candidate.provider.adapter];
        if (!adapter) continue;
        const target: ProviderTarget = { provider: candidate.provider, model: candidate.model, apiKey: candidate.apiKey, fetch: deps.fetch };
        const input = chatInput(req, candidate.model, ticket.route, schema as Schema<unknown> | null);
        const at = nowMs();
        // A refused request costs nothing; a stream that broke off is billed for what it sent.
        const row = (status: CallStatus, errorCode: string | null, output: { text: string; inputTokens: number | null; outputTokens: number | null } | null) => {
          const billed = !!output || partial.length > 0;
          const inputTokens = output?.inputTokens ?? estimateTokens(inputChars), outputTokens = output?.outputTokens ?? estimateTokens(output?.text.length ?? partial.length);
          const cost = billed ? priced(candidate, inputTokens, outputTokens) : 0;
          rows.push({ ...base(req, ticket.callId, ticket.mode), attempt: rows.length + 1, status, errorCode, routeKey: ticket.route.key, providerKey: candidate.logKey ?? candidate.provider.key, modelKey: candidate.model.key, latencyMs: nowMs() - at, inputTokens: billed ? inputTokens : null, outputTokens: billed ? outputTokens : null, usageEstimated: billed && (!output || output.inputTokens === null || output.outputTokens === null), costUsd: cost });
          return { inputTokens, outputTokens, cost };
        };
        try {
          if (onDelta) {
            const output = await attempt(Math.min(remaining, timeouts.streamTotalMs), req.signal, (signal, touch) =>
              withFirstByte(timeouts.firstByteMs, signal, (guarded) => adapter.stream(target, input, guarded, (text) => { partial += text; touch(); onDelta(text); }), () => partial.length > 0),
            timeouts.idleMs);
            healthy(candidate);
            const usage = row('ok', null, output);
            return { status: 'ok', data: output.text as T, callId: ticket.callId, modelKey: candidate.model.key, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.cost };
          }
          const output = await attempt(Math.min(remaining, timeouts.attemptMs), req.signal, (signal) => adapter.chat(target, input, signal));
          healthy(candidate);
          if (!schema) {
            const usage = row('ok', null, output);
            return { status: 'ok', data: output.text as T, callId: ticket.callId, modelKey: candidate.model.key, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.cost };
          }
          const parsed = parseAgainst(schema, output.text);
          if (parsed.ok) {
            const usage = row('ok', null, output);
            return { status: 'ok', data: parsed.value, callId: ticket.callId, modelKey: candidate.model.key, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.cost };
          }
          // Free models wrap JSON in prose or drift from the shape: one repair turn on the same model.
          row('invalid_output', 'invalid_json', output);
          const repair: ChatInput = { ...input, messages: [...input.messages, { role: 'assistant', content: output.text.slice(0, 20_000) }, { role: 'user', content: `Your reply could not be used (${parsed.problem}). Send it again as one JSON object that matches the required shape, and nothing else.` }] };
          const at2 = nowMs();
          const second = await attempt(Math.max(2_000, Math.min(timeouts.attemptMs, timeouts.totalMs - (nowMs() - started))), req.signal, (signal) => adapter.chat(target, repair, signal));
          const reparsed = parseAgainst(schema, second.text);
          const inputTokens = second.inputTokens ?? estimateTokens(inputChars + output.text.length), outputTokens = second.outputTokens ?? estimateTokens(second.text.length);
          const cost = priced(candidate, inputTokens, outputTokens);
          rows.push({ ...base(req, ticket.callId, ticket.mode), attempt: rows.length + 1, status: reparsed.ok ? 'ok' : 'invalid_output', errorCode: reparsed.ok ? null : 'invalid_json', routeKey: ticket.route.key, providerKey: candidate.logKey ?? candidate.provider.key, modelKey: candidate.model.key, latencyMs: nowMs() - at2, inputTokens, outputTokens, usageEstimated: second.inputTokens === null, costUsd: cost });
          if (reparsed.ok) return { status: 'ok', data: reparsed.value, callId: ticket.callId, modelKey: candidate.model.key, inputTokens, outputTokens, costUsd: cost };
          return { status: 'failed', code: 'invalid_output', callId: ticket.callId };
        } catch (cause) {
          const code = cause instanceof ProviderError ? cause.code : 'invalid_response';
          if (code === 'aborted') {
            row('stopped', 'stopped', null);
            return { status: 'stopped', callId: ticket.callId, partial };
          }
          row(statusFor(code), code, null);
          unhealthy(candidate, code);
          lastCode = code;
          // Once words reached the person, a second model cannot continue the same answer.
          if (partial) return { status: 'failed', code, callId: ticket.callId, partial };
        }
      }
      return { status: 'failed', code: lastCode, callId: ticket.callId };
    } finally {
      // The charged credits are reported once, on the final attempt.
      if (rows.length && req.credits) rows[rows.length - 1].credits = req.credits;
      if (rows.length) record(rows);
    }
  }

  async function runSpeech<T>(req: GatewayRequest, ticket: Ticket, work: (adapter: Adapter, target: ProviderTarget, signal: AbortSignal) => Promise<T> | undefined, size: (value: T) => { input: number; output: number }): Promise<GatewayResult<T>> {
    const rows: CallRecord[] = [];
    let lastCode = 'no_model';
    try {
      for (const candidate of ticket.candidates) {
        const adapter = adapters[candidate.provider.adapter];
        if (!adapter) continue;
        const target: ProviderTarget = { provider: candidate.provider, model: candidate.model, apiKey: candidate.apiKey, fetch: deps.fetch };
        const at = nowMs();
        try {
          const value = await attempt(timeouts.speechMs, req.signal, async (signal) => {
            const running = work(adapter, target, signal);
            if (!running) throw new ProviderError('unsupported');
            return await running;
          });
          healthy(candidate);
          // Speech is priced per token-equivalent in the registry; durations are estimated from sizes.
          const usage = size(value);
          const cost = priced(candidate, usage.input, usage.output);
          rows.push({ ...base(req, ticket.callId, ticket.mode), attempt: rows.length + 1, status: 'ok', errorCode: null, routeKey: ticket.route.key, providerKey: candidate.logKey ?? candidate.provider.key, modelKey: candidate.model.key, latencyMs: nowMs() - at, inputTokens: usage.input, outputTokens: usage.output, usageEstimated: true, costUsd: cost });
          return { status: 'ok', data: value, callId: ticket.callId, modelKey: candidate.model.key, inputTokens: usage.input, outputTokens: usage.output, costUsd: cost };
        } catch (cause) {
          const code = cause instanceof ProviderError ? cause.code : 'invalid_response';
          rows.push({ ...base(req, ticket.callId, ticket.mode), attempt: rows.length + 1, status: statusFor(code), errorCode: code, routeKey: ticket.route.key, providerKey: candidate.logKey ?? candidate.provider.key, modelKey: candidate.model.key, latencyMs: nowMs() - at, inputTokens: null, outputTokens: null, usageEstimated: false, costUsd: 0 });
          if (code === 'aborted') return { status: 'stopped', callId: ticket.callId, partial: '' };
          unhealthy(candidate, code);
          lastCode = code;
        }
      }
      return { status: 'failed', code: lastCode, callId: ticket.callId };
    } finally {
      if (rows.length && req.credits) rows[rows.length - 1].credits = req.credits;
      if (rows.length) record(rows);
    }
  }

  const withTicket = async <T>(req: GatewayRequest, mode: CallMode, ticket: Ticket | undefined, run: (ticket: Ticket) => Promise<GatewayResult<T>>): Promise<GatewayResult<T>> => {
    const held = ticket ?? await reserve(req, mode);
    if (!held.ok) return held.failure;
    return run(held);
  };

  return {
    reserve,
    /** Whether a provider's key is set and allowed to reach its host (for the admin console; never the key). */
    keyConfigured: (provider: { apiKeyEnv: string; baseUrl: string }) => keyEnvAllowed(provider.apiKeyEnv) && keyMayReach(provider.apiKeyEnv, provider.baseUrl) && !!deps.env(provider.apiKeyEnv),
    text: (req: GatewayRequest, ticket?: Ticket) => withTicket<string>(req, 'text', ticket, (t) => runChat<string>(req, t, null, null)),
    json: <T>(req: GatewayRequest, schema: Schema<T>, ticket?: Ticket) => withTicket<T>(req, 'json', ticket, (t) => runChat<T>(req, t, schema, null)),
    stream: (req: GatewayRequest, onDelta: (text: string) => void, ticket?: Ticket) => withTicket<string>(req, 'stream', ticket, (t) => runChat<string>(req, t, null, onDelta)),
    transcribe: (req: SpeechInRequest, ticket?: Ticket) => withTicket<Transcript>({ ...req, messages: [] }, 'stt', ticket, (t) => runSpeech<Transcript>(
      { ...req, messages: [] }, t,
      (adapter, target, signal) => adapter.transcribe?.(target, { audio: req.audio, mime: req.mime, language: req.language, prompt: req.prompt }, signal),
      (value) => ({ input: estimateTokens(req.audio.length / 8), output: estimateTokens(value.text.length) }),
    )),
    speak: (req: SpeechOutRequest, ticket?: Ticket) => withTicket<SpeechAudio>({ ...req, messages: [] }, 'tts', ticket, (t) => runSpeech<SpeechAudio>(
      { ...req, messages: [] }, t,
      (adapter, target, signal) => adapter.speak?.(target, { text: req.text, voice: req.voice, format: req.format ?? 'mp3' }, signal),
      () => ({ input: estimateTokens(req.text.length), output: 0 }),
    )),
    /** Admin test console only: one prompt to one model, outside routes, switches and caps. */
    async testModel(modelKey: string, prompt: string, signal?: AbortSignal): Promise<GatewayResult<string> & { latencyMs?: number }> {
      const registry = await deps.registry();
      const model = registry.models.find((entry) => entry.key === modelKey), provider = model && registry.providers.find((entry) => entry.key === model.providerKey);
      const callId = crypto.randomUUID();
      const req: GatewayRequest = { feature: 'admin.test', messages: [{ role: 'system', content: 'You are being tested by a Schood administrator. Answer briefly.' }, { role: 'user', content: prompt }] };
      if (!model || !provider) return { status: 'unavailable', reason: 'no_model', callId };
      const env = provider.apiKeyEnv, apiKey = keyEnvAllowed(env) && keyMayReach(env, provider.baseUrl) ? deps.env(env) ?? '' : '';
      if (!apiKey) return { status: 'unavailable', reason: 'no_key', callId };
      const route: RegistryRoute = { key: 'admin.test', modelKeys: [model.key], requiredCapabilities: [], requireNoTraining: false, maxOutputTokens: 400, temperature: 0.2, enabled: true };
      const started = nowMs();
      const result = await runChat<string>({ ...req, signal }, { ok: true, callId, mode: 'text', route, candidates: [{ model, provider, apiKey }] }, null, null);
      return { ...result, latencyMs: nowMs() - started };
    },
  };
}

/** Waits for the first streamed word for `ms`, then lets the stream run under the outer limits. */
async function withFirstByte<T>(ms: number, signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>, started: () => boolean): Promise<T> {
  const controller = new AbortController();
  const forward = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forward);
  const timer = setTimeout(() => { if (!started()) controller.abort(new ProviderError('timeout')); }, ms);
  try {
    return await work(controller.signal);
  } catch (cause) {
    if (controller.signal.aborted && controller.signal.reason instanceof ProviderError) throw controller.signal.reason;
    throw cause;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forward);
  }
}

function textOf(content: string | ContentPart[]): string {
  return typeof content === 'string' ? content : content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
}

function parseAgainst<T>(schema: Schema<T>, text: string): { ok: true; value: T } | { ok: false; problem: string } {
  try {
    return { ok: true, value: schema.parse(parseModelJson(text)) };
  } catch (cause) {
    return { ok: false, problem: cause instanceof SchemaError ? cause.message.slice(0, 200) : 'not valid JSON' };
  }
}
