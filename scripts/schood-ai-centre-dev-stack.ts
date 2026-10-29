// Local dev stack for the centre screens of apps/schood-ai: the real schood-ai
// handler and the centre's public routes over the memory repository and the memory
// centre store, with a fake Academy, a fake Telegram and a fake model that answers
// each centre task in the right shape. No network, no Supabase project, no keys.
//
//   SCHOOD_AI_DEV_PORT=54333 SCHOOD_AI_DEV_ORIGINS=http://localhost:5203 deno run --no-lock --allow-net --allow-read --allow-env scripts/schood-ai-centre-dev-stack.ts
//   VITE_SUPABASE_URL=http://localhost:54333 VITE_SUPABASE_ANON_KEY=dev npm --workspace apps/schood-ai run dev -- --port 5203
//
// Sign in: open http://localhost:54333/dev/cookie?token=tok-owner (or tok-office, tok-t1, tok-s1)
// and set the printed `schood-auth` cookie on the app's origin. The centre is
// "Registan Learning Centre" (Centre Pro, linked to the fake Academy).
import { placementKind } from '../packages/ai-core/src/centre/placement.ts';
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createSchoodAIHandler } from '../supabase/functions/schood-ai/handler.ts';
import { createMemoryRepository, SEED_REGISTRY } from '../supabase/functions/schood-ai/memory-repository.ts';
import { createPlanResolver } from '../supabase/functions/schood-ai/plan.ts';
import { createStores } from '../supabase/functions/schood-ai/stores.ts';
import { centreRuntime, centreStore } from '../supabase/functions/schood-ai/centre/binding.ts';
import { SecretBox, secretContext } from '../supabase/functions/schood-ai/centre/crypto.ts';
import { createCentrePublicHandler } from '../supabase/functions/schood-ai/centre/public.ts';
import { createMemoryCentreStore } from '../supabase/functions/schood-ai/centre/store-memory.ts';
import { ACADEMY, BOT_TOKEN, fakeAcademy, fakeTelegram, ID, PRODUCT, TEST, USERS } from '../supabase/functions/schood-ai/centre/testing.ts';

const PORT = Number(Deno.env.get('SCHOOD_AI_DEV_PORT') ?? '54333');
const ORIGINS = (Deno.env.get('SCHOOD_AI_DEV_ORIGINS') ?? 'http://localhost:5203').split(',');
const memory = createMemoryRepository({ users: USERS, registry: SEED_REGISTRY });
const academy = fakeAcademy(), telegram = fakeTelegram();
const store = createMemoryCentreStore(memory);
const secrets = await SecretBox.create('dev', { dev: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 200 - i))) });
const stores = createStores({ kind: 'memory' }, { now: () => new Date() });
stores.use(centreStore, centreRuntime({
  store, telegram: telegram.api, secrets, media: { put: (key) => Promise.resolve({ provider: 's3', bucket: 'dev', path: key }) },
  config: { appUrl: ORIGINS[0], publicUrl: `http://localhost:${PORT}/functions/v1/schood-ai/public`, schoodBotToken: null },
}));

// --- The fake model: one answer per centre task, chosen from the system prompt ----------------
const ANSWERS: [RegExp, (user: string, system: string) => unknown][] = [
  [/admissions assistant/, () => ({ reply: 'Ha, bolalar uchun 7 yoshdan guruhlarimiz bor. Sinov darsiga yozilmoqchimisiz?', intent: 'question', language: 'uz' })],
  [/to a parent about their child/, () => ({ message: 'Assalomu alaykum! Farzandingiz bu oy darslarda faol qatnashdi. Uy vazifalarini o‘z vaqtida topshirishiga yordam bersangiz, natija yanada yaxshi bo‘ladi. Hurmat bilan, Registan.' })],
  [/follow-up message from the centre|inviting a prospective student/, () => ({ message: 'Assalomu alaykum! IELTS kursimiz haqida so‘ragan edingiz. Sinov darsiga taklif qilamiz — qachon qulay?' })],
  [/at risk of dropping out|renewal reminder/, () => ({ message: 'We have missed your child at the centre. Would you like to talk with the teacher about coming back this week?' })],
  [/Give up to three variants/, () => ({ variants: [{ text: 'New IELTS evening group starts soon at Registan Learning Centre. Small groups, experienced teachers. Book a free placement test today!', hashtags: ['#IELTS', '#Tashkent'] }, { text: 'Want to speak English with confidence? Join Registan Learning Centre. Message us to book a trial lesson.', hashtags: [] }] })],
  [/Monday business brief/, () => ({ headline: 'Registan Learning Centre this week', text: 'Leads and conversions are in the numbers below. Attendance and homework need a look in two groups.', suggestions: [{ title: 'Follow up the open leads', why: 'Several leads have no next step.', area: 'leads' }, { title: 'Call the families of at-risk students', why: 'At-risk students are listed.', area: 'parents' }, { title: 'Chase outstanding payments', why: 'Some payments are outstanding.', area: 'payments' }] })],
  [/using only the centre’s own documents/, () => ({ answer: 'The answer is in the staff handbook [1].', citations: [1], found: true })],
  [/structured, supportive feedback/, () => ({ summary: 'A well-organised lesson with clear aims; the lead-in was long.', ratings: [{ key: 'aims', rating: 3, evidence: [], comment: 'Aims were shared at the start.' }], strengths: ['Clear aims'], next_steps: ['Shorten the lead-in'] })],
  [/Mark placement-test answers/, () => ({ sections: [{ id: 'writing', level: 'a2', criteria: [{ name: 'Grammar', score: 3, note: 'Some agreement errors.' }], evidence: [], comment: 'Clear ideas with simple sentences.', top_fixes: ['Subject-verb agreement'] }] })],
  [/English course for an education centre/, () => ({ levels: [{ level: 'a1', units: [{ title: 'Hello!', can_do: ['I can greet people.'] }, { title: 'My family', can_do: ['I can talk about my family.'] }] }, { level: 'a2', units: [{ title: 'My day', can_do: ['I can describe my routine.'] }, { title: 'Shopping', can_do: ['I can buy things.'] }] }] })],
  // C12 units and C5 drafts come back in the teacher material model.
  [/Write one unit of a/, (_user, system) => {
    const minutes = Number(/add up to (\d+)/.exec(system)?.[1] ?? 90), lessons = Number(/first exactly (\d+) blocks/.exec(system)?.[1] ?? 2);
    const split = [Math.round(minutes * 0.15), Math.round(minutes * 0.35)];
    const lesson = (n: number) => ({ type: 'stages', title: n === 1 ? 'Greetings' : `Lesson ${n}: introductions`, homework: 'Write five greetings and learn them.', stages: [
      { name: 'Warm-up', minutes: split[0], aim: 'Learn each other’s names', steps: ['Name chain around the class.'], interaction: 'whole class' },
      { name: 'Presentation', minutes: split[1], aim: 'Meet formal and informal greetings', steps: ['Listen to two short dialogues.', 'Fill the gaps in pairs.'] },
      { name: 'Practice', minutes: minutes - split[0] - split[1], aim: 'Greet and introduce people', steps: ['Role-play meeting a new classmate.', 'Swap partners twice.'], interaction: 'pairs' },
    ] });
    const items = [['Hello, ____ are you?', ['how', 'what', 'who', 'where'], 'A'], ['Nice to ____ you.', ['see', 'meet', 'know', 'look'], 'B'], ['My name ____ Aziza.', ['am', 'are', 'is', 'be'], 'C'], ['____ you from Tashkent?', ['Is', 'Am', 'Do', 'Are'], 'D'], ['Good ____! (in the morning)', ['morning', 'night', 'evening', 'bye'], 'A'], ['This is ____ friend, Bekzod.', ['I', 'me', 'my', 'mine'], 'C']] as const;
    return { title: 'Hello and introductions', aims: ['I can greet people.', 'I can introduce myself and others.'], blocks: [
      ...Array.from({ length: lessons }, (_, index) => lesson(index + 1)),
      { type: 'questions', title: 'Unit test', instructions: 'Choose the best answer.', questions: items.map(([prompt, options, answer]) => ({ type: 'single_choice', prompt, options: options.map((text, at) => ({ id: 'ABCD'[at], text })), answer: [answer] })) },
    ] };
  }],
  [/placement-test items in English at CEFR/, (_user, system) => {
    const level = /at CEFR ([A-Za-z0-9-]+)/.exec(system)?.[1] ?? 'A1';
    return { sets: [{ instructions: 'Choose the best answer or fill the gap.', level, questions: [
      { type: 'single_choice', prompt: `(${level}) She ____ to work by bus every day.`, options: [{ id: 'A', text: 'go' }, { id: 'B', text: 'goes' }, { id: 'C', text: 'going' }, { id: 'D', text: 'gone' }], answer: ['B'] },
      { type: 'single_choice', prompt: `(${level}) We have lived in Samarkand ____ 2019.`, options: [{ id: 'A', text: 'for' }, { id: 'B', text: 'since' }, { id: 'C', text: 'from' }, { id: 'D', text: 'at' }], answer: ['B'] },
      { type: 'gap', prompt: `(${level}) If I ____ (know) earlier, I would have called you.`, answer: ['had known'] },
      { type: 'single_choice', prompt: `(${level}) There isn't ____ milk left in the fridge.`, options: [{ id: 'A', text: 'some' }, { id: 'B', text: 'any' }, { id: 'C', text: 'many' }, { id: 'D', text: 'a' }], answer: ['B'] },
      { type: 'single_choice', prompt: `(${level}) Choose one.`, options: [{ id: 'A', text: 'same' }, { id: 'B', text: 'same' }, { id: 'C', text: 'other' }, { id: 'D', text: 'else' }], answer: ['A'] },
    ] }] };
  }],
  [/one short writing task|one speaking task/, () => ({ writing: { prompt: 'Write an email to a friend about your favourite place in your city and why you like it.', min_words: 80 }, speaking: { prompt: 'Tell me about your family and what you like doing together at weekends.' } })],
  // The key checker answers "A" for choices and the right gap, so drafts show a few disagreements.
  [/You are checking an answer key/, (user) => {
    const asked = JSON.parse(/<user_message[^>]*>([\s\S]*)<\/user_message>/.exec(user)?.[1] ?? '{"questions":[]}') as { questions: { id: string; type: string; prompt: string }[] };
    return { answers: asked.questions.map((question) => ({ id: question.id, answer: question.type === 'gap' ? ['had known'] : [question.prompt.includes('lived') ? 'A' : 'B'], ...(question.prompt.includes('lived') ? { reason: '“for” could also fit if a length of time followed.' } : {}) })) };
  }],
];
const STREAM = 'Good question! Look at the time word **yesterday**: it points to a finished time, so we use the past simple. Try again: *I ___ him yesterday.*';
function fakeModel(request: Request, body: { messages?: { role: string; content: unknown }[] }): Response {
  const system = String(body.messages?.find((m) => m.role === 'system')?.content ?? '');
  const user = String(body.messages?.filter((m) => m.role === 'user').at(-1)?.content ?? '');
  const found = ANSWERS.find(([match]) => match.test(system));
  if (request.headers.get('accept')?.includes('text/event-stream')) {
    const pieces = STREAM.match(/.{1,14}/gs) ?? [STREAM];
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const piece of pieces) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)); await new Promise((resolve) => setTimeout(resolve, 35)); }
        controller.enqueue(new TextEncoder().encode('data: {"choices":[],"usage":{"prompt_tokens":600,"completion_tokens":80}}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  const content = found ? JSON.stringify(found[1](user, system)) : 'Done.';
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 800, completion_tokens: 160 } }), { headers: { 'Content-Type': 'application/json' } });
}
const gateway = createGateway({
  registry: () => memory.repository.registry(), settings: () => memory.repository.settings(), takeCall: (input) => memory.repository.takeCall(input),
  record: (rows) => { void memory.repository.recordCalls(rows); }, env: (name) => (name === 'OPENROUTER_API_KEY' ? 'dev-key' : undefined), now: () => new Date(), breaker: new CircuitBreaker(),
  fetch: async (input, init) => { const request = new Request(input, init); return fakeModel(request, await request.clone().json()); },
});
const isAdmin = (userId: string) => Promise.resolve(userId === ID.schoodAdmin);
const tokenProducts = new Map(Object.entries(USERS).map(([token, user]) => [token, user.products ?? []]));
const plans = createPlanResolver({ productIds: PRODUCT, betaUserIds: new Set(), repo: memory.repository, isAdmin, now: () => new Date(), accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []) });
const callFunction = (name: string, _path: string, token: string, init: Parameters<typeof academy.handle>[2]) => Promise.resolve(academy.handle(name, token, init));
const handle = createSchoodAIHandler({ repository: memory.repository, gateway, plans, isAdmin, callFunction, stores, adminGate: () => Promise.resolve({ ok: false, status: 403, code: 'forbidden' }) }, { allowedOrigins: ORIGINS, serviceSecret: null });
const publicHandle = createCentrePublicHandler({ repository: memory.repository, gateway, plans, isAdmin, callFunction, stores }, { serviceSecret: null });

// --- Seed: a Centre Pro centre linked to the fake Academy ------------------------------------
const { workspaceId: ws } = await store.createCentre({ name: 'Registan Learning Centre', ownerId: ID.owner, academyTenantId: ACADEMY, contractPlan: null, contractUntil: null, via: 'academy', createdBy: ID.owner, publicKey: 'dev_widget_key_0123456789' });
await memory.repository.updateWorkspace(ws, { branding: { primary_color: '#2f6f4f', accent_color: '#b6f24a', assistant_name: 'Registan Buddy' }, houseStyle: { tone: 'Warm and encouraging', instruction_language: 'uz' } });
memory.seed.member(ws, ID.office, 'admin');
for (const id of [ID.t1, ID.t2]) memory.seed.member(ws, id, 'teacher', { creditBudget: 500 });
for (const id of [ID.s1, ID.s2, ID.s3, ID.s4, ID.s5, ID.s6]) memory.seed.member(ws, id, 'student', { creditBudget: 50 });
await store.table('settings').update({ workspace_id: ws }, { budget_defaults: { teacher: 500, student: 50 }, embed_domains: ['http://localhost:5203'], widgets: { admissions_chat: true } });
const group = await store.table('groups').insert({ workspace_id: ws, academy_classroom_id: 'c0000000-0000-4000-8000-0000000000b5', name: '5B', level: 'B1', teacher_ids: [ID.t1], focus_topics: ['present perfect'], created_by: ID.owner });
for (const id of [ID.s1, ID.s2, ID.s3, ID.s4, ID.s5]) await store.table('group_members').insert({ group_id: group.id, workspace_id: ws, user_id: id });
const test = await memory.repository.createPage({ workspaceId: ws, ownerId: ID.t1, folder: 'Placement tests', kind: 'centre.placement_test', title: TEST.title, body: placementKind.toMarkdown(TEST as never), material: TEST, visibility: 'workspace', status: 'approved', sourceGenerationId: null });
await store.table('admissions').insert({
  workspace_id: ws, enabled: true, bot_ref: 'devbotref0123456789', bot_username: 'registan_admissions_bot', bot_id: 777000, placement_page_id: test.id,
  faq: [{ q: 'Do you teach kids?', a: 'Yes, from 7 years old, in small groups.' }, { q: 'Where are you?', a: 'Amir Temur street 12, Tashkent.' }],
  prices: [{ course: 'General English', price: 450000, currency: 'UZS', period: 'month', note: null }, { course: 'IELTS', price: 650000, currency: 'UZS', period: 'month', note: '3 lessons a week' }],
  booking: { mode: 'approve', duration_minutes: 60, min_notice_hours: 12, max_days_ahead: 14, require_phone: true, slots: [{ weekday: 2, start: '10:00', capacity: 3 }, { weekday: 4, start: '15:00', capacity: 3 }] },
});
await store.table('secrets').insert({ workspace_id: ws, purpose: 'telegram_bot', label: 'admissions', sealed: await secrets.seal(BOT_TOKEN, secretContext(ws, 'telegram_bot', 'admissions')), hint: BOT_TOKEN.slice(-4), fingerprint: '0'.repeat(64) });
await store.table('results').insert({ workspace_id: ws, student_name: 'Madina R.', exam: 'IELTS', score: '7.5', result_date: '2026-10-12', consent: true, verified: true, verified_by: ID.owner, verified_at: new Date().toISOString(), created_by: ID.t1 });
await memory.repository.grantCredits({ workspaceId: ws, amount: 2000, kind: 'pack', reference: 'dev-pack', userId: null });

function sessionCookie(token: string): string {
  const user = USERS[token] ?? USERS['tok-owner'];
  const session = { access_token: token in USERS ? token : 'tok-owner', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'dev', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  return `schood-auth=${encodeURIComponent(JSON.stringify(session))}; Path=/`;
}

Deno.serve({ port: PORT }, (request) => {
  const url = new URL(request.url);
  if (url.pathname === '/dev/cookie') return new Response(sessionCookie(url.searchParams.get('token') ?? 'tok-owner'), { headers: { 'Access-Control-Allow-Origin': '*' } });
  if (url.pathname.startsWith('/functions/v1/schood-ai/public/')) return publicHandle(request);
  if (url.pathname.startsWith('/functions/v1/schood-ai/')) return handle(request);
  return new Response('Not found', { status: 404 });
});
console.log(`Schood AI centre dev stack on http://localhost:${PORT} for ${ORIGINS.join(', ')} · centre ${ws} · widget key dev_widget_key_0123456789`);
