import { SSEParser, type Registry } from '../../../../packages/ai-core/src/mod.ts';
import { completion, ID, ORIGIN, PRODUCT, SECRET, START, USERS } from '../fixture.test.ts';
import { CircuitBreaker, createGateway } from '../gateway.ts';
import { createSchoodAIHandler, MODULES } from '../handler.ts';
import { createMemoryRepository, SEED_REGISTRY, type MemoryUser } from '../memory-repository.ts';
import { createPlanResolver } from '../plan.ts';
import type { ServiceSettings } from '../types.ts';
import { bindLearnerStore, createMemoryLearnerStore, type MemoryLearnerSeed } from './store.ts';

// The learner area's test fixture, following ../fixture.test.ts: the real handler,
// gateway and plan resolver over the memory repository and the memory learner
// store, a fake model behind `fetch`, a movable clock, and fake Schood functions
// (learning-profile-v3, score-prediction, academy, academy-learning,
// review-session) answered per token. No network.

export const KID = {
  family: '00000000-0000-4000-8000-0000000000f1', child: '00000000-0000-4000-8000-0000000000f2', child2: '00000000-0000-4000-8000-0000000000f3',
  child3: '00000000-0000-4000-8000-0000000000f4', child4: '00000000-0000-4000-8000-0000000000f5',
};
export const LEARNER_USERS: Record<string, MemoryUser> = {
  ...USERS,
  'tok-family': { id: KID.family, email: 'mother@example.com', name: 'Nodira', products: [PRODUCT.family], productStarts: { [PRODUCT.family]: '2026-10-20T00:00:00.000Z' }, telegramChatId: '700300' },
  'tok-child': { id: KID.child, email: 'aziza@example.com', name: 'Aziza', telegramChatId: '700400' },
  'tok-child2': { id: KID.child2, email: 'bobur@example.com', name: 'Bobur' },
  'tok-child3': { id: KID.child3, email: 'kamola@example.com', name: 'Kamola' },
  'tok-child4': { id: KID.child4, email: 'sardor@example.com', name: 'Sardor' },
};

export type FunctionFake = (input: { token: string; path: string; query: Record<string, string>; body: unknown; method: string }) => unknown;

export interface LearnerFixtureOptions { settings?: Partial<ServiceSettings>; registry?: Registry; seed?: MemoryLearnerSeed }

export function learnerFixture(options: LearnerFixtureOptions = {}) {
  let clock = START;
  const now = () => clock;
  const memory = createMemoryRepository({ users: LEARNER_USERS, now, settings: options.settings, registry: options.registry ?? SEED_REGISTRY });
  const learner = createMemoryLearnerStore({ names: { [KID.child]: 'Aziza', [KID.child2]: 'Bobur', [ID.plus]: 'Dilnoza', [KID.family]: 'Nodira' }, ...options.seed }, now);
  bindLearnerStore(memory.repository, learner, { familyProductId: PRODUCT.family });
  const upstream: Request[] = [];
  const replies: (string | ((request: Request) => Response))[] = [];
  let fallback: (request: Request) => Response = () => completion('{}');
  const env: Record<string, string> = { OPENROUTER_API_KEY: 'sk-or-test' };
  const gateway = createGateway({
    registry: () => memory.repository.registry(), settings: () => memory.repository.settings(),
    takeCall: (input) => memory.repository.takeCall(input), record: (rows) => { void memory.repository.recordCalls(rows); },
    env: (name) => env[name],
    fetch: (input, init) => {
      const request = new Request(input, init);
      upstream.push(request.clone());
      const next = replies.shift();
      if (next === undefined) return Promise.resolve(fallback(request));
      return Promise.resolve(typeof next === 'string' ? completion(next) : next(request));
    },
    now, breaker: new CircuitBreaker(),
  });
  const isAdmin = (userId: string) => Promise.resolve(userId === ID.admin);
  const tokenProducts = new Map(Object.entries(LEARNER_USERS).map(([token, user]) => [token, user.products ?? []]));
  const plans = createPlanResolver({ productIds: PRODUCT, betaUserIds: new Set([ID.beta]), repo: memory.repository, isAdmin, now, accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []) });
  const functions: Record<string, FunctionFake> = {};
  const functionCalls: { name: string; token: string; query: Record<string, string>; body: unknown }[] = [];
  const pending: Promise<unknown>[] = [];
  const handle = createSchoodAIHandler({
    repository: memory.repository, gateway, plans, isAdmin,
    callFunction: (name, path, token, init) => {
      functionCalls.push({ name, token, query: init.query ?? {}, body: init.body });
      const fake = functions[name];
      if (!fake) return Promise.resolve({ status: 404, data: null });
      try {
        const data = fake({ token, path, query: init.query ?? {}, body: init.body, method: init.method ?? 'GET' });
        return Promise.resolve(data === undefined ? { status: 404, data: null } : { status: 200, data });
      } catch {
        return Promise.resolve({ status: 500, data: null });
      }
    },
    adminGate: () => Promise.resolve({ ok: false, status: 403, code: 'forbidden' }),
    modules: MODULES,
  }, { allowedOrigins: [ORIGIN], serviceSecret: SECRET, now, after: (work) => { pending.push(work); } });

  type CallOptions = { token?: string | null; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> };
  const json = async (method: string, path: string, opts: CallOptions = {}) => {
    const query = new URLSearchParams(opts.query ?? {}).toString();
    const response = await handle(new Request(`https://x.invalid/functions/v1/schood-ai/${path}${query ? `?${query}` : ''}`, {
      method, headers: { 'content-type': 'application/json', origin: ORIGIN, ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? 'tok-plus'}` }), ...opts.headers },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    }));
    return { status: response.status, body: await response.json() };
  };
  /** The Telegram worker acting for a linked user. */
  const worker = async (path: string, userId: string, chat: string, body: unknown, locale = 'en') => {
    const response = await handle(new Request(`https://x.invalid/functions/v1/schood-ai/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-schood-service-secret': SECRET, 'x-schood-user-id': userId, 'x-schood-telegram-chat-id': chat, 'x-schood-locale': locale }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  };
  const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
  return {
    memory, learner, upstream, functions, functionCalls, env, json, worker, settle,
    /** Queues model answers in order: an object is sent as JSON text. */
    reply: (...answers: unknown[]) => { for (const answer of answers) replies.push(typeof answer === 'string' || typeof answer === 'function' ? answer as string : JSON.stringify(answer)); },
    setFallback: (next: (request: Request) => Response) => { fallback = next; },
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    setClock: (iso: string) => { clock = new Date(iso); },
    /** Plan-cycle credits left in a personal workspace. */
    balance: async (token = 'tok-plus') => (await json('GET', 'core/credits', { token })).body.balance.total as number,
    events: () => memory.learning,
    /** Adult consent for a token, the way the app's consent step saves it. */
    adult: async (token = 'tok-plus') => (await json('POST', 'learner/consent', { token, body: { age_band: 'adult', accept: true } })).body,
    /** The prompt text sent to the model for the n-th call. */
    prompt: async (index = -1) => JSON.stringify(await upstream.at(index)!.clone().json()),
  };
}
export const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
export const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); };
export { ID, PRODUCT, SSEParser };
