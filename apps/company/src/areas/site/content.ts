// Long page text lives in its own per-language files and loads with the page that needs
// it, so candidate links and the landing page never carry the help centre.
import { useEffect, useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import type { pagesEn } from '../../i18n/site.pages.en.ts';
import type { industriesEn } from '../../i18n/site.industries.en.ts';
import type { guideEn } from '../../i18n/site.guide.en.ts';
import type { helpEn } from '../../i18n/site.help.en.ts';
import type { legalEn } from '../../i18n/site.legal.en.ts';

type Locale = 'en' | 'ru' | 'uz';
type Loaders<T> = Record<Locale, () => Promise<T>>;

export const PAGES: Loaders<typeof pagesEn> = {
  en: () => import('../../i18n/site.pages.en.ts').then((module) => module.pagesEn),
  ru: () => import('../../i18n/site.pages.ru.ts').then((module) => module.pagesRu),
  uz: () => import('../../i18n/site.pages.uz.ts').then((module) => module.pagesUz),
};
export const INDUSTRIES_TEXT: Loaders<typeof industriesEn> = {
  en: () => import('../../i18n/site.industries.en.ts').then((module) => module.industriesEn),
  ru: () => import('../../i18n/site.industries.ru.ts').then((module) => module.industriesRu),
  uz: () => import('../../i18n/site.industries.uz.ts').then((module) => module.industriesUz),
};
export const GUIDE: Loaders<typeof guideEn> = {
  en: () => import('../../i18n/site.guide.en.ts').then((module) => module.guideEn),
  ru: () => import('../../i18n/site.guide.ru.ts').then((module) => module.guideRu),
  uz: () => import('../../i18n/site.guide.uz.ts').then((module) => module.guideUz),
};
export const HELP: Loaders<typeof helpEn> = {
  en: () => import('../../i18n/site.help.en.ts').then((module) => module.helpEn),
  ru: () => import('../../i18n/site.help.ru.ts').then((module) => module.helpRu),
  uz: () => import('../../i18n/site.help.uz.ts').then((module) => module.helpUz),
};
export const LEGAL: Loaders<typeof legalEn> = {
  en: () => import('../../i18n/site.legal.en.ts').then((module) => module.legalEn),
  ru: () => import('../../i18n/site.legal.ru.ts').then((module) => module.legalRu),
  uz: () => import('../../i18n/site.legal.uz.ts').then((module) => module.legalUz),
};

/** The text for the current language. Keeps the old text while a new language loads; a failed load reaches the page boundary, which reloads once after a deploy. */
export function useContent<T>(loaders: Loaders<T>): T | null {
  const { locale } = useI18n();
  const [value, setValue] = useState<T | null>(null);
  const [, fail] = useState<null>(null);
  useEffect(() => {
    let live = true;
    loaders[locale]().then((text) => { if (live) setValue(text); }).catch((cause) => { fail(() => { throw cause; }); });
    return () => { live = false; };
  }, [loaders, locale]);
  return value;
}
