import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { format, type Catalogs, type Locale, type Params } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n as useServiceI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { formatDate } from '../dates.ts';

// Core text plus every area's catalog. Area keys carry their area prefix, so the
// merge cannot collide; a missing translation falls back to English, never to blank.
//
// No catalog ships in the first download, core's English included: only the few
// strings the loading shell needs. Core's and every area's catalog for the person's
// language load on demand, one small chunk per file, in parallel; main.tsx waits for
// them before the first paint, so nothing flashes untranslated. For Uzbek and
// Russian, English loads right after, as the fallback. A chunk that fails to load is
// retried when the next screen asks (useT). However many areas merge, the main chunk
// keeps the same size. Strings only some screens need can load with those screens
// (useCatalog below).
const BOOT: Record<string, string> = {
  'app.title': 'Schood AI', 'app.loading': 'Loading Schood AI…', 'state.retry': 'Try again',
  'state.error.title': 'Something went wrong', 'state.error.lead': 'Please try again in a moment.',
};
export const catalogs: Catalogs<string> = { en: { ...BOOT }, uz: {}, ru: {} };

type Part = () => Promise<Record<string, string>>;
const parts: Record<Locale, Part[]> = {
  en: [
    () => import('./en.ts').then((m) => m.en),
    () => import('../../learner/i18n/en.ts').then((m) => m.en), () => import('../../teacher/i18n/en.ts').then((m) => m.en),
    () => import('../../centre/i18n/en.ts').then((m) => m.en), () => import('../../coach/i18n/en.ts').then((m) => m.en),
    () => import('../../engage/i18n/en.ts').then((m) => m.en), () => import('../../pricing/i18n/en.ts').then((m) => m.en),
  ],
  uz: [
    () => import('./uz.ts').then((m) => m.uz), () => import('../../learner/i18n/uz.ts').then((m) => m.uz), () => import('../../teacher/i18n/uz.ts').then((m) => m.uz),
    () => import('../../centre/i18n/uz.ts').then((m) => m.uz), () => import('../../coach/i18n/uz.ts').then((m) => m.uz), () => import('../../engage/i18n/uz.ts').then((m) => m.uz),
    () => import('../../pricing/i18n/uz.ts').then((m) => m.uz),
  ],
  ru: [
    () => import('./ru.ts').then((m) => m.ru), () => import('../../learner/i18n/ru.ts').then((m) => m.ru), () => import('../../teacher/i18n/ru.ts').then((m) => m.ru),
    () => import('../../centre/i18n/ru.ts').then((m) => m.ru), () => import('../../coach/i18n/ru.ts').then((m) => m.ru), () => import('../../engage/i18n/ru.ts').then((m) => m.ru),
    () => import('../../pricing/i18n/ru.ts').then((m) => m.ru),
  ],
};

const loaded = new Set<string>(), pending = new Map<string, Promise<void>>(), listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; for (const listener of listeners) listener(); };

/** Loads catalog parts once under a name; failures leave what is there and may be retried. */
function loadParts(name: string, locale: Locale, loaders: Part[]): Promise<void> {
  const id = `${name}:${locale}`;
  if (loaded.has(id)) return Promise.resolve();
  let promise = pending.get(id);
  if (!promise) {
    promise = Promise.all(loaders.map((load) => load())).then((results) => {
      // English fallback strings never overwrite a translation that is already in.
      catalogs[locale] = locale === 'en' ? { ...catalogs.en, ...Object.assign({}, ...results) } : { ...catalogs[locale], ...Object.assign({}, ...results) };
      loaded.add(id);
      changed();
    }).catch(() => { pending.delete(id); });
    pending.set(id, promise);
  }
  return promise;
}

/** Loads a language: core (Uzbek, Russian) and every area. Resolves when it is in; English fallbacks follow in the background. */
export function loadLocale(locale: Locale): Promise<void> {
  const ready = loadParts('app', locale, parts[locale]);
  if (locale !== 'en') void ready.then(() => loadParts('app', 'en', parts.en));
  return ready;
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export type Translate = (key: string, params?: Params) => string;

export function useT(): Translate {
  const { locale } = useServiceI18n();
  const loadedVersion = useSyncExternalStore(subscribe, () => version);
  useEffect(() => { void loadLocale(locale); }, [locale]);
  return useCallback<Translate>((key, params) => format(catalogs, locale, key, params), [locale, loadedVersion]);
}

/**
 * Strings only some screens need, loaded with those screens instead of at start:
 *
 *   const ready = useCatalog('learner.essay', {
 *     en: () => import('./i18n/essay.en.ts').then((m) => m.en),
 *     uz: () => import('./i18n/essay.uz.ts').then((m) => m.uz),
 *     ru: () => import('./i18n/essay.ru.ts').then((m) => m.ru),
 *   });
 *   if (!ready) return <LoadingState/>;
 *
 * Keys keep your area prefix. English always loads too, as the fallback.
 */
export function useCatalog(name: string, loaders: Record<Locale, Part>): boolean {
  const { locale } = useServiceI18n();
  useSyncExternalStore(subscribe, () => version);
  // The loaders are module-level imports; the name identifies them.
  useEffect(() => {
    void loadParts(name, locale, [loaders[locale]]);
    if (locale !== 'en') void loadParts(name, 'en', [loaders.en]);
  }, [name, locale]);
  return loaded.has(`${name}:${locale}`);
}
/** The shared i18n context, with core's date formatter (Uzbek written out: dates.ts). Areas use this one. */
export function useI18n(): ReturnType<typeof useServiceI18n> {
  const i18n = useServiceI18n();
  return useMemo(() => ({ ...i18n, date: (input: string | number | Date, options?: Intl.DateTimeFormatOptions) => formatDate(i18n.locale, input, options) }), [i18n]);
}
export type { CoreKey } from './en.ts';
