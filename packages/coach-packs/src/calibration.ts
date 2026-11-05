import { quoteFound } from './text.ts';
import type { CalibrationRun, Rubric } from './types.ts';

// Calibration: how well an assessor (the pack's runs in CI, a real model in the live
// script) agrees with the author-rated reference scores, and how stable it is from
// run to run. The same numbers gate CI and are printed by the live evaluation.

export interface CalibrationReport {
  rubric: string;
  samples: number;
  runs: number;
  /** Share of (sample, run, criterion) scores equal to the reference. */
  exact: number;
  /** Share within one criterion step of the reference. */
  adjacent: number;
  /** Mean absolute difference from the reference, in scale points. */
  mae: number;
  /** Largest spread (max − min) of one criterion across runs of one sample. */
  spread: number;
  /** Share of evidence quotes found word for word in the response. */
  evidenceValid: number;
  /** Quadratic weighted kappa over all criterion scores (1 = perfect agreement). */
  kappa: number;
  /** Per criterion: exact, adjacent and mean absolute difference. */
  criteria: Record<string, { exact: number; adjacent: number; mae: number }>;
  failures: string[];
  passed: boolean;
}

const round = (value: number, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

/** Quadratic weighted kappa for paired ratings on one scale. */
export function quadraticKappa(pairs: [number, number][], min: number, max: number, step: number): number {
  const levels = Math.round((max - min) / step) + 1;
  if (!pairs.length || levels < 2) return 1;
  const index = (value: number) => Math.min(levels - 1, Math.max(0, Math.round((value - min) / step)));
  const observed = Array.from({ length: levels }, () => new Array<number>(levels).fill(0));
  const rowTotals = new Array<number>(levels).fill(0), columnTotals = new Array<number>(levels).fill(0);
  for (const [a, b] of pairs) {
    const i = index(a), j = index(b);
    observed[i][j] += 1; rowTotals[i] += 1; columnTotals[j] += 1;
  }
  let numerator = 0, denominator = 0;
  const n = pairs.length;
  for (let i = 0; i < levels; i++) for (let j = 0; j < levels; j++) {
    const weight = ((i - j) ** 2) / ((levels - 1) ** 2);
    numerator += weight * observed[i][j];
    denominator += weight * (rowTotals[i] * columnTotals[j]) / n;
  }
  return denominator === 0 ? 1 : 1 - numerator / denominator;
}

/** Scores `runs` (per sample id) against the rubric's reference set and thresholds. */
export function calibrate(rubric: Rubric, runs: Record<string, CalibrationRun[]> = rubric.calibration.runs): CalibrationReport {
  const scored = rubric.criteria.filter((criterion) => criterion.source === 'model').map((criterion) => criterion.id);
  const step = rubric.scale.step;
  let total = 0, exact = 0, adjacent = 0, absolute = 0, quotes = 0, valid = 0, spread = 0, runCount = 0;
  const pairs: [number, number][] = [];
  const per: Record<string, { n: number; exact: number; adjacent: number; abs: number }> = Object.fromEntries(scored.map((id) => [id, { n: 0, exact: 0, adjacent: 0, abs: 0 }]));
  for (const sample of rubric.calibration.samples) {
    const sampleRuns = runs[sample.id] ?? [];
    runCount += sampleRuns.length;
    for (const id of scored) {
      const reference = sample.reference[id];
      const values: number[] = [];
      for (const run of sampleRuns) {
        const entry = run.criteria[id];
        if (!entry || !Number.isFinite(entry.score)) { total += 1; per[id].n += 1; continue; }
        const diff = Math.abs(entry.score - reference);
        values.push(entry.score);
        pairs.push([entry.score, reference]);
        total += 1; per[id].n += 1;
        absolute += diff; per[id].abs += diff;
        if (diff < 1e-9) { exact += 1; per[id].exact += 1; }
        if (diff <= step + 1e-9) { adjacent += 1; per[id].adjacent += 1; }
        for (const quote of entry.evidence ?? []) { quotes += 1; if (quoteFound(quote, sample.response)) valid += 1; }
      }
      if (values.length > 1) spread = Math.max(spread, Math.max(...values) - Math.min(...values));
    }
  }
  const t = rubric.calibration.thresholds;
  const report: CalibrationReport = {
    rubric: rubric.id,
    samples: rubric.calibration.samples.length,
    runs: runCount,
    exact: round(total ? exact / total : 0),
    adjacent: round(total ? adjacent / total : 0),
    mae: round(total ? absolute / total : Infinity),
    spread: round(spread),
    evidenceValid: round(quotes ? valid / quotes : 0),
    kappa: round(quadraticKappa(pairs, rubric.scale.min, rubric.scale.max, step)),
    criteria: Object.fromEntries(Object.entries(per).map(([id, value]) => [id, { exact: round(value.n ? value.exact / value.n : 0), adjacent: round(value.n ? value.adjacent / value.n : 0), mae: round(value.n ? value.abs / value.n : 0) }])),
    failures: [],
    passed: false,
  };
  if (report.exact < t.exact) report.failures.push(`exact agreement ${report.exact} < ${t.exact}`);
  if (report.adjacent < t.adjacent) report.failures.push(`adjacent agreement ${report.adjacent} < ${t.adjacent}`);
  if (report.mae > t.maxMae) report.failures.push(`mean absolute difference ${report.mae} > ${t.maxMae}`);
  if (report.spread > t.maxSpread) report.failures.push(`run-to-run spread ${report.spread} > ${t.maxSpread}`);
  if (report.evidenceValid < t.evidenceValid) report.failures.push(`valid evidence ${report.evidenceValid} < ${t.evidenceValid}`);
  report.passed = report.failures.length === 0;
  return report;
}
