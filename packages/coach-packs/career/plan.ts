import type { FluencyConfig, Milestone, PlanRules, Reminders } from '../src/types.ts';

// Fluency settings for spoken answers, the job-search plan, reminders and level-ups.
// The plan runs to an optional date (an interview or a target start date), else for
// eight weeks: materials first, then applications with interview practice, then an
// interview sprint. A full mock interview every Saturday.

export const fluency: FluencyConfig = {
  fillers: {
    en: ['um', 'umm', 'uh', 'er', 'erm', 'hmm', 'you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually like'],
    uz: ['ee', 'eee', 'aa', 'anu', 'haligi', 'mana', 'xullas', 'ya’ni', 'nima edi'],
    ru: ['ну', 'типа', 'короче', 'как бы', 'это самое', 'эээ', 'в общем', 'так сказать', 'значит'],
  },
  longPauseSeconds: 2.5,
  // [minLevel, minWpm, maxWpm]: a comfortable interview pace.
  pace: [[1, 70, 140], [3, 95, 160], [4, 105, 170]],
};

export const plan: PlanRules = {
  goal: { options: [2.5, 3, 3.5, 4, 4.5, 5], default: 4, examDate: 'optional', defaultWeeks: 8 },
  dailyMinutes: { options: [10, 15, 20, 30, 45], default: 20 },
  phases: [
    {
      id: 'materials', minWeeksLeft: 5,
      title: { en: 'Materials: CV, letter, profiles', uz: 'Hujjatlar: rezyume, xat, profillar', ru: 'Документы: резюме, письмо, профили' },
      // Build the CV, letters and profiles, learn the answer formulas.
      mix: { writing: 4, lesson: 3, drill: 2, speaking: 1 },
    },
    {
      id: 'applications', minWeeksLeft: 2,
      title: { en: 'Applications and interview practice', uz: 'Arizalar va suhbat mashqi', ru: 'Отклики и тренировка интервью' },
      // Tailored applications plus daily answer practice and role-plays.
      mix: { speaking: 3, roleplay: 2, writing: 2, drill: 2, lesson: 1 },
    },
    {
      id: 'sprint', minWeeksLeft: 0,
      title: { en: 'Interview sprint', uz: 'Suhbatga jadal tayyorgarlik', ru: 'Интенсив перед интервью' },
      // Mostly scored interviews, so level-ups are confirmed before the real one.
      mix: { roleplay: 3, speaking: 3, drill: 1, writing: 1 },
    },
  ],
  weeklyMock: { activity: 'career.mock', weekday: 6, title: { en: 'Saturday full mock interview', uz: 'Shanba kungi to‘liq sinov suhbati', ru: 'Субботнее полное пробное интервью' } },
  links: [],
};

export const reminders: Reminders = {
  daily: [
    {
      en: 'Good morning, {name}! Today: {task} — about {minutes} minutes. One sharp answer a day adds up to a strong interview.',
      uz: 'Xayrli tong, {name}! Bugun: {task} — taxminan {minutes} daqiqa. Har kuni bitta puxta javob — kuchli suhbatga olib keladi.',
      ru: 'Доброе утро, {name}! Сегодня: {task} — около {minutes} минут. Один отточенный ответ в день — и интервью будет сильным.',
    },
    {
      en: '{name}, your {streak}-day streak is waiting. {minutes} minutes today: {task}.',
      uz: '{name}, {streak} kunlik seriyangiz davomini kutyapti. Bugun {minutes} daqiqa: {task}.',
      ru: '{name}, ваша серия занятий ({streak}) ждёт продолжения. Сегодня {minutes} минут: {task}.',
    },
    {
      en: 'Ready to practise, {name}? {coach} has today\'s task: {task}, about {minutes} minutes.',
      uz: 'Mashqqa tayyormisiz, {name}? {coach} bugungi vazifani tayyorladi: {task}, taxminan {minutes} daqiqa.',
      ru: 'Готовы потренироваться, {name}? У {coach} есть задание на сегодня: {task}, около {minutes} минут.',
    },
    {
      en: 'A recruiter decides fast. Make your next answer count, {name}: {task} ({minutes} minutes).',
      uz: 'Rekruter tez qaror qiladi. Keyingi javobingiz e’tiborga loyiq bo‘lsin, {name}: {task} ({minutes} daqiqa).',
      ru: 'Рекрутер решает быстро. Пусть следующий ответ работает на вас, {name}: {task} ({minutes} минут).',
    },
    {
      en: '{name}, you are aiming for {target}. Today\'s step: {task}, {minutes} minutes.',
      uz: '{name}, maqsadingiz — {target}. Bugungi qadam: {task}, {minutes} daqiqa.',
      ru: '{name}, ваша цель — {target}. Шаг на сегодня: {task}, {minutes} минут.',
    },
    {
      en: 'Ten good minutes beat an hour of worry, {name}. Today: {task}.',
      uz: 'O‘n daqiqalik mazmunli mashq bir soatlik xavotirdan yaxshiroq, {name}. Bugun: {task}.',
      ru: 'Десять минут практики лучше часа волнений, {name}. Сегодня: {task}.',
    },
  ],
  comeback: [
    {
      en: 'We missed you yesterday, {name}. Pick it up with something short: {task}, about {minutes} minutes.',
      uz: 'Kecha sizni sog‘indik, {name}. Qisqa narsadan qaytadan boshlang: {task}, taxminan {minutes} daqiqa.',
      ru: 'Вчера вас не было, {name}. Вернитесь с чего-нибудь короткого: {task}, около {minutes} минут.',
    },
    {
      en: 'The job search has slow days. One small step today keeps it moving, {name}: {task}.',
      uz: 'Ish qidirishda sekin kunlar ham bo‘ladi. Bugun bitta kichik qadam jarayonni davom ettiradi, {name}: {task}.',
      ru: 'В поиске работы бывают медленные дни. Один маленький шаг сегодня не даст остановиться, {name}: {task}.',
    },
  ],
  weekly: {
    en: 'Your weekly report from {coach} is ready: {delta}. See what moved and what to work on next.',
    uz: '{coach} dan haftalik hisobotingiz tayyor: {delta}. Nima o‘zgargani va keyin nima ustida ishlashni ko‘ring.',
    ru: 'Ваш недельный отчёт от {coach} готов: {delta}. Посмотрите, что сдвинулось и над чем работать дальше.',
  },
  countdown: [
    {
      en: '{days} days to go, {name}. Today: {task}. Rehearse the answer you are least sure of.',
      uz: '{days} kun qoldi, {name}. Bugun: {task}. Eng kam ishonchingiz komil bo‘lgan javobni mashq qiling.',
      ru: 'Осталось дней: {days}, {name}. Сегодня: {task}. Отрепетируйте ответ, в котором вы меньше всего уверены.',
    },
    {
      en: 'Only {days} days left, {name}. A full mock today will show you what to polish.',
      uz: 'Atigi {days} kun qoldi, {name}. Bugun to‘liq sinov suhbati nimani sayqallash kerakligini ko‘rsatadi.',
      ru: 'Осталось всего {days} дн., {name}. Полное пробное интервью сегодня покажет, что доработать.',
    },
  ],
};

const interviewLevel = (id: string, level: number, label: string, count = 3): Milestone => ({
  id, level, certificate: true,
  name: { en: `Interview skills ${label}`, uz: `Suhbat ko‘nikmalari ${label}`, ru: `Навыки собеседования ${label}` },
  rule: { rubric: 'career.interview', metric: 'overall', min: level, count, withinDays: 30 },
});

export const milestones: Milestone[] = [
  interviewLevel('interview-l3', 3, 'L3'),
  interviewLevel('interview-l3plus', 3.5, 'L3+'),
  interviewLevel('interview-l4', 4, 'L4'),
  interviewLevel('interview-l4plus', 4.5, 'L4+'),
  interviewLevel('interview-l5', 5, 'L5'),
  {
    id: 'cv-l4', level: 4, certificate: true,
    name: { en: 'CV writing L4', uz: 'Rezyume yozish L4', ru: 'Составление резюме L4' },
    rule: { rubric: 'career.cv', metric: 'overall', min: 4, count: 2, withinDays: 45 },
  },
  {
    id: 'letter-l4', level: 4, certificate: true,
    name: { en: 'Cover letters L4', uz: 'Motivatsion xatlar L4', ru: 'Сопроводительные письма L4' },
    rule: { rubric: 'career.letter', metric: 'overall', min: 4, count: 2, withinDays: 45 },
  },
];
