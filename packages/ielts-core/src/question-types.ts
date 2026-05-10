// Canonical IELTS question-type identifiers. Source of truth for the three IELTS apps.
// Long-form names (`question_true_false_not_given`) are canonical; legacy short forms
// (`question_tfng`, `question_ynng`) used in some practice payloads are accepted as aliases.

export type IeltsSectionType = 'listening' | 'reading' | 'writing' | 'speaking';

export const IELTS_SECTION_TYPES: readonly IeltsSectionType[] = [
  'listening',
  'reading',
  'writing',
  'speaking',
] as const;

export type IeltsQuestionType =
  | 'question_text'
  | 'question_single_choice'
  | 'question_multi_choice'
  | 'question_matching'
  | 'question_true_false_not_given'
  | 'question_yes_no_not_given'
  | 'question_matching_headings'
  | 'question_sentence_endings'
  | 'question_gap_fill'
  | 'question_select_from_list'
  | 'question_table_completion'
  | 'question_form_completion'
  | 'question_note_completion'
  | 'question_summary_completion'
  | 'question_diagram_labeling'
  | 'question_map_labeling'
  | 'question_drag_drop';

export const IELTS_QUESTION_TYPES: readonly IeltsQuestionType[] = [
  'question_text',
  'question_single_choice',
  'question_multi_choice',
  'question_matching',
  'question_true_false_not_given',
  'question_yes_no_not_given',
  'question_matching_headings',
  'question_sentence_endings',
  'question_gap_fill',
  'question_select_from_list',
  'question_table_completion',
  'question_form_completion',
  'question_note_completion',
  'question_summary_completion',
  'question_diagram_labeling',
  'question_map_labeling',
  'question_drag_drop',
] as const;

const QUESTION_TYPE_ALIASES: Record<string, IeltsQuestionType> = {
  question_tfng: 'question_true_false_not_given',
  question_ynng: 'question_yes_no_not_given',
  question_multiple_choice: 'question_multi_choice',
  question_mcq: 'question_multi_choice',
};

const QUESTION_TYPE_LABELS: Record<IeltsQuestionType, string> = {
  question_text: 'Task Response',
  question_single_choice: 'Single Choice',
  question_multi_choice: 'Multiple Choice',
  question_matching: 'Matching',
  question_true_false_not_given: 'True / False / Not Given',
  question_yes_no_not_given: 'Yes / No / Not Given',
  question_matching_headings: 'Matching Headings',
  question_sentence_endings: 'Sentence Endings',
  question_gap_fill: 'Gap Fill',
  question_select_from_list: 'Select from List',
  question_table_completion: 'Table Completion',
  question_form_completion: 'Form Completion',
  question_note_completion: 'Note Completion',
  question_summary_completion: 'Summary Completion',
  question_diagram_labeling: 'Diagram Labelling',
  question_map_labeling: 'Map Labelling',
  question_drag_drop: 'Drag & Drop',
};

const QUESTION_TYPE_SECTIONS: Record<IeltsQuestionType, readonly IeltsSectionType[]> = {
  question_text: ['writing', 'speaking'],
  question_single_choice: ['listening', 'reading'],
  question_multi_choice: ['listening', 'reading'],
  question_matching: ['listening', 'reading'],
  question_true_false_not_given: ['reading'],
  question_yes_no_not_given: ['reading'],
  question_matching_headings: ['reading'],
  question_sentence_endings: ['reading'],
  question_gap_fill: ['listening', 'reading'],
  question_select_from_list: ['listening', 'reading'],
  question_table_completion: ['listening', 'reading'],
  question_form_completion: ['listening'],
  question_note_completion: ['listening'],
  question_summary_completion: ['reading'],
  question_diagram_labeling: ['listening', 'reading'],
  question_map_labeling: ['listening'],
  question_drag_drop: ['reading'],
};

export const isIeltsQuestionType = (value: unknown): value is IeltsQuestionType =>
  typeof value === 'string' && (IELTS_QUESTION_TYPES as readonly string[]).includes(value);

// Resolve a raw type identifier to its canonical form. Returns null for unknown values.
export const canonicalizeQuestionType = (value: unknown): IeltsQuestionType | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (isIeltsQuestionType(trimmed)) return trimmed;
  const aliased = QUESTION_TYPE_ALIASES[trimmed];
  return aliased ?? null;
};

// Human-friendly label. Falls back to a title-cased version of the input for unknown types
// so callers (e.g. analytics dashboards) never render a blank.
export const formatQuestionTypeLabel = (value: unknown): string => {
  const canonical = canonicalizeQuestionType(value);
  if (canonical) return QUESTION_TYPE_LABELS[canonical];
  const fallback = String(value ?? '').trim();
  if (!fallback) return '-';
  return fallback
    .replace(/^question_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (token) => token.toUpperCase());
};

export const questionTypesForSection = (section: IeltsSectionType): readonly IeltsQuestionType[] =>
  IELTS_QUESTION_TYPES.filter((type) => QUESTION_TYPE_SECTIONS[type].includes(section));

export const sectionsForQuestionType = (type: IeltsQuestionType): readonly IeltsSectionType[] =>
  QUESTION_TYPE_SECTIONS[type];
