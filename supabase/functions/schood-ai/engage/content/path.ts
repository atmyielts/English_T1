import type { L } from './text.ts';

// E2 Lifetime path: school to work on Schood. After every outcome the next goal is
// ready: admission → IELTS → university essays → visa interview → career coach →
// sales or public speaking. A goal closes on a journey graduation, on a verified
// outcome event that matches it, or on the person's own word (never counted as
// verified in the Passport).

export interface PathGoal {
  key: string;
  title: L;
  lead: L;
  /** Where the work happens: coach packs, learner tools, a journey. */
  features: string[];
  journey: string | null;
  /** Main place to start (in-app path). */
  start: string;
  /** Verified outcomes that close the goal: an event with one of these features and a skill prefix. */
  closesOn: { features: string[]; skill?: string; kinds: ('outcome_recorded' | 'mock_finished')[] }[];
  next: string[];
  stage: 'school' | 'study' | 'abroad' | 'work';
}

export const PATH: PathGoal[] = [
  {
    key: 'admission_maths', stage: 'school',
    title: { en: 'University admission maths', uz: 'Oliygohga kirish matematikasi', ru: 'Математика для поступления' },
    lead: { en: 'Daily sets by topic mastery and timed mini-mocks with the Admission Maths Coach.', uz: 'Admission Maths Coach bilan mavzu bo‘yicha kundalik to‘plamlar va vaqtli mini-sinovlar.', ru: 'Ежедневные наборы по темам и мини-экзамены на время с Admission Maths Coach.' },
    features: ['B3'], journey: null, start: '/coach/b3',
    closesOn: [{ features: ['B3'], kinds: ['outcome_recorded'] }], next: ['ielts'],
  },
  {
    key: 'speaking_confidence', stage: 'study',
    title: { en: 'Speaking confidence', uz: 'Gapirishga ishonch', ru: 'Уверенная речь' },
    lead: { en: 'Sixty days of role-plays and talks before the exam work begins.', uz: 'Imtihon ishidan oldin oltmish kunlik rolli o‘yinlar va nutqlar.', ru: 'Шестьдесят дней ролевых игр и выступлений перед подготовкой к экзамену.' },
    features: ['B2', 'B6'], journey: 'speaking_60', start: '/journeys/speaking_60',
    closesOn: [], next: ['ielts'],
  },
  {
    key: 'ielts', stage: 'study',
    title: { en: 'IELTS', uz: 'IELTS', ru: 'IELTS' },
    lead: { en: 'The sixteen-week journey with the IELTS Coach, mocks included.', uz: 'IELTS Coach bilan o‘n olti haftalik yo‘l, sinovlar bilan.', ru: 'Шестнадцатинедельный путь с IELTS Coach, с пробными экзаменами.' },
    features: ['B1', 'L3', 'L4'], journey: 'ielts_55_70', start: '/journeys/ielts_55_70',
    closesOn: [{ features: ['B1', 'L4', 'E10'], skill: 'ielts', kinds: ['outcome_recorded'] }], next: ['uni_essays'],
  },
  {
    key: 'uni_essays', stage: 'study',
    title: { en: 'University application essays', uz: 'Universitetga ariza inshosi', ru: 'Эссе для поступления' },
    lead: { en: 'Personal statements and motivation letters: structure, feedback and line edits. You write it; the coach never writes it for you.', uz: 'Shaxsiy bayonot va motivatsion xatlar: tuzilma, fikr va tahrir. Siz yozasiz; coach uni siz uchun yozmaydi.', ru: 'Личные заявления и мотивационные письма: структура, разбор и правка. Пишете вы; тренер не пишет за вас.' },
    features: ['L8'], journey: null, start: '/write',
    closesOn: [{ features: ['L8'], kinds: ['outcome_recorded'] }], next: ['visa_interview'],
  },
  {
    key: 'visa_interview', stage: 'abroad',
    title: { en: 'Student visa interview', uz: 'Talaba vizasi suhbati', ru: 'Собеседование на студенческую визу' },
    lead: { en: 'Voice mock interviews with a scored report. Visa rules come only from a dated dataset: check the official site.', uz: 'Baholangan hisobotli ovozli sinov suhbatlari. Viza qoidalari faqat sanali ma’lumotlardan olinadi: rasmiy saytni tekshiring.', ru: 'Голосовые пробные собеседования с оценкой. Правила визы — только из датированных данных: проверяйте официальный сайт.' },
    features: ['L12', 'B5'], journey: null, start: '/speak',
    closesOn: [{ features: ['L12', 'B5'], skill: 'interview.visa', kinds: ['outcome_recorded'] }], next: ['career'],
  },
  {
    key: 'career', stage: 'work',
    title: { en: 'Career and interviews', uz: 'Karyera va suhbatlar', ru: 'Карьера и собеседования' },
    lead: { en: 'CV, cover letters, HR and behavioural interviews, salary negotiation.', uz: 'Rezyume, xatlar, HR va xulq-atvor suhbatlari, maosh muzokarasi.', ru: 'Резюме, сопроводительные письма, HR- и поведенческие интервью, переговоры о зарплате.' },
    features: ['B5'], journey: null, start: '/coach/b5',
    closesOn: [{ features: ['B5'], skill: 'career', kinds: ['outcome_recorded'] }], next: ['sales', 'public_speaking'],
  },
  {
    key: 'sales', stage: 'work',
    title: { en: 'Sales', uz: 'Savdo', ru: 'Продажи' },
    lead: { en: 'Your first 90 days as a sales rep, then the Sales certificates.', uz: 'Savdo vakili sifatida dastlabki 90 kuningiz, so‘ng Sales sertifikatlari.', ru: 'Ваши первые 90 дней в продажах, затем сертификаты Sales.' },
    features: ['B4'], journey: 'sales_90', start: '/journeys/sales_90',
    closesOn: [], next: ['public_speaking'],
  },
  {
    key: 'public_speaking', stage: 'work',
    title: { en: 'Public speaking', uz: 'Omma oldida nutq', ru: 'Публичные выступления' },
    lead: { en: 'Pace, fillers, structure and Q&A, with weekly progress.', uz: 'Sur’at, to‘ldiruvchi so‘zlar, tuzilma va savol-javob, haftalik o‘sish bilan.', ru: 'Темп, слова-паразиты, структура и ответы на вопросы, с еженедельным прогрессом.' },
    features: ['B6'], journey: null, start: '/coach/b6',
    closesOn: [{ features: ['B6'], kinds: ['outcome_recorded'] }], next: ['sales'],
  },
];
export const goalByKey = (key: string) => PATH.find((goal) => goal.key === key) ?? null;

export function pathProblems(journeyKeys: string[]): string[] {
  const keys = new Set(PATH.map((goal) => goal.key)), problems: string[] = [];
  if (keys.size !== PATH.length) problems.push('duplicate goal');
  for (const goal of PATH) {
    for (const next of goal.next) if (!keys.has(next)) problems.push(`${goal.key}: next ${next} unknown`);
    if (goal.journey && !journeyKeys.includes(goal.journey)) problems.push(`${goal.key}: journey ${goal.journey} unknown`);
    if (!goal.journey && !goal.closesOn.length) problems.push(`${goal.key}: cannot close`);
  }
  return problems;
}
