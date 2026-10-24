import type { Catalogs } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { en } from './en';
import { ru } from './ru';
import { uz } from './uz';
import { aiEn } from './ai.en';
import { aiRu } from './ai.ru';
import { aiUz } from './ai.uz';
import { goalEn } from './goal.en';
import { goalRu } from './goal.ru';
import { goalUz } from './goal.uz';
import { skillCatalogs } from '../skills/catalogs';

type Partial3 = { en: Record<string, string>; ru: Partial<Record<string, string>>; uz: Partial<Record<string, string>> };

const merge = (parts: Partial3[]): Catalogs<string> => ({
  en: Object.assign({}, ...parts.map((part) => part.en)),
  ru: Object.assign({}, ...parts.map((part) => part.ru)),
  uz: Object.assign({}, ...parts.map((part) => part.uz)),
});

/** Every UI string. Russian and Uzbek fall back to English for any missing key. */
export const catalogs = merge([{ en, ru, uz }, { en: aiEn, ru: aiRu, uz: aiUz }, { en: goalEn, ru: goalRu, uz: goalUz }, ...skillCatalogs]);

/** Translator for the English app. Keys live in i18n/en.ts and skills/<skill>/i18n.ts. */
export const useT = () => useI18n().t;
export { useI18n };
