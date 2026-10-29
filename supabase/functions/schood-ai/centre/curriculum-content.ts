import { LEVEL_LABEL, type CefrLevel } from '../../../../packages/ai-core/src/materials/centre-placement.ts';
import { s } from '../../../../packages/ai-core/src/mod.ts';

// The content of one curriculum unit (C12): lessons with stages, homework and a
// unit test with a key. This is the centre's provisional format. When the teacher
// area's material schemas (lesson plan, homework set, quiz) and their checked-key
// logic land in packages/ai-core/src/materials/, units are generated in those
// kinds instead and this file is replaced; the orchestration, review and
// publishing in curriculum.ts stay as they are.

export const unitSchema = s.object({
  title: s.string({ min: 3, max: 160 }),
  can_do: s.array(s.string({ min: 5, max: 200 }), { min: 1, max: 6 }),
  lessons: s.array(s.object({
    title: s.string({ min: 3, max: 160 }),
    aims: s.array(s.string({ min: 5, max: 200 }), { min: 1, max: 4 }),
    minutes: s.number({ min: 30, max: 180, integer: true }),
    stages: s.array(s.object({ name: s.string({ min: 2, max: 80 }), minutes: s.number({ min: 1, max: 90, integer: true }), activity: s.string({ min: 10, max: 700 }) }), { min: 3, max: 8 }),
    homework: s.string({ min: 10, max: 700 }),
  }), { min: 1, max: 6 }),
  test: s.array(s.object({ prompt: s.string({ min: 5, max: 300 }), options: s.array(s.string({ min: 1, max: 120 }), { min: 3, max: 4 }), answer: s.number({ min: 0, max: 3, integer: true }) }), { min: 4, max: 12 }),
});
export type UnitContent = s.Infer<typeof unitSchema>;

/** Deterministic checks of a generated unit; empty when it is sound. */
export function unitProblems(unit: UnitContent, lessons: number): string[] {
  const problems: string[] = [];
  if (unit.lessons.length !== lessons) problems.push(`The unit has ${unit.lessons.length} lessons; ${lessons} were asked for.`);
  unit.lessons.forEach((lesson, index) => {
    const total = lesson.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    if (Math.abs(total - lesson.minutes) > Math.max(5, lesson.minutes * 0.1)) problems.push(`Lesson ${index + 1}: the stages add up to ${total} minutes, not ${lesson.minutes}.`);
  });
  unit.test.forEach((item, index) => {
    if (item.answer >= item.options.length) problems.push(`Test item ${index + 1}: the key is not one of the options.`);
    if (new Set(item.options.map((option) => option.trim().toLowerCase())).size !== item.options.length) problems.push(`Test item ${index + 1}: two options are the same.`);
  });
  return problems;
}

export function unitMarkdown(input: { curriculum: string; level: string; position: number; unit: UnitContent }): string {
  const { unit } = input;
  const level = LEVEL_LABEL[input.level as CefrLevel] ?? input.level.toUpperCase();
  const lines = [`# ${input.curriculum} · ${level} · Unit ${input.position}: ${unit.title}`, '', '## Can-do aims', ...unit.can_do.map((aim) => `- ${aim}`), ''];
  unit.lessons.forEach((lesson, index) => {
    lines.push(`## Lesson ${index + 1}: ${lesson.title} (${lesson.minutes} min)`, '', '**Aims**', ...lesson.aims.map((aim) => `- ${aim}`), '', '| Stage | Minutes | Activity |', '|---|---|---|');
    for (const stage of lesson.stages) lines.push(`| ${stage.name.replace(/\|/g, '/')} | ${stage.minutes} | ${stage.activity.replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
    lines.push('', `**Homework:** ${lesson.homework}`, '');
  });
  lines.push('## Unit test', '');
  unit.test.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.prompt}`, ...item.options.map((option, at) => `   ${String.fromCharCode(65 + at)}. ${option}`));
  });
  lines.push('', '## Answer key (staff only)', '', unit.test.map((item, index) => `${index + 1} ${String.fromCharCode(65 + item.answer)}`).join(' · '));
  return lines.join('\n');
}

export function lessonMarkdown(lesson: UnitContent['lessons'][number]): string {
  return [
    '**Aims**', ...lesson.aims.map((aim) => `- ${aim}`), '',
    ...lesson.stages.map((stage) => `**${stage.name} (${stage.minutes} min).** ${stage.activity}`), '',
    `**Homework:** ${lesson.homework}`,
  ].join('\n');
}
