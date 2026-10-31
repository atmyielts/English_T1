// Local dev stack for apps/schood-ai: the real schood-ai handler over the memory
// repository, with a fake model that streams a Markdown and maths answer. No
// network, no Supabase project, no keys.
//
//   deno run --allow-net --allow-read --allow-env scripts/schood-ai-dev-stack.ts
//   VITE_SUPABASE_URL=http://localhost:54329 VITE_SUPABASE_ANON_KEY=dev npm --workspace apps/schood-ai run dev
//
// Sign in by setting the `schood-auth` cookie on the app's origin to a session whose
// access_token is one of the tokens below (see sessionCookie()).
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createSchoodAIHandler } from '../supabase/functions/schood-ai/handler.ts';
import { createMemoryRepository } from '../supabase/functions/schood-ai/memory-repository.ts';
import { createPlanResolver } from '../supabase/functions/schood-ai/plan.ts';

const PORT = Number(Deno.env.get('SCHOOD_AI_DEV_PORT') ?? '54329');
const ORIGINS = (Deno.env.get('SCHOOD_AI_DEV_ORIGINS') ?? 'http://localhost:5190').split(',');
const PLUS = '20000000-0000-4000-8000-000000000001', TEACHER = '20000000-0000-4000-8000-000000000003', CENTRE = '20000000-0000-4000-8000-000000000005';
const users = {
  'dev-plus': { id: '00000000-0000-4000-8000-0000000000d1', email: 'dilnoza@example.com', name: 'Dilnoza Karimova', products: [PLUS], productStarts: { [PLUS]: new Date(Date.now() - 5 * 86_400_000).toISOString() } },
  'dev-teacher': { id: '00000000-0000-4000-8000-0000000000d2', email: 'teacher@example.com', name: 'Malika Tursunova', products: [TEACHER] },
  'dev-owner': { id: '00000000-0000-4000-8000-0000000000d3', email: 'owner@example.com', name: 'Jasur Aliyev', products: [CENTRE] },
  'dev-free': { id: '00000000-0000-4000-8000-0000000000d4', email: 'free@example.com', name: 'Free Learner' },
  // A Schood admin for the /admin console; dev-admin-nomfa shows the two-step verification state.
  'dev-admin': { id: '00000000-0000-4000-8000-0000000000d5', email: 'admin@example.com', name: 'Schood Admin' },
  'dev-admin-nomfa': { id: '00000000-0000-4000-8000-0000000000d6', email: 'admin2@example.com', name: 'Admin Without MFA' },
};
const memory = createMemoryRepository({ users });
const centre = memory.seed.centre({ name: 'Registan Learning Centre', ownerId: users['dev-owner'].id, branding: { primary_color: '#2f6f4f' } });
memory.seed.member(centre.id, users['dev-plus'].id, 'student', { creditBudget: 200 });
memory.seed.member(centre.id, users['dev-teacher'].id, 'teacher');
// A few library pages: the teacher's own, and one shared in the centre.
const teacherHome = await memory.repository.ensurePersonalWorkspace(users['dev-teacher'].id, 'Malika');
const seedPage = (workspaceId: string, ownerId: string, title: string, folder: string, body: string, visibility: 'private' | 'workspace' = 'private') =>
  memory.repository.createPage({ workspaceId, ownerId, folder, kind: 'note', title, body, material: null, visibility, status: 'draft', sourceGenerationId: null });
await seedPage(teacherHome.id, users['dev-teacher'].id, 'Present perfect: travel', 'Grammar/B1',
  '## Warm-up\n\nHave you **ever** been to Samarkand?\n\n- yes\n- no\n\n| Form | Example |\n| --- | --- |\n| have + V3 | I have seen |\n\n- [ ] Check homework');
await seedPage(teacherHome.id, users['dev-teacher'].id, 'Fractions warm-up', 'Maths', 'Simplify \\(\\tfrac{30}{40}\\).\n\n$$\\frac{3}{4}$$');
await seedPage(centre.id, users['dev-teacher'].id, 'Mock test notes', 'IELTS/Listening', 'Section 3 cost most marks. Practise **two-option** questions.', 'workspace');

const ANSWER = [
  'Good question. In your last mock, **Listening Section 3** cost you the most marks.',
  '',
  '1. Read each option and underline what it *claims*.',
  '2. Listen for turns such as "but actually".',
  '',
  'A quick maths check: if you answer \\(30\\) of \\(40\\) correctly, that is \\(\\tfrac{30}{40} = 75\\%\\).',
  '',
  '\\[ \\text{band} \\approx 7.0 \\]',
].join('\n');
function fakeModel(request: Request): Response {
  const stream = request.headers.get('accept')?.includes('text/event-stream');
  if (!stream) return new Response(JSON.stringify({ choices: [{ message: { content: ANSWER } }], usage: { prompt_tokens: 800, completion_tokens: 120 } }), { headers: { 'Content-Type': 'application/json' } });
  const pieces = ANSWER.match(/.{1,12}/gs) ?? [ANSWER];
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of pieces) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      controller.enqueue(new TextEncoder().encode('data: {"choices":[],"usage":{"prompt_tokens":800,"completion_tokens":120}}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

const gateway = createGateway({
  registry: () => memory.repository.registry(), settings: () => memory.repository.settings(),
  takeCall: (input) => memory.repository.takeCall(input), record: (rows) => { void memory.repository.recordCalls(rows); },
  env: (name) => (name === 'OPENROUTER_API_KEY' ? 'dev-key' : undefined),
  fetch: (input, init) => Promise.resolve(fakeModel(new Request(input, init))), now: () => new Date(), breaker: new CircuitBreaker(),
});
const tokenProducts = new Map(Object.entries(users).map(([token, user]) => [token, 'products' in user ? user.products : []]));
const plans = createPlanResolver({
  productIds: { plus: PLUS, teacher: TEACHER, centre: CENTRE }, betaUserIds: new Set(), repo: memory.repository, isAdmin: (id) => Promise.resolve(id === users['dev-admin'].id), now: () => new Date(),
  accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []),
});
const profile = { projection: { schema_version: 1 }, cefr_estimate: 'B1', target_cefr: 'B2', learner_goals: ['IELTS 7.0'], skill_scores: { listening: 61, reading: 70 }, outcomes: [{ overall_band: '6.5', overall_score: 6.5, computed_at: '2026-10-20T10:00:00Z' }], recent_error_clusters: [{ skill_key: 'listening', error_type: 'Multiple choice with two options mentioned' }] };
const handle = createSchoodAIHandler({
  repository: memory.repository, gateway, plans, isAdmin: (id) => Promise.resolve(id === users['dev-admin'].id || id === users['dev-admin-nomfa'].id),
  callFunction: (name) => Promise.resolve(name === 'learning-profile-v3' ? { status: 200, data: profile } : { status: 404, data: null }),
  adminGate: (req) => {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (token === 'dev-admin') return Promise.resolve({ ok: true });
    return Promise.resolve(token === 'dev-admin-nomfa' ? { ok: false, status: 403, code: 'mfa_required' } : { ok: false, status: 403, code: 'forbidden' });
  },
}, { allowedOrigins: ORIGINS, serviceSecret: null });

/** The cookie value to sign in as a dev user on the app's origin. */
export function sessionCookie(token: keyof typeof users): string {
  const user = users[token];
  const session = { access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'dev', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  return `schood-auth=${encodeURIComponent(JSON.stringify(session))}; Path=/`;
}

if (import.meta.main) {
  Deno.serve({ port: PORT }, (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/dev/cookie') return new Response(sessionCookie((url.searchParams.get('token') ?? 'dev-plus') as keyof typeof users), { headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url.pathname.startsWith('/functions/v1/schood-ai/')) return handle(request);
    return new Response('Not found', { status: 404 });
  });
  console.log(`Schood AI dev stack on http://localhost:${PORT} for ${ORIGINS.join(', ')}`);
}
