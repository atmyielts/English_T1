import type { Item } from '../../../packages/assessment-core/src/mod.ts';

/** An answer as the learner saw it: option text rather than an option id. */
export function answerText(item: Item, answer: unknown): string {
  const options = item.options ?? [];
  const label = (value: unknown) => options.find((option) => option.id === value)?.text ?? String(value);
  return Array.isArray(answer) ? answer.map(label).join(', ') : label(answer);
}

export const hasAnswer = (value: unknown) => Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null;
