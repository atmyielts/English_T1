import { T } from '../src/localize.ts';
import type { Sample } from '../src/types.ts';

// Static examples for people who have not started yet, each labelled as an example. They
// follow a fictional learner, Sardor (grade 11, target 80%), and invented numbers.

export const samples: Sample[] = [
  {
    id: 'sample.week',
    kind: 'weekly_report',
    title: { uz: 'Namuna: haftalik hisobot', ru: 'Пример: еженедельный отчёт', en: 'Example: a weekly report' },
    preview: {
      uz: 'Uydirma o‘quvchi Sardor uchun namuna: bir hafta ichida masalalar aniqligi 54% dan 68% ga, mini-sinov natijasi 50% dan 70% ga o‘sdi, xatolar daftarida 9 ta savol tuzatildi. Keyingi hafta: logarifmlarda aniqlanish sohasi va tengsizlikda belgini almashtirish.',
      ru: 'Пример для вымышленного ученика Сардора: за неделю точность в задачах выросла с 54% до 68%, мини-пробник — с 50% до 70%, в тетради ошибок исправлено 9 вопросов. На следующую неделю: ОДЗ в логарифмах и смена знака в неравенствах.',
      en: 'An example for a fictional learner, Sardor: in one week practice accuracy rose from 54% to 68%, the mini-mock from 50% to 70%, and 9 questions left the mistake notebook. Next week: log domains and flipping the inequality sign.',
    },
    body: {
      rows: [
        { label: { uz: 'Mini-sinov natijasi', ru: 'Результат мини-пробника', en: 'Mini-mock result' }, before: 50, after: 70, unit: '%' },
        { label: { uz: 'Masalalar aniqligi', ru: 'Точность в задачах', en: 'Practice accuracy' }, before: 54, after: 68, unit: '%' },
        { label: { uz: 'Logarifmlar mavzusi', ru: 'Тема «Логарифмы»', en: 'Logarithms' }, before: 35, after: 60, unit: '%' },
        { label: { uz: 'Xatolar daftaridagi savollar', ru: 'Вопросов в тетради ошибок', en: 'Questions in the notebook' }, before: 21, after: 12, lowerIsBetter: true },
        { label: { uz: 'Mashq daqiqalari', ru: 'Минут практики', en: 'Minutes practised' }, before: 95, after: 160, unit: 'min' },
      ],
      minutes: 160,
      streak: 6,
      focus: [
        { uz: 'Logarifmik tenglamalarda avval aniqlanish sohasini yozing: shu hafta ikki marta begona ildiz qoldi.', ru: 'В логарифмических уравнениях сначала записывайте ОДЗ: на этой неделе дважды остался посторонний корень.', en: 'Write the domain first in log equations: twice this week an extraneous root stayed in.' },
        { uz: 'Manfiy songa bo‘lganda tengsizlik belgisini almashtiring: shu hafta 3 ta xato shundan bo‘ldi.', ru: 'При делении на отрицательное число меняйте знак неравенства: на этой неделе из-за этого было 3 ошибки.', en: 'Flip the inequality sign when dividing by a negative: 3 slips this week.' },
      ],
    },
  },
  {
    id: 'sample.plan',
    kind: 'plan',
    title: { uz: 'Namuna: imtihongacha reja', ru: 'Пример: план до экзамена', en: 'Example: a plan to the exam' },
    preview: {
      uz: 'Maqsad 80%, imtihongacha 20 hafta, kuniga 30 daqiqa. Har kungi masalalar mavzular grafi bo‘yicha: avval kasrlar va foizlar, keyin tenglamalar, so‘ng logarifmlar va trigonometriya. Har shanba — majburiy blok bo‘yicha mini-sinov.',
      ru: 'Цель 80%, до экзамена 20 недель, 30 минут в день. Задачи на каждый день по графу тем: сначала дроби и проценты, затем уравнения, потом логарифмы и тригонометрия. По субботам — мини-пробник по обязательному блоку.',
      en: 'Target 80%, 20 weeks to the exam, 30 minutes a day. Daily problems follow the topic graph: fractions and percentages first, then equations, then logarithms and trigonometry. Saturdays: a compulsory-block mini-mock.',
    },
    body: {
      target: 80,
      weeks: 20,
      days: [
        { day: { uz: 'Dushanba', ru: 'Понедельник', en: 'Monday' }, tasks: [{ uz: 'Foizlar va proporsiyalar · 5 masala', ru: 'Проценты и пропорции · 5 задач', en: 'Percentages · 5 problems' }, { uz: 'Xato ustida mashq: foiz asosi', ru: 'Работа над ошибкой: база процента', en: 'Drill: percent of what' }] },
        { day: { uz: 'Seshanba', ru: 'Вторник', en: 'Tuesday' }, tasks: [{ uz: 'Kvadrat tenglamalar · 5 masala', ru: 'Квадратные уравнения · 5 задач', en: 'Quadratics · 5 problems' }, { uz: 'Usul: Viyet teoremasi', ru: 'Метод: теорема Виета', en: 'Method card: Vieta' }] },
        { day: { uz: 'Chorshanba', ru: 'Среда', en: 'Wednesday' }, tasks: [{ uz: 'Tengsizliklar · 5 masala', ru: 'Неравенства · 5 задач', en: 'Inequalities · 5 problems' }, { uz: 'Yechimni yozib, tekshiruvga yuborish', ru: 'Записать решение и отправить на проверку', en: 'Write out a solution for checking' }] },
        { day: { uz: 'Shanba', ru: 'Суббота', en: 'Saturday' }, tasks: [{ uz: 'Mini-sinov: 10 savol, 20 daqiqa', ru: 'Мини-пробник: 10 вопросов, 20 минут', en: 'Mini-mock: 10 questions, 20 minutes' }] },
      ],
    },
  },
  {
    id: 'sample.solution',
    kind: 'writing_report',
    title: { uz: 'Namuna: yozma yechim tahlili', ru: 'Пример: разбор письменного решения', en: 'Example: a written solution checked' },
    preview: {
      uz: 'Sardor √(2x + 3) = x tenglamani yechdi: kvadratga ko‘tarish to‘g‘ri, lekin x ≥ 0 sharti yozilmagan va begona ildiz −1 javobda qoldi. Usul 75, hisob 100, asoslash 25, javob 50. Murabbiy aynan qaysi qatorda xato boshlanganini ko‘rsatdi.',
      ru: 'Сардор решил уравнение √(2x + 3) = x: возведение в квадрат верное, но условие x ≥ 0 не записано, и посторонний корень −1 остался в ответе. Метод 75, вычисления 100, обоснование 25, ответ 50. Коуч показал строку, где началась ошибка.',
      en: 'Sardor solved √(2x + 3) = x: squaring was right, but x ≥ 0 was never written and the extraneous root −1 stayed in. Method 75, working 100, reasoning 25, answer 50, with the exact line where it went wrong.',
    },
    body: {
      task: T({ uz: 'Tenglamani yeching: √(2x + 3) = x.', ru: 'Решите уравнение: √(2x + 3) = x.' }),
      overall: 75,
      criteria: [
        { id: 'method', score: 75, evidence: [T({ uz: 'Kvadratga ko‘taramiz: 2x + 3 = x²', ru: 'Возводим в квадрат: 2x + 3 = x²' })], note: { uz: 'To‘g‘ri reja, lekin kvadratga ko‘tarishdan oldin x ≥ 0 shartini yozish kerak edi.', ru: 'Верный план, но перед возведением в квадрат нужно было записать условие x ≥ 0.', en: 'The right plan, but x ≥ 0 belongs before squaring.' } },
        { id: 'working', score: 100, evidence: ['x² − 2x − 3 = 0', 'x₁ = 3, x₂ = −1'], note: { uz: 'Hisob-kitob xatosiz.', ru: 'Вычисления без ошибок.', en: 'The working is clean.' } },
        { id: 'reasoning', score: 25, evidence: [T({ uz: 'Javob: 3; −1', ru: 'Ответ: 3; −1' })], note: { uz: 'Ildizlar tekshirilmagan: x = −1 da chap tomon 1, o‘ng tomon −1.', ru: 'Корни не проверены: при x = −1 слева 1, справа −1.', en: 'No check: at x = −1 the left side is 1, the right side −1.' } },
        { id: 'answer', score: 50, evidence: [T({ uz: 'Javob: 3; −1', ru: 'Ответ: 3; −1' })], note: { uz: 'To‘g‘ri javob — faqat x = 3.', ru: 'Верный ответ — только x = 3.', en: 'The answer is x = 3 only.' } },
      ],
      corrections: [
        { original: T({ uz: 'Javob: 3; −1', ru: 'Ответ: 3; −1' }), corrected: T({ uz: 'x ≥ 0 bo‘lgani uchun x = −1 tashlanadi. Javob: 3', ru: 'Так как x ≥ 0, корень x = −1 отбрасываем. Ответ: 3' }), tag: 'domain', why: { uz: 'Kvadratga ko‘tarish begona ildiz beradi — har doim tekshiring.', ru: 'Возведение в квадрат даёт посторонние корни — всегда проверяйте.', en: 'Squaring adds extraneous roots: always check.' } },
      ],
    },
  },
];
