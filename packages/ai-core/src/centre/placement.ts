import type { MaterialKindDefinition } from '../materials.ts';
import * as s from '../schema.ts';
import type { Schema } from '../schema.ts';
import {
  checkMaterial, isCorrect, MATERIAL_SCHEMA, questionLevel, toCefrLevel,
  type Block, type KeyIssue, type KeyIssueCode, type Material, type Question, type QuestionsBlock,
} from '../materials/mod.ts';
import { CEFR_LEVELS, PLACEMENT_KIND as PLACEMENT_KIND_ID, placementMarkdown, type CefrLevel, type PlacementItem, type PlacementTest } from './placement-markdown.ts';

export { CEFR_LEVELS, LEVEL_LABEL, placementMarkdown, PLACEMENT_KIND } from './placement-markdown.ts';
export type { CefrLevel, PlacementItem, PlacementSection, PlacementTest } from './placement-markdown.ts';

// The centre placement test (C5), a library material of kind `centre.placement_test`:
// objective items (multiple choice and gap fill, each tagged with a CEFR level and
// keyed), optional writing and speaking tasks marked by AI and confirmed by a
// teacher, and the cut scores that turn the objective score into a level.
// Shared by the app (builder, test screen, print) and the function (marking).
//
// The builder and the test screen keep this compact shape (items carry their own
// CEFR level; cut scores sit next to them). For keys and marking it maps onto the
// teacher area's material model (packages/ai-core/src/materials/): placementMaterial()
// turns a test into question sets, tasks and rubrics, the teacher's deterministic key
// checks find broken keys, and the teacher's comparison marks answers, so a placement
// item is checked and marked exactly like a worksheet question.

const level = s.enumOf(CEFR_LEVELS);
const item = s.object({
  id: s.string({ min: 1, max: 20, pattern: /^[a-z0-9_-]+$/i }),
  type: s.enumOf(['mcq', 'gap'] as const),
  level,
  prompt: s.string({ min: 3, max: 600 }),
  /** Multiple choice: 2 to 6 options and the index of the key. */
  options: s.optional(s.array(s.string({ min: 1, max: 200 }), { min: 2, max: 6 })),
  answer: s.optional(s.number({ min: 0, max: 5, integer: true })),
  /** Gap fill: every accepted answer (compared without case, extra spaces or final punctuation). */
  accept: s.optional(s.array(s.string({ min: 1, max: 80 }), { min: 1, max: 8 })),
});
const section = s.object({
  id: s.string({ min: 1, max: 20, pattern: /^[a-z0-9_-]+$/i }),
  title: s.string({ min: 1, max: 120 }),
  kind: s.enumOf(['objective', 'writing', 'speaking'] as const),
  instructions: s.optional(s.string({ max: 600 })),
  items: s.optional(s.array(item, { max: 80 })),
  /** Writing and speaking: the task, its length and the criteria it is marked on. */
  prompt: s.optional(s.string({ min: 10, max: 1200 })),
  min_words: s.optional(s.number({ min: 0, max: 600, integer: true })),
  criteria: s.optional(s.array(s.string({ min: 2, max: 60 }), { max: 6 })),
});
const testShape = s.object({
  title: s.string({ min: 3, max: 160 }),
  from_level: level,
  to_level: level,
  minutes: s.optional(s.number({ min: 5, max: 180, integer: true })),
  instructions: s.optional(s.string({ max: 1200 })),
  sections: s.array(section, { min: 1, max: 8 }),
  /** Objective score cut-offs: the highest level whose min_percent is met. */
  bands: s.array(s.object({ level, min_percent: s.number({ min: 0, max: 100 }) }), { min: 1, max: 7 }),
});
/** The builders mark optional fields at run time; the interfaces above say so to TypeScript. */
export const placementTestSchema = testShape as unknown as Schema<PlacementTest>;

export const DEFAULT_CRITERIA = { writing: ['Task response', 'Organisation', 'Vocabulary', 'Grammar'], speaking: ['Fluency', 'Vocabulary', 'Grammar', 'Pronunciation'] } as const;

const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
/** A centre level (`pre_a1`, `b2`) in the teacher model's form (`Pre-A1`, `B2`). */
export const materialLevel = (level: CefrLevel): string => toCefrLevel(level) ?? 'A1';
/** The teacher model's level back as a centre level; null for anything else (exam bands). */
export const centreLevel = (level: string | null | undefined): CefrLevel | null => {
  const cefr = toCefrLevel(level);
  return cefr ? (cefr === 'Pre-A1' ? 'pre_a1' : cefr.toLowerCase() as CefrLevel) : null;
};

/** One placement item as a teacher-model question (single choice or gap). */
export function itemQuestion(entry: PlacementItem, id: string): Question {
  if (entry.type === 'mcq') {
    const options = (entry.options ?? []).map((text, at) => ({ id: OPTION_IDS[at] ?? `O${at + 1}`, text }));
    // A key outside the options stays visible to the checks as an unknown option id.
    const answer = entry.answer === undefined ? [] : [options[entry.answer]?.id ?? `X${entry.answer + 1}`];
    return { id, type: 'single_choice', prompt: entry.prompt, options, answer, level: materialLevel(entry.level) };
  }
  return { id, type: 'gap', prompt: entry.prompt, answer: entry.accept ?? [], level: materialLevel(entry.level) };
}

/**
 * The test in the teacher material model: one question set per objective section,
 * a task and a rubric per writing or speaking section. `itemOf` maps the model's
 * question ids (q1, q2…) back to the test's own item ids.
 */
export function placementMaterial(test: PlacementTest): { material: Material; itemOf: Map<string, string> } {
  const blocks: Block[] = [];
  const itemOf = new Map<string, string>();
  let n = 0;
  test.sections.forEach((sec, index) => {
    const id = `s${index + 1}`;
    if (sec.kind === 'objective') {
      const questions = (sec.items ?? []).map((entry) => { const qid = `q${++n}`; itemOf.set(qid, entry.id); return itemQuestion(entry, qid); });
      if (questions.length) blocks.push({ id, type: 'questions', title: sec.title, instructions: sec.instructions?.trim() || 'Choose or write the answer.', questions });
      return;
    }
    if (!sec.prompt) return;
    blocks.push({ id, type: 'task', title: sec.title, prompt: sec.prompt, ...(sec.min_words ? { words: { min: sec.min_words, max: Math.max(sec.min_words * 3, sec.min_words + 50) } } : {}) });
    const criteria = sec.criteria?.length ? sec.criteria : DEFAULT_CRITERIA[sec.kind];
    blocks.push({ id: `${id}-rubric`, type: 'rubric', title: `${sec.title}: criteria`, for: id, criteria: criteria.map((name, at) => ({ id: `c${at + 1}`, name, description: name, max: 5 })) });
  });
  return {
    material: { schema: MATERIAL_SCHEMA, kind: 'placement_test', title: test.title, level: materialLevel(test.to_level), topic: 'Placement test', instruction_language: 'en', ...(test.minutes ? { minutes: test.minutes } : {}), blocks },
    itemOf,
  };
}

const ISSUE_TEXT: Partial<Record<KeyIssueCode, string>> = {
  key_missing: 'has no key', mcq_key_count: 'needs exactly one key', key_not_in_options: 'the key is not one of the options',
  options_missing: 'has no options', options_too_few: 'needs at least two options', options_duplicate: 'two options are the same, so more than one could be the key',
  gap_marker_missing: 'the gap is not marked in the prompt (use ___)', gap_multiple: 'has more than one gap; use one gap per item',
  duplicate_question: 'uses an id that is already taken',
};
/** The teacher checks that make an item unusable; a gap without its marker too, since the taker must see where it goes. */
const isBlocking = (issue: KeyIssue) => issue.level === 'error' || issue.code === 'gap_marker_missing';

/** Deterministic checks of the key and the structure; empty when the test is sound. */
export function placementProblems(test: PlacementTest): string[] {
  const problems: string[] = [];
  const sections = new Set<string>(), items = new Set<string>();
  if (CEFR_LEVELS.indexOf(test.from_level) > CEFR_LEVELS.indexOf(test.to_level)) problems.push('The level range is reversed.');
  for (const sec of test.sections) {
    if (sections.has(sec.id)) problems.push(`Section id ${sec.id} is used twice.`);
    sections.add(sec.id);
    if (sec.kind === 'objective') {
      if (!sec.items?.length) problems.push(`Section “${sec.title}” has no items.`);
      for (const entry of sec.items ?? []) {
        if (items.has(entry.id)) problems.push(`Item id ${entry.id} is used twice.`);
        items.add(entry.id);
        if (entry.type === 'mcq' && entry.accept?.length) problems.push(`Item ${entry.id}: a multiple-choice item cannot also have gap answers.`);
        if (entry.type === 'gap' && entry.options?.length) problems.push(`Item ${entry.id}: a gap cannot also have options.`);
      }
    } else {
      if (!sec.prompt) problems.push(`Section “${sec.title}” has no task.`);
      if (sec.items?.length) problems.push(`Section “${sec.title}” is ${sec.kind}; it cannot have objective items.`);
    }
  }
  // The teacher area's key checks, item by item.
  const { material, itemOf } = placementMaterial(test);
  const seen = new Set<string>();
  for (const issue of checkMaterial(material).issues) {
    const text = issue.question && ISSUE_TEXT[issue.code];
    if (!isBlocking(issue) || !text) continue;
    const line = `Item ${itemOf.get(issue.question!) ?? issue.question}: ${text}.`;
    if (!seen.has(line)) { seen.add(line); problems.push(line); }
  }
  if (!test.sections.some((sec) => sec.kind === 'objective')) problems.push('The test needs at least one objective section to place a learner.');
  const levels = test.bands.map((band) => band.level);
  if (new Set(levels).size !== levels.length) problems.push('Each level may have only one cut score.');
  const sorted = [...test.bands].sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level));
  for (let i = 1; i < sorted.length; i++) if (sorted[i].min_percent <= sorted[i - 1].min_percent) problems.push('Higher levels need higher cut scores.');
  return problems;
}

/** Whether an answer matches an item's key, by the teacher model's comparison (an option index; gap text without case, spacing or final punctuation). */
export function itemCorrect(entry: PlacementItem, answer: unknown): boolean {
  const question = itemQuestion(entry, 'q1');
  if (entry.type === 'mcq') {
    const index = typeof answer === 'number' ? answer : typeof answer === 'string' && /^\d$/.test(answer) ? Number(answer) : null;
    const option = index === null ? undefined : question.options?.[index];
    return !!option && isCorrect(question, [option.id]);
  }
  return typeof answer === 'string' && answer.trim() !== '' && isCorrect(question, [answer]);
}

/**
 * Items from a teacher-model question set written for one level (the AI draft of a
 * placement test): single-choice questions become multiple choice and gaps stay gaps;
 * other types are left out. Ids are `<prefix>1`, `<prefix>2`…
 */
export function itemsFromQuestions(block: Pick<QuestionsBlock, 'questions' | 'level'>, fallback: CefrLevel, prefix: string): PlacementItem[] {
  const items: PlacementItem[] = [];
  for (const question of block.questions) {
    const id = `${prefix}${items.length + 1}`.slice(0, 20);
    const level = centreLevel(questionLevel(question, block)) ?? fallback;
    if (question.type === 'single_choice' && question.options?.length) {
      const answer = question.options.findIndex((option) => option.id === question.answer[0]);
      items.push({ id, type: 'mcq', level, prompt: question.prompt, options: question.options.slice(0, 6).map((option) => option.text), ...(answer >= 0 && answer < 6 ? { answer } : {}) });
    } else if (question.type === 'gap') {
      items.push({ id, type: 'gap', level, prompt: question.prompt, accept: question.answer.slice(0, 8) });
    }
  }
  return items;
}

export interface ObjectiveScore { correct: number; total: number; percent: number; by_level: Record<string, { correct: number; total: number }>; level: CefrLevel | null; ceiling: CefrLevel | null }
/** The objective score, the level its cut scores give, and the highest level answered at least 60% right. */
export function scoreObjective(test: PlacementTest, answers: Record<string, unknown>): ObjectiveScore {
  const byLevel: Record<string, { correct: number; total: number }> = {};
  let correct = 0, total = 0;
  for (const sec of test.sections) for (const entry of sec.kind === 'objective' ? sec.items ?? [] : []) {
    total++;
    const right = itemCorrect(entry, answers[entry.id]);
    if (right) correct++;
    byLevel[entry.level] ??= { correct: 0, total: 0 };
    byLevel[entry.level].total++;
    if (right) byLevel[entry.level].correct++;
  }
  const percent = total ? Math.round((correct / total) * 1000) / 10 : 0;
  const met = [...test.bands].sort((a, b) => CEFR_LEVELS.indexOf(b.level) - CEFR_LEVELS.indexOf(a.level)).find((band) => percent >= band.min_percent);
  let ceiling: CefrLevel | null = null;
  for (const code of CEFR_LEVELS) { const row = byLevel[code]; if (row && row.total && row.correct / row.total >= 0.6) ceiling = code; }
  return { correct, total, percent, by_level: byLevel, level: met?.level ?? null, ceiling };
}

/** The test without its keys, for the person taking it. */
export function publicTest(test: PlacementTest) {
  return {
    title: test.title, from_level: test.from_level, to_level: test.to_level, minutes: test.minutes ?? null, instructions: test.instructions ?? null,
    sections: test.sections.map((sec) => ({
      id: sec.id, title: sec.title, kind: sec.kind, instructions: sec.instructions ?? null, prompt: sec.prompt ?? null, min_words: sec.min_words ?? null,
      items: (sec.items ?? []).map((entry) => ({ id: entry.id, type: entry.type, prompt: entry.prompt, options: entry.type === 'mcq' ? entry.options ?? [] : null })),
    })),
  };
}

export const placementKind: MaterialKindDefinition<PlacementTest> = {
  kind: PLACEMENT_KIND_ID,
  schema: placementTestSchema,
  toMarkdown: placementMarkdown,
};
