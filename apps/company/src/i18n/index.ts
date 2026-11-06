// One catalog per locale, merged from the shell (core) and each area's own files.
// Areas add keys only to their own <area>.{en,ru,uz}.ts; ru and uz are typed to
// have exactly the English keys.
import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { coreEn } from './core.en.ts';
import { coreRu } from './core.ru.ts';
import { coreUz } from './core.uz.ts';
import { siteEn } from './site.en.ts';
import { siteRu } from './site.ru.ts';
import { siteUz } from './site.uz.ts';
import { peopleEn } from './people.en.ts';
import { peopleRu } from './people.ru.ts';
import { peopleUz } from './people.uz.ts';
import { hiringEn } from './hiring.en.ts';
import { hiringRu } from './hiring.ru.ts';
import { hiringUz } from './hiring.uz.ts';
import { trainingEn } from './training.en.ts';
import { trainingRu } from './training.ru.ts';
import { trainingUz } from './training.uz.ts';
import { insightsEn } from './insights.en.ts';
import { insightsRu } from './insights.ru.ts';
import { insightsUz } from './insights.uz.ts';
import { staffEn } from './staff.en.ts';
import { staffRu } from './staff.ru.ts';
import { staffUz } from './staff.uz.ts';
import { coachEn } from './coach.en.ts';
import { coachRu } from './coach.ru.ts';
import { coachUz } from './coach.uz.ts';
import { connectEn } from './connect.en.ts';
import { connectRu } from './connect.ru.ts';
import { connectUz } from './connect.uz.ts';

export const en = { ...coreEn, ...siteEn, ...peopleEn, ...hiringEn, ...trainingEn, ...insightsEn, ...staffEn, ...coachEn, ...connectEn };
export type AppKey = keyof typeof en;
export const catalogs: Catalogs<AppKey> = {
  en,
  ru: { ...coreRu, ...siteRu, ...peopleRu, ...hiringRu, ...trainingRu, ...insightsRu, ...staffRu, ...coachRu, ...connectRu },
  uz: { ...coreUz, ...siteUz, ...peopleUz, ...hiringUz, ...trainingUz, ...insightsUz, ...staffUz, ...coachUz, ...connectUz },
};
export type AppTranslate = (key: AppKey, params?: Params) => string;

export function useAppT(): AppTranslate {
  const { locale } = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

const ERROR_PREFIXES = ['error.', 'people.error.', 'staff.error.', 'site.error.', 'hiring.error.', 'training.error.', 'insights.error.', 'coach.error.', 'connect.error.'];

/** Turns an API error into a sentence: `error.<code>` or `<area>.error.<code>` when known, otherwise the server text. */
export function useErrorText() {
  const t = useAppT();
  return (cause: unknown): string => {
    const code = (cause as { code?: string })?.code;
    const key = code ? ERROR_PREFIXES.map((prefix) => `${prefix}${code}` as AppKey).find((candidate) => candidate in en) : undefined;
    if (key) {
      const details = (cause as { details?: Record<string, unknown> }).details ?? {};
      const params = Object.fromEntries(Object.entries(details).filter(([, value]) => typeof value === 'string' || typeof value === 'number')) as Params;
      return t(key, { ...params, field: String((cause as { field?: string }).field ?? '') });
    }
    if (cause instanceof TypeError) return t('error.network');
    return cause instanceof Error && cause.message ? cause.message : t('error.internal_error');
  };
}
