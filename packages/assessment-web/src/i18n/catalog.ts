import type {Catalogs} from '../../../service-i18n/src/format.ts';
import {en} from './en.ts';
import {uz} from './uz.ts';
import {ru} from './ru.ts';
/** Shared candidate/institution component text used by both Assessment Cloud and Exam. */
export type WebKey = keyof typeof en;
export const webCatalogs: Catalogs<WebKey> = {en, uz, ru};
