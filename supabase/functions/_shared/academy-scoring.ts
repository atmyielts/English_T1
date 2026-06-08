// Pure, dependency-free scoring helpers for the Academy LMS.
// Extracted from the academy edge function so the math is unit-testable
// independently of Supabase / HTTP. No DB access here by design.

/**
 * Map a 0–100 diagnostic score to a CEFR placement band.
 * Bands are inclusive of the lower bound: [0,30)=A1 … [90,100]=C2.
 */
export const placementBand = (score: number): string => {
  if (!Number.isFinite(score)) return "A1";
  const s = Math.max(0, Math.min(100, score));
  return s < 30 ? "A1" : s < 45 ? "A2" : s < 60 ? "B1" : s < 75 ? "B2" : s < 90 ? "C1" : "C2";
};

export type GradeItem = {
  score: number | null;
  maxScore: number | null;
  weight?: number | null;
};

/**
 * Weighted composite score (0–100, one decimal) across graded items.
 * Items with a null score, non-positive max, or non-finite values are ignored.
 * Returns null when there is nothing gradeable.
 */
export const compositeScore = (items: GradeItem[]): number | null => {
  let total = 0;
  let weightSum = 0;
  for (const item of items) {
    if (item.score === null || !Number.isFinite(item.score)) continue;
    const max = Number(item.maxScore);
    if (!Number.isFinite(max) || max <= 0) continue;
    const weight = Number(item.weight ?? 1);
    const w = Number.isFinite(weight) && weight > 0 ? weight : 1;
    total += (Number(item.score) / max) * 100 * w;
    weightSum += w;
  }
  if (weightSum <= 0) return null;
  return Math.round((total / weightSum) * 10) / 10;
};

/**
 * Attendance rate as a 0–100 percentage. "present" and "late" both count as
 * attended. Returns null below `minSessions` so a couple of records don't
 * produce a misleading rate.
 */
export const attendanceRate = (
  records: Array<{ status: string }>,
  minSessions = 1,
): number | null => {
  if (records.length < Math.max(1, minSessions)) return null;
  const attended = records.filter((r) => r.status === "present" || r.status === "late").length;
  return Math.round((attended / records.length) * 100);
};
