import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {format,INTL,normalizeLocale,STORAGE_KEY,SUPPORTED_LOCALES,LOCALE_NAMES,type Catalogs,type Locale,type Params} from './format.ts';
export * from './format.ts';

export function initialLocale(): Locale {
  try {
    const fromUrl = normalizeLocale(new URLSearchParams(location.search).get('lang'));
    if (fromUrl) return fromUrl;
  } catch { /* non-browser */ }
  try {
    const stored = normalizeLocale(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch { /* storage unavailable */ }
  try {
    for (const language of navigator.languages ?? [navigator.language]) {
      const found = normalizeLocale(language);
      if (found) return found;
    }
  } catch { /* non-browser */ }
  return 'en';
}
interface I18n {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: string, params?: Params): string;
  date(value: string | number | Date, options?: Intl.DateTimeFormatOptions): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
}
const Context = createContext<I18n | null>(null);
export function I18nProvider<K extends string>({catalogs, children}: {catalogs: Catalogs<K>; children: React.ReactNode}) {
  const [locale, setState] = useState<Locale>(initialLocale);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    setState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* preference stays for this page only */ }
  }, []);
  const value = useMemo<I18n>(() => ({
    locale, setLocale,
    t: (key, params) => format(catalogs as Catalogs<string>, locale, key, params),
    date: (input, options = {dateStyle: 'medium', timeStyle: 'short'}) => new Intl.DateTimeFormat(INTL[locale], options).format(new Date(input)),
    number: (input, options) => new Intl.NumberFormat(INTL[locale], options).format(input),
  }), [catalogs, locale, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
/** Typed accessor: `const t = useT<keyof typeof en>()` keeps keys checked at compile time. */
export function useT<K extends string>() {
  const {t} = useI18n();
  return t as (key: K, params?: Params) => string;
}
export function LocaleSwitcher({label}: {label: string}) {
  const {locale, setLocale} = useI18n();
  return <label className="locale-switcher">
    <span className="visually-hidden">{label}</span>
    <select aria-label={label} value={locale} onChange={event => setLocale(event.target.value as Locale)}>
      {SUPPORTED_LOCALES.map(code => <option key={code} value={code} lang={code}>{LOCALE_NAMES[code]}</option>)}
    </select>
  </label>;
}
