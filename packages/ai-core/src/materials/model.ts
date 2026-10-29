import * as s from '../schema.ts';
import type { Schema } from '../schema.ts';
import { literal, tagged } from './kit.ts';

// The canonical teaching-material model (T1). A material is a list of typed blocks
// (a passage, a listening script, a question set, word lists, cards, a lesson plan's
// stages…) plus the brief it was made from. Every kind in kinds.ts is a set of rules
// over these blocks, so one renderer, one editor conversion and one key checker
// serve every kind, and other areas (C5 placement tests, C12 curriculum) reuse them.
//
// Answers live next to their questions. `studentView` (render.ts) strips them; the
// checked key (keys.ts) is computed from them. Nothing here talks to a model.

export const MATERIAL_SCHEMA = 'schood.material.v1';
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export const INSTRUCTION_LANGUAGES = ['en', 'uz', 'ru'] as const;
export type InstructionLanguage = (typeof INSTRUCTION_LANGUAGES)[number];

/** A CEFR level (`B2`) or an exam band (`band:6.5`, `band:1200`). */
export const LEVEL_PATTERN = /^(A1|A2|B1|B2|C1|C2|band:[0-9]{1,4}(\.[05])?)$/;
export const isMaterialLevel = (value: unknown): value is string => typeof value === 'string' && LEVEL_PATTERN.test(value);
export const ID_PATTERN = /^[a-z][a-z0-9_-]{0,30}$/;

// --- Questions -------------------------------------------------------------------------

/**
 * Every question type a material can hold. `answer` is always a list:
 * - choice types (single_choice, true_false, true_false_not_given, yes_no_not_given, matching): one option id;
 * - multi_choice: every correct option id (`choose` of them);
 * - ordering: every option id, in the right order;
 * - gap, short_answer, error_correction, transformation: every accepted answer text;
 * - numeric: one number (as text), with an optional `tolerance`;
 * - open: none (writing and speaking prompts are marked against a rubric).
 */
export const QUESTION_TYPES = [
  'single_choice', 'multi_choice', 'true_false', 'true_false_not_given', 'yes_no_not_given', 'matching', 'ordering',
  'gap', 'short_answer', 'error_correction', 'transformation', 'numeric', 'open',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const CHOICE_TYPES: readonly QuestionType[] = ['single_choice', 'multi_choice', 'true_false', 'true_false_not_given', 'yes_no_not_given', 'matching', 'ordering'];
export const SINGLE_KEY_TYPES: readonly QuestionType[] = ['single_choice', 'true_false', 'true_false_not_given', 'yes_no_not_given', 'matching'];
export const TEXT_TYPES: readonly QuestionType[] = ['gap', 'short_answer', 'error_correction', 'transformation'];
/** Types a machine can mark (everything except open prompts). */
export const AUTO_MARKABLE_TYPES: readonly QuestionType[] = /*#__PURE__*/ QUESTION_TYPES.filter((type) => type !== 'open');

/** Fixed option sets of the judgement types; option ids are stable so keys compare. */
export const FIXED_OPTIONS: Partial<Record<QuestionType, readonly Choice[]>> = {
  true_false: [{ id: 'T', text: 'TRUE' }, { id: 'F', text: 'FALSE' }],
  true_false_not_given: [{ id: 'T', text: 'TRUE' }, { id: 'F', text: 'FALSE' }, { id: 'NG', text: 'NOT GIVEN' }],
  yes_no_not_given: [{ id: 'Y', text: 'YES' }, { id: 'N', text: 'NO' }, { id: 'NG', text: 'NOT GIVEN' }],
};

export interface Choice { id: string; text: string }
export interface Question {
  id: string;
  type: QuestionType;
  /** The stem. A gap question has one gap written `____` (unless a cloze text marks it `[[id]]`). */
  prompt: string;
  options?: Choice[];
  answer: string[];
  /** multi_choice: how many to choose. */
  choose?: number;
  /** numeric: accepted absolute difference. */
  tolerance?: number;
  explanation?: string;
  /** Skill or topic tag: an exam skill id, SAT skill, admission maths topic code, or a free tag. */
  skill?: string;
  /** The exam's own type id (`question_true_false_not_given`, `read_daily_life`, `spr`…). */
  exam_type?: string;
  points?: number;
}

export const OPTION_ID = /^[A-Za-z0-9]{1,4}$/;
export const choiceSchema = /*#__PURE__*/ s.object({ id: s.string({ min: 1, max: 4, pattern: OPTION_ID }), text: s.string({ min: 1, max: 600 }) });
export const questionSchema = /*#__PURE__*/ s.object({
  id: s.string({ min: 1, max: 31, pattern: ID_PATTERN }),
  type: s.enumOf(QUESTION_TYPES),
  prompt: s.string({ max: 2000 }),
  options: s.optional(s.array(choiceSchema, { max: 12 })),
  answer: s.array(s.string({ min: 1, max: 300 }), { max: 12 }),
  choose: s.optional(s.number({ min: 2, max: 6, integer: true })),
  tolerance: s.optional(s.number({ min: 0, max: 1_000_000 })),
  explanation: s.optional(s.string({ max: 1500 })),
  skill: s.optional(s.string({ max: 80 })),
  exam_type: s.optional(s.string({ max: 60 })),
  points: s.optional(s.number({ min: 0, max: 100 })),
}) as Schema<Question>;

// --- Blocks ---------------------------------------------------------------------------------

export const BLOCK_TYPES = ['text', 'script', 'questions', 'words', 'cards', 'flashcards', 'task', 'model_answer', 'rubric', 'stages', 'slides', 'outline'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const TEXT_ROLES = ['passage', 'explanation', 'instructions', 'example', 'tip', 'notes'] as const;
export interface TextBlock { id: string; type: 'text'; role: (typeof TEXT_ROLES)[number]; title?: string; body: string }
export interface ScriptLine { speaker: string; text: string }
export interface ScriptBlock { id: string; type: 'script'; role: 'listening' | 'dialogue'; title?: string; lines: ScriptLine[]; setting?: string }
export interface QuestionsBlock {
  id: string;
  type: 'questions';
  title?: string;
  instructions: string;
  /** Gap and short answers: at most this many words. */
  word_limit?: number;
  /** Summary completion from a box of words: every gap answer must come from it. */
  word_box?: string[];
  /** Matching headings, features, sentence endings: the shared option list. */
  options?: Choice[];
  /** The text or script block the questions are about. */
  source?: string;
  /** Completion answers must be words taken from the source text. */
  from_source?: boolean;
  /** Placement tests and three-level sets: the level of this set. */
  level?: string;
  exam_type?: string;
  questions: Question[];
}
export interface WordEntry { term: string; part_of_speech?: string; meaning: string; meaning_uz?: string; meaning_ru?: string; example?: string }
export interface WordsBlock { id: string; type: 'words'; title?: string; words: WordEntry[] }
export interface Card { title: string; prompt: string; points?: string[]; role?: string; prep_seconds?: number; talk_seconds?: number }
export interface CardsBlock { id: string; type: 'cards'; title?: string; cards: Card[] }
export interface Flashcard { front: string; back: string; example?: string }
export interface FlashcardsBlock { id: string; type: 'flashcards'; title?: string; cards: Flashcard[] }
export interface TaskBlock { id: string; type: 'task'; title?: string; prompt: string; words?: { min: number; max: number }; minutes?: number; exam_task?: string }
export interface ModelAnswerBlock { id: string; type: 'model_answer'; title?: string; body: string; for?: string; notes?: string[] }
export interface Criterion { id: string; name: string; description: string; max: number }
export interface RubricBlock { id: string; type: 'rubric'; title?: string; criteria: Criterion[]; for?: string }
export interface Stage { name: string; minutes: number; aim: string; steps: string[]; interaction?: string; materials?: string }
export interface StagesBlock { id: string; type: 'stages'; title?: string; stages: Stage[]; homework?: string }
export interface Slide { title: string; bullets: string[]; notes?: string }
export interface SlidesBlock { id: string; type: 'slides'; title?: string; slides: Slide[] }
export interface Unit { title: string; weeks?: number; aims: string[]; can_do: string[]; grammar?: string[]; vocabulary?: string[]; skills?: string[]; assessment?: string }
export interface OutlineBlock { id: string; type: 'outline'; title?: string; units: Unit[] }
export type Block = TextBlock | ScriptBlock | QuestionsBlock | WordsBlock | CardsBlock | FlashcardsBlock | TaskBlock | ModelAnswerBlock | RubricBlock | StagesBlock | SlidesBlock | OutlineBlock;

const id = /*#__PURE__*/ s.string({ min: 1, max: 31, pattern: ID_PATTERN });
const title = /*#__PURE__*/ s.optional(s.string({ max: 200 }));
const line = (max = 600) => s.string({ min: 1, max });
const blocks: Record<BlockType, Schema<Block>> = {
  text: /*#__PURE__*/ s.object({ id, type: literal('text'), role: s.enumOf(TEXT_ROLES), title, body: s.string({ min: 1, max: 14_000 }) }) as Schema<Block>,
  script: /*#__PURE__*/ s.object({ id, type: literal('script'), role: s.enumOf(['listening', 'dialogue'] as const), title, setting: s.optional(s.string({ max: 400 })), lines: s.array(s.object({ speaker: s.string({ min: 1, max: 60 }), text: line(1500) }), { min: 1, max: 160 }) }) as Schema<Block>,
  questions: /*#__PURE__*/ s.object({
    id, type: literal('questions'), title, instructions: s.string({ min: 1, max: 1000 }),
    word_limit: s.optional(s.number({ min: 1, max: 10, integer: true })), word_box: s.optional(s.array(line(80), { max: 30 })),
    options: s.optional(s.array(choiceSchema, { max: 16 })), source: s.optional(id), from_source: s.optional(s.boolean()),
    level: s.optional(s.string({ max: 20, pattern: LEVEL_PATTERN })), exam_type: s.optional(s.string({ max: 60 })),
    questions: s.array(questionSchema, { min: 1, max: 60 }),
  }) as Schema<Block>,
  words: /*#__PURE__*/ s.object({ id, type: literal('words'), title, words: s.array(s.object({ term: line(80), part_of_speech: s.optional(s.string({ max: 30 })), meaning: line(300), meaning_uz: s.optional(s.string({ max: 300 })), meaning_ru: s.optional(s.string({ max: 300 })), example: s.optional(s.string({ max: 400 })) }), { min: 1, max: 60 }) }) as Schema<Block>,
  cards: /*#__PURE__*/ s.object({ id, type: literal('cards'), title, cards: s.array(s.object({ title: line(120), prompt: line(1200), points: s.optional(s.array(line(300), { max: 8 })), role: s.optional(s.string({ max: 300 })), prep_seconds: s.optional(s.number({ min: 0, max: 600, integer: true })), talk_seconds: s.optional(s.number({ min: 0, max: 900, integer: true })) }), { min: 1, max: 40 }) }) as Schema<Block>,
  flashcards: /*#__PURE__*/ s.object({ id, type: literal('flashcards'), title, cards: s.array(s.object({ front: line(200), back: line(400), example: s.optional(s.string({ max: 300 })) }), { min: 1, max: 80 }) }) as Schema<Block>,
  task: /*#__PURE__*/ s.object({ id, type: literal('task'), title, prompt: s.string({ min: 1, max: 4000 }), words: s.optional(s.object({ min: s.number({ min: 0, max: 2000, integer: true }), max: s.number({ min: 1, max: 3000, integer: true }) })), minutes: s.optional(s.number({ min: 1, max: 240, integer: true })), exam_task: s.optional(s.string({ max: 60 })) }) as Schema<Block>,
  model_answer: /*#__PURE__*/ s.object({ id, type: literal('model_answer'), title, body: s.string({ min: 1, max: 8000 }), for: s.optional(id), notes: s.optional(s.array(line(400), { max: 10 })) }) as Schema<Block>,
  rubric: /*#__PURE__*/ s.object({ id, type: literal('rubric'), title, for: s.optional(id), criteria: s.array(s.object({ id, name: line(80), description: line(600), max: s.number({ min: 1, max: 100 }) }), { min: 1, max: 12 }) }) as Schema<Block>,
  stages: /*#__PURE__*/ s.object({ id, type: literal('stages'), title, homework: s.optional(s.string({ max: 1500 })), stages: s.array(s.object({ name: line(80), minutes: s.number({ min: 1, max: 180, integer: true }), aim: line(400), steps: s.array(line(500), { min: 1, max: 12 }), interaction: s.optional(s.string({ max: 40 })), materials: s.optional(s.string({ max: 300 })) }), { min: 1, max: 16 }) }) as Schema<Block>,
  slides: /*#__PURE__*/ s.object({ id, type: literal('slides'), title, slides: s.array(s.object({ title: line(120), bullets: s.array(line(300), { max: 8 }), notes: s.optional(s.string({ max: 800 })) }), { min: 1, max: 40 }) }) as Schema<Block>,
  outline: /*#__PURE__*/ s.object({ id, type: literal('outline'), title, units: s.array(s.object({ title: line(160), weeks: s.optional(s.number({ min: 1, max: 20, integer: true })), aims: s.array(line(300), { max: 10 }), can_do: s.array(line(300), { max: 12 }), grammar: s.optional(s.array(line(120), { max: 12 })), vocabulary: s.optional(s.array(line(120), { max: 12 })), skills: s.optional(s.array(line(120), { max: 12 })), assessment: s.optional(s.string({ max: 400 })) }), { min: 1, max: 40 }) }) as Schema<Block>,
};
export const blockSchema: Schema<Block> = /*#__PURE__*/ tagged('type', blocks);

// --- The material ------------------------------------------------------------------------------

export const EXAM_FORMATS = ['ielts', 'toefl_2026', 'multilevel', 'sat', 'admission_math'] as const;
export type ExamFormatId = (typeof EXAM_FORMATS)[number];
export interface ExamTarget { format: ExamFormatId; section?: string; task?: string; part?: string; domain?: string; topics?: string[] }
export interface Variant { label: 'support' | 'stretch'; level: string; blocks: Block[] }
export interface Material {
  schema: typeof MATERIAL_SCHEMA;
  kind: string;
  title: string;
  level: string;
  topic: string;
  /** The language the instructions and explanations are written in. */
  instruction_language: InstructionLanguage;
  exam?: ExamTarget;
  aims?: string[];
  minutes?: number;
  blocks: Block[];
  /** Three levels at once: `blocks` is the core level; these are the support and stretch versions. */
  variants?: Variant[];
}

export const examTargetSchema = /*#__PURE__*/ s.object({
  format: s.enumOf(EXAM_FORMATS), section: s.optional(s.string({ max: 40 })), task: s.optional(s.string({ max: 60 })),
  part: s.optional(s.string({ max: 40 })), domain: s.optional(s.string({ max: 60 })), topics: s.optional(s.array(s.string({ min: 1, max: 60 }), { max: 12 })),
}) as Schema<ExamTarget>;
const blockList = /*#__PURE__*/ s.array(blockSchema, { min: 1, max: 40 });
export const materialSchema = /*#__PURE__*/ s.object({
  schema: literal(MATERIAL_SCHEMA),
  kind: s.string({ min: 2, max: 40, pattern: /^[a-z][a-z0-9_]{1,39}$/ }),
  title: s.string({ min: 1, max: 200 }),
  level: s.string({ max: 20, pattern: LEVEL_PATTERN }),
  topic: s.string({ min: 1, max: 200 }),
  instruction_language: s.enumOf(INSTRUCTION_LANGUAGES),
  exam: s.optional(examTargetSchema),
  aims: s.optional(s.array(s.string({ min: 1, max: 300 }), { max: 10 })),
  minutes: s.optional(s.number({ min: 1, max: 600, integer: true })),
  blocks: blockList,
  variants: s.optional(s.array(s.object({ label: s.enumOf(['support', 'stretch'] as const), level: s.string({ max: 20, pattern: LEVEL_PATTERN }), blocks: blockList }), { max: 2 })),
}) as Schema<Material>;

/** Parses a stored or edited material strictly; throws SchemaError with the failing path. */
export function parseMaterial(value: unknown): Material {
  const material = materialSchema.parse(value);
  for (const version of [material.blocks, ...(material.variants ?? []).map((variant) => variant.blocks)]) {
    const seen = new Set<string>();
    for (const block of version) {
      if (seen.has(block.id)) throw new s.SchemaError(`blocks.${block.id}`, 'duplicate block id');
      seen.add(block.id);
    }
  }
  return material;
}

/** Every question block in one version of the material (the core version by default). */
export const questionBlocks = (blocksOf: readonly Block[]): QuestionsBlock[] => blocksOf.filter((block): block is QuestionsBlock => block.type === 'questions');
/** Every version: the core blocks, then each variant's. */
export const versions = (material: Material): { label: 'core' | 'support' | 'stretch'; level: string; blocks: Block[] }[] => [
  { label: 'core', level: material.level, blocks: material.blocks },
  ...(material.variants ?? []).map((variant) => ({ label: variant.label, level: variant.level, blocks: variant.blocks })),
];
export const allQuestions = (blocksOf: readonly Block[]): Question[] => questionBlocks(blocksOf).flatMap((block) => block.questions);

// --- The brief ----------------------------------------------------------------------------------

export const LENGTHS = ['short', 'standard', 'long'] as const;
export type MaterialLength = (typeof LENGTHS)[number];
export interface MaterialBrief {
  kind: string;
  level: string;
  topic: string;
  instruction_language: InstructionLanguage;
  length: MaterialLength;
  /** Questions wanted, when the kind has questions (the kind's default otherwise). */
  questions?: number;
  exam?: ExamTarget;
  /** A group's weak spots (Academy homework mistake tags), to aim the material at. */
  focus?: string[];
  /** The teacher's own notes for this material. */
  notes?: string;
  /** Three levels at once (+10 credits). */
  variants?: boolean;
}
export const briefSchema = /*#__PURE__*/ s.object({
  kind: s.string({ min: 2, max: 40, pattern: /^[a-z][a-z0-9_]{1,39}$/ }),
  level: s.string({ max: 20, pattern: LEVEL_PATTERN }),
  topic: s.string({ min: 2, max: 200 }),
  instruction_language: s.enumOf(INSTRUCTION_LANGUAGES),
  length: s.enumOf(LENGTHS),
  questions: s.optional(s.number({ min: 1, max: 60, integer: true })),
  exam: s.optional(examTargetSchema),
  focus: s.optional(s.array(s.string({ min: 1, max: 80 }), { max: 10 })),
  notes: s.optional(s.string({ max: 1500 })),
  variants: s.optional(s.boolean()),
}) as Schema<MaterialBrief>;

/** The CEFR levels around a level, for three-level variants (support, core, stretch). */
export function neighbourLevels(level: string): { support: string; stretch: string } {
  const index = (CEFR_LEVELS as readonly string[]).indexOf(level);
  if (index >= 0) return { support: CEFR_LEVELS[Math.max(0, index - 1)], stretch: CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, index + 1)] };
  return { support: level, stretch: level };
}
