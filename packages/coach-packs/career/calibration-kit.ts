import type { CalibrationRun, CalibrationSample } from '../src/types.ts';

// Builds a rubric's calibration set from authored samples. Each sample carries its
// reference scores (in criterion order) and how two of its three assessor runs differ
// from them (the first run agrees). Evidence quotes are the opening words of the
// response's own lines and sentences, so every quote is the learner's words verbatim:
// the runs test the scoring pipeline and the thresholds in CI. They are authored, not
// captured from a model; replace them with real runs from scripts/coach-calibration-live.ts.

export interface Authored {
  id: string;
  task: string;
  response: string;
  metrics?: CalibrationSample['metrics'];
  /** Reference scores, one per criterion in the order given to `calibrationSet`. */
  scores: number[];
  /** Differences from the reference for runs 2 and 3 (per criterion; missing = 0). */
  drift: [number[], number[]];
  rationale: string;
}

/** Short verbatim quotes: the first words of each line and sentence. */
export function quotesOf(response: string): string[] {
  return response.split(/\n+|(?<=[.!?])\s+/).map((part) => part.trim().replace(/^[-•*]\s*/, '')).filter((part) => part.length > 10)
    .map((part) => part.split(/\s+/).slice(0, 12).join(' ').replace(/[,;:—-]+$/, '').trim());
}

export function calibrationSet(criteria: string[], authored: Authored[], scale: { min: number; max: number }) {
  const samples: CalibrationSample[] = [];
  const runs: Record<string, CalibrationRun[]> = {};
  for (const entry of authored) {
    if (entry.scores.length !== criteria.length) throw new Error(`${entry.id}: one reference score per criterion`);
    const reference = Object.fromEntries(criteria.map((id, index) => [id, entry.scores[index]]));
    samples.push({ id: entry.id, task: entry.task, response: entry.response, ...(entry.metrics ? { metrics: entry.metrics } : {}), reference, rationale: entry.rationale });
    const quotes = quotesOf(entry.response);
    if (quotes.length < 2) throw new Error(`${entry.id}: needs at least two quotable sentences`);
    const drifts = [[] as number[], ...entry.drift];
    runs[entry.id] = drifts.map((drift, run) => ({
      criteria: Object.fromEntries(criteria.map((id, index) => {
        const score = Math.min(scale.max, Math.max(scale.min, entry.scores[index] + (drift[index] ?? 0)));
        const evidence = [quotes[(index * 2 + run) % quotes.length], quotes[(index * 2 + run + 3) % quotes.length]];
        return [id, { score, evidence: [...new Set(evidence)] }];
      })),
    }));
  }
  return { samples, runs };
}
