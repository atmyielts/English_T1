import { T } from '../src/localize.ts';
import type { PhotoHelp, WritingTask } from '../src/types.ts';
import type { L } from './bank.ts';

// "Write out your full solution": the learner types it or sends a photo of their
// working, and the solution rubric checks the method, the working, the reasoning and the
// answer, quoting the line where it went wrong. Each task's verified answer is in
// WRITING_KEYS (checked by computation in test/maths-answers.test.ts) and is given to the
// assessor in the notes, so it never has to solve the problem itself.

/** The verified answer of each task: a number, a set of numbers, or an interval in the pack's notation. */
export const WRITING_KEYS: Record<string, { text: string; value?: number; set?: number[]; interval?: string }> = {
  'write.quadratic': { text: 'x = −3 or x = 5', set: [-3, 5] },
  'write.inequality': { text: '[1; 5]', interval: '[1; 5]' },
  'write.irrational': { text: 'x = 3 (x = −1 is extraneous)', set: [3] },
  'write.exponential': { text: 'x = 2 (2^x = −1 has no solution)', set: [2] },
  'write.logarithm': { text: 'x = 7 (x = −5 is outside the domain)', set: [7] },
  'write.motion': { text: '2 hours', value: 2 },
  'write.triangle': { text: '6.72', value: 6.72 },
  'write.extremum': { text: 'maximum 10 at x = −1, minimum −22 at x = 3', set: [10, -22] },
  'write.probability': { text: '13/28', value: 13 / 28 },
  'write.progression': { text: 'n = 10', value: 10 },
  'write.cone': { text: 'V = 9√3·π ≈ 48.97', value: 9 * Math.sqrt(3) * Math.PI },
  'write.trig': { text: 'x = 2π/3 and x = 4π/3', set: [(2 * Math.PI) / 3, (4 * Math.PI) / 3] },
};

function task(id: string, node: string, title: L & { en: string }, prompt: L, steps: string, minutes = 12): WritingTask {
  const key = WRITING_KEYS[id];
  return {
    id, kind: 'writing', rubric: 'maths.solution', node, levels: [0, 100], minutes, title, prompt: T(prompt), minWords: 20, recommendedMinutes: minutes,
    assessorNotes: `Verified answer: ${key.text}. Key steps: ${steps} Credit any correct method; a different valid route scores as well as this one. Quote the exact line where the first error happens.`,
  };
}

export const writing: WritingTask[] = [
  task('write.quadratic', 'math.alg.quadratic', { uz: 'Kvadrat tenglama', ru: 'Квадратное уравнение', en: 'A quadratic equation' },
    { uz: 'Tenglamani yeching va yechimingizni to‘liq yozing: x² − 2x − 15 = 0. Ildizlarni tekshiring.', ru: 'Решите уравнение и запишите решение полностью: x² − 2x − 15 = 0. Проверьте корни.' },
    'D = 4 + 60 = 64, x = (2 ± 8)/2, so 5 and −3; substitution check: 25 − 10 − 15 = 0 and 9 + 6 − 15 = 0. Factoring (x − 5)(x + 3) = 0 is equally good.'),
  task('write.inequality', 'math.alg.inequalities', { uz: 'Kvadrat tengsizlik', ru: 'Квадратное неравенство', en: 'A quadratic inequality' },
    { uz: 'Tengsizlikni oraliqlar usulida yeching va har bir qadamni yozing: (x − 1)(x − 5) ≤ 0.', ru: 'Решите неравенство методом интервалов, записывая каждый шаг: (x − 1)(x − 5) ≤ 0.' },
    'Zeros 1 and 5; signs + on (−∞; 1), − on (1; 5), + on (5; +∞); the inequality is non-strict, so the ends are included: [1; 5].'),
  task('write.irrational', 'math.alg.irrational', { uz: 'Irratsional tenglama', ru: 'Иррациональное уравнение', en: 'A radical equation' },
    { uz: 'Tenglamani yeching: √(2x + 3) = x. Begona ildizlarni qanday aniqlaganingizni yozing.', ru: 'Решите уравнение: √(2x + 3) = x. Объясните, как вы отбросили посторонние корни.' },
    'Condition x ≥ 0; squaring gives x² − 2x − 3 = 0, so 3 and −1; −1 fails x ≥ 0 (√1 = 1 ≠ −1), so x = 3 (√9 = 3).'),
  task('write.exponential', 'math.exp.equations', { uz: 'Ko‘rsatkichli tenglama', ru: 'Показательное уравнение', en: 'An exponential equation' },
    { uz: 'Tenglamani yeching: 4ˣ − 3·2ˣ − 4 = 0. Almashtirishni va qaysi qiymat nima uchun tashlanganini yozing.', ru: 'Решите уравнение: 4ˣ − 3·2ˣ − 4 = 0. Запишите замену и объясните, какое значение отброшено и почему.' },
    't = 2^x > 0; t² − 3t − 4 = 0 gives t = 4 or t = −1; t = −1 is impossible since 2^x > 0; 2^x = 4, x = 2.'),
  task('write.logarithm', 'math.log.equations', { uz: 'Logarifmik tenglama', ru: 'Логарифмическое уравнение', en: 'A logarithmic equation' },
    { uz: 'Tenglamani yeching: log₃ (x + 2) + log₃ (x − 4) = 3. Aniqlanish sohasini yozing.', ru: 'Решите уравнение: log₃ (x + 2) + log₃ (x − 4) = 3. Запишите ОДЗ.' },
    'Domain x > 4; (x + 2)(x − 4) = 27, x² − 2x − 35 = 0, so 7 and −5; −5 is outside the domain; x = 7 (9·3 = 27).'),
  task('write.motion', 'math.word.problems', { uz: 'Harakatga doir masala', ru: 'Задача на движение', en: 'A motion problem' },
    { uz: 'Ikki velosipedchi orasidagi masofa 60 km. Ular bir vaqtda bir-biriga qarab 12 km/soat va 18 km/soat tezlik bilan yo‘lga chiqdi. Necha soatdan keyin uchrashadi? Tenglama tuzib yeching.', ru: 'Расстояние между двумя велосипедистами 60 км. Они одновременно выехали навстречу со скоростями 12 и 18 км/ч. Через сколько часов они встретятся? Составьте уравнение и решите.' },
    'Let t hours: 12t + 18t = 60, 30t = 60, t = 2; check: 24 + 36 = 60 km.', 8),
  task('write.triangle', 'math.geo.triangles', { uz: 'Uchburchak balandligi', ru: 'Высота треугольника', en: 'A triangle height' },
    { uz: 'To‘g‘ri burchakli uchburchakning katetlari 7 va 24. Gipotenuzaga tushirilgan balandlikni toping. Yechimni tushuntirib yozing.', ru: 'Катеты прямоугольного треугольника 7 и 24. Найдите высоту, опущенную на гипотенузу. Запишите решение с объяснением.' },
    'Hypotenuse √(49 + 576) = 25; area 7·24/2 = 84 = 25·h/2, so h = 168/25 = 6.72.'),
  task('write.extremum', 'math.calc.derivative', { uz: 'Eng katta va eng kichik qiymat', ru: 'Наибольшее и наименьшее значение', en: 'Greatest and least values' },
    { uz: 'f(x) = x³ − 3x² − 9x + 5 funksiyaning [−2; 4] kesmadagi eng katta va eng kichik qiymatlarini toping. Hosilani va solishtirgan qiymatlaringizni yozing.', ru: 'Найдите наибольшее и наименьшее значения функции f(x) = x³ − 3x² − 9x + 5 на отрезке [−2; 4]. Запишите производную и сравниваемые значения.' },
    "f'(x) = 3x² − 6x − 9 = 3(x − 3)(x + 1), critical points −1 and 3 in the interval; f(−2) = 3, f(−1) = 10, f(3) = −22, f(4) = −15; greatest 10, least −22.", 15),
  task('write.probability', 'math.prob.combinatorics', { uz: 'Ehtimollik masalasi', ru: 'Задача на вероятность', en: 'A probability problem' },
    { uz: 'Qutida 5 ta oq va 3 ta qora shar bor. Tavakkaliga 2 ta shar olindi. Ikkalasi bir xil rangda bo‘lish ehtimolini toping. Hisobingizni yozing.', ru: 'В коробке 5 белых и 3 чёрных шара. Наугад вынули 2 шара. Найдите вероятность того, что оба шара одного цвета. Запишите расчёт.' },
    'All pairs C(8; 2) = 28; both white C(5; 2) = 10, both black C(3; 2) = 3; (10 + 3)/28 = 13/28.'),
  task('write.progression', 'math.seq.arithmetic', { uz: 'Arifmetik progressiya', ru: 'Арифметическая прогрессия', en: 'An arithmetic progression' },
    { uz: '5 + 9 + 13 + … yig‘indisi 230 ga teng bo‘lishi uchun nechta qo‘shiluvchi olish kerak? Formulani va tenglamani yozing.', ru: 'Сколько слагаемых суммы 5 + 9 + 13 + … нужно взять, чтобы получить 230? Запишите формулу и уравнение.' },
    'a₁ = 5, d = 4, Sₙ = n(2·5 + 4(n − 1))/2 = n(2n + 3) = 230, 2n² + 3n − 230 = 0, n = 10 (the other root is negative); check 10·23 = 230.'),
  task('write.cone', 'math.solid.revolution', { uz: 'Konus hajmi', ru: 'Объём конуса', en: 'A cone volume' },
    { uz: 'Konusning o‘q kesimi tomoni 6 bo‘lgan teng tomonli uchburchak. Konus hajmini toping. Har bir kattalik qayerdan kelganini yozing.', ru: 'Осевое сечение конуса — равносторонний треугольник со стороной 6. Найдите объём конуса. Объясните, откуда взята каждая величина.' },
    'Radius 3 (half the side), height = 6·√3/2 = 3√3, V = π·9·3√3/3 = 9√3·π.'),
  task('write.trig', 'math.trig.equations', { uz: 'Trigonometrik tenglama', ru: 'Тригонометрическое уравнение', en: 'A trigonometric equation' },
    { uz: '2sin² x + 3cos x = 0 tenglamaning [0; 2π] kesmadagi ildizlarini toping. Almashtirishni va ildizlarni tanlashni yozing.', ru: 'Найдите корни уравнения 2sin² x + 3cos x = 0 на отрезке [0; 2π]. Запишите замену и отбор корней.' },
    'Use sin² x = 1 − cos² x: 2cos² x − 3cos x − 2 = 0, cos x = 2 (impossible) or cos x = −1/2; on [0; 2π]: 2π/3 and 4π/3.', 15),
];

export const photoHelp: PhotoHelp = {
  id: 'photo.maths', kind: 'photo_help', node: 'algebra', levels: [0, 100], minutes: 6,
  title: { uz: 'Masala rasmi bo‘yicha yordam', ru: 'Помощь по фото задачи', en: 'Help with a photo of a problem' },
  subject: 'maths', hintLevels: 3, solutionOnRequest: true,
  instructions: [
    'The learner is preparing for the national university admission test in Uzbekistan (school maths, grades 5–11).',
    'Hints come first and never give the answer away: hint 1 names the topic and the method to try, hint 2 the first concrete step with the learner\'s own numbers, hint 3 the key transformation that unlocks the problem.',
    'The solution is a short numbered list of steps a school student can follow, using the standard school notation of Uzbekistan and Russia (intervals as (a; b], decimals with a comma).',
    'Always end the solution with a check: substitute the answer, test the domain (denominators, even roots, logarithms) or estimate, and say which roots were rejected and why.',
    'If the photo shows several problems, help with the first complete one and say so. If the problem is not maths, or it is an exam paper being sat right now, say you can only help with practice problems.',
  ].join(' '),
};
