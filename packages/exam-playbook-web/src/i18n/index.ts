import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../service-i18n/src/format.ts';
import { useI18n } from '../../../service-i18n/src/i18n.tsx';
import { en } from './en';
import { uz } from './uz';
import { ru } from './ru';

export type Key = keyof typeof en;
export const catalogs: Catalogs<Key> = { en, uz, ru };
export type Translate = (key: Key, params?: Params) => string;

/** UI chrome is translated; learning content (modules, guides) stays English. */
export const useT = (): Translate => {
  const { locale } = useI18n();
  return useCallback<Translate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
};

/** Translate a key that is built at runtime (e.g. `section.${name}`), falling back to a readable label. */
export const useDynamicT = () => {
  const { locale } = useI18n();
  return useCallback((key: string, fallback: string, params?: Params) => {
    const text = format(catalogs as Catalogs<string>, locale, key, params);
    return text === key ? fallback : text;
  }, [locale]);
};

export const humanize = (value: unknown): string =>
  String(value ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
