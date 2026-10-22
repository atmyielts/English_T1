import {
  assertPublishable, blockShares, buildDailyPlan, certificateAdmissionPoints, certificateGrade, certificateProblems, classifyError,
  formatMaxScore, formatProblems, initialMastery, masteryLevel, predictSection, publishBlockers, scoreSection,
  knownTopics, taxonomyProblems, topicPriorities, updateMastery,
  UZ_ADMISSION_2026, UZ_MATH_CERTIFICATE_2026, UZ_MATH_TOPICS,
  type ExamFormat, type MasteryState, type Taxonomy,
} from './mod.ts';

const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, label: string) => {
  if (!value) throw new Error(label);
};
const throws = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}`);
};
const NOW = new Date('2026-11-01T09:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const answer = (state: MasteryState, correct: boolean, at = NOW, difficulty = 0, hints_used = 0) => updateMastery(state, { correct, difficulty, at, hints_used });
/** `count` answers on medium items, all correct (1) or all wrong (0). */
const practised = (correctRate: 0 | 1, count: number, at = NOW) => {
  let state = initialMastery();
  for (let i = 0; i < count; i++) state = answer(state, correctRate === 1, at);
  return state;
};

Deno.test('the admission format adds up to 189 points and stays a draft until checked officially', () => {
  equal(formatProblems(UZ_ADMISSION_2026), [], 'problems');
  equal(formatMaxScore(UZ_ADMISSION_2026), 189, 'max');
  equal(UZ_ADMISSION_2026.sections.reduce((sum, section) => sum + section.questions, 0), 90, 'questions');
  equal(scoreSection(UZ_ADMISSION_2026, 'compulsory_math', 10), 11, 'compulsory math');
  equal(scoreSection(UZ_ADMISSION_2026, 'specialised_1', 30), 93, 'first specialised');
  equal(scoreSection(UZ_ADMISSION_2026, 'specialised_2', 30), 63, 'second specialised');
  equal(scoreSection(UZ_ADMISSION_2026, 'specialised_1', 17, 5), 52.7, 'no penalty while the rule is unknown');
  throws(() => scoreSection(UZ_ADMISSION_2026, 'compulsory_math', 8, 3), 'invalid_counts');
  throws(() => scoreSection(UZ_ADMISSION_2026, 'missing', 1), 'section_not_found');
  const blockers = publishBlockers(UZ_ADMISSION_2026);
  for (const blocker of ['source_url', 'checked_by', 'effective_from', 'duration_minutes', 'scoring.wrong_answer_penalty']) ok(blockers.includes(blocker), `blocker ${blocker}`);
  throws(() => assertPublishable(UZ_ADMISSION_2026), 'format_not_publishable');
});

Deno.test('a format publishes only with an official source, a checker and no open checks', () => {
  const official = 'https://example.test/official-specification';
  const checked: ExamFormat = {
    ...UZ_ADMISSION_2026,
    source_url: official,
    sources: [...UZ_ADMISSION_2026.sources, { url: official, kind: 'official', note: 'Agency specification' }],
    checked_by: 'content-lead',
    effective_from: '2027-06-01',
    duration_minutes: 180,
    scoring: { max_score: 189, wrong_answer_penalty: 0 },
    verify: [],
  };
  equal(publishBlockers(checked), [], 'blockers');
  equal(publishBlockers({ ...checked, sources: UZ_ADMISSION_2026.sources }), ['source_url'], 'press is not official');
  equal(formatProblems({ ...checked, scoring: { max_score: 190, wrong_answer_penalty: 0 } }), ['scoring.max_score'], 'max mismatch');
  equal(scoreSection({ ...checked, scoring: { max_score: 189, wrong_answer_penalty: 1 } }, 'compulsory_math', 1, 3), 0, 'never below zero');
});

Deno.test('certificate grades and admission points', () => {
  equal(certificateProblems(UZ_MATH_CERTIFICATE_2026), [], 'problems');
  equal([75, 70, 69.9, 60, 55, 50, 46, 45.9, 76, -1].map((score) => certificateGrade(UZ_MATH_CERTIFICATE_2026, score)), ['A+', 'A+', 'A', 'B+', 'B', 'C+', 'C', null, null, null]);
  equal(certificateAdmissionPoints(UZ_MATH_CERTIFICATE_2026, 'specialised_1', 'B'), 78.7);
  equal(certificateAdmissionPoints(UZ_MATH_CERTIFICATE_2026, 'compulsory_math', 'C'), 11);
  equal(certificateAdmissionPoints(UZ_MATH_CERTIFICATE_2026, 'specialised_2', null), null);
  equal(certificateProblems({ ...UZ_MATH_CERTIFICATE_2026, admission_points: { specialised_1: { A: 80, 'B+': 90 } } }), ['admission_points.specialised_1.B+']);
});

Deno.test('the maths topic graph is consistent and covers both blocks in three languages', () => {
  equal(taxonomyProblems(UZ_MATH_TOPICS), [], 'problems');
  for (const block of ['compulsory', 'specialised'] as const) {
    const total = [...blockShares(UZ_MATH_TOPICS, block).values()].reduce((sum, share) => sum + share, 0);
    ok(Math.abs(total - 1) < 1e-9, `${block} shares`);
  }
  ok(blockShares(UZ_MATH_TOPICS, 'specialised').size > blockShares(UZ_MATH_TOPICS, 'compulsory').size, 'specialised is wider');
  const cyclic: Taxonomy = { ...UZ_MATH_TOPICS, topics: [
    { ...UZ_MATH_TOPICS.topics[0], code: 'x.a', prerequisites: ['x.b'] },
    { ...UZ_MATH_TOPICS.topics[0], code: 'x.b', prerequisites: ['x.a'] },
  ] };
  ok(taxonomyProblems(cyclic).some((problem) => problem.endsWith('.cycle')), 'cycle');
  equal(taxonomyProblems({ ...UZ_MATH_TOPICS, topics: [{ ...UZ_MATH_TOPICS.topics[0], prerequisites: ['math.none'] }] }), ['math.num.natural.prerequisite.math.none']);
  equal(knownTopics(UZ_MATH_TOPICS, ['algebra', 'math.geo.circles', 'math.alg.quadratic']), ['math.alg.quadratic', 'math.geo.circles']);
});

Deno.test('mastery rises with correct answers, settles with evidence and fades without practice', () => {
  const start = initialMastery();
  equal(Math.round(masteryLevel(start, NOW) * 100), 50, 'prior');
  const first = answer(start, true);
  ok(first.theta > 0 && first.precision > start.precision, 'first correct');
  const steady = practised(1, 20);
  const step = answer(steady, true).theta - steady.theta;
  ok(step < first.theta - start.theta, 'smaller steps with more evidence');
  ok(masteryLevel(steady, NOW) > 0.85, 'strong mastery');
  ok(masteryLevel(practised(0, 10), NOW) < 0.2, 'weak mastery');
  ok(masteryLevel(steady, days(180)) < masteryLevel(steady, NOW), 'forgetting widens uncertainty');
  ok(answer(start, true, NOW, 0, 2).theta < first.theta, 'hints count partly');
  equal(answer(answer(start, true), true).box, 2, 'box rises');
  equal(answer(steady, false).box, 0, 'mistake resets box');
  equal(answer(start, true).next_review_at, days(2).toISOString(), 'review after two days');
  equal(classifyError(steady, NOW, 0), 'slip', 'slip on a strong topic');
  equal(classifyError(practised(0, 10), NOW, 0), 'concept', 'gap on a weak topic');
});

Deno.test('the daily plan puts weak high-weight topics first, sends weak prerequisites ahead and fits the time', () => {
  const mastery = new Map<string, MasteryState>();
  for (const topic of UZ_MATH_TOPICS.topics) mastery.set(topic.code, practised(1, 15));
  mastery.set('math.alg.quadratic', practised(0, 8));
  mastery.set('math.alg.linear', practised(0, 8));
  const input = { taxonomy: UZ_MATH_TOPICS, format: UZ_ADMISSION_2026, sectionId: 'specialised_1', mastery, now: NOW, examDate: days(120), minutes: 30 };
  const priorities = topicPriorities(input);
  equal(priorities.slice(0, 2).map((row) => row.topic_code).sort(), ['math.alg.linear', 'math.alg.quadratic'], 'weakest first');
  equal(priorities[0].topic_code, 'math.alg.linear', 'prerequisite before the topic it unlocks');
  const plan = buildDailyPlan(input);
  ok(plan.reduce((sum, task) => sum + task.questions, 0) <= 10, 'fits 30 minutes at 3 minutes a question');
  equal(plan[0].difficulty, 'easy', 'weak topic practised at an easier level');
  ok(plan[0].points_recoverable > 0, 'shows points to gain');
  // A strong topic past its review date comes back as review.
  mastery.set('math.geo.circles', { ...practised(1, 15, days(-40)), next_review_at: days(-1).toISOString() });
  ok(buildDailyPlan({ ...input, minutes: 60 }).some((task) => task.topic_code === 'math.geo.circles' && task.reason === 'review'), 'due review');
  equal(buildDailyPlan({ ...input, minutes: 0 }), [], 'no time, no tasks');
  // Topics without questions yet are left out rather than planned.
  const available = new Set(['math.alg.quadratic', 'math.geo.circles']);
  equal(buildDailyPlan({ ...input, minutes: 60, available }).map((task) => task.topic_code).sort(), ['math.alg.quadratic', 'math.geo.circles'], 'only available topics');
});

Deno.test('the predicted range is honest about how much we know', () => {
  const none = predictSection(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'specialised_1', new Map(), NOW);
  equal([none.max, none.confidence, none.coverage], [93, 'low', 0], 'no evidence');
  ok(Math.abs(none.expected - 46.5) < 0.1 && none.high - none.low > 30, 'wide range around the middle');
  const strong = new Map<string, MasteryState>();
  for (const topic of UZ_MATH_TOPICS.topics) strong.set(topic.code, practised(1, 12));
  const good = predictSection(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'specialised_1', strong, NOW);
  ok(good.expected > 70 && good.high <= 93 && good.low < good.expected && good.high - good.low < none.high - none.low, 'strong learner');
  equal(good.confidence, 'high', 'confidence');
  const compulsory = predictSection(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'compulsory_math', strong, NOW);
  equal(compulsory.max, 11, 'compulsory max');
});
