// Display copy of ETS's April 2026 score-linking tables (Table 6 and 7) for the
// onboarding form preview. The edge function holds the authoritative copy
// (supabase/functions/_shared/toefl-score-scale.ts) and does the conversion.

export const BANDS = [6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];
const TOTAL_MIN: Record<string, number> = { '6': 114, '5.5': 107, '5': 95, '4.5': 86, '4': 72, '3.5': 58, '3': 44, '2.5': 34, '2': 24, '1.5': 12, '1': 0 };

export const cefr = (band: number) => (band >= 6 ? 'C2' : band >= 5 ? 'C1' : band >= 4 ? 'B2' : band >= 3 ? 'B1' : band >= 2 ? 'A2' : 'A1');

export const legacyTotalRange = (band: number): string => {
  const i = BANDS.indexOf(band);
  if (i < 0) return '';
  const min = TOTAL_MIN[String(band)];
  const max = i === 0 ? 120 : TOTAL_MIN[String(BANDS[i - 1])] - 1;
  return `${min}–${max}`;
};

export const totalToBand = (total: number): number | null => {
  if (!Number.isFinite(total) || total < 0 || total > 120) return null;
  return BANDS.find((band) => total >= TOTAL_MIN[String(band)]) ?? 1;
};

export const bandLabel = (band: number) => `${band.toFixed(1)} · ${cefr(band)} · ${legacyTotalRange(band)}`;
