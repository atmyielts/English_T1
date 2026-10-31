import { contextProviderKinds, registerContextProvider } from '../context.ts';
import { equal, ID, KID, learnerFixture, ok } from './testkit.ts';
import { alignWords } from './pronunciation.ts';

// Speaking, interviews, pronunciation, homework hints and duels.

const words = (n: number, seed = 'I think') => Array.from({ length: n }, (_, i) => `${seed} word${i}`).join(' ');

Deno.test('L4 IELTS mock follows the real flow, records answers free and reports with the learner\'s own words', async () => {
  const f = learnerFixture();
  await f.adult();
  const start = await f.json('POST', 'learner/speaking-start', { body: { mode: 'ielts_mock' } });
  const plan = start.body.session.plan as { part: string; prep: number; talk: number }[];
  equal([plan.length, plan.filter((item) => item.part === '1').length, plan[6].part, plan[6].prep, plan[6].talk, plan.filter((item) => item.part === '3').length], [10, 6, '2', 60, 120, 3], 'Part 1 x6, cue card 1+2 min, Part 3 x3');
  const before = await f.balance();
  for (let i = 0; i < 10; i++) {
    const text = i === 6 ? `My favourite place is the old library because it is quiet and ${words(30)}` : `Well, I usually go there because ${words(8)}`;
    await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text, mode: 'speech', seconds: i === 6 ? 110 : 25 } });
  }
  equal([await f.balance(), f.upstream.length], [before, 0], 'answers cost nothing');
  f.reply({ bands: { fluency: 6, lexical: 6.5, grammar: 6, pronunciation: 6 }, comments: { fluency: 'Some pauses.', lexical: 'Good range.', grammar: 'Simple forms.', pronunciation: 'Clear.' },
    priorities: [{ criterion: 'fluency', text: 'Extend answers.', practice: 'speaking' }, { criterion: 'grammar', text: 'Use past tenses.', practice: 'grammar' }, { criterion: 'lexical', text: 'Learn topic words.', practice: 'vocabulary' }],
    fixes: [{ said: 'I usually go there because', better: 'I tend to go there since', why: 'More natural.' }, { said: 'I never said this', better: 'x', why: 'y' }],
    evidence: { fluency: ['it is quiet and'], lexical: ['an invented quote'], grammar: [] } });
  const done = await f.json('POST', 'learner/speaking-finish', { body: { id: start.body.session.id } });
  const report = done.body.session.report;
  equal([done.body.session.status, report.overall, report.credits, before - await f.balance()], ['finished', 6, 10, 10]);
  equal([report.fixes.length, report.evidence.fluency, report.evidence.lexical], [1, ['it is quiet and'], []], 'only real quotes');
  ok(report.fluency.words_per_minute > 0, 'fluency numbers from spoken answers');
  await f.settle();
  equal(f.events().map((event) => [event.kind, event.verified, event.score]), [['mock_finished', true, 6]]);
});

Deno.test('L4 Multilevel mock uses the official answer and preparation times', async () => {
  const f = learnerFixture();
  await f.adult();
  const start = await f.json('POST', 'learner/speaking-start', { body: { mode: 'multilevel_mock' } });
  equal(start.body.session.plan.map((item: { talk: number; prep: number }) => [item.talk, item.prep]), [[30, 0], [30, 0], [30, 0], [45, 0], [30, 0], [30, 0], [120, 60], [120, 60]]);
  for (let i = 0; i < 8; i++) await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text: words(12, 'In my view'), mode: 'typed' } });
  f.reply({ q1_3: { score: 4, comment: 'On topic.' }, q4_6: { score: 3, comment: 'ok' }, q7: { score: 3, comment: 'ok' }, q8: { score: 3, comment: 'One side.' }, priorities: [], fixes: [] });
  const done = await f.json('POST', 'learner/speaking-finish', { body: { id: start.body.session.id } });
  equal([done.status, done.body.session.report.kind, done.body.session.report.raw, done.body.session.report.scale_max], [200, 'multilevel', 13, 75]);
});

Deno.test('L4 role-plays reuse Schood English scenarios; tips must quote the learner; speech is browser-side until set up', async () => {
  const f = learnerFixture();
  await f.adult();
  const list = await f.json('GET', 'learner/speaking');
  equal([list.body.speech, list.body.scenarios.some((s: { id: string }) => s.id === 'visa-interview')], [{ stt: false, tts: false }, true]);
  const start = await f.json('POST', 'learner/speaking-start', { body: { mode: 'roleplay', scenario: 'visa-interview', level: 'B1' } });
  equal(start.body.session.messages.length, 1, 'the static opening line is free');
  const audio = await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, audio: btoa('x'.repeat(400)), mime: 'audio/webm' } });
  equal([audio.status, audio.body.code], [503, 'ai_unavailable'], 'no speech route: the app falls back to the browser');
  const before = await f.balance();
  f.reply({ reply: 'And how long will you stay?', goals_met: ['purpose', 'made-up'], tip: { said: 'I go for study', better: 'I am going to study' }, end: false });
  const turn = await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text: 'I go for study at a university in Boston.' } });
  equal([turn.body.reply, turn.body.tip, turn.body.session.goals.filter((g: { met: boolean }) => g.met).map((g: { id: string }) => g.id), before - await f.balance()], ['And how long will you stay?', { said: 'I go for study', better: 'I am going to study' }, ['purpose'], 1]);
  f.reply({ reply: 'Who will pay?', goals_met: [], tip: { said: 'never said', better: 'x' }, end: false });
  equal((await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text: 'For four years, I think.' } })).body.tip, null, 'a tip must quote what the learner just said');
  f.reply({ goals: [{ id: 'purpose', achieved: true, note: 'Clear.' }], fixes: [{ said: 'I go for study', better: 'I am going to study', why: 'Future plan.' }], phrases: ['I plan to'], summary: 'Good start.', score: 70 });
  const done = await f.json('POST', 'learner/speaking-finish', { body: { id: start.body.session.id } });
  equal([done.body.session.report.kind, typeof done.body.session.report.score, done.body.session.report.fixes.length, done.body.session.report.credits], ['review', 'number', 1, 3]);
  equal((await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text: 'Hello again' } })).body.code, 'session_finished');
});

Deno.test('L12 interviews are scored per criterion with quoted evidence and never give visa rules', async () => {
  const f = learnerFixture();
  await f.adult();
  const start = await f.json('POST', 'learner/speaking-start', { body: { mode: 'interview', interview: 'job' } });
  ok(start.body.session.practice_note.en.includes('Practice only'), 'labelled as practice');
  f.reply({ reply: 'Why this role?', goals_met: ['intro'], tip: null, end: false }, { reply: 'Tell me about a deadline.', goals_met: [], tip: null, end: false });
  await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text: 'I am a junior developer with two years of experience in Tashkent.' } });
  await f.json('POST', 'learner/speaking-turn', { body: { id: start.body.session.id, text: 'I like your products and I want to grow with the team.' } });
  f.reply({ criteria: [{ key: 'clarity', score: 4, comment: 'Clear.', evidence: ['two years of experience'] }, { key: 'relevance', score: 3, comment: 'ok', evidence: ['made up'] }, { key: 'specificity', score: 2, comment: 'Vague.', evidence: [] }, { key: 'nonsense', score: 9, comment: 'x', evidence: [] }],
    best: { quote: 'two years of experience', why: 'Concrete.' }, improve: [{ question: 'Why this role?', said: 'I like your products', better: 'Your payments app solved a problem I had…', why: 'Specific.' }], next_steps: ['Use STAR'] });
  const done = await f.json('POST', 'learner/speaking-finish', { body: { id: start.body.session.id } });
  const report = done.body.session.report;
  equal([report.credits, report.criteria.length, report.criteria[1].evidence, report.score, report.improve.length], [10, 3, [], 60, 1]);
  ok((await f.prompt()).includes('Never state visa, admission or legal rules'), 'rule in the prompt');
});

Deno.test('L13 pronunciation aligns words, charges only for a tip, and keeps a daily streak', async () => {
  equal(alignWords('I think three of them', 'I sink three them').words.map((w) => w.status), ['ok', 'changed', 'ok', 'missed', 'ok']);
  const f = learnerFixture();
  await f.adult();
  const today = await f.json('GET', 'learner/pronunciation', { query: { level: 'B1' } });
  equal([today.body.sentences.length, today.body.streak], [5, 0]);
  const [a, b, c] = today.body.sentences as { id: string; text: string }[];
  const before = await f.balance();
  const perfect = await f.json('POST', 'learner/pronunciation-check', { body: { sentence_id: a.id, transcript: a.text } });
  equal([perfect.body.score, perfect.body.passed, perfect.body.credits, await f.balance()], [100, true, 0, before], 'free when every word came through');
  f.reply({ tips: [{ word: 'x', tip: 'Put your tongue between your teeth.' }], encouragement: 'Nearly there!' });
  const missed = await f.json('POST', 'learner/pronunciation-check', { body: { sentence_id: b.id, transcript: b.text.split(' ').slice(0, -2).join(' ') } });
  equal([missed.body.passed, missed.body.tips.length, missed.body.credits], [false, 1, 1]);
  await f.json('POST', 'learner/pronunciation-check', { body: { sentence_id: b.id, transcript: b.text } });
  const third = await f.json('POST', 'learner/pronunciation-check', { body: { sentence_id: c.id, transcript: c.text } });
  equal([third.body.day_done, third.body.streak], [true, 1]);
  await f.settle();
  equal(f.events().filter((event) => event.kind === 'drill_finished').length, 1, 'the day counts once');
});

Deno.test('L7 homework helper: centre students only, hints only by default, the teacher\'s rule wins', async () => {
  const f = learnerFixture();
  const centre = f.memory.seed.centre({ name: 'Registan', ownerId: ID.owner });
  centre.academyTenantId = '33333333-3333-4333-8333-333333333333';
  f.memory.seed.member(centre.id, ID.student, 'student');
  const open = { id: '44444444-4444-4444-8444-444444444444', title: 'Past simple', description: 'Write 5 sentences about last weekend.', assignment_type: 'writing', status: 'active', due_at: '2026-11-05T00:00:00Z', submission: null };
  const closed = { ...open, id: '55555555-5555-4555-8555-555555555555', due_at: '2026-10-01T00:00:00Z' };
  f.functions.academy = ({ token, query }) => (token === 'tok-student' && query.action === 'student_assignments' && query.academy_id === centre.academyTenantId ? { assignments: [open, closed] } : undefined);
  await f.adult('tok-student');
  const query = { workspace_id: centre.id };
  const list = await f.json('GET', 'learner/homework', { token: 'tok-student', query });
  equal(list.body.homework.map((h: { id: string; rule: string }) => [h.id, h.rule]), [[open.id, 'hints_only']], 'only open work, safe default');
  f.reply({ hint: 'Think about verbs that end in -ed. The answer is "went".', check_question: 'What is the past of go?', topic: 'Past Simple' });
  const hint = await f.json('POST', 'learner/homework-hint', { token: 'tok-student', query, body: { assignment_id: open.id, question: 'What is the past of go?', step: 1 } });
  equal([hint.body.credits, hint.body.hint.guarded, hint.body.hint.hint.includes('went'), hint.body.hint.topic], [1, true, false, 'past_simple'], 'an answer leak is removed');
  ok((await f.prompt()).includes('HINTS ONLY'), 'the rule is in the prompt');
  equal((await f.json('POST', 'learner/homework-hint', { token: 'tok-student', query, body: { assignment_id: closed.id, question: 'x', step: 1 } })).body.code, 'homework_closed');
  equal((await f.json('GET', 'learner/homework')).status, 402, 'a Plus learner without a centre has no L7');
  if (!contextProviderKinds().includes('centre_rules')) {
    registerContextProvider('centre_rules', () => Promise.resolve({ kind: 'centre_rules', title: 'Rules', data: { homework: { assignments: { [open.id]: 'off' } } } }));
    equal((await f.json('POST', 'learner/homework-hint', { token: 'tok-student', query, body: { assignment_id: open.id, question: 'x', step: 2 } })).body.code, 'homework_ai_off');
  }
});

Deno.test('L17 duels: the challenger pays for a checked quiz, the friend plays free, results count once', async () => {
  const f = learnerFixture({ seed: { referralCodes: { [ID.plus]: 'DILNOZA1' } } });
  await f.adult();
  const q = (n: number) => ({ prompt: `Pick the word for travelling by plane number ${n}`, options: [`fly${n}`, `swim${n}`, `walk${n}`, `drive${n}`], answer_index: 0 });
  f.reply({ questions: [...Array.from({ length: 11 }, (_, n) => q(n)), { prompt: 'Duplicate', options: ['a', 'a', 'b', 'c'], answer_index: 0 }] });
  const out = await f.json('POST', 'learner/duel-create', { body: { topic: 'airport English', friend_level: 'A2' } });
  equal([out.status, out.body.credits, out.body.duel.level], [200, 2, 'A2'], 'level between B1 (default) and A2');
  const code = out.body.duel.code as string;
  equal(f.learner.englishDuels.get(code)!.questions.length, 10, 'ten checked questions in the English duel');
  ok(out.body.duel.links.signup.includes('ref=DILNOZA1') && out.body.duel.links.bot.endsWith(`duel_${code}`), 'referral and bot links');
  const invite = await f.json('GET', 'learner/duel', { token: 'tok-free', query: { code } });
  equal([invite.status, invite.body.duel.topic, invite.body.duel.challenger, invite.body.duel.mine], [200, 'airport English', 'Dilnoza', false], 'free users see the invite');
  f.reply({ questions: [q(1)] });
  const before = await f.balance();
  equal([(await f.json('POST', 'learner/duel-create', { body: { topic: 'x' } })).body.code, await f.balance()], ['ai_failed', before], 'a quiz that fails its checks is refunded');
  Object.assign(f.learner.englishDuels.get(code)!, { status: 'finished', opponentId: ID.free, winnerId: ID.plus, players: [{ userId: ID.plus, role: 'creator', correct: 8, answered: 10, finished: true, outcome: 'win' }, { userId: ID.free, role: 'opponent', correct: 6, answered: 10, finished: true, outcome: 'loss' }] });
  const mine = await f.json('GET', 'learner/duels');
  equal([mine.body.win_streak, mine.body.duels[0].result], [1, { won: true, draw: false, me: 8, friend: 6 }]);
  await f.json('GET', 'learner/duels');
  await f.settle();
  equal(f.events().filter((event) => event.feature === 'L17').map((event) => [event.kind, event.outcome]), [['drill_finished', 'win']], 'counted once');
});

Deno.test('learners can delete their history; the home summary needs no model', async () => {
  const f = learnerFixture();
  await f.adult();
  f.reply({ title: 'Parks', text: 'Tashkent has many parks and gardens. '.repeat(10), questions: [1, 2, 3].map(() => ({ prompt: 'Which is right?', options: ['a', 'b', 'c'], answer_index: 0, explanation: '' })), words: [] });
  equal((await f.json('POST', 'learner/reading', { body: { topic: 'parks' } })).status, 200);
  await f.settle();
  const home = await f.json('GET', 'learner/home');
  equal([home.body.consent.state, home.body.recent.length > 0, home.body.brief.telegram_linked], ['ok', true, true]);
  equal((await f.json('DELETE', 'learner/history', { body: { all: true } })).body.deleted, 1);
  equal((await f.json('GET', 'learner/readings')).body.readings, []);
  void KID;
});
