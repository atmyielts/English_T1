import { UZ_MATH_TOPICS } from '../../subject-core/src/data/uz-math-topics.ts';
import type { LevelScale, PackManifest, SkillNode } from '../src/types.ts';

// B3 Admission Maths Coach. The skill tree is packages/subject-core's maths topic
// graph (UZ_MATH_TOPICS): its strands are the roots, each topic a node with the
// taxonomy's weight and prerequisites, so practice follows the same graph as the
// Admission service. That taxonomy is still a draft (`verified: false`), drafted from
// the school programme and not yet checked against the agency's published test
// programme; topics and weights move with it.

/** The expected share of exam maths questions answered right. Checked sets move it directly. */
export const PERCENT_SCALE: LevelScale = { id: 'percent', min: 0, max: 100, step: 5, fromAccuracy: true };

const STRANDS: Record<string, { uz: string; ru: string; en: string }> = {
  numbers: { uz: 'Sonlar va hisoblash', ru: 'Числа и вычисления', en: 'Numbers' },
  algebra: { uz: 'Algebra', ru: 'Алгебра', en: 'Algebra' },
  functions: { uz: 'Funksiyalar', ru: 'Функции', en: 'Functions' },
  sequences: { uz: 'Progressiyalar', ru: 'Прогрессии', en: 'Sequences' },
  exponents: { uz: 'Ko‘rsatkichli va logarifmik', ru: 'Показательные и логарифмы', en: 'Exponents and logarithms' },
  trigonometry: { uz: 'Trigonometriya', ru: 'Тригонометрия', en: 'Trigonometry' },
  word_problems: { uz: 'Matnli masalalar', ru: 'Текстовые задачи', en: 'Word problems' },
  calculus: { uz: 'Hosila va integral', ru: 'Производная и интеграл', en: 'Calculus' },
  probability: { uz: 'Kombinatorika va statistika', ru: 'Комбинаторика и статистика', en: 'Probability and statistics' },
  logic: { uz: 'To‘plamlar va mantiq', ru: 'Множества и логика', en: 'Sets and logic' },
  geometry: { uz: 'Planimetriya', ru: 'Планиметрия', en: 'Plane geometry' },
  solid_geometry: { uz: 'Stereometriya', ru: 'Стереометрия', en: 'Solid geometry' },
};

const skills: SkillNode[] = [
  ...Object.entries(STRANDS).map(([id, name]) => ({ id, name })),
  // Writing out a full solution, scored by the solution rubric (its four criteria).
  { id: 'solutions', name: { uz: 'Yechimni yozish', ru: 'Запись решения', en: 'Writing solutions' }, weight: 0.6 },
  { id: 'solutions.method', parent: 'solutions', name: { uz: 'Usulni tanlash', ru: 'Выбор метода', en: 'Choosing the method' } },
  { id: 'solutions.working', parent: 'solutions', name: { uz: 'Hisob-kitob', ru: 'Вычисления', en: 'Working' } },
  { id: 'solutions.reasoning', parent: 'solutions', name: { uz: 'Asoslash va tekshirish', ru: 'Обоснование и проверка', en: 'Reasoning and checks' } },
  { id: 'solutions.answer', parent: 'solutions', name: { uz: 'To‘liq javob', ru: 'Полный ответ', en: 'Complete answer' } },
  ...UZ_MATH_TOPICS.topics.map((topic) => ({
    id: topic.code, parent: topic.strand, name: { uz: topic.names.uz, ru: topic.names.ru, en: topic.names.en },
    weight: topic.weight, ...(topic.prerequisites.length ? { requires: [...topic.prerequisites] } : {}),
  })),
];

export const manifest: PackManifest = {
  id: 'maths',
  feature: 'B3',
  version: '1.0.0',
  name: { uz: 'Matematika: OTMga kirish murabbiyi', ru: 'Математика: коуч для поступления', en: 'Admission Maths Coach' },
  tagline: {
    uz: 'Har kuni zaif mavzularingiz bo‘yicha masalalar, mini sinovlar, xatolar daftari va kutilayotgan natija.',
    ru: 'Каждый день задачи по слабым темам, мини-пробники, тетрадь ошибок и прогноз результата.',
    en: 'Daily problems on your weakest topics, timed mini-mocks, a mistake notebook and a predicted score.',
  },
  description: {
    uz: 'OTMga kirish testining matematika qismiga tayyorgarlik. Har kungi masalalar mavzular grafi bo‘yicha tanlanadi: avval eng zaif va eng muhim mavzu, uning asosiy mavzulari mustahkam bo‘lgandan keyin. Masala rasmini yuboring — avval maslahat, so‘rasangiz to‘liq yechim. Vaqtli mini sinovlar, xatolar daftari, kutilayotgan natija va boshqa o‘quvchilar orasidagi anonim o‘rningiz.',
    ru: 'Подготовка к математике на вступительном тесте в вузы. Задачи на каждый день подбираются по графу тем: сначала самая слабая и важная тема, после того как окрепли её базовые темы. Пришлите фото задачи — сначала подсказки, по запросу полное решение. Мини-пробники на время, тетрадь ошибок, прогноз результата и ваше анонимное место среди других учеников.',
    en: 'Maths for the national university admission test. Daily problems follow the topic graph: your weakest, most valuable topic once its basics are solid. Send a photo of a problem for hints, then the worked solution. Timed mini-mocks, a mistake notebook, a predicted score and your anonymous place among other learners.',
  },
  uiLanguages: ['uz', 'ru'],
  practiceLanguage: 'mixed',
  contentLanguage: 'uz',
  audience: {
    description: {
      uz: 'Matematikadan OTMga kirish testiga tayyorlanayotgan 9–11-sinf o‘quvchilari va bitiruvchilar.',
      ru: 'Ученики 9–11 классов и выпускники, которые готовятся к математике на вступительном тесте в вузы.',
      en: 'Students in grades 9–11 and school leavers preparing for maths on the university admission test.',
    },
    minAge: 13,
    levels: [20, 100],
  },
  scale: PERCENT_SCALE,
  skills,
  errorTags: [
    {
      id: 'signs', node: 'numbers', drill: 'drill.signs',
      name: { uz: 'Ishora xatolari', ru: 'Ошибки в знаках' },
      explain: {
        uz: 'Qavs oldidagi minus qavs ichidagi har bir hadning ishorasini o‘zgartiradi: −(x − 3) = −x + 3. Manfiy sonni kvadratga ko‘tarishda qavsga e’tibor bering: (−2)² = 4, lekin −2² = −4.',
        ru: 'Минус перед скобкой меняет знак каждого слагаемого в ней: −(x − 3) = −x + 3. При возведении отрицательного числа в квадрат следите за скобками: (−2)² = 4, но −2² = −4.',
      },
    },
    {
      id: 'order_of_operations', node: 'numbers', drill: 'drill.order_of_operations',
      name: { uz: 'Amallar tartibi', ru: 'Порядок действий' },
      explain: {
        uz: 'Avval qavs, keyin daraja, so‘ng ko‘paytirish va bo‘lish (chapdan o‘ngga), oxirida qo‘shish va ayirish. 20 − 12 : 4 = 20 − 3 = 17, 2 emas.',
        ru: 'Сначала скобки, затем степени, потом умножение и деление (слева направо), в конце сложение и вычитание. 20 − 12 : 4 = 20 − 3 = 17, а не 2.',
      },
    },
    {
      id: 'fractions', node: 'math.num.fractions', drill: 'drill.fractions',
      name: { uz: 'Kasrlar bilan amallar', ru: 'Действия с дробями' },
      explain: {
        uz: 'Qo‘shish va ayirishda kasrlarni umumiy maxrajga keltiring; ko‘paytirishda surat suratga, maxraj maxrajga ko‘paytiriladi; bo‘lishda ikkinchi kasr ag‘dariladi: 3/4 : 3/8 = 3/4 · 8/3 = 2.',
        ru: 'При сложении и вычитании приведите дроби к общему знаменателю; при умножении числитель на числитель, знаменатель на знаменатель; при делении вторую дробь переворачивают: 3/4 : 3/8 = 3/4 · 8/3 = 2.',
      },
    },
    {
      id: 'percent_base', node: 'math.num.percent', drill: 'drill.percent_base',
      name: { uz: 'Foiz qaysi sondan', ru: 'Процент от какого числа' },
      explain: {
        uz: 'Foiz har doim asos sondan olinadi. 40 dan 50 ga oshish — 40 ning 25% i, 50 dan 40 ga kamayish — 50 ning 20% i. Ketma-ket oshirish va kamaytirishda har safar yangi son asos bo‘ladi.',
        ru: 'Процент всегда берётся от базового числа. Рост с 40 до 50 — это 25% от 40, а снижение с 50 до 40 — 20% от 50. При последовательных изменениях базой каждый раз становится новое число.',
      },
    },
    {
      id: 'lost_root', node: 'math.alg.quadratic', drill: 'drill.lost_root',
      name: { uz: 'Yo‘qolgan ildiz', ru: 'Потерянный корень' },
      explain: {
        uz: 'x² = 16 ning ikkita ildizi bor: ±4. Tenglamani x ga bo‘lmang (x = 0 ildizi yo‘qoladi): x² = 5x ni x(x − 5) = 0 ko‘rinishiga keltiring.',
        ru: 'У x² = 16 два корня: ±4. Не делите уравнение на x (теряется корень x = 0): запишите x² = 5x как x(x − 5) = 0.',
      },
    },
    {
      id: 'domain', node: 'math.alg.irrational', drill: 'drill.domain',
      name: { uz: 'Aniqlanish sohasi', ru: 'Область определения' },
      explain: {
        uz: 'Maxraj nolga teng bo‘lmaydi, juft darajali ildiz ostidagi ifoda manfiy bo‘lmaydi, logarifm ostidagi ifoda musbat bo‘ladi. Topilgan ildizlarni shu shartlar bilan tekshiring va begona ildizlarni chiqarib tashlang.',
        ru: 'Знаменатель не равен нулю, подкоренное выражение чётной степени неотрицательно, выражение под логарифмом положительно. Проверьте найденные корни этими условиями и отбросьте посторонние.',
      },
    },
    {
      id: 'inequality_flip', node: 'math.alg.inequalities', drill: 'drill.inequality_flip',
      name: { uz: 'Tengsizlik belgisini almashtirish', ru: 'Смена знака неравенства' },
      explain: {
        uz: 'Tengsizlikni manfiy songa ko‘paytirsangiz yoki bo‘lsangiz, belgisi teskarisiga o‘zgaradi: −3x < 12 ⇒ x > −4.',
        ru: 'При умножении или делении неравенства на отрицательное число знак меняется на противоположный: −3x < 12 ⇒ x > −4.',
      },
    },
    {
      id: 'powers', node: 'math.alg.powers', drill: 'drill.powers',
      name: { uz: 'Daraja xossalari', ru: 'Свойства степеней' },
      explain: {
        uz: 'Bir xil asosli darajalar ko‘paytirilganda ko‘rsatkichlar qo‘shiladi (a³·a⁵ = a⁸), darajani darajaga ko‘tarishda ko‘paytiriladi ((a²)³ = a⁶). a⁰ = 1, a⁻ⁿ = 1/aⁿ.',
        ru: 'При умножении степеней с одинаковым основанием показатели складываются (a³·a⁵ = a⁸), при возведении степени в степень — перемножаются ((a²)³ = a⁶). a⁰ = 1, a⁻ⁿ = 1/aⁿ.',
      },
    },
    {
      id: 'formulas', node: 'geometry', drill: 'drill.formulas',
      name: { uz: 'Yuza, perimetr va hajm formulalari', ru: 'Формулы площади, периметра и объёма' },
      explain: {
        uz: 'Perimetr — chiziq uzunligi (sm), yuza — sirt (sm²), hajm — fazo (sm³). Doira: uzunlik 2πr, yuza πr². Kub: hajm a³, to‘la sirt 6a².',
        ru: 'Периметр — длина (см), площадь — поверхность (см²), объём — пространство (см³). Круг: длина 2πr, площадь πr². Куб: объём a³, полная поверхность 6a².',
      },
    },
    {
      id: 'units', node: 'word_problems', drill: 'drill.units',
      name: { uz: 'O‘lchov birliklari', ru: 'Единицы измерения' },
      explain: {
        uz: 'Hisoblashdan oldin hamma kattaliklarni bir xil birlikka keltiring: 1 m = 100 sm, 1 m² = 10 000 sm², 1 soat = 60 minut, 1 km/soat = 1000/3600 m/s.',
        ru: 'Перед вычислением переведите все величины в одни единицы: 1 м = 100 см, 1 м² = 10 000 см², 1 час = 60 минут, 1 км/ч = 1000/3600 м/с.',
      },
    },
    {
      id: 'trig_values', node: 'math.trig.identities', drill: 'drill.trig_values',
      name: { uz: 'Trigonometrik qiymatlar va ishoralar', ru: 'Значения и знаки тригонометрических функций' },
      explain: {
        uz: '30°, 45°, 60° qiymatlarini jadvaldan eslab qoling va chorak bo‘yicha ishorani aniqlang: II chorakda sinus musbat, kosinus manfiy; III chorakda tangens musbat.',
        ru: 'Запомните значения для 30°, 45°, 60° и определяйте знак по четверти: во II четверти синус положителен, косинус отрицателен; в III четверти тангенс положителен.',
      },
    },
    {
      id: 'vieta', node: 'math.alg.quadratic', drill: 'drill.vieta',
      name: { uz: 'Viyet teoremasi', ru: 'Теорема Виета' },
      explain: {
        uz: 'ax² + bx + c = 0 uchun x₁ + x₂ = −b/a, x₁·x₂ = c/a. Ishorani unutmang va a ≠ 1 bo‘lsa, a ga bo‘ling. Avval ildizlar mavjudligini (D ≥ 0) tekshiring.',
        ru: 'Для ax² + bx + c = 0: x₁ + x₂ = −b/a, x₁·x₂ = c/a. Не забывайте знак и делите на a, если a ≠ 1. Сначала проверьте, что корни существуют (D ≥ 0).',
      },
    },
  ],
  menu: [
    { action: 'today', emoji: '📅', label: { uz: 'Bugungi reja', ru: 'План на сегодня' } },
    { action: 'practice', emoji: '🧮', label: { uz: 'Masalalar', ru: 'Задачи' } },
    { action: 'mock', emoji: '⏱', label: { uz: 'Mini sinov', ru: 'Мини-пробник' } },
    { action: 'mistakes', emoji: '📒', label: { uz: 'Xatolar daftari', ru: 'Тетрадь ошибок' } },
    { action: 'photo', emoji: '📷', label: { uz: 'Rasm bo‘yicha yordam', ru: 'Помощь по фото' } },
    { action: 'writing', emoji: '✍️', label: { uz: 'Yechimni tekshirish', ru: 'Проверка решения' } },
    { action: 'drill', emoji: '🎯', label: { uz: 'Xatolar ustida mashq', ru: 'Работа над ошибками' } },
    { action: 'lesson', emoji: '📘', label: { uz: 'Usullar', ru: 'Методы' } },
    { action: 'progress', emoji: '📈', label: { uz: 'Natijalarim', ru: 'Мой прогресс' } },
    { action: 'report', emoji: '🗓', label: { uz: 'Haftalik hisobot', ru: 'Недельный отчёт' } },
    { action: 'plan', emoji: '🧭', label: { uz: 'Reja', ru: 'План' } },
    { action: 'settings', emoji: '⚙️', label: { uz: 'Sozlamalar', ru: 'Настройки' } },
    { action: 'help', emoji: '❓', label: { uz: 'Yordam', ru: 'Помощь' } },
  ],
  commands: [
    { command: 'today', description: { uz: 'Bugungi masalalar', ru: 'Задачи на сегодня' } },
    { command: 'practice', description: { uz: 'Zaif mavzu bo‘yicha masalalar', ru: 'Задачи по слабой теме' } },
    { command: 'mock', description: { uz: 'Vaqtli mini sinov', ru: 'Мини-пробник на время' } },
    { command: 'mistakes', description: { uz: 'Xatolar daftari', ru: 'Тетрадь ошибок' } },
    { command: 'photo', description: { uz: 'Masala rasmi bo‘yicha yordam', ru: 'Помощь по фото задачи' } },
    { command: 'writing', description: { uz: 'Yechimingizni tekshirish', ru: 'Проверить ваше решение' } },
    { command: 'progress', description: { uz: 'Natijalar va prognoz', ru: 'Прогресс и прогноз' } },
    { command: 'report', description: { uz: 'Haftalik hisobot', ru: 'Недельный отчёт' } },
    { command: 'plan', description: { uz: 'Reja va maqsad', ru: 'План и цель' } },
    { command: 'settings', description: { uz: 'Til va eslatmalar', ru: 'Язык и напоминания' } },
    { command: 'help', description: { uz: 'Yordam', ru: 'Помощь' } },
  ],
  correctionModes: [],
  accent: '#2563eb',
};
