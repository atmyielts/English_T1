// IELTS band-score utilities for the frontend apps. The authoritative scoring runs
// in `supabase/functions/score-session` (Deno); this module mirrors the public-facing
// math so dashboards / planners / SRS UI can compute the same numbers without a roundtrip.
// Keep this in sync with `bandFromScaled40` / `toHalfBand` in score-session.

import type { IeltsSectionType } from './question-types.ts';

// Round to nearest 0.5 (IELTS bands come in halves).
export const toHalfBand = (value: number): number => Math.round(value * 2) / 2;

// Round to nearest tenth (used for overall band averaging where halves are too coarse).
export const toTenthBand = (value: number): number => Math.round(value * 10) / 10;

const LISTENING_BAND_TABLE: ReadonlyArray<readonly [threshold: number, band: number]> = [
  [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0],
  [26, 6.5], [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5],
  [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5], [2, 2.0], [1, 1.0],
];

const READING_BAND_TABLE: ReadonlyArray<readonly [threshold: number, band: number]> = [
  [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0],
  [27, 6.5], [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5],
  [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5], [2, 2.0], [1, 1.0],
];

// Convert a raw score out of 40 to the IELTS band for that section.
// Only Listening and Academic Reading have public conversion tables; Writing and Speaking
// are graded against rubrics directly and have no raw-to-band mapping.
export const bandFromRaw40 = (section: IeltsSectionType, raw: number): number | null => {
  const clamped = Math.max(0, Math.min(40, Math.round(raw)));
  const table = section === 'listening'
    ? LISTENING_BAND_TABLE
    : section === 'reading'
      ? READING_BAND_TABLE
      : null;
  if (!table) return null;
  for (const [threshold, band] of table) {
    if (clamped >= threshold) return band;
  }
  return 0.0;
};

// Average per-section bands into the overall band, rounding per IELTS conventions.
// IELTS rounds 0.25 up to 0.5 and 0.75 up to 1.0 — so 6.125 → 6.0 but 6.25 → 6.5.
export const averageOverallBand = (
  sectionBands: ReadonlyArray<number | null | undefined>,
): number | null => {
  const valid = sectionBands.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value),
  );
  if (valid.length === 0) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  return toHalfBand(mean);
};

// "Weak" = below target by at least this much OR accuracy below floor.
// Tunable: tighten thresholds when target is high (e.g. 8.0+ candidates need >= 0.85 accuracy).
export interface WeakTypeOptions {
  /** Student's target overall band; weakness is judged relative to this. Default 7.0. */
  targetBand?: number;
  /** Minimum accuracy ratio (0..1) below which a question type is weak regardless of band. Default 0.7. */
  accuracyFloor?: number;
  /** How far below targetBand counts as weak. Default 0.5 (one half-band). */
  bandGapToWeak?: number;
}

export interface WeakTypeInput {
  questionType: string;
  /** Accuracy ratio for this type, 0..1, if known. */
  accuracy?: number | null;
  /** Inferred band for this type, if known. */
  band?: number | null;
}

export interface WeakTypeResult {
  questionType: string;
  accuracy: number | null;
  band: number | null;
  reason: 'low_accuracy' | 'band_gap' | 'both';
}

// Identify which question types need remediation, given per-type accuracy/band signals.
// Used by the simulator → SRS feedback loop to seed practice queue from mock results.
export const identifyWeakTypes = (
  types: ReadonlyArray<WeakTypeInput>,
  options: WeakTypeOptions = {},
): WeakTypeResult[] => {
  const targetBand = options.targetBand ?? 7.0;
  const accuracyFloor = options.accuracyFloor ?? 0.7;
  const bandGap = options.bandGapToWeak ?? 0.5;
  const weakBandThreshold = targetBand - bandGap;

  const out: WeakTypeResult[] = [];
  for (const entry of types) {
    const accuracy = typeof entry.accuracy === 'number' && Number.isFinite(entry.accuracy)
      ? Math.max(0, Math.min(1, entry.accuracy))
      : null;
    const band = typeof entry.band === 'number' && Number.isFinite(entry.band)
      ? entry.band
      : null;
    const lowAccuracy = accuracy != null && accuracy < accuracyFloor;
    const lowBand = band != null && band < weakBandThreshold;
    if (!lowAccuracy && !lowBand) continue;
    out.push({
      questionType: entry.questionType,
      accuracy,
      band,
      reason: lowAccuracy && lowBand ? 'both' : lowAccuracy ? 'low_accuracy' : 'band_gap',
    });
  }
  // Worst first: by smallest accuracy then smallest band.
  out.sort((a, b) => {
    const accA = a.accuracy ?? 1;
    const accB = b.accuracy ?? 1;
    if (accA !== accB) return accA - accB;
    const bandA = a.band ?? 9;
    const bandB = b.band ?? 9;
    return bandA - bandB;
  });
  return out;
};

// Display helper: format a band as "7.5" / "8.0" with mandatory tenth.
export const formatBand = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toFixed(1);
};
