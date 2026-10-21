import type {Catalogs} from '../../../../packages/service-i18n/src/format.ts';
import {useI18n,useT} from '../../../../packages/service-i18n/src/i18n.tsx';
import {webCatalogs,type WebKey} from '../../../../packages/assessment-web/src/i18n/catalog.ts';
import {errorText} from '../../../../packages/assessment-web/src/i18n/errors.ts';
import {ServiceRequestError} from '../../../../packages/assessment-web/src/client';
import {en} from './en.ts';
import {uz} from './uz.ts';
import {ru} from './ru.ts';
export type AppKey = keyof typeof en | WebKey;
export const catalogs: Catalogs<AppKey> = {en: {...webCatalogs.en, ...en}, uz: {...webCatalogs.uz, ...uz}, ru: {...webCatalogs.ru, ...ru}};
/** Typed translator for this app: unknown keys fail the type check. */
export const useAppT = () => useT<AppKey>();
/** Translated text for a caught error (see `errorText`). In English a human
 * explanation sent by the server is shown exactly as sent, so English screens
 * keep the service's own wording; other languages prefer a translated
 * `error.<code>` key and fall back to the server's text. */
export function useErrorText() {
  const {t, locale} = useI18n();
  return (cause: unknown, fallbackKey: AppKey = 'error.generic') =>
    locale === 'en' && cause instanceof ServiceRequestError && cause.message && cause.message !== cause.code && cause.code !== 'request_failed' ? cause.message : errorText(cause, t, fallbackKey);
}
/** Localized question-type name; undefined for a type this catalog does not know. */
export function useItemLabel() {
  const t = useAppT();
  return (type: string) => { const key = `itemType.${type}` as AppKey, text = t(key); return text === key ? undefined : text; };
}
/** Reader-language word for a server status code under `<prefix>.<code>`;
 * a code this catalog does not know is shown as given (or as `fallback`). */
export function useCodeText() {
  const t = useAppT();
  return (prefix: string, code: string, fallback: string = code) => { const key = `${prefix}.${code}` as AppKey, text = t(key); return text === key ? fallback : text; };
}
