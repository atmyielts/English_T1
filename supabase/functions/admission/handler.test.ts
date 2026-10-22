import type { AnswerKey, Item } from '../../../packages/assessment-core/src/mod.ts';
import { initialMastery, type MasteryState, type PlanTask } from '../../../packages/subject-core/src/mod.ts';
import { AdmissionError, createAdmissionHandler, pickQuestion, tashkentDate, type AdmissionRepository, type AnswerInput, type Candidate, type Goal } from './handler.ts';

const learner = '00000000-0000-4000-8000-0000000000a2';
const origin = 'https://admission.schood.online';
const NOW = new Date('2026-11-01T20:30:00Z'); // 01:30 on 2 November in Tashkent
const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, label: string) => {
  if (!value) throw new Error(label);
};
const question = (id: string, topic: string, difficulty: 'easy' | 'medium' | 'hard' = 'medium', locale: 'uz' | 'ru' = 'uz'): Candidate & { key: AnswerKey } => ({
  id,
  item: { schema_version: 'assessment.item.v1', type: 'single_choice', prompt: String.raw`\(x^2=9\), \(x>0\). x?`, locale, max_score: 1, tags: [], options: [{ id: 'a', text: '3' }, { id: 'b', text: '-3' }], classification: { topics: [topic], estimated_difficulty: difficulty } } as Item,
  key: { correct: 'a', case_sensitive: false, partial_credit: false, solution: String.raw`\(x=\sqrt9=3\)` },
});

function fixture(options: { goal?: Goal | null; enabled?: boolean; conflicts?: number } = {}) {
  let goal: Goal | null = options.goal === undefined ? { section_id: 'specialised_1', question_locale: 'uz', daily_minutes: 30, exam_date: '2027-07-01', target_points: 70, exam_code: 'uz-admission', format_version: '2026.1' } : options.goal;
  const mastery = new Map<string, MasteryState>(), plans = new Map<string, PlanTask[]>(), answers = new Map<string, AnswerInput & { topic: string }>();
  const bank = [question('40000000-0000-4000-8000-000000000001', 'math.alg.quadratic'), question('40000000-0000-4000-8000-000000000002', 'math.alg.quadratic', 'easy'), question('40000000-0000-4000-8000-000000000003', 'math.num.natural'), question('40000000-0000-4000-8000-000000000004', 'math.num.natural', 'medium', 'ru')];
  let conflicts = options.conflicts ?? 0;
  const calls: string[] = [];
  const repository: AdmissionRepository = {
    user: (token) => Promise.resolve(token === 'valid' ? learner : null),
    goal: () => Promise.resolve(goal),
    saveGoal: (_user, next) => { goal = next; calls.push('saveGoal'); return Promise.resolve(); },
    mastery: () => Promise.resolve(new Map(mastery)),
    plan: (_user, date) => Promise.resolve(plans.get(date) ?? null),
    savePlan: (_user, date, tasks) => { if (!plans.has(date)) plans.set(date, tasks); calls.push(`savePlan:${date}`); return Promise.resolve(plans.get(date)!); },
    clearPlan: (_user, date) => { plans.delete(date); calls.push(`clearPlan:${date}`); return Promise.resolve(); },
    answeredSince: () => Promise.resolve([...answers.values()].map((row) => ({ topic_code: row.topic, correct: row.correct, mode: row.mode }))),
    recentItems: () => Promise.resolve([...answers.values()].map((row) => row.item_version_id)),
    candidates: (topic, locale) => Promise.resolve(bank.filter((row) => row.item.classification?.topics.includes(topic) && row.item.locale === locale).map(({ id, item }) => ({ id, item }))),
    itemWithKey: (id) => Promise.resolve(bank.find((row) => row.id === id) ?? null),
    coveredTopics: (locale) => Promise.resolve(new Set(bank.filter((row) => row.item.locale === locale).flatMap((row) => row.item.classification?.topics ?? []))),
    recordAnswer: (_user, topic, answer, expected, state) => {
      const existing = answers.get(answer.client_answer_id);
      if (existing) return Promise.resolve({ replayed: true, answer: { correct: existing.correct, error_kind: existing.error_kind, topic_code: existing.topic, item_version_id: existing.item_version_id } });
      if (conflicts-- > 0 || (mastery.get(topic)?.attempts ?? 0) !== expected) return Promise.reject(new AdmissionError('mastery_conflict', 'conflict', 409));
      answers.set(answer.client_answer_id, { ...answer, topic });
      mastery.set(topic, state);
      return Promise.resolve({ replayed: false, answer: { correct: answer.correct, error_kind: answer.error_kind, topic_code: topic, item_version_id: answer.item_version_id } });
    },
  };
  const handle = createAdmissionHandler(repository, [origin], { enabled: options.enabled ?? true, now: () => NOW, random: () => 0 });
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    handle(new Request(`https://x.invalid/functions/v1/admission/${path}`, { method, headers: { authorization: 'Bearer valid', origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  return { call, mastery, plans, answers, calls, goal: () => goal };
}

Deno.test('plans change at midnight in Tashkent', () => {
  equal(tashkentDate(NOW), '2026-11-02');
  equal(tashkentDate(new Date('2026-11-01T18:59:00Z')), '2026-11-01');
});

Deno.test('closed until enabled, and only for signed-in learners from allowed origins', async () => {
  equal((await fixture({ enabled: false }).call('GET', 'state')).status, 503);
  const { call } = fixture();
  equal((await call('GET', 'state', undefined, { authorization: 'Bearer nope' })).status, 401);
  equal((await call('GET', 'state', undefined, { origin: 'https://evil.example' })).status, 403);
  const allowed = await call('GET', 'state');
  equal([allowed.status, allowed.headers.get('access-control-allow-origin'), allowed.headers.get('cache-control')], [200, origin, 'no-store']);
  equal((await call('DELETE', 'state')).status, 404);
});

Deno.test('a new learner sets a goal, which resets the day plan; bad goals are refused', async () => {
  const { call, calls, goal } = fixture({ goal: null });
  const empty = await (await call('GET', 'state')).json();
  equal([empty.goal, empty.plan, empty.topics.length], [null, null, 33]);
  equal((await call('GET', 'question?mode=diagnostic')).status, 409);
  for (const bad of [{ section_id: 'compulsory_history', question_locale: 'uz' }, { section_id: 'specialised_1', question_locale: 'en' }, { section_id: 'specialised_1', question_locale: 'uz', daily_minutes: 500 }, { section_id: 'compulsory_math', question_locale: 'ru', target_points: 12 }, { section_id: 'specialised_1', question_locale: 'uz', exam_date: '2020-01-01' }]) {
    const response = await call('PUT', 'goal', bad);
    equal([response.status, (await response.json()).code], [400, 'invalid_goal'], JSON.stringify(bad));
  }
  const saved = await call('PUT', 'goal', { section_id: 'compulsory_math', question_locale: 'ru', daily_minutes: 20, exam_date: '2027-07-01', target_points: 10 });
  const body = await saved.json();
  equal(saved.status, 200);
  equal(goal(), { section_id: 'compulsory_math', question_locale: 'ru', daily_minutes: 20, exam_date: '2027-07-01', target_points: 10, exam_code: 'uz-admission', format_version: '2026.1' });
  equal(calls.slice(0, 2), ['saveGoal', 'clearPlan:2026-11-02']);
  equal([body.prediction.max, body.diagnostic, body.plan], [11, { remaining: 1, total: 1, done: false }, null], 'no plan before the diagnostic');
});

Deno.test('questions never carry the key; answers are graded, explained, replayed and retried', async () => {
  const { call, mastery, answers } = fixture({ conflicts: 1 });
  const picked = await (await call('GET', 'question?mode=practice&topic=math.alg.quadratic')).json();
  equal([picked.topic_code, picked.item_version_id], ['math.alg.quadratic', '40000000-0000-4000-8000-000000000001'], 'medium question for a new learner');
  const text = JSON.stringify(picked);
  ok(!text.includes('solution') && !text.includes('"correct"') && !text.includes('sqrt9'), 'no key or solution in the question');
  const submission = { client_answer_id: crypto.randomUUID(), item_version_id: picked.item_version_id, topic_code: 'math.alg.quadratic', mode: 'practice', response: 'b', seconds: 35 };
  const wrong = await (await call('POST', 'answer', submission)).json();
  equal([wrong.correct, wrong.error_kind, wrong.correct_answer, wrong.solution, wrong.replayed], [false, 'concept', 'a', String.raw`\(x=\sqrt9=3\)`, false]);
  ok(wrong.mastery.after < wrong.mastery.before, 'mastery fell');
  equal(mastery.get('math.alg.quadratic')?.attempts, 1, 'one update despite a conflict and a retry');
  const replay = await (await call('POST', 'answer', { ...submission, response: 'a' })).json();
  equal([replay.replayed, replay.correct, answers.size, mastery.get('math.alg.quadratic')?.attempts], [true, false, 1, 1], 'replay changes nothing');
  const right = await (await call('POST', 'answer', { ...submission, client_answer_id: crypto.randomUUID(), response: 'a' })).json();
  equal([right.correct, right.error_kind], [true, null]);
  const state = await (await call('GET', 'state')).json();
  equal([state.plan, state.diagnostic.remaining], [null, 1], 'plan waits for the untested topic');
});

Deno.test('answers are refused for unknown, mismatched or malformed input', async () => {
  const { call } = fixture();
  const base = { client_answer_id: crypto.randomUUID(), item_version_id: '40000000-0000-4000-8000-000000000001', topic_code: 'math.alg.quadratic', mode: 'practice', response: 'a' };
  for (const [body, status, code] of [
    [{ ...base, client_answer_id: 'x' }, 400, 'invalid_request'],
    [{ ...base, topic_code: 'math.unknown' }, 400, 'invalid_request'],
    [{ ...base, topic_code: 'math.geo.circles' }, 404, 'not_found'],
    [{ ...base, item_version_id: '40000000-0000-4000-8000-000000000009' }, 404, 'not_found'],
    [{ ...base, mode: 'exam' }, 400, 'invalid_request'],
    [{ ...base, seconds: -1 }, 400, 'invalid_request'],
    [{ ...base, response: 'x'.repeat(20_000) }, 400, 'invalid_request'],
  ] as const) {
    const response = await call('POST', 'answer', body);
    equal([response.status, (await response.json()).code], [status, code], JSON.stringify(body).slice(0, 80));
  }
  equal((await call('GET', 'question?topic=math.geo.circles')).status, 404, 'no questions yet');
  equal((await call('GET', 'question?topic=nope')).status, 400);
});

Deno.test('the diagnostic walks untested topics of the learner block, in order', async () => {
  const { call } = fixture();
  const first = await (await call('GET', 'question?mode=diagnostic')).json();
  equal(first.topic_code, 'math.num.natural');
  const done = await (await call('POST', 'answer', { client_answer_id: crypto.randomUUID(), item_version_id: first.item_version_id, topic_code: first.topic_code, mode: 'diagnostic', response: 'a' })).json();
  equal(done.correct, true);
  const next = await (await call('GET', 'question?mode=diagnostic')).json();
  equal(next.topic_code, 'math.alg.quadratic', 'topics without questions are skipped');
  await call('POST', 'answer', { client_answer_id: crypto.randomUUID(), item_version_id: next.item_version_id, topic_code: next.topic_code, mode: 'diagnostic', response: 'b' });
  equal(await (await call('GET', 'question?mode=diagnostic')).json(), { done: true });
  const state = await (await call('GET', 'state')).json();
  equal([state.diagnostic, state.content], [{ remaining: 0, total: 2, done: true }, { topics_with_questions: 2 }]);
  equal(state.topics.filter((topic: { has_questions: boolean }) => topic.has_questions).map((topic: { code: string }) => topic.code), ['math.num.natural', 'math.alg.quadratic']);
  ok(state.plan.tasks.every((task: { topic_code: string }) => ['math.alg.quadratic', 'math.num.natural'].includes(task.topic_code)), 'plan uses topics with questions');
});

Deno.test('question choice prefers unseen items near the target difficulty', () => {
  const a = question('a', 't', 'easy'), b = question('b', 't', 'hard'), c = question('c', 't', 'medium');
  equal(pickQuestion([a, b, c], new Set(), 'hard', () => 0)?.id, 'b');
  equal(pickQuestion([a, b, c], new Set(['b']), 'hard', () => 0)?.id, 'c');
  equal(pickQuestion([a], new Set(['a']), 'hard', () => 0)?.id, 'a', 'falls back to seen items');
  equal(pickQuestion([], new Set(), 'easy', () => 0), null);
  equal(initialMastery().attempts, 0);
});
