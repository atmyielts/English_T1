/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import ru from './locales/ru.json';
import uz from './locales/uz.json';
import { SUPPORTED_LOCALES, type LocaleCode, type TranslationParams } from './types';

const STORAGE_KEY = 'schood.locale';
const supportedLocales = new Set<string>(SUPPORTED_LOCALES);
const dictionaries: Record<Exclude<LocaleCode, 'en'>, Record<string, string>> = { uz, ru };

const normalizeLocale = (value: string | null | undefined): LocaleCode | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().split('-')[0];
  return supportedLocales.has(normalized) ? normalized as LocaleCode : null;
};

const readInitialLocale = (): LocaleCode => {
  if (typeof window === 'undefined') return 'en';

  const queryLocale = normalizeLocale(new URLSearchParams(window.location.search).get('lang'));
  if (queryLocale) return queryLocale;

  try {
    const storedLocale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    if (storedLocale) return storedLocale;
  } catch {
    // Storage can be disabled; browser language remains a safe fallback.
  }

  for (const language of window.navigator.languages ?? [window.navigator.language]) {
    const browserLocale = normalizeLocale(language);
    if (browserLocale) return browserLocale;
  }

  return 'en';
};

let activeLocale: LocaleCode = readInitialLocale();

const formatTemplate = (template: string, params?: TranslationParams): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    if (!(key in params)) return placeholder;
    const value = params[key];
    return value === null || value === undefined ? '' : String(value);
  });
};

export const translate = (source: string, params?: TranslationParams): string => {
  const template = activeLocale === 'en' ? source : dictionaries[activeLocale][source] ?? source;
  return formatTemplate(template, params);
};

export const getLocaleTag = (): string => ({ en: 'en-US', uz: 'uz-UZ', ru: 'ru-RU' })[activeLocale];

const uzbekMonths = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];
const uzbekWeekdays = [
  'yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba',
];
const padNumber = (value: number): string => String(value).padStart(2, '0');

export const formatLocaleDateTime = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  if (activeLocale !== 'uz') return date.toLocaleString(getLocaleTag());
  return `${padNumber(date.getDate())}.${padNumber(date.getMonth() + 1)}.${date.getFullYear()}, ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
};

export const formatLocaleLongDate = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  if (activeLocale !== 'uz') {
    return new Intl.DateTimeFormat(getLocaleTag(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }
  return `${uzbekWeekdays[date.getDay()]}, ${date.getDate()}-${uzbekMonths[date.getMonth()]}`;
};

type I18nContextValue = {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: typeof translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(() => activeLocale);

  useEffect(() => {
    activeLocale = locale;
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
  }, [locale]);

  const setLocale = useCallback((nextLocale: LocaleCode) => {
    const normalized = normalizeLocale(nextLocale) ?? 'en';
    activeLocale = normalized;
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // The selected locale remains active for this session.
    }
    setLocaleState(normalized);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: translate }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
};

export { SUPPORTED_LOCALES } from './types';
export type { LocaleCode, TranslationParams } from './types';
