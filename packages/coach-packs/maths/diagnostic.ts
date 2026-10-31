import { T } from '../src/localize.ts';
import type { Diagnostic, DiagnosticItem } from '../src/types.ts';
import { arrange, type L } from './bank.ts';

// The free placement test (no AI): 20 problems from the four big parts of the test at
// four levels (the expected share of exam questions right: 30, 50, 70, 90) and four
// can-do statements. Answers are checked by computation in test/maths-answers.test.ts.

const q = (id: string, skill: string, level: number, prompt: L | string, options: string[], answer: number): DiagnosticItem =>
  arrange<DiagnosticItem>({ id, skill, level, kind: 'question', prompt: typeof prompt === 'string' ? prompt : T(prompt), options, answer }, `diag#${id}`);
const canDo = (id: string, skill: string, level: number, prompt: L): DiagnosticItem => ({ id, skill, level, kind: 'can_do', prompt });

export const diagnostic: Diagnostic = {
  intro: {
    uz: '📝 <b>Daraja testi</b>: 20 ta masala va 4 ta savol o‘zingiz haqingizda, taxminan 15 daqiqa. Qoralama qog‘oz oling. Bilmasangiz, taxmin qiling — natija qaysi mavzulardan boshlashni ko‘rsatadi.',
    ru: '📝 <b>Тест уровня</b>: 20 задач и 4 вопроса о себе, около 15 минут. Возьмите черновик. Если не знаете — выберите наугад: результат покажет, с каких тем начать.',
  },
  minutes: 15,
  passRatio: 0.6,
  items: [
    q('d01', 'numbers', 30, '3/4 + 1/8 = ?', ['7/8', '4/12', '1/3', '5/8'], 0),
    q('d02', 'numbers', 50, { uz: '360 ning 15% ini toping.', ru: 'Найдите 15% от 360.' }, ['54', '24', '45', '36'], 0),
    q('d03', 'numbers', 70, '√12 · √3 = ?', ['6', '√15', '36', '3√2'], 0),
    q('d04', 'numbers', 90, { uz: '0,(18) ni oddiy kasrga aylantiring.', ru: 'Обратите 0,(18) в обыкновенную дробь.' }, ['2/11', '9/50', '18/100', '1/6'], 0),
    q('d05', 'algebra', 30, { uz: 'Tenglamani yeching: 2x − 7 = 9.', ru: 'Решите уравнение: 2x − 7 = 9.' }, ['8', '1', '16', '−1'], 0),
    q('d06', 'algebra', 50, { uz: 'x² − 7x + 10 = 0 ning ildizlari?', ru: 'Корни уравнения x² − 7x + 10 = 0?' }, ['2; 5', '−2; −5', '1; 10', '−2; 5'], 0),
    q('d07', 'algebra', 70, { uz: 'Tengsizlikni yeching: x² − 3x − 4 < 0.', ru: 'Решите неравенство: x² − 3x − 4 < 0.' }, ['(−1; 4)', '(−4; 1)', '(−∞; −1) ∪ (4; +∞)', '[−1; 4]'], 0),
    q('d08', 'algebra', 90, { uz: 'Tenglamani yeching: √(x + 3) = x − 3.', ru: 'Решите уравнение: √(x + 3) = x − 3.' }, ['6', '1; 6', '1', '3'], 0),
    q('d09', 'functions', 30, { uz: 'f(x) = 3x − 2 bo‘lsa, f(4) = ?', ru: 'f(x) = 3x − 2. f(4) = ?' }, ['10', '14', '12', '2'], 0),
    q('d10', 'sequences', 50, { uz: 'Arifmetik progressiyada a₁ = 4, d = 3. a₈ = ?', ru: 'В арифметической прогрессии a₁ = 4, d = 3. a₈ = ?' }, ['25', '28', '24', '31'], 0),
    q('d11', 'exponents', 70, { uz: 'Tenglamani yeching: 2ˣ⁺² = 32.', ru: 'Решите уравнение: 2ˣ⁺² = 32.' }, ['3', '5', '30', '4'], 0),
    q('d12', 'exponents', 90, { uz: 'Tenglamani yeching: log₂ (x + 1) + log₂ (x − 1) = 3.', ru: 'Решите уравнение: log₂ (x + 1) + log₂ (x − 1) = 3.' }, ['3', '−3; 3', '√5', '9'], 0),
    q('d13', 'trigonometry', 70, 'cos 60° + sin 30° = ?', ['1', '√3', '1/2', '√3/2'], 0),
    q('d14', 'trigonometry', 90, { uz: 'sin α = 0,8 va π/2 < α < π bo‘lsa, tg α = ?', ru: 'sin α = 0,8, π/2 < α < π. tg α = ?' }, ['−4/3', '4/3', '−3/4', '3/4'], 0),
    q('d15', 'word_problems', 50, { uz: 'Bir usta ishni 4 kunda, ikkinchisi 12 kunda bajaradi. Birgalikda necha kunda bajaradi?', ru: 'Один мастер делает работу за 4 дня, другой за 12. За сколько дней они сделают её вместе?' }, ['3', '8', '16', '6'], 0),
    q('d16', 'calculus', 90, { uz: 'f(x) = x³ − 3x² bo‘lsa, f′(2) = ?', ru: 'f(x) = x³ − 3x². f′(2) = ?' }, ['0', '−4', '12', '4'], 0),
    q('d17', 'geometry', 30, { uz: 'To‘g‘ri to‘rtburchakning tomonlari 7 va 4. Yuzi?', ru: 'Стороны прямоугольника 7 и 4. Площадь?' }, ['28', '22', '11', '14'], 0),
    q('d18', 'geometry', 50, { uz: 'To‘g‘ri burchakli uchburchakning katetlari 5 va 12. Gipotenuza?', ru: 'Катеты прямоугольного треугольника 5 и 12. Гипотенуза?' }, ['13', '17', '7', '15'], 0),
    q('d19', 'geometry', 70, { uz: 'Radiusi 6 bo‘lgan doiraning 90° li sektori yuzi?', ru: 'Площадь сектора 90° круга радиуса 6?' }, ['9π', '36π', '18π', '3π'], 0),
    q('d20', 'solid_geometry', 90, { uz: 'Konusning radiusi 3, balandligi 4. Hajmi?', ru: 'Радиус конуса 3, высота 4. Объём?' }, ['12π', '36π', '15π', '48π'], 0),
    canDo('c01', 'numbers', 50, { uz: 'Kasrlar va foizlarga doir masalalarni kalkulyatorsiz ishonch bilan yechaman.', ru: 'Уверенно решаю задачи на дроби и проценты без калькулятора.' }),
    canDo('c02', 'algebra', 70, { uz: 'Kvadrat va kasr-ratsional tengsizliklarni oraliqlar usulida yechaman.', ru: 'Решаю квадратные и дробно-рациональные неравенства методом интервалов.' }),
    canDo('c03', 'geometry', 70, { uz: 'Uchburchak va doira yuzlarini kerakli formulani tanlab topaman.', ru: 'Нахожу площади треугольников и кругов, выбирая нужную формулу.' }),
    canDo('c04', 'calculus', 90, { uz: 'Hosila yordamida funksiyaning kesmadagi eng katta va eng kichik qiymatini topaman.', ru: 'С помощью производной нахожу наибольшее и наименьшее значения функции на отрезке.' }),
  ],
};
