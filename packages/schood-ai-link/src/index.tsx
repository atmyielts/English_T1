// "Ask Schood AI" links for the results and review screens of the other Schood
// apps. Links carry ids only (never question text or answers): Schood AI loads
// the item with the learner's own session where it can (simulator reviews).
//   /explain?source=<app>&session=<id>&item=<id>   one question
//   /tutor?source=<app>&session=<id>                 a whole result
export const SCHOOD_AI_URL = 'https://ai.schood.online';

type Locale = 'en' | 'uz' | 'ru';
const LABEL: Record<Locale, { ask: string; explain: string }> = {
  en: { ask: 'Ask Schood AI', explain: 'Explain with Schood AI' },
  uz: { ask: 'Schood AI’dan so‘rash', explain: 'Schood AI bilan tushuntirish' },
  ru: { ask: 'Спросить Schood AI', explain: 'Объяснить с Schood AI' },
};
/** The page's language: ?lang, then the shared `schood.locale`, then the browser. */
export function askLocale(): Locale {
  try {
    const pick = (value: string | null | undefined): Locale | null => (value && /^(en|uz|ru)/i.test(value) ? value.slice(0, 2).toLowerCase() as Locale : null);
    return pick(new URLSearchParams(location.search).get('lang')) ?? pick(localStorage.getItem('schood.locale')) ?? pick(document.documentElement.lang) ?? pick(navigator.language) ?? 'en';
  } catch {
    return 'en';
  }
}
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/** A Schood AI deep link with ids only. */
export function schoodAIUrl(input: { page: 'explain' | 'tutor'; source: string; session?: string | null; item?: string | null }): string {
  const url = new URL(`/${input.page}`, SCHOOD_AI_URL);
  url.searchParams.set('source', input.source);
  if (input.session && ID.test(input.session)) url.searchParams.set('session', input.session);
  if (input.item && ID.test(input.item)) url.searchParams.set('item', input.item);
  return url.toString();
}

/** A small link styled to sit in any app's results screen. */
export function AskSchoodAI({ page = 'tutor', source, session, item, className = '' }: { page?: 'explain' | 'tutor'; source: string; session?: string | null; item?: string | null; className?: string }) {
  // Never on proctored assessment (candidate) or admin screens.
  if (typeof location !== 'undefined' && /^\/(candidate|admin)(\/|$)/.test(location.pathname)) return null;
  const label = LABEL[askLocale()];
  return <a href={schoodAIUrl({ page, source, session, item })} target="_blank" rel="noopener noreferrer"
    className={className || 'inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-900 no-underline hover:bg-slate-50'}>
    <span aria-hidden="true">✦</span>{page === 'explain' ? label.explain : label.ask}
  </a>;
}
