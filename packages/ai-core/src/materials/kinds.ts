import type { CreditKey } from '../credits.ts';
import { EXAM_TARGETS, IELTS_STRUCTURE, ieltsTypesFor, MULTILEVEL_PART_MAP, satModuleQuestions, TOEFL_TASK_MAP } from './formats.ts';
import { AUTO_MARKABLE_TYPES, type BlockType, type ExamFormatId, type MaterialBrief, type MaterialLength, type QuestionType } from './model.ts';

// Every T1 material kind and its rules: which blocks it needs, which question types
// it may hold, how many questions each length means, which credit key it costs, and
// how a brief is split into model calls. One call writes one passage, one question
// set of at most 15 questions, or one small whole material, so every call stays well
// under the edge-function time limit; long exam sets become several steps of one job.

export const MATERIAL_GROUPS = ['general', 'exam', 'planning', 'textbook', 'placement'] as const;
export type MaterialGroup = (typeof MATERIAL_GROUPS)[number];
/**
 * The groups the Materials Studio makes. `placement` kinds are the centre's placement
 * tests (C5): they use the model and its checks, but the Studio does not write them,
 * and they are not teacher library kinds (the centre has its own).
 */
export const STUDIO_GROUPS = ['general', 'exam', 'planning', 'textbook'] as const satisfies readonly MaterialGroup[];
export type StudioGroup = (typeof STUDIO_GROUPS)[number];

/** One model call of a generation job. */
export interface GenerationStep {
  id: string;
  /** source: a passage or script; questions: a question set over it; content: blocks of a whole (small) material or a chunk; variant: a support or stretch version of one part. */
  produce: 'source' | 'questions' | 'content' | 'variant';
  /** The part this step belongs to (passage 1, listening part 2, chunk 3), from 0. */
  part: number;
  /** For variants: which version. */
  variant?: 'support' | 'stretch';
  questions?: number;
  questionTypes?: readonly QuestionType[];
  /** The exam's own type ids to use (IELTS question types, a TOEFL task, a Multilevel part). */
  examTypes?: readonly string[];
  /** Target length of a passage or script, in words. */
  words?: readonly [number, number];
  /** What the step should cover, in plain English for the model (a section, a domain). */
  focus?: string;
}

export interface MaterialKindSpec {
  kind: string;
  group: MaterialGroup;
  creditKey: CreditKey;
  /** Each version must hold at least one block of each. */
  required: readonly BlockType[];
  allowed: readonly BlockType[];
  questionTypes: readonly QuestionType[];
  /** Questions (or cards, words, slides for kinds without questions) per length. */
  count: Record<MaterialLength, number>;
  /** Every question must be machine-markable (quizzes). */
  autoMarkable?: boolean;
  /** Single-choice questions should have exactly this many options. */
  options?: number;
  exam?: ExamFormatId;
  /** A text source (passage or script) comes first and questions are written over it. */
  sourced?: 'passage' | 'script';
  /** Can be differentiated into three levels (+10 credits). */
  variants: boolean;
  /** Can be played as a Live Quiz (it holds choice questions). */
  playable: boolean;
  /** Needs a page image (textbook to lesson). */
  vision?: boolean;
  /** Every question needs a level of its own or its set's (placement tests span a range). */
  levelled?: boolean;
}

const ALL_QUESTIONS = AUTO_MARKABLE_TYPES;
const CHOICE = ['single_choice', 'multi_choice', 'true_false', 'true_false_not_given', 'matching'] as const satisfies readonly QuestionType[];
const counts = (short: number, standard: number, long: number): Record<MaterialLength, number> => ({ short, standard, long });
const spec = (input: Omit<MaterialKindSpec, 'variants' | 'playable'> & { variants?: boolean; playable?: boolean }): MaterialKindSpec => ({
  variants: true, playable: input.questionTypes.some((type) => (CHOICE as readonly string[]).includes(type)), ...input,
});

export const MATERIAL_KINDS: Record<string, MaterialKindSpec> = /*#__PURE__*/ Object.fromEntries([
  // --- General material ---------------------------------------------------------------
  /*#__PURE__*/ spec({ kind: 'worksheet', group: 'general', creditKey: 'material.generate', required: ['questions'], allowed: ['text', 'questions', 'words', 'task'], questionTypes: [...ALL_QUESTIONS, 'open'], count: counts(8, 12, 20) }),
  /*#__PURE__*/ spec({ kind: 'reading', group: 'general', creditKey: 'material.generate', required: ['text', 'questions'], allowed: ['text', 'questions', 'words'], questionTypes: ['single_choice', 'multi_choice', 'true_false', 'true_false_not_given', 'matching', 'gap', 'short_answer'], count: counts(6, 10, 14), sourced: 'passage' }),
  /*#__PURE__*/ spec({ kind: 'listening', group: 'general', creditKey: 'material.generate', required: ['script', 'questions'], allowed: ['script', 'questions', 'words'], questionTypes: ['single_choice', 'multi_choice', 'true_false', 'matching', 'gap', 'short_answer'], count: counts(6, 10, 14), sourced: 'script' }),
  /*#__PURE__*/ spec({ kind: 'gap_fill', group: 'general', creditKey: 'material.generate', required: ['questions'], allowed: ['text', 'questions'], questionTypes: ['gap', 'single_choice'], count: counts(8, 12, 20) }),
  /*#__PURE__*/ spec({ kind: 'vocabulary', group: 'general', creditKey: 'material.generate', required: ['words', 'questions'], allowed: ['words', 'questions', 'text'], questionTypes: ['single_choice', 'matching', 'gap', 'short_answer'], count: counts(8, 12, 20) }),
  /*#__PURE__*/ spec({ kind: 'grammar', group: 'general', creditKey: 'material.generate', required: ['text', 'questions'], allowed: ['text', 'questions'], questionTypes: ['single_choice', 'gap', 'transformation', 'error_correction', 'ordering'], count: counts(8, 12, 20) }),
  /*#__PURE__*/ spec({ kind: 'error_correction', group: 'general', creditKey: 'material.generate', required: ['questions'], allowed: ['text', 'questions'], questionTypes: ['error_correction', 'single_choice'], count: counts(8, 12, 16) }),
  /*#__PURE__*/ spec({ kind: 'speaking_cards', group: 'general', creditKey: 'material.generate', required: ['cards'], allowed: ['cards', 'words', 'text'], questionTypes: [], count: counts(4, 8, 12) }),
  /*#__PURE__*/ spec({ kind: 'dialogue', group: 'general', creditKey: 'material.generate', required: ['script'], allowed: ['script', 'questions', 'words', 'cards'], questionTypes: ['single_choice', 'true_false', 'gap', 'short_answer'], count: counts(4, 6, 8), sourced: 'script' }),
  /*#__PURE__*/ spec({ kind: 'writing_task', group: 'general', creditKey: 'material.generate', required: ['task', 'model_answer', 'rubric'], allowed: ['task', 'model_answer', 'rubric', 'text', 'words'], questionTypes: [], count: counts(1, 1, 1) }),
  /*#__PURE__*/ spec({ kind: 'quiz', group: 'general', creditKey: 'material.generate', required: ['questions'], allowed: ['questions', 'text'], questionTypes: ['single_choice', 'multi_choice', 'true_false', 'true_false_not_given', 'matching', 'gap', 'short_answer', 'numeric'], count: counts(10, 15, 25), autoMarkable: true, options: 4 }),
  /*#__PURE__*/ spec({ kind: 'homework', group: 'general', creditKey: 'material.generate', required: ['questions'], allowed: ['text', 'script', 'questions', 'words', 'task'], questionTypes: [...ALL_QUESTIONS, 'open'], count: counts(8, 12, 16) }),
  // T10: a quiz written for the class game (short stems, choice answers).
  /*#__PURE__*/ spec({ kind: 'live_quiz', group: 'general', creditKey: 'quiz.pack', required: ['questions'], allowed: ['questions'], questionTypes: ['single_choice', 'true_false'], count: counts(10, 15, 20), autoMarkable: true, options: 4, variants: false }),

  // --- Exam-style sets -------------------------------------------------------------------
  /*#__PURE__*/ spec({ kind: 'ielts_reading', group: 'exam', exam: 'ielts', creditKey: 'material.exam_set', required: ['text', 'questions'], allowed: ['text', 'questions'], questionTypes: ['single_choice', 'multi_choice', 'true_false_not_given', 'yes_no_not_given', 'matching', 'gap', 'short_answer'], count: counts(7, 13, 40), sourced: 'passage' }),
  /*#__PURE__*/ spec({ kind: 'ielts_listening', group: 'exam', exam: 'ielts', creditKey: 'material.exam_set', required: ['script', 'questions'], allowed: ['script', 'questions'], questionTypes: ['single_choice', 'multi_choice', 'matching', 'gap', 'short_answer'], count: counts(10, 20, 40), sourced: 'script' }),
  /*#__PURE__*/ spec({ kind: 'ielts_writing', group: 'exam', exam: 'ielts', creditKey: 'material.exam_set', required: ['task', 'model_answer', 'rubric'], allowed: ['task', 'model_answer', 'rubric', 'text'], questionTypes: [], count: counts(1, 1, 2) }),
  /*#__PURE__*/ spec({ kind: 'ielts_speaking', group: 'exam', exam: 'ielts', creditKey: 'material.exam_set', required: ['cards'], allowed: ['cards', 'rubric', 'words'], questionTypes: [], count: counts(1, 3, 3) }),
  /*#__PURE__*/ spec({ kind: 'toefl_2026', group: 'exam', exam: 'toefl_2026', creditKey: 'material.exam_set', required: [], allowed: ['text', 'script', 'questions', 'task', 'model_answer', 'rubric', 'cards'], questionTypes: ['single_choice', 'gap', 'ordering', 'open'], count: counts(5, 10, 15) }),
  /*#__PURE__*/ spec({ kind: 'multilevel', group: 'exam', exam: 'multilevel', creditKey: 'material.exam_set', required: [], allowed: ['text', 'script', 'questions', 'task', 'model_answer', 'rubric', 'cards'], questionTypes: ['single_choice', 'matching', 'gap', 'open'], count: counts(6, 8, 12) }),
  /*#__PURE__*/ spec({ kind: 'sat_reading_writing', group: 'exam', exam: 'sat', creditKey: 'material.exam_set', required: ['questions'], allowed: ['questions'], questionTypes: ['single_choice'], count: counts(6, 12, /*#__PURE__*/ satModuleQuestions('reading_writing')), options: 4, autoMarkable: true }),
  /*#__PURE__*/ spec({ kind: 'sat_math', group: 'exam', exam: 'sat', creditKey: 'material.exam_set', required: ['questions'], allowed: ['questions'], questionTypes: ['single_choice', 'numeric'], count: counts(6, 12, /*#__PURE__*/ satModuleQuestions('math')), options: 4, autoMarkable: true }),
  /*#__PURE__*/ spec({ kind: 'admission_math', group: 'exam', exam: 'admission_math', creditKey: 'material.exam_set', required: ['questions'], allowed: ['questions', 'text'], questionTypes: ['single_choice'], count: counts(10, 20, 30), options: 4, autoMarkable: true }),

  // --- Planning and practice -------------------------------------------------------------
  /*#__PURE__*/ spec({ kind: 'lesson_plan', group: 'planning', creditKey: 'lesson.plan', required: ['stages'], allowed: ['stages', 'text', 'questions', 'words', 'cards', 'task'], questionTypes: ['single_choice', 'gap', 'short_answer', 'true_false'], count: counts(4, 6, 8), variants: false }),
  /*#__PURE__*/ spec({ kind: 'course_outline', group: 'planning', creditKey: 'course.outline', required: ['outline'], allowed: ['outline', 'text'], questionTypes: [], count: counts(6, 10, 14), variants: false }),
  /*#__PURE__*/ spec({ kind: 'slide_outline', group: 'planning', creditKey: 'material.generate', required: ['slides'], allowed: ['slides'], questionTypes: [], count: counts(6, 10, 15), variants: false }),
  /*#__PURE__*/ spec({ kind: 'flashcards', group: 'planning', creditKey: 'material.generate', required: ['flashcards'], allowed: ['flashcards'], questionTypes: [], count: counts(12, 20, 30) }),

  // --- Textbook to lesson (T9) ------------------------------------------------------------
  /*#__PURE__*/ spec({ kind: 'textbook_lesson', group: 'textbook', creditKey: 'textbook.lesson', required: ['questions', 'cards'], allowed: ['text', 'questions', 'cards', 'task', 'words'], questionTypes: [...ALL_QUESTIONS, 'open'], count: counts(8, 12, 16), vision: true }),

  // --- Placement tests (the centre's C5; not made in the Studio) -----------------------------
  // Objective items (single choice and gaps, each with its level), plus writing and
  // speaking tasks with their rubrics, which a teacher marks.
  /*#__PURE__*/ spec({ kind: 'placement_test', group: 'placement', creditKey: 'placement.generate', required: ['questions'], allowed: ['questions', 'task', 'rubric', 'text'], questionTypes: ['single_choice', 'gap'], count: counts(18, 30, 42), autoMarkable: true, levelled: true, variants: false, playable: false }),
].map((entry) => [entry.kind, entry]));

export const MATERIAL_KIND_IDS = /*#__PURE__*/ Object.keys(MATERIAL_KINDS);
export const isMaterialKind = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(MATERIAL_KINDS, value);
export const materialKind = (kind: string): MaterialKindSpec | null => (isMaterialKind(kind) ? MATERIAL_KINDS[kind] : null);
/** A kind the Materials Studio makes (every group but placement). */
export const isStudioKind = (kind: string): boolean => (STUDIO_GROUPS as readonly string[]).includes(materialKind(kind)?.group ?? '');
/** The kinds the Studio makes, in table order. */
export const STUDIO_KIND_IDS = /*#__PURE__*/ MATERIAL_KIND_IDS.filter(isStudioKind);

/** The exact credit key and add-ons a brief costs (three levels add `material.differentiate`). */
export function materialCredit(brief: Pick<MaterialBrief, 'kind' | 'variants'>): { key: CreditKey; addOns: CreditKey[] } {
  const kind = materialKind(brief.kind);
  if (!kind) throw new Error(`unknown_material_kind: ${brief.kind}`);
  return { key: kind.creditKey, addOns: brief.variants && kind.variants ? ['material.differentiate'] : [] };
}

/** Questions (or items) the brief asks for: the teacher's number, else the kind's default for the length. */
export const plannedCount = (brief: Pick<MaterialBrief, 'kind' | 'length' | 'questions'>): number => {
  const kind = materialKind(brief.kind);
  if (!kind) return 0;
  return Math.max(1, Math.min(brief.questions ?? kind.count[brief.length], 60));
};

/** Problems with a brief that the generator cannot fix: wrong exam target, unknown kind. Empty means fine. */
export function briefProblems(brief: MaterialBrief): string[] {
  const kind = materialKind(brief.kind);
  // Placement tests are written by the centre's own builder, never from a Studio brief.
  if (!kind || !isStudioKind(kind.kind)) return ['kind'];
  const problems: string[] = [];
  if (kind.exam) {
    if (brief.exam && brief.exam.format !== kind.exam) problems.push('exam.format');
    const target = EXAM_TARGETS[kind.exam];
    const section = sectionOf(kind.kind, brief);
    if (section && !target.sections.includes(section)) problems.push('exam.section');
    const task = brief.exam?.task;
    if (task && section && target.tasks?.[section] && !target.tasks[section].includes(task)) problems.push('exam.task');
    if ((kind.kind === 'toefl_2026' || kind.kind === 'multilevel') && !(brief.exam?.section && brief.exam.task)) problems.push('exam.task');
  } else if (brief.exam) problems.push('exam');
  if (brief.variants && !kind.variants) problems.push('variants');
  return problems;
}

/** The exam section a kind targets (fixed by the kind or chosen in the brief). */
export function sectionOf(kind: string, brief: Pick<MaterialBrief, 'exam'>): string | undefined {
  switch (kind) {
    case 'ielts_reading': return 'reading';
    case 'ielts_listening': return 'listening';
    case 'ielts_writing': return 'writing';
    case 'ielts_speaking': return 'speaking';
    case 'sat_reading_writing': return 'reading_writing';
    case 'sat_math': case 'admission_math': return 'math';
    default: return brief.exam?.section;
  }
}

const chunk = (total: number, size: number): number[] => {
  const parts = Math.max(1, Math.ceil(total / size));
  const base = Math.floor(total / parts), extra = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
};

/**
 * The model calls a brief becomes, in order. Solving the key without the answers (T2)
 * is planned separately by the function once the questions exist (solveChunks).
 */
export function generationPlan(brief: MaterialBrief): GenerationStep[] {
  const kind = materialKind(brief.kind);
  if (!kind) throw new Error(`unknown_material_kind: ${brief.kind}`);
  const total = plannedCount(brief);
  const steps: GenerationStep[] = [];
  const push = (step: Omit<GenerationStep, 'id'>) => steps.push({ ...step, id: `${step.produce}-${step.part}${step.variant ? `-${step.variant}` : ''}` });

  if (kind.kind === 'ielts_reading' || kind.kind === 'ielts_listening') {
    const section = kind.kind === 'ielts_reading' ? 'reading' : 'listening';
    const structure = IELTS_STRUCTURE[section];
    // Full set: the test's own parts; shorter sets: one part with the asked number.
    const perPart = total >= structure.questions ? [...structure.perPart] : chunk(total, section === 'reading' ? 14 : 10);
    const words: readonly [number, number] = section === 'reading' ? (brief.length === 'short' ? [450, 600] : [700, 900]) : [450, 700];
    perPart.forEach((questions, part) => {
      push({ produce: 'source', part, words, focus: section === 'listening' ? `IELTS Listening part ${part + 1}` : `IELTS Reading passage ${part + 1}` });
      push({ produce: 'questions', part, questions, questionTypes: kind.questionTypes, examTypes: ieltsTypesFor(section) });
    });
  } else if (kind.sourced) {
    const words: readonly [number, number] = kind.kind === 'dialogue' ? [150, 300] : brief.length === 'short' ? [200, 320] : brief.length === 'long' ? [450, 650] : [300, 450];
    push({ produce: 'source', part: 0, words });
    chunk(total, 14).forEach((questions, index) => push({ produce: 'questions', part: index, questions, questionTypes: kind.questionTypes }));
  } else if (kind.kind === 'toefl_2026') {
    const task = brief.exam?.task as keyof typeof TOEFL_TASK_MAP;
    const map = TOEFL_TASK_MAP[task];
    if (map && map.needsText !== 'none' && map.questions[0] !== 'open') {
      push({ produce: 'source', part: 0, words: task === 'read_academic_passage' || task === 'listen_academic_talk' ? [200, 320] : [80, 180], focus: `TOEFL 2026 task ${task}` });
      push({ produce: 'questions', part: 0, questions: Math.min(total, 14), questionTypes: map.questions, examTypes: [task] });
    } else {
      chunk(total, 10).forEach((questions, part) => push({ produce: 'content', part, questions, questionTypes: map?.questions ?? kind.questionTypes, examTypes: task ? [task] : undefined, focus: `TOEFL 2026 task ${task}` }));
    }
  } else if (kind.kind === 'multilevel') {
    const section = brief.exam?.section, part = brief.exam?.task ?? '';
    const type = MULTILEVEL_PART_MAP[part];
    if ((section === 'reading' || section === 'listening') && type) {
      push({ produce: 'source', part: 0, words: section === 'reading' ? [250, 450] : [200, 400], focus: `Multilevel ${section} part type ${part}` });
      push({ produce: 'questions', part: 0, questions: Math.min(total, 12), questionTypes: [type], examTypes: [part] });
    } else push({ produce: 'content', part: 0, questions: total, questionTypes: ['open'], examTypes: [part], focus: `Multilevel ${section} ${part}` });
  } else {
    // Whole materials, or several chunks of at most 10–15 questions.
    const size = kind.group === 'exam' ? 10 : 15;
    const parts = kind.questionTypes.length ? chunk(total, size) : [total];
    const satFocus = kind.kind === 'sat_reading_writing' || kind.kind === 'sat_math' ? brief.exam?.domain : undefined;
    parts.forEach((questions, part) => push({ produce: 'content', part, questions, questionTypes: kind.questionTypes, focus: satFocus }));
  }

  if (brief.variants && kind.variants) {
    const parts = [...new Set(steps.map((step) => step.part))];
    for (const variant of ['support', 'stretch'] as const) for (const part of parts) push({ produce: 'variant', part, variant });
  }
  return steps;
}

/** Splits questions into solver calls of at most `size` (each call sees its own source text). */
export const solveChunks = (count: number, size = 20): number[] => (count ? chunk(count, size) : []);
