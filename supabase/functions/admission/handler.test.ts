import type { AnswerKey, Item } from '../../../packages/assessment-core/src/mod.ts';
import { createAdmissionHandler, openMistakes, pickQuestion, tashkentDate, type Goal, type HistoryRow } from './handler.ts';
import { createMemoryRepository, type BankRow } from './memory-repository.ts';

const origin = 'https://admission.schood.online';
const START = new Date('2026-11-01T20:30:00Z'); // 01:30 on Monday 2 November in Tashkent
const MINUTE = 60_000, DAY = 86_400_000;
const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, label: string) => {
  if (!value) throw new Error(label);
};
const question = (id: string, topic: string, difficulty: 'easy' | 'medium' | 'hard' = 'medium', locale: 'uz' | 'ru' = 'uz'): BankRow => ({
  id,
  item: { schema_version: 'assessment.item.v1', type: 'single_choice', prompt: String.raw`\(x^2=9\), \(x>0\). x?`, locale, max_score: 1, tags: [], options: [{ id: 'a', text: '3' }, { id: 'b', text: '-3' }], classification: { topics: [topic], estimated_difficulty: difficulty } } as Item,
  key: { correct: 'a', case_sensitive: false, partial_credit: false, solution: String.raw`\(x=\sqrt9=3\)` } as AnswerKey,
});
const BANK = [
  question('40000000-0000-4000-8000-000000000001', 'math.alg.quadratic'),
  question('40000000-0000-4000-8000-000000000002', 'math.alg.quadratic', 'easy'),
  question('40000000-0000-4000-8000-000000000003', 'math.num.natural'),
  question('40000000-0000-4000-8000-000000000004', 'math.num.natural', 'medium', 'ru'),
];
const GOAL: Goal = { section_id: 'specialised_1', question_locale: 'uz', daily_minutes: 30, exam_date: '2027-07-01', target_points: 70, exam_code: 'uz-admission', format_version: '2026.1' };

function fixture(options: { goal?: Goal | null; enabled?: boolean; conflicts?: number; plan?: 'free' | 'plus'; freeDaily?: number } = {}) {
  let clock = START;
  const memory = createMemoryRepository({ bank: BANK, users: { valid: '00000000-0000-4000-8000-0000000000a2', other: '00000000-0000-4000-8000-0000000000a3' }, conflicts: options.conflicts, now: () => clock });
  const goal = options.goal === undefined ? GOAL : options.goal;
  if (goal) memory.goals.set('00000000-0000-4000-8000-0000000000a2', goal);
  const handle = createAdmissionHandler(memory.repository, [origin], { enabled: options.enabled ?? true, now: () => clock, random: () => 0, access: options.plan ? () => Promise.resolve(options.plan!) : undefined, freeDailyQuestions: options.freeDaily });
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    handle(new Request(`https://x.invalid/functions/v1/admission/${path}`, { method, headers: { authorization: 'Bearer valid', origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const json = async (method: string, path: string, body?: unknown, headers?: Record<string, string>) => (await call(method, path, body, headers)).json();
  const answerWith = (item: string, topic: string, response: string, mode = 'practice') => json('POST', 'answer', { client_answer_id: crypto.randomUUID(), item_version_id: item, topic_code: topic, mode, response });
  return { call, json, answerWith, memory, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

Deno.test('plans change at midnight in Tashkent', () => {
  equal(tashkentDate(START), '2026-11-02');
  equal(tashkentDate(new Date('2026-11-01T18:59:00Z')), '2026-11-01');
});

Deno.test('closed until enabled, and only for signed-in learners from allowed origins', async () => {
  equal((await fixture({ enabled: false }).call('GET', 'state')).status, 503);
  const { call } = fixture();
  equal((await call('GET', 'state', undefined, { authorization: 'Bearer nope' })).status, 401);
  equal((await call('GET', 'state', undefined, { origin: 'https://evil.example' })).status, 403);
  const allowed = await call('GET', 'state');
  equal([allowed.status, allowed.headers.get('access-control-allow-origin'), allowed.headers.get('cache-control')], [200, origin, 'no-store']);
  equal((await call('PATCH', 'state')).status, 404);
});

Deno.test('a new learner sets a goal, which resets the day plan; bad goals are refused', async () => {
  const { call, memory } = fixture({ goal: null });
  const empty = await (await call('GET', 'state')).json();
  equal([empty.goal, empty.plan, empty.topics.length, empty.access.plan], [null, null, 33, 'beta']);
  equal(empty.journey.suggestions.map((row: { kind: string }) => row.kind), ['plan_certificate', 'plan_admission'], 'new learners are offered a path');
  equal((await call('GET', 'question?mode=diagnostic')).status, 409);
  for (const bad of [{ section_id: 'compulsory_history', question_locale: 'uz' }, { section_id: 'specialised_1', question_locale: 'en' }, { section_id: 'specialised_1', question_locale: 'uz', daily_minutes: 500 }, { section_id: 'compulsory_math', question_locale: 'ru', target_points: 12 }, { section_id: 'specialised_1', question_locale: 'uz', exam_date: '2020-01-01' }]) {
    const response = await call('PUT', 'goal', bad);
    equal([response.status, (await response.json()).code], [400, 'invalid_goal'], JSON.stringify(bad));
  }
  const saved = await call('PUT', 'goal', { section_id: 'compulsory_math', question_locale: 'ru', daily_minutes: 20, exam_date: '2027-07-01', target_points: 10 });
  const body = await saved.json();
  equal(saved.status, 200);
  equal(memory.goals.get('00000000-0000-4000-8000-0000000000a2'), { section_id: 'compulsory_math', question_locale: 'ru', daily_minutes: 20, exam_date: '2027-07-01', target_points: 10, exam_code: 'uz-admission', format_version: '2026.1' });
  equal(memory.calls.slice(0, 2), ['saveGoal', 'clearPlan:2026-11-02']);
  equal([body.prediction.max, body.diagnostic, body.plan], [11, { remaining: 1, total: 1, done: false }, null], 'no plan before the diagnostic');
});

Deno.test('questions never carry the key; answers are graded, explained, replayed and retried', async () => {
  const { call, memory } = fixture({ conflicts: 1 });
  const picked = await (await call('GET', 'question?mode=practice&topic=math.alg.quadratic')).json();
  equal([picked.topic_code, picked.item_version_id], ['math.alg.quadratic', '40000000-0000-4000-8000-000000000001'], 'medium question for a new learner');
  const text = JSON.stringify(picked);
  ok(!text.includes('solution') && !text.includes('"correct"') && !text.includes('sqrt9'), 'no key or solution in the question');
  const submission = { client_answer_id: crypto.randomUUID(), item_version_id: picked.item_version_id, topic_code: 'math.alg.quadratic', mode: 'practice', response: 'b', seconds: 35 };
  const wrong = await (await call('POST', 'answer', submission)).json();
  equal([wrong.correct, wrong.error_kind, wrong.correct_answer, wrong.solution, wrong.replayed], [false, 'concept', 'a', String.raw`\(x=\sqrt9=3\)`, false]);
  ok(wrong.mastery.after < wrong.mastery.before, 'mastery fell');
  const learner = memory.mastery.get('00000000-0000-4000-8000-0000000000a2')!;
  equal(learner.get('math.alg.quadratic')?.attempts, 1, 'one update despite a conflict and a retry');
  const replay = await (await call('POST', 'answer', { ...submission, response: 'a' })).json();
  equal([replay.replayed, replay.correct, memory.answers.size], [true, false, 1], 'replay changes nothing');
  const right = await (await call('POST', 'answer', { ...submission, client_answer_id: crypto.randomUUID(), response: 'a' })).json();
  equal([right.correct, right.error_kind], [true, null]);
});

Deno.test('answers are refused for unknown, mismatched or malformed input', async () => {
  const { call } = fixture();
  const base = { client_answer_id: crypto.randomUUID(), item_version_id: '40000000-0000-4000-8000-000000000001', topic_code: 'math.alg.quadratic', mode: 'practice', response: 'a' };
  for (const [body, status, code] of [
    [{ ...base, client_answer_id: 'x' }, 400, 'invalid_request'],
    [{ ...base, topic_code: 'math.unknown' }, 400, 'invalid_request'],
    [{ ...base, topic_code: 'math.geo.circles' }, 404, 'not_found'],
    [{ ...base, item_version_id: '40000000-0000-4000-8000-000000000009' }, 404, 'not_found'],
    [{ ...base, mode: 'mock' }, 400, 'invalid_request'],
    [{ ...base, seconds: -1 }, 400, 'invalid_request'],
    [{ ...base, response: 'x'.repeat(20_000) }, 400, 'invalid_request'],
  ] as const) {
    const response = await call('POST', 'answer', body);
    equal([response.status, (await response.json()).code], [status, code], JSON.stringify(body).slice(0, 80));
  }
  equal((await call('GET', 'question?topic=math.geo.circles')).status, 404, 'no questions yet');
  equal((await call('GET', 'question?topic=nope')).status, 400);
});

Deno.test('the diagnostic walks the topics that have questions, then the plan and trend start', async () => {
  const { json, answerWith } = fixture();
  const first = await json('GET', 'question?mode=diagnostic');
  equal(first.topic_code, 'math.num.natural');
  equal((await answerWith(first.item_version_id, first.topic_code, 'a', 'diagnostic')).correct, true);
  const next = await json('GET', 'question?mode=diagnostic');
  equal(next.topic_code, 'math.alg.quadratic', 'topics without questions are skipped');
  await answerWith(next.item_version_id, next.topic_code, 'b', 'diagnostic');
  equal(await json('GET', 'question?mode=diagnostic'), { done: true });
  const state = await json('GET', 'state');
  equal([state.diagnostic, state.content], [{ remaining: 0, total: 2, done: true }, { topics_with_questions: 2 }]);
  ok(state.plan.tasks.every((task: { topic_code: string }) => ['math.alg.quadratic', 'math.num.natural'].includes(task.topic_code)), 'plan uses topics with questions');
  equal(state.trend.length, 1, 'today\'s prediction is kept for the trend');
  equal(state.topics.filter((topic: { has_questions: boolean }) => topic.has_questions).map((topic: { code: string }) => topic.code), ['math.num.natural', 'math.alg.quadratic']);
  equal(state.plan.answered_today, 0, 'diagnostic answers are not practice');
});

Deno.test('the exam path: plan exams, report results, always get a next step', async () => {
  const { call, json, advance, memory } = fixture();
  const certificate = await json('POST', 'milestones', { exam_code: 'uz-certificate-math', sitting_date: '2026-11-23', target_grade: 'A' });
  equal([certificate.next.exam_code, certificate.days_to_next], ['uz-certificate-math', 21]);
  await json('POST', 'milestones', { exam_code: 'uz-admission', sitting_date: '2027-07-20', target_points: 80 });
  const duplicate = await call('POST', 'milestones', { exam_code: 'uz-admission', sitting_date: '2027-07-20' });
  equal([duplicate.status, (await duplicate.json()).code], [409, 'milestone_exists']);
  for (const bad of [{ exam_code: 'ielts', sitting_date: '2026-12-01' }, { exam_code: 'uz-admission', sitting_date: '2031-01-01' }, { exam_code: 'uz-certificate-math', sitting_date: '2026-12-01', target_grade: 'Z' }]) {
    equal((await call('POST', 'milestones', bad)).status, 400, JSON.stringify(bad));
  }
  const id = certificate.milestones[0].id;
  equal((await call('PUT', `milestones/${id}`, { status: 'done', result_grade: 'B+' })).status, 400, 'no result before the exam');
  advance(25 * DAY);
  const waiting = await json('GET', 'state');
  equal(waiting.journey.awaiting_result, [id], 'asks for the result after the date');
  equal(waiting.journey.next.exam_code, 'uz-admission');
  const reported = await json('PUT', `milestones/${id}`, { status: 'done', result_grade: 'B+' });
  equal(reported.suggestions.map((row: { kind: string }) => row.kind), ['certificate_counts', 'retake_certificate']);
  equal(reported.awaiting_result, []);
  ok(memory.calls.includes('saveMilestone:done') && memory.calls.filter((call) => call.startsWith('clearPlan')).length >= 1, 'result saved and plan refreshed');
  equal((await call('DELETE', `milestones/${id}`)).status, 200);
  equal((await call('DELETE', `milestones/${id}`)).status, 404);
});

Deno.test('mistakes come back until answered correctly', async () => {
  const { json, answerWith, advance } = fixture();
  await answerWith('40000000-0000-4000-8000-000000000001', 'math.alg.quadratic', 'b');
  equal((await json('GET', 'state')).mistakes, 1);
  equal(await json('GET', 'question?mode=mistakes'), { done: true }, 'not straight away');
  advance(11 * MINUTE);
  const again = await json('GET', 'question?mode=mistakes');
  equal([again.item_version_id, again.mode, again.remaining], ['40000000-0000-4000-8000-000000000001', 'review', 1]);
  await answerWith(again.item_version_id, again.topic_code, 'a', 'review');
  equal((await json('GET', 'state')).mistakes, 0);
  equal(openMistakes([{ created_at: '', topic_code: 't', item_version_id: 'x', correct: false, mode: 'diagnostic', seconds: null } as HistoryRow]).length, 0, 'diagnostic misses are placement, not mistakes');
});

Deno.test('streaks and today\'s minutes', async () => {
  const { json, answerWith, advance } = fixture();
  for (let day = 0; day < 3; day++) {
    await answerWith('40000000-0000-4000-8000-000000000003', 'math.num.natural', 'a');
    advance(DAY);
  }
  const yesterdayOnly = (await json('GET', 'state')).habit;
  equal([yesterdayOnly.current, yesterdayOnly.best, yesterdayOnly.active_today], [3, 3, false], 'streak survives until today ends');
  await answerWith('40000000-0000-4000-8000-000000000003', 'math.num.natural', 'a');
  const today = (await json('GET', 'state')).habit;
  equal([today.current, today.active_today, today.today.answers, today.daily_minutes], [4, true, 1, 30]);
});

Deno.test('the weekly mock: no keys while sitting, graded once, ranked against others', async () => {
  const { call, json, memory } = fixture();
  memory.goals.set('00000000-0000-4000-8000-0000000000a3', GOAL);
  const mock = await json('POST', 'mock');
  equal([mock.submitted, mock.items.length], [false, 3], 'the bank allows three questions');
  ok(!JSON.stringify(mock).includes('sqrt9') && !JSON.stringify(mock).includes('"correct"'), 'no keys while sitting');
  equal((await json('POST', 'mock')).id, mock.id, 'one mock per week');
  for (const entry of mock.items) equal((await call('PUT', 'mock/answer', { mock_id: mock.id, item_version_id: entry.item_version_id, response: entry.topic_code === 'math.num.natural' ? 'a' : 'b' })).status, 200);
  equal((await call('PUT', 'mock/answer', { mock_id: mock.id, item_version_id: '40000000-0000-4000-8000-000000000004', response: 'a' })).status, 404, 'only its own questions');
  const result = await json('POST', 'mock/submit', { mock_id: mock.id });
  equal([result.correct, result.total, result.points, result.max_points, result.percentile, result.participants], [1, 3, 31, 93, null, 1]);
  equal(result.review.length, 3);
  ok(result.review.every((entry: { solution: string }) => entry.solution), 'solutions after submitting');
  const answersBefore = memory.answers.size;
  equal((await json('POST', 'mock/submit', { mock_id: mock.id })).points, 31, 'resubmitting returns the same result');
  equal(memory.answers.size, answersBefore, 'and records nothing twice');
  equal((await call('PUT', 'mock/answer', { mock_id: mock.id, item_version_id: mock.items[0].item_version_id, response: 'a' })).status, 409, 'closed after submitting');
  // Another learner sits the same week and does better.
  const other = await json('POST', 'mock', undefined, { authorization: 'Bearer other' });
  for (const entry of other.items) await call('PUT', 'mock/answer', { mock_id: other.id, item_version_id: entry.item_version_id, response: 'a' }, { authorization: 'Bearer other' });
  const top = await json('POST', 'mock/submit', { mock_id: other.id }, { authorization: 'Bearer other' });
  equal([top.points, top.percentile, top.participants], [93, 100, 2]);
  equal((await json('GET', 'state')).mock.percentile, 0, 'ranked against the week');
  const mastered = memory.mastery.get('00000000-0000-4000-8000-0000000000a2')!;
  equal(mastered.get('math.alg.quadratic')?.attempts, 2, 'mock answers count towards mastery');
});

Deno.test('the free plan has a daily allowance; the mock needs the full plan', async () => {
  const { call, json, answerWith } = fixture({ plan: 'free', freeDaily: 2 });
  const state = await json('GET', 'state');
  equal([state.access, state.mock.locked], [{ plan: 'free', daily_limit: 2, remaining_today: 2 }, true]);
  await answerWith('40000000-0000-4000-8000-000000000001', 'math.alg.quadratic', 'a');
  await answerWith('40000000-0000-4000-8000-000000000002', 'math.alg.quadratic', 'a');
  const blocked = await call('GET', 'question?mode=practice&topic=math.alg.quadratic');
  equal([blocked.status, (await blocked.json()).limit], [402, 2]);
  equal((await call('GET', 'question?mode=diagnostic')).status, 200, 'the diagnostic is always free');
  equal((await call('POST', 'mock')).status, 402);
  equal((await json('GET', 'state')).access.remaining_today, 0);
  const plus = fixture({ plan: 'plus' });
  equal((await plus.json('GET', 'state')).access, { plan: 'plus', daily_limit: null, remaining_today: null });
});

Deno.test('question choice prefers unseen items near the target difficulty', () => {
  const a = question('a', 't', 'easy'), b = question('b', 't', 'hard'), c = question('c', 't', 'medium');
  equal(pickQuestion([a, b, c], new Set(), 'hard', () => 0)?.id, 'b');
  equal(pickQuestion([a, b, c], new Set(['b']), 'hard', () => 0)?.id, 'c');
  equal(pickQuestion([a], new Set(['a']), 'hard', () => 0)?.id, 'a', 'falls back to seen items');
  equal(pickQuestion([], new Set(), 'easy', () => 0), null);
});
