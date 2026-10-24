// Local stand-in for trying Schood Admission in a browser: serves a built app
// (apps/admission built with VITE_SUPABASE_URL pointing here) and runs the real
// admission handler over an in-memory store filled with the starter question bank.
// Sign in with any email and the password "synthetic". Nothing leaves this machine.
//
//   deno run --no-lock --allow-net=127.0.0.1 --allow-read scripts/admission-dev-stack.ts <dist> [port] [--free]
import { createAdmissionHandler } from '../supabase/functions/admission/handler.ts';
import { createMemoryRepository } from '../supabase/functions/admission/memory-repository.ts';
import { weekOf } from '../packages/subject-core/src/mod.ts';
import { starterBank } from './admission-starter-bank.ts';

const dist = Deno.args[0] ?? 'apps/admission/dist';
const port = Number(Deno.args[1] ?? 4793);
const free = Deno.args.includes('--free');
const origin = `http://127.0.0.1:${port}`;

// The starter bank as if approved in the content workspace.
const bank = starterBank(4).rows.map((row, index) => ({ id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, ...row }));
const learner = '00000000-0000-4000-8000-0000000000d1';
const memory = createMemoryRepository({ bank, users: {} });
memory.repository.user = (token) => Promise.resolve(token.startsWith('fixture.') ? learner : null);
// Forty other learners' results this week, so the weekly mock shows a ranking.
const week = weekOf(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10));
for (let i = 0; i < 40; i++) {
  const id = crypto.randomUUID();
  memory.mocks.set(id, { id, user: `other-${i}`, week, section_id: 'specialised_1', question_locale: 'uz', items: [], answers: {}, started_at: '', deadline_at: '', submitted_at: new Date().toISOString(), correct: 0, points: Math.round((20 + i * 1.7) * 10) / 10, max_points: 93, results: [] });
}
const admission = createAdmissionHandler(memory.repository, [origin], { enabled: true, access: free ? () => Promise.resolve('free') : undefined, freeDailyQuestions: 10 });

const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function session(email: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: learner, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: `fixture.${base64url({ sub: learner, exp, role: 'authenticated', email })}.signature`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'fixture-refresh', user };
}
const types: Record<string, string> = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', png: 'image/png' };

Deno.serve({ hostname: '127.0.0.1', port }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/functions/v1/admission/')) return admission(req);
  const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version', 'Content-Type': 'application/json' };
  if (url.pathname.startsWith('/auth/v1/')) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/auth/v1/token') {
      const body = await req.json().catch(() => ({}));
      if (body.password !== 'synthetic' && url.searchParams.get('grant_type') === 'password') return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }), { status: 400, headers: cors });
      return new Response(JSON.stringify(session(body.email ?? 'learner@example.test')), { headers: cors });
    }
    if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify(session('learner@example.test').user), { headers: cors });
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204, headers: cors });
    return new Response('{}', { headers: cors });
  }
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const bytes = await Deno.readFile(`${dist}${decodeURIComponent(path)}`);
    return new Response(bytes, { headers: { 'Content-Type': types[path.split('.').pop() ?? ''] ?? 'application/octet-stream' } });
  } catch {
    return new Response(await Deno.readFile(`${dist}/index.html`), { headers: { 'Content-Type': 'text/html' } });
  }
});
console.log(`Schood Admission dev stack on ${origin} (password: synthetic)`);
