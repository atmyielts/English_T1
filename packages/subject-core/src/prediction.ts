import { findSection, type ExamFormat } from './format.ts';
import { effectivePrecision, initialMastery, successProbability, type MasteryState } from './mastery.ts';
import { blockShares, type Taxonomy } from './topics.ts';

// Predicted points in one section, with an 80% range. The range covers both
// exam-day luck and how little we yet know about each topic. It is not calibrated
// against real results yet, so it is shown as an estimate, never a promise.

export interface SectionPrediction {
  section_id: string;
  expected: number;
  low: number;
  high: number;
  max: number;
  /** Share of the section's topics with at least three answers. */
  coverage: number;
  confidence: 'low' | 'medium' | 'high';
}

const Z80 = 1.2816;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function predictSection(taxonomy: Taxonomy, format: ExamFormat, sectionId: string, mastery: ReadonlyMap<string, MasteryState>, now: Date): SectionPrediction {
  const section = findSection(format, sectionId);
  const shares = blockShares(taxonomy, section.block);
  const points = section.points_per_question;
  let expectedCorrect = 0, luck = 0, ability = 0, covered = 0, answers = 0;
  for (const [code, share] of shares) {
    const state = mastery.get(code) ?? initialMastery();
    const p = successProbability(state, now, 0);
    const n = share * section.questions;
    expectedCorrect += n * p;
    // Exam-day luck is independent per question. Uncertainty in ability is treated as shared
    // across topics (a learner who is weaker than we think is usually weaker everywhere),
    // which keeps the range wide until there is real evidence.
    luck += n * p * (1 - p);
    ability += n * p * (1 - p) / Math.sqrt(effectivePrecision(state, now));
    if (state.attempts >= 3) covered += 1;
    answers += state.attempts;
  }
  const max = section.questions * points;
  const expected = expectedCorrect * points;
  const spread = Z80 * Math.sqrt(luck + ability * ability) * points;
  const coverage = shares.size ? covered / shares.size : 0;
  const confidence = coverage >= 0.8 && answers >= 200 ? 'high' : coverage >= 0.5 && answers >= 60 ? 'medium' : 'low';
  return {
    section_id: sectionId,
    expected: round1(expected),
    low: round1(Math.max(0, expected - spread)),
    high: round1(Math.min(max, expected + spread)),
    max: round1(max),
    coverage: Math.round(coverage * 100) / 100,
    confidence,
  };
}
