import { overallScale } from './assess.ts';
import { snap } from './text.ts';
import type { CoachPack, LevelScale, Milestone } from './types.ts';

// The learner model per coach: a level and a 0–1 mastery per skill node, how much
// evidence it rests on, and recurring errors that decay over time. Milestones turn
// repeated, scored results into level-ups.

export interface ErrorTally { count: number; weight: number; lastAt: string }
export interface MasteryState {
  node: string;
  /** Moving average in scale units; null for nodes measured only by accuracy. */
  level: number | null;
  /** 0–1. */
  mastery: number;
  evidence: number;
  lastScore: number | null;
  lastAt: string | null;
  errors: Record<string, ErrorTally>;
}

const DAY = 86_400_000;
/** An error's weight halves every week without it. */
export const decayed = (tally: ErrorTally, now: Date) => tally.weight * 0.5 ** (Math.max(0, now.getTime() - Date.parse(tally.lastAt)) / (7 * DAY));

/**
 * One new result for a node. `score` is on `scale` (a band, a CEFR level) or
 * `accuracy` is 0–1 (a quiz). Early results move the estimate quickly; later ones
 * settle at a 25% step so one bad day does not erase a month.
 */
export function updateMastery(previous: MasteryState | null, node: string, update: { score?: number | null; accuracy?: number | null; scale: LevelScale; at: Date; errors?: string[] }): MasteryState {
  const state: MasteryState = previous ? { ...previous, errors: { ...previous.errors } } : { node, level: null, mastery: 0, evidence: 0, lastScore: null, lastAt: null, errors: {} };
  const alpha = Math.max(0.25, 1 / (state.evidence + 1));
  const { scale } = update;
  if (typeof update.score === 'number' && Number.isFinite(update.score)) {
    const score = Math.min(scale.max, Math.max(scale.min, update.score));
    state.level = state.level === null ? score : Math.round((state.level + alpha * (score - state.level)) * 1000) / 1000;
    state.mastery = Math.round(((state.level - scale.min) / (scale.max - scale.min)) * 1000) / 1000;
    state.lastScore = score;
    state.evidence += 1;
  } else if (typeof update.accuracy === 'number' && Number.isFinite(update.accuracy)) {
    const accuracy = Math.min(1, Math.max(0, update.accuracy));
    state.mastery = state.evidence ? Math.round((state.mastery + alpha * (accuracy - state.mastery)) * 1000) / 1000 : accuracy;
    state.lastScore = Math.round(accuracy * 100) / 100;
    state.evidence += 1;
  }
  for (const tag of update.errors ?? []) {
    const tally = state.errors[tag];
    state.errors[tag] = { count: (tally?.count ?? 0) + 1, weight: (tally ? decayed(tally, update.at) : 0) + 1, lastAt: update.at.toISOString() };
  }
  state.lastAt = update.at.toISOString();
  return state;
}

/** Errors that keep coming back (decayed weight of at least 1.5), worst first. */
export function recurringErrors(rows: readonly MasteryState[], now: Date, min = 1.5): { tag: string; weight: number; count: number }[] {
  const totals = new Map<string, { weight: number; count: number }>();
  for (const row of rows) for (const [tag, tally] of Object.entries(row.errors)) {
    const entry = totals.get(tag) ?? { weight: 0, count: 0 };
    entry.weight += decayed(tally, now); entry.count += tally.count;
    totals.set(tag, entry);
  }
  return [...totals.entries()].filter(([, value]) => value.weight >= min).map(([tag, value]) => ({ tag, weight: Math.round(value.weight * 100) / 100, count: value.count })).sort((a, b) => b.weight - a.weight);
}

/** The level of a node, or the mean of its children's levels when it has none itself. */
export function nodeLevel(pack: CoachPack, rows: ReadonlyMap<string, MasteryState>, node: string): number | null {
  const own = rows.get(node)?.level;
  if (own !== null && own !== undefined) return own;
  const children = pack.manifest.skills.filter((skill) => skill.parent === node).map((skill) => rows.get(skill.id)?.level).filter((value): value is number => typeof value === 'number');
  return children.length ? children.reduce((a, b) => a + b, 0) / children.length : null;
}

// --- Predicted level -----------------------------------------------------------------------------------

export interface ResultPoint { at: string; value: number }
export interface Prediction {
  current: number | null;
  predicted: number | null;
  /** Change per week the learner's own results show (median of pairwise slopes). */
  perWeek: number | null;
  confidence: 'low' | 'medium' | null;
  reason: 'ok' | 'need_more_results';
}

/**
 * From the learner's own results only, never from outside norms: the recent level
 * and the trend of their results (Theil–Sen slope, robust to one odd day). The
 * forecast is capped at one scale point above now and needs three results over a
 * week or more.
 */
export function predict(scale: LevelScale, points: readonly ResultPoint[], weeksLeft: number, round: 'step' | 'half_up' | 'down' = 'step'): Prediction {
  const sorted = [...points].filter((point) => Number.isFinite(point.value)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!sorted.length) return { current: null, predicted: null, perWeek: null, confidence: null, reason: 'need_more_results' };
  const recent = sorted.slice(-5);
  const current = snap(scale, recent.reduce((sum, point) => sum + point.value, 0) / recent.length, round);
  const span = (Date.parse(sorted.at(-1)!.at) - Date.parse(sorted[0].at)) / DAY;
  if (sorted.length < 3 || span < 7) return { current, predicted: null, perWeek: null, confidence: null, reason: 'need_more_results' };
  const slopes: number[] = [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const weeks = (Date.parse(sorted[j].at) - Date.parse(sorted[i].at)) / (7 * DAY);
    if (weeks >= 1 / 7) slopes.push((sorted[j].value - sorted[i].value) / weeks);
  }
  slopes.sort((a, b) => a - b);
  const perWeek = slopes.length ? slopes[Math.floor(slopes.length / 2)] : 0;
  const raw = current + perWeek * Math.max(0, weeksLeft);
  const predicted = snap(scale, Math.min(current + 1, Math.max(current - 0.5, raw)), round);
  return { current, predicted, perWeek: Math.round(perWeek * 100) / 100, confidence: sorted.length >= 6 ? 'medium' : 'low', reason: 'ok' };
}

// --- Milestones ------------------------------------------------------------------------------------------

export interface ScoredResult { sessionId: string; rubric: string; at: string; overall: number | null; criteria: Record<string, number | null> }

/**
 * Milestones newly reached: `count` results on the rubric's metric at or above `min`
 * within `withinDays` of the latest. Only the highest new milestone per rubric is
 * returned, so a jump is one level-up, not a stack of them.
 */
export function reachedMilestones(pack: CoachPack, results: readonly ScoredResult[], achieved: ReadonlySet<string>, now: Date): { milestone: Milestone; results: ScoredResult[] }[] {
  const best = new Map<string, { milestone: Milestone; results: ScoredResult[] }>();
  // A milestone at or below one already reached on the same rubric is never issued later.
  const top = new Map<string, number>();
  for (const milestone of pack.milestones) if (achieved.has(milestone.id)) top.set(milestone.rule.rubric, Math.max(top.get(milestone.rule.rubric) ?? -Infinity, milestone.level));
  for (const milestone of pack.milestones) {
    if (achieved.has(milestone.id) || milestone.level <= (top.get(milestone.rule.rubric) ?? -Infinity)) continue;
    const since = now.getTime() - milestone.rule.withinDays * DAY;
    const qualifying = results
      .filter((result) => result.rubric === milestone.rule.rubric && Date.parse(result.at) >= since)
      .filter((result) => { const value = milestone.rule.metric === 'overall' ? result.overall : result.criteria[milestone.rule.metric]; return typeof value === 'number' && value >= milestone.rule.min - 1e-9; });
    const sessions = [...new Map(qualifying.map((result) => [result.sessionId, result])).values()];
    if (sessions.length < milestone.rule.count) continue;
    const current = best.get(milestone.rule.rubric);
    if (!current || milestone.level > current.milestone.level) best.set(milestone.rule.rubric, { milestone, results: sessions.slice(-milestone.rule.count) });
  }
  return [...best.values()];
}

/** The overall scale of a pack rubric, for formatting results. */
export const resultScale = (pack: CoachPack, rubricId: string): LevelScale => {
  const rubric = pack.rubricById.get(rubricId);
  return rubric ? overallScale(rubric) : pack.manifest.scale;
};
