import { grammarCatalog } from './grammar/i18n';
import { immersionCatalog } from './immersion/i18n';
import { listeningCatalog } from './listening/i18n';
import { readingCatalog } from './reading/i18n';
import { speakingCatalog } from './speaking/i18n';
import { vocabularyCatalog } from './vocabulary/i18n';
import { writingCatalog } from './writing/i18n';

/** Per-skill UI strings, merged into the app catalog. Each skill owns its own file. */
export type SkillCatalog = { en: Record<string, string>; ru: Partial<Record<string, string>>; uz: Partial<Record<string, string>> };

export const skillCatalogs: SkillCatalog[] = [
  grammarCatalog,
  readingCatalog,
  listeningCatalog,
  writingCatalog,
  speakingCatalog,
  vocabularyCatalog,
  immersionCatalog,
];
