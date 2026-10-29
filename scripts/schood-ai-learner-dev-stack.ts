// Local dev stack for the learner and parent screens of apps/schood-ai: the real
// schood-ai handler over the memory repository and the memory learner store, a
// fake model that answers every learner tool with valid output, and fake Schood
// functions (profile, prediction, Academy homework, simulator review). No network.
//
//   SCHOOD_AI_DEV_PORT=54331 SCHOOD_AI_DEV_ORIGINS=http://localhost:5201 \
//     deno run --no-lock --allow-net --allow-read --allow-env scripts/schood-ai-learner-dev-stack.ts
//   VITE_SUPABASE_URL=http://localhost:54331 VITE_SUPABASE_ANON_KEY=dev npm --workspace apps/schood-ai run dev -- --port 5201
//
// Sign in with http://localhost:54331/dev/cookie?token=dev-plus (also dev-family,
// dev-child, dev-student, dev-free) set as the `schood-auth` cookie on the app origin.
import { CircuitBreaker, createGateway } from '../supabase/functions/schood-ai/gateway.ts';
import { createSchoodAIHandler } from '../supabase/functions/schood-ai/handler.ts';
import { bindLearnerStore, createMemoryLearnerStore } from '../supabase/functions/schood-ai/learner/store.ts';
import { createMemoryRepository } from '../supabase/functions/schood-ai/memory-repository.ts';
import { createPlanResolver } from '../supabase/functions/schood-ai/plan.ts';

const PORT = Number(Deno.env.get('SCHOOD_AI_DEV_PORT') ?? '54331');
const ORIGINS = (Deno.env.get('SCHOOD_AI_DEV_ORIGINS') ?? 'http://localhost:5201').split(',');
const PLUS = '20000000-0000-4000-8000-000000000001', FAMILY = '20000000-0000-4000-8000-000000000002', CENTRE = '20000000-0000-4000-8000-000000000005';
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const users = {
  'dev-plus': { id: '00000000-0000-4000-8000-0000000000d1', email: 'dilnoza@example.com', name: 'Dilnoza Karimova', products: [PLUS], productStarts: { [PLUS]: ago(5) }, telegramChatId: '700100' },
  'dev-family': { id: '00000000-0000-4000-8000-0000000000e1', email: 'nodira@example.com', name: 'Nodira Karimova', products: [FAMILY], productStarts: { [FAMILY]: ago(3) }, telegramChatId: '700300' },
  'dev-child': { id: '00000000-0000-4000-8000-0000000000e2', email: 'aziza@example.com', name: 'Aziza Karimova' },
  'dev-owner': { id: '00000000-0000-4000-8000-0000000000d3', email: 'owner@example.com', name: 'Jasur Aliyev', products: [CENTRE] },
  'dev-student': { id: '00000000-0000-4000-8000-0000000000e3', email: 'bobur@example.com', name: 'Bobur Tursunov' },
  'dev-free': { id: '00000000-0000-4000-8000-0000000000d4', email: 'free@example.com', name: 'Free Learner' },
};
const memory = createMemoryRepository({ users });
const learner = createMemoryLearnerStore({
  names: Object.fromEntries(Object.values(users).map((user) => [user.id, user.name.split(' ')[0]])),
  outcomes: { [users['dev-child'].id]: [{ name: 'IELTS Simulator', band: '6.0', score: 6, date: ago(4).slice(0, 10) }] },
  referralCodes: { [users['dev-plus'].id]: 'DILNOZA1' },
});
bindLearnerStore(memory.repository, learner, { familyProductId: FAMILY, appUrl: ORIGINS[0] });
const centre = memory.seed.centre({ name: 'Registan Learning Centre', ownerId: users['dev-owner'].id, branding: { primary_color: '#2f6f4f' } });
centre.academyTenantId = '30000000-0000-4000-8000-000000000001';
memory.seed.member(centre.id, users['dev-student'].id, 'student', { creditBudget: 200 });

// --- A fake model that knows the learner tools ----------------------------------------
const q = (prompt: string, options: string[], answer = 1, explanation = 'Third person singular takes -s in the present simple.') => ({ prompt, options, answer_index: answer, explanation });
const CANNED: Record<string, unknown> = {
  'Mistake explainer': { correct_answer: 'goes', why_wrong: 'You chose **go**, but the subject *she* is third person singular, so the verb needs **-s**.', rule: 'Present simple: he / she / it + verb + **-s** (She goes, He plays).', tip: 'Underline the subject before you choose the verb.', similar: [q('He ___ football on Sundays.', ['play', 'plays', 'playing', 'played']), q('My sister ___ in Tashkent.', ['live', 'lives', 'living', 'lived']), q('It ___ a lot in April.', ['rain', 'rains', 'raining', 'rained'])] },
  'Writing coach': { overall: 6, cefr: 'B2', criteria: [{ key: 'TR', score: 6, comment: 'Your position is clear but the second idea needs an example.' }, { key: 'CC', score: 6.5, comment: 'Paragraphs are logical; vary your linking words.' }, { key: 'LR', score: 6, comment: 'Good topic words; some repetition of "important".' }, { key: 'GRA', score: 5.5, comment: 'Subject-verb agreement slips.' }], summary: 'A clear essay with a strong opening; agreement errors hold the grammar band back.', strengths: ['Clear position', 'Logical paragraphs'], line_comments: [{ quote: 'many people thinks', issue: 'Agreement', suggestion: 'many people think', category: 'grammar' }, { quote: 'it have', issue: 'Agreement', suggestion: 'it has', category: 'grammar' }], rewrite: { original: 'In my opinion it have both advantages and disadvantages.', improved: 'In my view, technology brings clear benefits as well as real drawbacks.', why: 'Correct agreement and a wider range of vocabulary.' }, next_steps: ['Practise subject-verb agreement', 'Add one example per body paragraph'] },
  'Speaking partner': { reply: 'That sounds interesting! What do you enjoy most about it?', goals_met: ['details'], tip: null, end: false },
};
function canned(system: string, user: string): unknown {
  const role = /Your role: ([^\n.]+)/.exec(system)?.[1] ?? '';
  if (system.includes('Write one original model answer')) return { text: 'Technology has changed how we live, work and learn. On the one hand, it connects families across distances and gives students free access to knowledge. On the other hand, it can pull people away from the conversations that matter most. In my view, the benefits outweigh the drawbacks when we use it with clear limits.', notes: ['A clear position in the first paragraph', 'Each paragraph has one idea and an example'] };
  if (CANNED[role]) return CANNED[role];
  if (role.includes('Essay ladder')) return { rungs: ['6.0', '7.0', '8.0'].map((level) => ({ level, text: `Version at ${level}: Nowadays, technology plays a central role in our lives. It helps families stay in touch, yet it can also reduce face-to-face contact.`, changes: [{ what: 'Linking', why: 'Smoother cohesion at this level.' }] })) };
  if (role.includes('Application essay coach')) return { overall: 'A personal, promising draft. Open with your website story.', structure: [{ part: 'Hook', status: 'weak', comment: 'Start with a scene, not a general sentence.' }, { part: 'Motivation', status: 'strong', comment: 'The website story is specific.' }, { part: 'Future plans', status: 'ok', comment: 'Name one concrete goal.' }], strengths: ['Real example'], issues: [{ issue: 'Generic opening', why: 'Many applicants start this way.', fix: 'Begin with the day you launched the website.' }], line_edits: [{ quote: 'I like computers', suggestion: 'I love building things that solve real problems', why: 'More specific' }], questions: ['What problem did your website solve?', 'Who used it?'], next_draft: ['Open with the story'] };
  if (role.includes('Vocabulary coach')) { const words = (user.match(/[A-Za-z]{7,}/g) ?? ['remarkable', 'postpone']).slice(0, 6); return { title: 'Words from your text', words: [...new Set(words)].map((word) => ({ word, lemma: word, pos: 'word', level: 'B2', definition: `the meaning of "${word}"`, meaning_uz: `${word} (uz)`, meaning_ru: `${word} (ru)`, example: `An example with ${word}.` })) }; }
  if (role.includes('Graded reader')) return { title: 'Samarkand at night', text: 'Samarkand is one of the oldest cities in Central Asia. In the evening, the Registan square fills with families and tourists. Lights shine on the blue tiles of the madrasas, and street sellers offer hot bread and tea. Many visitors say that the city feels like a living museum. Young people meet friends near the fountains, and older people sit on benches and talk about the day. In summer, the air is warm until late at night, so the square stays busy for hours.', questions: [q('Where do families meet in the evening?', ['At the bazaar', 'In the Registan square', 'At the airport']), q('What do street sellers offer?', ['Hot bread and tea', 'Books', 'Flowers'], 0, 'The text mentions hot bread and tea.'), q('Why does the square stay busy in summer?', ['It is cold', 'The air is warm until late', 'Shops close early'])], words: [{ word: 'madrasas', meaning_en: 'old Islamic schools', meaning_uz: 'madrasalar', meaning_ru: 'медресе' }, { word: 'visitors', meaning_en: 'people who visit', meaning_uz: 'tashrif buyuruvchilar', meaning_ru: 'посетители' }] };
  if (role.includes('Photo explainer')) return { problem: 'Solve \\(2x + 3 = 11\\).', subject: 'maths', hints: ['What can you do to both sides to remove the 3?', 'Now you have \\(2x = 8\\). What divides both sides?'], steps: [{ text: 'Subtract 3 from both sides: \\(2x = 8\\).' }, { text: 'Divide both sides by 2: \\(x = 4\\).' }], answer: '\\(x = 4\\)' };
  if (role.includes('Study planner')) return { summary: 'Four weeks to lift Listening and Writing Task 2, ending with a full mock.', weeks: [1, 2, 3, 4].map((week) => ({ week, theme: ['Listening section 3', 'Writing Task 2 structure', 'Reading True/False/Not Given', 'Full mock week'][week - 1], goal: 'Two focused sessions and one review.', tasks: [{ title: 'Practice set', minutes: 60, skill: 'listening', link_id: ['ielts.listening', 'ielts.writing_prep', 'ielts.reading', 'ielts.mock'][week - 1] }, { title: 'Review mistakes in Schood AI', minutes: 30, skill: 'any', link_id: 'ai.write' }] })) };
  if (role.includes('Gap-to-target')) return { drivers: [{ title: 'Listening section 3', why: 'Your weakest listening part in recent sets.', action: 'Two section 3 sets this week.', link_id: 'ielts.listening' }, { title: 'Task 2 agreement errors', why: 'Grammar holds your writing band.', action: 'Check every verb after you write.', link_id: 'ai.write' }, { title: 'TFNG questions', why: 'Accuracy is below your other types.', action: 'One timed set.', link_id: 'ielts.reading' }, { title: 'Speaking Part 2 length', why: 'Answers are short.', action: 'Talk for the full 2 minutes.', link_id: 'ai.speak' }], note: 'The time looks tight but workable with steady practice.' };
  if (role.includes('Study-abroad copilot')) return { summary: 'A UK bachelor\'s plan: English at B2 for the visa, then each university\'s own score.', checklist: [{ item: 'English at CEFR B2 (degree level)', entry_ids: ['uk.english.level'] }, { item: 'An offer from a licensed student sponsor', entry_ids: ['uk.visa.who'] }, { item: 'Proof of money for fees and living costs', entry_ids: ['uk.money.living'] }, { item: 'Each university\'s own IELTS score', entry_ids: [] }], timeline: [{ when: '6 months before', task: 'You can apply for the Student visa from outside the UK.', entry_ids: ['uk.visa.when'] }], tests: [{ test: 'IELTS', note: 'Your 6.0 is close to typical B2 requirements; check each university.', entry_ids: ['uk.english.level'] }], next_steps: ['Shortlist 5 universities'] };
  if (role.includes('Homework helper')) return { hint: 'Look at the time words in each sentence: "last weekend" tells you which tense to use.', check_question: 'Which tense do we use with "last weekend"?', topic: 'past simple' };
  if (role.includes('Pronunciation coach')) return { tips: [{ word: 'think', tip: 'Put the tip of your tongue between your teeth for "th".' }], encouragement: 'Nearly there — once more!' };
  if (role.includes('Duel quiz maker')) return { questions: Array.from({ length: 12 }, (_, n) => ({ prompt: `Choose the right word (${n + 1}): I need to ___ my passport at the desk.`, options: [`show${n}`, `shows${n}`, `showing${n}`, `shown${n}`], answer_index: 0 })) };
  if (role.includes('Daily brief')) return { based_on: 'Present simple agreement from yesterday.', questions: [q('She ___ coffee every morning.', ['drink', 'drinks', 'drinking']), q('He ___ to the gym on Fridays.', ['go', 'goes', 'going']), q('My friend ___ English well.', ['speak', 'speaks', 'speaking'])], word: { word: 'itinerary', meaning_en: 'a travel plan', meaning_uz: 'sayohat rejasi', meaning_ru: 'маршрут', example: 'Our itinerary includes Bukhara.' }, tip: 'Read your answers aloud once.' };
  if (role.includes('Parent brief')) return { effort: 'Aziza practised on 3 days this week.', progress: 'Her reading improved; her last IELTS mock was 6.0.', praise: 'She finished a full reading set.', watch: 'Writing practice was missing this week.', suggestion: 'Ask her to try one writing task.' };
  if (role.includes('IELTS Speaking examiner')) return { bands: { fluency: 6, lexical: 6.5, grammar: 6, pronunciation: 6 }, comments: { fluency: 'Some long pauses in Part 2.', lexical: 'Good topic words.', grammar: 'Mostly simple forms.', pronunciation: 'Generally clear.' }, priorities: [{ criterion: 'fluency', text: 'Extend Part 1 answers with a reason.', practice: 'speaking' }, { criterion: 'grammar', text: 'Use more past forms in Part 2.', practice: 'grammar' }, { criterion: 'lexical', text: 'Learn 5 topic phrases.', practice: 'vocabulary' }], fixes: [], evidence: {} };
  if (role.includes('Multilevel speaking examiner')) return { q1_3: { score: 4, comment: 'All on topic.' }, q4_6: { score: 3, comment: 'Describe more details.' }, q7: { score: 3, comment: 'Develop your ideas.' }, q8: { score: 3, comment: 'Cover both sides.' }, priorities: [], fixes: [] };
  if (role.includes('Speaking coach')) return { goals: [{ id: 'details', achieved: true, note: 'Good details.' }], fixes: [], phrases: ['What I like most is…'], summary: 'Nice conversation. Next time ask your partner a question.', score: 72 };
  if (role.includes('Interview coach')) return { criteria: ['clarity', 'relevance', 'specificity', 'confidence', 'language'].map((key, index) => ({ key, score: [4, 4, 3, 3, 4][index], comment: 'Solid answer; add one concrete result.', evidence: [] })), best: null, improve: [], next_steps: ['Use the STAR method'] };
  if (role.includes('Writing coach') || role.includes('Partner') || role.includes(',')) return { reply: 'That is interesting. Could you tell me a bit more?', goals_met: [], tip: null, end: false };
  return {};
}
const ANSWER = 'Good question. Your last **Listening** results show Section 3 cost you the most.\n\n1. Read the options and underline what each *claims*.\n2. Listen for turns like "but actually".\n\nTry one Section 3 set today and tell me your score.';
function fakeModel(request: Request, body: { messages?: { role: string; content: unknown }[] }): Response {
  const stream = request.headers.get('accept')?.includes('text/event-stream');
  const text = (value: unknown) => (typeof value === 'string' ? value : Array.isArray(value) ? value.map((part) => (part as { text?: string }).text ?? '').join(' ') : '');
  const system = text(body.messages?.find((entry) => entry.role === 'system')?.content), user = text(body.messages?.at(-1)?.content);
  const wantsJson = /JSON Schema|Return strict JSON|Return ONLY/.test(system);
  const content = wantsJson ? JSON.stringify(canned(system, user)) : system.includes('parent asks about their child') ? 'Aziza practised reading this week and her last IELTS mock was 6.0. A full mock would show whether she is ready for March.' : ANSWER;
  if (!stream) return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 800, completion_tokens: 200 } }), { headers: { 'Content-Type': 'application/json' } });
  const pieces = content.match(/.{1,14}/gs) ?? [content];
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of pieces) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)); await new Promise((resolve) => setTimeout(resolve, 30)); }
      controller.enqueue(new TextEncoder().encode('data: {"choices":[],"usage":{"prompt_tokens":800,"completion_tokens":120}}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}

const gateway = createGateway({
  registry: () => memory.repository.registry(), settings: () => memory.repository.settings(),
  takeCall: (input) => memory.repository.takeCall(input), record: (rows) => { void memory.repository.recordCalls(rows); },
  env: (name) => (name === 'OPENROUTER_API_KEY' ? 'dev-key' : undefined),
  fetch: async (input, init) => { const request = new Request(input, init); return fakeModel(request, await request.clone().json().catch(() => ({}))); },
  now: () => new Date(), breaker: new CircuitBreaker(),
});
const tokenProducts = new Map(Object.entries(users).map(([token, user]) => [token, 'products' in user ? user.products : []]));
const plans = createPlanResolver({ productIds: { plus: PLUS, family: FAMILY, centre: CENTRE }, betaUserIds: new Set(), repo: memory.repository, isAdmin: () => Promise.resolve(false), now: () => new Date(), accessEffective: (token) => Promise.resolve(tokenProducts.get(token) ?? []) });
const profile = { projection: { schema_version: 1 }, cefr_estimate: 'B1', target_cefr: 'B2', learner_goals: ['IELTS 7.0'], skill_scores: { listening: 61, reading: 70 }, outcomes: [{ overall_band: '6.5', overall_score: 6.5, computed_at: ago(9) }], recent_error_clusters: [{ skill_key: 'listening', error_type: 'Multiple choice with two options mentioned' }] };
const prediction = { predictions: [{ exam_type: 'ielts', current_score: 6, predicted_next: 6.5, confidence_low: 5.5, confidence_high: 7, trend: 'up', data_points: 4 }], practice_signals: {} };
const homework = { assignments: [{ id: '40000000-0000-4000-8000-000000000001', title: 'Past simple: my weekend', description: 'Write five sentences about last weekend using the past simple.', assignment_type: 'writing', status: 'active', due_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), submission: null }] };
const review = { units: [{ id: '50000000-0000-4000-8000-000000000001', part_name: 'Reading Passage 1', data: { question: 'According to the writer, why did the city build new parks?', options: [{ label: 'A', text: 'to attract tourists' }, { label: 'B', text: 'to reduce summer heat' }, { label: 'C', text: 'to sell land' }] }, answer: { value: 'A' }, correct: { value: 'B' }, is_correct: false }] };
const handle = createSchoodAIHandler({
  repository: memory.repository, gateway, plans, isAdmin: () => Promise.resolve(false),
  callFunction: (name, _path, token, init) => {
    if (name === 'learning-profile-v3' && token !== 'dev-free') return Promise.resolve({ status: 200, data: profile });
    if (name === 'score-prediction' && token === 'dev-plus') return Promise.resolve({ status: 200, data: prediction });
    if (name === 'academy' && init.query?.action === 'student_assignments') return Promise.resolve({ status: 200, data: token === 'dev-student' ? homework : { assignments: [] } });
    if (name === 'review-session') return Promise.resolve({ status: 200, data: review });
    return Promise.resolve({ status: 404, data: null });
  },
  adminGate: () => Promise.resolve({ ok: false, status: 403, code: 'forbidden' }),
}, { allowedOrigins: ORIGINS, serviceSecret: null });

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
  console.log(`Schood AI learner dev stack on http://localhost:${PORT} for ${ORIGINS.join(', ')}`);
}
