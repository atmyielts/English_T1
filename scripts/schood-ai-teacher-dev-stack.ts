// Local dev stack for the teacher screens of apps/schood-ai: the real schood-ai
// handler over the memory repository and memory area stores, with a fake model
// that writes teaching materials, checks, marks and posts, a fake Academy and
// Assessment Cloud, and a fake Telegram Bot API. No network, no Supabase project,
// no keys. (The core dev stack's fake model writes chat answers only.)
//
//   SCHOOD_AI_DEV_PORT=54332 SCHOOD_AI_DEV_ORIGINS=http://127.0.0.1:5202 deno run --no-lock --allow-net --allow-read --allow-env scripts/schood-ai-teacher-dev-stack.ts
//   VITE_SUPABASE_URL=http://localhost:54332 VITE_SUPABASE_ANON_KEY=dev npm --workspace apps/schood-ai run dev -- --port 5202 --host 127.0.0.1
//
// Open the app on 127.0.0.1, not localhost: browsers share localhost cookies across
// ports, so another app's dev session would replace this one. Sign in by setting the
// cookie from http://localhost:54332/dev/cookie?token=dev-teacher (also dev-pro for
// Teacher Pro, dev-admin for marketplace review, dev-student, dev-free).
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createSchoodAIHandler } from '../supabase/functions/schood-ai/handler.ts';
import { createMemoryRepository } from '../supabase/functions/schood-ai/memory-repository.ts';
import { createPlanResolver } from '../supabase/functions/schood-ai/plan.ts';
import { setTeacherDeps, type TelegramApi } from '../supabase/functions/schood-ai/teacher/deps.ts';

const PORT = Number(Deno.env.get('SCHOOD_AI_DEV_PORT') ?? '54332');
const ORIGINS = (Deno.env.get('SCHOOD_AI_DEV_ORIGINS') ?? 'http://127.0.0.1:5202').split(',');
const TEACHER = '20000000-0000-4000-8000-000000000003', PRO = '20000000-0000-4000-8000-000000000004';
const ACADEMY = '30000000-0000-4000-8000-000000000001', TENANT = '30000000-0000-4000-8000-000000000002', BANK = '30000000-0000-4000-8000-000000000003';
const users = {
  'dev-teacher': { id: '00000000-0000-4000-8000-0000000000e1', email: 'aziza@example.com', name: 'Aziza Karimova', products: [TEACHER] },
  'dev-pro': { id: '00000000-0000-4000-8000-0000000000e2', email: 'pro@example.com', name: 'Bobur Rahimov', products: [PRO] },
  'dev-admin': { id: '00000000-0000-4000-8000-0000000000e3', email: 'review@example.com', name: 'Schood Review', role: 'admin', permissions: ['admin.*'] },
  'dev-student': { id: '00000000-0000-4000-8000-0000000000e4', email: 'student@example.com', name: 'Aziz' },
  'dev-free': { id: '00000000-0000-4000-8000-0000000000e5', email: 'free@example.com', name: 'Free Learner' },
};
const memory = createMemoryRepository({ users });

const PASSAGE = 'A few years ago, a group of office workers in a large city began keeping bees on the rooftops of their building. At first their neighbours worried about stings, but the hives proved calm and productive.\n\nThe workers now collect around forty kilograms of honey each summer. They sell it in the building\'s café and give the money to a local school garden. Some of the wax is used to make candles.\n\nScientists say city bees can be healthier than country bees, because parks and balconies offer many kinds of flowers. However, they warn that too many hives in one area may leave too little food for wild pollinators.';
const QUESTIONS = { sets: [
  { instructions: 'Do the following statements agree with the information in the passage? Write TRUE, FALSE or NOT GIVEN.', exam_type: 'question_true_false_not_given', questions: [
    { type: 'tfng', prompt: 'The bees were first kept by office workers.', answer: 'TRUE', explanation: 'Paragraph 1.' },
    { type: 'tfng', prompt: 'The neighbours asked the workers to remove the hives.', answer: 'NOT GIVEN', explanation: 'They only worried.' },
    { type: 'tfng', prompt: 'The honey is sold in the building\'s café.', answer: 'TRUE' },
    { type: 'tfng', prompt: 'All of the wax is thrown away.', answer: 'FALSE' },
    { type: 'tfng', prompt: 'City bees are always healthier than country bees.', answer: 'FALSE' },
  ] },
  { instructions: 'Complete the sentences. Write NO MORE THAN TWO WORDS from the passage.', exam_type: 'question_gap_fill', word_limit: 2, from_source: true, questions: [
    { type: 'gap', prompt: 'The bees are kept on the ____ of an office building.', answer: 'rooftops' },
    { type: 'gap', prompt: 'Each summer the workers collect about forty kilograms of ____.', answer: 'honey' },
    { type: 'gap', prompt: 'Some of the wax becomes ____.', answer: 'candles' },
    { type: 'gap', prompt: 'Too many hives may leave little food for wild ____.', answer: 'pollinators' },
  ] },
  { instructions: 'Choose the correct letter, A, B, C or D.', exam_type: 'question_single_choice', questions: [
    { type: 'mcq', prompt: 'What do the workers do with the money?', options: ['Buy more hives', 'Give it to a school garden', 'Pay the café', 'Pay the scientists'], answer: 'B' },
    { type: 'mcq', prompt: 'Why can city bees be healthy?', options: ['Many kinds of flowers', 'Fewer people', 'Cold weather', 'Tall buildings'], answer: 'A' },
    { type: 'mcq', prompt: 'What do scientists warn about?', options: ['Stings', 'Noise', 'Too many hives in one area', 'Rain'], answer: 'C' },
    { type: 'mcq', prompt: 'How did the hives turn out?', options: ['Dangerous', 'Calm and productive', 'Empty', 'Loud'], answer: 'B' },
  ] },
] };
const MARKS = (ids: string[]) => ({ criteria: ids.map((id, index) => ({ id, mark: [6, 6.5, 7, 6][index % 4], comment: 'Clear, with room to develop ideas further.', evidence: ['In my opinion this is a good idea'] })), comments: 'A solid answer. Develop each idea with an example.', fixes: ['Add an example to each main idea.', 'Finish with a clear conclusion.', 'Vary your linking words.'], level_estimate: 'B2' });

function answer(system: string, user: string, json: boolean): unknown {
  if (!json) return 'OK';
  if (system.includes('independent checker')) {
    const ids = [...user.matchAll(/"id":"([a-z]+\d+)"/g)].map((match) => match[1]);
    // The demo IELTS set: the checker agrees with every key except question 2; anything else answers A.
    const demo: Record<string, string> = { q1: 'T', q2: 'F', q3: 'T', q4: 'F', q5: 'F', q6: 'rooftops', q7: 'honey', q8: 'candles', q9: 'pollinators', q10: 'B', q11: 'A', q12: 'C', q13: 'B' };
    const isDemo = user.includes('rooftops');
    return { answers: [...new Set(ids)].map((id) => ({ id, answer: [isDemo ? demo[id] ?? 'A' : 'A'], ...(isDemo && id === 'q2' ? { reason: 'Worried neighbours suggests they objected.' } : {}) })) };
  }
  if (system.includes('marking assistant')) {
    const ids = [...user.matchAll(/\{"id":"([a-z0-9_]+)","name"/g)].map((match) => match[1]);
    return { text: 'Some people think public transport should be free...', ...MARKS(ids) };
  }
  if (system.includes('explain it')) return { observations: [], explain_it: ['What does “low incomes” mean here?', 'Why did you choose buses as your example?', 'How does your second paragraph link to the first?'] };
  if (system.includes('school feedback')) return { comment: 'Aziz worked steadily this term and his reading improved clearly. Next term he should write longer answers with examples.' };
  if (system.includes('Telegram channel')) return user.includes('quiz poll') ? { question: 'Choose the correct form: She ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], correct: 1, explanation: 'Third person singular takes -s.' } : { text: 'Word of the day: “thrive” — to grow well. Plants thrive in sunlight. Students thrive with feedback. How do you thrive?' };
  if (system.includes('marketing text for an independent tutor')) return { text: 'New IELTS group starts soon! Small classes, real practice, honest feedback. Message me to book a trial lesson.', hashtags: ['ielts', 'tashkent'] };
  if (user.includes('Return {"title": "...", "text": "..."}')) return { title: 'Bees on the rooftops', text: PASSAGE };
  if (user.includes('"lines": [{"speaker"')) return { title: 'At the station', setting: 'Two friends at a train station', lines: [{ speaker: 'Anna', text: 'Which platform does the Samarkand train leave from?' }, { speaker: 'Timur', text: 'Platform three, at ten past nine.' }] };
  if (user.includes('questions on the text')) return QUESTIONS;
  if (user.includes('textbook page in the image')) return { text: 'Unit 4. Last weekend I went to the bazaar with my grandmother.', topic: 'Past simple', vocabulary: ['bazaar'], grammar: 'past simple' };
  const count = Number(/Write exactly (\d+) questions/.exec(user)?.[1] ?? 6);
  return { title: 'Practice set', aims: ['Use the target language accurately'], blocks: [
    { type: 'text', role: 'explanation', title: 'How it works', body: 'We use the present perfect for experiences: I have visited Bukhara.' },
    { type: 'questions', instructions: 'Choose the correct answer.', questions: Array.from({ length: Math.min(count, 15) }, (_, index) => ({ type: 'mcq', prompt: `Sentence ${index + 1}: I ___ to Bukhara ${index % 2 ? 'twice' : 'once'}.`, options: ['have been', 'was', 'am', 'be'], answer: 'A', explanation: 'An experience: present perfect.' })) },
    { type: 'cards', cards: [{ title: 'Travel', prompt: 'Tell a partner about a place you have visited.', points: ['where', 'when', 'why'] }] },
  ] };
}

function fakeModel(request: Request, body: { messages?: { role: string; content: string | { type: string; text?: string }[] }[]; response_format?: unknown }): Response {
  const flat = (content: string | { type: string; text?: string }[] | undefined) => typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('\n');
  const system = flat(body.messages?.find((message) => message.role === 'system')?.content);
  const user = flat(body.messages?.filter((message) => message.role === 'user').at(-1)?.content);
  void request;
  const text = JSON.stringify(answer(system, user, true));
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 900, completion_tokens: 600 } }), { headers: { 'Content-Type': 'application/json' } });
}

const gateway = createGateway({
  registry: () => memory.repository.registry(), settings: () => memory.repository.settings(),
  takeCall: (input) => memory.repository.takeCall(input), record: (rows) => { void memory.repository.recordCalls(rows); },
  env: (name) => (name === 'OPENROUTER_API_KEY' ? 'dev-key' : undefined),
  fetch: async (input, init) => { const request = new Request(input, init); const body = await request.clone().json().catch(() => ({})); await new Promise((resolve) => setTimeout(resolve, 400)); return fakeModel(request, body); },
  now: () => new Date(), breaker: new CircuitBreaker(),
});
const tokenProducts = new Map(Object.entries(users).map(([token, user]) => [token, 'products' in user ? user.products : []]));
const isAdmin = (userId: string) => Promise.resolve(userId === users['dev-admin'].id);
const plans = createPlanResolver({
  productIds: { teacher: TEACHER, teacher_pro: PRO }, betaUserIds: new Set(), repo: memory.repository, isAdmin, now: () => new Date(),
  accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []),
});

const telegram: TelegramApi = {
  username: 'schood_teacher_bot',
  call(method, body) {
    console.log(`[telegram] ${method} ${JSON.stringify(body).slice(0, 160)}`);
    if (method === 'getMe') return Promise.resolve({ ok: true, result: { id: 4242, username: 'schood_teacher_bot' } });
    if (method === 'getChat') return Promise.resolve({ ok: true, result: { id: -1001234567890, type: 'channel', title: 'IELTS with Aziza', username: String(body.chat_id).replace('@', '') } });
    if (method === 'getChatMember') return Promise.resolve({ ok: true, result: { status: 'administrator', can_post_messages: true } });
    return Promise.resolve({ ok: true, result: { message_id: Math.floor(Math.random() * 100000) } });
  },
};
setTeacherDeps({
  telegram, appOrigin: ORIGINS[0],
  callFunction<T>(_ctx: unknown, name: string, path: string, init: { body?: unknown; headers?: Record<string, string> }): Promise<T> {
    const body = (init.body ?? {}) as Record<string, unknown>;
    console.log(`[remote] ${name}${path} ${String(body.action ?? '')}`);
    if (body.action === 'academies') return Promise.resolve({ academies: [{ id: ACADEMY, name: 'Registan Academy' }] } as T);
    if (body.action === 'classrooms') return Promise.resolve({ classrooms: [{ id: 'cls-5b', name: '5B IELTS', member_count: 14, is_active: true }] } as T);
    if (body.action === 'homework_mistakes') return Promise.resolve({ mistakes: [], tags: [{ tag: 'tfng_not_given', open: 9, total: 14 }, { tag: 'word_limit', open: 4, total: 6 }] } as T);
    if (body.action === 'create_assignment') return Promise.resolve({ assignment: { id: crypto.randomUUID(), classroom_id: body.classroom_id } } as T);
    if (path === '/workspaces') return Promise.resolve({ data: [{ tenant_id: TENANT, role: 'owner', tenants: { name: 'Registan Assessments' } }] } as T);
    if (path === '/item-banks') return Promise.resolve({ data: [{ id: BANK, title: 'IELTS Reading bank' }] } as T);
    if (path === '/commands') return Promise.resolve({ data: { id: crypto.randomUUID(), item_id: crypto.randomUUID(), version: 1 } } as T);
    return Promise.reject(new Error(`unexpected ${name}${path}`));
  },
});

const handle = createSchoodAIHandler({
  repository: memory.repository, gateway, plans, isAdmin,
  callFunction: () => Promise.resolve({ status: 404, data: null }),
  adminGate: () => Promise.resolve({ ok: false, status: 403, code: 'forbidden' }),
}, { allowedOrigins: ORIGINS, serviceSecret: null });

function sessionCookie(token: keyof typeof users): string {
  const user = users[token];
  const session = { access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'dev', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  return `schood-auth=${encodeURIComponent(JSON.stringify(session))}; Path=/`;
}

Deno.serve({ port: PORT }, (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/dev/cookie') return new Response(sessionCookie((url.searchParams.get('token') ?? 'dev-teacher') as keyof typeof users), { headers: { 'Access-Control-Allow-Origin': '*' } });
  if (url.pathname.startsWith('/functions/v1/schood-ai/')) return handle(request);
  return new Response('Not found', { status: 404 });
});
console.log(`Schood AI teacher dev stack on http://localhost:${PORT} for ${ORIGINS.join(', ')}`);
