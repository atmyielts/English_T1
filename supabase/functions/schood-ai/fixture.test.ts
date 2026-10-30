import { SSEParser, type Registry } from '../../../packages/ai-core/src/mod.ts';
import { CircuitBreaker, createGateway, type Timeouts } from './gateway.ts';
import { createSchoodAIHandler, MODULES } from './handler.ts';
import { createStores } from './stores.ts';
import { createMemoryRepository, SEED_REGISTRY, type MemoryUser } from './memory-repository.ts';
import { createPlanResolver } from './plan.ts';
import type { FeatureModule, FunctionCallInit, ServiceSettings } from './types.ts';

// Shared test fixture: the real handler, gateway and plan resolver over the memory
// repository, a fake provider behind `fetch`, a movable clock and the after-response
// queue. No network.

export const ORIGIN = 'https://ai.schood.online';
export const SECRET = 'worker-secret-0123456789abcdef0123456789';
/** The system secret pg_cron would send (internal_runtime_secrets). */
export const SYSTEM_SECRET = 'system-secret-0123456789abcdef0123456789';
export const PRODUCT = {
  plus: '10000000-0000-4000-8000-000000000001', family: '10000000-0000-4000-8000-000000000002', teacher: '10000000-0000-4000-8000-000000000003',
  teacher_pro: '10000000-0000-4000-8000-000000000004', centre: '10000000-0000-4000-8000-000000000005', centre_pro: '10000000-0000-4000-8000-000000000006',
};
export const ID = {
  free: '00000000-0000-4000-8000-000000000001', plus: '00000000-0000-4000-8000-000000000002', beta: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004', owner: '00000000-0000-4000-8000-000000000005', teacher: '00000000-0000-4000-8000-000000000006',
  student: '00000000-0000-4000-8000-000000000007', parent: '00000000-0000-4000-8000-000000000008', outsider: '00000000-0000-4000-8000-000000000009',
  inactive: '00000000-0000-4000-8000-00000000000a', teacherPlan: '00000000-0000-4000-8000-00000000000b',
};
export const USERS: Record<string, MemoryUser> = {
  'tok-free': { id: ID.free, email: 'free@example.com' },
  'tok-plus': { id: ID.plus, email: 'dilnoza@example.com', name: 'Dilnoza', products: [PRODUCT.plus], productStarts: { [PRODUCT.plus]: '2026-10-25T00:00:00.000Z' }, telegramChatId: '700100' },
  'tok-beta': { id: ID.beta, email: 'beta@example.com' },
  'tok-admin': { id: ID.admin, email: 'admin@example.com', role: 'admin', permissions: ['admin.*'] },
  'tok-owner': { id: ID.owner, email: 'owner@example.com', products: [PRODUCT.centre] },
  'tok-teacher': { id: ID.teacher, email: 'teacher@example.com' },
  'tok-student': { id: ID.student, email: 'student@example.com', telegramChatId: '700200' },
  'tok-parent': { id: ID.parent, email: 'parent@example.com' },
  'tok-outsider': { id: ID.outsider, email: 'outsider@example.com' },
  'tok-inactive': { id: ID.inactive, isActive: false },
  'tok-teacher-plan': { id: ID.teacherPlan, products: [PRODUCT.teacher] },
};
export const START = new Date('2026-11-02T06:00:00Z'); // 11:00 in Tashkent

export const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
export const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); };

/** An OpenAI-compatible completion. */
export const completion = (text: string, usage = { prompt_tokens: 120, completion_tokens: 30 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage, model: 'x' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
/** An OpenAI-compatible stream of the given pieces. */
export function streamOf(pieces: string[], usage = { prompt_tokens: 100, completion_tokens: 20 }) {
  const body = pieces.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('') + `data: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
export async function events(response: Response) {
  const parser = new SSEParser();
  const all = [...parser.push(await response.text()), ...parser.flush()];
  return all.map((event) => ({ event: event.event, data: JSON.parse(event.data) }));
}

export interface FixtureOptions { settings?: Partial<ServiceSettings>; registry?: Registry; modules?: FeatureModule[]; timeouts?: Partial<Timeouts>; env?: Record<string, string>; productIds?: Partial<typeof PRODUCT> }

export function fixture(options: FixtureOptions = {}) {
  let clock = START;
  const now = () => clock;
  const memory = createMemoryRepository({ users: USERS, now, settings: options.settings, registry: options.registry ?? SEED_REGISTRY, systemSecret: SYSTEM_SECRET });
  /** Calls routes made to other Schood functions (name, path, init). */
  const functionCalls: { name: string; path: string; init: FunctionCallInit }[] = [];
  const upstream: Request[] = [];
  let provider: (request: Request) => Response | Promise<Response> = () => completion('Salom!');
  const env: Record<string, string> = { OPENROUTER_API_KEY: 'sk-or-test', ...options.env };
  const breaker = new CircuitBreaker();
  const gateway = createGateway({
    registry: () => memory.repository.registry(),
    settings: () => memory.repository.settings(),
    takeCall: (input) => memory.repository.takeCall(input),
    record: (rows) => { void memory.repository.recordCalls(rows); },
    env: (name) => env[name],
    fetch: (input, init) => { const request = new Request(input, init); upstream.push(request.clone()); return Promise.resolve(provider(request)); },
    now,
    breaker,
    timeouts: options.timeouts,
  });
  const isAdmin = (userId: string) => Promise.resolve(userId === ID.admin);
  const tokenProducts = new Map(Object.entries(USERS).map(([token, user]) => [token, user.products ?? []]));
  const plans = createPlanResolver({
    productIds: options.productIds ?? PRODUCT, betaUserIds: new Set([ID.beta]), repo: memory.repository, isAdmin, now,
    accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []),
  });
  const profiles: Record<string, unknown> = {};
  const pending: Promise<unknown>[] = [];
  // Area stores: memory twins, reachable as f.stores (seed with f.stores.use(handle, twin)).
  const stores = createStores({ kind: 'memory' }, { now, env: (name) => env[name] });
  const handle = createSchoodAIHandler({
    repository: memory.repository, gateway, plans, isAdmin, stores,
    callFunction: (name, path, token, init) => {
      functionCalls.push({ name, path, init });
      if (name === 'assessment-cloud') return Promise.resolve({ status: 200, data: { ok: true } });
      return Promise.resolve(name === 'learning-profile-v3' && profiles[token] ? { status: 200, data: profiles[token] } : { status: 404, data: null });
    },
    systemSecret: () => memory.repository.systemSecret(),
    adminGate: (req, permission) => {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      return Promise.resolve(token === 'tok-admin' && permission.startsWith('admin.') ? { ok: true } : { ok: false, status: 403, code: 'forbidden' });
    },
    modules: options.modules ?? MODULES,
  }, { allowedOrigins: [ORIGIN], serviceSecret: SECRET, now, after: (work) => { pending.push(work); }, ipSalt: 'test-salt' });

  type CallOptions = { token?: string | null; body?: unknown; query?: Record<string, string>; headers?: Record<string, string>; origin?: string | null };
  const call = (method: string, path: string, opts: CallOptions = {}) => {
    const query = new URLSearchParams(opts.query ?? {}).toString();
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.origin === null ? {} : { origin: opts.origin ?? ORIGIN }), ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? 'tok-plus'}` }), ...opts.headers };
    return handle(new Request(`https://x.invalid/functions/v1/schood-ai/${path}${query ? `?${query}` : ''}`, { method, headers, ...(opts.body === undefined ? {} : { body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body) }) }));
  };
  const json = async (method: string, path: string, opts: CallOptions = {}) => {
    const response = await call(method, path, opts);
    return { status: response.status, body: await response.json() };
  };
  const worker = (path: string, method: string, userId: string, chat: string, body?: unknown, secret = SECRET) => handle(new Request(`https://x.invalid/functions/v1/schood-ai/${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-schood-service-secret': secret, 'x-schood-user-id': userId, 'x-schood-telegram-chat-id': chat }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return {
    memory, gateway, breaker, upstream, env, profiles, call, json, worker, stores, functionCalls,
    setProvider: (next: typeof provider) => { provider = next; },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    /** Waits for after-response work (stream bookkeeping, learning events). */
    settle: async () => { while (pending.length) await Promise.all(pending.splice(0)); },
  };
}

/** Personal workspace id of a person, created on first use. */
export async function personal(f: ReturnType<typeof fixture>, token: string) {
  return (await f.json('GET', 'core/me', { token })).body.workspace.id as string;
}
