import {
  adjustInterval,
  readToeflOutcome,
  type ConfidenceAdjustment,
  examKeyOf,
  type PracticeSummary,
  practiceConfidenceFactor,
} from "../_shared/sister-signals.ts";

// Simple linear regression on (index -> score) pairs.
export const linearRegression = (ys: number[]): { slope: number; intercept: number; r2: number } => {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssXX = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const ssXY = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0);
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
};

export const stdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
};

export const classifyTrend = (slope: number, sd: number): "improving" | "stable" | "declining" => {
  const threshold = Math.max(0.15, sd * 0.3);
  if (slope > threshold) return "improving";
  if (slope < -threshold) return "declining";
  return "stable";
};

type ProductMeta = { slug?: unknown; exam_type?: unknown } | null | undefined;

/**
 * Exam type of a full mock: exam_outcomes has no exam_type column, so it comes
 * from the product. Practice and playbook products never count as mocks.
 */
export const mockExamType = (meta: ProductMeta): string | null => {
  const slug = String(meta?.slug ?? "").toLowerCase();
  const explicit = String(meta?.exam_type ?? "").toLowerCase();
  if (/practice|playbook|complete/.test(slug)) return null;
  if (explicit) return explicit;
  if (slug.includes("itep")) return "itep";
  if (slug.includes("toefl")) return "toefl";
  return examKeyOf(slug);
};

export const scaleFor = (examType: string, usesBand: boolean): { max: number; step: number } => {
  if (examType === "sat") return { max: 1600, step: 10 };
  // TOEFL 2026 reports 1-6 bands; legacy RLW estimates are scores out of 120.
  if (examType === "toefl") return usesBand ? { max: 6, step: 0.5 } : { max: 120, step: 1 };
  if (examType === "toefl_legacy") return { max: 120, step: 1 };
  return { max: 9, step: 0.5 };
};

export type Prediction = {
  exam_type: string;
  current_score: number;
  predicted_next: number;
  confidence_low: number;
  confidence_high: number;
  trend: "improving" | "stable" | "declining";
  data_points: number;
  uses_band: boolean;
  max_score: number;
  r2: number;
  confidence_adjustment: ConfidenceAdjustment | null;
};

/** Mock-only prediction; practice consistency may only resize the interval. */
export const predictSeries = (
  examType: string,
  values: number[],
  usesBand: boolean,
  practice: PracticeSummary | null,
): Prediction | null => {
  if (values.length === 0) return null;
  const { max, step } = scaleFor(examType, usesBand);
  const roundTo = (v: number) => Math.min(max, Math.max(0, Math.round(v / step) * step));
  const { slope, intercept, r2 } = linearRegression(values);
  const predicted = roundTo(intercept + slope * values.length);
  const sd = stdDev(values);
  const half = sd * (1 - r2 * 0.5) + step / 2;
  let low = roundTo(predicted - half);
  let high = roundTo(predicted + half);
  const adjustment = practiceConfidenceFactor(practice);
  if (adjustment) ({ low, high } = adjustInterval(predicted, low, high, adjustment.factor, roundTo));
  return {
    exam_type: examType,
    current_score: values[values.length - 1],
    predicted_next: predicted,
    confidence_low: low,
    confidence_high: high,
    trend: classifyTrend(slope, sd),
    data_points: values.length,
    uses_band: usesBand,
    max_score: max,
    r2: Math.round(r2 * 100) / 100,
    confidence_adjustment: adjustment,
  };
};

export type SeriesPoint = { examType: string; band: number | null; score: number | null };

/**
 * One prediction point for an outcome. TOEFL outcomes are split by format:
 * the 2026 band scale ("toefl", full tests only) and the legacy RLW estimate
 * ("toefl_legacy", a score), so the two scales are never mixed in one series.
 */
export const seriesPoint = (examType: string, row: Record<string, unknown>): SeriesPoint | null => {
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  if (examType !== "toefl") return { examType, band: num(row.overall_band), score: num(row.overall_score) };
  const toefl = readToeflOutcome(row);
  if (toefl.scale === "band_2026") {
    if (!toefl.fullTest || toefl.overall === null) return null;
    return { examType: "toefl", band: toefl.overall, score: null };
  }
  return toefl.overall === null ? null : { examType: "toefl_legacy", band: null, score: toefl.overall };
};
