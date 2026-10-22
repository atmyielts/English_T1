// Local stand-in for trying Schood Admission in a browser: serves a built app
// (apps/admission built with VITE_SUPABASE_URL pointing here) and runs the real
// admission handler over an in-memory store with a few sample questions.
// Sign in with any email and the password "synthetic". Nothing leaves this machine.
//
//   deno run --no-lock --allow-net=127.0.0.1 --allow-read scripts/admission-dev-stack.ts <dist> [port]
import type { AnswerKey, Item } from '../packages/assessment-core/src/mod.ts';
import type { MasteryState, PlanTask } from '../packages/subject-core/src/mod.ts';
import { AdmissionError, createAdmissionHandler, type AdmissionRepository, type AnswerInput, type Goal } from '../supabase/functions/admission/handler.ts';

const dist = Deno.args[0] ?? 'apps/admission/dist';
const port = Number(Deno.args[1] ?? 4793);
const origin = `http://127.0.0.1:${port}`;

type Sample = { id: string; item: Item; key: AnswerKey };
let next = 1;
function sample(topic: string, locale: 'uz' | 'ru', difficulty: 'easy' | 'medium' | 'hard', prompt: string, answer: { options: string[]; correct: number } | { numeric: number }, solution: string): Sample {
  const id = `40000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
  const base = { schema_version: 'assessment.item.v1' as const, prompt, locale, max_score: 1, tags: [], classification: { topics: [topic], estimated_difficulty: difficulty } };
  if ('numeric' in answer) return { id, item: { ...base, type: 'numeric' }, key: { numeric: { value: answer.numeric, tolerance: 0 }, solution } };
  const options = answer.options.map((text, index) => ({ id: 'abcd'[index], text }));
  return { id, item: { ...base, type: 'single_choice', options }, key: { correct: options[answer.correct].id, solution } };
}
// Sample questions for trying the flow; not production content.
const bank: Sample[] = [
  sample('math.num.natural', 'uz', 'medium', String.raw`\(84\) va \(126\) sonlarining EKUBini toping.`, { options: ['42', '21', '14', '252'], correct: 0 }, String.raw`\(84=2^2\cdot3\cdot7\), \(126=2\cdot3^2\cdot7\).

Umumiy tub ko‘paytuvchilar: \(2\cdot3\cdot7=42\).`),
  sample('math.num.fractions', 'uz', 'easy', String.raw`Hisoblang: \(\frac{3}{4}+\frac{5}{6}\)`, { options: [String.raw`\(\frac{19}{12}\)`, String.raw`\(\frac{8}{10}\)`, String.raw`\(\frac{4}{5}\)`, String.raw`\(\frac{15}{24}\)`], correct: 0 }, String.raw`Umumiy maxraj 12: \(\frac{9}{12}+\frac{10}{12}=\frac{19}{12}\).`),
  sample('math.num.percent', 'uz', 'medium', 'Mahsulot narxi 20% ga oshirilgach 240 000 so‘m bo‘ldi. Dastlabki narx necha so‘m edi?', { numeric: 200000 }, String.raw`\(x\cdot1{,}2=240\,000\), demak \(x=200\,000\).`),
  sample('math.alg.linear', 'uz', 'easy', String.raw`\(\begin{cases}x+y=7\\x-y=1\end{cases}\) sistemadan \(x\) ni toping.`, { numeric: 4 }, String.raw`Tenglamalarni qo‘shamiz: \(2x=8\), \(x=4\).`),
  sample('math.alg.quadratic', 'uz', 'medium', String.raw`\(x^2-5x+6=0\) tenglama ildizlari yig‘indisini toping.`, { options: ['5', '−5', '6', '1'], correct: 0 }, String.raw`Viyet teoremasi: \(x_1+x_2=-\frac{b}{a}=5\).`),
  sample('math.alg.quadratic', 'uz', 'easy', String.raw`\(x^2=49\) tenglamaning musbat ildizini toping.`, { numeric: 7 }, String.raw`\(x=\pm7\); musbat ildiz \(7\).`),
  sample('math.geo.triangles', 'uz', 'easy', 'To‘g‘ri burchakli uchburchakning katetlari 6 va 8 ga teng. Gipotenuzani toping.', { options: ['10', '14', '12', String.raw`\(\sqrt{28}\)`], correct: 0 }, String.raw`\(c=\sqrt{6^2+8^2}=\sqrt{100}=10\).`),
  sample('math.log.equations', 'uz', 'medium', String.raw`\(\log_2(x-1)=3\) tenglamani yeching.`, { numeric: 9 }, String.raw`\(x-1=2^3=8\), demak \(x=9\). Tekshiruv: \(x-1>0\).`),
  sample('math.calc.derivative', 'uz', 'hard', String.raw`\(f(x)=x^3-3x\) bo‘lsa, \(f'(2)\) ni toping.`, { options: ['9', '6', '12', '3'], correct: 0 }, String.raw`\(f'(x)=3x^2-3\), \(f'(2)=12-3=9\).`),
  sample('math.num.natural', 'ru', 'medium', String.raw`Найдите НОД чисел \(84\) и \(126\).`, { options: ['42', '21', '14', '252'], correct: 0 }, String.raw`\(84=2^2\cdot3\cdot7\), \(126=2\cdot3^2\cdot7\), НОД \(=42\).`),
  sample('math.alg.quadratic', 'ru', 'medium', String.raw`Найдите сумму корней уравнения \(x^2-5x+6=0\).`, { options: ['5', '−5', '6', '1'], correct: 0 }, String.raw`По теореме Виета \(x_1+x_2=5\).`),
];

const learner = '00000000-0000-4000-8000-0000000000d1';
let goal: Goal | null = null;
const mastery = new Map<string, MasteryState>(), plans = new Map<string, PlanTask[]>();
const answers = new Map<string, AnswerInput & { topic: string; at: number }>();
const repository: AdmissionRepository = {
  user: (token) => Promise.resolve(token.startsWith('fixture.') ? learner : null),
  goal: () => Promise.resolve(goal),
  saveGoal: (_user, value) => { goal = value; return Promise.resolve(); },
  mastery: () => Promise.resolve(new Map(mastery)),
  plan: (_user, date) => Promise.resolve(plans.get(date) ?? null),
  savePlan: (_user, date, tasks) => { if (!plans.has(date)) plans.set(date, tasks); return Promise.resolve(plans.get(date)!); },
  clearPlan: (_user, date) => { plans.delete(date); return Promise.resolve(); },
  answeredSince: (_user, since) => Promise.resolve([...answers.values()].filter((row) => row.at >= since.getTime()).map((row) => ({ topic_code: row.topic, correct: row.correct, mode: row.mode }))),
  recentItems: () => Promise.resolve([...answers.values()].reverse().map((row) => row.item_version_id)),
  candidates: (topic, locale) => Promise.resolve(bank.filter((row) => row.item.locale === locale && row.item.classification?.topics.includes(topic)).map(({ id, item }) => ({ id, item }))),
  coveredTopics: (locale) => Promise.resolve(new Set(bank.filter((row) => row.item.locale === locale).flatMap((row) => row.item.classification?.topics ?? []))),
  itemWithKey: (id) => Promise.resolve(bank.find((row) => row.id === id) ?? null),
  recordAnswer: (_user, topic, answer, expected, state) => {
    const existing = answers.get(answer.client_answer_id);
    if (existing) return Promise.resolve({ replayed: true, answer: { correct: existing.correct, error_kind: existing.error_kind, topic_code: existing.topic, item_version_id: existing.item_version_id } });
    if ((mastery.get(topic)?.attempts ?? 0) !== expected) return Promise.reject(new AdmissionError('mastery_conflict', 'conflict', 409));
    answers.set(answer.client_answer_id, { ...answer, topic, at: Date.now() });
    mastery.set(topic, state);
    return Promise.resolve({ replayed: false, answer: { correct: answer.correct, error_kind: answer.error_kind, topic_code: topic, item_version_id: answer.item_version_id } });
  },
};
const admission = createAdmissionHandler(repository, [origin], { enabled: true });

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
