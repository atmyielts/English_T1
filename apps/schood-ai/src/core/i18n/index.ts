import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { format, type Catalogs, type Locale, type Params } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { en as centreEn } from '../../centre/i18n/en.ts';
import { en as coachEn } from '../../coach/i18n/en.ts';
import { en as engageEn } from '../../engage/i18n/en.ts';
import { en as learnerEn } from '../../learner/i18n/en.ts';
import { en as teacherEn } from '../../teacher/i18n/en.ts';
import { en } from './en.ts';

// Core text plus every area's catalog. Area keys carry their area prefix, so the
// merge cannot collide; a missing translation falls back to English, never to blank.
// English ships with the app; Uzbek and Russian load on demand (main.tsx waits for
// the first one), so the first download carries one language, not three.
export const catalogs: Catalogs<string> = {
  en: { ...en, ...learnerEn, ...teacherEn, ...centreEn, ...coachEn, ...engageEn },
  uz: {},
  ru: {},
};
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Record<string, string>[]>> = {
  uz: () => Promise.all([
    import('./uz.ts').then((m) => m.uz), import('../../learner/i18n/uz.ts').then((m) => m.uz), import('../../teacher/i18n/uz.ts').then((m) => m.uz),
    import('../../centre/i18n/uz.ts').then((m) => m.uz), import('../../coach/i18n/uz.ts').then((m) => m.uz), import('../../engage/i18n/uz.ts').then((m) => m.uz),
  ]),
  ru: () => Promise.all([
    import('./ru.ts').then((m) => m.ru), import('../../learner/i18n/ru.ts').then((m) => m.ru), import('../../teacher/i18n/ru.ts').then((m) => m.ru),
    import('../../centre/i18n/ru.ts').then((m) => m.ru), import('../../coach/i18n/ru.ts').then((m) => m.ru), import('../../engage/i18n/ru.ts').then((m) => m.ru),
  ]),
};
const loaded = new Set<Locale>(['en']), pending = new Map<Locale, Promise<void>>(), listeners = new Set<() => void>();
let version = 0;

/** Loads a language's text (core and every area). Resolves when it is in; failures leave English in place. */
export function loadLocale(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  let promise = pending.get(locale);
  if (!promise) {
    promise = loaders[locale as Exclude<Locale, 'en'>]().then((parts) => {
      catalogs[locale] = Object.assign({}, ...parts);
      loaded.add(locale);
      version++;
      for (const listener of listeners) listener();
    }).catch(() => { pending.delete(locale); });
    pending.set(locale, promise);
  }
  return promise;
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export type Translate = (key: string, params?: Params) => string;

export function useT(): Translate {
  const { locale } = useI18n();
  const loadedVersion = useSyncExternalStore(subscribe, () => version);
  useEffect(() => { void loadLocale(locale); }, [locale]);
  return useCallback<Translate>((key, params) => format(catalogs, locale, key, params), [locale, loadedVersion]);
}
export { useI18n };
export type { CoreKey } from './en.ts';
