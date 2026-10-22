import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { webCatalogs, type WebKey } from '../../../../packages/assessment-web/src/i18n/catalog.ts';
import { errorText } from '../../../../packages/assessment-web/src/i18n/errors.ts';
import { en } from './en.ts';
import { uz } from './uz.ts';
import { ru } from './ru.ts';

export type AppKey = keyof typeof en | WebKey;
// Shared web keys (question controls, account links) plus this service's own text.
export const catalogs: Catalogs<AppKey> = { en: { ...webCatalogs.en, ...en }, uz: { ...webCatalogs.uz, ...uz }, ru: { ...webCatalogs.ru, ...ru } };
export type AppTranslate = (key: AppKey, params?: Params) => string;

export function useAppT(): AppTranslate {
  const { locale } = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}

export function useErrorText() {
  const t = useAppT();
  return (cause: unknown) => errorText(cause, t as never, 'error.internal_error');
}
