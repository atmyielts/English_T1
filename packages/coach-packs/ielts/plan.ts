import type { FluencyConfig, Milestone, PlanRules, Reminders } from '../src/types.ts';

// Fluency analysis settings, the study planner, reminder texts and level-up
// milestones for the IELTS coach.

export const fluency: FluencyConfig = {
  fillers: {
    en: ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'you know', 'i mean', 'sort of', 'kind of'],
    uz: ['ee', 'aa', 'anu', 'haligi', 'mana'],
    ru: ['ну', 'типа', 'это самое', 'как бы', 'короче', 'эээ'],
  },
  longPauseSeconds: 2,
  // [minimum band, comfortable minimum wpm, comfortable maximum wpm]
  pace: [[4, 80, 140], [6, 100, 160], [7.5, 110, 175]],
};

// The plan moves from building accuracy and range (drills, vocabulary) towards
// timed sets and mocks as the exam gets closer; the final week rehearses and
// keeps the load light.
export const plan: PlanRules = {
  goal: { options: [5, 5.5, 6, 6.5, 7, 7.5, 8], default: 6.5, examDate: 'optional', defaultWeeks: 12 },
  dailyMinutes: { options: [15, 20, 30, 45, 60], default: 30 },
  phases: [
    {
      id: 'foundation',
      minWeeksLeft: 8,
      title: { en: 'Foundation: fix the basics', uz: 'Poydevor: asoslarni mustahkamlash', ru: 'Фундамент: укрепляем основы' },
      mix: { speaking: 3, writing: 2, reading: 2, listening: 2, vocab: 3, drill: 3 },
    },
    {
      id: 'build',
      minWeeksLeft: 4,
      title: { en: 'Build: range and accuracy', uz: 'Rivojlanish: boy lug‘at va aniqlik', ru: 'Развитие: разнообразие и точность' },
      mix: { speaking: 3, writing: 3, reading: 2, listening: 2, vocab: 2, drill: 2 },
    },
    {
      id: 'exam-ready',
      minWeeksLeft: 1,
      title: { en: 'Exam-ready: timed sets and mocks', uz: 'Imtihonga tayyorgarlik: vaqtli mashqlar va sinovlar', ru: 'К экзамену: задания на время и пробники' },
      mix: { speaking: 4, writing: 3, reading: 3, listening: 3, vocab: 1, drill: 1 },
    },
    {
      id: 'final-week',
      minWeeksLeft: 0,
      title: { en: 'Final week: rehearse and rest', uz: 'So‘nggi hafta: takrorlash va dam olish', ru: 'Последняя неделя: репетиция и отдых' },
      mix: { speaking: 4, writing: 1, reading: 3, listening: 3, vocab: 1, drill: 1 },
    },
  ],
  weeklyMock: {
    activity: 'ielts.speaking.mock',
    weekday: 6,
    title: { en: 'Weekly speaking mock', uz: 'Haftalik Speaking sinovi', ru: 'Еженедельный пробный Speaking' },
  },
  links: [
    {
      id: 'simulator',
      label: { en: 'Full IELTS mock in the Schood simulator', uz: 'Schood simulyatorida to‘liq IELTS sinovi', ru: 'Полный пробный IELTS в симуляторе Schood' },
      url: 'https://ielts.schood.online',
    },
    {
      id: 'practice',
      label: { en: 'More IELTS practice on Schood', uz: 'Schood’da ko‘proq IELTS mashqlari', ru: 'Больше практики IELTS на Schood' },
      url: 'https://practice.ielts.schood.online',
    },
  ],
};

// Warm and short. No guilt, no fake urgency. Russian avoids number agreement with
// placeholders by using «мин.» and «дн.» or putting the number after a colon.
export const reminders: Reminders = {
  daily: [
    {
      en: '{name}, today’s task is ready: {task}. About {minutes} minutes.',
      uz: '{name}, bugungi vazifa tayyor: {task}. Taxminan {minutes} daqiqa.',
      ru: '{name}, задание на сегодня готово: {task}. Примерно {minutes} мин.',
    },
    {
      en: 'One more small step towards band {target}: {task}, about {minutes} minutes.',
      uz: '{target} ball sari yana bir kichik qadam: {task}, taxminan {minutes} daqiqa.',
      ru: 'Ещё один небольшой шаг к баллу {target}: {task}, примерно {minutes} мин.',
    },
    {
      en: 'Your streak is at {streak} days. Today’s {task} takes about {minutes} minutes whenever suits you.',
      uz: 'Seriyangiz {streak} kunga yetdi. Bugungi {task} taxminan {minutes} daqiqa oladi, qulay vaqtingizda.',
      ru: 'Ваша серия: {streak} дн. подряд. Сегодняшнее задание «{task}» займёт около {minutes} мин., когда вам удобно.',
    },
    {
      en: 'Hi {name}, little and often works best for IELTS. Today: {task} ({minutes} min).',
      uz: 'Salom, {name}! IELTS uchun oz-ozdan, lekin muntazam shug‘ullanish eng yaxshi natija beradi. Bugun: {task} ({minutes} daqiqa).',
      ru: 'Привет, {name}! Для IELTS лучше понемногу, но регулярно. Сегодня: {task} ({minutes} мин.).',
    },
    {
      en: '{coach} here. I have prepared {task} for you today. Shall we start when you have {minutes} minutes?',
      uz: 'Salom, men — {coach}. Bugun siz uchun {task} tayyorladim. {minutes} daqiqa vaqtingiz bo‘lganda boshlaymizmi?',
      ru: 'Это {coach}. На сегодня для вас готово: {task}. Начнём, когда у вас будет {minutes} мин.?',
    },
    {
      en: 'A cup of tea and {minutes} minutes is all it takes today, {name}: {task}.',
      uz: 'Bugun bir piyola choy va {minutes} daqiqa kifoya, {name}: {task}.',
      ru: 'Сегодня хватит чашки чая и {minutes} мин., {name}: {task}.',
    },
    {
      en: 'You are working at band {level} and aiming for {target}. Today’s step: {task}.',
      uz: 'Hozirgi darajangiz {level}, maqsadingiz {target}. Bugungi qadam: {task}.',
      ru: 'Сейчас ваш уровень {level}, цель — {target}. Шаг на сегодня: {task}.',
    },
  ],
  comeback: [
    {
      en: 'Welcome back, {name}. Missing a day happens to everyone. Today’s {task} is a gentle restart, about {minutes} minutes.',
      uz: 'Qaytganingizdan xursandmiz, {name}. Bir kun o‘tkazib yuborish hammada bo‘ladi. Bugungi {task} yengil qayta boshlash, taxminan {minutes} daqiqa.',
      ru: 'С возвращением, {name}! Пропустить день бывает с каждым. Сегодняшнее задание «{task}» — мягкий старт, примерно {minutes} мин.',
    },
    {
      en: 'Hi {name}, what counts is picking it up again. Let’s start with something short: {task}.',
      uz: 'Salom, {name}! Eng muhimi — yana davom ettirish. Qisqa narsadan boshlaylik: {task}.',
      ru: 'Привет, {name}! Главное — продолжить. Начнём с чего-нибудь короткого: {task}.',
    },
    {
      en: 'Your progress is saved and waiting, {name}. When you have {minutes} minutes, {task} is ready.',
      uz: 'Natijalaringiz saqlangan va sizni kutmoqda, {name}. {minutes} daqiqa vaqtingiz bo‘lganda, {task} tayyor.',
      ru: 'Ваш прогресс сохранён и ждёт вас, {name}. Когда будет {minutes} мин., задание «{task}» готово.',
    },
  ],
  weekly: {
    en: 'Your weekly report is ready, {name}. The headline: {delta}. Open it to see what to focus on next week.',
    uz: 'Haftalik hisobotingiz tayyor, {name}. Asosiysi: {delta}. Keyingi haftada nimaga e’tibor berishni ko‘rish uchun oching.',
    ru: 'Ваш недельный отчёт готов, {name}. Главное: {delta}. Откройте, чтобы увидеть, на чём сосредоточиться на следующей неделе.',
  },
  countdown: [
    {
      en: '{days} days to your exam. Steady practice now is what helps on the day. Today: {task}.',
      uz: 'Imtihoningizgacha {days} kun qoldi. Hozirgi muntazam mashq imtihon kuni yordam beradi. Bugun: {task}.',
      ru: 'Дней до экзамена: {days}. Именно спокойная регулярная практика сейчас помогает в день экзамена. Сегодня: {task}.',
    },
    {
      en: '{days} days to go, {name}. Keep your routine: {task}, about {minutes} minutes.',
      uz: '{days} kun qoldi, {name}. Odatingizni saqlang: {task}, taxminan {minutes} daqiqa.',
      ru: '{name}, дней до экзамена: {days}. Сохраняйте ритм: {task}, примерно {minutes} мин.',
    },
    {
      en: '{days} days until the exam. Every session adds up, and today’s {task} keeps your skills fresh.',
      uz: 'Imtihongacha {days} kun. Har bir mashg‘ulot hisobga kiradi, bugungi {task} esa ko‘nikmalaringizni yangi saqlaydi.',
      ru: 'Дней до экзамена: {days}. Каждое занятие идёт в копилку, а сегодняшнее «{task}» поддержит ваши навыки в форме.',
    },
  ],
};

const speaking = (min: number, id: string, label: string): Milestone => ({
  id: `speaking-${id}`,
  level: min,
  name: { en: `Speaking Band ${label}`, uz: `Speaking ${label} ball`, ru: `Speaking: балл ${label}` },
  rule: { rubric: 'ielts.speaking', metric: 'overall', min, count: 3, withinDays: 21 },
  certificate: true,
});

const writing = (min: number, id: string, label: string): Milestone => ({
  id: `writing-${id}`,
  level: min,
  name: { en: `Writing Band ${label}`, uz: `Writing ${label} ball`, ru: `Writing: балл ${label}` },
  rule: { rubric: 'ielts.writing_task2', metric: 'overall', min, count: 2, withinDays: 30 },
  certificate: true,
});

export const milestones: Milestone[] = [
  speaking(5.5, '5-5', '5.5'),
  speaking(6, '6', '6.0'),
  speaking(6.5, '6-5', '6.5'),
  speaking(7, '7', '7.0'),
  speaking(7.5, '7-5', '7.5'),
  writing(6, '6', '6.0'),
  writing(6.5, '6-5', '6.5'),
  writing(7, '7', '7.0'),
];
