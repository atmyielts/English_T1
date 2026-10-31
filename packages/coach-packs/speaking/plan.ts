import type { FluencyConfig, Milestone, PlanRules, Reminders } from '../src/types.ts';

// Fluency analysis settings, the study plan, reminders and level milestones.
// There is no exam date: the plan runs for a chosen number of weeks towards a CEFR
// target, and "countdown" reminders are gentle check-ins on the weeks left.

export const fluency: FluencyConfig = {
  fillers: {
    en: ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'you know', 'i mean', 'sort of', 'kind of'],
    uz: ['ee', 'aa', 'anu', 'haligi', 'mana'],
    ru: ['ну', 'типа', 'это самое', 'как бы', 'короче', 'эээ'],
  },
  longPauseSeconds: 2,
  // [minLevel, minWpm, maxWpm]: a comfortable conversational pace for each band.
  pace: [[2, 60, 110], [3, 80, 135], [4, 100, 155], [5, 115, 170]],
};

export const plan: PlanRules = {
  goal: { options: [2.5, 3, 3.5, 4, 4.5, 5], default: 3.5, examDate: 'none', defaultWeeks: 12 },
  dailyMinutes: { options: [10, 15, 20, 30], default: 15 },
  phases: [
    {
      id: 'habit', minWeeksLeft: 8,
      title: { en: 'Build the habit', uz: 'Odat hosil qilish', ru: 'Формируем привычку' },
      // Short daily conversations plus the phrases and sounds that make them easier.
      mix: { roleplay: 3, shadowing: 2, vocab: 3, drill: 2 },
    },
    {
      id: 'stretch', minWeeksLeft: 4,
      title: { en: 'Stretch', uz: 'Chegaradan chiqish', ru: 'Выходим за рамки' },
      // Harder role-plays at the top of the learner's range; drills target the errors they make.
      mix: { roleplay: 4, shadowing: 2, vocab: 2, drill: 2 },
    },
    {
      id: 'consolidate', minWeeksLeft: 0,
      title: { en: 'Consolidate', uz: 'Mustahkamlash', ru: 'Закрепляем' },
      // Mostly scored role-plays, so milestones can be confirmed at the target level.
      mix: { roleplay: 5, shadowing: 1, vocab: 2, drill: 2 },
    },
  ],
  links: [],
};

export const reminders: Reminders = {
  daily: [
    {
      en: 'Good morning, {name}! Today: {task} — about {minutes} minutes. A short conversation every day is how speaking grows.',
      uz: 'Xayrli tong, {name}! Bugun: {task} — taxminan {minutes} daqiqa. Nutq har kungi qisqa suhbatlar bilan o‘sadi.',
      ru: 'Доброе утро, {name}! Сегодня: {task} — около {minutes} минут. Короткий разговор каждый день — так и растёт речь.',
    },
    {
      en: '{name}, your {streak}-day streak is waiting. {minutes} minutes today: {task}.',
      uz: '{name}, {streak} kunlik seriyangiz davomini kutyapti. Bugun {minutes} daqiqa: {task}.',
      ru: '{name}, ваша серия занятий ({streak}) ждёт продолжения. Сегодня {minutes} минут: {task}.',
    },
    {
      en: 'Ready for a quick chat, {name}? Today’s task is {task}, about {minutes} minutes. {coach} is ready when you are.',
      uz: 'Qisqa suhbatga tayyormisiz, {name}? Bugungi vazifa: {task}, taxminan {minutes} daqiqa. {coach} siz tayyor bo‘lganingizda shu yerda.',
      ru: 'Готовы немного поговорить, {name}? Сегодня: {task}, около {minutes} минут. {coach} на связи, когда вам удобно.',
    },
    {
      en: 'Five minutes of speaking beats an hour of reading about it. Today: {task}.',
      uz: 'Besh daqiqa gapirish bu haqda bir soat o‘qishdan foydaliroq. Bugun: {task}.',
      ru: 'Пять минут разговора полезнее часа чтения о том, как говорить. Сегодня: {task}.',
    },
    {
      en: 'Hi {name}! You are at {level}, aiming for {target}. Today’s step: {task} ({minutes} min).',
      uz: 'Salom, {name}! Hozirgi darajangiz {level}, maqsadingiz {target}. Bugungi qadam: {task} ({minutes} daq.).',
      ru: 'Привет, {name}! Сейчас ваш уровень {level}, цель — {target}. Сегодняшний шаг: {task} ({minutes} мин).',
    },
    {
      en: 'Your voice gets more confident every time you use it. {minutes} minutes today, {name}: {task}.',
      uz: 'Har safar gapirganingizda ovozingiz ishonchliroq yangraydi. Bugun {minutes} daqiqa, {name}: {task}.',
      ru: 'С каждым разом ваш голос звучит увереннее. Сегодня {minutes} минут, {name}: {task}.',
    },
    {
      en: 'Small talk, steady progress. Today: {task}. Mistakes are welcome — they show us what to practise next.',
      uz: 'Kichik suhbat — barqaror o‘sish. Bugun: {task}. Xato qilishdan qo‘rqmang — xatolar keyin nimani mashq qilishni ko‘rsatadi.',
      ru: 'Маленький разговор — ещё шаг вперёд. Сегодня: {task}. Ошибки — это нормально: они показывают, что тренировать дальше.',
    },
  ],
  comeback: [
    {
      en: 'Hi {name}, we missed you yesterday. No problem — today is a good day to start again: {task}, just {minutes} minutes.',
      uz: 'Salom, {name}, kecha sizni ko‘rmadik. Hech qisi yo‘q — bugun qaytadan boshlash uchun yaxshi kun: {task}, atigi {minutes} daqiqa.',
      ru: 'Привет, {name}, вчера вас не хватало. Ничего страшного — сегодня хороший день, чтобы продолжить: {task}, всего {minutes} минут.',
    },
    {
      en: 'Life gets busy. When you have {minutes} minutes, {coach} is here: {task}.',
      uz: 'Ba’zan ish ko‘payib ketadi. {minutes} daqiqa vaqtingiz bo‘lganda {coach} shu yerda: {task}.',
      ru: 'Бывает, что дел много. Когда найдётся {minutes} минут, {coach} на связи: {task}.',
    },
    {
      en: 'One short conversation is enough to get back on track, {name}. Shall we? {task}.',
      uz: 'Izga qaytish uchun bitta qisqa suhbat kifoya, {name}. Boshlaymizmi? {task}.',
      ru: 'Чтобы вернуться в ритм, хватит одного короткого разговора, {name}. Начнём? {task}.',
    },
  ],
  weekly: {
    en: 'Your weekly fluency report is ready, {name}: {delta}. Open it to see your pace, your fillers and the errors you are fixing.',
    uz: 'Haftalik ravonlik hisobotingiz tayyor, {name}: {delta}. Nutq sur’ati, to‘ldiruvchi so‘zlar va tuzatayotgan xatolaringizni ko‘rish uchun oching.',
    ru: 'Ваш еженедельный отчёт о беглости готов, {name}: {delta}. Откройте его, чтобы увидеть темп речи, слова-паразиты и ошибки, над которыми вы работаете.',
  },
  countdown: [
    {
      en: '{days} days left in your plan, {name}. You are at {level}, aiming for {target} — one role-play today keeps you moving.',
      uz: 'Rejangiz tugashiga {days} kun qoldi, {name}. Hozir {level} darajadasiz, maqsad — {target}. Bugungi bitta rolli o‘yin sizni oldinga siljitadi.',
      ru: '{name}, до конца плана осталось дней: {days}. Сейчас ваш уровень {level}, цель — {target}. Одна ролевая игра сегодня — и вы ещё ближе к цели.',
    },
    {
      en: 'Goal check-in: {days} days to go. Look back at how far you have come, then try today’s task: {task}.',
      uz: 'Maqsadni tekshirish: {days} kun qoldi. Qancha yo‘l bosganingizga bir nazar tashlang, so‘ng bugungi mashqni bajaring: {task}.',
      ru: 'Сверимся с целью: осталось дней — {days}. Оглянитесь, сколько уже пройдено, и возьмитесь за сегодняшнее задание: {task}.',
    },
  ],
};

// A level is reached when three scored role-plays in 21 days reach it overall.
const levelUp = (id: string, level: number, label: string): Milestone => ({
  id,
  level,
  name: { en: `Speaking ${label}`, uz: `Og‘zaki nutq ${label}`, ru: `Разговорная речь ${label}` },
  rule: { rubric: 'speaking.conversation', metric: 'overall', min: level, count: 3, withinDays: 21 },
  certificate: true,
});

export const milestones: Milestone[] = [
  levelUp('level-a2plus', 2.5, 'A2+'),
  levelUp('level-b1', 3, 'B1'),
  levelUp('level-b1plus', 3.5, 'B1+'),
  levelUp('level-b2', 4, 'B2'),
  levelUp('level-b2plus', 4.5, 'B2+'),
  levelUp('level-c1', 5, 'C1'),
];
