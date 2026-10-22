import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import { UZ_ADMISSION_2026, UZ_MATH_TOPICS, findSection } from '../../../packages/subject-core/src/mod.ts';
import type { SectionId } from './api.ts';

export const TAXONOMY = UZ_MATH_TOPICS;
export const FORMAT = UZ_ADMISSION_2026;
export const SECTIONS: SectionId[] = ['compulsory_math', 'specialised_1', 'specialised_2'];
const byCode = new Map(TAXONOMY.topics.map((topic) => [topic.code, topic]));

export function sectionMax(section: SectionId): number {
  const row = findSection(FORMAT, section);
  return Math.round(row.questions * row.points_per_question * 10) / 10;
}

/** Topic names in the reader's language. */
export function useTopicName() {
  const { locale } = useI18n();
  return (code: string) => byCode.get(code)?.names[locale] ?? code;
}

export function topicStrand(code: string): string {
  return byCode.get(code)?.strand ?? 'other';
}
