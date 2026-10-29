import { ID, equal, ok, personal } from '../fixture.test.ts';
import { ACADEMY, BANK, TENANT, promptOf, reply, teacherFixture } from './test-kit.ts';

// The teacher test from docs/product/44_SCHOOD_AI.md, end to end against the memory
// repository with a fake model: a teacher generates an IELTS Reading set at B2 with a
// checked key, edits it, prints it with their logo, plays it as a Live Quiz, and sends
// it to an Academy group as homework after Approve & run. Plus the job's edges.

const PASSAGE = [
  'Bees on the rooftops',
  '',
  'A few years ago, a group of office workers in a large city began keeping bees on the rooftops of their building. At first their neighbours worried about stings, but the hives proved calm and productive.',
  '',
  'The workers now collect around forty kilograms of honey each summer. They sell it in the building\'s café and give the money to a local school garden. Some of the wax is used to make candles.',
  '',
  'Scientists say city bees can be healthier than country bees, because parks and balconies offer many kinds of flowers. However, they warn that too many hives in one area may leave too little food for wild pollinators.',
].join('\n');

const QUESTIONS = { sets: [
  { instructions: 'Do the following statements agree with the information in the passage? Write TRUE, FALSE or NOT GIVEN.', exam_type: 'question_true_false_not_given', questions: [
    { type: 'tfng', prompt: 'The bees were first kept by office workers.', answer: 'TRUE', explanation: 'Paragraph 1.' },
    { type: 'tfng', prompt: 'The neighbours asked the workers to remove the hives.', answer: 'NOT GIVEN', explanation: 'The passage only says they worried.' },
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
// The checker agrees with every key except question 2 (it reads "worried" as a refusal).
const SOLVED = { answers: [
  { id: 'q1', answer: ['T'] }, { id: 'q2', answer: ['F'], reason: 'Worried neighbours suggests they objected.' }, { id: 'q3', answer: ['T'] }, { id: 'q4', answer: ['F'] },
  { id: 'q5', answer: ['F'] }, { id: 'q6', answer: ['rooftops'] }, { id: 'q7', answer: ['honey'] }, { id: 'q8', answer: ['candles'] }, { id: 'q9', answer: ['pollinators'] },
  { id: 'q10', answer: ['B'] }, { id: 'q11', answer: ['A'] }, { id: 'q12', answer: ['C'] }, { id: 'q13', answer: ['B'] },
] };

function fakeModel(calls: string[]) {
  return async (request: Request) => {
    const { system, user } = await promptOf(request);
    if (system.includes('independent checker')) { calls.push('solve'); return reply(SOLVED); }
    if (user.includes('Return {"title": "...", "text": "..."}')) { calls.push('source'); return reply({ title: 'Bees on the rooftops', text: PASSAGE }); }
    if (user.includes('questions on the text')) { calls.push('questions'); return reply(QUESTIONS); }
    calls.push('other');
    return reply({ blocks: [] });
  };
}

const T = 'tok-teacher-plan';
const brief = { kind: 'ielts_reading', level: 'B2', topic: 'Urban beekeeping', instruction_language: 'en', length: 'standard' };

Deno.test('teacher test: IELTS Reading B2 with a checked key → edit → print with logo → Live Quiz → Homework OS after Approve & run', async () => {
  const f = teacherFixture();
  try {
    const calls: string[] = [];
    f.setProvider(fakeModel(calls));
    const ws = await personal(f, T);

    // 1. Generate, aimed at the group's weak spots read from Academy with the teacher's token.
    const created = await f.json('POST', 'teacher/materials', { token: T, headers: { 'idempotency-key': 'gen-bees-0001' }, body: { brief, academy: { academy_id: ACADEMY, classroom_id: 'cls-5b', classroom_name: '5B IELTS' } } });
    equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.material.id as string;
    equal(created.body.material.status, 'generating');
    equal(created.body.material.progress.done, 1, 'the first step ran at once');
    equal(created.body.material.focus.tags, ['tfng_not_given', 'word_limit']);
    ok(f.remote.some((call) => call.name === 'academy-learning' && call.token === T), 'weak spots read with the teacher\'s own token');
    // A double click makes one job.
    const again = await f.json('POST', 'teacher/materials', { token: T, headers: { 'idempotency-key': 'gen-bees-0001' }, body: { brief } });
    equal(again.body.material.id, id, 'same request key, same job');

    let material = created.body.material;
    for (let guard = 0; guard < 6 && material.status !== 'ready'; guard++) material = (await f.json('POST', 'teacher/material-step', { token: T, body: { id } })).body.material;
    equal(material.status, 'ready');
    equal(calls, ['source', 'questions', 'solve'], 'one model call per step; the key is solved without the key');
    // The weak spots reached the model as data.
    const charges = f.memory.ledger.filter((row) => row.workspaceId === ws && row.kind === 'charge');
    equal(charges.map((row) => row.delta), [-15], 'one charge of exactly the exam-set price for every call of the job');

    // 2. The checked key: deterministic checks pass, the checker disagrees on question 2.
    equal(material.material.blocks.map((block: { type: string }) => block.type), ['text', 'questions', 'questions', 'questions']);
    equal(material.verification.checks.errors, 0, JSON.stringify(material.verification.checks.issues));
    equal(material.verification.solver.disagreements.map((entry: { number: number; key: string[]; solver: string[] }) => [entry.number, entry.key, entry.solver]), [[2, ['NG'], ['F']]]);
    equal(material.verification.clean, false);
    equal(material.derived.playable, 9, 'TFNG and MCQ questions are playable');

    // 3. The teacher edits: agrees with the checker on question 2 and renames it.
    const edited = structuredClone(material.material);
    edited.title = 'Bees on the rooftops (5B)';
    edited.blocks[1].questions[1].answer = ['F'];
    const conflict = await f.json('PATCH', 'teacher/material', { token: T, body: { id, material: edited, updated_at: '2020-01-01T00:00:00.000Z' } });
    equal(conflict.body.code, 'edit_conflict', 'a stale edit is refused');
    const saved = await f.json('PATCH', 'teacher/material', { token: T, body: { id, material: edited, updated_at: material.updated_at } });
    equal(saved.status, 200, JSON.stringify(saved.body));
    equal(saved.body.material.verification.solver.disagreements, [], 'the checker now agrees');
    equal(saved.body.material.verification.clean, true);
    equal(saved.body.material.title, 'Bees on the rooftops (5B)');

    // Approve & save: the material becomes a page of its kind in the library.
    const approved = await f.json('POST', 'teacher/material-decide', { token: T, body: { id, decision: 'approve' } });
    equal(approved.status, 200, JSON.stringify(approved.body));
    const pageId = approved.body.page_id as string;
    equal((await f.json('POST', 'teacher/material-decide', { token: T, body: { id, decision: 'approve' } })).body.page_id, pageId, 'a second click shows the same page');
    const page = (await f.json('GET', 'core/page', { token: T, query: { id: pageId } })).body.page;
    equal([page.kind, page.status, page.folder, page.source_generation_id], ['ielts_reading', 'approved', 'Exam practice/IELTS reading/B2', id]);
    ok(page.body.includes('## Answer key') && page.body.includes('2. FALSE'), 'the page document is the teacher copy with the edited key');
    equal((await f.json('PATCH', 'teacher/material', { token: T, body: { id, material: edited } })).body.code, 'not_editable', 'an approved material is edited in the library');
    // An edit in the library is validated against the kind's schema.
    equal((await f.json('PATCH', 'core/page', { token: T, body: { id: pageId, expected_revision: page.revision, material: { ...edited, kind: 'quiz' } } })).status, 400);
    const retitled = await f.json('PATCH', 'core/page', { token: T, body: { id: pageId, expected_revision: page.revision, title: 'Bees on the rooftops (5B)', material: edited } });
    equal(retitled.status, 200, JSON.stringify(retitled.body));
    // A draft page does not reach students.
    const draftPage = await f.json('POST', 'core/pages', { token: T, body: { kind: 'ielts_reading', title: 'Draft copy', material: edited, status: 'draft' } });
    equal((await f.json('POST', 'teacher/export', { token: T, body: { page_id: draftPage.body.page.id, to: 'handout' } })).body.code, 'not_approved');

    // 4. Print with the teacher's logo: the logo is the workspace branding the print view reads.
    const logo = await f.json('PATCH', 'core/settings', { token: T, body: { branding: { logo_url: 'https://cdn.example.com/aziza-logo.png' } } });
    equal(logo.status, 200);
    equal((await f.json('GET', 'core/me', { token: T })).body.workspace.branding.logo_url, 'https://cdn.example.com/aziza-logo.png');
    equal((await f.json('POST', 'teacher/export', { token: T, body: { page_id: pageId, to: 'print' } })).body.ok, true);
    const telegram = await f.json('POST', 'teacher/export', { token: T, body: { page_id: pageId, to: 'telegram' } });
    ok(telegram.body.messages.length >= 1 && telegram.body.messages.every((message: string) => message.length <= 4096) && !telegram.body.messages.join().includes('✓'), 'Telegram text without the key');

    // 5. Live Quiz: no AI call; students join with the code; live leaderboard; results saved.
    const before = calls.length;
    const quiz = await f.json('POST', 'teacher/quiz', { token: T, body: { page_id: pageId, seconds: 20, class_label: '5B IELTS' } });
    equal(quiz.status, 200, JSON.stringify(quiz.body));
    const code = quiz.body.quiz.code as string;
    ok(/^[0-9]{6}$/.test(code), 'six-digit code');
    equal(quiz.body.quiz.total, 9);
    const join = await f.json('POST', 'teacher/quiz-join', { token: 'tok-free', body: { code, nickname: 'Aziz' } });
    equal(join.status, 200, 'a student needs no plan to play');
    const session = join.body.joined.session_id as string, playerToken = join.body.joined.token as string;
    equal((await f.json('POST', 'teacher/quiz-join', { token: 'tok-student', body: { code, nickname: 'aziz' } })).body.code, 'nickname_taken');
    await f.json('POST', 'teacher/quiz-join', { token: 'tok-student', body: { code, nickname: 'Malika' } });
    equal((await f.json('POST', 'teacher/quiz-control', { token: T, body: { id: quiz.body.quiz.id, command: 'start' } })).body.quiz.status, 'question');
    const phone = await f.json('POST', 'teacher/quiz-play', { token: 'tok-free', body: { session_id: session, token: playerToken } });
    equal(phone.body.play.question.answer, undefined, 'the phone never sees the answer while the question is open');
    f.advance(3000);
    equal((await f.json('POST', 'teacher/quiz-answer', { token: 'tok-free', body: { session_id: session, token: playerToken, index: 0, choice: 'T' } })).status, 200);
    equal((await f.json('POST', 'teacher/quiz-answer', { token: 'tok-free', body: { session_id: session, token: playerToken, index: 0, choice: 'F' } })).body.code, 'already_answered');
    await f.json('POST', 'teacher/quiz-answer', { token: 'tok-student', body: { session_id: session, index: 0, choice: 'F' } });
    const host = await f.json('GET', 'teacher/quiz', { token: T, query: { id: quiz.body.quiz.id } });
    equal([host.body.quiz.answered, host.body.quiz.counts], [2, null], 'counts stay hidden until the reveal');
    const revealed = await f.json('POST', 'teacher/quiz-control', { token: T, body: { id: quiz.body.quiz.id, command: 'reveal' } });
    equal(revealed.body.quiz.counts, { T: 1, F: 1 });
    equal(revealed.body.quiz.leaderboard[0].nickname, 'Aziz');
    const after = await f.json('POST', 'teacher/quiz-play', { token: 'tok-free', body: { session_id: session, token: playerToken } });
    equal([after.body.play.my_answer.correct, after.body.play.me.rank], [true, 1]);
    ok(after.body.play.my_answer.points > 900, 'fast and right scores high');
    f.advance(1000);
    await f.json('POST', 'teacher/quiz-control', { token: T, body: { id: quiz.body.quiz.id, command: 'finish' } });
    const results = await f.json('GET', 'teacher/quiz-results', { token: T, query: { id: quiz.body.quiz.id } });
    equal(results.body.quiz.class_label, '5B IELTS');
    equal(results.body.players.map((player: { nickname: string; correct: number }) => [player.nickname, player.correct]), [['Aziz', 1], ['Malika', 0]]);
    equal(calls.length, before, 'the Live Quiz made no model call');
    await f.settle();
    ok(f.memory.learning.some((event) => event.userId === ID.free && event.kind === 'check_passed' && event.feature === 'T10'), 'a checked answer is a learning event for the student');

    // 6. Homework OS: proposed with the exact payload, run only on approval, with the teacher's token.
    const groups = await f.json('GET', 'teacher/academy-groups', { token: T });
    equal(groups.body.groups.map((group: { name: string }) => group.name), ['5B IELTS'], 'inactive classrooms are left out');
    const proposed = await f.json('POST', 'teacher/export', { token: T, body: { page_id: pageId, to: 'homework', academy_id: ACADEMY, classroom_id: 'cls-5b', due_at: '2026-11-06T18:00:00.000Z', instructions: 'Do it in 60 minutes.' } });
    equal(proposed.status, 200, JSON.stringify(proposed.body));
    equal([proposed.body.action.kind, proposed.body.action.status, proposed.body.action.can_approve], ['assign_homework', 'pending', true]);
    equal(f.assignments.length, 0, 'nothing is assigned before Approve & run');
    ok(proposed.body.action.display.description.includes('Do it in 60 minutes.') && proposed.body.action.display.link.startsWith('https://ai.schood.online/handout/'), 'the card shows what will be sent');
    const run = await f.json('POST', 'core/actions', { token: T, body: { id: proposed.body.action.id, decision: 'approve' } });
    equal(run.body.action.status, 'done', JSON.stringify(run.body));
    equal(run.body.action.result.assignment_id, 'asg-1');
    equal(f.assignments.length, 1);
    const sent = f.assignments[0] as Record<string, unknown>;
    equal([sent.token, sent.classroom_id, sent.title, sent.due_at], [T, 'cls-5b', 'Bees on the rooftops (5B)', '2026-11-06T18:00:00.000Z']);
    ok(String(sent.description).length <= 4000 && String(sent.description).includes('rooftops') && !String(sent.description).includes('NOT GIVEN ✓'), 'the student version, within Homework OS\'s limit');
    equal((sent.metadata as Record<string, unknown>).ai_hints_only, true);
    await f.json('POST', 'core/actions', { token: T, body: { id: proposed.body.action.id, decision: 'approve' } });
    equal(f.assignments.length, 1, 'a second click never assigns twice');

    // The handout link opens the student version for a signed-in student.
    const handoutToken = String(proposed.body.action.display.link).split('/handout/')[1];
    const handout = await f.json('GET', 'teacher/handout', { token: 'tok-student', query: { token: handoutToken } });
    equal(handout.status, 200);
    ok(!JSON.stringify(handout.body).includes('"answer":["') && !JSON.stringify(handout.body).includes('explanation'), 'no keys in the handout');
    equal(handout.body.workspace.branding.logo_url, 'https://cdn.example.com/aziza-logo.png');

    // 7. Assessment Cloud draft items, after Approve & run, each created once.
    const banks = await f.json('GET', 'teacher/assessment-banks', { token: T });
    equal(banks.body.tenants[0].banks[0].id, BANK);
    const items = await f.json('POST', 'teacher/export', { token: T, body: { page_id: pageId, to: 'assessment', tenant_id: TENANT, bank_id: BANK } });
    equal(items.body.action.display.items, '13');
    const exported = await f.json('POST', 'core/actions', { token: T, body: { id: items.body.action.id, decision: 'approve' } });
    equal(exported.body.action.result, { created: 13, status: 'draft', bank: 'IELTS Reading bank' });
    ok(f.remote.filter((call) => call.path === '/commands').every((call) => call.token === T && /^schood-ai-/.test(call.init.headers?.['Idempotency-Key'] ?? '')), 'each item has its own idempotency key and the teacher\'s token');
    equal(f.items.length, 13);
    equal(f.memory.ledger.filter((row) => row.workspaceId === ws && row.kind === 'charge').length, 1, 'exports and the game cost nothing');
  } finally {
    f.reset();
  }
});

Deno.test('materials: no plan, no AI; failures refund; Academy down still makes the material', async () => {
  const f = teacherFixture({ academy: 'down' });
  try {
    let calls = 0;
    f.setProvider(() => { calls++; return reply({ title: 'x', text: PASSAGE }); });
    const free = await f.json('POST', 'teacher/materials', { token: 'tok-free', body: { brief } });
    equal([free.status, free.body.code], [402, 'plan_required']);
    equal(calls, 0, 'a free user never reaches a model');
    // A learner plan does not include the Studio.
    equal((await f.json('POST', 'teacher/materials', { token: 'tok-plus', body: { brief } })).body.code, 'plan_required');

    const ws = await personal(f, T);
    const created = await f.json('POST', 'teacher/materials', { token: T, body: { brief, academy: { academy_id: ACADEMY, classroom_id: 'cls-5b' } } });
    equal(created.body.material.focus_unavailable, true, 'Academy unreachable: made without the group\'s data');
    // The questions step fails on every model attempt: the whole job is refunded.
    f.setProvider(() => new Response('{"error":"down"}', { status: 500 }));
    const failed = await f.json('POST', 'teacher/material-step', { token: T, body: { id: created.body.material.id } });
    equal(failed.body.code, 'ai_failed');
    const job = await f.json('GET', 'teacher/material', { token: T, query: { id: created.body.material.id } });
    equal(job.body.material.status, 'failed');
    const net = f.memory.ledger.filter((row) => row.workspaceId === ws && (row.kind === 'charge' || row.kind === 'refund')).reduce((sum, row) => sum + row.delta, 0);
    equal(net, 0, 'every credit of the failed job came back');

    // Bad briefs are refused before anything is charged.
    equal((await f.json('POST', 'teacher/materials', { token: T, body: { brief: { ...brief, kind: 'toefl_2026', exam: { format: 'toefl_2026', section: 'reading', task: 'write_email' } } } })).body.code, 'invalid_brief');
    equal((await f.json('POST', 'teacher/materials', { token: T, body: { brief: { ...brief, level: 'Z9' } } })).body.code, 'invalid_request');
    // Someone else's material looks like no material.
    equal((await f.json('GET', 'teacher/material', { token: 'tok-beta', query: { id: created.body.material.id } })).status, 404);
  } finally {
    f.reset();
  }
});

Deno.test('three-level variants cost +10 and come back as support and stretch versions', async () => {
  const f = teacherFixture();
  try {
    const seen: string[] = [];
    f.setProvider(async (request) => {
      const { system, user } = await promptOf(request);
      if (system.includes('independent checker')) return reply({ answers: [{ id: 'q1', answer: ['B'] }, { id: 'sq1', answer: ['B'] }, { id: 'xq1', answer: ['B'] }] });
      seen.push(user.includes('SUPPORT version') ? 'support' : user.includes('STRETCH version') ? 'stretch' : 'core');
      return reply({ title: 'Food words', blocks: [
        { type: 'words', words: [{ term: 'recipe', meaning: 'instructions for cooking' }] },
        { type: 'questions', instructions: 'Choose.', questions: Array.from({ length: 8 }, (_, index) => ({ type: 'mcq', prompt: `Which word means instructions for cooking (${index + 1})?`, options: ['menu', 'recipe', 'plate', 'oven'], answer: 'B' })) },
      ] });
    });
    const ws = await personal(f, T);
    const created = await f.json('POST', 'teacher/materials', { token: T, body: { brief: { kind: 'vocabulary', level: 'B1', topic: 'Food', instruction_language: 'uz', length: 'short', variants: true } } });
    let material = created.body.material;
    for (let guard = 0; guard < 8 && material.status !== 'ready'; guard++) material = (await f.json('POST', 'teacher/material-step', { token: T, body: { id: material.id } })).body.material;
    equal(material.status, 'ready');
    equal(seen, ['core', 'support', 'stretch']);
    equal(material.material.variants.map((variant: { label: string; level: string }) => [variant.label, variant.level]), [['support', 'A2'], ['stretch', 'B2']]);
    equal(f.memory.ledger.filter((row) => row.workspaceId === ws && row.kind === 'charge').map((row) => row.delta), [-20], 'material + three levels');
    ok(material.material.variants[0].blocks.every((block: { id: string }) => block.id.startsWith('s')), 'version ids never collide');
  } finally {
    f.reset();
  }
});

Deno.test('textbook to lesson reads the page photo first, then writes from it', async () => {
  const f = teacherFixture();
  try {
    const steps: string[] = [];
    f.setProvider(async (request) => {
      const { system, user, images } = await promptOf(request);
      if (system.includes('independent checker')) return reply({ answers: [{ id: 'q1', answer: ['went'] }] });
      if (images) { steps.push(`page:${images}`); return reply({ text: 'Unit 4. Last weekend. I went to the bazaar with my grandmother.', topic: 'Past simple', vocabulary: ['bazaar'], grammar: 'past simple' }); }
      steps.push(user.includes('Textbook page') ? 'lesson-from-page' : 'lesson');
      return reply({ title: 'Unit 4 lesson', blocks: [
        { type: 'questions', instructions: 'Complete with the past simple.', questions: [{ type: 'gap', prompt: 'I ____ to the bazaar.', answer: 'went' }] },
        { type: 'cards', cards: [{ title: 'Your weekend', prompt: 'Tell a partner about last weekend.', points: ['where', 'who'] }] },
      ] });
    });
    const image = `data:image/png;base64,${'iVBORw0KGgo'.repeat(20)}`;
    const missing = await f.json('POST', 'teacher/materials', { token: T, body: { brief: { kind: 'textbook_lesson', level: 'A2', topic: 'Unit 4', instruction_language: 'ru', length: 'short', questions: 1 } } });
    equal(missing.body.code, 'invalid_request', 'a page photo or its text is needed');
    const created = await f.json('POST', 'teacher/materials', { token: T, body: { brief: { kind: 'textbook_lesson', level: 'A2', topic: 'Unit 4', instruction_language: 'ru', length: 'short', questions: 1 }, images: [image] } });
    equal(created.status, 200, JSON.stringify(created.body));
    let material = created.body.material;
    for (let guard = 0; guard < 6 && material.status !== 'ready'; guard++) material = (await f.json('POST', 'teacher/material-step', { token: T, body: { id: material.id } })).body.material;
    equal(steps, ['page:1', 'lesson-from-page'], 'the photo is read once, then the lesson is written from the page text');
    equal(material.status, 'ready');
    equal(material.verification.checks.errors, 0, JSON.stringify(material.verification.checks.issues));
  } finally {
    f.reset();
  }
});
