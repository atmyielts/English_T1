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

export const en = { ...coreEn, ...siteEn, ...peopleEn, ...hiringEn, ...trainingEn, ...insightsEn, ...staffEn };
export type AppKey = keyof typeof en;
export const catalogs: Catalogs<AppKey> = {
  en,
  ru: { ...coreRu, ...siteRu, ...peopleRu, ...hiringRu, ...trainingRu, ...insightsRu, ...staffRu },
  uz: { ...coreUz, ...siteUz, ...peopleUz, ...hiringUz, ...trainingUz, ...insightsUz, ...staffUz },
};
export type AppTranslate = (key: AppKey, params?: Params) => string;

export function useAppT(): AppTranslate {
  const { locale } = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

/** Turns an API error into a sentence: `error.<code>` when known, otherwise the server text. */
export function useErrorText() {
  const t = useAppT();
  return (cause: unknown): string => {
    const code = (cause as { code?: string })?.code;
    const key = `error.${code}` as AppKey;
    if (code && key in en) return t(key, { field: String((cause as { field?: string }).field ?? '') });
    if (cause instanceof TypeError) return t('error.network');
    return cause instanceof Error && cause.message ? cause.message : t('error.internal_error');
  };
}
