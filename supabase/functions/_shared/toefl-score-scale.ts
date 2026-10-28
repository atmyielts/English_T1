// TOEFL iBT 2026 banded score scale (1–6 in 0.5 steps) and its comparison to
// the legacy 0–30 section / 0–120 total scale.
//
// Source: ETS, "A banded score scale for the TOEFL iBT test: Rationale,
// development, and score linking" (April 2026), Table 6 (band ↔ original
// scale) and Table 7 (band ↔ CEFR). The numbers below are copied from those
// tables; do not edit them without the ETS source.

export const TOEFL_SKILLS = ["reading", "listening", "writing", "speaking"] as const;
export type ToeflSkill = (typeof TOEFL_SKILLS)[number];

export const TOEFL_BANDS = [6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1] as const;

type Range = [number, number];

// Table 6: for each band, the 0–30 section range and the 0–120 total minimum.
export const TOEFL_BAND_TABLE: ReadonlyArray<{
  band: number;
  reading: Range;
  listening: Range;
  writing: Range;
  speaking: Range;
  totalMin: number;
}> = [
  { band: 6, reading: [29, 30], listening: [28, 30], writing: [29, 30], speaking: [28, 30], totalMin: 114 },
  { band: 5.5, reading: [27, 28], listening: [26, 27], writing: [27, 28], speaking: [27, 27], totalMin: 107 },
  { band: 5, reading: [24, 26], listening: [22, 25], writing: [24, 26], speaking: [25, 26], totalMin: 95 },
  { band: 4.5, reading: [22, 23], listening: [20, 21], writing: [21, 23], speaking: [23, 24], totalMin: 86 },
  { band: 4, reading: [18, 21], listening: [17, 19], writing: [17, 20], speaking: [20, 22], totalMin: 72 },
  { band: 3.5, reading: [12, 17], listening: [13, 16], writing: [15, 16], speaking: [18, 19], totalMin: 58 },
  { band: 3, reading: [6, 11], listening: [9, 12], writing: [13, 14], speaking: [16, 17], totalMin: 44 },
  { band: 2.5, reading: [4, 5], listening: [6, 8], writing: [11, 12], speaking: [13, 15], totalMin: 34 },
  { band: 2, reading: [3, 3], listening: [4, 5], writing: [7, 10], speaking: [10, 12], totalMin: 24 },
  { band: 1.5, reading: [2, 2], listening: [2, 3], writing: [3, 6], speaking: [5, 9], totalMin: 12 },
  { band: 1, reading: [0, 1], listening: [0, 1], writing: [0, 2], speaking: [0, 4], totalMin: 0 },
];

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** Table 7: the same CEFR thresholds apply to every section and to the overall band. */
export const bandToCefr = (band: number): Cefr => {
  if (band >= 6) return "C2";
  if (band >= 5) return "C1";
  if (band >= 4) return "B2";
  if (band >= 3) return "B1";
  if (band >= 2) return "A2";
  return "A1";
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Snap any number to the 1–6 scale in 0.5 steps (round half up). */
export const normalizeBand = (value: unknown): number | null => {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  if (!isFiniteNumber(n)) return null;
  if (n < 1 || n > 6) return null;
  return Math.round(n * 2) / 2;
};

/** Overall band = mean of the four section bands, rounded to the nearest 0.5. */
export const overallFromSections = (bands: Partial<Record<ToeflSkill, number | null>>): number | null => {
  const values = TOEFL_SKILLS.map((skill) => bands[skill]).filter(isFiniteNumber);
  if (values.length !== TOEFL_SKILLS.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(mean * 2) / 2;
};

/** Legacy 0–30 section score → 2026 band (Table 6). */
export const legacySectionToBand = (skill: ToeflSkill, score: unknown): number | null => {
  const n = typeof score === "string" && score.trim() ? Number(score) : score;
  if (!isFiniteNumber(n) || n < 0 || n > 30) return null;
  const rounded = Math.round(n);
  for (const row of TOEFL_BAND_TABLE) {
    const [min, max] = row[skill];
    if (rounded >= min && rounded <= max) return row.band;
  }
  return null;
};

/** 2026 band → the legacy 0–30 range it corresponds to (Table 6). */
export const bandToLegacySectionRange = (skill: ToeflSkill, band: unknown): { min: number; max: number } | null => {
  const normalized = normalizeBand(band);
  if (normalized == null) return null;
  const row = TOEFL_BAND_TABLE.find((entry) => entry.band === normalized);
  if (!row) return null;
  return { min: row[skill][0], max: row[skill][1] };
};

/** Legacy 0–120 total → overall band, using the Table 6 total minimums. */
export const legacyTotalToBand = (total: unknown): number | null => {
  const n = typeof total === "string" && total.trim() ? Number(total) : total;
  if (!isFiniteNumber(n) || n < 0 || n > 120) return null;
  const rounded = Math.round(n);
  for (const row of TOEFL_BAND_TABLE) {
    if (rounded >= row.totalMin) return row.band;
  }
  return 1;
};

/** Overall band → the legacy 0–120 range shown alongside during the transition. */
export const bandToLegacyTotalRange = (band: unknown): { min: number; max: number } | null => {
  const normalized = normalizeBand(band);
  if (normalized == null) return null;
  const index = TOEFL_BAND_TABLE.findIndex((entry) => entry.band === normalized);
  if (index < 0) return null;
  const min = TOEFL_BAND_TABLE[index].totalMin;
  const max = index === 0 ? 120 : TOEFL_BAND_TABLE[index - 1].totalMin - 1;
  return { min, max };
};

/** Compact label for UI and AI context, e.g. "4.5 (B2 · legacy 86–94)". */
export const describeBand = (band: number, skill?: ToeflSkill): string => {
  const legacy = skill ? bandToLegacySectionRange(skill, band) : bandToLegacyTotalRange(band);
  const legacyText = legacy ? (legacy.min === legacy.max ? `${legacy.min}` : `${legacy.min}–${legacy.max}`) : "–";
  return `${band} (${bandToCefr(band)} · legacy ${legacyText})`;
};
