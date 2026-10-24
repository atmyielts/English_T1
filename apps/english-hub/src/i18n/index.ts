import type { Catalogs } from '../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { en } from './en';
import { ru } from './ru';
import { uz } from './uz';
import { aiEn } from './ai.en';
import { aiRu } from './ai.ru';
import { aiUz } from './ai.uz';
import { tgreviewEn } from './tgreview.en';
import { tgreviewRu } from './tgreview.ru';
import { tgreviewUz } from './tgreview.uz';
import { handbookEn } from './handbook.en';
import { handbookRu } from './handbook.ru';
import { handbookUz } from './handbook.uz';
import { certificateEn } from './certificate.en';
import { certificateRu } from './certificate.ru';
import { certificateUz } from './certificate.uz';
import { goalEn } from './goal.en';
import { goalRu } from './goal.ru';
import { goalUz } from './goal.uz';
import { xpEn } from './xp.en';
import { xpRu } from './xp.ru';
import { xpUz } from './xp.uz';
import { translateEn } from './translate.en';
import { translateRu } from './translate.ru';
import { translateUz } from './translate.uz';
import { bundleEn } from './bundle.en';
import { bundleRu } from './bundle.ru';
import { bundleUz } from './bundle.uz';
import { pwaEn } from './pwa.en';
import { pwaRu } from './pwa.ru';
import { pwaUz } from './pwa.uz';
import { workspaceEn } from './workspace.en';
import { workspaceRu } from './workspace.ru';
import { workspaceUz } from './workspace.uz';
import { engineEn } from './engine.en';
import { engineRu } from './engine.ru';
import { engineUz } from './engine.uz';
import { pausedEn } from './paused.en';
import { pausedRu } from './paused.ru';
import { pausedUz } from './paused.uz';
import { showcaseEn } from './showcase.en';
import { showcaseRu } from './showcase.ru';
import { showcaseUz } from './showcase.uz';
import { practiceEn } from './practice.en';
import { practiceRu } from './practice.ru';
import { practiceUz } from './practice.uz';
import { anywhereEn } from './anywhere.en';
import { anywhereRu } from './anywhere.ru';
import { anywhereUz } from './anywhere.uz';
import { skillCatalogs } from '../skills/catalogs';

type Partial3 = { en: Record<string, string>; ru: Partial<Record<string, string>>; uz: Partial<Record<string, string>> };

const merge = (parts: Partial3[]): Catalogs<string> => ({
  en: Object.assign({}, ...parts.map((part) => part.en)),
  ru: Object.assign({}, ...parts.map((part) => part.ru)),
  uz: Object.assign({}, ...parts.map((part) => part.uz)),
});

/** Every UI string. Russian and Uzbek fall back to English for any missing key. */
export const catalogs = merge([{ en, ru, uz }, { en: aiEn, ru: aiRu, uz: aiUz }, { en: tgreviewEn, ru: tgreviewRu, uz: tgreviewUz }, { en: handbookEn, ru: handbookRu, uz: handbookUz }, { en: certificateEn, ru: certificateRu, uz: certificateUz }, { en: goalEn, ru: goalRu, uz: goalUz }, { en: xpEn, ru: xpRu, uz: xpUz }, { en: translateEn, ru: translateRu, uz: translateUz }, { en: bundleEn, ru: bundleRu, uz: bundleUz }, { en: pwaEn, ru: pwaRu, uz: pwaUz }, { en: workspaceEn, ru: workspaceRu, uz: workspaceUz }, { en: engineEn, ru: engineRu, uz: engineUz }, { en: pausedEn, ru: pausedRu, uz: pausedUz }, { en: showcaseEn, ru: showcaseRu, uz: showcaseUz }, { en: practiceEn, ru: practiceRu, uz: practiceUz }, { en: anywhereEn, ru: anywhereRu, uz: anywhereUz }, ...skillCatalogs]);

/** Translator for the English app. Keys live in i18n/en.ts and skills/<skill>/i18n.ts. */
export const useT = () => useI18n().t;
export { useI18n };
