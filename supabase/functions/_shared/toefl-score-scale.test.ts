import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  TOEFL_BAND_TABLE,
  TOEFL_SKILLS,
  bandToCefr,
  bandToLegacySectionRange,
  bandToLegacyTotalRange,
  legacySectionToBand,
  legacyTotalToBand,
  normalizeBand,
  overallFromSections,
} from "./toefl-score-scale.ts";

Deno.test("ETS Table 6: every legacy 0-30 section score maps to exactly one band, and back into its range", () => {
  for (const skill of TOEFL_SKILLS) {
    for (let score = 0; score <= 30; score += 1) {
      const band = legacySectionToBand(skill, score);
      if (band == null) throw new Error(`${skill} ${score} unmapped`);
      const range = bandToLegacySectionRange(skill, band)!;
      if (score < range.min || score > range.max) throw new Error(`${skill} ${score} -> ${band} -> ${range.min}-${range.max}`);
    }
  }
});

Deno.test("ETS Table 6 spot checks (section and total) in both directions", () => {
  assertEquals(legacySectionToBand("reading", 29), 6);
  assertEquals(legacySectionToBand("reading", 22), 4.5);
  assertEquals(legacySectionToBand("listening", 21), 4.5);
  assertEquals(legacySectionToBand("writing", 17), 4);
  assertEquals(legacySectionToBand("speaking", 27), 5.5);
  assertEquals(legacySectionToBand("speaking", 4), 1);
  assertEquals(bandToLegacySectionRange("speaking", 5.5), { min: 27, max: 27 });
  assertEquals(bandToLegacySectionRange("reading", 3.5), { min: 12, max: 17 });
  assertEquals(legacyTotalToBand(114), 6);
  assertEquals(legacyTotalToBand(113), 5.5);
  assertEquals(legacyTotalToBand(95), 5);
  assertEquals(legacyTotalToBand(86), 4.5);
  assertEquals(legacyTotalToBand(85), 4);
  assertEquals(legacyTotalToBand(0), 1);
  assertEquals(bandToLegacyTotalRange(4.5), { min: 86, max: 94 });
  assertEquals(bandToLegacyTotalRange(6), { min: 114, max: 120 });
  assertEquals(bandToLegacyTotalRange(1), { min: 0, max: 11 });
  for (const row of TOEFL_BAND_TABLE) assertEquals(legacyTotalToBand(row.totalMin), row.band);
});

Deno.test("invalid inputs are rejected rather than clamped", () => {
  assertEquals(legacySectionToBand("reading", 31), null);
  assertEquals(legacySectionToBand("reading", -1), null);
  assertEquals(legacyTotalToBand(121), null);
  assertEquals(normalizeBand(0.5), null);
  assertEquals(normalizeBand(7), null);
  assertEquals(normalizeBand("4.4"), 4.5);
  assertEquals(normalizeBand(4.2), 4);
});

Deno.test("CEFR mapping (Table 7) and overall = mean of four rounded to nearest 0.5", () => {
  assertEquals([6, 5.5, 5, 4.5, 4, 3, 2.5, 1.5].map(bandToCefr), ["C2", "C1", "C1", "B2", "B2", "B1", "A2", "A1"]);
  assertEquals(overallFromSections({ reading: 5, listening: 4.5, writing: 4, speaking: 4 }), 4.5); // 4.375
  assertEquals(overallFromSections({ reading: 4, listening: 4, writing: 4, speaking: 4.5 }), 4); // 4.125
  assertEquals(overallFromSections({ reading: 4, listening: 4, writing: 4 }), null);
});
