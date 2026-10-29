import { quoteFound, snap } from './text.ts';
import type { LevelScale, Rubric } from './types.ts';

// Evidence-based scoring. The assessor (a model) proposes a score per criterion
// with quotes from the learner's own words; this module keeps only what can be
// checked: quotes that really appear in the answer, errors whose quote appears,
// upgrades of sentences the learner really said, scores on the rubric's scale.
// A criterion without enough real evidence is not scored. "Audio" criteria
// (pronunciation from a transcript) are never scored here.

export interface RawCriterion { id: string; score: number; evidence: { quote: string; comment: string }[]; next_step?: string }
export interface RawError { quote: string; correction: string; tag: string; explanation: string }
export interface RawUpgrade { said: string; better: string; why: string }
export interface RawAssessment { criteria: RawCriterion[]; errors?: RawError[]; upgrades?: RawUpgrade[]; summary?: string }

export type CriterionStatus = 'scored' | 'insufficient_evidence' | 'not_scored_audio' | 'missing';
export interface CriterionResult { id: string; score: number | null; status: CriterionStatus; evidence: { quote: string; comment: string }[]; nextStep: string | null }
export interface ErrorFound { quote: string; correction: string; tag: string; explanation: string }
export interface Upgrade { said: string; better: string; why: string }
export interface Assessment {
  rubric: string;
  overall: number | null;
  criteria: CriterionResult[];
  errors: ErrorFound[];
  upgrades: Upgrade[];
  summary: string;
  validQuotes: number;
  invalidQuotes: number;
}

/** The scale the overall result is reported on (IELTS: whole-band criteria, half-band overall). */
export const overallScale = (rubric: Rubric): LevelScale => ({ ...rubric.scale, step: rubric.overall.step ?? rubric.scale.step });

/** Weighted mean of the scored criteria, rounded the rubric's way; null when fewer than half are scored. */
export function overallOf(rubric: Rubric, scores: Record<string, number | null | undefined>): number | null {
  const scored = rubric.criteria.filter((criterion) => criterion.source === 'model');
  let sum = 0, weight = 0, count = 0;
  for (const criterion of scored) {
    const value = scores[criterion.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const w = criterion.weight ?? 1;
    sum += value * w; weight += w; count += 1;
  }
  if (!count || count < Math.ceil(scored.length / 2)) return null;
  return snap(overallScale(rubric), sum / weight, rubric.overall.round);
}

const clip = (text: unknown, max: number) => (typeof text === 'string' ? text.trim().slice(0, max) : '');

export function assess(rubric: Rubric, raw: RawAssessment, response: string, errorTags: ReadonlySet<string>): Assessment {
  let valid = 0, invalid = 0;
  const byId = new Map((raw.criteria ?? []).map((criterion) => [criterion.id, criterion]));
  const criteria: CriterionResult[] = rubric.criteria.map((criterion) => {
    if (criterion.source === 'audio') return { id: criterion.id, score: null, status: 'not_scored_audio', evidence: [], nextStep: null };
    const given = byId.get(criterion.id);
    if (!given || !Number.isFinite(given.score)) return { id: criterion.id, score: null, status: 'missing', evidence: [], nextStep: null };
    const evidence: { quote: string; comment: string }[] = [];
    for (const item of given.evidence ?? []) {
      const quote = clip(item?.quote, 400);
      if (quote && quoteFound(quote, response)) { valid += 1; if (evidence.length < rubric.evidence.max) evidence.push({ quote, comment: clip(item.comment, 400) }); }
      else invalid += 1;
    }
    const nextStep = clip(given.next_step, 400) || null;
    if (evidence.length < rubric.evidence.min) return { id: criterion.id, score: null, status: 'insufficient_evidence', evidence, nextStep };
    return { id: criterion.id, score: snap(rubric.scale, given.score), status: 'scored', evidence, nextStep };
  });
  const errors: ErrorFound[] = [];
  for (const error of raw.errors ?? []) {
    const quote = clip(error?.quote, 300), correction = clip(error?.correction, 300);
    if (!quote || !correction || !quoteFound(quote, response) || quote.toLowerCase() === correction.toLowerCase()) continue;
    errors.push({ quote, correction, tag: errorTags.has(error.tag) ? error.tag : 'other', explanation: clip(error.explanation, 500) });
    if (errors.length >= 12) break;
  }
  const upgrades: Upgrade[] = [];
  for (const upgrade of raw.upgrades ?? []) {
    const said = clip(upgrade?.said, 400), better = clip(upgrade?.better, 500);
    if (!said || !better || !quoteFound(said, response) || said.toLowerCase() === better.toLowerCase()) continue;
    upgrades.push({ said, better, why: clip(upgrade.why, 400) });
    if (upgrades.length >= 5) break;
  }
  const scores = Object.fromEntries(criteria.map((criterion) => [criterion.id, criterion.score]));
  return { rubric: rubric.id, overall: overallOf(rubric, scores), criteria, errors, upgrades, summary: clip(raw.summary, 1200), validQuotes: valid, invalidQuotes: invalid };
}

/** Criteria the assessor must try again on (not enough real quotes), for one repair attempt. */
export const needsRepair = (assessment: Assessment) => assessment.criteria.filter((criterion) => criterion.status === 'insufficient_evidence' || criterion.status === 'missing').map((criterion) => criterion.id);

/** Merges a repair attempt: repaired criteria replace the failed ones. */
export function mergeRepair(rubric: Rubric, first: Assessment, second: Assessment): Assessment {
  const repaired = new Map(second.criteria.filter((criterion) => criterion.status === 'scored').map((criterion) => [criterion.id, criterion]));
  const criteria = first.criteria.map((criterion) => (criterion.status === 'scored' ? criterion : repaired.get(criterion.id) ?? criterion));
  const scores = Object.fromEntries(criteria.map((criterion) => [criterion.id, criterion.score]));
  return { ...first, criteria, overall: overallOf(rubric, scores), validQuotes: first.validQuotes + second.validQuotes, invalidQuotes: first.invalidQuotes + second.invalidQuotes };
}

/**
 * A session result from several scored answers (a practice set): per criterion the
 * mean weighted by answer length, then the rubric's own overall rule. The best
 * evidence of each criterion is kept.
 */
export function aggregate(rubric: Rubric, parts: { assessment: Assessment; weight: number }[]): Assessment {
  const criteria: CriterionResult[] = rubric.criteria.map((criterion) => {
    if (criterion.source === 'audio') return { id: criterion.id, score: null, status: 'not_scored_audio', evidence: [], nextStep: null };
    let sum = 0, weight = 0;
    const evidence: { quote: string; comment: string }[] = [];
    let nextStep: string | null = null;
    for (const part of parts) {
      const found = part.assessment.criteria.find((entry) => entry.id === criterion.id);
      if (!found || found.score === null) continue;
      const w = Math.max(1, part.weight);
      sum += found.score * w; weight += w;
      for (const item of found.evidence) if (evidence.length < rubric.evidence.max) evidence.push(item);
      nextStep = found.nextStep ?? nextStep;
    }
    return weight ? { id: criterion.id, score: snap(rubric.scale, sum / weight), status: 'scored', evidence, nextStep } : { id: criterion.id, score: null, status: 'insufficient_evidence', evidence: [], nextStep: null };
  });
  const scores = Object.fromEntries(criteria.map((criterion) => [criterion.id, criterion.score]));
  return {
    rubric: rubric.id,
    overall: overallOf(rubric, scores),
    criteria,
    errors: parts.flatMap((part) => part.assessment.errors).slice(0, 20),
    upgrades: parts.flatMap((part) => part.assessment.upgrades).slice(0, 8),
    summary: '',
    validQuotes: parts.reduce((sum, part) => sum + part.assessment.validQuotes, 0),
    invalidQuotes: parts.reduce((sum, part) => sum + part.assessment.invalidQuotes, 0),
  };
}
