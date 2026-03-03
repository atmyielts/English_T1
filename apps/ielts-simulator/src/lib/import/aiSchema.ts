export type JsonObject = Record<string, unknown>;

export type InputFormat = 'canonical' | 'ai_v1';

export type CanonicalImportUnitLike = {
  id?: string;
  type: string;
  display_order?: number;
  data: JsonObject;
  metadata?: JsonObject;
  answer_key?: JsonObject;
};

export type CanonicalImportPartLike = {
  id?: string;
  name: string;
  display_order?: number;
  metadata?: JsonObject;
  content_units: CanonicalImportUnitLike[];
};

export type CanonicalImportSectionLike = {
  id?: string;
  name: string;
  display_order?: number;
  metadata?: JsonObject;
  parts: CanonicalImportPartLike[];
};

export type CanonicalImportPayloadLike = {
  product_id: string;
  experience: {
    id?: string;
    version?: number;
    name: string;
    display_order?: number;
    is_active?: boolean;
    metadata?: JsonObject;
  };
  sections: CanonicalImportSectionLike[];
};

export type AiImportUnitLike = {
  id?: string;
  type?: string;
  display_order?: number;
  order?: number;
  data?: JsonObject;
  metadata?: JsonObject;
  answer_key?: JsonObject;
  answerKey?: JsonObject;
  correct?: JsonObject;
};

export type AiImportPartLike = {
  id?: string;
  name?: string;
  title?: string;
  display_order?: number;
  order?: number;
  metadata?: JsonObject;
  content_units?: AiImportUnitLike[];
  units?: AiImportUnitLike[];
};

export type AiImportSectionLike = {
  id?: string;
  name?: string;
  title?: string;
  display_order?: number;
  order?: number;
  metadata?: JsonObject;
  parts?: AiImportPartLike[];
};

export type AiImportExperienceLike = {
  id?: string;
  version?: number;
  name?: string;
  title?: string;
  display_order?: number;
  order?: number;
  is_active?: boolean;
  active?: boolean;
  metadata?: JsonObject;
  sections?: AiImportSectionLike[];
};

export type AiImportPayloadV1 = {
  product_id?: string;
  exam?: AiImportExperienceLike;
  test?: AiImportExperienceLike;
  experience?: AiImportExperienceLike;
  sections?: AiImportSectionLike[];
};

export type NormalizationReport = {
  warnings: string[];
  errors: string[];
  autoDefaults: string[];
};

export const AI_SUPPORTED_UNIT_TYPES = [
  'instruction',
  'reading_passage',
  'audio',
  'image',
  'question_text',
  'question_single_choice',
  'question_multi_choice',
  'question_matching',
  'question_matching_headings',
  'question_sentence_endings',
  'question_true_false_not_given',
  'question_yes_no_not_given',
  'question_gap_fill',
  'question_select_from_list',
  'question_table_completion',
  'question_diagram_labeling',
  'question_drag_drop',
] as const;

export const AI_IMPORT_TEMPLATE_V1: AiImportPayloadV1 = {
  exam: {
    name: 'IELTS Mock Test 1',
    display_order: 1,
    is_active: false,
    metadata: {
      source: 'ai-v1',
      note: 'Edit all values before import.',
    },
    sections: [
      {
        name: 'Listening',
        display_order: 1,
        metadata: {
          type: 'listening',
          duration_seconds: 1800,
        },
        parts: [
          {
            name: 'Part 1',
            display_order: 1,
            units: [
              {
                type: 'instruction',
                display_order: 1,
                data: {
                  text: 'Read the questions and listen carefully.',
                },
              },
              {
                type: 'question_single_choice',
                display_order: 2,
                data: {
                  prompt: 'Question 1: Example question?',
                  options: [
                    { id: 'A', label: 'Option A' },
                    { id: 'B', label: 'Option B' },
                    { id: 'C', label: 'Option C' },
                  ],
                },
                answer_key: {
                  correct: {
                    option_id: 'A',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  },
};
