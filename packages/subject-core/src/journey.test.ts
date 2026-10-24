import { mockBlueprint, mockMinutes, nextMilestone, awaitingResult, percentile, streak, suggestNext, weekOf, UZ_ADMISSION_2026, UZ_MATH_CERTIFICATE_2026, UZ_MATH_TOPICS, type Milestone } from './mod.ts';

const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const milestone = (overrides: Partial<Milestone>): Milestone => ({ id: crypto.randomUUID(), exam_code: 'uz-certificate-math', sitting_date: '2026-11-23', target_points: null, target_grade: 'A', status: 'planned', result_points: null, result_grade: null, ...overrides });

Deno.test('the next exam is the nearest planned one; past ones wait for a result', () => {
  const rows = [milestone({ sitting_date: '2027-07-20', exam_code: 'uz-admission' }), milestone({ sitting_date: '2026-11-23' }), milestone({ sitting_date: '2026-10-01' })];
  equal(nextMilestone(rows, '2026-10-24')?.sitting_date, '2026-11-23');
  equal(awaitingResult(rows, '2026-10-24').map((row) => row.sitting_date), ['2026-10-01']);
  equal(nextMilestone([], '2026-10-24'), null);
});

Deno.test('there is always a next step after an exam', () => {
  // New learner: plan a certificate and the admission test.
  equal(suggestNext([], UZ_MATH_CERTIFICATE_2026, '2026-10-24').map((row) => row.kind), ['plan_certificate', 'plan_admission']);
  // B+ on the certificate: it counts, and a retake to A is worth points.
  const bPlus = suggestNext([milestone({ status: 'done', sitting_date: '2026-09-28', result_grade: 'B+' })], UZ_MATH_CERTIFICATE_2026, '2026-10-24');
  equal(bPlus.map((row) => row.kind), ['certificate_counts', 'retake_certificate', 'plan_admission']);
  equal(bPlus[0], { kind: 'certificate_counts', grade: 'B+', points: [{ section_id: 'compulsory_math', points: 11 }, { section_id: 'specialised_1', points: 85.8 }, { section_id: 'specialised_2', points: 58.2 }] });
  // A on the certificate and the admission test planned: keep knowledge fresh.
  const done = suggestNext([milestone({ status: 'done', result_grade: 'A', sitting_date: '2026-09-28' }), milestone({ exam_code: 'uz-admission', sitting_date: '2027-07-20', target_grade: null })], UZ_MATH_CERTIFICATE_2026, '2026-10-24');
  equal(done.map((row) => row.kind), ['certificate_counts', 'keep_reviewing']);
  // A retake already planned is not suggested again; the best grade counts.
  const planned = suggestNext([milestone({ status: 'done', result_grade: 'C', sitting_date: '2026-05-01' }), milestone({ status: 'done', result_grade: 'B', sitting_date: '2026-09-28' }), milestone({ sitting_date: '2026-11-23' })], UZ_MATH_CERTIFICATE_2026, '2026-10-24');
  equal(planned.map((row) => row.kind), ['certificate_counts', 'plan_admission']);
  equal((planned[0] as { grade: string }).grade, 'B');
  // Below C: no certificate, and a retake is suggested.
  equal(suggestNext([milestone({ status: 'done', result_grade: 'none', sitting_date: '2026-09-28' })], UZ_MATH_CERTIFICATE_2026, '2026-10-24').map((row) => row.kind), ['retake_certificate', 'plan_admission']);
});

Deno.test('streaks count consecutive days and survive until the end of today', () => {
  equal(streak(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'], '2026-10-24'), { current: 4, best: 4, active_today: false });
  equal(streak(['2026-10-23', '2026-10-24', '2026-10-24'], '2026-10-24'), { current: 2, best: 2, active_today: true });
  equal(streak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-22'], '2026-10-24'), { current: 0, best: 3, active_today: false });
  equal(streak([], '2026-10-24'), { current: 0, best: 0, active_today: false });
  equal(streak(['2026-02-28', '2026-03-01'], '2026-03-01').current, 2, 'month boundary');
});

Deno.test('mocks follow the official question count and topic weights', () => {
  const all = new Map(UZ_MATH_TOPICS.topics.map((topic) => [topic.code, 5]));
  const specialised = mockBlueprint(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'specialised_1', all);
  equal([...specialised.values()].reduce((a, b) => a + b, 0), 30, 'specialised count');
  equal(Math.max(...specialised.values()) - Math.min(...specialised.values()) <= 1, true, 'even spread for equal weights');
  const compulsory = mockBlueprint(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'compulsory_math', all);
  equal([...compulsory.values()].reduce((a, b) => a + b, 0), 10, 'compulsory count');
  // Few questions in the bank: take what exists, never more than a topic has.
  const thin = new Map([['math.alg.quadratic', 3], ['math.geo.triangles', 1]]);
  equal(Object.fromEntries(mockBlueprint(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'specialised_1', thin)), { 'math.alg.quadratic': 3, 'math.geo.triangles': 1 });
  equal(mockBlueprint(UZ_MATH_TOPICS, UZ_ADMISSION_2026, 'specialised_1', new Map()).size, 0);
  equal(mockMinutes(30), 60);
});

Deno.test('percentile and weeks', () => {
  equal(percentile(50, [10, 20, 50, 80]), 63);
  equal(percentile(90, [10, 20]), 100);
  equal(percentile(5, [10, 20]), 0);
  equal(percentile(5, []), null);
  equal(['2026-10-26', '2026-10-28', '2026-11-01'].map(weekOf), ['2026-10-26', '2026-10-26', '2026-10-26']);
});
