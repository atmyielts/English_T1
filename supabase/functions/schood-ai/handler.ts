import { adminModule } from './admin/mod.ts';
import { centreModule } from './centre/mod.ts';
import { coachModule } from './coach/mod.ts';
import { createRequestContext, type ContextDeps } from './context.ts';
import { createStores, type Stores } from './stores.ts';
import { coreModule } from './core/mod.ts';
import { engageModule } from './engage/mod.ts';
import type { Gateway } from './gateway.ts';
import { isUuid } from './input.ts';
import { learnerModule } from './learner/mod.ts';
import type { PlanResolver } from './plan.ts';
import { teacherModule } from './teacher/mod.ts';
import { AREAS, SchoodAIError, type Area, type Caller, type FeatureModule, type Method, type RequestUser, type RouteHandler, type SchoodAIRepository } from './types.ts';

// Schood AI API router: /schood-ai/<area>/<action>. Pure: everything it talks to is
// injected, so tests run it against the memory repository and a fake gateway fetch.
//
// Two ways in:
//   - a browser with the person's Supabase session (Authorization: Bearer <jwt>),
//     from an allowed origin;
//   - the trusted Telegram worker with X-Schood-Service-Secret, acting for the
//     Schood user in X-Schood-User-Id, who must be linked to the Telegram chat in
//     X-Schood-Telegram-Chat-Id. Only routes marked `service: true` accept it, never
//     admin routes, and plans and credits apply to that person as usual;
//   - system routes (`system: true`): X-Schood-Service-Secret alone, either the
//     worker secret or the system secret pg_cron sends (invoke_schood_ai_system),
//     with no user headers and no Origin. Nobody to act as;
//   - anonymous routes (`anonymous: true`): no sign-in, limited per IP (a salted
//     hash of it, never the address). Nobody to act as.

export const MODULES: FeatureModule[] = [coreModule, adminModule, learnerModule, teacherModule, centreModule, coachModule, engageModule];

export interface HandlerDeps {
  repository: SchoodAIRepository;
  gateway: Gateway;
  plans: PlanResolver;
  isAdmin(userId: string): Promise<boolean>;
  callFunction: ContextDeps['callFunction'];
  /** The repo's admin RBAC check for admin routes (admin-access.ts in production). */
  adminGate(req: Request, permission: string): Promise<{ ok: true } | { ok: false; status: number; code: string }>;
  modules?: FeatureModule[];
  /** Area stores; tests and dev stacks get memory twins when left out. */
  stores?: Stores;
  /** The system secret pg_cron sends (internal_runtime_secrets), cached by the caller; null when there is none. */
  systemSecret?(): Promise<string | null>;
}
export interface HandlerOptions {
  allowedOrigins: string[];
  /** SCHOOD_AI_SERVICE_SECRET; the worker path is off unless it is at least 32 characters. */
  serviceSecret?: string | null;
  now?: () => Date;
  /** Keeps work alive after the response (EdgeRuntime.waitUntil). */
  after?: (work: Promise<unknown>) => void;
  /** Salt for hashing caller IPs on anonymous routes (a server secret). */
  ipSalt?: string;
}

const ANONYMOUS_DEFAULTS = { perMinute: 30, perDay: 1000 };
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
/** The first address a trusted proxy reports (Supabase sets X-Forwarded-For; Cloudflare CF-Connecting-IP). */
function callerIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}

const METHODS: readonly Method[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const ROUTE = /\/schood-ai\/([a-z]+)\/([a-z][a-z0-9-]{0,60})\/?$/;
const DEFAULT_MAX_BODY = 64 * 1024;

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > max) throw new SchoodAIError('payload_too_large', 'The request is too large.', 413, { max_bytes: max });
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw new SchoodAIError('payload_too_large', 'The request is too large.', 413, { max_bytes: max }); }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export function createSchoodAIHandler(deps: HandlerDeps, options: HandlerOptions) {
  const now = options.now ?? (() => new Date());
  const after = options.after ?? ((work: Promise<unknown>) => { void work; });
  const secret = options.serviceSecret && options.serviceSecret.length >= 32 ? options.serviceSecret : null;
  const routes = new Map<string, RouteHandler>();
  const stores = deps.stores ?? createStores({ kind: 'memory' }, { now });
  for (const module of deps.modules ?? MODULES) {
    if (!(AREAS as readonly string[]).includes(module.area)) throw new Error(`unknown area ${module.area}`);
    for (const [action, handler] of Object.entries(module.routes)) {
      if (!/^[a-z][a-z0-9-]{0,60}$/.test(action)) throw new Error(`invalid action ${module.area}/${action}`);
      if (module.area === 'admin' && !handler.adminPermission) throw new Error(`admin/${action} needs an admin permission`);
      if (module.area === 'admin' && handler.service) throw new Error(`admin/${action} cannot accept the worker`);
      if (module.area === 'admin' && (handler.system || handler.anonymous)) throw new Error(`admin/${action} cannot be a system or anonymous route`);
      if ([handler.service, handler.system, handler.anonymous].filter(Boolean).length > 1) throw new Error(`${module.area}/${action}: service, system and anonymous are separate kinds of route`);
      if (handler.anonymous && typeof handler.anonymous === 'object') {
        const { perMinute = ANONYMOUS_DEFAULTS.perMinute, perDay = ANONYMOUS_DEFAULTS.perDay } = handler.anonymous;
        if (!Number.isInteger(perMinute) || perMinute < 1 || perMinute > 600 || !Number.isInteger(perDay) || perDay < perMinute || perDay > 100_000) throw new Error(`${module.area}/${action}: anonymous limits are 1-600 a minute and up to 100000 a day`);
      }
      const key = `${module.area}/${action}`;
      if (routes.has(key)) throw new Error(`route ${key} is registered twice`);
      routes.set(key, handler);
    }
  }

  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Request-ID': requestId, Vary: 'Origin' };
    if (origin && options.allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, idempotency-key, x-schood-locale';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
      headers['Access-Control-Expose-Headers'] = 'X-Request-ID';
      headers['Access-Control-Max-Age'] = '600';
    }
    const json = (status: number, value: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
    const fail = (status: number, code: string, error: string, details: Record<string, unknown> = {}) => json(status, { code, error, ...details, request_id: requestId });
    if (origin && !options.allowedOrigins.includes(origin)) return fail(403, 'origin_denied', 'Origin is not allowed.');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(req.url), match = ROUTE.exec(url.pathname);
    const handler = match ? routes.get(`${match[1]}/${match[2]}`) : undefined;
    if (!match || !handler) return fail(404, 'not_found', 'Not found.');
    const area = match[1] as Area, action = match[2], method = req.method as Method;
    const run = METHODS.includes(method) ? handler[method] : undefined;
    if (!run) return fail(405, 'method_not_allowed', 'Method not allowed.', {});

    try {
      // --- who is calling ----------------------------------------------------------
      let user: RequestUser | null;
      let caller: Caller;
      const presented = req.headers.get('x-schood-service-secret');
      if (handler.system) {
        // A scheduled job: the secret alone, never a person, never a browser.
        if (presented === null) return fail(401, 'unauthorized', 'System routes need the service secret.');
        const system = deps.systemSecret ? await deps.systemSecret().catch(() => null) : null;
        const known = (secret && safeEqual(presented, secret)) || (system !== null && system.length >= 32 && safeEqual(presented, system));
        if (!known) return fail(401, 'unauthorized', 'System routes need the service secret.');
        if (origin) return fail(403, 'origin_denied', 'Origin is not allowed.');
        if (req.headers.has('x-schood-user-id') || req.headers.has('x-schood-telegram-chat-id') || req.headers.has('authorization')) {
          return fail(400, 'invalid_request', 'System routes never act for a person.');
        }
        user = null;
        caller = 'system';
      } else if (handler.anonymous) {
        // Open without signing in, limited per IP and route; a token, if sent, is ignored.
        const limits = { ...ANONYMOUS_DEFAULTS, ...(typeof handler.anonymous === 'object' ? handler.anonymous : {}) };
        const day = now().toISOString().slice(0, 10);
        const bucket = `anon:${area}/${action}:${(await sha256Hex(`${options.ipSalt ?? 'schood-ai'}:${day}:${callerIp(req)}`)).slice(0, 32)}`;
        for (const [limit, seconds] of [[limits.perMinute, 60], [limits.perDay, 86_400]] as const) {
          const taken = await deps.repository.takeRate(`${bucket}:${seconds}`, limit, seconds);
          if (!taken.ok) return fail(429, 'rate_limited', 'Too many requests. Try again shortly.', { retry_after: taken.retryAt });
        }
        user = null;
        caller = 'anonymous';
      } else if (presented !== null) {
        if (!secret || !safeEqual(presented, secret)) return fail(401, 'unauthorized', 'Sign in to continue.');
        // A browser must never hold the worker secret.
        if (origin) return fail(403, 'origin_denied', 'Origin is not allowed.');
        if (!handler.service) return fail(403, 'service_not_allowed', 'This route is not open to the worker.');
        const userId = req.headers.get('x-schood-user-id') ?? '', chat = req.headers.get('x-schood-telegram-chat-id') ?? '';
        if (!isUuid(userId) || !/^-?\d{1,20}$/.test(chat)) return fail(400, 'invalid_request', 'The worker must name the user and the Telegram chat.');
        const profile = await deps.repository.profile(userId.toLowerCase());
        if (!profile || !profile.isActive || profile.telegramChatId !== chat) return fail(403, 'user_not_linked', 'This Telegram chat is not linked to that Schood account.');
        user = { id: profile.id, email: null, token: null, via: 'service', telegramChatId: chat };
        caller = 'service';
      } else {
        const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
        const authed = token ? await deps.repository.user(token) : null;
        if (!authed) return fail(401, 'unauthorized', 'Sign in to continue.');
        const profile = await deps.repository.profile(authed.id);
        if (profile && !profile.isActive) return fail(403, 'account_inactive', 'This account is not active.');
        user = { id: authed.id, email: authed.email, token, via: 'jwt', telegramChatId: profile?.telegramChatId ?? null };
        caller = 'user';
      }
      if (area === 'admin') {
        const gate = await deps.adminGate(req, handler.adminPermission!);
        if (!gate.ok) return fail(gate.status, gate.code, gate.status === 401 ? 'Sign in to continue.' : 'Schood admins only.');
      }

      // --- the route ---------------------------------------------------------------
      const maxBody = handler.maxBody ?? DEFAULT_MAX_BODY;
      const ctx = createRequestContext(
        { repo: deps.repository, gateway: deps.gateway, plans: deps.plans, stores, isAdmin: deps.isAdmin, callFunction: deps.callFunction, after, now, responseHeaders: { ...headers } },
        { url, headers: req.headers, area, action, method, requestId, user, caller, readBody: () => readLimited(req, maxBody) },
      );
      const result = await run(ctx);
      if (result instanceof Response) {
        const merged = new Headers(result.headers);
        for (const [name, value] of Object.entries(headers)) if (name !== 'Content-Type' && !merged.has(name)) merged.set(name, value);
        return new Response(result.body, { status: result.status, headers: merged });
      }
      return json(200, result ?? {});
    } catch (cause) {
      if (cause instanceof SchoodAIError) return fail(cause.status, cause.code, cause.message, cause.details);
      // Never log bodies or prompts: only the route and the error.
      console.error(JSON.stringify({ request_id: requestId, route: `${area}/${action}`, error: String(cause).slice(0, 300) }));
      return fail(500, 'internal_error', 'Something went wrong.');
    }
  };
}
