import type { FluencyConfig, Milestone, PlanRules, Reminders } from '../src/types.ts';

// Voice analysis settings, the "speaking confidence in 60 days" plan, reminders and the
// level-ups. A date is optional (an upcoming talk, a defence, an interview); without
// one the plan runs eight weeks, and countdown reminders count down to the talk.

export const fluency: FluencyConfig = {
  // Only sounds and phrases that are fillers in a talk. Words that are usually real
  // words (mana, ya’ni, значит, like, so) are left out so real speech is not counted.
  fillers: {
    en: ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'you know', 'i mean', 'basically', 'sort of', 'kind of'],
    uz: ['ee', 'eee', 'aa', 'aaa', 'anu', 'haligi', 'xullas', 'nima desam'],
    ru: ['ну', 'типа', 'короче', 'как бы', 'в общем', 'это самое', 'эээ', 'ээ', 'так сказать', 'как его'],
  },
  longPauseSeconds: 2,
  // [minLevel, minWpm, maxWpm]: a comfortable pace for a talk to a room.
  pace: [[1, 90, 170], [3, 110, 170], [4, 115, 165]],
};

export const plan: PlanRules = {
  goal: { options: [2, 2.5, 3, 3.5, 4, 4.5, 5], default: 3.5, examDate: 'optional', defaultWeeks: 8 },
  dailyMinutes: { options: [10, 15, 20, 30], default: 15 },
  phases: [
    {
      id: 'confidence', minWeeksLeft: 5,
      title: { en: 'Confidence: speak every day', uz: 'Ishonch: har kuni gapiring', ru: 'Уверенность: говорим каждый день' },
      // Short scored talks, pause practice and the basics: fillers down, structure in.
      mix: { speaking: 3, shadowing: 2, lesson: 2, drill: 2 },
    },
    {
      id: 'structure', minWeeksLeft: 2,
      title: { en: 'Structure and stories', uz: 'Tuzilma va hikoyalar', ru: 'Структура и истории' },
      // Pitches, stories and rehearsals with questions from the audience.
      mix: { speaking: 4, roleplay: 2, drill: 2, lesson: 1, shadowing: 1 },
    },
    {
      id: 'stage', minWeeksLeft: 0,
      title: { en: 'On stage: rehearse and answer', uz: 'Sahnada: repetitsiya va javob', ru: 'На сцене: репетиции и ответы' },
      // Mostly full rehearsals and Q&A, so level-ups are confirmed before the real talk.
      mix: { speaking: 4, roleplay: 3, shadowing: 1, drill: 1 },
    },
  ],
  weeklyMock: { activity: 'speech.showcase', weekday: 6, title: { en: 'Saturday showcase: pitch, impromptu, story and a rehearsal with questions', uz: 'Shanba ko‘rigi: pitch, tayyorgarliksiz nutq, hikoya va savolli repetitsiya', ru: 'Субботнее выступление: питч, импровизация, история и репетиция с вопросами' } },
  links: [],
};

export const reminders: Reminders = {
  daily: [
    {
      en: 'Good morning, {name}! Today: {task} — about {minutes} minutes. One short talk a day is how confidence grows.',
      uz: 'Xayrli tong, {name}! Bugun: {task} — taxminan {minutes} daqiqa. Kuniga bitta qisqa nutq — ishonch shunday o‘sadi.',
      ru: 'Доброе утро, {name}! Сегодня: {task} — около {minutes} минут. Одна короткая речь в день — так растёт уверенность.',
    },
    {
      en: '{name}, your {streak}-day streak is waiting. {minutes} minutes today: {task}.',
      uz: '{name}, {streak} kunlik seriyangiz davomini kutyapti. Bugun {minutes} daqiqa: {task}.',
      ru: '{name}, ваша серия ({streak}) ждёт продолжения. Сегодня {minutes} минут: {task}.',
    },
    {
      en: 'The room is ready, {name}: {task}. Send a voice message and {coach} will count your fillers and pauses.',
      uz: 'Xona tayyor, {name}: {task}. Ovozli xabar yuboring — {coach} to‘ldiruvchi so‘zlar va pauzalaringizni sanaydi.',
      ru: 'Зал готов, {name}: {task}. Отправьте голосовое — {coach} посчитает паразиты и паузы.',
    },
    {
      en: 'Two minutes is enough for an elevator pitch, {name}. Today: {task}.',
      uz: 'Elevator pitch uchun ikki daqiqa yetarli, {name}. Bugun: {task}.',
      ru: 'Для elevator pitch хватит двух минут, {name}. Сегодня: {task}.',
    },
    {
      en: '{name}, your level is {level} and your target is {target}. Today’s step: {task} ({minutes} min).',
      uz: '{name}, darajangiz {level}, maqsadingiz {target}. Bugungi qadam: {task} ({minutes} daqiqa).',
      ru: '{name}, ваш уровень {level}, цель — {target}. Сегодняшний шаг: {task} ({minutes} мин).',
    },
    {
      en: 'Speak before you are ready, {name}: that is the practice. Today: {task}.',
      uz: 'Tayyor bo‘lishingizdan oldin gapiring, {name}: mashq aynan shu. Bugun: {task}.',
      ru: 'Говорите раньше, чем почувствуете готовность, {name}: в этом и тренировка. Сегодня: {task}.',
    },
    {
      en: 'One story, one minute, {name}. {coach} has today’s topic: {task}.',
      uz: 'Bitta hikoya, bir daqiqa, {name}. {coach} bugungi mavzuni tayyorlab qo‘ygan: {task}.',
      ru: 'Одна история, одна минута, {name}. У {coach} готова тема на сегодня: {task}.',
    },
  ],
  comeback: [
    {
      en: 'We missed you yesterday, {name}. A one-minute talk today keeps your progress: {task}.',
      uz: 'Kecha sizni sog‘indik, {name}. Bugungi bir daqiqalik nutq natijangizni saqlaydi: {task}.',
      ru: 'Вчера вас не хватало, {name}. Минутная речь сегодня сохранит прогресс: {task}.',
    },
    {
      en: 'Back to the stage, {name}? Start small: {task}, about {minutes} minutes.',
      uz: 'Sahnaga qaytamizmi, {name}? Kichikdan boshlang: {task}, taxminan {minutes} daqiqa.',
      ru: 'Возвращаемся на сцену, {name}? Начните с малого: {task}, около {minutes} минут.',
    },
  ],
  weekly: {
    en: 'Your week in speaking is ready, {name}: {delta}. See your pace, fillers and scores before and after.',
    uz: 'Nutq haftangiz tayyor, {name}: {delta}. Sur’at, to‘ldiruvchilar va ballaringizni oldin va keyin ko‘ring.',
    ru: 'Ваша неделя выступлений готова, {name}: {delta}. Посмотрите темп, паразиты и баллы — до и после.',
  },
  countdown: [
    {
      en: '{days} days to your talk, {name}. Today: {task}. Rehearse your first two sentences out loud.',
      uz: 'Nutqingizgacha {days} kun qoldi, {name}. Bugun: {task}. Dastlabki ikki gapingizni ovoz chiqarib mashq qiling.',
      ru: 'До вашего выступления дней: {days}, {name}. Сегодня: {task}. Проговорите вслух первые две фразы.',
    },
    {
      en: '{days} days left, {name}. One full rehearsal with questions today: {task}.',
      uz: '{days} kun qoldi, {name}. Bugun savollar bilan bitta to‘liq repetitsiya: {task}.',
      ru: 'Осталось дней: {days}, {name}. Сегодня одна полная репетиция с вопросами: {task}.',
    },
  ],
};

const levelUp = (id: string, level: number, label: string): Milestone => ({
  id,
  level,
  name: { en: `Speaker ${label}`, uz: `Notiq ${label}`, ru: `Спикер ${label}` },
  rule: { rubric: 'speech.talk', metric: 'overall', min: level, count: 3, withinDays: 21 },
  certificate: true,
});

export const milestones: Milestone[] = [
  levelUp('speaker-l2', 2, 'L2'),
  levelUp('speaker-l3', 3, 'L3'),
  levelUp('speaker-l3plus', 3.5, 'L3+'),
  levelUp('speaker-l4', 4, 'L4'),
  levelUp('speaker-l4plus', 4.5, 'L4+'),
  levelUp('speaker-l5', 5, 'L5'),
];
