import { creditPrice, featureAccess, isCreditKey, type AccessDecision } from '../../../packages/ai-core/src/mod.ts';
import { createActionService } from './actions.ts';
import { createChargedAI } from './ai.ts';
import { createLibraryService } from './library.ts';
import type { Gateway } from './gateway.ts';
import { isUuid } from './input.ts';
import type { PlanResolver } from './plan.ts';
import { sseResponse } from './stream.ts';
import {
  AREAS, LEARNING_EVENT_KINDS, SchoodAIError,
  type Area, type ContextBlock, type FunctionCallInit, type LearningEvent, type LearningEventInput, type Locale, type Method,
  type PlanState, type RequestContext, type RequestUser, type SchoodAIRepository, type WorkspaceAccess,
} from './types.ts';

// The RequestContext every route receives, and the context-provider registry.

// --- Context providers -------------------------------------------------------------
/** Reads one kind of context for the model (results, homework, group data). Return null when there is nothing. */
export type ContextProvider = (ctx: RequestContext, input: { access: WorkspaceAccess; ref?: string; specialist?: string }) => Promise<ContextBlock | null>;
interface ProviderEntry { provider: ContextProvider; allowCustom: boolean; selfView: boolean; timeoutMs: number; maxChars: number }
const providers = new Map<string, ProviderEntry>();
const KIND = /^[a-z][a-z0-9_]{1,40}$/;

/**
 * allowCustom: a workspace's custom specialist may read it. selfView: it only ever
 * describes the caller, so `core/context` may show it to them ("what Schood AI knows about you").
 */
export function registerContextProvider(kind: string, provider: ContextProvider, options: { allowCustom?: boolean; selfView?: boolean; timeoutMs?: number; maxChars?: number } = {}): void {
  if (!KIND.test(kind)) throw new Error(`context kind ${kind} is invalid`);
  if (providers.has(kind)) throw new Error(`context provider ${kind} is already registered`);
  providers.set(kind, { provider, allowCustom: options.allowCustom ?? false, selfView: options.selfView ?? false, timeoutMs: options.timeoutMs ?? 6_000, maxChars: options.maxChars ?? 6_000 });
}
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
  isAdmin(userId: string): Promise<boolean>;
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
  user: RequestUser;
  readBody(): Promise<Uint8Array>;
}

const LOCALES: readonly Locale[] = ['en', 'uz', 'ru'];
const FUNCTION_NAME = /^[a-z0-9][a-z0-9-]{1,60}$/;

export function createRequestContext(deps: ContextDeps, input: ContextInput): RequestContext {
  const { user } = input;
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
      resolved ??= resolveWorkspace();
      const access = await resolved;
      resolvedId = access.workspace.id;
      if (options.roles && !options.roles.includes(access.role)) throw new SchoodAIError('role_required', 'Your role in this workspace cannot do this.', 403, { roles: options.roles });
      return access;
    },
    async plan() {
      plan ??= ctx.workspace().then((access) => deps.plans.resolve(user, access.workspace, access.role));
      return plan;
    },
    async access(featureOrKey): Promise<AccessDecision> {
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
        if (!user.token) throw new SchoodAIError('user_token_required', 'This needs the person to be signed in on the web.', 409);
        const result = await deps.callFunction(name, path, user.token, init);
        if (result.status < 200 || result.status >= 300) throw new SchoodAIError('upstream_failed', `${name} answered ${result.status}.`, 502, { service: name, status: result.status });
        return result.data as T;
      },
    },
    isSchoodAdmin: () => deps.isAdmin(user.id),
    async audit(event, details = {}, target) {
      try {
        await deps.repo.audit({ workspaceId: resolvedId, actorId: user.id, event, targetType: target?.type ?? null, targetId: target?.id ?? null, details });
      } catch (cause) {
        console.error(JSON.stringify({ event: 'schood_ai_audit_failed', audit: event, request_id: input.requestId, error: String(cause).slice(0, 200) }));
      }
    },
    after,
    sse: (produce) => sseResponse(deps.responseHeaders, deps.after, produce),
    events: {
      emit(event) {
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
    },
  };
  ctx.ai = createChargedAI(ctx);
  ctx.actions = createActionService(ctx);
  ctx.library = createLibraryService(ctx);
  return ctx;
}
