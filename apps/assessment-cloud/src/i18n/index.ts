import type {Catalogs} from '../../../../packages/service-i18n/src/format.ts';
import {useT} from '../../../../packages/service-i18n/src/i18n.tsx';
import {webCatalogs,type WebKey} from '../../../../packages/assessment-web/src/i18n/catalog.ts';
import {en} from './en.ts';
import {uz} from './uz.ts';
import {ru} from './ru.ts';
export type AppKey = keyof typeof en | WebKey;
export const catalogs: Catalogs<AppKey> = {en: {...webCatalogs.en, ...en}, uz: {...webCatalogs.uz, ...uz}, ru: {...webCatalogs.ru, ...ru}};
/** Typed translator for this app: unknown keys fail the type check. */
export const useAppT = () => useT<AppKey>();
