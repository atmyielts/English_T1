import { creditPrice, featureAccess, isCreditKey, type AccessDecision } from '../../../packages/ai-core/src/mod.ts';
import { createActionService } from './actions.ts';
import { requireAdult } from './age.ts';
import { createChargedAI, createChargedAIFor, createSpend, scopeOf } from './ai.ts';
import { createLibraryService } from './library.ts';
import type { Gateway } from './gateway.ts';
import { isUuid } from './input.ts';
import type { PlanResolver } from './plan.ts';
import type { Stores } from './stores.ts';
import { sseResponse } from './stream.ts';
import { ONBOARDING_TAKEN } from './specialists.ts';
import {
  AREAS, LEARNING_EVENT_KINDS, SchoodAIError,
  type Area, type Caller, type ContextBlock, type MintedSession, type NotifySendResult, type Workspace, type FunctionCallInit, type LearningEvent, type LearningEventInput, type Locale, type Method,
  type PlanState, type RequestContext, type RequestUser, type SchoodAIRepository, type WorkspaceAccess,
} from './types.ts';

// The RequestContext every route receives, and the context-provider registry.

// --- Context providers -------------------------------------------------------------
/** Reads one kind of context for the model (results, homework, group data). Return null when there is nothing. */
export type ContextProvider = (ctx: RequestContext, input: { access: WorkspaceAccess; ref?: string; specialist?: string }) => Promise<ContextBlock | null>;
interface ProviderEntry { provider: ContextProvider; allowCustom: boolean; selfView: boolean; timeoutMs: number; maxChars: number; label: Record<Locale, string> | null }
const providers = new Map<string, ProviderEntry>();
const LOCALES: readonly Locale[] = ['en', 'uz', 'ru'];
const KIND = /^[a-z][a-z0-9_]{1,40}$/;

/**
 * allowCustom: a workspace's custom specialist may read it. selfView: it only ever
 * describes the caller, so `core/context` may show it to them ("what Schood AI knows about you").
 * label: how the app names this source under an answer ("Used: your study plan"), in uz, ru and en.
 */
export function registerContextProvider(kind: string, provider: ContextProvider, options: { allowCustom?: boolean; selfView?: boolean; timeoutMs?: number; maxChars?: number; label?: Record<Locale, string> } = {}): void {
  if (!KIND.test(kind)) throw new Error(`context kind ${kind} is invalid`);
  if (providers.has(kind)) throw new Error(`context provider ${kind} is already registered`);
  if (options.label && !LOCALES.every((locale) => typeof options.label![locale] === 'string' && options.label![locale].trim().length > 0 && options.label![locale].length <= 80)) {
    throw new Error(`context provider ${kind}: label needs uz, ru and en (at most 80 characters)`);
  }
  providers.set(kind, { provider, allowCustom: options.allowCustom ?? false, selfView: options.selfView ?? false, timeoutMs: options.timeoutMs ?? 6_000, maxChars: options.maxChars ?? 6_000, label: options.label ?? null });
}
/** Labels of the context sources that registered one, in this language (kind → label). */
export const contextLabels = (locale: Locale): Record<string, string> =>
  Object.fromEntries([...providers].filter(([, entry]) => entry.label).map(([kind, entry]) => [kind, entry.label![locale]]));
/** Kinds a workspace's custom specialist may be given. */
export const customContextKinds = () => [...providers].filter(([, entry]) => entry.allowCustom).map(([kind]) => kind);
export const contextProviderKinds = () => [...providers.keys()];
export const selfViewKinds = () => [...providers].filter(([, entry]) => entry.selfView).map(([kind]) => kind);

// --- Learning events ----------------------------------------------------------------
const FEATURE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,60}$/, SKILL = /^[a-z0-9][a-z0-9_.:-]{0,100}$/, OUTCOME = /^[a-z][a-z0-9_]{0,40}$/;
/** The stored row for an event, or a reason it is invalid. */
export function learningEvent(input: LearningEventInput, user: RequestUser, workspaceId: string | null): LearningEvent | string {
  if (!Object.hasOwn(LEARNING_EVENT_KINDS, input.kind)) return 'kind';
  if (!(AREAS as readonly string[]).includes(input.area)) return 'area';
  if (typeof input.feature !== 'string' || !FEATURE.test(input.feature)) return 'feature';
  if (input.skill !== undefined && (typeof input.skill !== 'string' || !SKILL.test(input.skill))) return 'skill';
  if (input.outcome !== undefined && (typeof input.outcome !== 'string' || !OUTCOME.test(input.outcome))) return 'outcome';
  if (input.score !== undefined && (typeof input.score !== 'number' || !Number.isFinite(input.score) || input.score < -1000 || input.score > 100000)) return 'score';
  if (input.ref !== undefined && (typeof input.ref !== 'string' || input.ref.length > 200)) return 'ref';
  const verified = LEARNING_EVENT_KINDS[input.kind];
  const minutes = input.verified_minutes ?? 0;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240 || (!verified && minutes > 0)) return 'verified_minutes';
  return {
    userId: user.id, workspaceId, area: input.area, kind: input.kind, verified, feature: input.feature, skill: input.skill ?? null,
    verifiedMinutes: minutes, score: input.score ?? null, outcome: input.outcome ?? null, ref: input.ref ?? null,
    source: user.via === 'service' ? 'telegram' : 'web',
  };
}

// --- The context ------------------------------------------------------------------------
export interface ContextDeps {
  repo: SchoodAIRepository;
  gateway: Gateway;
  plans: PlanResolver;
  /** Area stores (stores.ts). */
  stores: Stores;
  /** Sends one Telegram message through the Schood bot (the send-telegram function); absent where nothing can send. */
  sendTelegram?(input: { userId: string; kind: string; text: string; buttons: { label: string; path: string }[]; dedupeKey: string | null }): Promise<{ outcome: 'sent' | 'defer' | 'suppressed' | 'failed'; deliverAt?: string | null }>;
  isAdmin(userId: string): Promise<boolean>;
  /** Test fixtures only: every onboarding chat guard counts as done (specialists.ts ONBOARDING_TAKEN). Never set when deployed. */
  onboardingTaken?: boolean;
  /** Mints a Supabase session for a user (the auth admin API, index.ts); null when it cannot. Absent where nothing can. */
  mintSession?(userId: string): Promise<MintedSession | null>;
  /** Another Edge Function with the person's token: status and parsed JSON. */
  callFunction(name: string, path: string, token: string, init: FunctionCallInit): Promise<{ status: number; data: unknown }>;
  /** Keeps work alive after the response (EdgeRuntime.waitUntil in production). */
  after(work: Promise<unknown>): void;
  now(): Date;
  /** CORS and request headers for responses a route builds itself. */
  responseHeaders: Record<string, string>;
}
export interface ContextInput {
  url: URL;
  headers: Headers;
  area: Area;
  action: string;
  method: Method;
  requestId: string;
  /** Null on system and anonymous routes. */
  user: RequestUser | null;
  /** Left out (older callers): a person when there is a user, else anonymous. */
  caller?: Caller;
  readBody(): Promise<Uint8Array>;
}

const FUNCTION_NAME = /^[a-z0-9][a-z0-9-]{1,60}$/;
/** Request headers a route may send to another Schood function (Assessment Cloud commands need them). */
const FORWARDED_HEADERS = new Set(['idempotency-key', 'if-match']);

export function createRequestContext(deps: ContextDeps, input: ContextInput): RequestContext {
  const caller: Caller = input.caller ?? (input.user ? (input.user.via === 'service' ? 'service' : 'user') : 'anonymous');
  // System and anonymous routes have nobody to act as: anything that would act as a person throws.
  const personal = (caller === 'user' || caller === 'service') && input.user !== null;
  const noUser = (what: string) => new SchoodAIError('user_required', `${what} needs a signed-in person; this ${caller} route has none.`, 500);
  const user: RequestUser = personal ? input.user! : new Proxy({} as RequestUser, {
    get(_target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === 'toJSON') return undefined;
      throw noUser(`ctx.user.${String(name)}`);
    },
  });
  const asPerson = (what: string) => { if (!personal) throw noUser(what); };
  /** A workspace's owner as the principal its plan is resolved for (paidBy, planFor). */
  const ownerOf = (workspace: Workspace): RequestUser => ({ id: workspace.ownerId, email: null, token: null, via: 'service', telegramChatId: null });
  const requested = input.url.searchParams.get('workspace_id');
  const headerLocale = (input.headers.get('x-schood-locale') ?? input.url.searchParams.get('locale') ?? '').toLowerCase();
  const locale = (LOCALES as readonly string[]).includes(headerLocale) ? headerLocale as Locale : 'en';
  const idempotency = input.headers.get('idempotency-key');
  let bytes: Promise<Uint8Array> | null = null, parsed: Promise<unknown> | null = null;
  let resolved: Promise<WorkspaceAccess> | null = null, resolvedId: string | null = null, plan: Promise<PlanState> | null = null;
  const pendingEvents: LearningEvent[] = [];
  let flushScheduled = false;

  const after = (work: () => Promise<unknown>) => {
    deps.after(Promise.resolve().then(work).catch((cause) => console.error(JSON.stringify({ event: 'schood_ai_after_failed', request_id: input.requestId, error: String(cause).slice(0, 300) }))));
  };

  async function resolveWorkspace(): Promise<WorkspaceAccess> {
    if (requested) {
      if (!isUuid(requested)) throw new SchoodAIError('invalid_request', 'workspace_id must be an id.', 400, { field: 'workspace_id' });
      const [workspace, member] = await Promise.all([deps.repo.workspace(requested.toLowerCase()), deps.repo.membership(requested.toLowerCase(), user.id)]);
      // A workspace you do not belong to looks exactly like one that does not exist.
      if (!workspace || !member || member.status !== 'active') throw new SchoodAIError('workspace_not_found', 'Workspace not found.', 404);
      if (workspace.status !== 'active') throw new SchoodAIError('workspace_suspended', 'This workspace is suspended.', 403);
      return { workspace, member, role: member.role };
    }
    const profile = await deps.repo.profile(user.id);
    const workspace = await deps.repo.ensurePersonalWorkspace(user.id, profile?.name || user.email?.split('@')[0] || 'My workspace');
    const member = await deps.repo.membership(workspace.id, user.id);
    if (!member) throw new Error('personal workspace has no owner membership');
    return { workspace, member, role: 'owner' };
  }

  const ctx: RequestContext = {
    requestId: input.requestId,
    area: input.area,
    action: input.action,
    method: input.method,
    url: input.url,
    query: input.url.searchParams,
    idempotencyKey: idempotency && /^[A-Za-z0-9_.:-]{8,100}$/.test(idempotency) ? idempotency : null,
    locale,
    user,
    now: deps.now,
    repo: deps.repo,
    gateway: deps.gateway,
    ai: undefined as never,
    actions: undefined as never,
    library: undefined as never,
    store: (handle) => deps.stores.get(handle),
    bytes: () => (bytes ??= input.readBody()),
    body<T>() {
      parsed ??= ctx.bytes().then((raw) => {
        if (!raw.length) return {};
        let value: unknown;
        try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new SchoodAIError('invalid_request', 'The request body must be JSON.', 400); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchoodAIError('invalid_request', 'The request body must be a JSON object.', 400);
        return value;
      });
      return parsed as Promise<T>;
    },
    async workspace(options = {}) {
      asPerson('ctx.workspace()');
      resolved ??= resolveWorkspace();
      const access = await resolved;
      resolvedId = access.workspace.id;
      if (options.roles && !options.roles.includes(access.role)) throw new SchoodAIError('role_required', 'Your role in this workspace cannot do this.', 403, { roles: options.roles });
      return access;
    },
    async plan() {
      plan ??= ctx.workspace().then((access) => deps.plans.resolve(user, access.workspace, access.role, deps.stores));
      return plan;
    },
    async access(featureOrKey): Promise<AccessDecision> {
      asPerson('ctx.access()');
      const feature = isCreditKey(featureOrKey) ? creditPrice(featureOrKey).feature : featureOrKey;
      const [access, state] = await Promise.all([ctx.workspace(), ctx.plan()]);
      return featureAccess(feature, { plans: state.plans, workspaceKind: access.workspace.kind, role: access.role, beta: state.beta, grants: state.features });
    },
    async requireFeature(featureOrKey) {
      const decision = await ctx.access(featureOrKey);
      if (decision.allowed) return ctx.workspace();
      if (decision.reason === 'plan_required') throw new SchoodAIError('plan_required', 'This needs a Schood AI plan.', 402, { plans: decision.plans, feature: isCreditKey(featureOrKey) ? creditPrice(featureOrKey).feature : featureOrKey });
      if (decision.reason === 'role_required') throw new SchoodAIError('role_required', 'Your role in this workspace cannot use this.', 403, { roles: decision.roles });
      throw new SchoodAIError('invalid_request', 'Unknown feature.', 400);
    },
    async context(kinds, extra = {}) {
      asPerson('ctx.context()');
      const access = await ctx.workspace();
      const blocks = await Promise.all([...new Set(kinds)].map(async (kind) => {
        const entry = providers.get(kind);
        if (!entry) return null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const block = await Promise.race([
            entry.provider(ctx, { access, ...extra }),
            new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), entry.timeoutMs); }),
          ]);
          if (!block) return null;
          // Oversized context is cut, never sent whole.
          const json = JSON.stringify(block.data ?? null);
          return json.length > entry.maxChars ? { ...block, data: { truncated: true, excerpt: json.slice(0, entry.maxChars) } } : block;
        } catch (cause) {
          console.error(JSON.stringify({ event: 'schood_ai_context_failed', kind, request_id: input.requestId, error: String(cause).slice(0, 200) }));
          return null;
        } finally {
          clearTimeout(timer);
        }
      }));
      return blocks.filter((block): block is ContextBlock => !!block);
    },
    functions: {
      async call<T>(name: string, path = '', init: FunctionCallInit = {}): Promise<T> {
        if (!FUNCTION_NAME.test(name) || (path && (!path.startsWith('/') || path.includes('..')))) throw new Error('invalid function call');
        asPerson('ctx.functions.call()');
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(init.headers ?? {})) {
          if (!FORWARDED_HEADERS.has(key.toLowerCase()) || typeof value !== 'string' || !/^[\x21-\x7e][\x20-\x7e]{0,199}$/.test(value)) throw new Error(`header ${key} cannot be sent to another function`);
          headers[key.toLowerCase() === 'idempotency-key' ? 'Idempotency-Key' : 'If-Match'] = value;
        }
        if (!user.token) throw new SchoodAIError('user_token_required', 'This needs the person to be signed in on the web.', 409);
        const result = await deps.callFunction(name, path, user.token, { ...init, headers });
        if (result.status < 200 || result.status >= 300) throw new SchoodAIError('upstream_failed', `${name} answered ${result.status}.`, 502, { service: name, status: result.status });
        return result.data as T;
      },
    },
    isSchoodAdmin: () => (personal ? deps.isAdmin(user.id) : Promise.resolve(false)),
    async audit(event, details = {}, target) {
      try {
        await deps.repo.audit({ workspaceId: resolvedId, actorId: personal ? user.id : null, event, targetType: target?.type ?? null, targetId: target?.id ?? null, details });
      } catch (cause) {
        console.error(JSON.stringify({ event: 'schood_ai_audit_failed', audit: event, request_id: input.requestId, error: String(cause).slice(0, 200) }));
      }
    },
    after,
    sse: (produce) => sseResponse(deps.responseHeaders, deps.after, produce),
    events: {
      emit(event) {
        asPerson('ctx.events.emit()');
        const row = learningEvent(event, user, resolvedId);
        if (typeof row === 'string') {
          console.error(JSON.stringify({ event: 'schood_ai_learning_event_invalid', field: row, kind: String(event?.kind).slice(0, 40), request_id: input.requestId }));
          return;
        }
        pendingEvents.push(row);
        if (flushScheduled) return;
        flushScheduled = true;
        // Written after the response in one batch; a failure is logged, never shown.
        after(async () => {
          await Promise.resolve();
          const batch = pendingEvents.splice(0);
          flushScheduled = false;
          if (batch.length) await deps.repo.addLearningEvents(batch);
        });
      },
    },
    notify: {
      allowed: (userId, channel) => deps.repo.notify(userId, channel, false),
      take: (userId, channel) => deps.repo.notify(userId, channel, true),
      prefs: (userId) => deps.repo.notifyPrefs(userId),
      async send(userId, message): Promise<NotifySendResult> {
        if (!isUuid(userId)) throw new Error('ctx.notify.send needs a user id');
        if (!/^[a-z][a-z0-9_.-]{1,40}$/.test(message.kind)) throw new Error(`notification kind ${message.kind} is invalid`);
        const text = String(message.text ?? '').trim();
        if (!text || text.length > 4000) throw new Error('a notification is 1 to 4000 characters');
        const buttons = (message.buttons ?? []).slice(0, 4).map((button) => {
          if (!button.label?.trim() || button.label.length > 40 || !/^\/(?!\/)[A-Za-z0-9/_?=&.%-]{0,200}$/.test(button.path)) throw new Error('a button needs a short label and a Schood AI path');
          return { label: button.label.trim(), path: button.path };
        });
        const dedupeKey = message.dedupeKey === undefined ? null : String(message.dedupeKey).slice(0, 150);
        // Their choices first, so a message that cannot go never uses up today's budget.
        const prefs = await deps.repo.notifyPrefs(userId);
        if (!prefs.delivery.includes('telegram')) return { sent: false, reason: 'delivery_off' };
        const profile = await deps.repo.profile(userId);
        if (!profile?.isActive || !profile.telegramChatId) return { sent: false, reason: 'no_telegram' };
        if (!deps.sendTelegram) return { sent: false, reason: 'failed' };
        const decision = await deps.repo.notify(userId, message.kind, true);
        if (!decision.allowed) return { sent: false, reason: decision.reason, retryAt: decision.retryAt };
        const result = await deps.sendTelegram({ userId, kind: message.kind, text, buttons, dedupeKey });
        if (result.outcome === 'sent') return { sent: true };
        if (result.outcome === 'defer') return { sent: false, reason: 'deferred', retryAt: result.deliverAt ?? null };
        // The bot's own policy (their Schood notification settings, a duplicate dedupeKey) said no.
        return { sent: false, reason: result.outcome === 'suppressed' ? 'suppressed' : 'failed' };
      },
    },
    caller,
    headers: input.headers,
    origin: input.headers.get('origin'),
    async planFor(workspaceId) {
      if (!isUuid(workspaceId)) throw new SchoodAIError('invalid_request', 'workspace_id must be an id.', 400, { field: 'workspace_id' });
      const workspace = await deps.repo.workspace(workspaceId.toLowerCase());
      if (!workspace) throw new SchoodAIError('workspace_not_found', 'Workspace not found.', 404);
      return deps.plans.resolve(ownerOf(workspace), workspace, 'owner', deps.stores);
    },
    credits: { spend: (spend) => createSpend(scopeOf(ctx))(spend) },
    auth: {
      async sessionFor(userId, options) {
        const reason = String(options?.reason ?? '');
        if (!new RegExp(`^${input.area}\\.[a-z][a-z0-9_.-]{2,60}$`).test(reason)) throw new Error(`ctx.auth.sessionFor needs a reason like ${input.area}.mini_app`);
        if (!isUuid(userId)) throw new Error('ctx.auth.sessionFor needs a user id');
        const target = userId.toLowerCase();
        // A signed-in caller (or the worker for a linked person) may only get a session of their own.
        if (personal && user.id !== target) throw new SchoodAIError('session_not_allowed', 'You can only open your own session.', 403);
        const profile = await deps.repo.profile(target);
        if (!profile?.isActive) throw new SchoodAIError('session_not_allowed', 'This account cannot be signed in here.', 403);
        if (await deps.isAdmin(target)) throw new SchoodAIError('session_not_allowed', 'Schood admins sign in on the platform.', 403);
        for (const [bucket, limit, seconds] of [[`session:user:${target}`, 10, 3600], [`session:user:${target}`, 30, 86_400], [`session:area:${input.area}`, 2000, 3600]] as const) {
          const taken = await deps.repo.takeRate(`${bucket}:${seconds}`, limit, seconds);
          if (!taken.ok) throw new SchoodAIError('rate_limited', 'Too many sign-ins. Try again shortly.', 429, { retry_after: taken.retryAt });
        }
        const session = deps.mintSession ? await deps.mintSession(target).catch(() => null) : null;
        if (!session) throw new SchoodAIError('session_unavailable', 'Signing in is not available right now.', 503);
        // Audited before it is handed out; if the audit cannot be written, the session is not returned.
        await deps.repo.audit({ workspaceId: null, actorId: personal ? user.id : null, event: 'core.session_issued', targetType: 'user', targetId: target, details: { reason, area: input.area, caller } });
        return session;
      },
    },
    async paidBy(workspaceId) {
      if (personal) throw new SchoodAIError('paid_by_not_allowed', 'Signed-in routes pay with ctx.ai, from the caller\'s own workspace.', 500);
      if (!isUuid(workspaceId)) throw new Error('ctx.paidBy needs a workspace id');
      const workspace = await deps.repo.workspace(workspaceId.toLowerCase());
      if (!workspace || workspace.status !== 'active') throw new SchoodAIError('workspace_not_found', 'Workspace not found.', 404);
      // Visitors can only spend a centre's pool, never a person's own credits.
      if (caller === 'anonymous' && workspace.kind !== 'centre') throw new SchoodAIError('payer_not_allowed', 'Only a centre can pay for visitors.', 500);
      const owner = ownerOf(workspace);
      const member = await deps.repo.membership(workspace.id, workspace.ownerId)
        ?? { workspaceId: workspace.id, userId: workspace.ownerId, role: 'owner' as const, status: 'active' as const, creditBudget: null, budgetPeriod: null, budgetUsed: 0 };
      const access: WorkspaceAccess = { workspace, member, role: 'owner' };
      let state: Promise<PlanState> | null = null;
      const payerPlan = () => (state ??= deps.plans.resolve(owner, workspace, 'owner', deps.stores));
      return createChargedAIFor({
        requestId: input.requestId, idempotencyKey: ctx.idempotencyKey, userId: null, gateway: deps.gateway, repo: deps.repo, now: deps.now,
        plan: payerPlan,
        async requireFeature(feature) {
          const current = await payerPlan();
          const decision = featureAccess(feature, { plans: current.plans, workspaceKind: workspace.kind, role: 'owner', beta: current.beta, grants: current.features });
          if (decision.allowed) return access;
          if (decision.reason === 'plan_required') throw new SchoodAIError('plan_required', 'This workspace\'s plan does not include this.', 402, { plans: decision.plans, feature });
          throw new SchoodAIError('role_required', 'This cannot be used here.', 403);
        },
        // Nobody is asking, so adults-only actions are refused.
        requireAdult: () => requireAdult(ctx, null),
      });
    },
  };
  ctx.ai = createChargedAI(ctx);
  ctx.actions = createActionService(ctx);
  if (deps.onboardingTaken) Object.defineProperty(ctx, ONBOARDING_TAKEN, { value: true });
  ctx.library = createLibraryService(ctx);
  return ctx;
}
