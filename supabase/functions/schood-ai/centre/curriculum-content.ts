import { LEVEL_LABEL, materialLevel, type CefrLevel } from '../../../../packages/ai-core/src/centre/placement.ts';
import {
  answerKey, checkMaterial, draftContentSchema, MATERIAL_SCHEMA, parseMaterial, questionBlocks, renumber,
  type DraftContent, type InstructionLanguage, type KeyIssueCode, type Material, type Stage, type StagesBlock,
} from '../../../../packages/ai-core/src/materials/mod.ts';
import { SchemaError } from '../../../../packages/ai-core/src/mod.ts';

// The content of one curriculum unit (C12), in the teacher area's material model: a
// `lesson_plan` material with one `stages` block per lesson (timed stages with aims and
// steps, and homework) and the unit test as a `questions` block of single-choice items.
// The model's reply is read with the teacher's lenient reader, the test key goes
// through the teacher's deterministic checks, and the library page and the Academy
// lessons are made from the same material.

export interface UnitContent {
  title: string;
  can_do: string[];
  material: Material;
  /** Problems left after the correction turn, shown to the reviewer. */
  problems?: string[];
}
/** What the review screen and Academy publishing read from a unit. */
export interface LessonView { title: string; minutes: number; aims: string[]; stages: Stage[]; homework: string | null }
export interface TestItemView { prompt: string; options: string[]; answer: number }

/** A unit that has been written (planned units hold only their planned can-do aims). */
export const isUnitContent = (value: unknown): value is UnitContent => {
  const material = value && typeof value === 'object' ? (value as { material?: { schema?: unknown; blocks?: unknown } }).material : undefined;
  return !!material && material.schema === MATERIAL_SCHEMA && Array.isArray(material.blocks);
};

export const unitDraftSchema = draftContentSchema('single_choice');
export const UNIT_TEST_ITEMS = { min: 4, max: 12 } as const;

/** The task for the model, in the shape the teacher's reader takes. */
export const unitTask = (input: { track: string; level: CefrLevel; lessons: number; minutes: number }) => [
  `Write one unit of a ${input.track} English course at CEFR ${LEVEL_LABEL[input.level] ?? input.level}.`,
  `Reply with {"title","aims":[2-5 can-do aims],"blocks":[...]}: first exactly ${input.lessons} blocks {"type":"stages","title":"<lesson title>","stages":[{"name","minutes","aim","steps":[...]}],"homework"}, one per lesson, each with 3-8 stages whose minutes add up to ${input.minutes};`,
  `then one block {"type":"questions","title":"Unit test","instructions","questions":[...]} with 6-10 single_choice items (4 options with ids A-D, exactly one correct, "answer":["<id>"]).`,
].join(' ');

/** The model's draft as a unit: renumbered blocks inside a teacher-model material. */
export function unitFromDraft(draft: DraftContent, input: { course: string; level: CefrLevel; language: InstructionLanguage; lessons: number; minutes: number; fallbackTitle: string }): UnitContent {
  const title = (draft.title ?? input.fallbackTitle).slice(0, 160);
  const can_do = (draft.aims ?? []).slice(0, 10);
  const total = input.lessons * input.minutes;
  const material: Material = {
    schema: MATERIAL_SCHEMA, kind: 'lesson_plan', title, level: materialLevel(input.level), topic: input.course.slice(0, 200),
    instruction_language: input.language, ...(can_do.length ? { aims: can_do } : {}), ...(total <= 600 ? { minutes: total } : {}),
    blocks: renumber(draft.blocks),
  };
  return { title, can_do, material };
}

const ISSUE_TEXT: Partial<Record<KeyIssueCode, string>> = {
  key_missing: 'has no key', mcq_key_count: 'needs exactly one key', key_not_in_options: 'the key is not one of the options',
  options_missing: 'has no options', options_too_few: 'needs at least two options', options_duplicate: 'two options are the same',
  duplicate_question: 'repeats another item',
};

/** Deterministic checks of a unit; empty when it is sound. */
export function unitProblems(unit: UnitContent, lessons: number, minutes: number): string[] {
  const problems: string[] = [];
  try { parseMaterial(unit.material); } catch (cause) {
    problems.push(cause instanceof SchemaError ? `The unit does not fit the material format (${cause.path}: ${cause.message}).` : 'The unit does not fit the material format.');
  }
  if (!unit.can_do.length) problems.push('The unit has no can-do aims.');
  const plans = unit.material.blocks.filter((block): block is StagesBlock => block.type === 'stages');
  if (plans.length !== lessons) problems.push(`The unit has ${plans.length} lessons; ${lessons} were asked for.`);
  plans.forEach((plan, index) => {
    const total = plan.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    if (Math.abs(total - minutes) > Math.max(5, minutes * 0.1)) problems.push(`Lesson ${index + 1}: the stages add up to ${total} minutes, not ${minutes}.`);
    if (plan.stages.length < 3) problems.push(`Lesson ${index + 1} needs at least three stages.`);
    if (!plan.homework?.trim()) problems.push(`Lesson ${index + 1} has no homework.`);
  });
  const items = questionBlocks(unit.material.blocks).flatMap((block) => block.questions);
  if (items.length < UNIT_TEST_ITEMS.min || items.length > UNIT_TEST_ITEMS.max) problems.push(`The unit test has ${items.length} items; ${UNIT_TEST_ITEMS.min} to ${UNIT_TEST_ITEMS.max} are needed.`);
  if (items.some((item) => item.type !== 'single_choice')) problems.push('Every unit test item must be multiple choice.');
  // The teacher area's key checks.
  const seen = new Set<string>();
  for (const issue of checkMaterial(unit.material).issues) {
    const text = issue.level === 'error' && issue.number ? ISSUE_TEXT[issue.code] : undefined;
    if (!text) continue;
    const line = `Test item ${issue.number}: ${text}.`;
    if (!seen.has(line)) { seen.add(line); problems.push(line); }
  }
  return problems;
}

/** The lessons of a unit, in order. */
export function unitLessons(unit: UnitContent): LessonView[] {
  return unit.material.blocks.filter((block): block is StagesBlock => block.type === 'stages').map((plan, index) => ({
    title: plan.title ?? `Lesson ${index + 1}`,
    minutes: plan.stages.reduce((sum, stage) => sum + stage.minutes, 0),
    aims: [...new Set(plan.stages.map((stage) => stage.aim))].slice(0, 4),
    stages: plan.stages,
    homework: plan.homework ?? null,
  }));
}

/** The unit test with the key as an option index (for the review screen). */
export function unitTest(unit: UnitContent): TestItemView[] {
  return questionBlocks(unit.material.blocks).flatMap((block) => block.questions).filter((item) => item.type === 'single_choice' && item.options?.length).map((item) => ({
    prompt: item.prompt, options: item.options!.map((option) => option.text), answer: item.options!.findIndex((option) => option.id === item.answer[0]),
  }));
}

/** What the review screen shows. */
export const unitView = (unit: UnitContent) => ({ title: unit.title, can_do: unit.can_do, lessons: unitLessons(unit), test: unitTest(unit), problems: unit.problems ?? [] });

const cell = (value: string) => value.replace(/\|/g, '/').replace(/\n/g, ' ');
function stagesMarkdown(lesson: LessonView): string[] {
  return [
    '| Stage | Minutes | Aim | Steps |', '|---|---|---|---|',
    ...lesson.stages.map((stage) => `| ${cell(stage.name)} | ${stage.minutes} | ${cell(stage.aim)} | ${cell(stage.steps.join('; '))} |`),
    '', ...(lesson.homework ? [`**Homework:** ${lesson.homework}`] : []),
  ];
}

/** The library page of a unit (staff copy, with the key). */
export function unitMarkdown(input: { curriculum: string; level: string; position: number; unit: UnitContent }): string {
  const { unit } = input;
  const level = LEVEL_LABEL[input.level as CefrLevel] ?? input.level.toUpperCase();
  const lines = [`# ${input.curriculum} · ${level} · Unit ${input.position}: ${unit.title}`, '', '## Can-do aims', ...unit.can_do.map((aim) => `- ${aim}`), ''];
  unitLessons(unit).forEach((lesson, index) => lines.push(`## Lesson ${index + 1}: ${lesson.title} (${lesson.minutes} min)`, '', ...stagesMarkdown(lesson), ''));
  const test = unitTest(unit);
  lines.push('## Unit test', '');
  test.forEach((item, index) => lines.push(`${index + 1}. ${item.prompt}`, ...item.options.map((option, at) => `   ${String.fromCharCode(65 + at)}. ${option}`)));
  lines.push('', '## Answer key (staff only)', '', answerKey(unit.material).map((entry) => `${entry.number} ${entry.answer}`).join(' · '));
  return lines.join('\n');
}

/** One lesson as Academy lesson content. */
export function lessonMarkdown(lesson: LessonView): string {
  return [...(lesson.aims.length ? ['**Aims**', ...lesson.aims.map((aim) => `- ${aim}`), ''] : []), ...stagesMarkdown(lesson)].join('\n');
}
