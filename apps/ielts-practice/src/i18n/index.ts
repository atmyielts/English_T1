import { useCallback } from 'react';
import { format, type Catalogs, type Locale, type Params } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { common } from './parts/common';
import { shell } from './parts/shell';
import { today } from './parts/today';
import { reviews } from './parts/reviews';
import { generator } from './parts/generator';
import { speaking } from './parts/speaking';
import { onboarding } from './parts/onboarding';
import { dashboard } from './parts/dashboard';
import { insights } from './parts/insights';
import { lab } from './parts/lab';
import { results } from './parts/results';
import { extras } from './parts/extras';
import { pages } from './parts/pages';
import { experience } from './parts/experience';

// UI chrome only. Learning content (passages, questions, prompts, model
// answers) stays in English; AI coaching prose follows the chosen locale.
// Each part file holds one area's en/uz/ru messages; uz and ru are typed
// against en so a missing key fails the build.
const parts = [common, shell, today, reviews, generator, speaking, onboarding, dashboard, insights, lab, results, extras, pages, experience] as const;

type PartKeys<P> = P extends { en: infer E } ? keyof E : never;
export type AppKey = PartKeys<(typeof parts)[number]> & string;

const merge = (locale: Locale): Record<AppKey, string> =>
  Object.assign({}, ...parts.map((part) => part[locale])) as Record<AppKey, string>;

export const catalogs: Catalogs<AppKey> = { en: merge('en'), uz: merge('uz'), ru: merge('ru') };

export type AppTranslate = (key: AppKey, params?: Params) => string;

/** English formatter for code that runs outside React (and as a default). */
export const translateEn: AppTranslate = (key, params) => format(catalogs as Catalogs<string>, 'en', key, params);

export function useAppT(): AppTranslate {
  const { locale } = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

/** Locale-aware formatting helpers shared by pages. */
export function useFormat() {
  const { locale, date, number } = useI18n();
  return {
    locale,
    date: (value: string | number | Date) => date(value, { dateStyle: 'medium' }),
    dateTime: (value: string | number | Date) => date(value, { dateStyle: 'medium', timeStyle: 'short' }),
    percent: (ratio: number) => number(ratio, { style: 'percent', maximumFractionDigits: 0 }),
    band: (value: number) => number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    number: (value: number, digits = 0) => number(value, { maximumFractionDigits: digits }),
  };
}

export const SECTION_KEYS = {
  reading: 'section.reading',
  listening: 'section.listening',
  writing: 'section.writing',
  speaking: 'section.speaking',
} as const satisfies Record<string, AppKey>;

/** Translated section name for a raw section_type value. */
export const sectionLabel = (t: AppTranslate, section: unknown): string => {
  const key = SECTION_KEYS[String(section ?? '').toLowerCase() as keyof typeof SECTION_KEYS];
  return key ? t(key) : String(section ?? '');
};

/**
 * Turn a thrown error into text for the learner. Known API codes and network
 * failures get a translated message; other server messages are English, so
 * other locales get the translated generic message instead.
 */
export function useErrorText() {
  const t = useAppT();
  const { locale } = useI18n();
  return useCallback((cause: unknown): string => {
    const status = cause && typeof cause === 'object' && 'status' in cause ? Number((cause as { status: unknown }).status) : null;
    const code = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code: unknown }).code ?? '') : '';
    const message = cause instanceof Error ? cause.message : '';
    if (code === 'product_access_required' || status === 403) return t('common.error.access');
    if (/failed to fetch|network|load failed/i.test(message)) return t('common.error.network');
    if (locale === 'en' && message) return message;
    return t('common.error.generic');
  }, [t, locale]);
}
