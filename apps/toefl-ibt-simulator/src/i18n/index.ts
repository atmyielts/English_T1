import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { en, type AppKey } from './en.ts';
import { uz } from './uz.ts';
import { ru } from './ru.ts';

export type { AppKey };
export const catalogs: Catalogs<AppKey> = { en, uz, ru };
export type AppTranslate = (key: AppKey, params?: Params) => string;

export function useAppT(): AppTranslate {
  const { locale } = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}
