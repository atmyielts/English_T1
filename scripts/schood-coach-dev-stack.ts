// Local dev stack for the coach screens (/coach/*): the real schood-ai handler with
// the coach module over memory stores, a fake model, and a learner whose last three
// weeks are seeded by driving the real bot flows (placement, goal, speaking,
// writing, reading, vocabulary, a mock). No network, no Supabase project, no keys.
//
//   SCHOOD_AI_DEV_PORT=54334 SCHOOD_AI_DEV_ORIGINS=http://localhost:5204 deno run --no-lock --allow-net --allow-read --allow-env scripts/schood-coach-dev-stack.ts
//   VITE_SUPABASE_URL=http://localhost:54334 VITE_SUPABASE_ANON_KEY=dev npm --workspace apps/schood-ai run dev -- --port 5204
//
// Sign in on the web: open http://localhost:54334/dev/cookie?token=dev-plus and set the
// printed cookie on the app's origin (dev-free has no plan; dev-pass holds a Speaking pass).
//
// Mini App sign-in, end to end: the real coach bots' worker runs on
// SCHOOD_AI_DEV_WORKER_PORT (8794), with stand-ins for telegram-link's status and the
// auth user endpoint. http://localhost:54334/dev/initdata?pack=ielts&chat=900001 signs
// launch data as Telegram would (the dev bot token's HMAC and a dev Ed25519 key the
// stack trusts); open the app at /coach/ielts#tgWebAppData=<that, URL-encoded> with
// VITE_COACH_BOTS_URL=http://localhost:8794. Core's ctx.auth.sessionFor mints the session.
import { encodeAnswers, type UpdateRequest } from '../packages/coach-packs/src/mod.ts';
import { loadPacks } from '../packages/coach-packs/src/registry.ts';
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createSchoodAIHandler } from '../supabase/functions/schood-ai/handler.ts';
import { createMemoryRepository } from '../supabase/functions/schood-ai/memory-repository.ts';
import { createPlanResolver } from '../supabase/functions/schood-ai/plan.ts';
import { ESSAY, fakeModel, SPEECH_REGISTRY } from '../supabase/functions/schood-ai/coach/harness.ts';
import { coachServices, coachStore } from '../supabase/functions/schood-ai/coach/mod.ts';
import { createStores } from '../supabase/functions/schood-ai/stores.ts';
import { createMemoryCoachStore } from '../supabase/functions/schood-ai/coach/store-memory.ts';
import { dataCheckString } from '../supabase/functions/schood-ai/coach/telegram-auth.ts';
import { signTelegramInitDataForTest } from '../supabase/functions/_shared/telegram-init-data.ts';
import { ciValidatedPacks } from '../packages/coach-packs/src/registry.ts';
import { createWorker } from '../workers/schood-coach-bots/src/worker.ts';

const PORT = Number(Deno.env.get('SCHOOD_AI_DEV_PORT') ?? '54334');
const ORIGINS = (Deno.env.get('SCHOOD_AI_DEV_ORIGINS') ?? 'http://localhost:5204').split(',');
const SECRET = 'dev-coach-service-secret-0123456789abcdef';
const PLUS = '20000000-0000-4000-8000-000000000001', PASS = '20000000-0000-4000-8000-0000000000b2';
const users = {
  'dev-plus': { id: '00000000-0000-4000-8000-0000000000e1', email: 'dilnoza@example.com', name: 'Dilnoza Karimova', products: [PLUS], productStarts: { [PLUS]: new Date(Date.now() - 30 * 86_400_000).toISOString() }, telegramChatId: '900001' },
  'dev-pass': { id: '00000000-0000-4000-8000-0000000000e2', email: 'jasur@example.com', name: 'Jasur Aliyev', products: [PASS], productStarts: { [PASS]: new Date(Date.now() - 3 * 86_400_000).toISOString() }, telegramChatId: '900002' },
  'dev-free': { id: '00000000-0000-4000-8000-0000000000e3', email: 'free@example.com', name: 'Free Learner', telegramChatId: '900003' },
};
type DevUser = (typeof users)[keyof typeof users];
// Mini App sessions are JWT-shaped (the auth client decodes them); each is also a token the
// memory repository knows, so the minted session works against this stack.
const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwtOf = new Map(Object.values(users).map((user) => [user.id, `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86_400 })}.ZGV2`]));
const allUsers: Record<string, DevUser> = { ...users, ...Object.fromEntries(Object.values(users).map((user) => [jwtOf.get(user.id)!, user])) };
const WORKER_PORT = Number(Deno.env.get('SCHOOD_AI_DEV_WORKER_PORT') ?? '8794');
const INTERNAL = 'dev-telegram-internal-secret-0123';
const BOT_TOKENS = { ielts: '7000000001:DEV-IELTS-TOKEN-0123456789abcdefghij', speaking: '7000000002:DEV-SPEAK-TOKEN-0123456789abcdefghij' };
const telegramKey = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
const telegramPublicHex = [...new Uint8Array(await crypto.subtle.exportKey('raw', telegramKey.publicKey))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

let clock = new Date(Date.now() - 20 * 86_400_000);
const now = () => clock;
const memory = createMemoryRepository({ users: allUsers, now, registry: SPEECH_REGISTRY });
const coach = createMemoryCoachStore({ now, chatIdOf: (userId) => Object.values(users).find((user) => user.id === userId)?.telegramChatId ?? null });
const packs = loadPacks();
const runtime = {
  store: coach.store, packs,
  config: { appUrl: ORIGINS[0], bots: { ielts: { id: '7000000001', username: 'SchoodIeltsCoachBot' }, speaking: { id: '7000000002', username: 'SchoodSpeakingBot' } }, passProducts: { B2: [PASS] }, fairUseCredits: 1200, telegramPublicKey: telegramPublicHex },
};
const knobs = { score: null as number | null, cefr: 3.5, corrections: false, failNext: false, prompts: [] as string[] };
const model = fakeModel(knobs);
const gateway = createGateway({
  registry: () => memory.repository.registry(), settings: () => memory.repository.settings(),
  takeCall: (input) => memory.repository.takeCall(input), record: (rows) => { void memory.repository.recordCalls(rows); },
  env: (name) => (name === 'OPENROUTER_API_KEY' ? 'dev-key' : undefined),
  fetch: (input, init) => model(new Request(input, init)), now, breaker: new CircuitBreaker(),
});
const tokenProducts = new Map(Object.entries(allUsers).map(([token, user]) => [token, 'products' in user ? user.products ?? [] : []]));
const plans = createPlanResolver({ productIds: { plus: PLUS }, betaUserIds: new Set(), repo: memory.repository, isAdmin: () => Promise.resolve(false), now, accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []) });
const stores = createStores({ kind: 'memory' }, { now });
stores.use(coachStore, coach.store);
stores.use(coachServices, { config: runtime.config });
const handle = createSchoodAIHandler({
  repository: memory.repository, gateway, plans, isAdmin: () => Promise.resolve(false),
  callFunction: () => Promise.resolve({ status: 404, data: null }),
  adminGate: () => Promise.resolve({ ok: false, status: 403, code: 'forbidden' }),
  stores,
  // What core's ctx.auth.sessionFor mints here: the person's dev JWT.
  mintSession: (userId) => Promise.resolve(jwtOf.has(userId) ? { access_token: jwtOf.get(userId)!, refresh_token: `dev-refresh-${userId}`, expires_at: Math.floor(Date.now() / 1000) + 86_400 } : null),
}, { allowedOrigins: ORIGINS, serviceSecret: SECRET, now });

// --- seeding through the real bot flows ------------------------------------------------------------
let update = 1;
async function bot(user: keyof typeof users, pack: string, event: UpdateRequest['event'], locale: 'uz' | 'ru' | 'en' = 'uz') {
  const body = { pack, update_id: update++, locale, first_name: users[user].name.split(' ')[0], event };
  const response = await handle(new Request('http://dev.invalid/functions/v1/schood-ai/coach/update', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-schood-service-secret': SECRET, 'x-schood-user-id': users[user].id, 'x-schood-telegram-chat-id': users[user].telegramChatId },
    body: JSON.stringify(body),
  }));
  return response.json() as Promise<{ messages?: { kind: string; buttons?: { data?: string }[][] }[] }>;
}
const tap = (user: keyof typeof users, pack: string, data: string) => bot(user, pack, { type: 'callback', data, messageId: 1, date: Math.floor(clock.getTime() / 1000) });
const say = (user: keyof typeof users, pack: string, text: string) => bot(user, pack, { type: 'text', text, messageId: 1, date: Math.floor(clock.getTime() / 1000) });
const day = (days = 1) => { clock = new Date(clock.getTime() + days * 86_400_000); };
const state = async (user: keyof typeof users, pack: string) => (await coach.store.enrollment(users[user].id, pack))?.state.current as { flow: string } | undefined;

async function seedIelts() {
  const items = packs.get('ielts')!.diagnostic.items;
  await bot('dev-plus', 'ielts', { type: 'diagnostic', answers: encodeAnswers(items.map((item, i) => (item.kind === 'can_do' ? (i % 2 ? 1 : 0) : i % 4 === 0 ? ((item.answer ?? 0) + 1) % (item.options?.length ?? 2) : item.answer ?? 0))), locale: 'uz' });
  await tap('dev-plus', 'ielts', 'g:t:7');
  const exam = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10).split('-').reverse().join('.');
  await say('dev-plus', 'ielts', exam);
  await tap('dev-plus', 'ielts', 'g:m:30');
  await tap('dev-plus', 'ielts', 'g:r:0930');
  const answers = [
    'I live in a small flat in Chilonzor with my family and I like it because it is quiet and close to my university',
    'Well I usually study in the evening because in the morning I am working at a café near my house',
    'To be honest I prefer reading on paper, but I use my phone for news because it is faster and more convenient',
  ];
  for (let session = 0; session < 6; session++) {
    knobs.score = [5, 5, 6, 6, 6, 7][session];
    await tap('dev-plus', 'ielts', 'm:speaking');
    await tap('dev-plus', 'ielts', 'o:0');
    for (const answer of answers) { await say('dev-plus', 'ielts', `${answer} and that is why`); await tap('dev-plus', 'ielts', 'sp:nx'); }
    if ((await state('dev-plus', 'ielts'))?.flow === 'speaking') await tap('dev-plus', 'ielts', 'sp:end');
    if (session % 2 === 0) {
      await tap('dev-plus', 'ielts', 'm:reading');
      for (let i = 0; i < 10 && (await state('dev-plus', 'ielts'))?.flow === 'quiz'; i++) {
        const current = (await coach.store.enrollment(users['dev-plus'].id, 'ielts'))!.state.current as { index: number };
        await tap('dev-plus', 'ielts', `a:${current.index}:${session % 3}`);
        if ((await state('dev-plus', 'ielts'))?.flow === 'quiz') await say('dev-plus', 'ielts', 'river');
      }
    }
    day(session < 3 ? 3 : 2);
  }
  knobs.score = 6;
  await tap('dev-plus', 'ielts', 'm:writing');
  await tap('dev-plus', 'ielts', 'o:0');
  await say('dev-plus', 'ielts', ESSAY);
  await tap('dev-plus', 'ielts', 'w:ld');
  knobs.score = null;
}

async function seedSpeaking() {
  const items = packs.get('speaking')!.diagnostic.items;
  await bot('dev-plus', 'speaking', { type: 'diagnostic', answers: encodeAnswers(items.map((item) => (item.kind === 'can_do' ? 1 : item.answer ?? 0))), locale: 'uz' });
  await tap('dev-plus', 'speaking', 'g:t:4');
  await tap('dev-plus', 'speaking', 'g:m:15');
  await tap('dev-plus', 'speaking', 'g:r:1800');
  for (let i = 0; i < 3; i++) {
    knobs.cefr = [3, 3.5, 3.5][i];
    await tap('dev-plus', 'speaking', 'm:roleplay');
    await tap('dev-plus', 'speaking', 'o:0');
    for (const line of ['Hello I would like to check in please, I have a booking', 'The room is very noisy, could I change it please', 'Thank you very much, that is perfect for me']) await say('dev-plus', 'speaking', line);
    await tap('dev-plus', 'speaking', 'rp:end');
    day(2);
  }
}

await seedIelts();
clock = new Date(Date.now() - 6 * 86_400_000);
await seedSpeaking();
clock = new Date();
console.log(`Seeded: ${coach.inspect.sessions.size} sessions, ${coach.inspect.certificates.size} certificates.`);

function sessionCookie(token: keyof typeof users): string {
  const user = users[token];
  const session = { access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'dev', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  return `schood-auth=${encodeURIComponent(JSON.stringify(session))}; Path=/`;
}

/** Launch data as Telegram signs it: Ed25519 for third parties, then the bot-token HMAC over every field. */
async function initData(pack: 'ielts' | 'speaking', chat: string): Promise<string> {
  const botId = BOT_TOKENS[pack].split(':')[0];
  const values = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE-dev', user: JSON.stringify({ id: Number(chat), first_name: 'Dev' }) };
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', telegramKey.privateKey, new TextEncoder().encode(dataCheckString(new URLSearchParams(values).toString(), botId))));
  const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return signTelegramInitDataForTest({ ...values, signature: encoded }, BOT_TOKENS[pack]);
}
const cors = (request: Request) => ({ 'Access-Control-Allow-Origin': request.headers.get('origin') ?? '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' });

Deno.serve({ port: PORT }, async (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/dev/cookie') return new Response(sessionCookie((url.searchParams.get('token') ?? 'dev-plus') as keyof typeof users), { headers: { 'Access-Control-Allow-Origin': '*' } });
  if (url.pathname === '/dev/initdata') {
    const pack = url.searchParams.get('pack') === 'speaking' ? 'speaking' : 'ielts';
    return new Response(await initData(pack, url.searchParams.get('chat') ?? '900001'), { headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  // The auth client checks a session it is given (setSession) with GET /auth/v1/user.
  if (url.pathname === '/auth/v1/user') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    const user = allUsers[(request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')];
    if (!user) return Response.json({ code: 401, msg: 'invalid token' }, { status: 401, headers: cors(request) });
    return Response.json({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }, { headers: cors(request) });
  }
  // telegram-link's status for the worker (the seeded chats).
  if (url.pathname === '/functions/v1/telegram-link') {
    if (request.headers.get('x-worker-secret') !== INTERNAL) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { action?: string; chat_id?: string };
    const user = Object.values(users).find((entry) => entry.telegramChatId === String(body.chat_id ?? ''));
    return Response.json({ linked: !!user, user: user ? { id: user.id, name: user.name } : null });
  }
  if (url.pathname.startsWith('/functions/v1/schood-ai/')) return handle(request);
  return new Response('Not found', { status: 404 });
});
console.log(`Schood Coaches dev stack on http://localhost:${PORT} for ${ORIGINS.join(', ')}`);

// The coach bots' worker, for the Mini App sign-in (no Telegram calls are made on this path).
const worker = createWorker({
  env: {
    APP_URL: ORIGINS[0], SUPABASE_URL: `http://127.0.0.1:${PORT}`, SCHOOD_AI_SERVICE_SECRET: SECRET, TELEGRAM_INTERNAL_SECRET: INTERNAL, ALLOW_LOCAL_ORIGINS: '1',
    COACH_BOT_TOKEN_IELTS: BOT_TOKENS.ielts, COACH_WEBHOOK_SECRET_IELTS: 'dev-hook-secret-ielts-0123', COACH_BOT_TOKEN_SPEAKING: BOT_TOKENS.speaking, COACH_WEBHOOK_SECRET_SPEAKING: 'dev-hook-secret-speaking-01',
  },
  packs: ciValidatedPacks(), fetch: (input, init) => fetch(input, init),
});
Deno.serve({ port: WORKER_PORT }, (request) => worker.fetch(request));
console.log(`Coach bots worker on http://localhost:${WORKER_PORT}`);
