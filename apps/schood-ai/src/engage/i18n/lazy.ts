import { useCallback, useSyncExternalStore } from 'react';
import { format, normalizeLocale, STORAGE_KEY, type Locale, type Params } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n, useT as useCoreT, type Translate } from '../../core/index.ts';

// The engage pages' text, loaded with the page chunks instead of the first download.
// en.ts (nav labels and page titles) is merged by core as usual; everything a page shows
// lives in pages.<locale>.ts with the same keys in all three languages. `useT` reads
// core's catalogs first, then this text, so a page can use any engage or core key.
// routes.tsx waits for the text before a page renders, so nothing flashes as a key.

type Catalog = Record<string, string>;
const loaded: Partial<Record<Locale, Catalog>> = {};
const pending = new Map<Locale, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;

const loaders: Record<Locale, () => Promise<Catalog>> = {
  en: () => import('./pages.en.ts').then((m) => m.pagesEn),
  uz: () => import('./pages.uz.ts').then((m) => m.pagesUz),
  ru: () => import('./pages.ru.ts').then((m) => m.pagesRu),
};

/** Loads English (the fallback) and the given language. Failures leave keys in place, never blank. */
export function loadPageText(locale: Locale): Promise<void> {
  const wanted = [...new Set<Locale>(['en', locale])].filter((entry) => !loaded[entry]);
  return Promise.all(wanted.map((entry) => {
    let promise = pending.get(entry);
    if (!promise) {
      promise = loaders[entry]().then((catalog) => { loaded[entry] = catalog; version++; for (const listener of listeners) listener(); }).catch(() => { pending.delete(entry); });
      pending.set(entry, promise);
    }
    return promise;
  })).then(() => undefined);
}

/** The language the app will show, before React renders (the same storage key as service-i18n). */
export function currentLocale(): Locale {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY)) ?? normalizeLocale(document.documentElement.lang) ?? 'en';
  } catch {
    return normalizeLocale(document.documentElement.lang) ?? 'en';
  }
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useT(): Translate {
  const coreT = useCoreT(), { locale } = useI18n();
  const seen = useSyncExternalStore(subscribe, () => version);
  if (!loaded[locale] || !loaded.en) void loadPageText(locale);
  return useCallback<Translate>((key: string, params?: Params) => {
    const fromCore = coreT(key, params);
    if (fromCore !== key) return fromCore;
    return format({ en: loaded.en ?? {}, uz: loaded.uz ?? {}, ru: loaded.ru ?? {} }, locale, key, params);
  }, [coreT, locale, seen]);
}
