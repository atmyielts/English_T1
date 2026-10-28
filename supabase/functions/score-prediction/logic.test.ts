import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mockExamType, predictSeries, scaleFor, seriesPoint } from "./logic.ts";
import type { PracticeSummary } from "../_shared/sister-signals.ts";

const practice = (recent: number[]): PracticeSummary => ({
  attempts: recent.length, recent_attempts_30d: recent.length, accuracy: null, recent_accuracies: recent,
  last_activity_at: null, weak_skills: [], strong_skills: [],
});

Deno.test("only simulator products count as mocks", () => {
  assertEquals(mockExamType({ slug: "ielts-academic-simulator" }), "ielts");
  assertEquals(mockExamType({ slug: "sat-exam-simulator" }), "sat");
  assertEquals(mockExamType({ slug: "toefl-ibt-simulator" }), "toefl");
  assertEquals(mockExamType({ slug: "itep-simulator" }), "itep");
  assertEquals(mockExamType({ slug: "ielts-practice" }), null);
  assertEquals(mockExamType({ slug: "sat-playbook" }), null);
  assertEquals(mockExamType({ slug: "sat-complete" }), null);
  assertEquals(mockExamType({ slug: "english-reading" }), null);
  assertEquals(mockExamType(null), null);
});

Deno.test("scales follow each exam", () => {
  assertEquals(scaleFor("sat", false), { max: 1600, step: 10 });
  assertEquals(scaleFor("toefl", true), { max: 6, step: 0.5 });
  assertEquals(scaleFor("toefl", false), { max: 120, step: 1 });
  assertEquals(scaleFor("toefl_legacy", false), { max: 120, step: 1 });
  assertEquals(scaleFor("ielts", true), { max: 9, step: 0.5 });
});

Deno.test("SAT predictions are whole tens on the 1600 scale", () => {
  const p = predictSeries("sat", [1100, 1150, 1210], false, null)!;
  assertEquals(p.predicted_next % 10, 0);
  assert(p.predicted_next <= 1600 && p.confidence_low <= p.predicted_next && p.confidence_high >= p.predicted_next);
  assertEquals(p.trend, "improving");
  assertEquals(p.confidence_adjustment, null);
});

Deno.test("consistent practice narrows the interval but never moves the prediction", () => {
  const values = [5.5, 6, 5.5, 6.5];
  const base = predictSeries("ielts", values, true, null)!;
  const steady = predictSeries("ielts", values, true, practice([0.7, 0.72, 0.71, 0.69, 0.7]))!;
  assertEquals(steady.predicted_next, base.predicted_next);
  assert(steady.confidence_high - steady.confidence_low <= base.confidence_high - base.confidence_low);
  assertEquals(steady.confidence_adjustment?.factor, 0.85);
  const erratic = predictSeries("ielts", values, true, practice([0.2, 0.9, 0.3, 0.95, 0.1]))!;
  assertEquals(erratic.predicted_next, base.predicted_next);
  assert(erratic.confidence_high - erratic.confidence_low >= base.confidence_high - base.confidence_low);
  assertEquals(erratic.confidence_adjustment?.factor, 1.1);
});

Deno.test("too little practice changes nothing and no mocks means no prediction", () => {
  const base = predictSeries("ielts", [6, 6.5], true, null)!;
  assertEquals(predictSeries("ielts", [6, 6.5], true, practice([0.9, 0.1]))!, base);
  assertEquals(predictSeries("sat", [], false, practice([0.7, 0.7, 0.7, 0.7, 0.7])), null);
});

Deno.test("TOEFL 2026 full tests and legacy RLW estimates form separate series", () => {
  const band = { overall_band: 4.5, overall_score: 4.5, toefl: { score_version: "toefl-2026-band-estimate-v1", mode: "full_test", overall_band: 4.5, sections: {} } };
  assertEquals(seriesPoint("toefl", band), { examType: "toefl", band: 4.5, score: null });
  assertEquals(seriesPoint("toefl", { ...band, toefl: { ...band.toefl, mode: "section" } }), null);
  const legacy = { overall_band: 6.5, overall_score: 70, toefl: { score_version: "toefl-rlw-estimate-v1", rlw_composite_score: 70 } };
  assertEquals(seriesPoint("toefl", legacy), { examType: "toefl_legacy", band: null, score: 70 });
  assertEquals(seriesPoint("sat", { overall_band: null, overall_score: 1200 }), { examType: "sat", band: null, score: 1200 });

  const p = predictSeries("toefl", [3.5, 4, 4.5], true, null)!;
  assert(p.predicted_next <= 6 && p.predicted_next * 2 === Math.round(p.predicted_next * 2));
  assertEquals(p.max_score, 6);
});
