import type { MaterialKindDefinition } from '../materials.ts';
import * as s from '../schema.ts';
import type { Schema } from '../schema.ts';
import { CEFR_LEVELS, PLACEMENT_KIND as PLACEMENT_KIND_ID, placementMarkdown, type CefrLevel, type PlacementItem, type PlacementTest } from './centre-placement-markdown.ts';

export { CEFR_LEVELS, LEVEL_LABEL, placementMarkdown, PLACEMENT_KIND } from './centre-placement-markdown.ts';
export type { CefrLevel, PlacementItem, PlacementSection, PlacementTest } from './centre-placement-markdown.ts';

// The centre placement test (C5), a library material of kind `centre.placement_test`:
// objective items (multiple choice and gap fill, each tagged with a CEFR level and
// keyed), optional writing and speaking tasks marked by AI and confirmed by a
// teacher, and the cut scores that turn the objective score into a level.
// Shared by the app (builder, test screen, print) and the function (marking).
// The objective item format is the centre's own until the teacher area's quiz
// schema in packages/ai-core/src/materials/ is available to map onto.

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

/** Deterministic checks of the key and the structure; empty when the test is sound. */
export function placementProblems(test: PlacementTest): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  if (CEFR_LEVELS.indexOf(test.from_level) > CEFR_LEVELS.indexOf(test.to_level)) problems.push('The level range is reversed.');
  for (const sec of test.sections) {
    if (ids.has(`s:${sec.id}`)) problems.push(`Section id ${sec.id} is used twice.`);
    ids.add(`s:${sec.id}`);
    if (sec.kind === 'objective') {
      if (!sec.items?.length) problems.push(`Section “${sec.title}” has no items.`);
      for (const entry of sec.items ?? []) {
        if (ids.has(entry.id)) problems.push(`Item id ${entry.id} is used twice.`);
        ids.add(entry.id);
        if (entry.type === 'mcq') {
          if (!entry.options || entry.options.length < 2) problems.push(`Item ${entry.id}: a multiple-choice item needs at least two options.`);
          else {
            if (entry.answer === undefined || entry.answer >= entry.options.length) problems.push(`Item ${entry.id}: the key is not one of the options.`);
            const unique = new Set(entry.options.map((option) => option.trim().toLowerCase()));
            if (unique.size !== entry.options.length) problems.push(`Item ${entry.id}: two options are the same, so more than one could be the key.`);
          }
          if (entry.accept?.length) problems.push(`Item ${entry.id}: a multiple-choice item cannot also have gap answers.`);
        } else {
          if (!entry.accept?.length) problems.push(`Item ${entry.id}: a gap needs at least one accepted answer.`);
          if (!/_{2,}|\[\s*\]|…/.test(entry.prompt)) problems.push(`Item ${entry.id}: the gap is not marked in the prompt (use ___).`);
        }
      }
    } else {
      if (!sec.prompt) problems.push(`Section “${sec.title}” has no task.`);
      if (sec.items?.length) problems.push(`Section “${sec.title}” is ${sec.kind}; it cannot have objective items.`);
    }
  }
  if (!test.sections.some((sec) => sec.kind === 'objective')) problems.push('The test needs at least one objective section to place a learner.');
  const levels = test.bands.map((band) => band.level);
  if (new Set(levels).size !== levels.length) problems.push('Each level may have only one cut score.');
  const sorted = [...test.bands].sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level));
  for (let i = 1; i < sorted.length; i++) if (sorted[i].min_percent <= sorted[i - 1].min_percent) problems.push('Higher levels need higher cut scores.');
  return problems;
}

const normalise = (value: string) => value.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').replace(/[.!?,;:]+$/, '').trim();
/** Whether an answer matches an item's key. */
export function itemCorrect(entry: PlacementItem, answer: unknown): boolean {
  if (entry.type === 'mcq') return typeof answer === 'number' ? answer === entry.answer : typeof answer === 'string' && /^\d$/.test(answer) && Number(answer) === entry.answer;
  return typeof answer === 'string' && (entry.accept ?? []).some((accepted) => normalise(accepted) === normalise(answer));
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
