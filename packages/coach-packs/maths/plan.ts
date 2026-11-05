import type { FluencyConfig, Milestone, PlanRules, Reminders } from '../src/types.ts';

// The plan to the exam date: each day's problem sets follow the topic graph
// (`selection: 'mastery'`), with the compulsory-block mini-mock every Saturday. Speaking is
// not part of this coach; the fluency settings exist only because every pack has them.

export const fluency: FluencyConfig = {
  fillers: {
    uz: ['ee', 'aa', 'anu', 'haligi', 'mana'],
    ru: ['ну', 'типа', 'это самое', 'как бы', 'эээ'],
  },
  longPauseSeconds: 2,
  pace: [[0, 60, 160]],
};

export const plan: PlanRules = {
  goal: { options: [50, 60, 70, 80, 90, 95], default: 70, examDate: 'optional', defaultWeeks: 24 },
  dailyMinutes: { options: [20, 30, 45, 60], default: 30 },
  selection: 'mastery',
  phases: [
    {
      id: 'foundations', minWeeksLeft: 16,
      title: { uz: 'Poydevor', ru: 'Фундамент', en: 'Foundations' },
      // Mostly topic sets, which start from the prerequisites of the graph; method cards and drills on recurring slips.
      mix: { practice: 5, lesson: 2, drill: 2, writing: 1 },
    },
    {
      id: 'syllabus', minWeeksLeft: 6,
      title: { uz: 'Butun dastur', ru: 'Вся программа', en: 'The whole syllabus' },
      mix: { practice: 6, drill: 2, writing: 2, lesson: 1 },
    },
    {
      id: 'sprint', minWeeksLeft: 0,
      title: { uz: 'Imtihon oldidan', ru: 'Финишная прямая', en: 'Exam sprint' },
      mix: { practice: 7, drill: 2, writing: 1 },
    },
  ],
  weeklyMock: { activity: 'mock.compulsory', weekday: 6, title: { uz: 'Shanba mini sinovi', ru: 'Субботний мини-пробник', en: 'Saturday mini-mock' } },
  links: [],
};

export const reminders: Reminders = {
  daily: [
    { uz: 'Xayrli kun, {name}! Bugun: {task}, taxminan {minutes} daqiqa. Har kungi besh masala — imtihonga eng ishonchli yo‘l.', ru: 'Добрый день, {name}! Сегодня: {task}, около {minutes} минут. Пять задач каждый день — самый надёжный путь к экзамену.' },
    { uz: '{name}, {streak} kunlik seriyangiz davom etsinmi? Bugungi mashq: {task} ({minutes} daqiqa).', ru: '{name}, продолжим серию ({streak} дн.)? Сегодня: {task} ({minutes} минут).' },
    { uz: 'Bugun eng zaif mavzuingizdan boshlaymiz: {task}. {minutes} daqiqa yetadi.', ru: 'Сегодня начинаем с самой слабой темы: {task}. Хватит {minutes} минут.' },
    { uz: '{coach}: hozirgi darajangiz {level}, maqsad {target}. Bugungi qadam — {task}.', ru: '{coach}: сейчас вы на уровне {level}, цель {target}. Шаг на сегодня — {task}.' },
    { uz: 'Qoralama va qalam tayyormi, {name}? {task} — {minutes} daqiqa, maslahatlar bor.', ru: 'Черновик и ручка готовы, {name}? {task} — {minutes} минут, подсказки есть.' },
    { uz: 'Kecha xato qilgan masalalaringiz daftarda kutyapti. Bugun: {task}, {minutes} daqiqa.', ru: 'Задачи, где вы ошиблись, ждут в тетради ошибок. Сегодня: {task}, {minutes} минут.' },
  ],
  comeback: [
    { uz: '{name}, kecha mashq bo‘lmadi — hechqisi yo‘q. Bugun qisqa to‘plam bilan qaytamiz: {task}.', ru: '{name}, вчера занятия не было — ничего страшного. Вернёмся с короткого набора: {task}.' },
    { uz: 'Seriya uzildi, lekin bilim joyida. 10 daqiqa: {task} — va yana yo‘ldamiz.', ru: 'Серия прервалась, но знания на месте. 10 минут: {task} — и мы снова в пути.' },
  ],
  weekly: { uz: 'Haftalik hisobotingiz tayyor: {delta}. Qaysi mavzular o‘sganini va keyingi hafta nimaga e’tibor berishni ko‘ring.', ru: 'Недельный отчёт готов: {delta}. Посмотрите, какие темы выросли и на чём сосредоточиться на следующей неделе.' },
  countdown: [
    { uz: 'Imtihongacha {days} kun qoldi. Bugungi reja: {task}.', ru: 'До экзамена осталось дней: {days}. План на сегодня: {task}.' },
    { uz: '{days} kun qoldi, {name}. Har bir mini sinov — imtihon kunining mashqi. Bugun: {task}.', ru: 'Осталось дней: {days}, {name}. Каждый мини-пробник — репетиция экзамена. Сегодня: {task}.' },
  ],
};

const level = (id: string, min: number, uz: string, ru: string): Milestone => ({
  id, level: min, certificate: true,
  name: { uz, ru, en: `Admission maths ${min}%` },
  rule: { rubric: 'admission.mock', metric: 'overall', min, count: 2, withinDays: 30 },
});

// Level-ups from two timed mini-mocks at or above the share within 30 days, and one for
// written solutions.
export const milestones: Milestone[] = [
  level('mock-50', 50, 'Matematika: 50% daraja', 'Математика: уровень 50%'),
  level('mock-65', 65, 'Matematika: 65% daraja', 'Математика: уровень 65%'),
  level('mock-80', 80, 'Matematika: 80% daraja', 'Математика: уровень 80%'),
  level('mock-90', 90, 'Matematika: 90% daraja', 'Математика: уровень 90%'),
  {
    id: 'solutions-75', level: 75, certificate: true,
    name: { uz: 'To‘liq yechim ustasi', ru: 'Мастер полного решения', en: 'Full solutions' },
    rule: { rubric: 'maths.solution', metric: 'overall', min: 75, count: 3, withinDays: 30 },
  },
];
