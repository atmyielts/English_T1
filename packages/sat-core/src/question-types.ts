export type SatSectionType = 'reading_writing' | 'math';
export type SatDifficulty = 'easy' | 'medium' | 'hard';

export type SatDomain =
  | 'grammar'
  | 'transitions'
  | 'rhetoric'
  | 'vocabulary_in_context'
  | 'command_of_evidence'
  | 'algebra'
  | 'advanced_math'
  | 'problem_solving_data_analysis'
  | 'geometry_trig';

export const SAT_SECTION_TYPES: readonly SatSectionType[] = ['reading_writing', 'math'] as const;
export const SAT_DIFFICULTIES: readonly SatDifficulty[] = ['easy', 'medium', 'hard'] as const;

export const SAT_READING_WRITING_DOMAINS: readonly SatDomain[] = [
  'grammar',
  'transitions',
  'rhetoric',
  'vocabulary_in_context',
  'command_of_evidence',
] as const;

export const SAT_MATH_DOMAINS: readonly SatDomain[] = [
  'algebra',
  'advanced_math',
  'problem_solving_data_analysis',
  'geometry_trig',
] as const;

export const SAT_DOMAINS: readonly SatDomain[] = [
  ...SAT_READING_WRITING_DOMAINS,
  ...SAT_MATH_DOMAINS,
] as const;

export const isSatSectionType = (value: unknown): value is SatSectionType =>
  value === 'reading_writing' || value === 'math';

export const isSatDifficulty = (value: unknown): value is SatDifficulty =>
  value === 'easy' || value === 'medium' || value === 'hard';

export const isSatDomain = (value: unknown): value is SatDomain =>
  typeof value === 'string' && (SAT_DOMAINS as readonly string[]).includes(value);

const DOMAIN_ALIASES: Record<string, SatDomain> = {
  reading_writing: 'grammar',
  rw: 'grammar',
  english: 'grammar',
  vocab: 'vocabulary_in_context',
  vocabulary: 'vocabulary_in_context',
  evidence: 'command_of_evidence',
  math: 'algebra',
  problem_solving: 'problem_solving_data_analysis',
  data_analysis: 'problem_solving_data_analysis',
  geometry: 'geometry_trig',
  trigonometry: 'geometry_trig',
};

export const canonicalizeSatDomain = (value: unknown, section?: SatSectionType | null): SatDomain => {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/&/g, 'and');
    if (isSatDomain(key)) return key;
    if (DOMAIN_ALIASES[key]) return DOMAIN_ALIASES[key];
  }
  return section === 'math' ? 'algebra' : 'grammar';
};

export const sectionForSatDomain = (domain: SatDomain): SatSectionType =>
  (SAT_MATH_DOMAINS as readonly string[]).includes(domain) ? 'math' : 'reading_writing';

export const formatSatSection = (value: unknown): string => {
  if (value === 'reading_writing') return 'Reading & Writing';
  if (value === 'math') return 'Math';
  return 'SAT';
};

export const formatSatDomain = (value: unknown): string => {
  const domain = canonicalizeSatDomain(value);
  const labels: Record<SatDomain, string> = {
    grammar: 'Grammar',
    transitions: 'Transitions',
    rhetoric: 'Rhetoric',
    vocabulary_in_context: 'Vocabulary in Context',
    command_of_evidence: 'Command of Evidence',
    algebra: 'Algebra',
    advanced_math: 'Advanced Math',
    problem_solving_data_analysis: 'Problem Solving & Data Analysis',
    geometry_trig: 'Geometry & Trig',
  };
  return labels[domain];
};
