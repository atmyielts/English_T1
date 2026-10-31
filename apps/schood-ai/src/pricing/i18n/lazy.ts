import { normalizeLocale, STORAGE_KEY, type Locale } from '../../../../../packages/service-i18n/src/format.ts';
import { useCatalog } from '../../core/i18n/index.ts';

// The pricing pages' text loads with the page chunks (core's useCatalog), as engage's does.
// en.ts, uz.ts and ru.ts hold only the page titles, which load with the app.

type Catalog = Record<string, string>;
const PAGE_TEXT: Record<Locale, () => Promise<Catalog>> = {
  en: () => import('./pages.en.ts').then((m) => m.pagesEn),
  uz: () => import('./pages.uz.ts').then((m) => m.pagesUz),
  ru: () => import('./pages.ru.ts').then((m) => m.pagesRu),
};

function currentLocale(): Locale {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY)) ?? normalizeLocale(document.documentElement.lang) ?? 'en';
  } catch {
    return normalizeLocale(document.documentElement.lang) ?? 'en';
  }
}
/** Starts fetching the page text (English as the fallback, and the person's language) next to a page chunk. */
export function preloadPageText(): Promise<unknown> {
  return Promise.all([...new Set<Locale>(['en', currentLocale()])].map((locale) => PAGE_TEXT[locale]().catch(() => null)));
}
/** True once the pricing page text for the current language is in core's catalogs. */
export function usePageText(): boolean {
  return useCatalog('pricing.pages', PAGE_TEXT);
}
