import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { en } from './en.ts';
import { ru } from './ru.ts';
import { uz } from './uz.ts';

export type Key = keyof typeof en;
export type Translate = (key: Key, params?: Params) => string;

// UI chrome follows the learner's language. Guide content stays English.
export const catalogs: Catalogs<Key> = { en, uz, ru };

export function useT(): Translate {
  const { locale } = useI18n();
  return useCallback<Translate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

export function useLocale() {
  return useI18n();
}

/** Skill / plan values come from the API as slugs; show them in the UI language. */
export const enumLabel = (t: Translate, group: string, value: unknown, fallback = '-'): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return fallback;
  const key = `${group}.${raw}` as Key;
  const text = t(key);
  return text === key ? raw.replace(/[-_]+/g, ' ') : text;
};
