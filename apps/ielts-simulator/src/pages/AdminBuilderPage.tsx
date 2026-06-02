import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { IELTS_PRODUCT_ID } from '../lib/constants';
import {
  adminAssetsList,
  adminBuilderLoad,
  adminBuilderRollback,
  adminBuilderSave,
  adminBuilderSnapshots,
  adminBuilderTemplatePayload,
  adminBuilderTemplateUpsert,
  adminBuilderTemplates,
  adminTestsList,
  adminUploadAsset,
  type AdminAssetRow,
  type AdminBuilderPayload,
  type AdminBuilderSnapshot,
  type AdminSectionTemplatePayload,
  type AdminSectionTemplateSummary,
  type AdminTestRow,
} from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';
import { supabase } from '../lib/supabase';

type UnitUiState = {
  dataText: string;
  answerText: string;
  dataError?: string;
  answerError?: string;
};

type UnitGuide = {
  overview: string;
  dataTips: string[];
  answerTips: string[];
};

type BuilderLocalDraft = {
  version: 1;
  savedAt: string;
  experienceId: string | null;
  payload: AdminBuilderPayload;
  deleted: { section_ids: string[]; part_ids: string[]; unit_ids: string[] };
  unitUi: Record<string, UnitUiState>;
  selectedUnitId: string | null;
};

type EditorMode = 'simple' | 'advanced';

type ChecklistIssue = {
  id: string;
  message: string;
  level: 'error' | 'warning';
  sectionId?: string;
  partId?: string;
  unitId?: string;
};

type SectionScoreMeter = {
  sectionId: string;
  sectionName: string;
  sectionType: string;
  score: number;
  target: number;
  missingAnswerUnitIds: string[];
  emptyAnswerUnitIds: string[];
  invalidAnswerUnitIds: string[];
  missingMediaUnitIds: string[];
  missingWritingPrompt: boolean;
};

type CoreSectionType = 'listening' | 'reading' | 'writing';
type PartScopeSectionType = 'listening' | 'reading';

type BuilderScaffoldUnit = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  answer_key: { correct: Record<string, unknown> } | null;
};

const UNIT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'instruction', label: 'Instruction' },
  { value: 'reading_passage', label: 'Reading passage' },
  { value: 'audio', label: 'Audio' },
  { value: 'image', label: 'Image' },
  { value: 'question_text', label: 'Question: Text' },
  { value: 'question_single_choice', label: 'Question: Single choice' },
  { value: 'question_multi_choice', label: 'Question: Multi choice' },
  { value: 'question_matching', label: 'Question: Matching' },
  { value: 'question_matching_headings', label: 'Question: Matching headings' },
  { value: 'question_sentence_endings', label: 'Question: Sentence endings' },
  { value: 'question_true_false_not_given', label: 'Question: True/False/Not Given' },
  { value: 'question_yes_no_not_given', label: 'Question: Yes/No/Not Given' },
  { value: 'question_gap_fill', label: 'Question: Gap fill' },
  { value: 'question_select_from_list', label: 'Question: Select from list' },
  { value: 'question_table_completion', label: 'Question: Table completion' },
  { value: 'question_diagram_labeling', label: 'Question: Diagram labeling' },
  { value: 'question_drag_drop', label: 'Question: Drag and drop' },
];

const QUESTION_TEMPLATE_TYPES: Array<{ value: string; label: string }> = UNIT_TYPES.filter((type) =>
  type.value.startsWith('question_'),
).map((type) => ({
  value: type.value,
  label: type.label.replace(/^Question:\s*/i, ''),
}));

const DEFAULT_SCAFFOLD_QUESTION_TYPE = 'question_single_choice';
const SCAFFOLD_QUESTION_SLOTS = 40;
const authDebugEnabled =
  import.meta.env.DEV || String(import.meta.env.VITE_DEBUG_AUTH ?? '').toLowerCase() === 'true';

const decodeJwtExpiryMs = (token: string | null | undefined): number | null => {
  const clean = String(token ?? '').trim();
  if (!clean) return null;
  try {
    const payload = clean.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    const raw = typeof atob === 'function' ? atob(padded) : '';
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { exp?: unknown };
    const exp = Number(parsed.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
};

const summarizeJwt = (token: string | null | undefined): Record<string, unknown> => {
  const clean = String(token ?? '').trim();
  if (!clean) return { present: false };
  const expMs = decodeJwtExpiryMs(clean);
  return {
    present: true,
    length: clean.length,
    preview: `${clean.slice(0, 10)}...${clean.slice(-6)}`,
    expiresAt: expMs ? new Date(expMs).toISOString() : null,
    expiresInSec: expMs ? Math.round((expMs - Date.now()) / 1000) : null,
  };
};

const logAuthDebug = (event: string, details: Record<string, unknown>): void => {
  if (!authDebugEnabled || typeof console === 'undefined') return;
  console.debug(`[AdminBuilder auth] ${event}`, { at: new Date().toISOString(), ...details });
};

const SECTION_TYPES: Array<{ value: 'listening' | 'reading' | 'writing'; label: string; defaultDurationSeconds: number }> = [
  { value: 'listening', label: 'Listening', defaultDurationSeconds: 2400 },
  { value: 'reading', label: 'Reading', defaultDurationSeconds: 3600 },
  { value: 'writing', label: 'Writing', defaultDurationSeconds: 3600 },
];

const DEFAULT_UNIT_DATA: Record<string, Record<string, unknown>> = {
  instruction: { text: 'Read the instructions carefully.' },
  reading_passage: { title: 'Passage title', text: 'Paste the passage text here.' },
  audio: { play_once: true, auto_start: true, storage: { bucket: '', path: '' } },
  image: { storage: { bucket: '', path: '' }, alt: '', caption: '' },
  question_text: { prompt: 'Write your answer.', rows: 6, show_word_count: true },
  question_single_choice: {
    prompt: 'Choose one option.',
    options: [
      { id: 'A', label: 'Option A' },
      { id: 'B', label: 'Option B' },
      { id: 'C', label: 'Option C' },
    ],
  },
  question_multi_choice: {
    prompt: 'Choose all that apply.',
    options: [
      { id: 'A', label: 'Option A' },
      { id: 'B', label: 'Option B' },
      { id: 'C', label: 'Option C' },
    ],
    max_select: 2,
  },
  question_matching: {
    prompt: 'Match each item with the correct option.',
    items: [
      { id: '1', label: 'Item 1' },
      { id: '2', label: 'Item 2' },
    ],
    options: [
      { id: 'A', label: 'Option A' },
      { id: 'B', label: 'Option B' },
    ],
  },
  question_matching_headings: {
    prompt: 'Match each paragraph to a heading.',
    items: [
      { id: '1', label: 'Paragraph 1' },
      { id: '2', label: 'Paragraph 2' },
    ],
    options: [
      { id: 'A', label: 'Heading A' },
      { id: 'B', label: 'Heading B' },
    ],
  },
  question_sentence_endings: {
    prompt: 'Match sentence endings.',
    items: [
      { id: '1', label: 'The report suggests...' },
      { id: '2', label: 'Researchers concluded...' },
    ],
    options: [
      { id: 'A', label: '...policy changes are needed.' },
      { id: 'B', label: '...further study is required.' },
    ],
  },
  question_true_false_not_given: {
    prompt: 'Choose TRUE, FALSE, or NOT GIVEN.',
    statements: [
      { id: '1', text: 'Statement 1' },
      { id: '2', text: 'Statement 2' },
    ],
  },
  question_yes_no_not_given: {
    prompt: 'Choose YES, NO, or NOT GIVEN.',
    statements: [
      { id: '1', text: 'Statement 1' },
      { id: '2', text: 'Statement 2' },
    ],
  },
  question_gap_fill: {
    prompt: 'Complete the notes.',
    text: 'The {{1}} was reported by {{2}}.',
    blanks: [
      { id: '1', placeholder: 'Q1' },
      { id: '2', placeholder: 'Q2' },
    ],
  },
  question_select_from_list: {
    prompt: 'Choose from the list.',
    text: 'The {{1}} was reported by {{2}}.',
    options: [
      { id: 'A', label: 'Option A' },
      { id: 'B', label: 'Option B' },
    ],
    blanks: [
      { id: '1', placeholder: 'Q1' },
      { id: '2', placeholder: 'Q2' },
    ],
  },
  question_table_completion: {
    prompt: 'Complete the table.',
    columns: ['Column A', 'Column B'],
    rows: [
      [{ text: 'Row 1' }, { blank_id: '1', placeholder: 'Q1' }],
      [{ text: 'Row 2' }, { blank_id: '2', placeholder: 'Q2' }],
    ],
  },
  question_diagram_labeling: {
    prompt: 'Label the diagram.',
    image: { storage: { bucket: '', path: '' }, alt: '', caption: '' },
    labels: [
      { id: '1', prompt: 'Label 1' },
      { id: '2', prompt: 'Label 2' },
    ],
  },
  question_drag_drop: {
    prompt: 'Drag items to the targets.',
    items: [
      { id: 'A', label: 'Item A' },
      { id: 'B', label: 'Item B' },
    ],
    targets: [
      { id: '1', label: 'Target 1' },
      { id: '2', label: 'Target 2' },
    ],
  },
};

const ANSWER_KEY_TEMPLATES: Record<string, Record<string, unknown>> = {
  question_text: { answers: ['sample answer'] },
  question_single_choice: { option_id: 'A' },
  question_multi_choice: { option_ids: ['A', 'C'] },
  question_matching: { matches: { '1': 'A', '2': 'B' } },
  question_matching_headings: { matches: { '1': 'A', '2': 'B' } },
  question_sentence_endings: { matches: { '1': 'A', '2': 'B' } },
  // Use option IDs by default. InputRenderer defaults: T/F/NG and Y/N/NG.
  question_true_false_not_given: { matches: { '1': 'T', '2': 'NG' } },
  question_yes_no_not_given: { matches: { '1': 'Y', '2': 'NG' } },
  question_gap_fill: { blanks: { '1': ['answer one'], '2': ['answer two'] } },
  question_select_from_list: { blanks: { '1': ['A'], '2': ['B'] } },
  question_table_completion: { cells: { '1': ['answer one'], '2': ['answer two'] } },
  question_diagram_labeling: { labels: { '1': ['label one'], '2': ['label two'] } },
  question_drag_drop: { targets: { '1': 'A', '2': 'B' } },
};

const BUILDER_QUICK_STEPS: string[] = [
  'Create or load a test, then set test name, price, and active status.',
  'Add sections (Reading, Listening, Writing), then set section durations.',
  'Add parts inside each section and keep unit order aligned to real IELTS flow.',
  'Pick a unit type, load starter JSON, then customize prompt/content.',
  'Add answer key JSON for objective questions so auto-scoring works.',
  'Save the test and verify in Practice/Full Exam before publishing.',
];

const SECTION_JSON_EXAMPLE: Record<string, unknown> = {
  section_type: 'reading',
  name: 'Reading',
  metadata: {
    type: 'reading',
    duration_seconds: 3600,
  },
  parts: [
    {
      name: 'Part 1',
      metadata: {},
      content_units: [
        {
          type: 'instruction',
          data: {
            text: 'Read the passage and answer Questions 1-13.',
          },
          metadata: {},
        },
        {
          type: 'reading_passage',
          data: {
            title: 'Sample passage',
            text: 'Paste passage text here...',
          },
          metadata: {},
        },
        {
          type: 'question_single_choice',
          data: {
            prompt: 'Question 1',
            options: [
              { id: 'A', label: 'Option A' },
              { id: 'B', label: 'Option B' },
              { id: 'C', label: 'Option C' },
            ],
          },
          metadata: { question_number: 1 },
          answer_key: {
            correct: { option_id: 'A' },
          },
        },
      ],
    },
  ],
};

const LISTENING_PART_JSON_EXAMPLE: Record<string, unknown> = {
  section_type: 'listening',
  target_part_index: 1,
  replace_existing: true,
  part_payload: {
    name: 'Part 1',
    metadata: {},
    content_units: [
      {
        type: 'instruction',
        data: {
          text: 'Questions 1-10. Listen and answer.',
        },
        metadata: {},
      },
      {
        type: 'audio',
        data: {
          play_once: true,
          auto_start: false,
          storage: { bucket: '', path: '' },
        },
        metadata: {},
      },
      {
        type: 'question_single_choice',
        data: {
          prompt: 'Question 1',
          options: [
            { id: 'A', label: 'Option A' },
            { id: 'B', label: 'Option B' },
            { id: 'C', label: 'Option C' },
          ],
        },
        metadata: { question_number: 1 },
        answer_key: {
          correct: { option_id: 'A' },
        },
      },
    ],
  },
};

const READING_PASSAGE_JSON_EXAMPLE: Record<string, unknown> = {
  section_type: 'reading',
  target_part_index: 1,
  replace_existing: true,
  part_payload: {
    name: 'Passage 1',
    metadata: {},
    content_units: [
      {
        type: 'instruction',
        data: {
          text: 'Read Passage 1 and answer Questions 1-13.',
        },
        metadata: {},
      },
      {
        type: 'reading_passage',
        data: {
          title: 'Sample passage',
          text: 'Paste passage text here...',
        },
        metadata: {},
      },
      {
        type: 'question_gap_fill',
        data: {
          prompt: 'Complete the notes below.',
          text: 'The {{1}} is increasing in urban areas.',
          blanks: [{ id: '1', placeholder: 'Q1' }],
        },
        metadata: { question_number: 1 },
        answer_key: {
          correct: { blanks: { '1': ['population'] } },
        },
      },
    ],
  },
};

const UNIT_GUIDANCE: Record<string, UnitGuide> = {
  instruction: {
    overview: 'Displays directions, task text, or notes for candidates. No scoring.',
    dataTips: ['Use `text` for the instruction body.', 'Keep each instruction short and section-specific.'],
    answerTips: ['Leave answer key empty for instruction units.'],
  },
  reading_passage: {
    overview: 'Shows reading passage content for the section. No scoring.',
    dataTips: ['Use `title` and `text`.', 'Paste clean paragraph text without HTML.'],
    answerTips: ['Leave answer key empty for reading passages.'],
  },
  audio: {
    overview: 'Represents listening audio. Use asset picker to attach storage file.',
    dataTips: ['Set `play_once` and `auto_start` as needed.', 'Attach `storage.bucket` and `storage.path` via asset picker.'],
    answerTips: ['Leave answer key empty for audio units.'],
  },
  image: {
    overview: 'Renders image assets for prompts/diagrams.',
    dataTips: ['Use asset picker for `storage`.', 'Set `alt` for accessibility and `caption` if needed.'],
    answerTips: ['Leave answer key empty for image units.'],
  },
  question_text: {
    overview: 'Essay/short text response. Used heavily in Writing tasks.',
    dataTips: ['Use `prompt` and optionally `rows`, `show_word_count`, `min_words`.', 'Prompt should match IELTS task wording.'],
    answerTips: ['Use `answers` only if exact-match scoring is needed.', 'For Writing essays, leave answer key empty and use AI grading.'],
  },
  question_single_choice: {
    overview: 'One correct option per question.',
    dataTips: ['Provide clear `prompt` and `options` with stable IDs (A/B/C...).'],
    answerTips: ['Use `option_id` with one option key (e.g. `A`).'],
  },
  question_multi_choice: {
    overview: 'Multiple correct options can be selected.',
    dataTips: ['Use `options` with stable IDs.', 'Set `max_select` if needed.'],
    answerTips: ['Use `option_ids` array and include all correct IDs.'],
  },
  question_matching: {
    overview: 'Match items to options.',
    dataTips: ['Define `items` and `options` with IDs.', 'Keep IDs short and unique.'],
    answerTips: ['Use `matches` map: item_id -> option_id.'],
  },
  question_matching_headings: {
    overview: 'IELTS heading-matching variant.',
    dataTips: ['Use paragraph items and heading options.', 'Keep IDs consistent with on-screen labels.'],
    answerTips: ['Use `matches` map: paragraph_id -> heading_id.'],
  },
  question_sentence_endings: {
    overview: 'Complete sentence endings by matching halves.',
    dataTips: ['Provide sentence stems as `items` and endings as `options`.'],
    answerTips: ['Use `matches` map: item_id -> option_id.'],
  },
  question_true_false_not_given: {
    overview: 'Classic IELTS statement classification.',
    dataTips: ['Put statements under `statements` with IDs.', 'Keep each statement concise and testable.'],
    answerTips: ['Use `matches` map with option IDs (default: T/F/NG).'],
  },
  question_yes_no_not_given: {
    overview: 'Opinion-claim classification variant.',
    dataTips: ['Use clear statements under `statements`.', 'Avoid ambiguous phrasing.'],
    answerTips: ['Use `matches` map with option IDs (default: Y/N/NG).'],
  },
  question_gap_fill: {
    overview: 'Fill blanks from text/notes.',
    dataTips: ['Use `text` with placeholders like `{{1}}`.', 'Define each blank in `blanks` array.'],
    answerTips: ['Use `blanks` map where each key points to an array of accepted answers.'],
  },
  question_select_from_list: {
    overview: 'Dropdown/list-based blank filling.',
    dataTips: ['Define `options`, `text`, and `blanks`.', 'Use option IDs consistently.'],
    answerTips: ['Use `blanks` map with accepted option IDs or values.'],
  },
  question_table_completion: {
    overview: 'Table completion with blank cells.',
    dataTips: ['Define `columns` and `rows`.', 'Use `blank_id` for answerable cells.'],
    answerTips: ['Use `cells` map with blank_id -> accepted answers array.'],
  },
  question_diagram_labeling: {
    overview: 'Label visual parts of a diagram.',
    dataTips: ['Attach image via `image.storage` or asset picker.', 'Define labels with IDs and prompts.'],
    answerTips: ['Use `labels` map with label_id -> accepted answers array.'],
  },
  question_drag_drop: {
    overview: 'Drag items to targets.',
    dataTips: ['Define `items` and `targets` IDs clearly.', 'Keep item/target counts balanced.'],
    answerTips: ['Use `targets` map: target_id -> item_id.'],
  },
};

const unitTypeLabel = (value: string): string => UNIT_TYPES.find((t) => t.value === value)?.label ?? value;
const toJson = (value: unknown): string => JSON.stringify(value ?? {}, null, 2);
const DRAFT_KEY_PREFIX = 'ieltsx:admin-builder:draft:';

const getDraftStorageKey = (experienceId?: string | null): string =>
  `${DRAFT_KEY_PREFIX}${experienceId && experienceId.trim() ? experienceId.trim() : 'new'}`;

const getDraftStorageKeyFromDraft = (draft: BuilderLocalDraft | null): string | null => {
  if (!draft) return null;
  const draftExperienceId = draft.payload?.experience?.id ?? draft.experienceId ?? null;
  return getDraftStorageKey(draftExperienceId);
};

const normalizeIdArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];

const normalizeUnitUiMap = (value: unknown): Record<string, UnitUiState> => {
  if (!isObject(value)) return {};
  const next: Record<string, UnitUiState> = {};
  for (const [unitId, raw] of Object.entries(value)) {
    if (!isObject(raw)) continue;
    next[unitId] = {
      dataText: typeof raw.dataText === 'string' ? raw.dataText : '',
      answerText: typeof raw.answerText === 'string' ? raw.answerText : '',
      dataError: typeof raw.dataError === 'string' ? raw.dataError : undefined,
      answerError: typeof raw.answerError === 'string' ? raw.answerError : undefined,
    };
  }
  return next;
};

const readDraftFromStorage = (key: string): BuilderLocalDraft | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    if ((parsed as any).version != null && (parsed as any).version !== 1) return null;
    if (!isObject((parsed as any).payload)) return null;
    const payload = (parsed as any).payload;
    if (!isObject((payload as any).experience) || !Array.isArray((payload as any).sections)) return null;
    return {
      version: 1,
      savedAt: typeof (parsed as any).savedAt === 'string' ? (parsed as any).savedAt : new Date().toISOString(),
      experienceId: typeof (parsed as any).experienceId === 'string' ? (parsed as any).experienceId : null,
      payload: payload as AdminBuilderPayload,
      deleted: {
        section_ids: normalizeIdArray((parsed as any).deleted?.section_ids),
        part_ids: normalizeIdArray((parsed as any).deleted?.part_ids),
        unit_ids: normalizeIdArray((parsed as any).deleted?.unit_ids),
      },
      unitUi: normalizeUnitUiMap((parsed as any).unitUi),
      selectedUnitId: typeof (parsed as any).selectedUnitId === 'string' ? (parsed as any).selectedUnitId : null,
    };
  } catch {
    return null;
  }
};

const writeDraftToStorage = (key: string, draft: BuilderLocalDraft): void => {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Ignore storage quota errors to avoid blocking authoring flow.
  }
};

const clearDraftFromStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
};

const detectAudioDurationSeconds = async (file: File): Promise<number | null> => {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';

      const cleanup = () => {
        audio.src = '';
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };

      audio.onloadedmetadata = () => {
        const duration = readPositiveNumber(audio.duration);
        cleanup();
        resolve(duration);
      };

      audio.onerror = () => {
        cleanup();
        resolve(null);
      };

      audio.src = objectUrl;
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(null);
    }
  });
};

const newId = (): string => {
  // Use UUIDs everywhere so payloads can be saved directly into `uuid` columns.
  const anyCrypto = (globalThis as any).crypto as Crypto | undefined;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();

  // Fallback: generate a UUID-looking value (not cryptographically strong).
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

const shortId = (value: string, max = 8): string => {
  const id = String(value ?? '').trim();
  if (!id) return '';
  return id.length <= max ? id : `${id.slice(0, max)}...`;
};

const compactIssueMessage = (message: string): string =>
  message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (match) => shortId(match));

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const normalizeSectionType = (value: unknown): string => String(value ?? '').toLowerCase().trim();

const isQuestionUnitType = (value: unknown): boolean => normalizeSectionType(value).startsWith('question_');

const estimateUnitMaxScore = (unitType: string, correct: Record<string, unknown> | null): number => {
  if (!correct) return 0;

  if (unitType === 'question_single_choice') {
    return typeof (correct as any).option_id === 'string' && String((correct as any).option_id).trim() ? 1 : 0;
  }

  if (unitType === 'question_multi_choice') {
    const ids = (correct as any).option_ids;
    return Array.isArray(ids) && ids.length > 0 ? 1 : 0;
  }

  if (unitType === 'question_text') {
    const answers = (correct as any).answers;
    return Array.isArray(answers) && answers.length > 0 ? 1 : 0;
  }

  const countKeys = (obj: any): number => (obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj).length : 0);

  if (
    unitType === 'question_matching' ||
    unitType === 'question_matching_headings' ||
    unitType === 'question_sentence_endings' ||
    unitType === 'question_true_false_not_given' ||
    unitType === 'question_yes_no_not_given'
  ) {
    return countKeys((correct as any).matches);
  }

  if (unitType === 'question_gap_fill' || unitType === 'question_select_from_list') {
    return countKeys((correct as any).blanks);
  }

  if (unitType === 'question_table_completion') {
    return countKeys((correct as any).cells);
  }

  if (unitType === 'question_diagram_labeling') {
    return countKeys((correct as any).labels);
  }

  if (unitType === 'question_drag_drop') {
    return countKeys((correct as any).targets);
  }

  return 0;
};

const SIMPLE_FORM_SUPPORTED_TYPES = new Set<string>([
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
]);

const parseJsonObject = (text: string): { value: Record<string, unknown> | null; error?: string } => {
  const source = text.trim();
  if (!source) return { value: {} };
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!isObject(parsed)) return { value: null, error: 'JSON must be an object.' };
    return { value: parsed };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
};

const toObjectRecordArray = (input: unknown): Array<Record<string, unknown>> =>
  Array.isArray(input) ? input.filter((item): item is Record<string, unknown> => isObject(item)) : [];

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

const readBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);

const readNumber = (value: unknown, fallback?: number): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
};

const getSectionType = (section: AdminBuilderPayload['sections'][number]): string => {
  const metadata = isObject(section.metadata) ? section.metadata : {};
  return normalizeSectionType((metadata as any).type);
};

const getMediaReference = (data: Record<string, unknown>): { bucket: string; path: string; url: string } => {
  const storage = isObject(data.storage) ? data.storage : {};
  return {
    bucket: readString((storage as any).bucket).trim(),
    path: readString((storage as any).path).trim(),
    url: readString((data as any).url).trim(),
  };
};

const getDiagramMediaReference = (data: Record<string, unknown>): { bucket: string; path: string; url: string } => {
  const image = isObject(data.image) ? data.image : {};
  const storage = isObject((image as any).storage) ? (image as any).storage : {};
  return {
    bucket: readString((storage as any).bucket).trim(),
    path: readString((storage as any).path).trim(),
    url: readString((image as any).url).trim(),
  };
};

const parseTemplateCounts = (source: string, expectedLength: number, fallback: number[]): number[] => {
  const parsed = source
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0 && item <= 40)
    .map((item) => Math.floor(item));
  if (parsed.length !== expectedLength) return fallback;
  return parsed;
};

const QUESTION_TEMPLATE_TYPE_SET = new Set<string>(QUESTION_TEMPLATE_TYPES.map((item) => item.value));

const createQuestionTypeSlots = (
  count = SCAFFOLD_QUESTION_SLOTS,
  initialType = DEFAULT_SCAFFOLD_QUESTION_TYPE,
): string[] =>
  Array.from({ length: count }, () => (QUESTION_TEMPLATE_TYPE_SET.has(initialType) ? initialType : DEFAULT_SCAFFOLD_QUESTION_TYPE));

const normalizeQuestionTemplateType = (value: unknown): string => {
  const type = String(value ?? '').trim();
  return QUESTION_TEMPLATE_TYPE_SET.has(type) ? type : DEFAULT_SCAFFOLD_QUESTION_TYPE;
};

const cloneTemplateRecord = (value: Record<string, unknown>): Record<string, unknown> => JSON.parse(JSON.stringify(value));

const buildScaffoldQuestionUnit = (questionNumber: number, selectedType: string): BuilderScaffoldUnit => {
  const type = normalizeQuestionTemplateType(selectedType);
  const dataTemplate = cloneTemplateRecord(DEFAULT_UNIT_DATA[type] ?? DEFAULT_UNIT_DATA[DEFAULT_SCAFFOLD_QUESTION_TYPE] ?? {});

  if (typeof dataTemplate.prompt === 'string') {
    const stripped = dataTemplate.prompt.replace(/^Question\s+\d+\s*:\s*/i, '').trim();
    dataTemplate.prompt = `Question ${questionNumber}: ${stripped || 'Answer the question.'}`;
  } else {
    dataTemplate.prompt = `Question ${questionNumber}`;
  }

  const answerTemplate = ANSWER_KEY_TEMPLATES[type];

  return {
    id: newId(),
    type,
    data: dataTemplate,
    metadata: { question_number: questionNumber },
    answer_key: answerTemplate ? { correct: cloneTemplateRecord(answerTemplate) } : null,
  };
};

const readPositiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const readAssetAudioDurationSeconds = (asset: AdminAssetRow): number | null => {
  const metadata = isObject(asset.metadata) ? asset.metadata : {};
  const duration =
    readPositiveNumber((metadata as any).duration_seconds) ??
    readPositiveNumber((metadata as any).duration) ??
    readPositiveNumber((metadata as any).audio_duration_seconds);
  return duration ? Math.round(duration) : null;
};

const calculateListeningDurationSecondsFromSectionData = (
  section: AdminBuilderPayload['sections'][number],
): number | null => {
  if (getSectionType(section) !== 'listening') return null;
  let total = 0;
  for (const part of section.parts) {
    for (const unit of part.content_units) {
      if (unit.type !== 'audio') continue;
      const data = isObject(unit.data) ? unit.data : {};
      const duration = readPositiveNumber((data as any).duration_seconds);
      if (duration) total += duration;
    }
  }
  return total > 0 ? Math.round(total) : null;
};

const extractPlaceholderIds = (text: string): string[] => {
  if (!text.trim()) return [];
  const found = new Set<string>();
  const matches = text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
  for (const match of matches) {
    const id = String(match[1] ?? '').trim();
    if (id) found.add(id);
  }
  return Array.from(found);
};

const getDataIds = (value: unknown): string[] =>
  toObjectRecordArray(value)
    .map((entry) => readString((entry as any).id).trim())
    .filter(Boolean);

const normalizeKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeChoiceToken = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/^OPTION[\s_-]*/i, '')
    .replace(/[^A-Z0-9_-]+/g, '');

const normalizeTfngToken = (value: string): string => {
  const normalized = normalizeKey(value).replace(/[^a-z]/g, '');
  if (!normalized) return '';
  if (normalized === 't' || normalized === 'true') return 'T';
  if (normalized === 'f' || normalized === 'false') return 'F';
  if (normalized === 'ng' || normalized === 'notgiven') return 'NG';
  return '';
};

const normalizeYnngToken = (value: string): string => {
  const normalized = normalizeKey(value).replace(/[^a-z]/g, '');
  if (!normalized) return '';
  if (normalized === 'y' || normalized === 'yes') return 'Y';
  if (normalized === 'n' || normalized === 'no') return 'N';
  if (normalized === 'ng' || normalized === 'notgiven') return 'NG';
  return '';
};

const getTableBlankIds = (data: Record<string, unknown>): string[] => {
  const rows = Array.isArray((data as any).rows) ? ((data as any).rows as unknown[]) : [];
  const found = new Set<string>();
  rows.forEach((row) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell) => {
      if (!isObject(cell)) return;
      const id = readString((cell as any).blank_id).trim();
      if (id) found.add(id);
    });
  });
  return Array.from(found);
};

const validateUnitConfiguration = (
  unitType: string,
  data: Record<string, unknown>,
  correct: Record<string, unknown> | null,
): string[] => {
  const issues: string[] = [];

  if (unitType === 'question_single_choice') {
    const optionIds = new Set(getDataIds((data as any).options).map(normalizeChoiceToken).filter(Boolean));
    const answerId = normalizeChoiceToken(readString((correct as any)?.option_id));
    if (optionIds.size === 0) issues.push('Single-choice question must define options.');
    if (correct && !answerId) issues.push('Single-choice answer key must include option_id.');
    if (answerId && !optionIds.has(answerId)) issues.push(`Single-choice answer key option_id "${answerId}" is not in options.`);
  }

  if (unitType === 'question_multi_choice') {
    const optionIds = new Set(getDataIds((data as any).options).map(normalizeChoiceToken).filter(Boolean));
    const answers = Array.isArray((correct as any)?.option_ids)
      ? ((correct as any).option_ids as unknown[]).map((value) => normalizeChoiceToken(String(value)))
      : [];
    if (optionIds.size === 0) issues.push('Multi-choice question must define options.');
    if (correct && answers.length === 0) issues.push('Multi-choice answer key must include option_ids.');
    answers.forEach((answerId) => {
      if (!optionIds.has(answerId)) issues.push(`Multi-choice answer key contains unknown option "${answerId}".`);
    });
  }

  if (
    unitType === 'question_matching' ||
    unitType === 'question_matching_headings' ||
    unitType === 'question_sentence_endings'
  ) {
    const itemIds = new Set(getDataIds((data as any).items));
    const optionIds = new Set(getDataIds((data as any).options).map(normalizeChoiceToken).filter(Boolean));
    const matches = isObject((correct as any)?.matches) ? ((correct as any).matches as Record<string, unknown>) : null;
    if (itemIds.size === 0) issues.push('Matching question must define items.');
    if (optionIds.size === 0) issues.push('Matching question must define options.');
    if (correct && !matches) issues.push('Matching answer key must include matches map.');
    if (matches) {
      Object.entries(matches).forEach(([itemId, optionId]) => {
        if (!itemIds.has(itemId)) issues.push(`Matching answer key references unknown item "${itemId}".`);
        const normalizedOption = normalizeChoiceToken(String(optionId));
        if (!normalizedOption || !optionIds.has(normalizedOption)) {
          issues.push(`Matching answer key references unknown option "${String(optionId)}".`);
        }
      });
    }
  }

  if (unitType === 'question_true_false_not_given' || unitType === 'question_yes_no_not_given') {
    const statementIds = new Set(getDataIds((data as any).statements));
    const matches = isObject((correct as any)?.matches) ? ((correct as any).matches as Record<string, unknown>) : null;
    if (statementIds.size === 0) issues.push('Statement question must define statements.');
    if (correct && !matches) issues.push('Answer key must include matches map.');
    const normalizer = unitType === 'question_true_false_not_given' ? normalizeTfngToken : normalizeYnngToken;
    if (matches) {
      Object.entries(matches).forEach(([statementId, answerValue]) => {
        if (!statementIds.has(statementId)) issues.push(`Answer key references unknown statement "${statementId}".`);
        const token = normalizer(String(answerValue));
        if (!token) issues.push(`Answer key value "${String(answerValue)}" is invalid for ${unitType}.`);
      });
    }
  }

  if (unitType === 'question_gap_fill' || unitType === 'question_select_from_list') {
    const blanksFromData = getDataIds((data as any).blanks);
    const textValue = readString((data as any).text);
    const blanksFromText = extractPlaceholderIds(textValue);
    const blankIds = new Set((blanksFromData.length > 0 ? blanksFromData : blanksFromText).map((id) => id.trim()).filter(Boolean));
    if (blankIds.size === 0) issues.push('Gap-fill/select-from-list question has no blanks defined.');

    // Sentence template lint: the practice lab renders gap-fill inline (sentence
    // with embedded inputs). If data.text is missing entirely, the lab will only
    // show numbered boxes — the bug users hit on real readings. Surface this at
    // authoring time so it never reaches production.
    if (blankIds.size > 0 && !textValue.trim()) {
      issues.push('Gap-fill question is missing data.text — the practice lab will render numbered inputs with no sentence around them. Add a sentence template that includes each blank as __1__ / __2__ / etc.');
    } else if (blankIds.size > 0 && textValue.trim() && blanksFromText.length === 0) {
      issues.push('Gap-fill data.text has no placeholder markers (e.g. __1__, __2__). The practice lab needs these to render inputs inline within the sentence.');
    } else if (blankIds.size > 0 && blanksFromText.length > 0) {
      const textBlankSet = new Set(blanksFromText.map((id) => id.trim()).filter(Boolean));
      const missing: string[] = [];
      blankIds.forEach((id) => {
        if (!textBlankSet.has(id)) missing.push(id);
      });
      if (missing.length > 0) {
        issues.push(`Gap-fill blank IDs ${missing.map((id) => `"${id}"`).join(', ')} have no matching placeholder in data.text. Add __${missing[0]}__ (or similar) to the sentence template.`);
      }
    }

    if (unitType === 'question_select_from_list') {
      const optionIds = new Set(getDataIds((data as any).options).map(normalizeChoiceToken).filter(Boolean));
      if (optionIds.size === 0) issues.push('Select-from-list question must define options.');
    }

    const blanks = isObject((correct as any)?.blanks) ? ((correct as any).blanks as Record<string, unknown>) : null;
    if (correct && !blanks) issues.push('Answer key must include blanks map.');
    if (blanks) {
      const optionIds =
        unitType === 'question_select_from_list'
          ? new Set(getDataIds((data as any).options).map(normalizeChoiceToken).filter(Boolean))
          : null;
      Object.entries(blanks).forEach(([blankId, answerValue]) => {
        if (!blankIds.has(blankId)) issues.push(`Answer key references unknown blank "${blankId}".`);
        const answers = Array.isArray(answerValue) ? answerValue : [answerValue];
        const normalizedAnswers = answers.map((value) => String(value ?? '').trim()).filter(Boolean);
        if (normalizedAnswers.length === 0) issues.push(`Blank "${blankId}" has empty answer list.`);
        if (optionIds) {
          normalizedAnswers.forEach((value) => {
            const normalizedOption = normalizeChoiceToken(value);
            if (!normalizedOption || !optionIds.has(normalizedOption)) {
              issues.push(`Blank "${blankId}" answer "${value}" is not one of the option IDs.`);
            }
          });
        }
      });
    }
  }

  if (unitType === 'question_table_completion') {
    const blankIds = new Set(getTableBlankIds(data));
    if (blankIds.size === 0) issues.push('Table completion question has no blank_id cells.');
    const cells = isObject((correct as any)?.cells) ? ((correct as any).cells as Record<string, unknown>) : null;
    if (correct && !cells) issues.push('Table completion answer key must include cells map.');
    if (cells) {
      Object.entries(cells).forEach(([cellId, answerValue]) => {
        if (!blankIds.has(cellId)) issues.push(`Answer key references unknown cell "${cellId}".`);
        const answers = Array.isArray(answerValue) ? answerValue : [answerValue];
        if (answers.map((value) => String(value ?? '').trim()).filter(Boolean).length === 0) {
          issues.push(`Cell "${cellId}" has empty answer list.`);
        }
      });
    }
  }

  if (unitType === 'question_diagram_labeling') {
    const labelIds = new Set(getDataIds((data as any).labels));
    if (labelIds.size === 0) issues.push('Diagram labeling question must define labels.');
    const labels = isObject((correct as any)?.labels) ? ((correct as any).labels as Record<string, unknown>) : null;
    if (correct && !labels) issues.push('Diagram labeling answer key must include labels map.');
    if (labels) {
      Object.entries(labels).forEach(([labelId, answerValue]) => {
        if (!labelIds.has(labelId)) issues.push(`Answer key references unknown label "${labelId}".`);
        const answers = Array.isArray(answerValue) ? answerValue : [answerValue];
        if (answers.map((value) => String(value ?? '').trim()).filter(Boolean).length === 0) {
          issues.push(`Label "${labelId}" has empty answer list.`);
        }
      });
    }
  }

  if (unitType === 'question_drag_drop') {
    const targetIds = new Set(getDataIds((data as any).targets));
    const itemIds = new Set(getDataIds((data as any).items).map(normalizeChoiceToken).filter(Boolean));
    if (targetIds.size === 0) issues.push('Drag-drop question must define targets.');
    if (itemIds.size === 0) issues.push('Drag-drop question must define items.');
    const targets = isObject((correct as any)?.targets) ? ((correct as any).targets as Record<string, unknown>) : null;
    if (correct && !targets) issues.push('Drag-drop answer key must include targets map.');
    if (targets) {
      Object.entries(targets).forEach(([targetId, itemId]) => {
        if (!targetIds.has(targetId)) issues.push(`Answer key references unknown target "${targetId}".`);
        const normalizedItem = normalizeChoiceToken(String(itemId));
        if (!normalizedItem || !itemIds.has(normalizedItem)) {
          issues.push(`Target "${targetId}" references unknown item "${String(itemId)}".`);
        }
      });
    }
  }

  return Array.from(new Set(issues));
};

const createUnitUi = (unit: AdminBuilderPayload['sections'][0]['parts'][0]['content_units'][0]): UnitUiState => ({
  dataText: JSON.stringify(unit.data ?? {}, null, 2),
  answerText: unit.answer_key ? JSON.stringify(unit.answer_key.correct ?? {}, null, 2) : '',
});

const createNewPayload = (): AdminBuilderPayload => {
  return {
    product_id: IELTS_PRODUCT_ID,
    experience: {
      name: 'New IELTS Mock Test',
      version: 1,
      is_active: false,
      display_order: 0,
      metadata: {},
      price_amount: null,
      price_currency: 'UZS',
    },
    // Section-first workflow: start empty, then add scaffold/template sections.
    sections: [],
  };
};

const findFirstUnit = (payload: AdminBuilderPayload): { sectionId: string; partId: string; unitId: string } | null => {
  for (const section of payload.sections) {
    for (const part of section.parts) {
      const unit = part.content_units[0];
      if (unit) return { sectionId: section.id ?? '', partId: part.id ?? '', unitId: unit.id ?? '' };
    }
  }
  return null;
};

export const AdminBuilderPage: React.FC = () => {
  const { accessToken } = useAccess();
  const location = useLocation();
  const navigate = useNavigate();

  const queryId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('experience_id') ?? '';
  }, [location.search]);

  const [tests, setTests] = useState<AdminTestRow[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState<string>(queryId);
  const [builder, setBuilder] = useState<AdminBuilderPayload | null>(null);
  const [deleted, setDeleted] = useState<{ section_ids: string[]; part_ids: string[]; unit_ids: string[] }>({
    section_ids: [],
    part_ids: [],
    unit_ids: [],
  });
  const [unitUi, setUnitUi] = useState<Record<string, UnitUiState>>({});
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('simple');

  const [assetModal, setAssetModal] = useState<{ open: boolean; unitId: string; kind: 'audio' | 'image' } | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetUploadFile, setAssetUploadFile] = useState<File | null>(null);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetUploadProgress, setAssetUploadProgress] = useState(0);
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assets, setAssets] = useState<AdminAssetRow[]>([]);
  const [snapshots, setSnapshots] = useState<AdminBuilderSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [rollingBackSnapshotId, setRollingBackSnapshotId] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<BuilderLocalDraft | null>(null);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [serverAutoSavedAt, setServerAutoSavedAt] = useState<string | null>(null);
  const [readingTemplateParts, setReadingTemplateParts] = useState('13,13,14');
  const [listeningTemplateParts, setListeningTemplateParts] = useState('10,10,10,10');
  const [readingQuestionTypeSlots, setReadingQuestionTypeSlots] = useState<string[]>(() => createQuestionTypeSlots());
  const [listeningQuestionTypeSlots, setListeningQuestionTypeSlots] = useState<string[]>(() => createQuestionTypeSlots());
  const [readingBulkQuestionType, setReadingBulkQuestionType] = useState(DEFAULT_SCAFFOLD_QUESTION_TYPE);
  const [listeningBulkQuestionType, setListeningBulkQuestionType] = useState(DEFAULT_SCAFFOLD_QUESTION_TYPE);
  const [writingTemplateTask1MinWords, setWritingTemplateTask1MinWords] = useState('150');
  const [writingTemplateTask2MinWords, setWritingTemplateTask2MinWords] = useState('250');
  const [templates, setTemplates] = useState<AdminSectionTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [selectedTemplateIdForVersion, setSelectedTemplateIdForVersion] = useState('');
  const [templateActionLoading, setTemplateActionLoading] = useState(false);
  const [sectionJsonDraft, setSectionJsonDraft] = useState<string>(() => JSON.stringify(SECTION_JSON_EXAMPLE, null, 2));
  const [sectionJsonApplying, setSectionJsonApplying] = useState(false);
  const [sectionJsonStatus, setSectionJsonStatus] = useState<string | null>(null);
  const [partJsonDraft, setPartJsonDraft] = useState<string>(() => JSON.stringify(LISTENING_PART_JSON_EXAMPLE, null, 2));
  const [partJsonApplying, setPartJsonApplying] = useState(false);
  const [partJsonStatus, setPartJsonStatus] = useState<string | null>(null);
  const [partTargetSectionType, setPartTargetSectionType] = useState<PartScopeSectionType>('listening');

  useEffect(() => {
    setSelectedExperienceId(queryId);
  }, [queryId]);

  useEffect(() => {
    if (!accessToken) return;
    const loadTests = async () => {
      try {
        const res = await adminTestsList(accessToken, IELTS_PRODUCT_ID);
        setTests(res.experiences ?? []);
      } catch {
        setTests([]);
      }
    };
    void loadTests();
  }, [accessToken]);

  const loadTemplates = async (opts?: { silent?: boolean }) => {
    if (!accessToken) {
      setTemplates([]);
      return;
    }
    if (!opts?.silent) setTemplatesLoading(true);
    try {
      const result = await adminBuilderTemplates(accessToken, IELTS_PRODUCT_ID);
      setTemplates(result.templates ?? []);
    } catch (e) {
      setTemplates([]);
      const message = e instanceof Error ? e.message : String(e);
      logAuthDebug('loadTemplates.failed', {
        message,
        token: summarizeJwt(accessToken),
        selectedExperienceId,
      });
    } finally {
      if (!opts?.silent) setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const currentSelection = useMemo(() => {
    if (!builder) return null;
    if (!selectedUnitId) return null;
    for (const section of builder.sections) {
      for (const part of section.parts) {
        for (const unit of part.content_units) {
          if (unit.id === selectedUnitId) {
            return { section, part, unit };
          }
        }
      }
    }
    return null;
  }, [builder, selectedUnitId]);

  const selectedSectionForTemplate = useMemo(() => {
    if (!builder) return null;
    if (currentSelection?.section) return currentSelection.section;
    return builder.sections[0] ?? null;
  }, [builder, currentSelection?.section]);

  const selectedSectionTemplateType = useMemo(() => {
    if (!selectedSectionForTemplate) return '';
    return getSectionType(selectedSectionForTemplate);
  }, [selectedSectionForTemplate]);

  const templateCandidatesForSelectedSection = useMemo(
    () => templates.filter((template) => template.section_type === selectedSectionTemplateType),
    [templates, selectedSectionTemplateType],
  );

  useEffect(() => {
    if (!selectedSectionForTemplate) return;
    setTemplateNameDraft(selectedSectionForTemplate.name.trim());
  }, [selectedSectionForTemplate?.id]);

  useEffect(() => {
    if (!selectedSectionForTemplate) return;
    const metadata = isObject(selectedSectionForTemplate.metadata) ? selectedSectionForTemplate.metadata : {};
    const templateRef = isObject((metadata as any).template_ref) ? ((metadata as any).template_ref as Record<string, unknown>) : null;
    const templateIdFromSection = templateRef ? readString((templateRef as any).template_id).trim() : '';
    const preferredTemplateId =
      templateIdFromSection ||
      (templateCandidatesForSelectedSection.some((template) => template.template_id === selectedTemplateIdForVersion)
        ? selectedTemplateIdForVersion
        : templateCandidatesForSelectedSection[0]?.template_id ?? '');

    setSelectedTemplateIdForVersion(preferredTemplateId);
  }, [
    selectedSectionForTemplate,
    templateCandidatesForSelectedSection,
    selectedTemplateIdForVersion,
    setSelectedTemplateIdForVersion,
  ]);

  const currentUnitGuide = useMemo<UnitGuide | null>(() => {
    const type = String(currentSelection?.unit.type ?? '');
    return UNIT_GUIDANCE[type] ?? null;
  }, [currentSelection?.unit.type]);

  const currentUnitUi = useMemo<UnitUiState | null>(() => {
    if (!currentSelection?.unit.id) return null;
    return unitUi[currentSelection.unit.id] ?? null;
  }, [currentSelection?.unit.id, unitUi]);

  const currentUnitDataObject = useMemo(() => {
    if (!currentSelection) return null;
    const rawUi = unitUi[currentSelection.unit.id ?? ''];
    if (!rawUi) return (isObject(currentSelection.unit.data) ? currentSelection.unit.data : {}) as Record<string, unknown>;
    const parsed = parseJsonObject(rawUi.dataText);
    if (!parsed.value) return (isObject(currentSelection.unit.data) ? currentSelection.unit.data : {}) as Record<string, unknown>;
    return parsed.value;
  }, [currentSelection, unitUi]);

  const currentUnitAnswerObject = useMemo(() => {
    if (!currentSelection) return null;
    const rawUi = unitUi[currentSelection.unit.id ?? ''];
    if (!rawUi || !rawUi.answerText.trim()) {
      const existing = currentSelection.unit.answer_key?.correct;
      return (isObject(existing) ? existing : null) as Record<string, unknown> | null;
    }
    const parsed = parseJsonObject(rawUi.answerText);
    return parsed.value;
  }, [currentSelection, unitUi]);

  const simpleModeSupported = useMemo(() => {
    const type = String(currentSelection?.unit.type ?? '');
    return SIMPLE_FORM_SUPPORTED_TYPES.has(type);
  }, [currentSelection?.unit.type]);

  const activeDraftKey = useMemo(
    () => getDraftStorageKey(builder?.experience?.id ?? selectedExperienceId),
    [builder?.experience?.id, selectedExperienceId],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const draft = readDraftFromStorage(getDraftStorageKey(selectedExperienceId));
    setPendingDraft(draft);
  }, [selectedExperienceId]);

  useEffect(() => {
    if (!builder || !dirty || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const draft: BuilderLocalDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        experienceId: builder.experience.id ?? (selectedExperienceId || null),
        payload: builder,
        deleted,
        unitUi,
        selectedUnitId,
      };
      writeDraftToStorage(activeDraftKey, draft);
      setAutoSavedAt(draft.savedAt);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [builder, dirty, deleted, unitUi, selectedUnitId, selectedExperienceId, activeDraftKey]);

  useEffect(() => {
    if (!accessToken || !selectedExperienceId) return;
    if (builder) return;
    void loadSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectedExperienceId]);

  const syncQuery = (id?: string) => {
    const search = id ? `?experience_id=${encodeURIComponent(id)}` : '';
    navigate({ pathname: '/admin/builder', search }, { replace: true });
  };

  const selectFirst = (payload: AdminBuilderPayload) => {
    const first = findFirstUnit(payload);
    if (!first) {
      setSelectedUnitId(null);
      return;
    }
    setSelectedUnitId(first.unitId);
  };

  const jumpToIssue = (issue: ChecklistIssue) => {
    if (!builder) return;
    if (issue.unitId) {
      setSelectedUnitId(issue.unitId);
      return;
    }
    if (issue.partId) {
      for (const section of builder.sections) {
        const part = section.parts.find((candidate) => candidate.id === issue.partId);
        const first = part?.content_units[0];
        if (first?.id) {
          setSelectedUnitId(first.id);
          return;
        }
      }
    }
    if (issue.sectionId) {
      const section = builder.sections.find((candidate) => candidate.id === issue.sectionId);
      const first = section?.parts[0]?.content_units[0];
      if (first?.id) {
        setSelectedUnitId(first.id);
      }
    }
  };

  const hydrateUnitUi = (payload: AdminBuilderPayload) => {
    const next: Record<string, UnitUiState> = {};
    payload.sections.forEach((section) => {
      section.parts.forEach((part) => {
        part.content_units.forEach((unit) => {
          if (!unit.id) return;
          next[unit.id] = createUnitUi(unit);
        });
      });
    });
    setUnitUi(next);
  };

  const loadSnapshots = async (experienceId: string, opts?: { silent?: boolean }) => {
    if (!accessToken || !experienceId) {
      setSnapshots([]);
      return;
    }
    if (!opts?.silent) setSnapshotsLoading(true);
    try {
      const res = await adminBuilderSnapshots(accessToken, experienceId, { limit: 20 });
      setSnapshots(res.snapshots ?? []);
    } catch {
      setSnapshots([]);
    } finally {
      if (!opts?.silent) setSnapshotsLoading(false);
    }
  };

  const loadSelected = async () => {
    if (!accessToken || !selectedExperienceId) return;
    setLoading(true);
    setError(null);
    setAutoSaveError(null);
    setWarnings([]);
    try {
      const res = await adminBuilderLoad(accessToken, selectedExperienceId);
      setBuilder(res.payload);
      setDeleted({ section_ids: [], part_ids: [], unit_ids: [] });
      hydrateUnitUi(res.payload);
      selectFirst(res.payload);
      setDirty(false);
      setAutoSavedAt(null);
      setServerAutoSavedAt(null);
      await loadSnapshots(selectedExperienceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load experience');
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  };

  const createNew = () => {
    const payload = createNewPayload();
    setBuilder(payload);
    setDeleted({ section_ids: [], part_ids: [], unit_ids: [] });
    setWarnings([]);
    hydrateUnitUi(payload);
    selectFirst(payload);
    setSelectedExperienceId('');
    syncQuery();
    setSnapshots([]);
    const draft = readDraftFromStorage(getDraftStorageKey(null));
    setPendingDraft(draft);
    setDirty(true);
    setAutoSaveError(null);
    setServerAutoSavedAt(null);
  };

  const restorePendingDraft = () => {
    if (!pendingDraft) return;
    const pendingDraftKey = getDraftStorageKeyFromDraft(pendingDraft);
    const payload = pendingDraft.payload;
    const mergedUi: Record<string, UnitUiState> = {};
    payload.sections.forEach((section) => {
      section.parts.forEach((part) => {
        part.content_units.forEach((unit) => {
          if (!unit.id) return;
          mergedUi[unit.id] = pendingDraft.unitUi[unit.id] ?? createUnitUi(unit);
        });
      });
    });
    const first = findFirstUnit(payload);
    const nextSelectedUnitId =
      pendingDraft.selectedUnitId && mergedUi[pendingDraft.selectedUnitId] ? pendingDraft.selectedUnitId : first?.unitId ?? null;

    setBuilder(payload);
    setDeleted(pendingDraft.deleted);
    setUnitUi(mergedUi);
    setSelectedUnitId(nextSelectedUnitId);
    setDirty(true);
    setError(null);
    setAutoSaveError(null);
    setWarnings([]);
    setPendingDraft(null);
    setAutoSavedAt(pendingDraft.savedAt);
    setServerAutoSavedAt(null);

    const draftExperienceId = payload.experience.id ?? pendingDraft.experienceId ?? '';
    if (pendingDraftKey) clearDraftFromStorage(pendingDraftKey);
    if (draftExperienceId) clearDraftFromStorage(getDraftStorageKey(draftExperienceId));
    else clearDraftFromStorage(getDraftStorageKey(null));

    if (draftExperienceId && draftExperienceId !== selectedExperienceId) {
      setSelectedExperienceId(draftExperienceId);
      syncQuery(draftExperienceId);
    }
  };

  const discardPendingDraft = () => {
    const pendingDraftKey = getDraftStorageKeyFromDraft(pendingDraft);
    if (pendingDraftKey) clearDraftFromStorage(pendingDraftKey);
    clearDraftFromStorage(getDraftStorageKey(selectedExperienceId));
    if (builder?.experience?.id) clearDraftFromStorage(getDraftStorageKey(builder.experience.id));
    setPendingDraft(null);
    setAutoSavedAt(null);
    setServerAutoSavedAt(null);
    setAutoSaveError(null);
  };

  const markDirty = () => {
    setDirty(true);
    setAutoSaveError(null);
  };

  const updateBuilder = (fn: (prev: AdminBuilderPayload) => AdminBuilderPayload) => {
    setBuilder((prev) => (prev ? fn(prev) : prev));
    markDirty();
  };

  const sectionTypeRank = (type: string): number => {
    if (type === 'listening') return 0;
    if (type === 'reading') return 1;
    if (type === 'writing') return 2;
    return 99;
  };

  const upsertSectionForType = (sectionType: CoreSectionType, nextSection: AdminBuilderPayload['sections'][number]) => {
    if (!builder) return;

    const existingSection = builder.sections.find((section) => getSectionType(section) === sectionType) ?? null;
    const removedPartIds: string[] = [];
    const removedUnitIds: string[] = [];

    let mergedSection = nextSection;
    if (existingSection) {
      const existingParts = existingSection.parts;
      const mergedParts = nextSection.parts.map((part, partIndex) => {
        const existingPart = existingParts[partIndex];
        const existingUnits = existingPart?.content_units ?? [];
        const mergedUnits = part.content_units.map((unit, unitIndex) => {
          const existingUnit = existingUnits[unitIndex];
          return { ...unit, id: existingUnit?.id ?? unit.id ?? newId() };
        });

        existingUnits.slice(mergedUnits.length).forEach((unit) => {
          if (unit.id) removedUnitIds.push(unit.id);
        });

        return {
          ...part,
          id: existingPart?.id ?? part.id ?? newId(),
          content_units: mergedUnits,
        };
      });

      existingParts.slice(mergedParts.length).forEach((part) => {
        if (part.id) removedPartIds.push(part.id);
        part.content_units.forEach((unit) => {
          if (unit.id) removedUnitIds.push(unit.id);
        });
      });

      mergedSection = {
        ...nextSection,
        id: existingSection.id ?? nextSection.id ?? newId(),
        parts: mergedParts,
      };
    }

    const remainingSections = builder.sections.filter((section) => getSectionType(section) !== sectionType);
    const nextSections = [...remainingSections, mergedSection].sort(
      (a, b) => sectionTypeRank(getSectionType(a)) - sectionTypeRank(getSectionType(b)),
    );

    const nextUi = { ...unitUi };
    for (const unitId of removedUnitIds) delete nextUi[unitId];
    mergedSection.parts.forEach((part) => {
      part.content_units.forEach((unit) => {
        if (!unit.id) return;
        nextUi[unit.id] = createUnitUi(unit);
      });
    });

    if (removedPartIds.length > 0 || removedUnitIds.length > 0) {
      setDeleted((prev) => ({
        section_ids: prev.section_ids,
        part_ids: Array.from(new Set([...prev.part_ids, ...removedPartIds])),
        unit_ids: Array.from(new Set([...prev.unit_ids, ...removedUnitIds])),
      }));
    }

    setBuilder({ ...builder, sections: nextSections });
    setUnitUi(nextUi);
    setSelectedUnitId(mergedSection.parts[0]?.content_units[0]?.id ?? null);
    markDirty();
  };

  const upsertPartForSectionType = (
    sectionType: PartScopeSectionType,
    nextPart: AdminBuilderPayload['sections'][number]['parts'][number],
    opts?: { targetPartIndex?: number | null; targetPartName?: string; replaceExisting?: boolean },
  ): { ok: true; action: 'replaced' | 'inserted' | 'appended'; partNumber: number; sectionName: string } | { ok: false; error: string } => {
    if (!builder) return { ok: false, error: 'Load or create a test before applying part JSON.' };

    const targetPartIndex = typeof opts?.targetPartIndex === 'number' ? opts.targetPartIndex : null;
    const targetPartName = String(opts?.targetPartName ?? '').trim();
    const replaceExisting = opts?.replaceExisting === true;

    const sectionIndex = builder.sections.findIndex((section) => getSectionType(section) === sectionType);
    const existingSection = sectionIndex >= 0 ? builder.sections[sectionIndex] : null;

    const sectionPreset = SECTION_TYPES.find((item) => item.value === sectionType);
    const defaultSectionName = sectionType === 'reading' ? 'Reading' : 'Listening';
    const defaultPartLabel = sectionType === 'reading' ? 'Passage' : 'Part';

    const baseSection: AdminBuilderPayload['sections'][number] =
      existingSection ?? {
        id: newId(),
        name: defaultSectionName,
        metadata: { type: sectionType, duration_seconds: sectionPreset?.defaultDurationSeconds ?? 2400 },
        parts: [],
      };

    const sectionMetadata = isObject(baseSection.metadata) ? { ...baseSection.metadata } : {};
    (sectionMetadata as any).type = sectionType;
    const durationSeconds = Number((sectionMetadata as any).duration_seconds ?? 0);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      (sectionMetadata as any).duration_seconds = sectionPreset?.defaultDurationSeconds ?? 2400;
    }

    const parts = [...baseSection.parts];
    const removedPartIds: string[] = [];
    const removedUnitIds: string[] = [];

    let action: 'replaced' | 'inserted' | 'appended' = 'appended';
    let insertIndex = parts.length;

    if (replaceExisting) {
      let replacementIndex = -1;
      if (targetPartIndex != null) {
        if (targetPartIndex < 0 || targetPartIndex >= parts.length) {
          return {
            ok: false,
            error: `target_part_index ${targetPartIndex + 1} is out of range for ${sectionType} (${parts.length} existing part(s)).`,
          };
        }
        replacementIndex = targetPartIndex;
      } else if (targetPartName) {
        replacementIndex = parts.findIndex((part) => String(part.name ?? '').trim().toLowerCase() === targetPartName.toLowerCase());
        if (replacementIndex < 0) {
          return { ok: false, error: `No ${defaultPartLabel.toLowerCase()} named "${targetPartName}" found in ${sectionType}.` };
        }
      }

      if (replacementIndex >= 0) {
        const replaced = parts[replacementIndex];
        const existingUnits = replaced?.content_units ?? [];
        const mergedUnits = nextPart.content_units.map((unit, unitIndex) => {
          const existingUnit = existingUnits[unitIndex];
          return { ...unit, id: existingUnit?.id ?? unit.id ?? newId() };
        });
        existingUnits.slice(mergedUnits.length).forEach((unit) => {
          if (unit.id) removedUnitIds.push(unit.id);
        });
        parts[replacementIndex] = {
          ...nextPart,
          id: replaced?.id ?? nextPart.id ?? newId(),
          content_units: mergedUnits,
        };
        insertIndex = replacementIndex;
        action = 'replaced';
      } else {
        parts.push(nextPart);
        insertIndex = parts.length - 1;
        action = 'appended';
      }
    } else if (targetPartIndex != null) {
      return {
        ok: false,
        error:
          'Insert-at-index is not supported for part JSON saves yet. Use replace_existing=true with target_part_index, or omit target_part_index to append.',
      };
    } else {
      parts.push(nextPart);
      insertIndex = parts.length - 1;
      action = 'appended';
    }

    const normalizedParts = parts.map((part, partIndex) => ({
      ...part,
      display_order: partIndex + 1,
      name: String(part.name ?? '').trim() || `${defaultPartLabel} ${partIndex + 1}`,
      content_units: part.content_units.map((unit, unitIndex) => ({
        ...unit,
        display_order: unitIndex + 1,
      })),
    }));

    const normalizedSection: AdminBuilderPayload['sections'][number] = {
      ...baseSection,
      metadata: sectionMetadata,
      parts: normalizedParts,
    };

    const remainingSections =
      sectionIndex >= 0 ? builder.sections.filter((_, idx) => idx !== sectionIndex) : [...builder.sections];
    const nextSections = [...remainingSections, normalizedSection].sort(
      (a, b) => sectionTypeRank(getSectionType(a)) - sectionTypeRank(getSectionType(b)),
    );

    const nextUi = { ...unitUi };
    removedUnitIds.forEach((unitId) => {
      delete nextUi[unitId];
    });
    nextPart.content_units.forEach((unit) => {
      if (!unit.id) return;
      nextUi[unit.id] = createUnitUi(unit);
    });

    if (removedPartIds.length > 0 || removedUnitIds.length > 0) {
      setDeleted((prev) => ({
        section_ids: prev.section_ids,
        part_ids: Array.from(new Set([...prev.part_ids, ...removedPartIds])),
        unit_ids: Array.from(new Set([...prev.unit_ids, ...removedUnitIds])),
      }));
    }

    setBuilder({ ...builder, sections: nextSections });
    setUnitUi(nextUi);
    setSelectedUnitId(nextPart.content_units[0]?.id ?? null);
    markDirty();

    return {
      ok: true,
      action,
      partNumber: insertIndex + 1,
      sectionName: normalizedSection.name || defaultSectionName,
    };
  };

  const updateSectionName = (sectionId: string, name: string) => {
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, name } : s)),
    }));
  };

  const updateSectionDuration = (sectionId: string, minutesValue: string) => {
    const minutes = minutesValue.trim() ? Number(minutesValue) : null;
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const metadata = isObject(s.metadata) ? { ...s.metadata } : {};
        if (!minutes || !Number.isFinite(minutes) || minutes <= 0) {
          delete (metadata as any).duration_seconds;
        } else {
          (metadata as any).duration_seconds = Math.round(minutes * 60);
        }
        return { ...s, metadata };
      }),
    }));
  };

  const updateSectionType = (sectionId: string, nextType: string) => {
    const normalized = String(nextType ?? '').toLowerCase().trim();
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const metadata = isObject(s.metadata) ? { ...s.metadata } : {};
        if (!normalized) {
          delete (metadata as any).type;
        } else {
          (metadata as any).type = normalized;

          // If duration wasn't set yet, seed with a sensible default for this section type.
          const duration = Number((metadata as any).duration_seconds ?? 0);
          if (!Number.isFinite(duration) || duration <= 0) {
            const preset = SECTION_TYPES.find((t) => t.value === normalized);
            if (preset) (metadata as any).duration_seconds = preset.defaultDurationSeconds;
          }
        }
        return { ...s, metadata };
      }),
    }));
  };

  const updatePartName = (partId: string, name: string) => {
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => ({
        ...s,
        parts: s.parts.map((p) => (p.id === partId ? { ...p, name } : p)),
      })),
    }));
  };

  const updateUnitType = (unitId: string, type: string) => {
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => ({
        ...s,
        parts: s.parts.map((p) => ({
          ...p,
          content_units: p.content_units.map((u) => (u.id === unitId ? { ...u, type } : u)),
        })),
      })),
    }));
    setUnitUi((prev) => {
      const next = { ...prev };
      if (!next[unitId]) return prev;
      if (next[unitId].dataText.trim().length === 0) {
        next[unitId] = {
          ...next[unitId],
          dataText: JSON.stringify(DEFAULT_UNIT_DATA[type] ?? {}, null, 2),
        };
      }
      return next;
    });
  };

  const addSection = () => {
    if (!builder) return;
    const sectionId = newId();
    const partId = newId();
    const unitId = newId();
    const nextSection = {
      id: sectionId,
      name: `Section ${builder.sections.length + 1}`,
      metadata: { type: 'reading', duration_seconds: 3600 },
      parts: [
        {
          id: partId,
          name: 'Part 1',
          content_units: [
            {
              id: unitId,
              type: 'instruction',
              data: DEFAULT_UNIT_DATA.instruction,
              metadata: {},
              answer_key: null,
            },
          ],
        },
      ],
    };
    const nextPayload = { ...builder, sections: [...builder.sections, nextSection] };
    setBuilder(nextPayload);
    setUnitUi((prev) => ({ ...prev, [unitId]: createUnitUi(nextSection.parts[0].content_units[0]) }));
    setSelectedUnitId(unitId);
    markDirty();
  };

  const moveSection = (sectionId: string, direction: 'up' | 'down') => {
    if (!builder) return;
    const index = builder.sections.findIndex((section) => section.id === sectionId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= builder.sections.length) return;

    const reordered = [...builder.sections];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setBuilder({ ...builder, sections: reordered });
    markDirty();
  };

  const buildTemplateSectionPayload = (
    section: AdminBuilderPayload['sections'][number],
  ): { payload: Record<string, unknown> | null; error?: string } => {
    const sectionMetadata = isObject(section.metadata) ? { ...section.metadata } : {};
    delete (sectionMetadata as any).template_ref;

    const nextParts: Array<Record<string, unknown>> = [];
    for (const part of section.parts) {
      const nextUnits: Array<Record<string, unknown>> = [];
      for (const unit of part.content_units) {
        const unitId = String(unit.id ?? '');
        const ui = unitId ? unitUi[unitId] : undefined;

        const dataParse = parseJsonObject(ui?.dataText ?? JSON.stringify(unit.data ?? {}));
        if (!dataParse.value) {
          if (unitId) {
            setUnitUi((prev) => ({
              ...prev,
              [unitId]: { ...(prev[unitId] ?? { dataText: '{}', answerText: '' }), dataError: dataParse.error ?? 'Invalid JSON' },
            }));
          }
          return { payload: null, error: `Unit ${unitId || unit.type} has invalid data JSON.` };
        }

        let answerKey: { correct: Record<string, unknown>; metadata?: Record<string, unknown> } | null = null;
        const answerSource = ui?.answerText?.trim() ? ui.answerText : unit.answer_key ? JSON.stringify(unit.answer_key.correct ?? {}) : '';
        if (answerSource.trim()) {
          const answerParse = parseJsonObject(answerSource);
          if (!answerParse.value) {
            if (unitId) {
              setUnitUi((prev) => ({
                ...prev,
                [unitId]: { ...(prev[unitId] ?? { dataText: '{}', answerText: '' }), answerError: answerParse.error ?? 'Invalid JSON' },
              }));
            }
            return { payload: null, error: `Unit ${unitId || unit.type} has invalid answer key JSON.` };
          }
          answerKey = { correct: answerParse.value };
        }

        nextUnits.push({
          type: unit.type,
          data: dataParse.value,
          metadata: isObject(unit.metadata) ? unit.metadata : {},
          answer_key: answerKey,
        });
      }

      nextParts.push({
        name: part.name,
        metadata: isObject(part.metadata) ? part.metadata : {},
        content_units: nextUnits,
      });
    }

    return {
      payload: {
        name: section.name,
        metadata: sectionMetadata,
        parts: nextParts,
      },
    };
  };

  const applyTemplateToBuilder = (templatePayload: AdminSectionTemplatePayload) => {
    if (!builder) return;
    const sectionData = isObject(templatePayload.section_payload) ? templatePayload.section_payload : null;
    if (!sectionData) {
      setError('Template payload is invalid.');
      return;
    }

    const rawParts = toObjectRecordArray((sectionData as any).parts);
    if (rawParts.length === 0) {
      setError('Template has no parts.');
      return;
    }

    const sectionId = newId();
    const sectionMetadata = isObject((sectionData as any).metadata) ? { ...(sectionData as any).metadata } : {};
    const sectionType = normalizeSectionType((sectionMetadata as any).type) || templatePayload.section_type;
    if (!['listening', 'reading', 'writing'].includes(sectionType)) {
      setError('Template section type must be listening, reading, or writing.');
      return;
    }
    (sectionMetadata as any).type = sectionType;
    (sectionMetadata as any).template_ref = {
      template_id: templatePayload.template_id,
      template_version_id: templatePayload.template_version_id,
      template_version: templatePayload.version,
      source_snapshot_id: templatePayload.source_snapshot_id ?? null,
    };

    const nextSection: AdminBuilderPayload['sections'][number] = {
      id: sectionId,
      name: readString((sectionData as any).name) || templatePayload.template_name,
      metadata: sectionMetadata,
      parts: rawParts.map((part, partIndex) => {
        const partId = newId();
        const rawUnits = toObjectRecordArray((part as any).content_units);
        return {
          id: partId,
          name: readString((part as any).name) || `Part ${partIndex + 1}`,
          metadata: isObject((part as any).metadata) ? (part as any).metadata : {},
          content_units: rawUnits.map((unit) => ({
            id: newId(),
            type: readString((unit as any).type) || 'instruction',
            data: isObject((unit as any).data) ? (unit as any).data : {},
            metadata: isObject((unit as any).metadata) ? (unit as any).metadata : {},
            answer_key: isObject((unit as any).answer_key) && isObject((unit as any).answer_key.correct)
              ? { correct: (unit as any).answer_key.correct, metadata: isObject((unit as any).answer_key.metadata) ? (unit as any).answer_key.metadata : {} }
              : null,
          })),
        };
      }),
    };
    upsertSectionForType(sectionType as CoreSectionType, nextSection);
    setTemplateNameDraft(templatePayload.template_name);
    setSelectedTemplateIdForVersion(templatePayload.template_id);
  };

  const handleApplySectionJson = () => {
    if (!builder) {
      setError('Load or create a test before applying section JSON.');
      return;
    }

    const parsed = parseJsonObject(sectionJsonDraft);
    if (!parsed.value) {
      setError(parsed.error ?? 'Section JSON is invalid.');
      return;
    }

    const root = parsed.value;
    const sectionData = isObject((root as any).section_payload)
      ? ((root as any).section_payload as Record<string, unknown>)
      : root;

    const explicitType = normalizeSectionType(readString((root as any).section_type));
    const metadataFromInput = isObject((sectionData as any).metadata) ? { ...(sectionData as any).metadata } : {};
    const sectionTypeRaw = explicitType || normalizeSectionType((metadataFromInput as any).type);

    if (!['listening', 'reading', 'writing'].includes(sectionTypeRaw)) {
      setError('section_type must be listening, reading, or writing.');
      return;
    }
    const sectionType = sectionTypeRaw as CoreSectionType;

    const rawParts = toObjectRecordArray((sectionData as any).parts);
    if (rawParts.length === 0) {
      setError('Section JSON must include a non-empty parts array.');
      return;
    }

    (metadataFromInput as any).type = sectionType;

    const nextSection: AdminBuilderPayload['sections'][number] = {
      id: newId(),
      name: readString((sectionData as any).name) || sectionType.charAt(0).toUpperCase() + sectionType.slice(1),
      display_order: readNumber((sectionData as any).display_order),
      metadata: metadataFromInput,
      parts: rawParts.map((part, partIndex) => {
        const rawUnits = toObjectRecordArray((part as any).content_units);
        return {
          id: newId(),
          name: readString((part as any).name) || `Part ${partIndex + 1}`,
          display_order: readNumber((part as any).display_order),
          metadata: isObject((part as any).metadata) ? (part as any).metadata : {},
          content_units: rawUnits.map((unit, unitIndex) => ({
            id: newId(),
            type: readString((unit as any).type) || 'instruction',
            display_order: readNumber((unit as any).display_order, unitIndex + 1),
            data: isObject((unit as any).data) ? (unit as any).data : {},
            metadata: isObject((unit as any).metadata) ? (unit as any).metadata : {},
            answer_key:
              isObject((unit as any).answer_key) && isObject((unit as any).answer_key.correct)
                ? {
                    correct: (unit as any).answer_key.correct as Record<string, unknown>,
                    metadata: isObject((unit as any).answer_key.metadata)
                      ? ((unit as any).answer_key.metadata as Record<string, unknown>)
                      : {},
                  }
                : null,
          })),
        };
      }),
    };

    const unitCount = nextSection.parts.reduce((acc, part) => acc + part.content_units.length, 0);
    if (unitCount === 0) {
      setError('Each section must include at least one content unit.');
      return;
    }

    setSectionJsonApplying(true);
    setError(null);
    setSectionJsonStatus(null);

    try {
      upsertSectionForType(sectionType, nextSection);
      setSectionJsonStatus(
        `Applied ${sectionType} section "${nextSection.name}" (${nextSection.parts.length} part(s), ${unitCount} unit(s)).`,
      );
    } finally {
      setSectionJsonApplying(false);
    }
  };

  const handleApplyPartJson = () => {
    if (!builder) {
      setError('Load or create a test before applying part JSON.');
      return;
    }

    const parsed = parseJsonObject(partJsonDraft);
    if (!parsed.value) {
      setError(parsed.error ?? 'Part JSON is invalid.');
      return;
    }

    const root = parsed.value;
    const partData = isObject((root as any).part_payload) ? ((root as any).part_payload as Record<string, unknown>) : root;
    const explicitType = normalizeSectionType(readString((root as any).section_type));

    if (explicitType && !['listening', 'reading'].includes(explicitType)) {
      setError('part JSON section_type must be listening or reading.');
      return;
    }
    const sectionType = (explicitType || partTargetSectionType) as PartScopeSectionType;

    const rawUnits = toObjectRecordArray((partData as any).content_units);
    if (rawUnits.length === 0) {
      setError('Part JSON must include a non-empty content_units array.');
      return;
    }

    const rawTargetIndex = Number((root as any).target_part_index);
    let targetPartIndex: number | null = null;
    if (Number.isFinite(rawTargetIndex)) {
      const rounded = Math.floor(rawTargetIndex);
      if (rounded <= 0) {
        setError('target_part_index must be a positive number (1-based).');
        return;
      }
      targetPartIndex = rounded - 1;
    }

    const targetPartName = readString((root as any).target_part_name).trim();
    const hasReplaceExistingFlag = typeof (root as any).replace_existing === 'boolean';
    const replaceExisting = hasReplaceExistingFlag
      ? readBoolean((root as any).replace_existing, false)
      : targetPartIndex != null || targetPartName.length > 0;
    const defaultPartLabel = sectionType === 'reading' ? 'Passage' : 'Part';

    const nextPart: AdminBuilderPayload['sections'][number]['parts'][number] = {
      id: newId(),
      name: readString((partData as any).name),
      display_order: readNumber((partData as any).display_order),
      metadata: isObject((partData as any).metadata) ? (partData as any).metadata : {},
      content_units: rawUnits.map((unit, unitIndex) => ({
        id: newId(),
        type: readString((unit as any).type) || 'instruction',
        display_order: readNumber((unit as any).display_order, unitIndex + 1),
        data: isObject((unit as any).data) ? (unit as any).data : {},
        metadata: isObject((unit as any).metadata) ? (unit as any).metadata : {},
        answer_key:
          isObject((unit as any).answer_key) && isObject((unit as any).answer_key.correct)
            ? {
                correct: (unit as any).answer_key.correct as Record<string, unknown>,
                metadata: isObject((unit as any).answer_key.metadata)
                  ? ((unit as any).answer_key.metadata as Record<string, unknown>)
                  : {},
              }
            : null,
      })),
    };

    setPartJsonApplying(true);
    setError(null);
    setPartJsonStatus(null);

    try {
      const result = upsertPartForSectionType(sectionType, nextPart, { targetPartIndex, targetPartName, replaceExisting });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const appliedPartName = nextPart.name.trim() || `${defaultPartLabel} ${result.partNumber}`;
      setPartJsonStatus(
        `Applied ${sectionType} ${defaultPartLabel.toLowerCase()} "${appliedPartName}" as #${result.partNumber} (${nextPart.content_units.length} unit(s), ${result.action}).`,
      );
    } finally {
      setPartJsonApplying(false);
    }
  };

  const handleCreateTemplateFromCurrentSection = async (opts: { templateId?: string | null }) => {
    if (!accessToken || !builder) return;

    const section = selectedSectionForTemplate;
    if (!section) {
      setError('Select a section before saving a template.');
      return;
    }
    const sectionType = normalizeSectionType((isObject(section.metadata) ? section.metadata : {})?.type);
    if (!['listening', 'reading', 'writing'].includes(sectionType)) {
      setError('Selected section must have type listening/reading/writing before saving as template.');
      return;
    }

    const templateName = templateNameDraft.trim() || section.name.trim();
    if (!templateName) {
      setError('Template name is required.');
      return;
    }

    const serialized = buildTemplateSectionPayload(section);
    if (!serialized.payload) {
      setError(serialized.error ?? 'Failed to serialize section payload.');
      return;
    }

    setTemplateActionLoading(true);
    setError(null);
    try {
      const response = await adminBuilderTemplateUpsert(accessToken, {
        product_id: IELTS_PRODUCT_ID,
        template_name: templateName,
        section_type: sectionType as 'listening' | 'reading' | 'writing',
        section_payload: serialized.payload,
        template_id: opts.templateId ?? null,
        source_snapshot_id: snapshots[0]?.id ?? null,
      });
      setTemplateNameDraft(response.template_name);
      setSelectedTemplateIdForVersion(response.template_id);
      await loadTemplates({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.');
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const handleInsertTemplate = async (templateVersionId: string) => {
    if (!accessToken || !builder || !templateVersionId) return;
    setTemplateActionLoading(true);
    setError(null);
    try {
      const payload = await adminBuilderTemplatePayload(accessToken, templateVersionId);
      applyTemplateToBuilder(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to insert template section.');
    } finally {
      setTemplateActionLoading(false);
    }
  };

  const setScaffoldQuestionTypeSlot = (scope: 'reading' | 'listening', index: number, nextType: string) => {
    const normalizedType = normalizeQuestionTemplateType(nextType);
    if (scope === 'reading') {
      setReadingQuestionTypeSlots((prev) => prev.map((value, i) => (i === index ? normalizedType : value)));
      return;
    }
    setListeningQuestionTypeSlots((prev) => prev.map((value, i) => (i === index ? normalizedType : value)));
  };

  const setAllScaffoldQuestionTypes = (scope: 'reading' | 'listening', nextType: string) => {
    const normalizedType = normalizeQuestionTemplateType(nextType);
    if (scope === 'reading') {
      setReadingQuestionTypeSlots(createQuestionTypeSlots(SCAFFOLD_QUESTION_SLOTS, normalizedType));
      return;
    }
    setListeningQuestionTypeSlots(createQuestionTypeSlots(SCAFFOLD_QUESTION_SLOTS, normalizedType));
  };

  const calculateListeningDurationSecondsFromSection = (section: AdminBuilderPayload['sections'][number]): number | null => {
    if (getSectionType(section) !== 'listening') return null;
    let total = 0;
    for (const part of section.parts) {
      for (const unit of part.content_units) {
        if (unit.type !== 'audio') continue;
        const unitId = unit.id ?? '';
        const draftData = unitId ? unitUi[unitId]?.dataText : '';
        let data = isObject(unit.data) ? unit.data : {};
        if (draftData) {
          const parsed = parseJsonObject(draftData);
          if (parsed.value) data = parsed.value;
        }
        const duration = readPositiveNumber((data as any).duration_seconds);
        if (duration) total += duration;
      }
    }
    return total > 0 ? Math.round(total) : null;
  };

  const syncListeningSectionDurationFromAudio = (sectionId: string) => {
    if (!builder || !sectionId) return;
    const section = builder.sections.find((candidate) => candidate.id === sectionId);
    if (!section || getSectionType(section) !== 'listening') return;
    const autoDurationSeconds = calculateListeningDurationSecondsFromSection(section);
    if (!autoDurationSeconds) return;

    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((candidate) => {
        if (candidate.id !== sectionId) return candidate;
        const metadata = isObject(candidate.metadata) ? { ...candidate.metadata } : {};
        (metadata as any).duration_seconds = autoDurationSeconds;
        return { ...candidate, metadata };
      }),
    }));
  };

  const addReadingScaffold = () => {
    if (!builder) return;
    const partCounts = parseTemplateCounts(readingTemplateParts, 3, [13, 13, 14]);
    setReadingTemplateParts(partCounts.join(','));

    let questionCounter = 1;
    const buildPart = (name: string, count: number) => {
      const partUnits: BuilderScaffoldUnit[] = [
        {
          id: newId(),
          type: 'instruction',
          data: { text: `Read ${name} instructions and answer Questions ${questionCounter}-${questionCounter + count - 1}.` },
          metadata: {},
          answer_key: null,
        },
        {
          id: newId(),
          type: 'reading_passage',
          data: { title: `${name} passage`, text: `Paste ${name} passage text here.` },
          metadata: {},
          answer_key: null,
        },
      ];
      for (let i = 0; i < count; i += 1) {
        const slotType = readingQuestionTypeSlots[questionCounter - 1] ?? DEFAULT_SCAFFOLD_QUESTION_TYPE;
        partUnits.push(buildScaffoldQuestionUnit(questionCounter, slotType));
        questionCounter += 1;
      }
      return {
        id: newId(),
        name,
        content_units: partUnits,
      };
    };

    const partNames = ['Passage 1', 'Passage 2', 'Passage 3'];
    const newSection = {
      id: newId(),
      name: 'Reading',
      metadata: { type: 'reading', duration_seconds: 3600 },
      parts: partCounts.map((count, index) => buildPart(partNames[index] ?? `Passage ${index + 1}`, count)),
    };

    upsertSectionForType('reading', newSection);
  };

  const addListeningScaffold = () => {
    if (!builder) return;
    const partCounts = parseTemplateCounts(listeningTemplateParts, 4, [10, 10, 10, 10]);
    setListeningTemplateParts(partCounts.join(','));

    let questionCounter = 1;
    const buildPart = (partIndex: number, count: number) => {
      const partName = `Part ${partIndex + 1}`;
      const units: BuilderScaffoldUnit[] = [
        {
          id: newId(),
          type: 'instruction',
          data: { text: `${partName}: Listen and answer Questions ${questionCounter}-${questionCounter + count - 1}.` },
          metadata: {},
          answer_key: null,
        },
        {
          id: newId(),
          type: 'audio',
          data: { play_once: true, auto_start: true, storage: { bucket: '', path: '' } },
          metadata: {},
          answer_key: null,
        },
      ];

      for (let i = 0; i < count; i += 1) {
        const slotType = listeningQuestionTypeSlots[questionCounter - 1] ?? DEFAULT_SCAFFOLD_QUESTION_TYPE;
        units.push(buildScaffoldQuestionUnit(questionCounter, slotType));
        questionCounter += 1;
      }

      return { id: newId(), name: partName, content_units: units };
    };

    const newSection = {
      id: newId(),
      name: 'Listening',
      metadata: { type: 'listening', duration_seconds: 2400 },
      parts: partCounts.map((count, index) => buildPart(index, count)),
    };

    upsertSectionForType('listening', newSection);
  };

  const addWritingScaffold = () => {
    if (!builder) return;
    const task1MinWords = Number(writingTemplateTask1MinWords) > 0 ? Math.floor(Number(writingTemplateTask1MinWords)) : 150;
    const task2MinWords = Number(writingTemplateTask2MinWords) > 0 ? Math.floor(Number(writingTemplateTask2MinWords)) : 250;
    setWritingTemplateTask1MinWords(String(task1MinWords));
    setWritingTemplateTask2MinWords(String(task2MinWords));
    const newSection = {
      id: newId(),
      name: 'Writing',
      metadata: { type: 'writing', duration_seconds: 3600 },
      parts: [
        {
          id: newId(),
          name: 'Task 1',
          content_units: [
            {
              id: newId(),
              type: 'instruction',
              data: { text: 'Write at least 150 words. Spend about 20 minutes on this task.' },
              metadata: {},
              answer_key: null,
            },
            {
              id: newId(),
              type: 'image',
              data: { storage: { bucket: '', path: '' }, alt: 'Task 1 chart', caption: 'Task 1 visual prompt' },
              metadata: {},
              answer_key: null,
            },
            {
              id: newId(),
              type: 'question_text',
              data: {
                prompt: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
                task_type: 'task1',
                min_words: task1MinWords,
                rows: 14,
                show_word_count: true,
              },
              metadata: {},
              answer_key: null,
            },
          ],
        },
        {
          id: newId(),
          name: 'Task 2',
          content_units: [
            {
              id: newId(),
              type: 'instruction',
              data: { text: 'Write at least 250 words. Spend about 40 minutes on this task.' },
              metadata: {},
              answer_key: null,
            },
            {
              id: newId(),
              type: 'question_text',
              data: {
                prompt: 'Discuss both views and give your own opinion.',
                task_type: 'task2',
                min_words: task2MinWords,
                rows: 18,
                show_word_count: true,
              },
              metadata: {},
              answer_key: null,
            },
          ],
        },
      ],
    };

    upsertSectionForType('writing', newSection);
  };

  const addPart = (sectionId: string) => {
    if (!builder) return;
    const partId = newId();
    const unitId = newId();
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const parts = [
          ...s.parts,
          {
            id: partId,
            name: `Part ${s.parts.length + 1}`,
            content_units: [
              {
                id: unitId,
                type: 'instruction',
                data: DEFAULT_UNIT_DATA.instruction,
                metadata: {},
                answer_key: null,
              },
            ],
          },
        ];
        return { ...s, parts };
      }),
    }));
    setUnitUi((prev) => ({
      ...prev,
      [unitId]: createUnitUi({ id: unitId, type: 'instruction', data: DEFAULT_UNIT_DATA.instruction, metadata: {}, answer_key: null }),
    }));
    setSelectedUnitId(unitId);
  };

  const addUnit = (partId: string, type = 'question_text') => {
    if (!builder) return;
    const unitId = newId();
    const unit = {
      id: unitId,
      type,
      data: DEFAULT_UNIT_DATA[type] ?? {},
      metadata: {},
      answer_key: null,
    };
    updateBuilder((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => ({
        ...s,
        parts: s.parts.map((p) => (p.id === partId ? { ...p, content_units: [...p.content_units, unit] } : p)),
      })),
    }));
    setUnitUi((prev) => ({ ...prev, [unitId]: createUnitUi(unit) }));
    setSelectedUnitId(unitId);
  };

  const removeSection = (sectionId: string) => {
    if (!builder) return;
    const section = builder.sections.find((s) => s.id === sectionId);
    if (!section) return;
    if (!window.confirm(`Delete section "${section.name}"? This cannot be undone.`)) return;

    const partIds = section.parts.map((p) => p.id ?? '').filter(Boolean);
    const unitIds = section.parts.flatMap((p) => p.content_units.map((u) => u.id ?? '')).filter(Boolean);

    setDeleted((prev) => ({
      section_ids: [...prev.section_ids, sectionId],
      part_ids: [...prev.part_ids, ...partIds],
      unit_ids: [...prev.unit_ids, ...unitIds],
    }));

    const nextSections = builder.sections.filter((s) => s.id !== sectionId);
    const nextPayload = { ...builder, sections: nextSections };
    setBuilder(nextPayload);
    markDirty();
    selectFirst(nextPayload);
  };

  const removePart = (sectionId: string, partId: string) => {
    if (!builder) return;
    const section = builder.sections.find((s) => s.id === sectionId);
    const part = section?.parts.find((p) => p.id === partId);
    if (!part) return;
    if (!window.confirm(`Delete part "${part.name}"? This cannot be undone.`)) return;

    const unitIds = part.content_units.map((u) => u.id ?? '').filter(Boolean);
    setDeleted((prev) => ({
      section_ids: prev.section_ids,
      part_ids: [...prev.part_ids, partId],
      unit_ids: [...prev.unit_ids, ...unitIds],
    }));

    const nextPayload = {
      ...builder,
      sections: builder.sections.map((s) =>
        s.id === sectionId ? { ...s, parts: s.parts.filter((p) => p.id !== partId) } : s,
      ),
    };
    setBuilder(nextPayload);
    markDirty();
    selectFirst(nextPayload);
  };

  const removeUnit = (partId: string, unitId: string) => {
    if (!builder) return;
    if (!window.confirm('Delete this unit? This cannot be undone.')) return;
    setDeleted((prev) => ({
      ...prev,
      unit_ids: [...prev.unit_ids, unitId],
    }));
    const nextPayload = {
      ...builder,
      sections: builder.sections.map((s) => ({
        ...s,
        parts: s.parts.map((p) =>
          p.id === partId ? { ...p, content_units: p.content_units.filter((u) => u.id !== unitId) } : p,
        ),
      })),
    };
    setBuilder(nextPayload);
    setUnitUi((prev) => {
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
    markDirty();
    selectFirst(nextPayload);
  };

  const setUnitDataText = (unitId: string, value: string) => {
    setUnitUi((prev) => ({ ...prev, [unitId]: { ...prev[unitId], dataText: value, dataError: undefined } }));
    markDirty();
  };

  const setUnitAnswerText = (unitId: string, value: string) => {
    setUnitUi((prev) => ({ ...prev, [unitId]: { ...prev[unitId], answerText: value, answerError: undefined } }));
    markDirty();
  };

  const setUnitDataObject = (
    unitId: string,
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setUnitUi((prev) => {
      const current = prev[unitId] ?? { dataText: '{}', answerText: '' };
      const parsed = parseJsonObject(current.dataText);
      const base = parsed.value ?? {};
      const nextObj = updater(base);
      return {
        ...prev,
        [unitId]: {
          ...current,
          dataText: JSON.stringify(nextObj, null, 2),
          dataError: undefined,
        },
      };
    });
    markDirty();
  };

  const setUnitAnswerObject = (
    unitId: string,
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    setUnitUi((prev) => {
      const current = prev[unitId] ?? { dataText: '{}', answerText: '' };
      const parsed = parseJsonObject(current.answerText);
      const base = parsed.value ?? {};
      const nextObj = updater(base);
      return {
        ...prev,
        [unitId]: {
          ...current,
          answerText: JSON.stringify(nextObj, null, 2),
          answerError: undefined,
        },
      };
    });
    markDirty();
  };

  const applyDataTemplate = (unitId: string, type: string) => {
    const template = DEFAULT_UNIT_DATA[type] ?? {};
    setUnitUi((prev) => ({ ...prev, [unitId]: { ...prev[unitId], dataText: toJson(template), dataError: undefined } }));
    markDirty();
  };

  const applyAnswerTemplate = (unitId: string, type: string) => {
    const template = ANSWER_KEY_TEMPLATES[type];
    if (!template) return;
    setUnitUi((prev) => ({ ...prev, [unitId]: { ...prev[unitId], answerText: toJson(template), answerError: undefined } }));
    markDirty();
  };

  const sectionScoreMeters = useMemo<SectionScoreMeter[]>(() => {
    if (!builder) return [];
    const meters: SectionScoreMeter[] = [];

    builder.sections.forEach((section, sectionIndex) => {
      const sectionId = section.id ?? `section-${sectionIndex + 1}`;
      const sectionType = getSectionType(section);
      const meter: SectionScoreMeter = {
        sectionId,
        sectionName: section.name || `Section ${sectionIndex + 1}`,
        sectionType,
        score: 0,
        target: sectionType === 'reading' || sectionType === 'listening' ? 40 : 0,
        missingAnswerUnitIds: [],
        emptyAnswerUnitIds: [],
        invalidAnswerUnitIds: [],
        missingMediaUnitIds: [],
        missingWritingPrompt: false,
      };

      let hasWritingPrompt = false;

      section.parts.forEach((part) => {
        part.content_units.forEach((unit) => {
          const unitId = unit.id ?? '';
          const unitType = String(unit.type ?? '');
          const ui = unitId ? unitUi[unitId] : undefined;

          const dataParsed = ui?.dataText ? parseJsonObject(ui.dataText) : { value: isObject(unit.data) ? unit.data : {} };
          const data = dataParsed.value ?? {};

          const answerParsed = ui?.answerText?.trim()
            ? parseJsonObject(ui.answerText)
            : { value: isObject(unit.answer_key?.correct) ? (unit.answer_key?.correct as Record<string, unknown>) : null };
          const answer = answerParsed.value;

          if (unitType === 'audio') {
            const media = getMediaReference(data);
            if (!media.url && (!media.bucket || !media.path)) meter.missingMediaUnitIds.push(unitId);
          } else if (unitType === 'image') {
            const media = getMediaReference(data);
            if (!media.url && (!media.bucket || !media.path)) meter.missingMediaUnitIds.push(unitId);
          } else if (unitType === 'question_diagram_labeling') {
            const media = getDiagramMediaReference(data);
            if (!media.url && (!media.bucket || !media.path)) meter.missingMediaUnitIds.push(unitId);
          }

          if (sectionType === 'writing' && unitType === 'question_text') hasWritingPrompt = true;
          if (!isQuestionUnitType(unitType)) return;

          if (!answer) {
            meter.missingAnswerUnitIds.push(unitId);
            return;
          }
          if (answerParsed.error) {
            meter.invalidAnswerUnitIds.push(unitId);
            return;
          }
          const maxScore = estimateUnitMaxScore(unitType, answer);
          meter.score += maxScore;
          if (maxScore <= 0) meter.emptyAnswerUnitIds.push(unitId);
        });
      });

      if (sectionType === 'writing') meter.missingWritingPrompt = !hasWritingPrompt;
      meters.push(meter);
    });

    return meters;
  }, [builder, unitUi]);

  const publishChecklist = useMemo<ChecklistIssue[]>(() => {
    if (!builder) return [];
    const issues: ChecklistIssue[] = [];
    const pushIssue = (issue: ChecklistIssue) => issues.push(issue);

    builder.sections.forEach((section, sectionIndex) => {
      const sectionId = section.id ?? `section-${sectionIndex + 1}`;
      const sectionLabel = section.name || `Section ${sectionIndex + 1}`;
      const sectionType = getSectionType(section);
      if (!section.name.trim()) {
        pushIssue({
          id: `section-name-${sectionId}`,
          message: `Section ${sectionIndex + 1} has no name.`,
          level: 'error',
          sectionId,
        });
      }
      if (!sectionType) {
        pushIssue({
          id: `section-type-${sectionId}`,
          message: `${sectionLabel} is missing section type.`,
          level: 'error',
          sectionId,
        });
      } else if (!SECTION_TYPES.some((candidate) => candidate.value === sectionType)) {
        pushIssue({
          id: `section-type-invalid-${sectionId}`,
          message: `${sectionLabel} has unsupported type "${sectionType}".`,
          level: 'error',
          sectionId,
        });
      }
      const durationSeconds = Number((section.metadata as any)?.duration_seconds ?? 0);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        pushIssue({
          id: `section-duration-${sectionId}`,
          message: `${sectionLabel} has no valid duration.`,
          level: 'error',
          sectionId,
        });
      }
      if (section.parts.length === 0) {
        pushIssue({
          id: `section-parts-${sectionId}`,
          message: `${sectionLabel} has no parts.`,
          level: 'error',
          sectionId,
        });
      }

      section.parts.forEach((part, partIndex) => {
        const partId = part.id ?? `${sectionId}-part-${partIndex + 1}`;
        const partLabel = part.name || `Part ${partIndex + 1}`;
        if (!part.name.trim()) {
          pushIssue({
            id: `part-name-${partId}`,
            message: `${sectionLabel} / Part ${partIndex + 1} has no name.`,
            level: 'error',
            sectionId,
            partId,
          });
        }
        if (part.content_units.length === 0) {
          pushIssue({
            id: `part-units-${partId}`,
            message: `${sectionLabel} / ${partLabel} has no units.`,
            level: 'error',
            sectionId,
            partId,
          });
        }

        part.content_units.forEach((unit, unitIndex) => {
          const unitId = unit.id ?? `${partId}-unit-${unitIndex + 1}`;
          const ui = unitId ? unitUi[unitId] : undefined;
          if (ui?.dataText?.trim()) {
            const parsed = parseJsonObject(ui.dataText);
            if (!parsed.value) {
              pushIssue({
                id: `unit-data-${unitId}`,
                message: `Unit ${unitId} has invalid data JSON.`,
                level: 'error',
                sectionId,
                partId,
                unitId,
              });
            }
          }
          if (ui?.answerText?.trim()) {
            const parsed = parseJsonObject(ui.answerText);
            if (!parsed.value) {
              pushIssue({
                id: `unit-answer-${unitId}`,
                message: `Unit ${unitId} has invalid answer key JSON.`,
                level: 'error',
                sectionId,
                partId,
                unitId,
              });
            }
          }
        });
      });

      const meter = sectionScoreMeters.find((entry) => entry.sectionId === sectionId);
      if (!meter) return;

      meter.missingMediaUnitIds.forEach((unitId) => {
        pushIssue({
          id: `media-${sectionId}-${unitId}`,
          message: `${sectionLabel}: Unit ${unitId} has no media attached.`,
          level: 'error',
          sectionId,
          unitId,
        });
      });

      if (sectionType === 'reading' || sectionType === 'listening') {
        meter.missingAnswerUnitIds.forEach((unitId) => {
          pushIssue({
            id: `missing-answer-${sectionId}-${unitId}`,
            message: `${sectionLabel}: Unit ${unitId} is missing answer key.`,
            level: 'error',
            sectionId,
            unitId,
          });
        });
        meter.emptyAnswerUnitIds.forEach((unitId) => {
          pushIssue({
            id: `empty-answer-${sectionId}-${unitId}`,
            message: `${sectionLabel}: Unit ${unitId} answer key has no scorable items.`,
            level: 'error',
            sectionId,
            unitId,
          });
        });
        meter.invalidAnswerUnitIds.forEach((unitId) => {
          pushIssue({
            id: `invalid-answer-${sectionId}-${unitId}`,
            message: `${sectionLabel}: Unit ${unitId} answer key JSON is invalid.`,
            level: 'error',
            sectionId,
            unitId,
          });
        });
        if (meter.target > 0 && meter.score !== meter.target) {
          pushIssue({
            id: `score-${sectionId}`,
            message: `${sectionLabel}: score is ${meter.score}/${meter.target}.`,
            level: 'error',
            sectionId,
          });
        }
      }

      if (sectionType === 'writing' && meter.missingWritingPrompt) {
        pushIssue({
          id: `writing-prompt-${sectionId}`,
          message: `${sectionLabel} has no Writing prompt (question_text unit).`,
          level: 'error',
          sectionId,
        });
      }
    });

    return issues;
  }, [builder, sectionScoreMeters, unitUi]);

  const compilePayload = (opts?: { quiet?: boolean }): AdminBuilderPayload | null => {
    if (!builder) return null;
    const errors: string[] = [];
    const warnings: string[] = [];
    const uiErrors: Record<string, UnitUiState> = { ...unitUi };
    const isPublishing = builder.experience.is_active !== false;

    const nextSections = builder.sections.map((section, sIdx) => {
      const sectionId = section.id || newId();
      if (!section.name.trim()) errors.push(`Section ${sIdx + 1} name is required.`);

      const sectionMetadata = isObject(section.metadata) ? { ...section.metadata } : {};
      const type = normalizeSectionType((sectionMetadata as any).type);
      if (!type) {
        warnings.push(`Section "${section.name || `#${sIdx + 1}`}" is missing a type (listening/reading/writing).`);
        if (isPublishing) errors.push(`Publishing blocked: section "${section.name || `#${sIdx + 1}`}" is missing a type.`);
      } else if (!SECTION_TYPES.some((t) => t.value === type)) {
        warnings.push(`Section "${section.name || `#${sIdx + 1}`}" has an unknown type "${type}".`);
        if (isPublishing) errors.push(`Publishing blocked: section "${section.name || `#${sIdx + 1}`}" has an unknown type.`);
      }

      const durationSeconds = Number((sectionMetadata as any).duration_seconds ?? 0);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        warnings.push(`Section "${section.name || `#${sIdx + 1}`}" has no duration set.`);
      }

      let sectionMaxScore = 0;
      let missingAnswerKeys = 0;
      let emptyAnswerKeys = 0;
      let questionUnits = 0;
      let hasWritingPrompt = false;

      const nextParts = section.parts.map((part, pIdx) => {
        const partId = part.id || newId();
        if (!part.name.trim()) errors.push(`Part ${pIdx + 1} in section ${sIdx + 1} needs a name.`);
        const nextUnits = part.content_units.map((unit, uIdx) => {
          const unitId = unit.id || newId();
          const ui = unitUi[unitId];
          let data: unknown = unit.data ?? {};
          if (ui && ui.dataText.trim().length > 0) {
            try {
              data = JSON.parse(ui.dataText);
              if (!isObject(data)) {
                errors.push(`Unit ${unitId} data must be a JSON object.`);
                uiErrors[unitId] = { ...ui, dataError: 'JSON must be an object' };
              }
            } catch (e) {
              errors.push(`Unit ${unitId} has invalid data JSON.`);
              uiErrors[unitId] = { ...ui, dataError: e instanceof Error ? e.message : 'Invalid JSON' };
            }
          }

          let answer_key: { correct: Record<string, unknown>; metadata?: Record<string, unknown> } | null = null;
          const answerText = ui?.answerText ?? '';
          if (answerText.trim().length > 0) {
            try {
              const parsed = JSON.parse(answerText);
              if (!isObject(parsed)) {
                errors.push(`Unit ${unitId} answer key must be a JSON object.`);
                uiErrors[unitId] = { ...uiErrors[unitId], answerError: 'JSON must be an object' };
              } else {
                answer_key = { correct: parsed };
              }
            } catch (e) {
              errors.push(`Unit ${unitId} has invalid answer key JSON.`);
              uiErrors[unitId] = { ...uiErrors[unitId], answerError: e instanceof Error ? e.message : 'Invalid JSON' };
            }
          }

          const unitType = String(unit.type ?? '');
          const normalizedData = isObject(data) ? data : {};
          const unitValidationIssues = validateUnitConfiguration(unitType, normalizedData, answer_key?.correct ?? null);
          if (unitValidationIssues.length > 0) {
            unitValidationIssues.forEach((issue) => {
              const message = `Unit ${unitId}: ${issue}`;
              warnings.push(message);
              if (isPublishing) errors.push(`Publishing blocked: ${message}`);
            });
          }

          if (unitType === 'audio') {
            const hasUrl = typeof (normalizedData as any).url === 'string' && String((normalizedData as any).url).trim().length > 0;
            const bucket = String((normalizedData as any)?.storage?.bucket ?? '').trim();
            const path = String((normalizedData as any)?.storage?.path ?? '').trim();
            if (!hasUrl && (!bucket || !path)) {
              const msg = `Audio unit ${unitId} is missing media reference (url or storage.bucket/storage.path).`;
              warnings.push(msg);
              if (isPublishing) errors.push(`Publishing blocked: ${msg}`);
            }
          }

          if (unitType === 'image') {
            const hasUrl = typeof (normalizedData as any).url === 'string' && String((normalizedData as any).url).trim().length > 0;
            const bucket = String((normalizedData as any)?.storage?.bucket ?? '').trim();
            const path = String((normalizedData as any)?.storage?.path ?? '').trim();
            if (!hasUrl && (!bucket || !path)) {
              const msg = `Image unit ${unitId} is missing media reference (url or storage.bucket/storage.path).`;
              warnings.push(msg);
              if (isPublishing) errors.push(`Publishing blocked: ${msg}`);
            }
          }

          if (unitType === 'question_diagram_labeling') {
            const image = isObject((normalizedData as any).image) ? (normalizedData as any).image : {};
            const hasUrl = typeof image.url === 'string' && String(image.url).trim().length > 0;
            const bucket = String(image?.storage?.bucket ?? '').trim();
            const path = String(image?.storage?.path ?? '').trim();
            if (!hasUrl && (!bucket || !path)) {
              const msg = `Diagram unit ${unitId} is missing image reference (image.url or image.storage.bucket/path).`;
              warnings.push(msg);
              if (isPublishing) errors.push(`Publishing blocked: ${msg}`);
            }
          }

          if (type === 'writing' && unitType === 'question_text') hasWritingPrompt = true;
          if (isQuestionUnitType(unitType)) {
            questionUnits += 1;
            if (!answer_key) {
              missingAnswerKeys += 1;
            } else {
              const max = estimateUnitMaxScore(unitType, answer_key.correct ?? null);
              sectionMaxScore += max;
              if (max <= 0) emptyAnswerKeys += 1;
            }
          }

          return {
            ...unit,
            id: unitId,
            display_order: uIdx + 1,
            data: normalizedData,
            answer_key,
          };
        });

        if (nextUnits.length === 0) errors.push(`Part ${pIdx + 1} in section ${sIdx + 1} has no units.`);

        return {
          ...part,
          id: partId,
          display_order: pIdx + 1,
          content_units: nextUnits,
        };
      });

      if (nextParts.length === 0) errors.push(`Section ${sIdx + 1} has no parts.`);

      if (type === 'reading' || type === 'listening') {
        if (questionUnits === 0) {
          warnings.push(`Section "${section.name || `#${sIdx + 1}`}" has no question units. Auto-scoring will be N/A.`);
        }
        if (missingAnswerKeys > 0) {
          const msg = `Section "${section.name || `#${sIdx + 1}`}" is missing answer keys for ${missingAnswerKeys} question unit(s).`;
          warnings.push(msg);
          if (isPublishing) errors.push(`Publishing blocked: ${msg}`);
        }
        if (emptyAnswerKeys > 0) {
          const msg = `Section "${section.name || `#${sIdx + 1}`}" has ${emptyAnswerKeys} answer key(s) that do not define any scorable items.`;
          warnings.push(msg);
          if (isPublishing) errors.push(`Publishing blocked: ${msg}`);
        }
        if (sectionMaxScore !== 40) {
          const msg = `Section "${section.name || `#${sIdx + 1}`}" max score is ${sectionMaxScore}. IELTS ${type} requires 40 for real band conversion.`;
          warnings.push(msg);
          if (isPublishing) errors.push(`Publishing blocked: ${msg}`);
        }
      }

      if (type === 'writing' && !hasWritingPrompt) {
        warnings.push(`Section "${section.name || `#${sIdx + 1}`}" has no Writing prompt (question_text unit).`);
        if (isPublishing) errors.push(`Publishing blocked: section "${section.name || `#${sIdx + 1}`}" has no Writing prompt.`);
      }

      return {
        ...section,
        id: sectionId,
        display_order: sIdx + 1,
        metadata: sectionMetadata,
        parts: nextParts,
      };
    });

    if (nextSections.length === 0) {
      errors.push('Add at least one section before saving.');
    }

    const dedupedWarnings = Array.from(new Set(warnings));
    setWarnings(dedupedWarnings);

    if (errors.length > 0) {
      if (!opts?.quiet) {
        setUnitUi(uiErrors);
        setError(errors[0]);
      }
      return null;
    }

    return {
      ...builder,
      sections: nextSections,
      deleted,
    };
  };

  const saveBuilder = async (mode: 'manual' | 'auto' = 'manual'): Promise<string | null> => {
    if (!builder) return null;
    if (mode === 'auto' && (saving || autoSaving || loading)) return builder.experience.id ?? selectedExperienceId ?? null;

    if (mode === 'manual') {
      setSaving(true);
      setError(null);
      setAutoSaveError(null);
    } else {
      setAutoSaving(true);
      setAutoSaveError(null);
    }

    const payload = compilePayload({ quiet: mode === 'auto' });
    if (!payload) {
      if (mode === 'manual') setSaving(false);
      else setAutoSaving(false);
      return null;
    }

    const resolveTokenForSave = async (): Promise<string | null> => {
      const fromHook = String(accessToken ?? '').trim();
      try {
        const { data } = await supabase.auth.getSession();
        const live = String(data.session?.access_token ?? '').trim();
        return live || fromHook || null;
      } catch {
        return fromHook || null;
      }
    };

    try {
      let tokenForSave = await resolveTokenForSave();
      logAuthDebug('saveBuilder.start', {
        mode,
        experienceId: payload.experience.id ?? selectedExperienceId ?? null,
        token: summarizeJwt(tokenForSave),
      });
      if (!tokenForSave) {
        if (mode === 'manual') {
          setError('Session not available. Please sign in again.');
        } else {
          setAutoSaveError('Autosave paused: session is missing. Sign in again.');
        }
        return null;
      }

      let res: Awaited<ReturnType<typeof adminBuilderSave>>;
      try {
        res = await adminBuilderSave(tokenForSave, payload);
      } catch (firstError) {
        const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
        logAuthDebug('saveBuilder.first-failure', {
          mode,
          message: firstMessage,
          token: summarizeJwt(tokenForSave),
        });
        const canRetryAuth = firstMessage.includes('(401)') || firstMessage.toLowerCase().includes('invalid jwt');
        if (!canRetryAuth) throw firstError;

        const fallbackToken = await resolveTokenForSave();
        logAuthDebug('saveBuilder.retry-token', {
          mode,
          fallbackToken: summarizeJwt(fallbackToken),
        });
        tokenForSave = fallbackToken || '';
        if (!tokenForSave) throw firstError;
        res = await adminBuilderSave(tokenForSave, payload);
      }
      setDirty(false);
      const updatedId = res.experience_id;

      clearDraftFromStorage(getDraftStorageKey(payload.experience.id ?? selectedExperienceId));
      clearDraftFromStorage(getDraftStorageKey(updatedId));
      setPendingDraft(null);
      setAutoSavedAt(null);

      const saveTimestamp = new Date().toISOString();
      if (mode === 'auto') setServerAutoSavedAt(saveTimestamp);

      setBuilder((prev) =>
        prev
          ? {
              ...prev,
              experience: {
                ...prev.experience,
                id: updatedId,
                version: res.version,
              },
            }
          : prev,
      );

      if (!selectedExperienceId || selectedExperienceId !== updatedId) {
        setSelectedExperienceId(updatedId);
        syncQuery(updatedId);
      }

      if (mode === 'manual') {
        await loadSnapshots(updatedId, { silent: true });
        const listRes = await adminTestsList(tokenForSave, IELTS_PRODUCT_ID);
        setTests(listRes.experiences ?? []);
      }

      return updatedId;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      logAuthDebug('saveBuilder.failed', {
        mode,
        message,
        selectedExperienceId,
        hookToken: summarizeJwt(accessToken),
      });
      if (mode === 'manual') {
        if (message.includes('auth_get_user_failed') || message.includes('role_lookup_failed')) {
          setError('Builder auth check failed (backend 401). Your token is valid for other APIs, but admin-builder rejected it. Redeploy the admin-builder function and retry.');
        } else if (message.includes('(401)') || message.toLowerCase().includes('invalid jwt')) {
          setError('Session expired (401 Invalid JWT). Please sign in again, then retry save.');
        } else if (message.includes('(409)')) {
          setError('Version conflict: another admin saved this test first. Reload the builder and apply your changes again.');
        } else if (message.includes('(422)')) {
          setError('Publish checks failed. Fix section type/duration, answer keys, and media links, then save again.');
        } else {
          setError(message);
        }
      } else if (message.includes('(401)') || message.toLowerCase().includes('invalid jwt')) {
        setAutoSaveError('Autosave paused: session expired (401 Invalid JWT). Sign in again.');
      } else if (message.includes('(422)')) {
        setAutoSaveError('Autosave paused by publish checks (422). Fix blockers or set test inactive while editing.');
      } else if (message.includes('(409)')) {
        setAutoSaveError('Autosave paused by version conflict (409). Reload selected test.');
      } else {
        setAutoSaveError('Autosave failed. You can still save manually.');
      }
      return null;
    } finally {
      if (mode === 'manual') setSaving(false);
      else setAutoSaving(false);
    }
  };

  const handleSave = async () => {
    await saveBuilder('manual');
  };

  const handlePreview = async () => {
    if (!builder) return;
    const currentId = builder.experience.id ?? selectedExperienceId;
    const needsSave = dirty || !currentId;
    const savedId = needsSave ? await saveBuilder('manual') : currentId;
    if (!savedId) return;
    if (typeof window !== 'undefined') {
      window.open(`/admin/test/${savedId}`, '_blank', 'noopener,noreferrer');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!builder || !dirty) return;
    if (saving || autoSaving || loading) return;
    const timer = window.setTimeout(() => {
      void saveBuilder('auto');
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [autoSaving, builder, dirty, loading, saving, selectedExperienceId, saveBuilder]);

  const handleRollback = async (snapshot: AdminBuilderSnapshot) => {
    if (!accessToken || !snapshot?.id) return;
    if (!window.confirm(`Rollback to version ${snapshot.version}? This creates a new snapshot.`)) return;

    setRollingBackSnapshotId(snapshot.id);
    setError(null);
    try {
      const result = await adminBuilderRollback(accessToken, snapshot.id);
      const experienceId = String(result.experience_id ?? selectedExperienceId);
      if (!experienceId) throw new Error('Rollback did not return an experience id.');

      const reload = await adminBuilderLoad(accessToken, experienceId);
      setBuilder(reload.payload);
      setDeleted({ section_ids: [], part_ids: [], unit_ids: [] });
      hydrateUnitUi(reload.payload);
      selectFirst(reload.payload);
      setDirty(false);
      clearDraftFromStorage(getDraftStorageKey(experienceId));
      setPendingDraft(null);
      setAutoSavedAt(null);
      setServerAutoSavedAt(null);
      setAutoSaveError(null);

      if (selectedExperienceId !== experienceId) {
        setSelectedExperienceId(experienceId);
        syncQuery(experienceId);
      }

      await loadSnapshots(experienceId);
      const listRes = await adminTestsList(accessToken, IELTS_PRODUCT_ID);
      setTests(listRes.experiences ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setRollingBackSnapshotId(null);
    }
  };

  const openAssetPicker = (unitId: string, kind: 'audio' | 'image') => {
    setAssetModal({ open: true, unitId, kind });
    setAssetSearch('');
  };

  const closeAssetPicker = () => {
    setAssetModal(null);
    setAssets([]);
    setAssetSearch('');
    setAssetUploadFile(null);
    setAssetUploadProgress(0);
    setAssetUploadError(null);
  };

  useEffect(() => {
    if (!accessToken || !assetModal?.open) return;
    const loadAssets = async () => {
      setAssetLoading(true);
      try {
        const res = await adminAssetsList(accessToken, {
          kind: assetModal.kind,
          q: assetSearch.trim() ? assetSearch.trim() : undefined,
          limit: 60,
          signed: true,
        });
        setAssets(res.assets ?? []);
      } catch {
        setAssets([]);
      } finally {
        setAssetLoading(false);
      }
    };
    void loadAssets();
  }, [accessToken, assetModal?.open, assetModal?.kind, assetSearch]);

  const handleAssetUpload = async () => {
    if (!accessToken || !assetModal || !assetUploadFile) return;
    setAssetUploading(true);
    setAssetUploadError(null);
    setAssetUploadProgress(0);
    try {
      const durationSeconds =
        assetModal.kind === 'audio' ? await detectAudioDurationSeconds(assetUploadFile).then((value) => value ?? undefined) : undefined;
      await adminUploadAsset(accessToken, assetUploadFile, {
        kind: assetModal.kind,
        durationSeconds,
        retries: 3,
        onProgress: (percent) => setAssetUploadProgress(percent),
      });
      setAssetUploadFile(null);
      setAssetUploadProgress(100);
      const refreshed = await adminAssetsList(accessToken, {
        kind: assetModal.kind,
        q: assetSearch.trim() ? assetSearch.trim() : undefined,
        limit: 60,
        signed: true,
      });
      setAssets(refreshed.assets ?? []);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setAssetUploadError(message);
      setError(message);
      setAssetUploadProgress(0);
    } finally {
      setAssetUploading(false);
    }
  };

  const applyAssetToUnit = (unitId: string, asset: AdminAssetRow) => {
    if (!builder) return;
    const assetDurationSeconds = assetModal?.kind === 'audio' ? readAssetAudioDurationSeconds(asset) : null;
    updateBuilder((prev) => {
      let touchedSectionIndex = -1;
      const nextSections = prev.sections.map((section, sectionIndex) => {
        let sectionTouched = false;
        const nextParts = section.parts.map((part) => ({
          ...part,
          content_units: part.content_units.map((unit) => {
            if (unit.id !== unitId) return unit;
            sectionTouched = true;
            if (assetModal?.kind === 'audio' && unit.type === 'audio') {
              const data = isObject(unit.data) ? { ...unit.data } : {};
              delete (data as any).url;
              (data as any).storage = { bucket: asset.bucket, path: asset.path };
              if (assetDurationSeconds) (data as any).duration_seconds = assetDurationSeconds;
              return { ...unit, data };
            }
            if (assetModal?.kind === 'image') {
              if (unit.type === 'image') {
                const data = isObject(unit.data) ? { ...unit.data } : {};
                delete (data as any).url;
                (data as any).storage = { bucket: asset.bucket, path: asset.path };
                return { ...unit, data };
              }
              if (unit.type === 'question_diagram_labeling') {
                const data = isObject(unit.data) ? { ...unit.data } : {};
                const img = isObject((data as any).image) ? { ...(data as any).image } : {};
                delete (img as any).url;
                (img as any).storage = { bucket: asset.bucket, path: asset.path };
                (data as any).image = img;
                return { ...unit, data };
              }
            }
            return unit;
          }),
        }));
        if (sectionTouched) touchedSectionIndex = sectionIndex;
        return sectionTouched ? { ...section, parts: nextParts } : section;
      });

      const sectionsWithDurationSync = nextSections.map((section, sectionIndex) => {
        if (sectionIndex !== touchedSectionIndex) return section;
        if (assetModal?.kind !== 'audio' || getSectionType(section) !== 'listening') return section;
        const autoDurationSeconds = calculateListeningDurationSecondsFromSectionData(section);
        if (!autoDurationSeconds) return section;
        const metadata = isObject(section.metadata) ? { ...section.metadata } : {};
        (metadata as any).duration_seconds = autoDurationSeconds;
        return { ...section, metadata };
      });

      return { ...prev, sections: sectionsWithDurationSync };
    });

    setUnitUi((prev) => {
      const next = { ...prev };
      const current = next[unitId];
      if (!current) return prev;
      try {
        const parsed = JSON.parse(current.dataText);
        if (!isObject(parsed)) return prev;
        if (assetModal?.kind === 'audio') {
          delete (parsed as any).url;
          (parsed as any).storage = { bucket: asset.bucket, path: asset.path };
          if (assetDurationSeconds) (parsed as any).duration_seconds = assetDurationSeconds;
        }
        if (assetModal?.kind === 'image') {
          if (currentSelection?.unit.type === 'image') {
            delete (parsed as any).url;
            (parsed as any).storage = { bucket: asset.bucket, path: asset.path };
          }
          if (currentSelection?.unit.type === 'question_diagram_labeling') {
            const img = isObject((parsed as any).image) ? { ...(parsed as any).image } : {};
            delete (img as any).url;
            (img as any).storage = { bucket: asset.bucket, path: asset.path };
            (parsed as any).image = img;
          }
        }
        next[unitId] = { ...current, dataText: JSON.stringify(parsed, null, 2) };
        return next;
      } catch {
        return prev;
      }
    });

    closeAssetPicker();
  };

  const getCurrentUnitId = (): string => String(currentSelection?.unit.id ?? '');

  const updateCurrentDataField = (key: string, value: unknown) => {
    const unitId = getCurrentUnitId();
    if (!unitId) return;
    setUnitDataObject(unitId, (current) => ({ ...current, [key]: value }));
  };

  const updateCurrentAnswerField = (key: string, value: unknown) => {
    const unitId = getCurrentUnitId();
    if (!unitId) return;
    setUnitAnswerObject(unitId, (current) => ({ ...current, [key]: value }));
  };

  const updateCurrentAnswerMapEntry = (rootKey: string, itemId: string, value: unknown) => {
    const unitId = getCurrentUnitId();
    if (!unitId) return;
    setUnitAnswerObject(unitId, (current) => {
      const root = isObject(current[rootKey]) ? { ...(current[rootKey] as Record<string, unknown>) } : {};
      if (value === '' || value == null) {
        delete root[itemId];
      } else {
        root[itemId] = value;
      }
      return { ...current, [rootKey]: root };
    });
  };

  const readIdLabelRows = (
    value: unknown,
    labelField: 'label' | 'text' | 'prompt' | 'placeholder' = 'label',
  ): Array<{ id: string; value: string }> =>
    toObjectRecordArray(value).map((entry, index) => ({
      id: readString((entry as any).id) || String(index + 1),
      value: readString((entry as any)[labelField]),
    }));

  const renderIdLabelEditor = (
    opts: {
      title: string;
      field: string;
      rows: Array<{ id: string; value: string }>;
      valueKey?: 'label' | 'text' | 'prompt' | 'placeholder';
      addLabel: string;
      idPlaceholder?: string;
      valuePlaceholder?: string;
    },
  ) => {
    const valueKey = opts.valueKey ?? 'label';
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-500">{opts.title}</div>
        {opts.rows.map((row, index) => (
          <div key={`${opts.field}-${row.id}-${index}`} className="grid grid-cols-[140px_1fr_auto] gap-2">
            <input
              value={row.id}
              onChange={(event) => {
                const next = [...opts.rows];
                next[index] = { ...row, id: event.target.value };
                updateCurrentDataField(
                  opts.field,
                  next.map((item) => ({ id: item.id, [valueKey]: item.value })),
                );
              }}
              placeholder={opts.idPlaceholder ?? 'ID'}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <input
              value={row.value}
              onChange={(event) => {
                const next = [...opts.rows];
                next[index] = { ...row, value: event.target.value };
                updateCurrentDataField(
                  opts.field,
                  next.map((item) => ({ id: item.id, [valueKey]: item.value })),
                );
              }}
              placeholder={opts.valuePlaceholder ?? 'Label'}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <button
              type="button"
              className="px-2 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50"
              onClick={() => {
                const next = opts.rows.filter((_, itemIndex) => itemIndex !== index);
                updateCurrentDataField(
                  opts.field,
                  next.map((item) => ({ id: item.id, [valueKey]: item.value })),
                );
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-gray-200 text-xs font-semibold hover:bg-gray-50"
          onClick={() => {
            const next = [...opts.rows, { id: String(opts.rows.length + 1), value: '' }];
            updateCurrentDataField(
              opts.field,
              next.map((item) => ({ id: item.id, [valueKey]: item.value })),
            );
          }}
        >
          {opts.addLabel}
        </button>
      </div>
    );
  };

  const renderSimpleUnitEditor = () => {
    if (!currentSelection || !currentUnitDataObject) return null;
    const unitType = String(currentSelection.unit.type ?? '');
    const data = currentUnitDataObject;
    const answer = currentUnitAnswerObject ?? {};
    const currentUnitId = getCurrentUnitId();

    if (unitType === 'instruction') {
      return (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500">Instruction text</label>
          <textarea
            rows={5}
            value={readString(data.text)}
            onChange={(event) => updateCurrentDataField('text', event.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      );
    }

    if (unitType === 'reading_passage') {
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Passage title</label>
            <input
              value={readString(data.title)}
              onChange={(event) => updateCurrentDataField('title', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Passage text</label>
            <textarea
              rows={10}
              value={readString(data.text)}
              onChange={(event) => updateCurrentDataField('text', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      );
    }

    if (unitType === 'audio') {
      const media = getMediaReference(data);
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            {media.url ? (
              <div className="text-gray-700">Attached URL: {media.url}</div>
            ) : media.bucket && media.path ? (
              <div className="text-gray-700">Attached file: {media.bucket}/{media.path}</div>
            ) : (
              <div className="text-gray-500">No audio file attached yet.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
              onClick={() => openAssetPicker(currentUnitId, 'audio')}
            >
              Select or upload audio
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={readBoolean(data.play_once, true)}
                onChange={(event) => updateCurrentDataField('play_once', event.target.checked)}
              />
              Play once
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={readBoolean(data.auto_start, true)}
                onChange={(event) => updateCurrentDataField('auto_start', event.target.checked)}
              />
              Auto start
            </label>
            <label className="text-sm text-gray-600 space-y-1">
              <span className="block text-xs font-semibold text-gray-500">Duration seconds</span>
              <input
                type="number"
                min={0}
                step={1}
                value={readNumber(data.duration_seconds) ?? ''}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  const parsed = next ? Number(next) : null;
                  updateCurrentDataField(
                    'duration_seconds',
                    parsed && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null,
                  );
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g. 420"
              />
            </label>
          </div>
        </div>
      );
    }

    if (unitType === 'image') {
      const media = getMediaReference(data);
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            {media.url ? (
              <div className="text-gray-700">Attached URL: {media.url}</div>
            ) : media.bucket && media.path ? (
              <div className="text-gray-700">Attached file: {media.bucket}/{media.path}</div>
            ) : (
              <div className="text-gray-500">No image attached yet.</div>
            )}
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
            onClick={() => openAssetPicker(currentUnitId, 'image')}
          >
            Select or upload image
          </button>
          <div>
            <label className="text-xs font-semibold text-gray-500">Alt text</label>
            <input
              value={readString(data.alt)}
              onChange={(event) => updateCurrentDataField('alt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Caption</label>
            <input
              value={readString(data.caption)}
              onChange={(event) => updateCurrentDataField('caption', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      );
    }

    if (unitType === 'question_text') {
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={6}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">Task type</label>
              <input
                value={readString(data.task_type)}
                onChange={(event) => updateCurrentDataField('task_type', event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="task1 / task2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Min words</label>
              <input
                type="number"
                min={0}
                value={readNumber(data.min_words, 0) ?? 0}
                onChange={(event) => updateCurrentDataField('min_words', Number(event.target.value || 0))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Rows</label>
              <input
                type="number"
                min={2}
                value={readNumber(data.rows, 8) ?? 8}
                onChange={(event) => updateCurrentDataField('rows', Number(event.target.value || 8))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={readBoolean(data.show_word_count, true)}
              onChange={(event) => updateCurrentDataField('show_word_count', event.target.checked)}
            />
            Show word counter
          </label>
        </div>
      );
    }

    if (unitType === 'question_single_choice' || unitType === 'question_multi_choice') {
      const options = readIdLabelRows(data.options, 'label');
      const selectedOption = readString((answer as any).option_id);
      const selectedOptions = Array.isArray((answer as any).option_ids)
        ? (answer as any).option_ids.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={4}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {renderIdLabelEditor({
            title: 'Options',
            field: 'options',
            rows: options,
            valueKey: 'label',
            addLabel: 'Add option',
            idPlaceholder: 'A',
            valuePlaceholder: 'Option label',
          })}
          {unitType === 'question_multi_choice' ? (
            <div>
              <label className="text-xs font-semibold text-gray-500">Max selections</label>
              <input
                type="number"
                min={1}
                value={readNumber(data.max_select, 2) ?? 2}
                onChange={(event) => updateCurrentDataField('max_select', Number(event.target.value || 1))}
                className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {unitType === 'question_single_choice' ? (
              <select
                value={selectedOption}
                onChange={(event) => updateCurrentAnswerField('option_id', event.target.value)}
                className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select correct option</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.id} - {option.value || '(untitled option)'}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                {options.map((option) => (
                  <label key={option.id} className="inline-flex items-center gap-2 text-sm text-gray-700 mr-4">
                    <input
                      type="checkbox"
                      checked={selectedOptions.includes(option.id)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? Array.from(new Set([...selectedOptions, option.id]))
                          : selectedOptions.filter((item: string) => item !== option.id);
                        updateCurrentAnswerField('option_ids', next);
                      }}
                    />
                    {option.id} - {option.value || '(untitled option)'}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (
      unitType === 'question_matching' ||
      unitType === 'question_matching_headings' ||
      unitType === 'question_sentence_endings'
    ) {
      const items = readIdLabelRows(data.items, 'label');
      const options = readIdLabelRows(data.options, 'label');
      const matches = isObject((answer as any).matches) ? ((answer as any).matches as Record<string, unknown>) : {};
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={4}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {renderIdLabelEditor({
            title: 'Items',
            field: 'items',
            rows: items,
            valueKey: 'label',
            addLabel: 'Add item',
            idPlaceholder: '1',
            valuePlaceholder: 'Item',
          })}
          {renderIdLabelEditor({
            title: 'Options',
            field: 'options',
            rows: options,
            valueKey: 'label',
            addLabel: 'Add option',
            idPlaceholder: 'A',
            valuePlaceholder: 'Option',
          })}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {items.map((item) => (
              <div key={`match-${item.id}`} className="grid grid-cols-[180px_1fr] gap-2">
                <div className="text-sm text-gray-700">{item.id}</div>
                <select
                  value={readString(matches[item.id])}
                  onChange={(event) => updateCurrentAnswerMapEntry('matches', item.id, event.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select option</option>
                  {options.map((option) => (
                    <option key={`${item.id}-${option.id}`} value={option.id}>
                      {option.id} - {option.value || '(untitled option)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (unitType === 'question_true_false_not_given' || unitType === 'question_yes_no_not_given') {
      const statements = readIdLabelRows(data.statements, 'text');
      const matches = isObject((answer as any).matches) ? ((answer as any).matches as Record<string, unknown>) : {};
      const options = unitType === 'question_true_false_not_given' ? ['T', 'F', 'NG'] : ['Y', 'N', 'NG'];
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={4}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {renderIdLabelEditor({
            title: 'Statements',
            field: 'statements',
            rows: statements,
            valueKey: 'text',
            addLabel: 'Add statement',
            idPlaceholder: '1',
            valuePlaceholder: 'Statement',
          })}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {statements.map((statement) => (
              <div key={`statement-${statement.id}`} className="grid grid-cols-[180px_1fr] gap-2">
                <div className="text-sm text-gray-700">{statement.id}</div>
                <select
                  value={readString(matches[statement.id])}
                  onChange={(event) => updateCurrentAnswerMapEntry('matches', statement.id, event.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select answer</option>
                  {options.map((option) => (
                    <option key={`${statement.id}-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (unitType === 'question_gap_fill' || unitType === 'question_select_from_list') {
      const blanks = readIdLabelRows(data.blanks, 'placeholder');
      const options = readIdLabelRows(data.options, 'label');
      const blanksAnswer = isObject((answer as any).blanks) ? ((answer as any).blanks as Record<string, unknown>) : {};
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={3}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Text with placeholders</label>
            <textarea
              rows={5}
              value={readString(data.text)}
              onChange={(event) => updateCurrentDataField('text', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Use placeholders like {{1}}"
            />
          </div>
          {renderIdLabelEditor({
            title: 'Blanks',
            field: 'blanks',
            rows: blanks,
            valueKey: 'placeholder',
            addLabel: 'Add blank',
            idPlaceholder: '1',
            valuePlaceholder: 'Q1',
          })}
          {unitType === 'question_select_from_list'
            ? renderIdLabelEditor({
                title: 'Options',
                field: 'options',
                rows: options,
                valueKey: 'label',
                addLabel: 'Add option',
                idPlaceholder: 'A',
                valuePlaceholder: 'Option',
              })
            : null}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {blanks.map((blank) => (
              <div key={`blank-answer-${blank.id}`} className="grid grid-cols-[180px_1fr] gap-2">
                <div className="text-sm text-gray-700">{blank.id}</div>
                <input
                  value={
                    Array.isArray(blanksAnswer[blank.id])
                      ? (blanksAnswer[blank.id] as unknown[]).filter((item): item is string => typeof item === 'string').join(', ')
                      : ''
                  }
                  onChange={(event) => {
                    const answers = event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean);
                    updateCurrentAnswerMapEntry('blanks', blank.id, answers);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={unitType === 'question_select_from_list' ? 'A, B' : 'word one, word two'}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (unitType === 'question_table_completion') {
      const columns = Array.isArray(data.columns)
        ? (data.columns as unknown[]).filter((item): item is string => typeof item === 'string')
        : ['Column A', 'Column B'];
      const rowObjects = Array.isArray(data.rows) ? (data.rows as unknown[]) : [];
      const rows = rowObjects.map((row, index) => {
        const cells = Array.isArray(row) ? row : [];
        const textCell = cells.find((cell) => isObject(cell) && typeof (cell as any).text === 'string') as
          | Record<string, unknown>
          | undefined;
        const blankCell = cells.find((cell) => isObject(cell) && typeof (cell as any).blank_id === 'string') as
          | Record<string, unknown>
          | undefined;
        return {
          text: readString((textCell as any)?.text) || `Row ${index + 1}`,
          blankId: readString((blankCell as any)?.blank_id) || String(index + 1),
          placeholder: readString((blankCell as any)?.placeholder) || `Q${index + 1}`,
        };
      });
      const cellAnswers = isObject((answer as any).cells) ? ((answer as any).cells as Record<string, unknown>) : {};

      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={3}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Columns (comma-separated)</label>
            <input
              value={columns.join(', ')}
              onChange={(event) => {
                const nextColumns = event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean);
                updateCurrentDataField('columns', nextColumns.length > 0 ? nextColumns : ['Column A', 'Column B']);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Rows</div>
            {rows.map((row, rowIndex) => (
              <div key={`table-row-${rowIndex}`} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_auto] gap-2">
                <input
                  value={row.text}
                  onChange={(event) => {
                    const next = [...rows];
                    next[rowIndex] = { ...row, text: event.target.value };
                    updateCurrentDataField(
                      'rows',
                      next.map((entry) => [
                        { text: entry.text },
                        { blank_id: entry.blankId, placeholder: entry.placeholder },
                      ]),
                    );
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder="Row text"
                />
                <input
                  value={row.blankId}
                  onChange={(event) => {
                    const next = [...rows];
                    next[rowIndex] = { ...row, blankId: event.target.value };
                    updateCurrentDataField(
                      'rows',
                      next.map((entry) => [
                        { text: entry.text },
                        { blank_id: entry.blankId, placeholder: entry.placeholder },
                      ]),
                    );
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder="blank id"
                />
                <input
                  value={row.placeholder}
                  onChange={(event) => {
                    const next = [...rows];
                    next[rowIndex] = { ...row, placeholder: event.target.value };
                    updateCurrentDataField(
                      'rows',
                      next.map((entry) => [
                        { text: entry.text },
                        { blank_id: entry.blankId, placeholder: entry.placeholder },
                      ]),
                    );
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                  placeholder="placeholder"
                />
                <button
                  type="button"
                  className="px-2 py-1 border border-gray-200 rounded text-xs hover:bg-gray-50"
                  onClick={() => {
                    const next = rows.filter((_, index) => index !== rowIndex);
                    updateCurrentDataField(
                      'rows',
                      next.map((entry) => [
                        { text: entry.text },
                        { blank_id: entry.blankId, placeholder: entry.placeholder },
                      ]),
                    );
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-gray-200 text-xs font-semibold hover:bg-gray-50"
              onClick={() => {
                const next = [...rows, { text: `Row ${rows.length + 1}`, blankId: String(rows.length + 1), placeholder: `Q${rows.length + 1}` }];
                updateCurrentDataField(
                  'rows',
                  next.map((entry) => [
                    { text: entry.text },
                    { blank_id: entry.blankId, placeholder: entry.placeholder },
                  ]),
                );
              }}
            >
              Add row
            </button>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {rows.map((row) => (
              <div key={`cell-answer-${row.blankId}`} className="grid grid-cols-[180px_1fr] gap-2">
                <div className="text-sm text-gray-700">{row.blankId}</div>
                <input
                  value={
                    Array.isArray(cellAnswers[row.blankId])
                      ? (cellAnswers[row.blankId] as unknown[]).filter((item): item is string => typeof item === 'string').join(', ')
                      : ''
                  }
                  onChange={(event) => {
                    const answers = event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean);
                    updateCurrentAnswerMapEntry('cells', row.blankId, answers);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="answer one, answer two"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (unitType === 'question_diagram_labeling') {
      const media = getDiagramMediaReference(data);
      const labels = readIdLabelRows(data.labels, 'prompt');
      const labelAnswers = isObject((answer as any).labels) ? ((answer as any).labels as Record<string, unknown>) : {};
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={3}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            {media.url ? (
              <div className="text-gray-700">Attached URL: {media.url}</div>
            ) : media.bucket && media.path ? (
              <div className="text-gray-700">Attached file: {media.bucket}/{media.path}</div>
            ) : (
              <div className="text-gray-500">No diagram image attached yet.</div>
            )}
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
            onClick={() => openAssetPicker(currentUnitId, 'image')}
          >
            Select or upload diagram image
          </button>
          {renderIdLabelEditor({
            title: 'Labels',
            field: 'labels',
            rows: labels,
            valueKey: 'prompt',
            addLabel: 'Add label',
            idPlaceholder: '1',
            valuePlaceholder: 'Label prompt',
          })}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {labels.map((label) => (
              <div key={`label-answer-${label.id}`} className="grid grid-cols-[180px_1fr] gap-2">
                <div className="text-sm text-gray-700">{label.id}</div>
                <input
                  value={
                    Array.isArray(labelAnswers[label.id])
                      ? (labelAnswers[label.id] as unknown[]).filter((item): item is string => typeof item === 'string').join(', ')
                      : ''
                  }
                  onChange={(event) => {
                    const answers = event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean);
                    updateCurrentAnswerMapEntry('labels', label.id, answers);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="label one, label two"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (unitType === 'question_drag_drop') {
      const items = readIdLabelRows(data.items, 'label');
      const targets = readIdLabelRows(data.targets, 'label');
      const targetAnswers = isObject((answer as any).targets) ? ((answer as any).targets as Record<string, unknown>) : {};
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500">Prompt</label>
            <textarea
              rows={3}
              value={readString(data.prompt)}
              onChange={(event) => updateCurrentDataField('prompt', event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {renderIdLabelEditor({
            title: 'Items',
            field: 'items',
            rows: items,
            valueKey: 'label',
            addLabel: 'Add item',
            idPlaceholder: 'A',
            valuePlaceholder: 'Draggable item',
          })}
          {renderIdLabelEditor({
            title: 'Targets',
            field: 'targets',
            rows: targets,
            valueKey: 'label',
            addLabel: 'Add target',
            idPlaceholder: '1',
            valuePlaceholder: 'Drop target',
          })}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">Answer key</div>
            {targets.map((target) => (
              <div key={`target-answer-${target.id}`} className="grid grid-cols-[180px_1fr] gap-2">
                <div className="text-sm text-gray-700">{target.id}</div>
                <select
                  value={readString(targetAnswers[target.id])}
                  onChange={(event) => updateCurrentAnswerMapEntry('targets', target.id, event.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select item</option>
                  {items.map((item) => (
                    <option key={`${target.id}-${item.id}`} value={item.id}>
                      {item.id} - {item.value || '(untitled item)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Simple mode is not available for this unit type yet. Switch to Advanced mode to edit JSON directly.
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-none space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Test Builder</h2>
            <p className="text-sm text-gray-500 mt-1">Build sections, parts, and questions directly in the admin panel.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              onClick={createNew}
              disabled={saving || loading || autoSaving}
            >
              New test
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              onClick={() => void loadSelected()}
              disabled={!selectedExperienceId || saving || loading || autoSaving}
            >
              Load selected
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold"
              onClick={handleSave}
              disabled={!builder || saving || loading || autoSaving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              onClick={() => void handlePreview()}
              disabled={!builder || saving || loading || autoSaving}
            >
              Preview
            </button>
          </div>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div> : null}
        {pendingDraft ? (
          <div className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              Local draft detected
              <span className="text-blue-700">
                {' '}
                ({new Date(pendingDraft.savedAt).toLocaleString()})
              </span>
              . Restore it or discard it.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-xs font-semibold hover:bg-blue-100"
                onClick={restorePendingDraft}
              >
                Restore draft
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-100"
                onClick={discardPendingDraft}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="font-semibold">Builder warnings</div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {warnings.slice(0, 8).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="text-xs font-semibold tracking-wider uppercase text-amber-700">Quick start</div>
          <div className="text-sm text-amber-900 mt-1">Use this flow to create a valid IELTS test fast.</div>
          <ol className="mt-2 list-decimal pl-5 text-sm text-amber-900 space-y-1">
            {BUILDER_QUICK_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Step 1 - Load or create test</div>
              <select
                value={selectedExperienceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedExperienceId(id);
                  syncQuery(id);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Select a test...</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500">
                {builder
                  ? `Version v${builder.experience?.version ?? 1} - ${dirty ? 'Draft has unsaved changes' : 'All changes saved'}`
                  : 'Choose an existing test or click New test to start.'}
              </div>
              {builder && autoSaving ? <div className="text-[11px] text-blue-600">Autosaving to server...</div> : null}
              {builder && serverAutoSavedAt && !dirty ? (
                <div className="text-[11px] text-emerald-600">Server autosaved: {new Date(serverAutoSavedAt).toLocaleTimeString()}</div>
              ) : null}
              {builder && autoSaveError ? <div className="text-[11px] text-amber-600">{autoSaveError}</div> : null}
              {builder && autoSavedAt && dirty ? (
                <div className="text-[11px] text-gray-400">Local fallback draft: {new Date(autoSavedAt).toLocaleTimeString()}</div>
              ) : null}
            </div>

            {builder ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Step 2 - Test settings</div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600">Name</label>
                <input
                  value={builder.experience.name}
                    onChange={(e) =>
                      updateBuilder((prev) => ({ ...prev, experience: { ...prev.experience, name: e.target.value } }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-600">Price per candidate</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={builder.experience.price_amount ?? ''}
                      onChange={(e) =>
                        updateBuilder((prev) => ({
                          ...prev,
                          experience: {
                            ...prev.experience,
                            price_amount: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g. 50000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-600">Currency</label>
                    <input
                      value={builder.experience.price_currency ?? 'UZS'}
                      onChange={(e) =>
                        updateBuilder((prev) => ({
                          ...prev,
                          experience: { ...prev.experience, price_currency: e.target.value.toUpperCase() },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={builder.experience.is_active !== false}
                    onChange={(e) =>
                      updateBuilder((prev) => ({
                        ...prev,
                        experience: { ...prev.experience, is_active: e.target.checked },
                      }))
                    }
                  />
                  Active
                </label>
              </div>
            ) : null}

            {builder ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Step 3 - Starter scaffolds</div>
                </div>
                <div className="text-xs text-gray-500">
                  Build section-by-section. Applying a scaffold or template replaces the same section type in this test. Configure Q1-Q40
                  question types before inserting Reading/Listening scaffolds.
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Reading scaffold</div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                        onClick={addReadingScaffold}
                      >
                        Replace Reading section
                      </button>
                    </div>
                    <label className="text-xs text-gray-500 block">Questions per passage (3 parts, comma-separated)</label>
                    <input
                      value={readingTemplateParts}
                      onChange={(event) => setReadingTemplateParts(event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="13,13,14"
                    />
                    <details className="rounded-lg border border-gray-200 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-gray-600">
                        Question type placeholders (Q1-Q40)
                      </summary>
                      <div className="pt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={readingBulkQuestionType}
                            onChange={(event) => setReadingBulkQuestionType(normalizeQuestionTemplateType(event.target.value))}
                            className="min-w-[12rem] px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-xs"
                          >
                            {QUESTION_TEMPLATE_TYPES.map((type) => (
                              <option key={`reading-bulk-${type.value}`} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                            onClick={() => setAllScaffoldQuestionTypes('reading', readingBulkQuestionType)}
                          >
                            Apply to all 40
                          </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {readingQuestionTypeSlots.map((type, index) => (
                            <label key={`reading-slot-${index + 1}`} className="text-xs text-gray-600 space-y-1">
                              <span className="font-semibold">Q{index + 1}</span>
                              <select
                                value={type}
                                onChange={(event) => setScaffoldQuestionTypeSlot('reading', index, event.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-xs"
                              >
                                {QUESTION_TEMPLATE_TYPES.map((candidate) => (
                                  <option key={`reading-slot-${index + 1}-${candidate.value}`} value={candidate.value}>
                                    {candidate.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </div>
                    </details>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Listening scaffold</div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                        onClick={addListeningScaffold}
                      >
                        Replace Listening section
                      </button>
                    </div>
                    <label className="text-xs text-gray-500 block">Questions per part (4 parts, comma-separated)</label>
                    <input
                      value={listeningTemplateParts}
                      onChange={(event) => setListeningTemplateParts(event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="10,10,10,10"
                    />
                    <details className="rounded-lg border border-gray-200 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-gray-600">
                        Question type placeholders (Q1-Q40)
                      </summary>
                      <div className="pt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={listeningBulkQuestionType}
                            onChange={(event) => setListeningBulkQuestionType(normalizeQuestionTemplateType(event.target.value))}
                            className="min-w-[12rem] px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-xs"
                          >
                            {QUESTION_TEMPLATE_TYPES.map((type) => (
                              <option key={`listening-bulk-${type.value}`} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                            onClick={() => setAllScaffoldQuestionTypes('listening', listeningBulkQuestionType)}
                          >
                            Apply to all 40
                          </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {listeningQuestionTypeSlots.map((type, index) => (
                            <label key={`listening-slot-${index + 1}`} className="text-xs text-gray-600 space-y-1">
                              <span className="font-semibold">Q{index + 1}</span>
                              <select
                                value={type}
                                onChange={(event) => setScaffoldQuestionTypeSlot('listening', index, event.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-xs"
                              >
                                {QUESTION_TEMPLATE_TYPES.map((candidate) => (
                                  <option key={`listening-slot-${index + 1}-${candidate.value}`} value={candidate.value}>
                                    {candidate.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </div>
                    </details>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Writing scaffold</div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                        onClick={addWritingScaffold}
                      >
                        Replace Writing section
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block">Task 1 min words</label>
                        <input
                          type="number"
                          min={1}
                          value={writingTemplateTask1MinWords}
                          onChange={(event) => setWritingTemplateTask1MinWords(event.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block">Task 2 min words</label>
                        <input
                          type="number"
                          min={1}
                          value={writingTemplateTask2MinWords}
                          onChange={(event) => setWritingTemplateTask2MinWords(event.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <details className="rounded-xl border border-gray-200 p-3 space-y-3" open={false}>
                  <summary className="cursor-pointer text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Section JSON Builder
                  </summary>
                  <div className="pt-2 space-y-2">
                    <div className="text-xs text-gray-500">
                      Paste one section JSON at a time. Applying replaces the same section type in this test
                      (reading/listening/writing). After applying all sections, click Save.
                    </div>
                    {sectionJsonStatus ? (
                      <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                        {sectionJsonStatus}
                      </div>
                    ) : null}
                    <textarea
                      value={sectionJsonDraft}
                      onChange={(event) => setSectionJsonDraft(event.target.value)}
                      rows={18}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                      placeholder="Paste section JSON here..."
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                        onClick={handleApplySectionJson}
                        disabled={sectionJsonApplying}
                      >
                        {sectionJsonApplying ? 'Applying...' : 'Apply section JSON'}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                        onClick={() => setSectionJsonDraft(JSON.stringify(SECTION_JSON_EXAMPLE, null, 2))}
                      >
                        Load example JSON
                      </button>
                    </div>
                  </div>
                </details>

                <details className="rounded-xl border border-gray-200 p-3 space-y-3" open={false}>
                  <summary className="cursor-pointer text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Part / Passage JSON Builder
                  </summary>
                  <div className="pt-2 space-y-2">
                    <div className="text-xs text-gray-500">
                      Paste one Listening part or Reading passage JSON. This updates only one part inside the target section
                      (does not replace the whole section).
                    </div>
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      If you set <span className="font-mono">target_part_index</span>, replacement mode is used by default.
                      For append mode, omit <span className="font-mono">target_part_index</span>.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600 space-y-1">
                        <span className="font-semibold">Target section</span>
                        <select
                          value={partTargetSectionType}
                          onChange={(event) => setPartTargetSectionType(event.target.value as PartScopeSectionType)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                        >
                          <option value="listening">Listening (Part 1-4)</option>
                          <option value="reading">Reading (Passage 1-3)</option>
                        </select>
                      </label>
                    </div>
                    {partJsonStatus ? (
                      <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                        {partJsonStatus}
                      </div>
                    ) : null}
                    <textarea
                      value={partJsonDraft}
                      onChange={(event) => setPartJsonDraft(event.target.value)}
                      rows={16}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                      placeholder="Paste part/passage JSON here..."
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                        onClick={handleApplyPartJson}
                        disabled={partJsonApplying}
                      >
                        {partJsonApplying ? 'Applying...' : 'Apply part/passage JSON'}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                        onClick={() => {
                          setPartTargetSectionType('listening');
                          setPartJsonDraft(JSON.stringify(LISTENING_PART_JSON_EXAMPLE, null, 2));
                        }}
                      >
                        Load listening part example
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                        onClick={() => {
                          setPartTargetSectionType('reading');
                          setPartJsonDraft(JSON.stringify(READING_PASSAGE_JSON_EXAMPLE, null, 2));
                        }}
                      >
                        Load reading passage example
                      </button>
                    </div>
                  </div>
                </details>

                <details className="rounded-xl border border-gray-200 p-3 space-y-3" open={false}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Reusable section templates</div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                        onClick={(event) => {
                          event.preventDefault();
                          void loadTemplates();
                        }}
                        disabled={templatesLoading || templateActionLoading}
                      >
                        {templatesLoading ? 'Refreshing...' : 'Refresh templates'}
                      </button>
                    </div>
                  </summary>

                  <div className="mt-3 text-xs text-gray-500">
                    Inserted sections keep template version and source snapshot links for deterministic exam builds.
                  </div>

                  <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600">Template library</div>
                    <div className="text-xs text-gray-500">Applying a template replaces that section type in this test.</div>
                    {templatesLoading ? (
                      <div className="text-xs text-gray-500">Loading templates...</div>
                    ) : templates.length === 0 ? (
                      <div className="text-xs text-gray-500">No templates yet. Save a section as a template first.</div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {templates.map((template) => (
                          <div key={template.template_id} className="rounded-lg border border-gray-200 p-2 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-gray-900">{template.template_name}</div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 uppercase">
                                {template.section_type}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              v{template.latest_version} - {template.version_count} version(s)
                              {template.latest_source_snapshot_id ? ` - snapshot ${shortId(template.latest_source_snapshot_id)}` : ''}
                            </div>
                            <button
                              type="button"
                              className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                              onClick={() => void handleInsertTemplate(template.latest_version_id)}
                              disabled={templateActionLoading}
                            >
                              Apply template
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <details className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-600">Template authoring (advanced)</summary>
                    <div className="pt-2 space-y-2">
                      <div className="text-xs text-gray-500">
                        Selected:{' '}
                        {selectedSectionForTemplate
                          ? `${selectedSectionForTemplate.name || 'Unnamed section'} (${selectedSectionTemplateType || 'set section type first'})`
                          : 'No section selected'}
                      </div>
                      <input
                        value={templateNameDraft}
                        onChange={(event) => setTemplateNameDraft(event.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Template name"
                      />
                      <select
                        value={selectedTemplateIdForVersion}
                        onChange={(event) => setSelectedTemplateIdForVersion(event.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                      >
                        <option value="">Select template for new version...</option>
                        {templateCandidatesForSelectedSection.map((template) => (
                          <option key={`template-version-${template.template_id}`} value={template.template_id}>
                            {template.template_name} (v{template.latest_version})
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                          onClick={() => void handleCreateTemplateFromCurrentSection({ templateId: null })}
                          disabled={templateActionLoading || !selectedSectionForTemplate}
                        >
                          Save as new template
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                          onClick={() => void handleCreateTemplateFromCurrentSection({ templateId: selectedTemplateIdForVersion })}
                          disabled={templateActionLoading || !selectedSectionForTemplate || !selectedTemplateIdForVersion}
                        >
                          Save as new version
                        </button>
                      </div>
                    </div>
                  </details>
                </details>
              </div>
            ) : null}

            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Step 4 - Test structure</div>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                  onClick={addSection}
                  disabled={!builder}
                >
                  Add section
                </button>
              </div>
              <div className="text-xs text-gray-500">
                Structure: <span className="font-semibold text-gray-700">Test -&gt; Section -&gt; Part -&gt; Unit</span>.
                Keep section order aligned to the real exam sequence.
              </div>

              {!builder ? <div className="text-sm text-gray-500">Create or load a test to begin.</div> : null}

              <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                {builder?.sections.map((section, sectionIndex) => {
                  const typeValue = String((section.metadata as any)?.type ?? '').toLowerCase();
                  const durationSeconds = Number((section.metadata as any)?.duration_seconds ?? 0);
                  const durationMinutes = durationSeconds > 0 ? Math.round(durationSeconds / 60) : '';
                  const canMoveUp = sectionIndex > 0;
                  const canMoveDown = sectionIndex < (builder?.sections.length ?? 0) - 1;
                  const sectionMetadata = isObject(section.metadata) ? section.metadata : {};
                  const templateRef = isObject((sectionMetadata as any).template_ref)
                    ? ((sectionMetadata as any).template_ref as Record<string, unknown>)
                    : null;
                  return (
                    <div key={section.id} className="border border-gray-200 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <input
                        value={section.name}
                        onChange={(e) => updateSectionName(section.id ?? '', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Section name"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-2 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
                          onClick={() => moveSection(section.id ?? '', 'up')}
                          disabled={!canMoveUp}
                          title="Move section up"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="px-2 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
                          onClick={() => moveSection(section.id ?? '', 'down')}
                          disabled={!canMoveDown}
                          title="Move section down"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                          onClick={() => removeSection(section.id ?? '')}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {templateRef ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        Template link: {shortId(readString((templateRef as any).template_id))} - v
                        {String((templateRef as any).template_version ?? 'n/a')}
                        {readString((templateRef as any).source_snapshot_id)
                          ? ` - snapshot ${shortId(readString((templateRef as any).source_snapshot_id))}`
                          : ''}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-gray-500">Type</label>
                        <select
                          value={typeValue}
                          onChange={(e) => updateSectionType(section.id ?? '', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                        >
                          <option value="">Select...</option>
                          {SECTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          {typeValue === 'listening' ? 'Duration (minutes, can auto-sync from audio)' : 'Duration (minutes)'}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            value={durationMinutes}
                            onChange={(e) => updateSectionDuration(section.id ?? '', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          {typeValue === 'listening' ? (
                            <button
                              type="button"
                              className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 whitespace-nowrap"
                              onClick={() => syncListeningSectionDurationFromAudio(section.id ?? '')}
                            >
                              Auto
                            </button>
                          ) : null}
                        </div>
                        {typeValue === 'listening' ? (
                          <div className="text-[11px] text-gray-500 mt-1">Uses sum of attached audio duration_seconds values.</div>
                        ) : null}
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                          onClick={() => addPart(section.id ?? '')}
                        >
                          Add part
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {section.parts.map((part) => (
                        <div key={part.id} className="border border-gray-100 rounded-lg p-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              value={part.name}
                              onChange={(e) => updatePartName(part.id ?? '', e.target.value)}
                              className="flex-1 px-2 py-1 border border-gray-200 rounded"
                              placeholder="Part name"
                            />
                            <button
                              type="button"
                              className="px-2 py-1 rounded border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                              onClick={() => removePart(section.id ?? '', part.id ?? '')}
                            >
                              Delete
                            </button>
                          </div>
                          <div className="mt-2 space-y-1">
                            {part.content_units.map((unit) => {
                              const selected = unit.id === selectedUnitId;
                              return (
                                <button
                                  key={unit.id}
                                  type="button"
                                  className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs ${
                                    selected ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50'
                                  }`}
                                  onClick={() => {
                                    setSelectedUnitId(unit.id ?? '');
                                  }}
                                >
                                  <span className="truncate">
                                    {unit.type}
                                  </span>
                                  <span className="text-gray-400">Edit</span>
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              className="w-full px-2 py-1 rounded border border-gray-200 text-xs font-semibold hover:bg-gray-50 mt-1"
                              onClick={() => addUnit(part.id ?? '')}
                            >
                              Add unit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {builder ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Step 5 - Publish readiness</div>
                  <div className={`text-xs font-semibold ${publishChecklist.length === 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {publishChecklist.length === 0 ? 'Ready' : `${publishChecklist.length} blocker(s)`}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Resolve blockers, then confirm Reading and Listening score targets before publishing.
                </div>
                {publishChecklist.length === 0 ? (
                  <div className="text-sm text-emerald-700">Everything required for publish is complete.</div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {publishChecklist.map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        className="w-full text-left rounded-lg border border-red-200 bg-red-50 px-3 py-2 hover:bg-red-100"
                        onClick={() => jumpToIssue(issue)}
                      >
                        <div className="text-xs font-semibold text-red-700">Fix now</div>
                        <div className="text-sm text-red-900">{compactIssueMessage(issue.message)}</div>
                      </button>
                    ))}
                  </div>
                )}

                {sectionScoreMeters.length > 0 ? (
                  <div className="pt-1 border-t border-gray-100 space-y-2">
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Section score meter</div>
                    {sectionScoreMeters
                      .filter((meter) => meter.sectionType === 'reading' || meter.sectionType === 'listening')
                      .map((meter) => {
                        const isComplete = meter.score === meter.target && meter.target > 0;
                        return (
                          <div key={`meter-${meter.sectionId}`} className="rounded-lg border border-gray-200 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-gray-900">
                                {meter.sectionName}: {meter.score}/{meter.target}
                              </div>
                              <span
                                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                  isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {isComplete ? 'Ready' : 'Needs fixes'}
                              </span>
                            </div>
                            {!isComplete ? (
                              <div className="text-xs text-gray-600 space-y-1">
                                {meter.missingAnswerUnitIds.length > 0 ? (
                                  <div>Missing answer keys: {meter.missingAnswerUnitIds.map((id) => shortId(id)).join(', ')}</div>
                                ) : null}
                                {meter.emptyAnswerUnitIds.length > 0 ? (
                                  <div>Empty answer keys: {meter.emptyAnswerUnitIds.map((id) => shortId(id)).join(', ')}</div>
                                ) : null}
                                {meter.invalidAnswerUnitIds.length > 0 ? (
                                  <div>Invalid answer JSON: {meter.invalidAnswerUnitIds.map((id) => shortId(id)).join(', ')}</div>
                                ) : null}
                                {meter.missingMediaUnitIds.length > 0 ? (
                                  <div>Missing media: {meter.missingMediaUnitIds.map((id) => shortId(id)).join(', ')}</div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="text-xs text-emerald-700">Section score matches IELTS requirement.</div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedExperienceId ? (
              <details className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Version history</div>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                      onClick={(event) => {
                        event.preventDefault();
                        void loadSnapshots(selectedExperienceId);
                      }}
                      disabled={snapshotsLoading || saving || loading}
                    >
                      Refresh
                    </button>
                  </div>
                </summary>

                <div className="pt-2">
                  {snapshotsLoading ? (
                    <div className="text-xs text-gray-500">Loading snapshots...</div>
                  ) : snapshots.length === 0 ? (
                    <div className="text-xs text-gray-500">No snapshots yet.</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {snapshots.map((snapshot) => (
                        <div key={snapshot.id} className="rounded-lg border border-gray-200 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-gray-800">v{snapshot.version} - {snapshot.action}</div>
                            <button
                              type="button"
                              className="px-2 py-1 rounded border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => void handleRollback(snapshot)}
                              disabled={Boolean(rollingBackSnapshotId) || saving || loading}
                            >
                              {rollingBackSnapshotId === snapshot.id ? 'Rolling back...' : 'Rollback'}
                            </button>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1">
                            {new Date(snapshot.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            ) : null}
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!currentSelection ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-600">
                No unit selected yet. Start by applying a section scaffold/template, or add a section and unit manually.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Unit</div>
                    <div className="text-lg font-semibold text-gray-900">{currentSelection.unit.id}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Section: {currentSelection.section.name} | Part: {currentSelection.part.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => removeUnit(currentSelection.part.id ?? '', currentSelection.unit.id ?? '')}
                  >
                    Delete unit
                  </button>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <div className="text-xs font-semibold tracking-wider uppercase text-blue-700">
                    Editing {unitTypeLabel(currentSelection.unit.type)}
                  </div>
                  <div className="text-sm text-blue-900">
                    {currentUnitGuide?.overview ?? 'Configure unit data and answer key JSON, then save the test.'}
                  </div>
                  {currentUnitGuide ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-blue-900">
                      <div>
                        <div className="font-semibold mb-1">Unit data tips</div>
                        <ul className="list-disc pl-4 space-y-1">
                          {currentUnitGuide.dataTips.map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Answer key tips</div>
                        <ul className="list-disc pl-4 space-y-1">
                          {currentUnitGuide.answerTips.map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Unit type</label>
                    <select
                      value={currentSelection.unit.type}
                      onChange={(e) => updateUnitType(currentSelection.unit.id ?? '', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                    >
                      {UNIT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Editor mode</label>
                    <div className="mt-1 inline-flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        className={`px-3 py-2 text-xs font-semibold ${
                          editorMode === 'simple' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => setEditorMode('simple')}
                      >
                        Simple
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-2 text-xs font-semibold border-l border-gray-200 ${
                          editorMode === 'advanced' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => setEditorMode('advanced')}
                      >
                        Advanced JSON
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                    onClick={() => applyDataTemplate(currentSelection.unit.id ?? '', currentSelection.unit.type)}
                  >
                    Load data template
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => applyAnswerTemplate(currentSelection.unit.id ?? '', currentSelection.unit.type)}
                    disabled={!ANSWER_KEY_TEMPLATES[currentSelection.unit.type]}
                    title={!ANSWER_KEY_TEMPLATES[currentSelection.unit.type] ? 'This unit type does not use answer keys.' : ''}
                  >
                    Load answer key template
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                    onClick={() => setUnitAnswerText(currentSelection.unit.id ?? '', '')}
                  >
                    Clear answer key
                  </button>
                </div>

                {editorMode === 'simple' ? (
                  simpleModeSupported ? (
                    <div className="space-y-2">
                      {renderSimpleUnitEditor()}
                      {currentUnitUi?.dataError ? <div className="text-xs text-red-700">{currentUnitUi.dataError}</div> : null}
                      {currentUnitUi?.answerError ? <div className="text-xs text-red-700">{currentUnitUi.answerError}</div> : null}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Simple mode is unavailable for this unit type. Switch to Advanced JSON.
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-500">Unit data (JSON)</label>
                      <div className="text-xs text-gray-500">
                        Must be a JSON object. Use the template button first, then edit fields.
                      </div>
                      <textarea
                        value={unitUi[currentSelection.unit.id ?? '']?.dataText ?? ''}
                        onChange={(e) => setUnitDataText(currentSelection.unit.id ?? '', e.target.value)}
                        rows={12}
                        className="w-full font-mono text-xs px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      {unitUi[currentSelection.unit.id ?? '']?.dataError ? (
                        <div className="text-xs text-red-700">{unitUi[currentSelection.unit.id ?? '']?.dataError}</div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-500">Answer key (JSON, optional)</label>
                      <div className="text-xs text-gray-500">
                        Required for auto-scored questions. Leave empty for manual/AI-evaluated tasks.
                      </div>
                      <textarea
                        value={unitUi[currentSelection.unit.id ?? '']?.answerText ?? ''}
                        onChange={(e) => setUnitAnswerText(currentSelection.unit.id ?? '', e.target.value)}
                        rows={6}
                        className="w-full font-mono text-xs px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Leave empty to disable scoring for this unit."
                      />
                      {unitUi[currentSelection.unit.id ?? '']?.answerError ? (
                        <div className="text-xs text-red-700">{unitUi[currentSelection.unit.id ?? '']?.answerError}</div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {assetModal?.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Select or upload {assetModal.kind}</h3>
                <p className="text-sm text-gray-500">Attach media without editing storage paths manually.</p>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                onClick={closeAssetPicker}
              >
                Close
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Upload new file</div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  type="file"
                  accept={assetModal.kind === 'audio' ? 'audio/*' : 'image/*'}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setAssetUploadFile(file);
                    setAssetUploadError(null);
                    setAssetUploadProgress(0);
                  }}
                  className="flex-1 text-sm"
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => void handleAssetUpload()}
                  disabled={!assetUploadFile || assetUploading}
                >
                  {assetUploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              {assetUploadFile ? <div className="text-xs text-gray-500">Selected: {assetUploadFile.name}</div> : null}
              {assetUploading ? (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gray-900 transition-all duration-150"
                      style={{ width: `${Math.max(2, assetUploadProgress)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-gray-500">{assetUploadProgress}% uploaded</div>
                </div>
              ) : null}
              {assetUploadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex items-center justify-between gap-2">
                  <span>Upload failed. {assetUploadError}</span>
                  <button
                    type="button"
                    className="px-2 py-1 rounded border border-red-200 bg-white text-[11px] font-semibold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => void handleAssetUpload()}
                    disabled={!assetUploadFile || assetUploading}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Search filename..."
              />
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                {assetLoading ? (
                  <div className="p-4 text-sm text-gray-500">Loading assets...</div>
                ) : assets.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No assets found.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left p-3 font-semibold">File</th>
                        <th className="text-left p-3 font-semibold">Path</th>
                        <th className="text-right p-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((asset) => (
                        <tr key={asset.id} className="border-t border-gray-100">
                          <td className="p-3">
                            <div className="font-semibold text-gray-900">{asset.filename ?? 'Untitled'}</div>
                            <div className="text-xs text-gray-500">{asset.mime_type ?? 'unknown'}</div>
                          </td>
                          <td className="p-3 font-mono text-xs text-gray-600">
                            {asset.bucket}/{asset.path}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50"
                              onClick={() => applyAssetToUnit(assetModal.unitId, asset)}
                            >
                              Use
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
};
