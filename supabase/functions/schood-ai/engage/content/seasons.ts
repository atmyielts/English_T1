import { addDays, DAY_MS } from '../rules.ts';
import type { L } from './text.ts';

// E10 Seasons and live events. Quarterly seasons with a theme, focus scenarios and
// season badges earned with verified XP; a weekly national mock; monthly speaking
// and sales tournaments. Prizes come from sponsors (centres, universities) whose
// name, logo and prize text are set by a Schood admin under a contract; there is
// no payment flow here and no random reward of any kind. All times are Tashkent.

const TASHKENT_MS = 5 * 3_600_000;
export interface SeasonTheme { key: string; title: L; lead: L; spotlight: { arc: string; journey: string } }
export const SEASON_THEMES: Record<1 | 2 | 3 | 4, SeasonTheme> = {
  1: { key: 'fresh_start', spotlight: { arc: 'tashkent_lights', journey: 'speaking_60' },
    title: { en: 'Fresh Start', uz: 'Yangi boshlanish', ru: 'Новый старт' },
    lead: { en: 'Navruz season: new goals, a fresh start for your speaking and the first episodes of Tashkent Lights.', uz: 'Navro‘z mavsumi: yangi maqsadlar, nutq mashqlarini yangidan boshlash va Tashkent Lights’ning ilk qismlari.', ru: 'Сезон Навруза: новые цели, разговорная практика с чистого листа и первые эпизоды Tashkent Lights.' } },
  2: { key: 'exam_season', spotlight: { arc: 'tashkent_lights', journey: 'ielts_55_70' },
    title: { en: 'Exam Season', uz: 'Imtihonlar mavsumi', ru: 'Сезон экзаменов' },
    lead: { en: 'Admission and IELTS months: weekly national mocks and timed practice.', uz: 'Qabul va IELTS oylari: haftalik milliy sinovlar va vaqt cheklangan mashqlar.', ru: 'Месяцы поступления и IELTS: еженедельные национальные пробные экзамены и практика на время.' } },
  3: { key: 'summer_abroad', spotlight: { arc: 'tashkent_lights', journey: 'speaking_60' },
    title: { en: 'Summer Abroad', uz: 'Xorijda yoz', ru: 'Лето за границей' },
    lead: { en: 'Application essays, visa interviews and everyday speaking for travel.', uz: 'Ariza insholari, viza suhbatlari va sayohat uchun kundalik nutq.', ru: 'Эссе для поступления, визовые собеседования и разговорная речь для поездок.' } },
  4: { key: 'career_autumn', spotlight: { arc: 'first_month_sales', journey: 'sales_90' },
    title: { en: 'Career Autumn', uz: 'Karyera kuzi', ru: 'Карьерная осень' },
    lead: { en: 'Interviews, sales and public speaking: the work season, with the monthly sales tournament.', uz: 'Suhbatlar, savdo va omma oldida nutq: ish mavsumi, har oylik savdo turniri bilan.', ru: 'Собеседования, продажи и выступления: рабочий сезон с ежемесячным турниром по продажам.' } },
};
/** Season badges, earned with verified XP in the season. Nothing is random and nothing is for sale. */
export const SEASON_TIERS = [{ key: 'bronze', xp: 1000 }, { key: 'silver', xp: 3000 }, { key: 'gold', xp: 6000 }] as const;

const tashkentDate = (at: Date) => new Date(at.getTime() + TASHKENT_MS).toISOString().slice(0, 10);
const atTashkent = (day: string, hour: number) => new Date(Date.parse(`${day}T00:00:00Z`) - TASHKENT_MS + hour * 3_600_000);

export interface SeasonInfo { key: string; quarter: 1 | 2 | 3 | 4; year: number; startsOn: string; endsOn: string; theme: SeasonTheme; daysLeft: number }
export function seasonOf(at: Date): SeasonInfo {
  const day = tashkentDate(at), year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7));
  const quarter = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
  const startsOn = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  const next = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
  const endsOn = addDays(next, -1);
  return { key: `season:${year}-q${quarter}`, quarter, year, startsOn, endsOn, theme: SEASON_THEMES[quarter], daysLeft: Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS) };
}

export interface LiveEvent {
  key: string;
  kind: 'national_mock' | 'tournament_speaking' | 'tournament_sales';
  title: L;
  lead: L;
  opensAt: string;
  closesAt: string;
  /** Learning events that count, matched by feature, kind and skill prefix (or ref prefix for the mock). */
  counts: { features: string[]; skills?: string[]; refPrefix?: string };
  join: boolean;
  link: string;
}

/** This week's national mock: Saturday 10:00 to Sunday 22:00. Results are mock_finished events whose ref starts with national_mock:<week>. */
export function nationalMock(weekStart: string): LiveEvent {
  const saturday = addDays(weekStart, 5), sunday = addDays(weekStart, 6);
  return {
    key: `mock:${weekStart}`, kind: 'national_mock', join: false, link: '/coach/b1',
    title: { en: 'Weekly national mock', uz: 'Haftalik milliy sinov', ru: 'Еженедельный национальный пробный экзамен' },
    lead: { en: 'One timed IELTS-style mock with the IELTS Coach, the same weekend for everyone. Your best result counts.', uz: 'IELTS murabbiyi bilan IELTS uslubidagi bitta sinov, vaqt cheklangan; hamma uchun bir xil dam olish kunlarida. Eng yaxshi natijangiz hisobga olinadi.', ru: 'Один пробный экзамен в формате IELTS на время с IELTS-коучем, в одни и те же выходные для всех. Засчитывается лучший результат.' },
    opensAt: atTashkent(saturday, 10).toISOString(), closesAt: atTashkent(sunday, 22).toISOString(),
    counts: { features: ['B1', 'E10'], refPrefix: `national_mock:${weekStart}` },
  };
}

/** Monthly tournaments run from the 8th to the 21st; people join, and their five best scored turns count. */
export function tournaments(at: Date): LiveEvent[] {
  const day = tashkentDate(at), month = day.slice(0, 7);
  const opensAt = atTashkent(`${month}-08`, 0).toISOString(), closesAt = atTashkent(`${month}-22`, 0).toISOString();
  return [
    { key: `tournament:speaking:${month}`, kind: 'tournament_speaking', join: true, link: '/coach/b2', opensAt, closesAt,
      title: { en: 'Speaking tournament', uz: 'Nutq turniri', ru: 'Турнир по разговорной речи' },
      lead: { en: 'Two weeks of scored speaking turns with any speaking coach. Your five best scores make your result.', uz: 'Ikki hafta davomida istalgan nutq murabbiyi bilan baholangan og‘zaki javoblar. Natijangiz eng yaxshi beshta ballingiz bo‘yicha hisoblanadi.', ru: 'Две недели оценённых устных ответов с любым коучем по разговорной речи. Итог считается по пяти вашим лучшим баллам.' },
      counts: { features: ['B1', 'B2', 'B6', 'L4'], skills: ['speaking', 'ielts.speaking'] } },
    { key: `tournament:sales:${month}`, kind: 'tournament_sales', join: true, link: '/coach/b4', opensAt, closesAt,
      title: { en: 'Sales tournament', uz: 'Savdo turniri', ru: 'Турнир по продажам' },
      lead: { en: 'Two weeks of scored role-play calls with the Sales Coach. Your five best scores make your result.', uz: 'Ikki hafta davomida Savdo murabbiyi bilan rolli o‘yin tarzidagi baholangan qo‘ng‘iroqlar. Natijangiz eng yaxshi beshta ballingiz bo‘yicha hisoblanadi.', ru: 'Две недели оценённых звонков в ролевой игре с коучем по продажам. Итог считается по пяти вашим лучшим баллам.' },
      counts: { features: ['B4'], skills: ['sales'] } },
  ];
}
export const TOURNAMENT_BEST = 5;
export const TOURNAMENT_MIN = 3;
/** Scores arrive on the area's own scale; bands (0–9) are put on the 0–100 scale so a tournament compares like with like. */
export const normalisedScore = (score: number) => (score <= 9 ? Math.round((score / 9) * 1000) / 10 : Math.min(100, Math.round(score * 10) / 10));
export const tournamentScore = (scores: number[]) => {
  if (scores.length < TOURNAMENT_MIN) return null;
  const best = scores.map(normalisedScore).sort((a, b) => b - a).slice(0, TOURNAMENT_BEST);
  return Math.round((best.reduce((sum, value) => sum + value, 0) / best.length) * 10) / 10;
};
export const EVENT_KEY = /^(season:\d{4}-q[1-4]|mock:\d{4}-\d{2}-\d{2}|tournament:(speaking|sales):\d{4}-\d{2})$/;
