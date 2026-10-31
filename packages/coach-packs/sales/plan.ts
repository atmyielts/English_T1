import type { FluencyConfig, Milestone, PlanRules, Reminders } from '../src/types.ts';

// Fluency settings, the "first 90 days in sales" plan, reminders and the level-ups.
// A target date is optional (a sales review, a new job, a season); without one the
// plan runs twelve weeks.

export const fluency: FluencyConfig = {
  fillers: {
    en: ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'you know', 'i mean', 'sort of', 'kind of', 'basically'],
    uz: ['ee', 'eee', 'aa', 'anu', 'haligi', 'mana', 'xullas', 'yani', 'qisqasi', 'nima desam'],
    ru: ['ну', 'типа', 'это самое', 'как бы', 'короче', 'в общем', 'эээ', 'так сказать'],
  },
  longPauseSeconds: 2,
  // [minLevel, minWpm, maxWpm]: a clear, unhurried selling pace on the phone.
  pace: [[1, 80, 150], [3, 100, 160], [4, 110, 165]],
};

export const plan: PlanRules = {
  goal: { options: [2, 2.5, 3, 3.5, 4, 4.5, 5], default: 3.5, examDate: 'optional', defaultWeeks: 12 },
  dailyMinutes: { options: [10, 15, 20, 30], default: 15 },
  phases: [
    {
      id: 'foundations', minWeeksLeft: 8,
      title: { en: 'Foundations: openings and questions', uz: 'Asoslar: suhbat boshlanishi va savollar', ru: 'Основы: начало разговора и вопросы' },
      // Short lessons and drills on openings and discovery, with an easy call most days.
      mix: { lesson: 3, drill: 3, roleplay: 3, writing: 1 },
    },
    {
      id: 'objections', minWeeksLeft: 4,
      title: { en: 'Objections and value', uz: 'E’tirozlar va qiymat', ru: 'Возражения и ценность' },
      // Every objection type, by voice and in writing.
      mix: { roleplay: 4, drill: 3, writing: 2, lesson: 1 },
    },
    {
      id: 'closing', minWeeksLeft: 0,
      title: { en: 'Closing and negotiation', uz: 'Bitimni yopish va muzokara', ru: 'Закрытие и переговоры' },
      // Mostly scored calls, so level-ups can be confirmed.
      mix: { roleplay: 5, drill: 2, writing: 2 },
    },
  ],
  weeklyMock: { activity: 'rp.mix-pharma-distribution', weekday: 5, title: { en: 'Friday tough buyer: three objections in one call', uz: 'Juma kungi qiyin mijoz: bitta qo‘ng‘iroqda uchta e’tiroz', ru: 'Пятничный сложный клиент: три возражения за один звонок' } },
  links: [],
};

export const reminders: Reminders = {
  daily: [
    {
      en: 'Good morning, {name}! Today: {task} — about {minutes} minutes. One good call a day is how sellers get better.',
      uz: 'Xayrli tong, {name}! Bugun: {task} — taxminan {minutes} daqiqa. Kuniga bitta yaxshi qo‘ng‘iroq — sotuvchi shunday o‘sadi.',
      ru: 'Доброе утро, {name}! Сегодня: {task} — около {minutes} мин. Один хороший звонок в день — так растут продавцы.',
    },
    {
      en: '{name}, your {streak}-day streak is waiting. {minutes} minutes today: {task}.',
      uz: '{name}, {streak} kunlik seriyangiz davomini kutyapti. Bugun {minutes} daqiqa: {task}.',
      ru: '{name}, ваша серия ({streak} дн.) ждёт продолжения. Сегодня {minutes} мин.: {task}.',
    },
    {
      en: 'A buyer is waiting for your call, {name}: {task}. {coach} has the scorecard ready.',
      uz: 'Mijoz qo‘ng‘irog‘ingizni kutyapti, {name}: {task}. {coach} natija kartasini tayyorlab qo‘ygan.',
      ru: 'Клиент ждёт вашего звонка, {name}: {task}. {coach} уже готовит карту результата.',
    },
    {
      en: 'Before your first real call today, warm up for {minutes} minutes, {name}: {task}.',
      uz: 'Bugungi birinchi haqiqiy qo‘ng‘irog‘ingizdan oldin {minutes} daqiqa mashq qilib oling, {name}: {task}.',
      ru: 'Перед первым настоящим звонком сегодня разомнитесь {minutes} мин., {name}: {task}.',
    },
    {
      en: 'Today’s practice, {name}: {task}. Short, scored and one step closer to {target}.',
      uz: 'Bugungi mashq, {name}: {task}. Qisqa, baholanadi va sizni {target} darajaga yana bir qadam yaqinlashtiradi.',
      ru: 'Сегодняшняя тренировка, {name}: {task}. Коротко, с оценкой и ещё на шаг ближе к {target}.',
    },
    {
      en: '{name}, objections are easier when you’ve heard them before. {minutes} minutes: {task}.',
      uz: '{name}, e’tirozni oldin eshitgan bo‘lsangiz, unga javob berish osonroq. {minutes} daqiqa: {task}.',
      ru: '{name}, с возражениями проще, если вы их уже слышали. {minutes} мин.: {task}.',
    },
  ],
  comeback: [
    {
      en: 'We missed you yesterday, {name}. Pick up where you left off: {task}, {minutes} minutes.',
      uz: 'Kecha sizni sog‘indik, {name}. To‘xtagan joyingizdan davom eting: {task}, {minutes} daqiqa.',
      ru: 'Вчера вас не хватало, {name}. Продолжим с того же места: {task}, {minutes} мин.',
    },
    {
      en: 'Busy days happen, {name}. One short call today keeps your skills sharp: {task}.',
      uz: 'Band kunlar bo‘lib turadi, {name}. Bugun bitta qisqa qo‘ng‘iroq — va ko‘nikmalaringiz susaymaydi: {task}.',
      ru: 'Бывают загруженные дни, {name}. Один короткий звонок сегодня — и навыки останутся в форме: {task}.',
    },
  ],
  weekly: {
    en: 'Your weekly sales report is ready, {name}: {delta}. See this week against last week and what to work on next.',
    uz: 'Haftalik savdo hisobotingiz tayyor, {name}: {delta}. Bu haftani o‘tgan hafta bilan solishtiring va keyingi qadamni ko‘ring.',
    ru: 'Ваш еженедельный отчёт по продажам готов, {name}: {delta}. Сравните с прошлой неделей и посмотрите, над чем работать дальше.',
  },
  countdown: [
    {
      en: '{days} days to your target date, {name}. Today: {task}, {minutes} minutes.',
      uz: 'Maqsadli sanagacha {days} kun qoldi, {name}. Bugun: {task}, {minutes} daqiqa.',
      ru: 'До целевой даты осталось дней: {days}, {name}. Сегодня: {task}, {minutes} мин.',
    },
    {
      en: '{days} days left. You’re at {level}, aiming for {target}. Keep the calls coming: {task}.',
      uz: '{days} kun qoldi. Siz {level} darajadasiz, maqsad — {target}. Qo‘ng‘iroqlarni davom ettiring: {task}.',
      ru: 'Осталось дней: {days}. Сейчас у вас {level}, цель — {target}. Продолжайте звонки: {task}.',
    },
  ],
};

const levelUp = (id: string, level: number, label: string, count: number, withinDays: number): Milestone => ({
  id, level,
  name: { en: `Sales ${label}`, uz: `Savdo ${label}`, ru: `Продажи ${label}` },
  rule: { rubric: 'sales.call', metric: 'overall', min: level, count, withinDays },
  certificate: true,
});

export const milestones: Milestone[] = [
  levelUp('sales-l2', 2, 'L2', 3, 30),
  levelUp('sales-l3', 3, 'L3', 3, 30),
  levelUp('sales-l3plus', 3.5, 'L3+', 3, 30),
  levelUp('sales-l4', 4, 'L4', 4, 30),
  levelUp('sales-l4plus', 4.5, 'L4+', 4, 45),
  levelUp('sales-l5', 5, 'L5', 4, 45),
];
