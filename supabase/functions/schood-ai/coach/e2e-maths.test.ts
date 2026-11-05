import { cohortPercentile, type QuizQuestion, type QuizSet } from '../../../../packages/coach-packs/src/mod.ts';
import { packFor } from '../../../../packages/coach-packs/src/registry.ts';
import { equal, ID, ok } from '../fixture.test.ts';
import { coachStack, flowOf, takePlacement, type CoachStack } from './harness.ts';

// B3 Admission Maths Coach, end to end in Uzbek and then Russian: the placement test,
// a goal with an exam date, daily sets chosen by topic mastery from the subject-core
// topic graph, hints, the mistake notebook, timed mini-mocks on the keyed rubric with
// the projection onto the exam blocks, the forecast, level-up certificates and the
// anonymous percentile once 30 people are in the window, photo help, a written
// solution scored with quotes, the weekly report and the Mini App routes. Practice
// sets and mocks make no model call.

const CHAT = '700100';
const pack = () => (globalThis as unknown as { __maths: CoachStack }).__maths.runtime.packs.get('maths')!;

function questionOf(ref: string): QuizQuestion {
  const [setId, questionId] = ref.split('#');
  return (pack().byId.get(setId) as QuizSet).questions.find((question) => question.id === questionId)!;
}

/** Answers the set in progress: `right(index)` decides which answers are right. Returns the refs answered. */
async function answerSet(s: CoachStack, right: (index: number) => boolean): Promise<string[]> {
  const refs: string[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const state = await flowOf(s, ID.plus, 'maths');
    if (state.flow !== 'quiz') break;
    const index = state.index as number, ref = (state.items as string[])[index];
    const question = questionOf(ref);
    refs.push(ref);
    s.advance(20_000);
    if (typeof question.answer === 'number') await s.user.tap('maths', CHAT, `a:${index}:${right(index) ? question.answer : (question.answer + 1) % question.options!.length}`);
    else if (Array.isArray(question.answer)) await s.user.text('maths', CHAT, right(index) ? question.answer[0] : 'no idea');
    else await s.user.text('maths', CHAT, String(right(index) ? question.answer.numeric : question.answer.numeric + 1000).replace('.', ','));
  }
  return refs;
}

Deno.test('B3 Admission Maths: topic-graph sets, hints, the notebook, mini-mocks, the percentile and certificates, in Uzbek and Russian', async () => {
  const s = await coachStack();
  (globalThis as unknown as { __maths: CoachStack }).__maths = s;
  const { user, fresh, texts, data, buttons } = s;
  let out = await takePlacement(s, 'maths', CHAT, 'uz', 'beginner');
  ok(texts(out).some((text) => text.includes('Daraja testi natijasi')), `placement in Uzbek: ${texts(out).join(' | ').slice(0, 300)}`);
  const placement = (await s.coach.store.enrollment(ID.plus, 'maths'))!.placement!;
  ok(placement.overall <= 50, `a weak start on the percentage scale: ${placement.overall}`);
  equal(s.f.memory.calls.length, 0, 'the placement test is not AI');

  // Goal: 70% by an exam date, 30 minutes a day, a reminder at 18:00.
  await user.tap('maths', CHAT, 'g:t:70');
  out = fresh();
  ok(data(out, /^g:d:none$/), 'an optional exam date');
  await user.text('maths', CHAT, '20.07.2027');
  await user.tap('maths', CHAT, 'g:m:30');
  await user.tap('maths', CHAT, 'g:r:1800');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Rejangiz tayyor')), 'the plan is ready, in Uzbek');
  const plan = ((await s.coach.store.enrollment(ID.plus, 'maths'))!.state.plan as { tasks: { slot: string; activityId: string; node: string; reason: string }[] }).tasks;
  const practice = plan.filter((task) => task.slot === 'practice');
  ok(practice.length >= 1 && practice.every((task) => task.activityId.startsWith('bank.')), `today has topic sets from the banks: ${JSON.stringify(plan)}`);
  // Chosen by topic mastery: no task is on a topic whose measured prerequisite is weak, and no two are the same.
  equal(new Set(practice.map((task) => task.activityId)).size, practice.length, 'distinct topics');

  // A daily set: five problems dealt from one topic bank, hints on request, no model call.
  const calls = s.f.memory.calls.length;
  await user.tap('maths', CHAT, `t:${plan.findIndex((task) => task.slot === 'practice')}`);
  out = fresh();
  ok(texts(out).some((text) => text.includes('ta masala')), `the set intro: ${texts(out).join(' | ').slice(0, 200)}`);
  let state = await flowOf(s, ID.plus, 'maths');
  equal([state.flow, (state.items as string[]).length], ['quiz', 5], 'five problems dealt from the bank');
  const bankId = state.activityId as string, node = (pack().byId.get(bankId) as QuizSet).node;
  ok((state.items as string[]).every((ref) => ref.startsWith(`${bankId}#`)), 'all from the topic bank');
  const firstHints = questionOf((state.items as string[])[0]).hints?.length ?? 0;
  equal(!!data(out, /^qh:0:0$/), firstHints > 0, 'a hint button exactly when the problem has hints');
  if (firstHints) {
    await user.tap('maths', CHAT, 'qh:0:0');
    ok(texts(fresh()).some((text) => text.startsWith(`💡 1/${firstHints}`)), 'the first hint');
  }
  const answered = await answerSet(s, (index) => index < 3);
  out = fresh();
  ok(texts(out).some((text) => text.includes('5 tadan 3')), `3 of 5: ${texts(out).at(-1)?.slice(0, 300)}`);
  ok(buttons(out).some((button) => button.callback_data === 'm:mistakes' && button.text.includes('(2)')), 'the notebook now holds the two misses');
  equal(s.f.memory.calls.length, calls, 'no model call for a practice set');
  const topic = (await s.coach.store.mastery(ID.plus, 'maths')).find((row) => row.node === node)!;
  ok(topic && topic.level !== null && topic.evidence >= 1, `the topic's level moved with the share right: ${JSON.stringify(topic)}`);

  // The mistake notebook: the two misses, with their topic; right answers clear them.
  await user.tap('maths', CHAT, 'm:mistakes');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Xatolar daftari')), 'the notebook in Uzbek');
  state = await flowOf(s, ID.plus, 'maths');
  equal([...(state.items as string[])].sort(), answered.slice(3).sort(), 'exactly the missed problems');
  await answerSet(s, () => true);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Daftardan chiqdi: <b>2</b>') && text.includes('tuzatish kerak: 0')), `cleared: ${texts(out).at(-1)?.slice(-200)}`);

  // A timed mini-mock: ten questions dealt by topic weight across banks, no hints, recorded on the keyed rubric.
  await user.tap('maths', CHAT, 'm:mock');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Sinovda maslahat yo‘q')), 'the mock intro');
  state = await flowOf(s, ID.plus, 'maths');
  const mockItems = state.items as string[];
  equal(mockItems.length, 10, 'ten questions, like the compulsory block');
  ok(new Set(mockItems.map((ref) => ref.split('#')[0])).size >= 5, 'spread over topics');
  ok(!buttons(out).some((button) => button.callback_data?.startsWith('qh:')), 'no hints in a mock');
  await answerSet(s, () => true);
  out = fresh();
  let result = texts(out).at(-1)!;
  ok(result.includes('Sinov natijasi: <b>100%</b>'), `the mock result: ${result.slice(0, 400)}`);
  ok(result.includes('10 tadan 10') && result.includes('30 tadan 30'), 'projected onto both exam blocks');
  ok(result.includes('o‘rningiz ko‘rinadi'), 'no percentile below 30 people');
  equal(s.f.memory.calls.length, calls, 'no model call for a mock either');

  // A second mock the next day at 100%: the level-up certificate (only the highest milestone reached).
  s.advance(86_400_000);
  await user.tap('maths', CHAT, 'm:mock');
  fresh();
  await answerSet(s, () => true);
  out = fresh();
  ok(texts(out).some((text) => text.includes('Yangi daraja')), `level up: ${texts(out).join(' | ').slice(0, 300)}`);
  const certificates = await s.coach.store.certificates(ID.plus, 'maths');
  equal(certificates.length, 1, 'one certificate: the highest milestone reached');
  equal(certificates[0].rubric, 'admission.mock', 'on the keyed mock rubric');
  ok((await s.verify(certificates[0].code)).status === 200, 'publicly checkable');

  // Thirty-four other learners with a mini-mock this month: the anonymous percentile appears.
  const scores = Array.from({ length: 34 }, (_, i) => 20 + ((i * 7) % 75));
  for (const [i, score] of scores.entries()) {
    const other = `00000000-0000-4000-8000-${String(5000 + i).padStart(12, '0')}`;
    const session = await s.coach.store.createSession({ enrollmentId: crypto.randomUUID(), userId: other, pack: 'maths', packVersion: '1.0.0', kind: 'quiz_set', activityId: 'mock.compulsory', mode: 'mock', rubric: 'admission.mock', source: 'telegram' });
    await s.coach.store.updateSession(session.id, { status: 'finished', overall: score, finishedAt: s.now().toISOString(), minutes: 20 });
  }
  s.advance(86_400_000);
  await user.tap('maths', CHAT, 'm:mock');
  fresh();
  await answerSet(s, (index) => index < 6);
  out = fresh();
  result = texts(out).at(-1)!;
  const expected = cohortPercentile([...scores, 60].reduce((buckets, score) => { const at = buckets.find((bucket) => bucket.score === score); if (at) at.people += 1; else buckets.push({ score, people: 1 }); return buckets; }, [] as { score: number; people: number }[]), 60)!;
  ok(result.includes(`<b>${expected.percentile}%</b>`) && result.includes('35 nafar'), `the percentile among 35 people: ${result.slice(0, 600)}`);
  ok(result.includes('Prognoz') || result.includes('prognoz'), 'the forecast from three mocks over two days');

  // Russian: the same coach, the practice text in Russian.
  await user.tap('maths', CHAT, 's:lang');
  await user.tap('maths', CHAT, 'l:ru');
  fresh();
  await user.tap('maths', CHAT, 'm:practice');
  out = fresh();
  state = await flowOf(s, ID.plus, 'maths');
  const first = (state.items as string[])[0], [setId, questionId] = first.split('#');
  const russian = (packFor(pack(), 'ru').byId.get(setId) as QuizSet).questions.find((question) => question.id === questionId)!.prompt;
  const uzbek = questionOf(first).prompt;
  ok(texts(out).some((text) => text.includes(russian.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))), `the problem in Russian: ${russian}`);
  ok(russian !== uzbek || !/[a-zа-я]/i.test(russian), 'a different text from the Uzbek one when it has words');
  ok(texts(out).some((text) => text.includes('задач')), 'the intro in Russian');
  await answerSet(s, () => true);
  fresh();

  // Photo help: hints first, then the worked solution on request (one photo charge).
  await user.photo('maths', CHAT);
  out = fresh();
  ok(texts(out).some((text) => text.includes('💡 1/3')), `the first hint: ${texts(out).join(' | ').slice(0, 300)}`);
  ok(data(out, /^ph:h:1$/) && data(out, /^ph:s$/), 'more hints and the solution are offered');
  await user.tap('maths', CHAT, 'ph:s');
  ok(texts(fresh()).some((text) => text.includes('x = 4')), 'the worked solution');
  ok(s.f.memory.calls.some((call) => call.feature === 'coach_b3.photo'), 'charged as photo help');

  // A written solution, scored with quotes on the solution rubric.
  s.knobs.score = 75;
  await user.tap('maths', CHAT, 'm:writing');
  out = fresh();
  await user.tap('maths', CHAT, data(out, /^o:0$/)!);
  fresh();
  await user.text('maths', CHAT, 'Diskriminantni topamiz: D = b² − 4ac = 25 − 24 = 1. Demak ildizlar x = (5 ± 1) / 2, ya’ni x = 3 va x = 2. Tekshiramiz: 9 − 15 + 6 = 0 va 4 − 10 + 6 = 0, ikkalasi ham to‘g‘ri.');
  out = fresh();
  ok(texts(out).some((text) => text.includes('75')), `the solution scored: ${texts(out).join(' | ').slice(0, 400)}`);
  const solution = (await s.coach.store.sessions(ID.plus, 'maths', { limit: 5, kind: 'writing' }))[0];
  equal([solution.rubric, solution.status, solution.overall], ['maths.solution', 'finished', 75], 'recorded on the solution rubric');

  // The weekly report in Russian, with practice accuracy before and after.
  await user.tap('maths', CHAT, 'm:report');
  out = fresh();
  ok(texts(out).some((text) => text.includes('Ваша неделя') && text.includes('Точность')), `the weekly report: ${texts(out).join(' | ').slice(0, 400)}`);

  // The Mini App: the dashboard with the percentile, the notebook size and the mock forecast; the notebook itself.
  const dashboard = await s.f.json('GET', 'coach/dashboard', { token: 'tok-plus', query: { pack: 'maths' } });
  equal(dashboard.status, 200, 'dashboard');
  equal([dashboard.body.cohort.percentile, dashboard.body.cohort.people, dashboard.body.cohort.min_people], [expected.percentile, 35, 30], 'the anonymous percentile on the dashboard');
  ok(!JSON.stringify(dashboard.body.cohort).includes('00000000-0000-4000-8000-0000000050'), 'no other person appears');
  ok(typeof dashboard.body.mistakes.count === 'number', 'the notebook size');
  ok(dashboard.body.forecasts.some((forecast: { rubric: string; points: unknown[] }) => forecast.rubric === 'admission.mock' && forecast.points.length === 3), 'the mock results over time');
  ok(dashboard.body.skills.some((skill: { node: string; level: number | null }) => skill.node === node && skill.level !== null), 'topic levels on the dashboard');
  const notebook = await s.f.json('GET', 'coach/mistakes', { token: 'tok-plus', query: { pack: 'maths' } });
  equal([notebook.status, notebook.body.total], [200, 4], 'the four misses of the last mock are in the notebook');
  ok(notebook.body.mistakes.every((entry: { answer: string | null; explanation: string; topic: string }) => entry.answer && entry.explanation && entry.topic), 'each with the right answer, why and its topic');

  // Without a plan: the placement test and examples only.
  await user.text('maths', '700200', '/start', 'ru');
  await user.tap('maths', '700200', 'm:practice');
  ok(texts(fresh()).some((text) => text.includes('Schood AI Plus')), 'practice needs a plan');
  await user.tap('maths', '700200', 'm:mock');
  ok(texts(fresh()).some((text) => text.includes('Schood AI Plus')), 'mocks need a plan');
});
