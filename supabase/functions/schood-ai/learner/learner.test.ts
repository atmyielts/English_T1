import { equal, ID, learnerFixture, ok } from './testkit.ts';

// Learner routes against the memory repository with a fake model: plans and
// consent first, exact credits, refunds, keys kept on the server, quotes checked
// against the learner's own words, and verified learning events only after real acts.

const similar = (prompt: string, answer = 1) => ({ prompt, options: ['go', 'goes', 'going', 'gone'], answer_index: answer, explanation: 'Third person singular takes -s.' });

Deno.test('learner tools need a plan first, then the age step; under-18s need a guardian', async () => {
  const f = learnerFixture();
  const free = await f.json('POST', 'learner/explain', { token: 'tok-free', body: { question: 'She ___ to school.' } });
  equal([free.status, free.body.code, free.body.plans], [402, 'plan_required', ['plus']]);
  const noConsent = await f.json('POST', 'learner/explain', { body: { question: 'She ___ to school.' } });
  equal([noConsent.status, noConsent.body.code, noConsent.body.state], [403, 'consent_required', 'required']);
  equal(f.upstream.length, 0, 'no model call before the gates');
  equal((await f.json('POST', 'learner/consent', { body: { age_band: '13_17', accept: true } })).body.consent.state, 'guardian_required');
  equal((await f.json('POST', 'learner/consent', { body: { age_band: 'under_13', accept: true, guardian_confirmed: true } })).body.consent.state, 'parent_link_required', 'under 13 needs a linked parent');
  equal((await f.json('POST', 'learner/consent', { body: { age_band: '13_17', accept: true, guardian_confirmed: true } })).body.consent.state, 'ok');
  equal((await f.json('DELETE', 'learner/consent')).body.consent.state, 'required', 'withdrawn');
  equal((await f.json('POST', 'learner/consent', { body: { age_band: 'adult' } })).status, 400, 'must accept');
  equal((await f.adult()).consent.state, 'ok');
});

Deno.test('L2 explains a mistake, keeps the new keys on the server and checks answers once', async () => {
  const f = learnerFixture();
  await f.adult();
  const before = await f.balance();
  f.reply({ correct_answer: 'goes', why_wrong: 'You chose "go", but she is third person.', rule: 'Present simple: he/she/it + verb-s.', tip: 'Underline the subject.', similar: [similar('He ___ home.'), { prompt: 'Bad', options: ['a', 'a'], answer_index: 0, explanation: 'x' }, similar('It ___ fast.', 1)] });
  const out = await f.json('POST', 'learner/explain', { body: { question: 'She ___ to school every day.', my_answer: 'go', options: ['go', 'goes'], exam: 'general' } });
  equal([out.status, out.body.credits, before - await f.balance()], [200, 2, 2], 'exactly the L2 price');
  equal(out.body.explanation.similar.length, 2, 'an item with duplicate options is dropped');
  ok(!JSON.stringify(out.body).includes('answer_index'), 'no key before an answer');
  ok((await f.prompt()).includes('<user_message>'), 'the pasted question is wrapped as data');
  const wrong = await f.json('POST', 'learner/explain-answer', { body: { id: out.body.explanation.id, item: 0, choice: 0 } });
  equal([wrong.body.correct, wrong.body.answer_index], [false, 1]);
  const again = await f.json('POST', 'learner/explain-answer', { body: { id: out.body.explanation.id, item: 0, choice: 1 } });
  equal(again.body.correct, false, 'the first answer stands');
  equal((await f.json('POST', 'learner/explain-answer', { body: { id: out.body.explanation.id, item: 1, choice: 1 } })).body.correct, true);
  await f.settle();
  equal(f.events().map((event) => [event.kind, event.verified, event.verifiedMinutes]), [['check_failed', false, 0], ['check_passed', true, 1]]);
  equal((await f.json('POST', 'learner/explain-answer', { token: 'tok-beta', body: { id: out.body.explanation.id, item: 1, choice: 1 } })).status, 403, 'consent first, and then only your own');
  // A failed model call refunds.
  f.reply('not json at all', 'still not json');
  const failed = await f.json('POST', 'learner/explain', { body: { question: 'Why is this wrong?' } });
  equal([failed.status, failed.body.code, before - await f.balance()], [502, 'ai_failed', 2], 'refunded');
});

Deno.test('L2 deep links load the question from the simulator review with the learner token', async () => {
  const f = learnerFixture();
  await f.adult();
  const session = '11111111-1111-4111-8111-111111111111', item = '22222222-2222-4222-8222-222222222222';
  f.functions['review-session'] = ({ token, query }) => (token === 'tok-plus' && query.session_id === session ? { units: [{ id: item, part_name: 'Reading Passage 1', data: { question: 'The writer suggests that <b>cities</b>…', options: [{ label: 'A', text: 'grow slowly' }, { label: 'B', text: 'need parks' }] }, answer: { value: 'A' }, correct: { value: 'B' }, is_correct: false }] } : undefined);
  const found = await f.json('GET', 'learner/explain-source', { query: { source: 'ielts', session, item } });
  equal([found.body.found, found.body.exam, found.body.item.question, found.body.item.options, found.body.item.my_answer, found.body.item.correct_answer], [true, 'ielts', 'The writer suggests that cities …', ['A. grow slowly', 'B. need parks'], 'A', 'B']);
  equal((await f.json('GET', 'learner/explain-source', { query: { source: 'english-reading', session, item } })).body.found, false, 'other apps: paste the question');
  equal((await f.json('GET', 'learner/explain-source', { query: { source: 'IELTS<script>' } })).status, 400);
});

Deno.test('L3 writing feedback uses the exam rubric, keeps only real quotes, and a model answer is labelled', async () => {
  const f = learnerFixture();
  await f.adult();
  const draft = 'Nowadays many people thinks that technology make our life easier. In my opinion it have both advantages and disadvantages. Firstly, phones help us to communicate with family who live far away. However, people spend too much time online and they forget to talk face to face.';
  f.reply({ overall: 5.7, cefr: 'B1', criteria: [{ key: 'TR', score: 5.8, comment: 'Position is clear.' }, { key: 'CC', score: 6, comment: 'Logical.' }, { key: 'LR', score: 5.5, comment: 'Basic.' }, { key: 'GRA', score: 5, comment: 'Agreement errors.' }],
    summary: 'A clear start.', strengths: ['Clear opinion'], line_comments: [{ quote: 'many people thinks', issue: 'Agreement', suggestion: 'many people think', category: 'grammar' }, { quote: 'words I never wrote', issue: 'x', suggestion: 'y' }],
    rewrite: { original: 'In my opinion it have both advantages and disadvantages.', improved: 'In my view, it has clear benefits and drawbacks.', why: 'Agreement and range.' }, next_steps: ['Practise subject-verb agreement'] });
  const out = await f.json('POST', 'learner/writing-feedback', { body: { exam: 'ielts_task2', task_prompt: 'Technology makes life easier. Discuss.', draft } });
  const feedback = out.body.writing.feedback;
  equal([out.status, out.body.credits, feedback.overall, feedback.criteria.map((c: { score: number }) => c.score)], [200, 5, 5.5, [6, 6, 5.5, 5]], 'half bands');
  equal(feedback.line_comments.map((c: { quote: string }) => c.quote), ['many people thinks'], 'invented quotes dropped');
  ok((await f.prompt()).includes('Task Response (TR)'), 'the IELTS rubric of grade-writing-v2');
  f.reply({ text: 'Technology has transformed daily life in ways that are hard to ignore. '.repeat(3), notes: ['Clear position'] });
  const model = await f.json('POST', 'learner/writing-model', { body: { id: out.body.writing.id } });
  equal([model.body.credits, model.body.writing.model_answer.label], [3, 'model']);
  equal((await f.json('POST', 'learner/writing-model', { body: { id: out.body.writing.id } })).body.credits, 0, 'shown again for free');
  equal((await f.json('POST', 'learner/writing-feedback', { body: { exam: 'general', draft: 'Too short.' } })).body.code, 'too_short');
  await f.settle();
  equal(f.events().map((event) => [event.kind, event.feature, event.score]), [['drill_finished', 'L3', 5.5]]);
  f.reply({ rungs: [{ level: 'x', text: 'Band six version of the essay text here.', changes: [] }, { level: 'y', text: 'Band seven version of the essay text here.', changes: [{ what: 'linking', why: 'cohesion' }] }, { level: 'z', text: 'Band eight version of the essay text here.', changes: [] }] });
  const ladder = await f.json('POST', 'learner/essay-ladder', { body: { id: out.body.writing.id } });
  equal([ladder.body.credits, ladder.body.ladder.rungs.map((r: { level: string }) => r.level), ladder.body.ladder.rungs[0].label], [8, ['6.0', '7.0', '8.0'], 'model']);
  ok((await f.json('GET', 'learner/writing')).body.items.length === 2, 'history lists feedback and the ladder');
});

Deno.test('L3 reuses the TOEFL 2026 and Multilevel rubrics without their output instructions', async () => {
  const f = learnerFixture();
  await f.adult();
  const draft = 'Dear Professor, I am writing to ask about the deadline for our group project because two members of my team were sick last week.';
  for (const [exam, needle] of [['toefl_email', 'Write an Email'], ['multilevel_task12', 'Multilevel']] as const) {
    f.reply({ overall: 3.6, criteria: [{ key: 'x', score: 3.6, comment: 'ok' }], summary: 's', strengths: [], line_comments: [], rewrite: { original: 'no', improved: 'no', why: '' }, next_steps: [] });
    const out = await f.json('POST', 'learner/writing-feedback', { body: { exam, draft } });
    equal([out.status, out.body.writing.feedback.overall, out.body.writing.feedback.rewrite], [200, 4, null], exam);
    const prompt = await f.prompt();
    ok(prompt.includes(needle) && !prompt.includes('Return strict JSON: {\\"task11'), `${exam} rubric only`);
  }
});

Deno.test('L8 application essays give edits, never a rewritten essay', async () => {
  const f = learnerFixture();
  await f.adult();
  const essay = 'I want to study computer science because I like computers. When I was fifteen I built a small website for my school. It helped teachers share homework. I learned that I enjoy solving problems for other people. At university I hope to learn more about software. After graduation I will come back to Uzbekistan and work on education apps for children in villages.';
  const long = 'x'.repeat(390);
  f.reply({ overall: 'Promising and personal.', structure: [{ part: 'Hook', status: 'weak', comment: 'Start with the website story.' }], strengths: ['Real example'], issues: [{ issue: 'Generic opening', why: 'Many say this', fix: 'Start with a scene' }],
    line_edits: [{ quote: 'I like computers', suggestion: 'I love making things with code', why: 'specific' }, { quote: 'not in the essay', suggestion: 'x', why: 'y' }, { quote: 'It helped teachers share homework', suggestion: long, why: 'too long' }], questions: ['What problem did the website solve?'], next_draft: ['Open with the story'] });
  const out = await f.json('POST', 'learner/essay-review', { body: { kind: 'personal_statement', text: essay, word_limit: 650 } });
  equal([out.status, out.body.credits, out.body.essay.line_edits.map((e: { quote: string }) => e.quote)], [200, 8, ['I like computers']]);
  ok((await f.prompt()).includes('NEVER write the essay'), 'the rule is in the prompt');
});

Deno.test('L6 saves words that are really in the text into the existing notebook, once', async () => {
  const f = learnerFixture();
  await f.adult();
  const text = 'The council decided to postpone the festival because heavy rain had flooded the main square, and residents were reluctant to travel.';
  const word = (w: string) => ({ word: w, lemma: w, pos: 'verb', level: 'B2', definition: `meaning of ${w}`, meaning_uz: 'uz', meaning_ru: 'ru', example: `Example with ${w}.` });
  f.reply({ title: 'Festival', words: [word('postpone'), word('reluctant'), word('serendipity'), word('flooded')] });
  const out = await f.json('POST', 'learner/words', { body: { text } });
  equal([out.status, out.body.credits, out.body.list.words.map((w: { word: string }) => w.word)], [200, 2, ['postpone', 'reluctant', 'flooded']], 'invented words dropped');
  const saved = await f.json('POST', 'learner/words-save', { body: { id: out.body.list.id, indices: [0, 1] } });
  equal([saved.body.added, saved.body.already], [2, 0]);
  equal((await f.json('POST', 'learner/words-save', { body: { id: out.body.list.id, indices: [1, 2] } })).body.added, 1, 'reluctant is kept as it was');
  equal(f.learner.notebook.get(ID.plus)!.map((entry) => [entry.word, entry.meaningUz, entry.source]), [['postpone', 'uz', 'Schood AI'], ['reluctant', 'uz', 'Schood AI'], ['flooded', 'uz', 'Schood AI']]);
  // Photos need a vision model: the seed model has it; without one the call is unavailable and free.
  const photo = `data:image/jpeg;base64,${'A'.repeat(400)}`;
  f.reply({ words: [word('harbour')] });
  equal((await f.json('POST', 'learner/words', { body: { image: photo } })).body.credits, 2);
  ok(JSON.stringify(await f.upstream.at(-1)!.clone().json()).includes('image_url'), 'the photo reaches the model as an image part');
});

Deno.test('L10 graded reading keeps the key until the learner answers, then counts verified minutes', async () => {
  const f = learnerFixture();
  await f.adult();
  const textBody = 'Samarkand is one of the oldest cities in Central Asia. '.repeat(8);
  f.reply({ title: 'Samarkand', text: textBody, questions: [1, 2, 3, 4].map((n) => ({ prompt: `Question ${n}?`, options: ['a', 'b', 'c'], answer_index: n % 3, explanation: 'Because.' })), words: [{ word: 'oldest', meaning_en: 'most old', meaning_uz: 'eng qadimgi', meaning_ru: 'древнейший' }, { word: 'spaceship', meaning_en: 'x', meaning_uz: 'x', meaning_ru: 'x' }] });
  const out = await f.json('POST', 'learner/reading', { body: { topic: 'Samarkand', level: 'B1' } });
  equal([out.status, out.body.credits, out.body.reading.words.map((w: { word: string }) => w.word)], [200, 3, ['oldest']]);
  ok(!JSON.stringify(out.body).includes('answer_index'), 'no key yet');
  const check = await f.json('POST', 'learner/reading-check', { body: { id: out.body.reading.id, answers: [1, 2, 0, 0] } });
  equal([check.body.reading.result.correct, check.body.reading.result.score], [3, 75]);
  await f.settle();
  const event = f.events().at(-1)!;
  equal([event.kind, event.feature, event.score, event.verifiedMinutes > 0], ['drill_finished', 'L10', 75, true]);
});

Deno.test('L9 photo explain gives hints, and the worked solution only when no centre homework is open', async () => {
  const f = learnerFixture();
  await f.adult();
  const image = `data:image/png;base64,${'B'.repeat(400)}`;
  f.reply({ problem: 'Solve \\(2x + 3 = 11\\).', subject: 'maths', hints: ['Move 3 to the other side.', 'Divide by 2.'], steps: [{ text: '2x = 8' }, { text: 'x = 4' }], answer: 'x = 4' });
  const out = await f.json('POST', 'learner/photo-explain', { body: { image, subject: 'maths' } });
  equal([out.body.credits, out.body.photo.hints.length, out.body.photo.solution], [3, 2, null]);
  ok(!JSON.stringify(out.body).includes('x = 4'), 'the answer stays on the server');
  f.functions.academy = ({ query }) => (query.action === 'student_assignments' ? { assignments: [{ id: 'a1', title: 'Equations', status: 'active', due_at: '2026-11-10T00:00:00Z', submission: { status: 'missing' } }] } : undefined);
  const blocked = await f.json('POST', 'learner/photo-solution', { body: { id: out.body.photo.id } });
  equal([blocked.status, blocked.body.code], [403, 'homework_open']);
  f.functions.academy = () => ({ assignments: [] });
  const shown = await f.json('POST', 'learner/photo-solution', { body: { id: out.body.photo.id } });
  equal([shown.body.photo.solution.answer, (await f.json('GET', 'core/credits')).body.balance.total], ['x = 4', 1497], 'no second charge');
});

Deno.test('L5 plans link only into real Schood practice; L15 needs a real prediction before any charge', async () => {
  const f = learnerFixture();
  await f.adult();
  f.reply({ summary: 'Build reading first.', weeks: [{ week: 1, theme: 'Reading', goal: 'TFNG', tasks: [{ title: 'TFNG set', minutes: 60, skill: 'reading', link_id: 'ielts.reading' }, { title: 'Made-up site', minutes: 30, skill: 'reading', link_id: 'https://evil.example' }, { title: 'Too much', minutes: 600, skill: 'x', link_id: null }] }] });
  const plan = await f.json('POST', 'learner/study-plan', { body: { exam: 'ielts', target: '7.0', exam_date: '2026-12-20', hours_per_week: 3 } });
  const tasks = plan.body.plan.weeks[0].tasks;
  equal([plan.body.credits, tasks.length, tasks[0].link.url, tasks[1].link], [3, 2, 'https://practice.ielts.schood.online/today?source=schood_ai&weak_skill=reading', null], 'unknown link ids become null; over-budget tasks go');
  equal(plan.body.plan.weeks.length, 1);
  const ticked = await f.json('PATCH', 'learner/study-plan', { body: { id: plan.body.plan.id, week: 1, task: 0, done: true } });
  equal(ticked.body.plan.progress, { done: 1, total: 2 });
  await f.settle();
  equal(f.events().map((event) => [event.kind, event.verified]), [['goal_set', false]]);
  const before = await f.balance();
  const none = await f.json('POST', 'learner/gap', { body: { exam: 'ielts' } });
  equal([none.status, none.body.code, await f.balance()], [409, 'no_prediction', before], 'nothing charged without data');
  f.functions['score-prediction'] = () => ({ predictions: [{ exam_type: 'ielts', current_score: 6, predicted_next: 6.5, confidence_low: 5.5, confidence_high: 7, trend: 'up', data_points: 4 }] });
  f.reply({ drivers: [{ title: 'Listening section 3', why: 'Your weakest.', action: 'Two sets', link_id: 'ielts.listening' }, { title: 'Task 2', why: 'x', action: 'y', link_id: 'nope' }], note: 'Tight but possible.' });
  const gap = await f.json('POST', 'learner/gap', { body: { exam: 'ielts' } });
  equal([gap.body.credits, gap.body.gap.current, gap.body.gap.target, gap.body.gap.days_left, gap.body.gap.drivers[1].link], [3, 6, '7.0', 48, null], 'numbers from the data, target from the plan');
  equal(gap.body.gap.due, false, 're-checked weekly');
});

Deno.test('L16 states only dataset facts; anything else is "check on the official site"', async () => {
  const f = learnerFixture();
  await f.adult();
  const data = await f.json('GET', 'learner/abroad');
  ok(data.body.entries.every((entry: { source: string }) => entry.source.startsWith('https://')), 'every entry has a source');
  f.reply({ summary: 'UK degree plan.', checklist: [{ item: 'English at B2', entry_ids: ['uk.english.level'] }, { item: 'University score', entry_ids: [] }, { item: 'Invented rule', entry_ids: ['made.up'] }, { item: 'Money for living costs', entry_ids: ['uk.money.living'] }],
    timeline: [{ when: '2027-03', task: 'Apply for the visa', entry_ids: ['uk.visa.when'] }], tests: [{ test: 'IELTS', note: 'B2 equivalent', entry_ids: ['uk.english.level'] }], next_steps: ['Book a mock'] });
  const out = await f.json('POST', 'learner/abroad-plan', { body: { countries: ['uk'], level: 'bachelor', scores: { ielts: 6 } } });
  const lines = out.body.plan.checklist.map((line: { entry_ids: string[]; verified: boolean }) => [line.entry_ids, line.verified]);
  equal([out.body.credits, lines], [5, [[['uk.english.level'], true], [[], false], [[], false], [['uk.money.living'], false]]], 'unknown ids dropped; unchecked entries are not facts');
  equal((await f.json('POST', 'learner/abroad-plan', { body: { countries: ['mars'], level: 'bachelor' } })).status, 400);
});
