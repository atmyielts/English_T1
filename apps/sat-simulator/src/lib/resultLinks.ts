// Next-step links on the SAT results page: the Practice Lab (drills) and the
// SAT Playbook diagnostic (study plan). The simulator has no i18n framework
// yet, so the Playbook card copy carries its own en/uz/ru strings, picked from
// ?lang=, the shared Schood locale (localStorage "schood.locale") or the browser.

export type ResultsLocale = 'en' | 'uz' | 'ru';

export const practiceLabUrl = (): string => {
  const url = new URL('https://practice.sat.schood.online/bank');
  url.searchParams.set('mistake_history', 'previously_missed');
  return url.toString();
};

export const studyPlanUrl = (sessionId: string | null | undefined): string => {
  const url = new URL('https://playbook.sat.schood.online/diagnostic');
  url.searchParams.set('source', 'sat-simulator');
  if (sessionId) url.searchParams.set('session_id', sessionId);
  return url.toString();
};

const normalize = (raw: string | null | undefined): ResultsLocale | null => {
  const value = String(raw ?? '').trim().toLowerCase().slice(0, 2);
  return value === 'en' || value === 'uz' || value === 'ru' ? value : null;
};

export const resultsLocale = (): ResultsLocale => {
  if (typeof window === 'undefined') return 'en';
  const fromQuery = normalize(new URLSearchParams(window.location.search).get('lang'));
  if (fromQuery) return fromQuery;
  try {
    const stored = normalize(window.localStorage.getItem('schood.locale'));
    if (stored) return stored;
  } catch {
    // Storage can be unavailable (private mode); fall through.
  }
  return normalize(window.navigator?.language) ?? 'en';
};

export const STUDY_PLAN_COPY: Record<ResultsLocale, { badge: string; title: string; body: string; cta: string }> = {
  en: {
    badge: 'SAT Playbook',
    title: 'Get your study plan',
    body: 'The Playbook diagnostic reads this result and builds a week-by-week plan for the domains that cost you the most points.',
    cta: 'Get your study plan',
  },
  uz: {
    badge: 'SAT Playbook',
    title: 'O‘quv rejangizni oling',
    body: 'Playbook diagnostikasi shu natijani o‘qiydi va sizga eng ko‘p ball yo‘qotgan bo‘limlar uchun haftama-hafta reja tuzadi.',
    cta: 'O‘quv rejasini olish',
  },
  ru: {
    badge: 'SAT Playbook',
    title: 'Получите план подготовки',
    body: 'Диагностика Playbook учтёт этот результат и составит понедельный план по разделам, где вы теряете больше всего баллов.',
    cta: 'Получить план подготовки',
  },
};
