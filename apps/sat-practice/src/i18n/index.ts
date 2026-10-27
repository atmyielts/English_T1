import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { ApiError } from '../lib/api';
import { en } from './en.ts';
import { ru } from './ru.ts';
import { uz } from './uz.ts';

export type AppKey = keyof typeof en;
export const catalogs: Catalogs<AppKey> = { en, uz, ru };
export type AppTranslate = (key: AppKey, params?: Params) => string;

export function useAppT(): AppTranslate {
  const { locale } = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

export const hasKey = (key: string): key is AppKey => Object.prototype.hasOwnProperty.call(en, key);

/**
 * Learner-facing error text: a known server code is shown in the chosen
 * language; otherwise English server text is shown only in English, with a
 * translated generic message in Uzbek and Russian.
 */
export function useErrorText() {
  const t = useAppT();
  const { locale } = useI18n();
  return useCallback((cause: unknown, fallback: AppKey = 'error.generic'): string => {
    if (cause instanceof ApiError) {
      if (cause.code && hasKey(`error.${cause.code}`)) return t(`error.${cause.code}` as AppKey);
      if (cause.status === 0) return t('error.network');
      if (locale === 'en' && cause.message) return cause.message;
      return t(cause.status >= 500 ? 'error.unavailable' : fallback);
    }
    if (cause instanceof TypeError) return t('error.network');
    if (locale === 'en' && cause instanceof Error && cause.message) return cause.message;
    return t(fallback);
  }, [locale, t]);
}
