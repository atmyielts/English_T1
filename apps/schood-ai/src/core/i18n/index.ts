import { useCallback } from 'react';
import { format, type Catalogs, type Params } from '../../../../../packages/service-i18n/src/format.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { en as centreEn } from '../../centre/i18n/en.ts';
import { ru as centreRu } from '../../centre/i18n/ru.ts';
import { uz as centreUz } from '../../centre/i18n/uz.ts';
import { en as coachEn } from '../../coach/i18n/en.ts';
import { ru as coachRu } from '../../coach/i18n/ru.ts';
import { uz as coachUz } from '../../coach/i18n/uz.ts';
import { en as engageEn } from '../../engage/i18n/en.ts';
import { ru as engageRu } from '../../engage/i18n/ru.ts';
import { uz as engageUz } from '../../engage/i18n/uz.ts';
import { en as learnerEn } from '../../learner/i18n/en.ts';
import { ru as learnerRu } from '../../learner/i18n/ru.ts';
import { uz as learnerUz } from '../../learner/i18n/uz.ts';
import { en as teacherEn } from '../../teacher/i18n/en.ts';
import { ru as teacherRu } from '../../teacher/i18n/ru.ts';
import { uz as teacherUz } from '../../teacher/i18n/uz.ts';
import { en } from './en.ts';
import { ru } from './ru.ts';
import { uz } from './uz.ts';

// Core text plus every area's catalog. Area keys carry their area prefix, so the
// merge cannot collide; a missing translation falls back to English, never to blank.
export const catalogs: Catalogs<string> = {
  en: { ...en, ...learnerEn, ...teacherEn, ...centreEn, ...coachEn, ...engageEn },
  uz: { ...uz, ...learnerUz, ...teacherUz, ...centreUz, ...coachUz, ...engageUz },
  ru: { ...ru, ...learnerRu, ...teacherRu, ...centreRu, ...coachRu, ...engageRu },
};
export type Translate = (key: string, params?: Params) => string;

export function useT(): Translate {
  const { locale } = useI18n();
  return useCallback<Translate>((key, params) => format(catalogs, locale, key, params), [locale]);
}
export { useI18n };
export type { CoreKey } from './en.ts';
