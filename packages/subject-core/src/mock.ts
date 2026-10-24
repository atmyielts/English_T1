import { findSection, type ExamFormat } from './format.ts';
import { blockShares, type Taxonomy } from './topics.ts';

// Weekly mock: the learner's exam section in the official question count, with questions
// spread over topics in proportion to their weight.

/** Minutes per question. The official duration is not yet verified; 90 questions in
 * 180 minutes is the usual reading, so mocks allow 2 minutes a question until checked. */
export const MOCK_MINUTES_PER_QUESTION = 2;

/** Questions per topic for one section, by largest remainder so the counts add up exactly. */
export function mockBlueprint(taxonomy: Taxonomy, format: ExamFormat, sectionId: string, available: ReadonlyMap<string, number>): Map<string, number> {
  const section = findSection(format, sectionId);
  const shares = [...blockShares(taxonomy, section.block)].filter(([code]) => (available.get(code) ?? 0) > 0);
  const counts = new Map<string, number>();
  const capacity = shares.reduce((sum, [code]) => sum + (available.get(code) ?? 0), 0);
  let remaining = Math.min(section.questions, capacity);
  if (!remaining) return counts;
  const total = shares.reduce((sum, [, share]) => sum + share, 0);
  const exact = shares.map(([code, share]) => ({ code, value: (share / total) * remaining }));
  for (const row of exact) counts.set(row.code, Math.min(Math.floor(row.value), available.get(row.code) ?? 0));
  remaining -= [...counts.values()].reduce((sum, value) => sum + value, 0);
  // Hand out what is left by largest remainder, then to any topic that still has spare questions.
  const order = [...exact].sort((a, b) => (b.value % 1) - (a.value % 1) || a.code.localeCompare(b.code));
  while (remaining > 0) {
    const next = order.find((row) => (counts.get(row.code) ?? 0) < (available.get(row.code) ?? 0) && (counts.get(row.code) ?? 0) < Math.ceil(row.value))
      ?? order.find((row) => (counts.get(row.code) ?? 0) < (available.get(row.code) ?? 0));
    if (!next) break;
    counts.set(next.code, (counts.get(next.code) ?? 0) + 1);
    remaining--;
  }
  for (const [code, value] of counts) if (!value) counts.delete(code);
  return counts;
}

export function mockMinutes(questions: number): number {
  return questions * MOCK_MINUTES_PER_QUESTION;
}

/** Share of other results strictly below this one, counting ties as half: 0–100. */
export function percentile(score: number, others: readonly number[]): number | null {
  if (!others.length) return null;
  const below = others.filter((value) => value < score).length, ties = others.filter((value) => value === score).length;
  return Math.round(((below + ties / 2) / others.length) * 100);
}

/** Monday of the week containing `day` (YYYY-MM-DD): weekly mocks are grouped by it. */
export function weekOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`), weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * 86_400_000).toISOString().slice(0, 10);
}
