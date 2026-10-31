// Local dev stack for selling Schood AI: the real schood-ai handler over the memory
// repository, the owner's launch switch wired as deployed, the pricing area's memory twin,
// and a fake platform (sign-in, checkout, contact) so the whole buying loop runs locally.
// No network, no Supabase project, no Click, no keys.
//
//   deno run --no-lock --allow-net --allow-read --allow-env scripts/schood-ai-pricing-dev-stack.ts
//   VITE_SUPABASE_URL=http://localhost:54361 VITE_SUPABASE_ANON_KEY=dev VITE_PLATFORM_URL=http://localhost:54361 \
//     npm --workspace apps/schood-ai run dev -- --port 5221
//
// Sign in on http://localhost:54361/auth (or follow the app's sign-in link): the cookie is set
// for localhost, which the app on port 5221 shares. Then:
//   http://localhost:54361/dev/launch?on=1   the owner's launch decision (switch + catalogue on sale)
//   http://localhost:54361/dev/launch?on=0   withdraw it
// "Buy" on /pricing opens the fake checkout, which marks a payment paid and grants the
// product exactly as payment fulfilment does, then returns to /pricing/done.
import { AI_PLANS, isLaunched, planById, planProductIds, productOfPlan } from '../packages/ai-core/src/catalog.ts';
import { coachStore } from '../supabase/functions/schood-ai/coach/runtime.ts';
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createSchoodAIHandler } from '../supabase/functions/schood-ai/handler.ts';
import { createMemoryRepository, type MemoryUser } from '../supabase/functions/schood-ai/memory-repository.ts';
import { createPlanResolver } from '../supabase/functions/schood-ai/plan.ts';
import { createMemoryPricingStore, pricingStore } from '../supabase/functions/schood-ai/pricing/store.ts';
import { createStores } from '../supabase/functions/schood-ai/stores.ts';

const PORT = Number(Deno.env.get('SCHOOD_AI_DEV_PORT') ?? '54361');
const APP = Deno.env.get('SCHOOD_AI_DEV_APP') ?? 'http://localhost:5221';
const ORIGINS = [APP];
const person = (id: string, email: string, name: string): MemoryUser & { products: string[]; productStarts: Record<string, string> } => ({ id, email, name, products: [], productStarts: {} });
const users = {
  'dev-free': person('00000000-0000-4000-8000-0000000006a1', 'free@example.com', 'Free Learner'),
  'dev-friend': person('00000000-0000-4000-8000-0000000006a2', 'friend@example.com', 'Gift Friend'),
  'dev-parent': person('00000000-0000-4000-8000-0000000006a3', 'parent@example.com', 'Family Parent'),
  'dev-child': person('00000000-0000-4000-8000-0000000006a4', 'child@example.com', 'Family Child'),
  'dev-manager': person('00000000-0000-4000-8000-0000000006a5', 'manager@example.com', 'Team Manager'),
  'dev-beta': person('00000000-0000-4000-8000-0000000006a6', 'beta@example.com', 'Beta Tester'),
  'dev-admin': { ...person('00000000-0000-4000-8000-0000000006a7', 'admin@example.com', 'Schood Admin'), permissions: ['admin.*'] },
};
type Token = keyof typeof users;
const byId = new Map(Object.values(users).map((user) => [user.id, user]));
const memory = createMemoryRepository({ users, systemSecret: 'dev-system-secret-0123456789abcdef0123' });
const stores = createStores({ kind: 'memory' }, { now: () => new Date(), env: () => undefined });
const twin = createMemoryPricingStore({
  world: {
    repo: memory.repository,
    grantProducts(userId, productIds) {
      const user = byId.get(userId);
      if (!user) return;
      for (const id of productIds) { if (!user.products.includes(id)) user.products.push(id); user.productStarts[id] ??= new Date().toISOString(); }
    },
    coach: stores.get(coachStore),
  },
});
stores.use(pricingStore, twin);

const ANSWER = 'Good question. Here is a short answer from the fake model of the pricing dev stack.';
function fakeModel(request: Request): Response {
  if (!request.headers.get('accept')?.includes('text/event-stream')) return new Response(JSON.stringify({ choices: [{ message: { content: ANSWER } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { headers: { 'Content-Type': 'application/json' } });
  const body = ANSWER.match(/.{1,12}/gs)!.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('') + 'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20}}\n\ndata: [DONE]\n\n';
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}
const gateway = createGateway({
  registry: () => memory.repository.registry(), settings: () => memory.repository.settings(),
  takeCall: (input) => memory.repository.takeCall(input), record: (rows) => { void memory.repository.recordCalls(rows); },
  env: (name) => (name === 'OPENROUTER_API_KEY' ? 'dev-key' : undefined),
  fetch: (input, init) => Promise.resolve(fakeModel(new Request(input, init))), now: () => new Date(), breaker: new CircuitBreaker(),
});
const isAdmin = (id: string) => Promise.resolve(id === users['dev-admin'].id);
const plans = createPlanResolver({
  productIds: planProductIds(), betaUserIds: new Set([users['dev-beta'].id]), repo: memory.repository, isAdmin, now: () => new Date(),
  accessEffective: (token) => Promise.resolve([...(users[token as Token]?.products ?? [])]),
  // As deployed (index.ts): only beta testers until the owner launches.
  launched: async () => isLaunched((await memory.repository.settings()).features),
});
const handle = createSchoodAIHandler({
  repository: memory.repository, gateway, plans, isAdmin, stores,
  callFunction: () => Promise.resolve({ status: 404, data: null }),
  systemSecret: () => memory.repository.systemSecret(),
  adminGate: (req) => Promise.resolve((req.headers.get('authorization') ?? '').endsWith('dev-admin') ? { ok: true } : { ok: false, status: 403, code: 'forbidden' }),
}, { allowedOrigins: ORIGINS, serviceSecret: null });

/** The cookie value that signs a dev person in (the shared session cookie's format). */
export function sessionCookie(token: Token): string {
  const user = users[token];
  const session = { access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'dev', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  return `schood-auth=${encodeURIComponent(JSON.stringify(session))}; Path=/`;
}
const tokenOf = (request: Request): Token | null => {
  const raw = (request.headers.get('cookie') ?? '').split('; ').find((part) => part.startsWith('schood-auth='))?.slice(12);
  try { const token = JSON.parse(decodeURIComponent(raw ?? '')).access_token; return token in users ? token as Token : null; } catch { return null; }
};
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const page = (title: string, body: string) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{font:16px system-ui;margin:0;padding:24px 16px;background:#f6f1e8;color:#0f172a}main{max-width:520px;margin:auto}a,button{display:inline-block;margin:6px 0;padding:10px 16px;border-radius:999px;background:#0f172a;color:#fff;border:0;font:inherit;text-decoration:none;cursor:pointer}.note{color:#555;font-size:14px}</style></head><body><main><p class="note">Fake Schood platform (dev stack)</p>${body}</main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const safeReturn = (value: string | null) => (value && value.startsWith(APP) ? value : `${APP}/`);

async function launch(on: boolean) {
  // ai_pricing_launch(): the switch and the catalogue together.
  await memory.repository.updateSettings({ features: on ? { 'pricing.launch': true } : {} }, users['dev-admin'].id);
  twin.setOnSale(on);
}

if (import.meta.main) {
  Deno.serve({ port: PORT }, async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/functions/v1/schood-ai/')) return handle(request);
    if (url.pathname === '/dev/cookie') return new Response(sessionCookie((url.searchParams.get('token') ?? 'dev-free') as Token), { headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url.pathname === '/dev/launch') {
      await launch(url.searchParams.get('on') !== '0');
      return page('Launch', `<h1>Launch switch ${url.searchParams.get('on') !== '0' ? 'on' : 'off'}</h1><a href="${APP}/pricing">Open /pricing</a>`);
    }
    if (url.pathname === '/auth') {
      const back = safeReturn(url.searchParams.get('returnTo'));
      const pick = url.searchParams.get('as') as Token | null;
      if (pick && pick in users) return new Response(null, { status: 303, headers: { 'Set-Cookie': sessionCookie(pick), Location: back } });
      return page('Sign in', `<h1>Sign in as</h1>${(Object.keys(users) as Token[]).map((token) => `<p><a href="/auth?as=${token}&returnTo=${encodeURIComponent(back)}">${escape(users[token].name ?? token)} (${token})</a></p>`).join('')}`);
    }
    if (url.pathname === '/contact') return page('Contact', '<h1>Schood support</h1><p>The real platform sends this to Schood support.</p>');
    if (url.pathname === '/checkout') {
      const plan = planById(url.searchParams.get('plan_id') ?? '');
      const back = safeReturn(url.searchParams.get('returnTo'));
      const token = tokenOf(request);
      if (!plan || productOfPlan(plan).id !== url.searchParams.get('product_id')) return page('Checkout', '<h1>Plan not found</h1>');
      const row = (await twin.catalog()).find((entry) => entry.planId === plan.id);
      if (!row?.planActive) return page('Checkout', `<h1>${escape(plan.name)}</h1><p>This plan is not on sale (the real checkout refuses inactive plans).</p>`);
      if (!token) return page('Checkout', `<h1>Sign in first</h1><a href="/auth?returnTo=${encodeURIComponent(url.toString())}">Sign in</a>`);
      if (request.method === 'POST') {
        twin.pay({ userId: users[token].id, plan: plan.slug });
        return new Response(null, { status: 303, headers: { Location: back } });
      }
      return page('Checkout', `<h1>${escape(plan.name)}</h1><p>${plan.amount.toLocaleString('en-US')} UZS${plan.days ? ` for ${plan.days} days` : ''}</p><p class="note">Signed in as ${escape(users[token].name ?? token)}. No money moves: this marks a fake payment paid.</p><form method="post"><button type="submit">Pay (fake)</button></form>`);
    }
    return new Response('Not found', { status: 404 });
  });
  console.log(`Schood AI pricing dev stack on http://localhost:${PORT} for ${APP} (${AI_PLANS.length} plans, launch switch off)`);
}
