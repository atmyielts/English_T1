import { snap } from './text.ts';
import type { CoachPack, Diagnostic, DiagnosticItem } from './types.ts';

// The placement diagnostic: auto-scored, no model calls, open to everyone (also
// before they link a Schood account). Answers travel in Telegram button data
// (64 bytes), so a person who has not linked yet needs no storage: two bits per
// item, packed after a sentinel bit and written in base 36 (30 items fit in 12
// characters).

/** Can-do answers: 0 Yes, 1 Partly, 2 Not yet. */
export const CAN_DO_CREDIT = [1, 0.5, 0] as const;

export function encodeAnswers(answers: readonly number[]): string {
  let value = 1n;
  for (const answer of answers) {
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) throw new Error('answer out of range');
    value = (value << 2n) | BigInt(answer);
  }
  return value.toString(36);
}

export function decodeAnswers(code: string, max = 30): number[] | null {
  if (!/^[0-9a-z]{1,13}$/.test(code)) return null;
  let value = 0n;
  for (const char of code) value = value * 36n + BigInt(parseInt(char, 36));
  const out: number[] = [];
  while (value > 1n) { out.unshift(Number(value & 3n)); value >>= 2n; if (out.length > max) return null; }
  return value === 1n ? out : null;
}

export interface SkillEstimate { skill: string; level: number | null; correct: number; total: number; selfRated: boolean }
export interface DiagnosticResult {
  skills: SkillEstimate[];
  overall: number;
  answered: number;
  correct: number;
  questions: number;
  /** A sensible target: the first goal option above the estimate. */
  suggestedTarget: number;
}

const credit = (item: DiagnosticItem, answer: number) => (item.kind === 'question' ? (answer === item.answer ? 1 : 0) : CAN_DO_CREDIT[answer] ?? 0);

/**
 * Highest level reached: every level up to it has at least `passRatio` of its
 * credit (one missed level is forgiven when the next one is reached, since a
 * single item is noisy). Half a step is added when the next level is partly right.
 */
function estimate(levels: Map<number, { got: number; of: number }>, passRatio: number, pack: CoachPack): number {
  const sorted = [...levels.entries()].sort((a, b) => a[0] - b[0]);
  const reached = sorted.map(([, value]) => value.of > 0 && value.got / value.of >= passRatio - 1e-9);
  let top = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (reached[i]) top = i;
    else if (!(reached[i + 1] && i > 0)) break;
  }
  const scale = pack.manifest.scale;
  if (top < 0) return snap(scale, sorted[0][0] - scale.step);
  let value = sorted[top][0];
  const next = sorted[top + 1];
  if (next && next[1].of > 0 && next[1].got / next[1].of >= 0.34) value += (next[0] - value) / 2;
  return snap(scale, value);
}

export function scoreDiagnostic(pack: CoachPack, answers: readonly number[]): DiagnosticResult {
  const d: Diagnostic = pack.diagnostic;
  const bySkill = new Map<string, { levels: Map<number, { got: number; of: number }>; correct: number; total: number; selfRated: boolean }>();
  let correct = 0, questions = 0;
  d.items.forEach((item, index) => {
    const answer = answers[index];
    if (answer === undefined) return;
    const entry = bySkill.get(item.skill) ?? { levels: new Map(), correct: 0, total: 0, selfRated: true };
    if (item.kind === 'question') {
      entry.selfRated = false;
      questions += 1;
      if (answer === item.answer) { correct += 1; entry.correct += 1; }
      entry.total += 1;
    }
    const level = entry.levels.get(item.level) ?? { got: 0, of: 0 };
    level.got += credit(item, answer);
    level.of += 1;
    entry.levels.set(item.level, level);
    bySkill.set(item.skill, entry);
  });
  const skills: SkillEstimate[] = [...bySkill.entries()].map(([skill, entry]) => ({
    skill, level: entry.levels.size ? estimate(entry.levels, d.passRatio, pack) : null, correct: entry.correct, total: entry.total, selfRated: entry.selfRated,
  }));
  // Measured skills count twice as much as self-ratings.
  let sum = 0, weight = 0;
  for (const skill of skills) if (skill.level !== null) { const w = skill.selfRated ? 1 : 2; sum += skill.level * w; weight += w; }
  const scale = pack.manifest.scale;
  const overall = snap(scale, weight ? sum / weight : pack.plan.goal.default);
  const options = [...pack.plan.goal.options].sort((a, b) => a - b);
  const suggestedTarget = options.find((option) => option >= overall + scale.step) ?? options.at(-1)!;
  return { skills, overall, answered: answers.length, correct, questions, suggestedTarget };
}

/** The item a person is on, or null when they have answered everything. */
export const nextItem = (pack: CoachPack, answered: number): DiagnosticItem | null => pack.diagnostic.items[answered] ?? null;
