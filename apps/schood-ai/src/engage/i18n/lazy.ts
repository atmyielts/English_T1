import { normalizeLocale, STORAGE_KEY, type Locale } from '../../../../../packages/service-i18n/src/format.ts';
import { useCatalog } from '../../core/i18n/index.ts';
export { useT } from '../../core/index.ts';

// The engage pages' text loads with the page chunks, through core's useCatalog, instead
// of with the app. en.ts, uz.ts and ru.ts (nav labels and page titles) load the way every
// area's catalogs do; everything a page shows lives in pages.<locale>.ts, with the same
// keys in all three languages. routes.tsx starts these imports together with the page
// chunk and holds the page until its text is in, so nothing flashes as a key.

type Catalog = Record<string, string>;
const PAGE_TEXT: Record<Locale, () => Promise<Catalog>> = {
  en: () => import('./pages.en.ts').then((m) => m.pagesEn),
  uz: () => import('./pages.uz.ts').then((m) => m.pagesUz),
  ru: () => import('./pages.ru.ts').then((m) => m.pagesRu),
};

/** The language the app will show, before React renders (the same storage key as service-i18n). */
export function currentLocale(): Locale {
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

/** True once the engage page text for the current language is in core's catalogs. */
export function usePageText(): boolean {
  return useCatalog('engage.pages', PAGE_TEXT);
}
