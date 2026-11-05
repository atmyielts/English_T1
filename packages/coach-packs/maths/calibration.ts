import type { CalibrationRun, CalibrationSample } from '../src/types.ts';

// Calibration for `maths.solution`: twelve written solutions to the pack's own writing
// tasks, in Uzbek and Russian, from a complete solution to a wrong method, rated by the
// author on the four criteria (0–100 in steps of 25), with three assessor runs each.
// The runs are authored in the assessor's output shape to test the scoring pipeline and
// the thresholds in CI; they are not evidence that a model agrees. Replace them with
// real runs from scripts/coach-calibration-live.ts --out once a model route exists.

type Entry = [score: number, ...evidence: string[]];
const run = (method: Entry, working: Entry, reasoning: Entry, answer: Entry): CalibrationRun => {
  const entry = ([score, ...evidence]: Entry) => ({ score, evidence });
  return { criteria: { method: entry(method), working: entry(working), reasoning: entry(reasoning), answer: entry(answer) } };
};
const lines = (...text: string[]) => text.join('\n');

const samples: CalibrationSample[] = [
  {
    id: 's01-quadratic-full-uz',
    task: 'write.quadratic: x² − 2x − 15 = 0, solve and check the roots. Verified answer: x = −3 or x = 5.',
    response: lines('x² − 2x − 15 = 0', 'D = (−2)² − 4·1·(−15) = 4 + 60 = 64', 'x = (2 ± 8)/2', 'x₁ = 5, x₂ = −3', 'Tekshiruv: 25 − 10 − 15 = 0 va 9 + 6 − 15 = 0', 'Javob: −3; 5'),
    reference: { method: 100, working: 100, reasoning: 100, answer: 100 },
    rationale: 'The discriminant route, every line correct including the sign of −4ac, both roots checked by substitution and the answer stated as a set. Nothing missing.',
  },
  {
    id: 's02-quadratic-sign-ru',
    task: 'write.quadratic: x² − 2x − 15 = 0, solve and check the roots. Verified answer: x = −3 or x = 5.',
    response: lines('x² − 2x − 15 = 0', 'D = 4 − 60 = −56', 'D < 0, значит корней нет.', 'Ответ: корней нет'),
    reference: { method: 50, working: 25, reasoning: 25, answer: 0 },
    rationale: 'The right tool (the discriminant), but −4·1·(−15) became −60: a sign error that wipes out both roots. "D < 0" is applied correctly to the wrong number, so reasoning gets a start, with no check. The answer is wrong.',
  },
  {
    id: 's03-inequality-brackets-uz',
    task: 'write.inequality: (x − 1)(x − 5) ≤ 0 by the interval method. Verified answer: [1; 5].',
    response: lines('(x − 1)(x − 5) ≤ 0', 'Nollar: x = 1 va x = 5', '(−∞; 1) da ishora +, (1; 5) da −, (5; +∞) da +', 'Manfiy oraliqni olamiz.', 'Javob: (1; 5)'),
    reference: { method: 100, working: 75, reasoning: 50, answer: 50 },
    rationale: 'A textbook interval method with the signs right. But the inequality is non-strict and the ends 1 and 5 are left out: reasoning misses that condition and the answer has the right numbers in the wrong form. Working loses a step for not marking the points as filled.',
  },
  {
    id: 's04-irrational-extraneous-ru',
    task: 'write.irrational: √(2x + 3) = x. Verified answer: x = 3 (x = −1 is extraneous).',
    response: lines('√(2x + 3) = x', 'Возводим обе части в квадрат: 2x + 3 = x²', 'x² − 2x − 3 = 0', 'x₁ = 3, x₂ = −1', 'Ответ: 3; −1'),
    reference: { method: 75, working: 100, reasoning: 25, answer: 50 },
    rationale: 'Squaring is the right plan and the algebra is clean, but no condition x ≥ 0 is written and no root is checked, so the extraneous −1 stays in the answer. The answer is half right.',
  },
  {
    id: 's05-exponential-full-uz',
    task: 'write.exponential: 4^x − 3·2^x − 4 = 0. Verified answer: x = 2.',
    response: lines('2ˣ = t, t > 0 deb olamiz.', 't² − 3t − 4 = 0', 't₁ = 4, t₂ = −1', 't = −1 bo‘lmaydi, chunki 2ˣ har doim musbat.', '2ˣ = 4, demak x = 2.', 'Tekshiruv: 16 − 12 − 4 = 0.', 'Javob: x = 2'),
    reference: { method: 100, working: 100, reasoning: 100, answer: 100 },
    rationale: 'The substitution with its condition t > 0, the rejected value explained in words, the result checked by substitution. A model solution.',
  },
  {
    id: 's06-logarithm-domain-ru',
    task: 'write.logarithm: log₃ (x + 2) + log₃ (x − 4) = 3. Verified answer: x = 7.',
    response: lines('log₃((x + 2)(x − 4)) = 3', '(x + 2)(x − 4) = 27', 'x² − 2x − 8 = 27', 'x² − 2x − 35 = 0', 'x = 7, x = −5', 'Ответ: 7; −5'),
    reference: { method: 75, working: 100, reasoning: 25, answer: 50 },
    rationale: 'The product rule and the step to 27 are right and the quadratic is solved correctly. No domain (x > 4) is written, so −5 is kept: reasoning misses the key condition and the answer carries an extra root.',
  },
  {
    id: 's07-motion-bare-uz',
    task: 'write.motion: two cyclists 60 km apart ride towards each other at 12 and 18 km/h. Verified answer: 2 hours.',
    response: lines('12 + 18 = 30', '60 : 30 = 2', 'Javob: 2 soat'),
    reference: { method: 75, working: 75, reasoning: 25, answer: 100 },
    rationale: 'The closing speed idea is there and the arithmetic is right, but there is no equation and no explanation of why the speeds add; nothing is checked. The answer is right with its unit.',
  },
  {
    id: 's08-triangle-area-ru',
    task: 'write.triangle: legs 7 and 24, the height to the hypotenuse. Verified answer: 6.72.',
    response: lines('Гипотенуза: √(7² + 24²) = √625 = 25.', 'Площадь S = 7·24/2 = 84.', 'Высота h = 84.', 'Ответ: 84'),
    reference: { method: 50, working: 75, reasoning: 25, answer: 0 },
    rationale: 'The hypotenuse and the area are both right and the area is the right route, but the plan stops: the area is reported as the height instead of using S = c·h/2. A confusion of quantities, so reasoning is weak and the answer wrong.',
  },
  {
    id: 's09-extremum-no-ends-uz',
    task: 'write.extremum: f(x) = x³ − 3x² − 9x + 5 on [−2; 4]. Verified answer: greatest 10, least −22.',
    response: lines('f′(x) = 3x² − 6x − 9', '3x² − 6x − 9 = 0, x² − 2x − 3 = 0', 'x = 3, x = −1', 'f(−1) = −1 − 3 + 9 + 5 = 10', 'f(3) = 27 − 27 − 27 + 5 = −22', 'Eng katta qiymat 10, eng kichik qiymat −22.'),
    reference: { method: 75, working: 100, reasoning: 50, answer: 100 },
    rationale: 'The derivative and both critical values are right and so is the answer, but the ends of the interval (f(−2) = 3, f(4) = −15) are never compared: correct here by luck, so method and reasoning lose a step.',
  },
  {
    id: 's10-probability-one-case-ru',
    task: 'write.probability: 5 white and 3 black balls, 2 drawn, the chance both are the same colour. Verified answer: 13/28.',
    response: lines('Всего пар: C(8; 2) = 28.', 'Оба белых: C(5; 2) = 10.', 'P = 10/28 = 5/14.', 'Ответ: 5/14'),
    reference: { method: 50, working: 100, reasoning: 50, answer: 0 },
    rationale: 'Counting with combinations is right and every number is correct, but "the same colour" also includes two black balls (3 pairs): half the cases are missing, so the answer is wrong.',
  },
  {
    id: 's11-progression-wrong-formula-uz',
    task: 'write.progression: how many terms of 5 + 9 + 13 + … make 230. Verified answer: n = 10.',
    response: lines('a₁ = 5, d = 4', 'aₙ = 5 + 4(n − 1) = 230', '4n + 1 = 230', 'n = 57,25', 'Javob: 57'),
    reference: { method: 0, working: 75, reasoning: 0, answer: 0 },
    rationale: 'The n-th term is set equal to the sum, so the method cannot reach the answer. The algebra on that wrong equation is right. A fractional number of terms is rounded instead of being questioned.',
  },
  {
    id: 's12-trig-wrong-ru',
    task: 'write.trig: 2sin² x + 3cos x = 0 on [0; 2π]. Verified answer: 2π/3 and 4π/3.',
    response: lines('2sin²x + 3cos x = 0', 'sin x = 0 или cos x = 0', 'x = π/2'),
    reference: { method: 0, working: 0, reasoning: 0, answer: 0 },
    rationale: 'The equation is treated as if it were a product equal to zero; no identity sin² x = 1 − cos² x and no substitution. Nothing in the working is valid and the answer is wrong.',
  },
];

const runs: Record<string, CalibrationRun[]> = {
  's01-quadratic-full-uz': [
    run([100, 'D = (−2)² − 4·1·(−15) = 4 + 60 = 64'], [100, 'x = (2 ± 8)/2', 'x₁ = 5, x₂ = −3'], [100, 'Tekshiruv: 25 − 10 − 15 = 0 va 9 + 6 − 15 = 0'], [100, 'Javob: −3; 5']),
    run([100, 'x = (2 ± 8)/2'], [100, '4 + 60 = 64'], [100, '9 + 6 − 15 = 0'], [100, 'Javob: −3; 5']),
    run([100, 'D = (−2)² − 4·1·(−15)'], [100, 'x₁ = 5, x₂ = −3'], [75, 'Tekshiruv: 25 − 10 − 15 = 0'], [100, '−3; 5']),
  ],
  's02-quadratic-sign-ru': [
    run([50, 'D = 4 − 60 = −56'], [25, 'D = 4 − 60 = −56'], [25, 'D < 0, значит корней нет.'], [0, 'Ответ: корней нет']),
    run([50, 'D = 4 − 60'], [25, '4 − 60 = −56'], [25, 'значит корней нет'], [0, 'корней нет']),
    run([25, 'D = 4 − 60 = −56'], [25, 'D = 4 − 60 = −56'], [25, 'D < 0, значит корней нет.'], [0, 'Ответ: корней нет']),
  ],
  's03-inequality-brackets-uz': [
    run([100, 'Nollar: x = 1 va x = 5'], [75, '(1; 5) da −'], [50, 'Manfiy oraliqni olamiz.'], [50, 'Javob: (1; 5)']),
    run([100, '(−∞; 1) da ishora +, (1; 5) da −, (5; +∞) da +'], [75, 'Nollar: x = 1 va x = 5'], [50, 'Manfiy oraliqni olamiz'], [50, 'Javob: (1; 5)']),
    run([100, 'Nollar: x = 1 va x = 5'], [100, '(−∞; 1) da ishora +'], [50, 'Manfiy oraliqni olamiz.'], [25, 'Javob: (1; 5)']),
  ],
  's04-irrational-extraneous-ru': [
    run([75, 'Возводим обе части в квадрат: 2x + 3 = x²'], [100, 'x² − 2x − 3 = 0', 'x₁ = 3, x₂ = −1'], [25, 'Ответ: 3; −1'], [50, 'Ответ: 3; −1']),
    run([75, 'Возводим обе части в квадрат'], [100, 'x₁ = 3, x₂ = −1'], [25, 'Ответ: 3; −1'], [50, '3; −1']),
    run([50, 'Возводим обе части в квадрат: 2x + 3 = x²'], [100, 'x² − 2x − 3 = 0'], [25, 'x₁ = 3, x₂ = −1'], [50, 'Ответ: 3; −1']),
  ],
  's05-exponential-full-uz': [
    run([100, '2ˣ = t, t > 0 deb olamiz.'], [100, 't₁ = 4, t₂ = −1'], [100, 't = −1 bo‘lmaydi, chunki 2ˣ har doim musbat.'], [100, 'Javob: x = 2']),
    run([100, 't² − 3t − 4 = 0'], [100, '2ˣ = 4, demak x = 2.'], [100, 'Tekshiruv: 16 − 12 − 4 = 0.'], [100, 'x = 2']),
    run([100, '2ˣ = t, t > 0 deb olamiz'], [100, 't² − 3t − 4 = 0', 't₁ = 4, t₂ = −1'], [100, 'chunki 2ˣ har doim musbat'], [100, 'Javob: x = 2']),
  ],
  's06-logarithm-domain-ru': [
    run([75, 'log₃((x + 2)(x − 4)) = 3'], [100, 'x² − 2x − 35 = 0'], [25, 'x = 7, x = −5'], [50, 'Ответ: 7; −5']),
    run([75, '(x + 2)(x − 4) = 27'], [100, 'x² − 2x − 8 = 27', 'x = 7, x = −5'], [25, 'Ответ: 7; −5'], [50, 'Ответ: 7; −5']),
    run([75, 'log₃((x + 2)(x − 4)) = 3'], [75, 'x² − 2x − 35 = 0'], [25, 'x = 7, x = −5'], [50, '7; −5']),
  ],
  's07-motion-bare-uz': [
    run([75, '12 + 18 = 30'], [75, '60 : 30 = 2'], [25, '60 : 30 = 2'], [100, 'Javob: 2 soat']),
    run([75, '12 + 18 = 30'], [75, '60 : 30 = 2'], [25, '12 + 18 = 30'], [100, '2 soat']),
    run([50, '12 + 18 = 30'], [75, '60 : 30 = 2'], [25, 'Javob: 2 soat'], [100, 'Javob: 2 soat']),
  ],
  's08-triangle-area-ru': [
    run([50, 'Площадь S = 7·24/2 = 84.'], [75, 'Гипотенуза: √(7² + 24²) = √625 = 25.'], [25, 'Высота h = 84.'], [0, 'Ответ: 84']),
    run([50, 'Площадь S = 7·24/2 = 84'], [75, '√625 = 25'], [25, 'Высота h = 84'], [0, 'Ответ: 84']),
    run([50, 'Гипотенуза: √(7² + 24²) = √625 = 25.'], [100, 'Площадь S = 7·24/2 = 84.'], [25, 'Высота h = 84.'], [0, '84']),
  ],
  's09-extremum-no-ends-uz': [
    run([75, 'f′(x) = 3x² − 6x − 9'], [100, 'f(−1) = −1 − 3 + 9 + 5 = 10', 'f(3) = 27 − 27 − 27 + 5 = −22'], [50, 'x = 3, x = −1'], [100, 'Eng katta qiymat 10, eng kichik qiymat −22.']),
    run([75, '3x² − 6x − 9 = 0, x² − 2x − 3 = 0'], [100, 'f(3) = 27 − 27 − 27 + 5 = −22'], [50, 'Eng katta qiymat 10'], [100, 'eng kichik qiymat −22']),
    run([100, 'f′(x) = 3x² − 6x − 9'], [100, 'f(−1) = −1 − 3 + 9 + 5 = 10'], [50, 'x = 3, x = −1'], [100, 'Eng katta qiymat 10, eng kichik qiymat −22.']),
  ],
  's10-probability-one-case-ru': [
    run([50, 'Оба белых: C(5; 2) = 10.'], [100, 'Всего пар: C(8; 2) = 28.'], [50, 'P = 10/28 = 5/14.'], [0, 'Ответ: 5/14']),
    run([50, 'Оба белых: C(5; 2) = 10'], [100, 'P = 10/28 = 5/14'], [50, 'Всего пар: C(8; 2) = 28.'], [0, 'Ответ: 5/14']),
    run([50, 'Всего пар: C(8; 2) = 28.'], [100, 'Оба белых: C(5; 2) = 10.'], [25, 'P = 10/28 = 5/14.'], [0, '5/14']),
  ],
  's11-progression-wrong-formula-uz': [
    run([0, 'aₙ = 5 + 4(n − 1) = 230'], [75, '4n + 1 = 230'], [0, 'n = 57,25'], [0, 'Javob: 57']),
    run([0, 'aₙ = 5 + 4(n − 1) = 230'], [75, 'n = 57,25'], [0, 'Javob: 57'], [0, 'Javob: 57']),
    run([25, 'aₙ = 5 + 4(n − 1) = 230'], [75, '4n + 1 = 230'], [0, 'n = 57,25'], [0, '57']),
  ],
  's12-trig-wrong-ru': [
    run([0, 'sin x = 0 или cos x = 0'], [0, 'sin x = 0 или cos x = 0'], [0, 'x = π/2'], [0, 'x = π/2']),
    run([0, 'sin x = 0 или cos x = 0'], [0, 'x = π/2'], [0, 'sin x = 0 или cos x = 0'], [0, 'x = π/2']),
    run([0, '2sin²x + 3cos x = 0'], [25, 'sin x = 0 или cos x = 0'], [0, 'x = π/2'], [0, 'x = π/2']),
  ],
};

export const solutionCalibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = { samples, runs };
