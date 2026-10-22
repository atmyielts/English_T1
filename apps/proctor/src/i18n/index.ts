import {useCallback} from 'react';
import {format,type Catalogs,type Params} from '../../../../packages/service-i18n/src/format.ts';
import {useI18n} from '../../../../packages/service-i18n/src/i18n.tsx';
import {webCatalogs,type WebKey} from '../../../../packages/assessment-web/src/i18n/catalog.ts';
import {errorText} from '../../../../packages/assessment-web/src/i18n/errors.ts';
import {ServiceRequestError} from '../../../../packages/assessment-web/src/client';
import {en} from './en.ts';
import {uz} from './uz.ts';
import {ru} from './ru.ts';
export type AppKey = keyof typeof en | WebKey;
export type ProctorKey = keyof typeof en;
export const catalogs: Catalogs<AppKey> = {en: {...webCatalogs.en, ...en}, uz: {...webCatalogs.uz, ...uz}, ru: {...webCatalogs.ru, ...ru}};
export type AppTranslate = (key: AppKey, params?: Params) => string;
/** Typed translator for this app: unknown keys fail the type check. Proctor
 * text always comes from these catalogs in the reader's locale, so a Proctor
 * component reused under another app's provider (for example the live-runtime
 * UI fixture) still renders Proctor wording rather than raw keys. */
export function useAppT(): AppTranslate {
  const {locale} = useI18n();
  return useCallback<AppTranslate>((key, params) => format(catalogs as Catalogs<string>, locale, key, params), [locale]);
}
const englishOnly = {en: catalogs.en, uz: catalogs.en, ru: catalogs.en} as Catalogs<string>;
/** Thrown by Proctor modules: `message` stays the exact English text (journeys
 * and logs rely on it) while the UI renders `key` in the reader's language. */
export class AppError extends Error {
  constructor(public readonly key: ProctorKey, public readonly params: Params = {}) {
    super(format(englishOnly, 'en', key, params));
  }
}
/** Translated text for a caught error (see `errorText`). In English a human
 * explanation sent by the server is shown exactly as sent; other languages
 * prefer a translated `error.<code>` key and fall back to the server's text. */
export function useErrorText() {
  const {locale} = useI18n(), t = useAppT();
  return (cause: unknown, fallbackKey: AppKey = 'error.generic') => {
    if (cause instanceof AppError) return t(cause.key, cause.params);
    return locale === 'en' && cause instanceof ServiceRequestError && cause.message && cause.message !== cause.code && cause.code !== 'request_failed' ? cause.message : errorText(cause, t, fallbackKey);
  };
}
/** Reader-language word for a server code under `code.<group>.<value>`; an
 * unknown code is shown as given with underscores replaced by spaces. */
export function useCodeText() {
  const t = useAppT();
  return (group: 'state' | 'disposition' | 'mode' | 'source' | 'role' | 'closeReason' | 'event', value: unknown) => {
    const raw = String(value ?? ''), key = `code.${group}.${raw}` as AppKey, text = t(key);
    return text === key ? raw.replaceAll('_', ' ') : text;
  };
}
/** A server timestamp in the reader's locale, seconds included for evidence. */
export function useDateTime() {
  const {date} = useI18n(), t = useAppT();
  return (value: unknown) => {
    if (!value) return t('time.notReceived');
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : date(parsed, {dateStyle: 'medium', timeStyle: 'medium'});
  };
}
