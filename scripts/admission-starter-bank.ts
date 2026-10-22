// Starter Maths question bank for Schood Admission, as an Assessment Cloud import file.
//
// Every answer is computed here, so the arithmetic is right by construction. The
// wording and the choice of questions are machine drafts: import them into the
// Schood content workspace as drafts, and have a reviewer who did not write them
// correct and approve each one before learners see it (Assessment Cloud enforces
// a different approver). Uzbek (Latin) and Russian versions are separate questions.
//
//   deno run --no-lock --allow-write=output scripts/admission-starter-bank.ts [variants-per-topic]
import { validateItem, validateKey, type AnswerKey, type Item } from '../packages/assessment-core/src/mod.ts';
import { UZ_MATH_TOPICS, type Difficulty } from '../packages/subject-core/src/mod.ts';

type Locale = 'uz' | 'ru';
type Text = Record<Locale, string>;
type Draft =
  | { kind: 'numeric'; prompt: Text; value: number; solution: Text }
  | { kind: 'choice'; prompt: Text; correct: string; wrong: string[]; solution: Text };

// Deterministic, so the file is reproducible and reviewable.
let seed = 20261024;
const random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : Math.abs(a);
const frac = (n: number, d: number) => { const g = gcd(n, d), s = d < 0 ? -1 : 1; return [s * n / g, s * d / g] as const; };
const tex = (n: number, d: number) => { const [a, b] = frac(n, d); return b === 1 ? `\\(${a}\\)` : `\\(\\frac{${a}}{${b}}\\)`; };
const both = (uz: string, ru: string): Text => ({ uz, ru });
/** `[[2, 3], [-1, 1], [5, 0]]` → `2x^3-x+5`. */
const poly = (terms: [number, number][]) => terms.filter(([c]) => c !== 0).map(([c, p], i) => { const sign = c < 0 ? '-' : i ? '+' : ''; const abs = Math.abs(c); const body = p === 0 ? `${abs}` : `${abs === 1 ? '' : abs}x${p === 1 ? '' : `^${p}`}`; return sign + body; }).join('') || '0';
/** Negative numbers in brackets inside a product. */
const par = (n: number) => n < 0 ? `(${n})` : `${n}`;
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]] as const;
const BOX = [[1, 2, 2, 3], [2, 3, 6, 7], [1, 4, 8, 9], [2, 6, 9, 11], [4, 4, 7, 9]] as const;

// One generator per topic; `level` 0 is easier, 3 is harder.
const generators: Record<string, (level: number) => Draft> = {
  'math.num.natural': (level) => {
    const g = pick([6, 7, 9, 12, 14, 18]), [m, n] = pick([[2, 3], [3, 4], [4, 5], [5, 6], [3, 7]]), a = g * m, b = g * n, l = a * b / g;
    if (level < 3) return { kind: 'choice', prompt: both(`\\(${a}\\) va \\(${b}\\) sonlarining EKUBini toping.`, `Найдите НОД чисел \\(${a}\\) и \\(${b}\\).`), correct: `${g}`, wrong: [`${l}`, `${g * 2}`, `${m * n}`], solution: both(`\\(${a}=${g}\\cdot${m}\\), \\(${b}=${g}\\cdot${n}\\), \\(${m}\\) va \\(${n}\\) o‘zaro tub. Demak EKUB \\(=${g}\\).`, `\\(${a}=${g}\\cdot${m}\\), \\(${b}=${g}\\cdot${n}\\), числа \\(${m}\\) и \\(${n}\\) взаимно просты, поэтому НОД \\(=${g}\\).`) };
    return { kind: 'numeric', prompt: both(`\\(${a}\\) va \\(${b}\\) sonlarining EKUKini toping.`, `Найдите НОК чисел \\(${a}\\) и \\(${b}\\).`), value: l, solution: both(`EKUK \\(=\\frac{${a}\\cdot${b}}{\\text{EKUB}}=\\frac{${a * b}}{${g}}=${l}\\).`, `НОК \\(=\\frac{${a}\\cdot${b}}{\\text{НОД}}=\\frac{${a * b}}{${g}}=${l}\\).`) };
  },
  'math.num.fractions': (level) => {
    const b = pick([3, 4, 5, 6]), d = pick([7, 8, 9, 10].filter((x) => x !== b * 2)), a = int(1, b - 1), c = int(1, d - 1);
    const sub = level >= 2, n = sub ? a * d - c * b : a * d + c * b, op = sub ? '-' : '+';
    return { kind: 'choice', prompt: both(`Hisoblang: \\(\\frac{${a}}{${b}}${op}\\frac{${c}}{${d}}\\)`, `Вычислите: \\(\\frac{${a}}{${b}}${op}\\frac{${c}}{${d}}\\)`), correct: tex(n, b * d), wrong: [tex(sub ? a - c : a + c, b + d), tex(a * c, b * d), tex(n + b, b * d)], solution: both(`Umumiy maxraj \\(${b * d}\\): \\(\\frac{${a * d}}{${b * d}}${op}\\frac{${c * b}}{${b * d}}=\\frac{${n}}{${b * d}}\\), qisqartirilgach ${tex(n, b * d)}.`, `Общий знаменатель \\(${b * d}\\): \\(\\frac{${a * d}}{${b * d}}${op}\\frac{${c * b}}{${b * d}}=\\frac{${n}}{${b * d}}\\), после сокращения ${tex(n, b * d)}.`) };
  },
  'math.num.percent': (level) => {
    const original = pick([150, 200, 250, 400, 500, 800]) * 1000, rate = pick([10, 20, 25, 30, 40]);
    if (level < 2) { const part = original * rate / 100; return { kind: 'numeric', prompt: both(`\\(${original}\\) so‘mning \\(${rate}\\%\\) i necha so‘m?`, `Сколько сумов составляет \\(${rate}\\%\\) от \\(${original}\\) сумов?`), value: part, solution: both(`\\(${original}\\cdot\\frac{${rate}}{100}=${part}\\).`, `\\(${original}\\cdot\\frac{${rate}}{100}=${part}\\).`) }; }
    const raised = original * (100 + rate) / 100;
    return { kind: 'numeric', prompt: both(`Mahsulot narxi \\(${rate}\\%\\) ga oshirilgach \\(${raised}\\) so‘m bo‘ldi. Dastlabki narx necha so‘m edi?`, `После повышения цены на \\(${rate}\\%\\) товар стоит \\(${raised}\\) сумов. Какой была начальная цена?`), value: original, solution: both(`\\(x\\cdot\\frac{${100 + rate}}{100}=${raised}\\), demak \\(x=${original}\\).`, `\\(x\\cdot\\frac{${100 + rate}}{100}=${raised}\\), значит \\(x=${original}\\).`) };
  },
  'math.num.real': () => {
    const a = pick([2, 3, 4, 5]), b = pick([2, 3, 5, 6, 7]), inside = a * a * b;
    return { kind: 'choice', prompt: both(`Soddalashtiring: \\(\\sqrt{${inside}}\\)`, `Упростите: \\(\\sqrt{${inside}}\\)`), correct: `\\(${a}\\sqrt{${b}}\\)`, wrong: [`\\(${b}\\sqrt{${a}}\\)`, `\\(${a * a}\\sqrt{${b}}\\)`, `\\(${a}\\sqrt{${a * b}}\\)`], solution: both(`\\(\\sqrt{${inside}}=\\sqrt{${a * a}\\cdot${b}}=${a}\\sqrt{${b}}\\).`, `\\(\\sqrt{${inside}}=\\sqrt{${a * a}\\cdot${b}}=${a}\\sqrt{${b}}\\).`) };
  },
  'math.alg.expressions': () => {
    const x = int(1, 6), y = int(1, 6) + x, s = x + y, p = x * y, value = s * s - 2 * p;
    return { kind: 'numeric', prompt: both(`\\(x+y=${s}\\) va \\(xy=${p}\\) bo‘lsa, \\(x^2+y^2\\) ni toping.`, `Известно, что \\(x+y=${s}\\) и \\(xy=${p}\\). Найдите \\(x^2+y^2\\).`), value, solution: both(`\\(x^2+y^2=(x+y)^2-2xy=${s * s}-${2 * p}=${value}\\).`, `\\(x^2+y^2=(x+y)^2-2xy=${s * s}-${2 * p}=${value}\\).`) };
  },
  'math.alg.powers': () => {
    const m = int(3, 7), n = int(2, 6), k = int(2, m + n - 2), base = pick([2, 3]), value = base ** (m + n - k);
    return { kind: 'numeric', prompt: both(`Hisoblang: \\(\\frac{${base}^{${m}}\\cdot${base}^{${n}}}{${base}^{${k}}}\\)`, `Вычислите: \\(\\frac{${base}^{${m}}\\cdot${base}^{${n}}}{${base}^{${k}}}\\)`), value, solution: both(`\\(${base}^{${m}+${n}-${k}}=${base}^{${m + n - k}}=${value}\\).`, `\\(${base}^{${m}+${n}-${k}}=${base}^{${m + n - k}}=${value}\\).`) };
  },
  'math.alg.linear': (level) => {
    const x = int(2, 9), y = int(1, 8), a = level >= 2 ? pick([2, 3]) : 1;
    return { kind: 'numeric', prompt: both(`\\(\\begin{cases}${a === 1 ? '' : a}x+y=${a * x + y}\\\\x-y=${x - y}\\end{cases}\\) sistemadan \\(x\\) ni toping.`, `Найдите \\(x\\) из системы \\(\\begin{cases}${a === 1 ? '' : a}x+y=${a * x + y}\\\\x-y=${x - y}\\end{cases}\\)`), value: x, solution: both(`Tenglamalarni qo‘shamiz: \\(${a + 1}x=${(a + 1) * x}\\), \\(x=${x}\\).`, `Сложим уравнения: \\(${a + 1}x=${(a + 1) * x}\\), \\(x=${x}\\).`) };
  },
  'math.alg.quadratic': (level) => {
    const r1 = int(-5, 6) || 2, r2 = int(1, 7), s = r1 + r2, p = r1 * r2;
    const poly = `x^2${s === 0 ? '' : s > 0 ? `-${s}x` : `+${-s}x`}${p === 0 ? '' : p > 0 ? `+${p}` : `${p}`}=0`;
    if (level < 2) return { kind: 'choice', prompt: both(`\\(${poly}\\) tenglama ildizlari yig‘indisini toping.`, `Найдите сумму корней уравнения \\(${poly}\\).`), correct: `${s}`, wrong: [`${-s}`, `${p}`, `${s + 1}`], solution: both(`Viyet teoremasi: \\(x_1+x_2=-\\frac{b}{a}=${s}\\).`, `По теореме Виета \\(x_1+x_2=-\\frac{b}{a}=${s}\\).`) };
    return { kind: 'numeric', prompt: both(`\\(${poly}\\) tenglamaning katta ildizini toping.`, `Найдите больший корень уравнения \\(${poly}\\).`), value: Math.max(r1, r2), solution: both(`Ildizlar: \\(x_1=${Math.min(r1, r2)}\\), \\(x_2=${Math.max(r1, r2)}\\) (yig‘indisi \\(${s}\\), ko‘paytmasi \\(${p}\\)).`, `Корни: \\(x_1=${Math.min(r1, r2)}\\), \\(x_2=${Math.max(r1, r2)}\\) (сумма \\(${s}\\), произведение \\(${p}\\)).`) };
  },
  'math.alg.rational': () => {
    const a = int(2, 6), b = int(a * 2 + 1, a * 2 + 9), x = b - a;
    return { kind: 'numeric', prompt: both(`Tenglamani yeching: \\(\\frac{x^2-${a * a}}{x-${a}}=${b}\\)`, `Решите уравнение: \\(\\frac{x^2-${a * a}}{x-${a}}=${b}\\)`), value: x, solution: both(`\\(x\\ne${a}\\) da \\(\\frac{(x-${a})(x+${a})}{x-${a}}=x+${a}\\). \\(x+${a}=${b}\\), \\(x=${x}\\).`, `При \\(x\\ne${a}\\): \\(\\frac{(x-${a})(x+${a})}{x-${a}}=x+${a}\\). \\(x+${a}=${b}\\), \\(x=${x}\\).`) };
  },
  'math.alg.inequalities': () => {
    const a = int(-4, 2), b = a + int(4, 9), count = b - a - 1;
    return { kind: 'numeric', prompt: both(`\\((x${a < 0 ? `+${-a}` : a === 0 ? '' : `-${a}`})(x-${b})<0\\) tengsizlikning nechta butun yechimi bor?`, `Сколько целых решений имеет неравенство \\((x${a < 0 ? `+${-a}` : a === 0 ? '' : `-${a}`})(x-${b})<0\\)?`), value: count, solution: both(`Oraliqlar usuli: \\(${a}<x<${b}\\). Butun sonlar: \\(${a + 1},\\dots,${b - 1}\\), jami \\(${count}\\) ta.`, `Метод интервалов: \\(${a}<x<${b}\\). Целые числа \\(${a + 1},\\dots,${b - 1}\\), всего \\(${count}\\).`) };
  },
  'math.alg.modulus': (level) => {
    const a = int(1, 7), b = int(2, 6);
    if (level < 2) return { kind: 'numeric', prompt: both(`\\(|x-${a}|=${b}\\) tenglama ildizlari yig‘indisini toping.`, `Найдите сумму корней уравнения \\(|x-${a}|=${b}\\).`), value: 2 * a, solution: both(`\\(x=${a}+${b}=${a + b}\\) yoki \\(x=${a}-${b}=${a - b}\\). Yig‘indi \\(${2 * a}\\).`, `\\(x=${a}+${b}=${a + b}\\) или \\(x=${a}-${b}=${a - b}\\). Сумма \\(${2 * a}\\).`) };
    return { kind: 'numeric', prompt: both(`\\(|x-${a}|\\le${b}\\) tengsizlikning nechta butun yechimi bor?`, `Сколько целых решений имеет неравенство \\(|x-${a}|\\le${b}\\)?`), value: 2 * b + 1, solution: both(`\\(${a - b}\\le x\\le${a + b}\\): \\(${2 * b + 1}\\) ta butun son.`, `\\(${a - b}\\le x\\le${a + b}\\): \\(${2 * b + 1}\\) целых чисел.`) };
  },
  'math.alg.irrational': () => {
    const b = int(2, 7), a = int(-3, 9), x = b * b - a;
    return { kind: 'numeric', prompt: both(`Tenglamani yeching: \\(\\sqrt{${poly([[1, 1], [a, 0]])}}=${b}\\)`, `Решите уравнение: \\(\\sqrt{${poly([[1, 1], [a, 0]])}}=${b}\\)`), value: x, solution: both(`Ikkala tomonni kvadratga ko‘taramiz: \\(${poly([[1, 1], [a, 0]])}=${b * b}\\), \\(x=${x}\\). Tekshiruv: ildiz ostidagi ifoda \\(${b * b}\\ge0\\).`, `Возведём в квадрат: \\(${poly([[1, 1], [a, 0]])}=${b * b}\\), \\(x=${x}\\). Проверка: подкоренное выражение \\(${b * b}\\ge0\\).`) };
  },
  'math.fn.graphs': () => {
    const p = int(-4, 5), q = int(-6, 12), y0 = q - p * p;
    const f = `x^2${p === 0 ? '' : p > 0 ? `-${2 * p}x` : `+${-2 * p}x`}${q === 0 ? '' : q > 0 ? `+${q}` : `${q}`}`;
    return { kind: 'numeric', prompt: both(`\\(y=${f}\\) parabola uchining ordinatasini toping.`, `Найдите ординату вершины параболы \\(y=${f}\\).`), value: y0, solution: both(`\\(x_0=-\\frac{b}{2a}=${p}\\), \\(y_0=${p * p}${-2 * p * p >= 0 ? '+' : ''}${-2 * p * p}${q >= 0 ? '+' : ''}${q}=${y0}\\).`, `\\(x_0=-\\frac{b}{2a}=${p}\\), \\(y_0=${p * p}${-2 * p * p >= 0 ? '+' : ''}${-2 * p * p}${q >= 0 ? '+' : ''}${q}=${y0}\\).`) };
  },
  'math.seq.arithmetic': (level) => {
    const a1 = int(-5, 9), d = int(2, 6), n = int(8, 20), an = a1 + (n - 1) * d;
    if (level < 2) return { kind: 'numeric', prompt: both(`Arifmetik progressiyada \\(a_1=${a1}\\), \\(d=${d}\\). \\(a_{${n}}\\) ni toping.`, `В арифметической прогрессии \\(a_1=${a1}\\), \\(d=${d}\\). Найдите \\(a_{${n}}\\).`), value: an, solution: both(`\\(a_n=a_1+(n-1)d=${a1}+${n - 1}\\cdot${d}=${an}\\).`, `\\(a_n=a_1+(n-1)d=${a1}+${n - 1}\\cdot${d}=${an}\\).`) };
    const sum = (a1 + an) * n / 2;
    return { kind: 'numeric', prompt: both(`Arifmetik progressiyada \\(a_1=${a1}\\), \\(d=${d}\\). Dastlabki \\(${n}\\) ta hadi yig‘indisini toping.`, `В арифметической прогрессии \\(a_1=${a1}\\), \\(d=${d}\\). Найдите сумму первых \\(${n}\\) членов.`), value: sum, solution: both(`\\(a_{${n}}=${an}\\), \\(S_{${n}}=\\frac{a_1+a_{${n}}}{2}\\cdot${n}=${sum}\\).`, `\\(a_{${n}}=${an}\\), \\(S_{${n}}=\\frac{a_1+a_{${n}}}{2}\\cdot${n}=${sum}\\).`) };
  },
  'math.seq.geometric': () => {
    const b1 = pick([1, 2, 3, 5]), q = pick([2, 3, -2]), n = int(4, 6), bn = b1 * q ** (n - 1);
    return { kind: 'numeric', prompt: both(`Geometrik progressiyada \\(b_1=${b1}\\), \\(q=${q}\\). \\(b_{${n}}\\) ni toping.`, `В геометрической прогрессии \\(b_1=${b1}\\), \\(q=${q}\\). Найдите \\(b_{${n}}\\).`), value: bn, solution: both(`\\(b_n=b_1q^{n-1}=${b1}\\cdot(${q})^{${n - 1}}=${bn}\\).`, `\\(b_n=b_1q^{n-1}=${b1}\\cdot(${q})^{${n - 1}}=${bn}\\).`) };
  },
  'math.exp.equations': () => {
    const base = pick([2, 3, 5]), n = base === 5 ? int(2, 3) : int(3, 5), m = int(1, 3), x = n - m, rhs = base ** n;
    return { kind: 'numeric', prompt: both(`Tenglamani yeching: \\(${base}^{x+${m}}=${rhs}\\)`, `Решите уравнение: \\(${base}^{x+${m}}=${rhs}\\)`), value: x, solution: both(`\\(${rhs}=${base}^{${n}}\\), demak \\(x+${m}=${n}\\), \\(x=${x}\\).`, `\\(${rhs}=${base}^{${n}}\\), значит \\(x+${m}=${n}\\), \\(x=${x}\\).`) };
  },
  'math.log.equations': () => {
    const a = pick([2, 3]), n = a === 2 ? int(2, 5) : int(2, 3), m = int(1, 6), x = a ** n + m;
    return { kind: 'numeric', prompt: both(`Tenglamani yeching: \\(\\log_{${a}}(x-${m})=${n}\\)`, `Решите уравнение: \\(\\log_{${a}}(x-${m})=${n}\\)`), value: x, solution: both(`\\(x-${m}=${a}^{${n}}=${a ** n}\\), \\(x=${x}\\). Aniqlanish sohasi: \\(x>${m}\\) bajariladi.`, `\\(x-${m}=${a}^{${n}}=${a ** n}\\), \\(x=${x}\\). ОДЗ \\(x>${m}\\) выполняется.`) };
  },
  'math.trig.identities': () => {
    const [a, b, c] = pick(TRIPLES.filter(([x, y, z]) => gcd(gcd(x, y), z) === 1));
    return { kind: 'choice', prompt: both(`\\(\\sin\\alpha=\\frac{${a}}{${c}}\\) va \\(0<\\alpha<\\frac{\\pi}{2}\\) bo‘lsa, \\(\\cos\\alpha\\) ni toping.`, `Найдите \\(\\cos\\alpha\\), если \\(\\sin\\alpha=\\frac{${a}}{${c}}\\) и \\(0<\\alpha<\\frac{\\pi}{2}\\).`), correct: tex(b, c), wrong: [tex(-b, c), tex(a, b), tex(c - a, c)], solution: both(`\\(\\cos\\alpha=\\sqrt{1-\\sin^2\\alpha}=\\sqrt{1-\\frac{${a * a}}{${c * c}}}=\\frac{${b}}{${c}}\\); birinchi chorakda kosinus musbat.`, `\\(\\cos\\alpha=\\sqrt{1-\\sin^2\\alpha}=\\sqrt{1-\\frac{${a * a}}{${c * c}}}=\\frac{${b}}{${c}}\\); в первой четверти косинус положителен.`) };
  },
  'math.trig.equations': () => {
    const k = int(2, 6);
    return { kind: 'numeric', prompt: both(`\\(\\sin x=0\\) tenglamaning \\([0;\\,${k}\\pi]\\) kesmadagi ildizlari nechta?`, `Сколько корней уравнения \\(\\sin x=0\\) принадлежат отрезку \\([0;\\,${k}\\pi]\\)?`), value: k + 1, solution: both(`\\(x=\\pi n\\), \\(0\\le\\pi n\\le${k}\\pi\\) dan \\(n=0,1,\\dots,${k}\\): jami \\(${k + 1}\\) ta.`, `\\(x=\\pi n\\), из \\(0\\le\\pi n\\le${k}\\pi\\) получаем \\(n=0,1,\\dots,${k}\\): всего \\(${k + 1}\\).`) };
  },
  'math.word.problems': () => {
    const v1 = pick([50, 60, 70, 80]), v2 = pick([40, 45, 55, 65, 75]), t = int(2, 5), d = (v1 + v2) * t;
    return { kind: 'numeric', prompt: both(`Oralig‘i \\(${d}\\) km bo‘lgan ikki shahardan bir vaqtda bir-biriga qarab \\(${v1}\\) km/soat va \\(${v2}\\) km/soat tezlik bilan ikki avtomobil yo‘lga chiqdi. Necha soatdan keyin ular uchrashadi?`, `Из двух городов, расстояние между которыми \\(${d}\\) км, одновременно навстречу друг другу выехали два автомобиля со скоростями \\(${v1}\\) км/ч и \\(${v2}\\) км/ч. Через сколько часов они встретятся?`), value: t, solution: both(`Yaqinlashish tezligi \\(${v1}+${v2}=${v1 + v2}\\) km/soat. \\(t=\\frac{${d}}{${v1 + v2}}=${t}\\) soat.`, `Скорость сближения \\(${v1}+${v2}=${v1 + v2}\\) км/ч. \\(t=\\frac{${d}}{${v1 + v2}}=${t}\\) ч.`) };
  },
  'math.calc.derivative': () => {
    const a = int(1, 3), b = int(-4, 4), c = int(-6, 6), t = int(-2, 3), value = 3 * a * t * t + 2 * b * t + c;
    const f = poly([[a, 3], [b, 2], [c, 1]]), df = poly([[3 * a, 2], [2 * b, 1], [c, 0]]);
    return { kind: 'numeric', prompt: both(`\\(f(x)=${f}\\) bo‘lsa, \\(f'(${t})\\) ni toping.`, `Найдите \\(f'(${t})\\), если \\(f(x)=${f}\\).`), value, solution: both(`\\(f'(x)=${df}\\), \\(f'(${t})=${value}\\).`, `\\(f'(x)=${df}\\), \\(f'(${t})=${value}\\).`) };
  },
  'math.calc.integral': () => {
    const a = int(1, 4), b = int(0, 5), k = int(1, 4), value = a * k * k + b * k;
    return { kind: 'numeric', prompt: both(`Hisoblang: \\(\\int_0^{${k}}(${2 * a}x${b ? `+${b}` : ''})\\,dx\\)`, `Вычислите: \\(\\int_0^{${k}}(${2 * a}x${b ? `+${b}` : ''})\\,dx\\)`), value, solution: both(`Boshlang‘ich funksiya \\(${a === 1 ? '' : a}x^2${b ? `+${b}x` : ''}\\). \\(${a}\\cdot${k * k}${b ? `+${b}\\cdot${k}` : ''}-0=${value}\\).`, `Первообразная \\(${a === 1 ? '' : a}x^2${b ? `+${b}x` : ''}\\). \\(${a}\\cdot${k * k}${b ? `+${b}\\cdot${k}` : ''}-0=${value}\\).`) };
  },
  'math.prob.combinatorics': (level) => {
    if (level < 2) { const n = int(5, 12), value = n * (n - 1) / 2; return { kind: 'numeric', prompt: both(`\\(${n}\\) kishi bir-biri bilan bir martadan qo‘l berib ko‘rishdi. Jami nechta qo‘l berib ko‘rishish bo‘ldi?`, `\\(${n}\\) человек обменялись рукопожатиями, каждый с каждым по одному разу. Сколько было рукопожатий?`), value, solution: both(`\\(C_{${n}}^2=\\frac{${n}\\cdot${n - 1}}{2}=${value}\\).`, `\\(C_{${n}}^2=\\frac{${n}\\cdot${n - 1}}{2}=${value}\\).`) }; }
    const red = int(2, 7), blue = int(3, 9), total = red + blue;
    return { kind: 'choice', prompt: both(`Qutida \\(${red}\\) ta qizil va \\(${blue}\\) ta ko‘k shar bor. Tavakkaliga olingan shar qizil bo‘lish ehtimolini toping.`, `В коробке \\(${red}\\) красных и \\(${blue}\\) синих шаров. Найдите вероятность того, что наугад взятый шар красный.`), correct: tex(red, total), wrong: [tex(blue, total), tex(red, blue), tex(1, total)], solution: both(`Qulay hollar \\(${red}\\), barcha hollar \\(${total}\\): \\(P=\\frac{${red}}{${total}}\\).`, `Благоприятных исходов \\(${red}\\), всех \\(${total}\\): \\(P=\\frac{${red}}{${total}}\\).`) };
  },
  'math.prob.statistics': () => {
    const values = Array.from({ length: 5 }, () => int(2, 20)), sum = values.reduce((a, b) => a + b, 0), fix = (5 - sum % 5) % 5;
    values[4] += fix;
    const mean = (sum + fix) / 5;
    return { kind: 'numeric', prompt: both(`\\(${values.join(',\\ ')}\\) sonlarining o‘rta arifmetigini toping.`, `Найдите среднее арифметическое чисел \\(${values.join(',\\ ')}\\).`), value: mean, solution: both(`Yig‘indi \\(${sum + fix}\\), soni \\(5\\): \\(\\frac{${sum + fix}}{5}=${mean}\\).`, `Сумма \\(${sum + fix}\\), количество \\(5\\): \\(\\frac{${sum + fix}}{5}=${mean}\\).`) };
  },
  'math.logic.sets': () => {
    const both_ = int(3, 8), football = both_ + int(4, 12), chess = both_ + int(3, 10), union = football + chess - both_;
    return { kind: 'numeric', prompt: both(`Sinfda \\(${football}\\) o‘quvchi futbol, \\(${chess}\\) o‘quvchi shaxmat bilan shug‘ullanadi, \\(${both_}\\) nafari ikkalasi bilan. Kamida bittasi bilan shug‘ullanadiganlar necha nafar?`, `В классе \\(${football}\\) учеников занимаются футболом, \\(${chess}\\) — шахматами, \\(${both_}\\) — и тем, и другим. Сколько учеников занимаются хотя бы одним из них?`), value: union, solution: both(`\\(|A\\cup B|=|A|+|B|-|A\\cap B|=${football}+${chess}-${both_}=${union}\\).`, `\\(|A\\cup B|=|A|+|B|-|A\\cap B|=${football}+${chess}-${both_}=${union}\\).`) };
  },
  'math.geo.triangles': () => {
    const [a, b, c] = pick(TRIPLES);
    return { kind: 'numeric', prompt: both(`To‘g‘ri burchakli uchburchakning katetlari \\(${a}\\) va \\(${b}\\). Gipotenuzani toping.`, `Катеты прямоугольного треугольника равны \\(${a}\\) и \\(${b}\\). Найдите гипотенузу.`), value: c, solution: both(`Pifagor teoremasi: \\(c=\\sqrt{${a}^2+${b}^2}=\\sqrt{${c * c}}=${c}\\).`, `По теореме Пифагора \\(c=\\sqrt{${a}^2+${b}^2}=\\sqrt{${c * c}}=${c}\\).`) };
  },
  'math.geo.quadrilaterals': () => {
    const d1 = 2 * int(2, 9), d2 = 2 * int(2, 9), area = d1 * d2 / 2;
    return { kind: 'numeric', prompt: both(`Rombning diagonallari \\(${d1}\\) va \\(${d2}\\). Uning yuzini toping.`, `Диагонали ромба равны \\(${d1}\\) и \\(${d2}\\). Найдите его площадь.`), value: area, solution: both(`\\(S=\\frac{d_1d_2}{2}=\\frac{${d1}\\cdot${d2}}{2}=${area}\\).`, `\\(S=\\frac{d_1d_2}{2}=\\frac{${d1}\\cdot${d2}}{2}=${area}\\).`) };
  },
  'math.geo.circles': () => {
    const central = 2 * int(20, 80);
    return { kind: 'numeric', prompt: both(`Markaziy burchak \\(${central}^\\circ\\). Shu yoyga tiralgan ichki chizilgan burchakni (gradusda) toping.`, `Центральный угол равен \\(${central}^\\circ\\). Найдите вписанный угол, опирающийся на ту же дугу (в градусах).`), value: central / 2, solution: both(`Ichki chizilgan burchak markaziy burchakning yarmiga teng: \\(${central / 2}^\\circ\\).`, `Вписанный угол равен половине центрального: \\(${central / 2}^\\circ\\).`) };
  },
  'math.geo.areas': () => {
    const a = int(3, 12), b = a + int(2, 8), h = 2 * int(1, 6), area = (a + b) * h / 2;
    return { kind: 'numeric', prompt: both(`Trapetsiyaning asoslari \\(${a}\\) va \\(${b}\\), balandligi \\(${h}\\). Yuzini toping.`, `Основания трапеции равны \\(${a}\\) и \\(${b}\\), высота \\(${h}\\). Найдите площадь.`), value: area, solution: both(`\\(S=\\frac{a+b}{2}\\cdot h=\\frac{${a + b}}{2}\\cdot${h}=${area}\\).`, `\\(S=\\frac{a+b}{2}\\cdot h=\\frac{${a + b}}{2}\\cdot${h}=${area}\\).`) };
  },
  'math.geo.vectors': () => {
    const [x1, y1, x2, y2] = [int(-4, 5), int(-4, 5), int(-4, 5), int(-4, 5)], dot = x1 * x2 + y1 * y2;
    return { kind: 'numeric', prompt: both(`\\(\\vec a(${x1};\\,${y1})\\) va \\(\\vec b(${x2};\\,${y2})\\) vektorlarning skalyar ko‘paytmasini toping.`, `Найдите скалярное произведение векторов \\(\\vec a(${x1};\\,${y1})\\) и \\(\\vec b(${x2};\\,${y2})\\).`), value: dot, solution: both(`\\(\\vec a\\cdot\\vec b=${par(x1)}\\cdot${par(x2)}+${par(y1)}\\cdot${par(y2)}=${dot}\\).`, `\\(\\vec a\\cdot\\vec b=${par(x1)}\\cdot${par(x2)}+${par(y1)}\\cdot${par(y2)}=${dot}\\).`) };
  },
  'math.solid.polyhedra': (level) => {
    const [a, b, c, d] = pick(BOX);
    if (level < 2) return { kind: 'numeric', prompt: both(`To‘g‘ri burchakli parallelepipedning o‘lchamlari \\(${a}\\), \\(${b}\\) va \\(${c}\\). Hajmini toping.`, `Измерения прямоугольного параллелепипеда равны \\(${a}\\), \\(${b}\\) и \\(${c}\\). Найдите его объём.`), value: a * b * c, solution: both(`\\(V=abc=${a}\\cdot${b}\\cdot${c}=${a * b * c}\\).`, `\\(V=abc=${a}\\cdot${b}\\cdot${c}=${a * b * c}\\).`) };
    return { kind: 'numeric', prompt: both(`To‘g‘ri burchakli parallelepipedning o‘lchamlari \\(${a}\\), \\(${b}\\) va \\(${c}\\). Diagonalini toping.`, `Измерения прямоугольного параллелепипеда равны \\(${a}\\), \\(${b}\\) и \\(${c}\\). Найдите его диагональ.`), value: d, solution: both(`\\(d=\\sqrt{${a}^2+${b}^2+${c}^2}=\\sqrt{${d * d}}=${d}\\).`, `\\(d=\\sqrt{${a}^2+${b}^2+${c}^2}=\\sqrt{${d * d}}=${d}\\).`) };
  },
  'math.solid.revolution': () => {
    const r = int(2, 6), h = int(2, 9), v = r * r * h;
    return { kind: 'choice', prompt: both(`Silindrning asos radiusi \\(${r}\\), balandligi \\(${h}\\). Hajmini toping.`, `Радиус основания цилиндра \\(${r}\\), высота \\(${h}\\). Найдите его объём.`), correct: `\\(${v}\\pi\\)`, wrong: [`\\(${2 * r * h}\\pi\\)`, `\\(${r * h}\\pi\\)`, `\\(${v * 2}\\pi\\)`], solution: both(`\\(V=\\pi r^2h=\\pi\\cdot${r * r}\\cdot${h}=${v}\\pi\\).`, `\\(V=\\pi r^2h=\\pi\\cdot${r * r}\\cdot${h}=${v}\\pi\\).`) };
  },
  'math.solid.vectors': () => {
    const [a, b, c, d] = pick(BOX), x = int(-3, 3), y = int(-3, 3), z = int(-3, 3);
    return { kind: 'numeric', prompt: both(`\\(A(${x};\\,${y};\\,${z})\\) va \\(B(${x + a};\\,${y + b};\\,${z + c})\\) nuqtalar orasidagi masofani toping.`, `Найдите расстояние между точками \\(A(${x};\\,${y};\\,${z})\\) и \\(B(${x + a};\\,${y + b};\\,${z + c})\\).`), value: d, solution: both(`\\(AB=\\sqrt{${a}^2+${b}^2+${c}^2}=\\sqrt{${d * d}}=${d}\\).`, `\\(AB=\\sqrt{${a}^2+${b}^2+${c}^2}=\\sqrt{${d * d}}=${d}\\).`) };
  },
};

const difficultyFor = (level: number): Difficulty => level === 0 ? 'easy' : level === 3 ? 'hard' : 'medium';

export function starterBank(variants = 4) {
  const rows: { item: Item; key: AnswerKey }[] = [];
  const missing = UZ_MATH_TOPICS.topics.filter((topic) => !generators[topic.code]).map((topic) => topic.code);
  if (missing.length) throw new Error(`No generator for ${missing.join(', ')}`);
  for (const topic of UZ_MATH_TOPICS.topics) {
    const seen = new Set<string>();
    for (let level = 0, tries = 0; seen.size < variants && tries < variants * 20; tries++) {
      const draft = generators[topic.code](level % 4);
      const signature = draft.prompt.ru;
      if (seen.has(signature)) continue;
      if (draft.kind === 'choice' && new Set([draft.correct, ...draft.wrong]).size !== 4) continue;
      seen.add(signature);
      const difficulty = difficultyFor(level % 4);
      level++;
      // Options are placed deterministically so the correct one is not always first.
      const order = draft.kind === 'choice' ? [draft.correct, ...draft.wrong].map((text) => ({ text, at: random() })).sort((a, b) => a.at - b.at).map((row) => row.text) : [];
      for (const locale of ['uz', 'ru'] as const) {
        const base = { schema_version: 'assessment.item.v1', prompt: draft.prompt[locale], locale, max_score: 1, tags: ['admission-math', 'starter-draft'], classification: { topics: [topic.code], estimated_difficulty: difficulty } };
        const raw = draft.kind === 'numeric'
          ? { item: { ...base, type: 'numeric' }, key: { numeric: { value: draft.value, tolerance: 0 }, solution: draft.solution[locale] } }
          : { item: { ...base, type: 'single_choice', options: order.map((text, index) => ({ id: 'abcd'[index], text })) }, key: { correct: 'abcd'[order.indexOf(draft.correct)], solution: draft.solution[locale] } };
        const item = validateItem(raw.item);
        rows.push({ item, key: validateKey(item, raw.key) });
      }
    }
    if (seen.size < variants) throw new Error(`${topic.code}: only ${seen.size} distinct questions`);
  }
  return { schema_version: 'assessment.bank.v1', rows };
}

if (import.meta.main) {
  const variants = Number(Deno.args[0] ?? 4);
  const bank = starterBank(variants);
  await Deno.mkdir('output/admission', { recursive: true });
  for (const locale of ['uz', 'ru'] as const) {
    const path = `output/admission/math-starter-${locale}.json`;
    await Deno.writeTextFile(path, JSON.stringify({ ...bank, rows: bank.rows.filter((row) => row.item.locale === locale) }, null, 1) + '\n');
    console.log(`${path}: ${bank.rows.filter((row) => row.item.locale === locale).length} draft questions`);
  }
}
