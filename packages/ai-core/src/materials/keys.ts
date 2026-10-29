import { SchemaError, type Schema } from '../schema.ts';
import { examTypesFor } from './formats.ts';
import { materialKind, solveChunks } from './kinds.ts';
import {
  CHOICE_TYPES, FIXED_OPTIONS, SINGLE_KEY_TYPES, TEXT_TYPES, versions,
  type Block, type Choice, type Material, type Question, type QuestionsBlock,
} from './model.ts';

// T2 checked answer keys, the deterministic half: every material's keys are checked
// without a model (one key per single-choice question, the key exists in the options,
// gap answers fit the gap, its word limit, its word box and its source text, counts
// match the brief), then a second model call solves the questions without the key
// (solverTasks → compareSolver). Disagreements and failed checks go on the review card.

export type KeyIssueCode =
  | 'block_missing' | 'block_not_allowed' | 'type_not_allowed' | 'exam_type_not_allowed' | 'not_auto_markable'
  | 'key_missing' | 'mcq_key_count' | 'key_not_in_options' | 'options_missing' | 'options_too_few' | 'options_duplicate' | 'option_count'
  | 'multi_key_count' | 'ordering_key_incomplete' | 'matching_options_too_few'
  | 'gap_marker_missing' | 'gap_multiple' | 'gap_answer_too_long' | 'gap_answer_not_in_box' | 'gap_answer_not_in_source' | 'word_box_too_small'
  | 'cloze_marker_unknown' | 'numeric_key_invalid' | 'open_has_key' | 'source_missing'
  | 'question_count' | 'variant_count' | 'duplicate_question' | 'key_position_bias';
export interface KeyIssue {
  code: KeyIssueCode;
  level: 'error' | 'warning';
  version: 'core' | 'support' | 'stretch';
  block?: string;
  question?: string;
  /** The question's printed number in its version. */
  number?: number;
  params?: Record<string, string | number>;
}
export interface KeyCheckReport { questions: number; autoMarkable: number; errors: number; warnings: number; issues: KeyIssue[] }

// --- Answers and their comparison ----------------------------------------------------------

const ARTICLES = /^(the|a|an)\s+/;
/** Case, spacing, quotes and trailing punctuation do not change an answer. */
export function normaliseAnswer(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[’‘`ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}\s'.,%/+\-−]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/(\s*[.,])+$/g, '').trim();
}
const loose = (value: string) => normaliseAnswer(value).replace(ARTICLES, '').replace(/[.,'"]/g, '').replace(/\s+/g, ' ').trim();
export const wordCount = (value: string): number => value.trim().split(/\s+/).filter(Boolean).length;

/** A number written as 12, 12.5, 12,5, −3, 3/4, 1 1/2 or 40%; null when it is not one. */
export function parseNumber(value: string): number | null {
  const raw = value.trim().replace(/−/g, '-').replace(/\s*%$/, '');
  const mixed = /^(-?\d+)\s+(\d+)\/(\d+)$/.exec(raw);
  if (mixed) return Number(mixed[1]) + Math.sign(Number(mixed[1]) || 1) * Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(raw);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const decimal = raw.replace(/^(-?\d+),(\d+)$/, '$1.$2');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(decimal)) return null;
  return Number(decimal);
}

/** An answer to an option id: the id, a letter, a 1-based number or the option's text. */
export function optionFor(answer: string, options: readonly Choice[]): string | null {
  const raw = answer.trim();
  const byId = options.find((option) => option.id.toLowerCase() === raw.toLowerCase());
  if (byId) return byId.id;
  const judgement: Record<string, string> = { true: 'T', false: 'F', yes: 'Y', no: 'N', 'not given': 'NG', notgiven: 'NG' };
  const judged = judgement[normaliseAnswer(raw)];
  if (judged && options.some((option) => option.id === judged)) return judged;
  const letter = /^\(?([A-Pa-p])[).:\]]?$/.exec(raw);
  if (letter) {
    const byLetter = options.find((option) => option.id.toLowerCase() === letter[1].toLowerCase());
    if (byLetter) return byLetter.id;
  }
  if (/^[1-9]\d?$/.test(raw) && options[Number(raw) - 1] && !options.some((option) => /^\d+$/.test(option.id))) return options[Number(raw) - 1].id;
  const byText = options.find((option) => loose(option.text) === loose(raw));
  return byText ? byText.id : null;
}

/** The options a question's answers refer to: its own, its set's shared list, or the fixed judgement set. */
export const optionsOf = (question: Question, block?: Pick<QuestionsBlock, 'options'>): readonly Choice[] =>
  question.options?.length ? question.options : FIXED_OPTIONS[question.type] ?? block?.options ?? [];

/** Whether `given` answers the question correctly. Used by the solver comparison, the Live Quiz and auto-marking. */
export function isCorrect(question: Question, given: readonly string[], block?: Pick<QuestionsBlock, 'options'>): boolean {
  if (question.type === 'open' || !question.answer.length) return false;
  if (CHOICE_TYPES.includes(question.type)) {
    const options = optionsOf(question, block);
    const ids = given.map((entry) => optionFor(entry, options) ?? `?${entry}`);
    if (question.type === 'ordering') return ids.length === question.answer.length && ids.every((entry, index) => entry === question.answer[index]);
    if (question.type === 'multi_choice') return new Set(ids).size === question.answer.length && ids.every((entry) => question.answer.includes(entry));
    return ids.length === 1 && ids[0] === question.answer[0];
  }
  if (question.type === 'numeric') {
    const key = parseNumber(question.answer[0] ?? ''), value = given.length ? parseNumber(given[0]) : null;
    if (key === null || value === null) return false;
    const tolerance = question.tolerance ?? Math.max(1e-9, Math.abs(key) * 1e-6);
    return Math.abs(key - value) <= tolerance;
  }
  const accepted = new Set(question.answer.map(loose));
  return given.some((entry) => accepted.has(loose(entry)));
}

// --- Deterministic checks -----------------------------------------------------------------------

const GAP = /_{3,}/g;
const CLOZE = /\[\[([a-z][a-z0-9_-]{0,30})\]\]/g;
const sourceText = (block: Block | undefined): string | null => {
  if (!block) return null;
  if (block.type === 'text') return block.body;
  if (block.type === 'script') return block.lines.map((line) => line.text).join('\n');
  return null;
};
const containsPhrase = (haystack: string, phrase: string) => {
  const target = loose(phrase);
  if (!target) return false;
  return ` ${loose(haystack)} `.includes(` ${target} `);
};

/** Every deterministic check over every version of the material. `expectedQuestions` is the brief's count. */
export function checkMaterial(material: Material, options: { expectedQuestions?: number } = {}): KeyCheckReport {
  const issues: KeyIssue[] = [];
  const spec = materialKind(material.kind);
  let questions = 0, autoMarkable = 0, coreCount = 0;
  for (const version of versions(material)) {
    const add = (issue: Omit<KeyIssue, 'version'>) => issues.push({ ...issue, version: version.label });
    const blocksById = new Map(version.blocks.map((block) => [block.id, block]));
    const cloze = new Set<string>();
    for (const block of version.blocks) if (block.type === 'text') for (const match of block.body.matchAll(CLOZE)) cloze.add(match[1]);
    const ids = new Set<string>();

    // Kind rules.
    if (spec) {
      for (const type of spec.required) if (!version.blocks.some((block) => block.type === type)) add({ code: 'block_missing', level: 'error', params: { type } });
      for (const block of version.blocks) if (!spec.allowed.includes(block.type)) add({ code: 'block_not_allowed', level: 'warning', block: block.id, params: { type: block.type } });
    }
    const allowedExamTypes = material.exam ? examTypesFor(material.exam.format, material.exam.section) : null;

    let number = 0, singleChoice = 0;
    const positions = new Map<number, number>();
    const prompts = new Map<string, number>();
    for (const block of version.blocks) {
      if (block.type !== 'questions') continue;
      const source = block.source ? blocksById.get(block.source) : undefined;
      if (block.source && !sourceText(source)) add({ code: 'source_missing', level: 'error', block: block.id });
      if (block.word_box && block.word_box.length <= block.questions.filter((question) => question.type === 'gap').length) add({ code: 'word_box_too_small', level: 'warning', block: block.id, params: { words: block.word_box.length } });
      const headings = block.exam_type === 'question_matching_headings' || block.exam_type === 'headings';
      const matching = block.questions.filter((question) => question.type === 'matching' && !question.options?.length).length;
      if (matching && (block.options?.length ?? 0) < (headings ? matching + 1 : 2)) add({ code: 'matching_options_too_few', level: headings ? 'error' : 'warning', block: block.id, params: { options: block.options?.length ?? 0, questions: matching } });

      for (const question of block.questions) {
        number++;
        questions++;
        const at = { block: block.id, question: question.id, number };
        if (ids.has(question.id)) add({ code: 'duplicate_question', level: 'error', ...at, params: { id: question.id } });
        ids.add(question.id);
        if (spec && !spec.questionTypes.includes(question.type)) add({ code: 'type_not_allowed', level: 'warning', ...at, params: { type: question.type } });
        const examType = question.exam_type ?? block.exam_type;
        if (allowedExamTypes && examType && !allowedExamTypes.includes(examType)) add({ code: 'exam_type_not_allowed', level: 'warning', ...at, params: { exam_type: examType } });
        if (question.type === 'open') {
          if (spec?.autoMarkable) add({ code: 'not_auto_markable', level: 'error', ...at });
          if (question.answer.length) add({ code: 'open_has_key', level: 'warning', ...at });
          continue;
        }
        autoMarkable++;
        const prompt = normaliseAnswer(question.prompt);
        if (prompt.length > 12) {
          if (prompts.has(prompt)) add({ code: 'duplicate_question', level: 'warning', ...at, params: { same_as: prompts.get(prompt)! } });
          else prompts.set(prompt, number);
        }
        if (!question.answer.length) { add({ code: 'key_missing', level: 'error', ...at }); continue; }

        if (CHOICE_TYPES.includes(question.type)) {
          const pool = optionsOf(question, block);
          if (!pool.length) { add({ code: 'options_missing', level: 'error', ...at }); continue; }
          if (pool.length < 2) add({ code: 'options_too_few', level: 'error', ...at, params: { options: pool.length } });
          const texts = pool.map((option) => loose(option.text));
          if (new Set(texts).size !== texts.length) add({ code: 'options_duplicate', level: 'error', ...at });
          if (new Set(pool.map((option) => option.id)).size !== pool.length) add({ code: 'options_duplicate', level: 'error', ...at });
          // One key per single-choice question, and it is one of the options.
          if (SINGLE_KEY_TYPES.includes(question.type) && question.answer.length !== 1) add({ code: 'mcq_key_count', level: 'error', ...at, params: { keys: question.answer.length } });
          for (const key of question.answer) if (!pool.some((option) => option.id === key)) add({ code: 'key_not_in_options', level: 'error', ...at, params: { key } });
          if (question.type === 'multi_choice') {
            const wanted = question.choose ?? question.answer.length;
            if (question.answer.length !== wanted || wanted < 2 || wanted >= pool.length) add({ code: 'multi_key_count', level: 'error', ...at, params: { keys: question.answer.length, choose: wanted } });
          }
          if (question.type === 'ordering' && (question.answer.length !== pool.length || new Set(question.answer).size !== pool.length)) add({ code: 'ordering_key_incomplete', level: 'error', ...at });
          if (question.type === 'single_choice') {
            singleChoice++;
            if (spec?.options && pool.length !== spec.options) add({ code: 'option_count', level: 'warning', ...at, params: { options: pool.length, expected: spec.options } });
            const position = pool.findIndex((option) => option.id === question.answer[0]);
            if (position >= 0) positions.set(position, (positions.get(position) ?? 0) + 1);
          }
          continue;
        }
        if (question.type === 'numeric') {
          if (question.answer.length !== 1 || parseNumber(question.answer[0]) === null) add({ code: 'numeric_key_invalid', level: 'error', ...at, params: { key: question.answer.join(' / ') } });
          continue;
        }
        if (TEXT_TYPES.includes(question.type)) {
          const limited = question.type === 'gap' || question.type === 'short_answer';
          if (limited && block.word_limit) for (const answer of question.answer) if (wordCount(answer) > block.word_limit) add({ code: 'gap_answer_too_long', level: 'error', ...at, params: { answer, limit: block.word_limit } });
          const text = sourceText(source);
          if (limited && block.from_source && text && !question.answer.some((answer) => containsPhrase(text, answer))) add({ code: 'gap_answer_not_in_source', level: 'error', ...at, params: { answer: question.answer[0] } });
          if (question.type !== 'gap') continue;
          // Gap answers fit: exactly one gap, and from the word box when there is one.
          const gaps = (question.prompt.match(GAP) ?? []).length;
          if (gaps > 1) add({ code: 'gap_multiple', level: 'error', ...at, params: { gaps } });
          else if (gaps === 0 && !cloze.has(question.id)) add({ code: 'gap_marker_missing', level: question.prompt.trim() ? 'warning' : 'error', ...at });
          if (block.word_box?.length && !block.word_box.some((word) => loose(word) === loose(question.answer[0]))) add({ code: 'gap_answer_not_in_box', level: 'error', ...at, params: { answer: question.answer[0] } });
        }
      }
    }
    for (const id of cloze) if (!ids.has(id)) add({ code: 'cloze_marker_unknown', level: 'error', params: { id } });
    if (singleChoice >= 8) {
      for (const [position, count] of positions) if (count / singleChoice > 0.6) add({ code: 'key_position_bias', level: 'warning', params: { option: String.fromCharCode(65 + position), share: Math.round((count / singleChoice) * 100) } });
    }
    if (version.label === 'core') {
      coreCount = number;
      // Counts match the brief: planned questions (or items for kinds without questions).
      if (options.expectedQuestions && spec?.questionTypes.length && number !== options.expectedQuestions) add({ code: 'question_count', level: 'error', params: { expected: options.expectedQuestions, actual: number } });
    } else if (number !== coreCount) add({ code: 'variant_count', level: 'warning', params: { expected: coreCount, actual: number } });
  }
  return {
    questions, autoMarkable,
    errors: issues.filter((issue) => issue.level === 'error').length,
    warnings: issues.filter((issue) => issue.level === 'warning').length,
    issues,
  };
}

// --- Solving without the key (the second model call) ---------------------------------------------

export interface SolverQuestion { id: string; number: number; type: Question['type']; instructions: string; prompt: string; options?: Choice[]; choose?: number; word_limit?: number; word_box?: string[] }
export interface SolverTask { version: 'core' | 'support' | 'stretch'; sources: { id: string; title?: string; text: string }[]; questions: SolverQuestion[] }

/** The questions without their answers or explanations, in calls of at most `size`, each with the texts it needs. */
export function solverTasks(material: Material, size = 20): SolverTask[] {
  const tasks: SolverTask[] = [];
  for (const version of versions(material)) {
    const byId = new Map(version.blocks.map((block) => [block.id, block]));
    const cloze = version.blocks.filter((block) => block.type === 'text' && /\[\[[a-z][a-z0-9_-]{0,30}\]\]/.test(block.body));
    // Balanced calls: 45 questions become 15 + 15 + 15, not 20 + 20 + 5.
    const asked = version.blocks.reduce((sum, block) => sum + (block.type === 'questions' ? block.questions.filter((question) => question.type !== 'open').length : 0), 0);
    const sizes = solveChunks(asked, size);
    let number = 0, chunkIndex = -1;
    let current: SolverTask | null = null;
    for (const block of version.blocks) {
      if (block.type !== 'questions') continue;
      for (const question of block.questions) {
        number++;
        if (question.type === 'open') continue;
        if (!current || current.questions.length >= sizes[chunkIndex]) { chunkIndex++; current = { version: version.label, sources: [], questions: [] }; tasks.push(current); }
        const source = block.source ? byId.get(block.source) : undefined;
        const text = sourceText(source);
        if (source && text && !current.sources.some((entry) => entry.id === source.id)) current.sources.push({ id: source.id, ...(source.title ? { title: source.title } : {}), text });
        for (const passage of cloze) if (passage.type === 'text' && passage.body.includes(`[[${question.id}]]`) && !current.sources.some((entry) => entry.id === passage.id)) current.sources.push({ id: passage.id, text: passage.body });
        const options = question.options?.length ? question.options : FIXED_OPTIONS[question.type] ? [...FIXED_OPTIONS[question.type]!] : block.options;
        current.questions.push({
          id: question.id, number, type: question.type, instructions: block.instructions, prompt: question.prompt,
          ...(options?.length ? { options } : {}), ...(question.choose ? { choose: question.choose } : {}),
          ...(block.word_limit ? { word_limit: block.word_limit } : {}), ...(block.word_box?.length ? { word_box: block.word_box } : {}),
        });
      }
    }
  }
  return tasks;
}

export interface SolverAnswer { id: string; answer: string[]; reason?: string }
/** The solver's reply: an answer per question id (lists or a single value accepted). */
export const solverAnswersSchema: Schema<{ answers: SolverAnswer[] }> = {
  parse(value, path = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaError(path, 'expected an object');
    const raw = (value as Record<string, unknown>).answers;
    if (!Array.isArray(raw)) throw new SchemaError('answers', 'expected a list');
    return {
      answers: raw.slice(0, 200).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        if (typeof row.id !== 'string') return [];
        const list = Array.isArray(row.answer) ? row.answer : row.answer === undefined || row.answer === null ? [] : [row.answer];
        const answer = list.flatMap((item) => (typeof item === 'string' || typeof item === 'number' ? [String(item).trim()] : [])).filter(Boolean).slice(0, 12);
        const reason = typeof row.reason === 'string' ? row.reason.trim().slice(0, 400) : undefined;
        return [{ id: row.id.trim(), answer, ...(reason ? { reason } : {}) }];
      }),
    };
  },
  json: { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, answer: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } }, required: ['id', 'answer'] } } }, required: ['answers'] },
};

export interface SolverDisagreement { version: 'core' | 'support' | 'stretch'; question: string; number: number; key: string[]; solver: string[]; reason?: string }
export interface SolverComparison { asked: number; agreed: number; disagreements: SolverDisagreement[]; unanswered: { version: string; question: string; number: number }[] }

/** Compares the solver's answers with the key, question by question, in every version. */
export function compareSolver(material: Material, answers: readonly SolverAnswer[]): SolverComparison {
  const given = new Map(answers.map((entry) => [entry.id, entry]));
  const out: SolverComparison = { asked: 0, agreed: 0, disagreements: [], unanswered: [] };
  for (const version of versions(material)) {
    let number = 0;
    for (const block of version.blocks) {
      if (block.type !== 'questions') continue;
      for (const question of block.questions) {
        number++;
        if (question.type === 'open' || !question.answer.length) continue;
        out.asked++;
        const reply = given.get(question.id);
        if (!reply || !reply.answer.length) { out.unanswered.push({ version: version.label, question: question.id, number }); continue; }
        if (isCorrect(question, reply.answer, block)) out.agreed++;
        else out.disagreements.push({ version: version.label, question: question.id, number, key: question.answer, solver: reply.answer, ...(reply.reason ? { reason: reply.reason } : {}) });
      }
    }
  }
  return out;
}

/** What the review card shows (stored as ai_generations.verification). */
export interface Verification {
  version: 1;
  checks: KeyCheckReport;
  solver: (SolverComparison & { status: 'done' | 'skipped' | 'partial' }) | null;
  /** Ready to approve without a second look: no errors and the solver agreed with every key. */
  clean: boolean;
}
export function verification(checks: KeyCheckReport, solver: Verification['solver']): Verification {
  const solverClean = !solver || (solver.disagreements.length === 0 && solver.unanswered.length === 0 && solver.status === 'done');
  return { version: 1, checks, solver, clean: checks.errors === 0 && solverClean };
}
