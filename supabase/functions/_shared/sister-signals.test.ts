import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  combinedWeakSkills,
  readToeflOutcome,
  summarizeToeflSimulator,
  examKeyOf,
  examNextSteps,
  loadSisterSignals,
  practiceConfidenceFactor,
  summarizeSisterSignals,
  type SisterSignalRows,
} from "./sister-signals.ts";

const now = Date.parse("2026-10-26T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const empty: SisterSignalRows = { satMastery: [], satAttempts: [], ieltsMastery: [], ieltsAttempts: [], playbookProfiles: {}, playbookSnapshots: {} };

Deno.test("no sister activity means no practice or diagnostic evidence", () => {
  const s = summarizeSisterSignals(empty, now);
  assertEquals(s.sat, { practice: null, diagnostic: null });
  assertEquals(s.ielts, { practice: null, diagnostic: null });
  assertEquals(s.toefl, { practice: null, diagnostic: null, simulator: null });
  assertEquals(combinedWeakSkills({}, s), []);
  assertEquals(examNextSteps(s), []);
});

Deno.test("SAT mastery rows combine across difficulty, weighted by attempts", () => {
  const s = summarizeSisterSignals({
    ...empty,
    satMastery: [
      { section_type: "math", domain: "algebra", difficulty: "easy", attempts: 6, rolling_accuracy: 0.5, last_practiced_at: daysAgo(3) },
      { section_type: "math", domain: "algebra", difficulty: "hard", attempts: 2, rolling_accuracy: 0.1, last_practiced_at: daysAgo(1) },
      { section_type: "reading_writing", domain: "grammar", difficulty: "medium", attempts: 10, rolling_accuracy: "0.9" },
      // Too little evidence to count either way.
      { section_type: "math", domain: "geometry_trig", difficulty: "medium", attempts: 2, rolling_accuracy: 0 },
    ],
    satAttempts: [
      { status: "scored", score_accuracy: 0.6, scored_at: daysAgo(2) },
      { status: "scored", score_accuracy: "0.8", scored_at: daysAgo(40) },
      { status: "abandoned", score_accuracy: 0.1, scored_at: daysAgo(1) },
    ],
  }, now);
  const practice = s.sat.practice!;
  assertEquals(practice.weak_skills.map((w) => [w.skill, w.accuracy, w.attempts]), [["algebra", 0.4, 8]]);
  assertEquals(practice.weak_skills[0].last_practiced_at, daysAgo(1));
  assertEquals(practice.strong_skills.map((w) => w.skill), ["grammar"]);
  assertEquals(practice.attempts, 2);
  assertEquals(practice.recent_attempts_30d, 1);
  assertEquals(practice.accuracy, 0.7);
});

Deno.test("IELTS practice and playbook diagnostics feed weak skills and next steps", () => {
  const s = summarizeSisterSignals({
    ...empty,
    ieltsMastery: [{ section_type: "reading", question_type: "tfng", attempts: 4, rolling_accuracy_ratio: 0.25 }],
    ieltsAttempts: [{ status: "scored", accuracy_ratio: 0.5, scored_at: daysAgo(1) }],
    playbookProfiles: {
      ielts: [{ weakest_skill: "writing", target_overall_band: "7.0", current_band_or_estimate: 6, updated_at: daysAgo(5) }],
      sat: [{ weakest_section: "math", weakest_domain: "advanced_math", target_total_score: 1400, updated_at: daysAgo(2) }],
    },
    playbookSnapshots: {
      sat: [{ recommendation_slug: "eight-week-standard", is_current: true, created_at: daysAgo(1), derived_context: { weakest_section: "math" } }],
    },
  }, now);
  assertEquals(s.ielts.diagnostic?.target, 7);
  assertEquals(s.ielts.diagnostic?.weakest_section, "writing");
  assertEquals(s.sat.diagnostic?.weakest_area, "advanced_math");
  assertEquals(s.sat.diagnostic?.recommendation_slug, "eight-week-standard");
  assertEquals(s.sat.diagnostic?.weakest_section, "math");

  const weak = combinedWeakSkills({ listening: { ratio_avg: 0.45, samples: 2 }, reading: { ratio_avg: 0.8, samples: 3 } }, s);
  assertEquals(weak.map((w) => [w.source, w.skill]), [["practice", "tfng"], ["mock", "listening"]]);

  const steps = examNextSteps(s);
  assertEquals(steps[0], { exam: "ielts", kind: "practice_skill", section: "reading", skill: "tfng", accuracy: 0.25, url: "https://practice.ielts.schood.online" });
  assertEquals(steps.filter((step) => step.kind === "playbook_diagnostic").map((step) => step.exam), ["ielts", "sat"]);
});

Deno.test("practice confidence needs five recent sessions", () => {
  const base = { attempts: 0, recent_attempts_30d: 0, accuracy: null, last_activity_at: null, weak_skills: [], strong_skills: [] };
  assertEquals(practiceConfidenceFactor(null), null);
  assertEquals(practiceConfidenceFactor({ ...base, recent_accuracies: [0.7, 0.7, 0.7, 0.7] }), null);
  assertEquals(practiceConfidenceFactor({ ...base, recent_accuracies: [0.7, 0.7, 0.7, 0.7, 0.7] })?.factor, 0.85);
});

Deno.test("exam keys come from slugs and exam types", () => {
  assertEquals(examKeyOf("sat-exam-simulator"), "sat");
  assertEquals(examKeyOf("ielts-practice"), "ielts");
  assertEquals(examKeyOf("toefl-ibt-simulator"), "toefl");
  assertEquals(examKeyOf("english-reading"), null);
});

Deno.test("loading never fails when a sister table is missing", async () => {
  const calls: string[] = [];
  const chain = (table: string) => {
    const result = table === "sat_playbook_user_profiles"
      ? { data: null, error: { message: "relation does not exist" } }
      : table === "sat_practice_mastery"
      ? { data: [{ section_type: "math", domain: "algebra", difficulty: "easy", attempts: 5, rolling_accuracy: 0.2 }], error: null }
      : { data: [], error: null };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = () => q;
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return q;
  };
  const sb = { from: (table: string) => { calls.push(table); return chain(table); } };
  const s = await loadSisterSignals(sb, "user-1", now);
  assertEquals(s.unavailable_sources, ["sat_playbook_user_profiles"]);
  assertEquals(s.sat.practice?.weak_skills.map((w) => w.skill), ["algebra"]);
  assert(calls.includes("ielts_practice_lab_attempts"));
  assertEquals(calls.length, 12);
  assert(calls.includes("toefl_playbook_user_profiles"));
  assert(calls.includes("exam_outcomes"));
});

const toefl2026 = (overall: number, bands: Record<string, number>, mode = "full_test", at = daysAgo(1)) => ({
  overall_band: overall, overall_score: overall, computed_at: at,
  toefl: {
    format: "toefl-2026", score_version: "toefl-2026-band-estimate-v1", mode, overall_band: overall, overall_cefr: "B2",
    sections: Object.fromEntries(Object.entries(bands).map(([k, band]) => [k, { band }])),
    rlw_composite_score: null,
  },
});

Deno.test("TOEFL 2026 results are read as 1-6 bands and name the weakest section", () => {
  const parsed = readToeflOutcome(toefl2026(4.5, { reading: 5, listening: 4.5, writing: 3.5, speaking: 5 }));
  assertEquals(parsed.scale, "band_2026");
  assertEquals(parsed.overall, 4.5);
  assertEquals(parsed.sections.map((s) => s.section), ["reading", "listening", "writing", "speaking"]);

  const summary = summarizeToeflSimulator([
    toefl2026(4.5, { reading: 5, listening: 4.5, writing: 3.5, speaking: 5 }),
    { overall_band: 6.5, overall_score: 78, computed_at: daysAgo(30), toefl: { score_version: "toefl-rlw-estimate-v1", reading_score: 20, listening_score: 18, writing_score: 40 - 0, rlw_composite_score: 78 } },
  ])!;
  // The 2026 scale wins and the legacy row is not mixed in.
  assertEquals(summary.scale, "band_2026");
  assertEquals(summary.tests, 1);
  assertEquals(summary.latest_overall, 4.5);
  assertEquals(summary.latest_cefr, "B2");
  assertEquals(summary.weakest_section, "writing");
});

Deno.test("legacy TOEFL RLW estimates stay on their own 0-30 scale", () => {
  const summary = summarizeToeflSimulator([
    { overall_band: 6, overall_score: 61, computed_at: daysAgo(2), raw_result: { toefl: { score_version: "toefl-rlw-estimate-v1", reading_score: 24, listening_score: 21, writing_score: 16, rlw_composite_score: 61 } } },
  ])!;
  assertEquals(summary.scale, "legacy_rlw");
  assertEquals(summary.latest_overall, 61);
  assertEquals(summary.weakest_section, "writing");
  assertEquals(summarizeToeflSimulator([]), null);
  // Equal sections have no weakest one; a section test never sets the overall.
  const flat = summarizeToeflSimulator([toefl2026(4, { reading: 4, listening: 4 }, "section")])!;
  assertEquals(flat.weakest_section, null);
  assertEquals(flat.latest_overall, null);
});

Deno.test("TOEFL playbook diagnostics read the 2026 band profile and the legacy one", () => {
  const banded = summarizeSisterSignals({
    ...empty,
    playbookProfiles: { toefl: [{ score_scale: "band_2026", target_band: 5, current_band: 4, target_total_score: 90, weakest_section: "speaking", updated_at: daysAgo(1) }] },
    toeflMocks: [toefl2026(4, { reading: 4.5, listening: 4, writing: 3.5, speaking: 4 })],
  }, now);
  assertEquals(banded.toefl.diagnostic?.target, 5);
  assertEquals(banded.toefl.diagnostic?.current_estimate, 4);
  assertEquals(banded.toefl.diagnostic?.scale, "band_2026");
  const steps = examNextSteps(banded);
  assertEquals(steps.map((step) => [step.exam, step.kind, step.section]), [
    ["toefl", "simulator_section", "writing"],
    ["toefl", "playbook_diagnostic", "speaking"],
  ]);
  assert(steps.every((step) => step.url === "https://playbook.toefl.schood.online"));

  const legacy = summarizeSisterSignals({
    ...empty,
    playbookProfiles: { toefl: [{ target_total_score: 95, current_score_or_estimate: 80, weakest_section: "writing" }] },
  }, now);
  assertEquals(legacy.toefl.diagnostic?.target, 95);
  assertEquals(legacy.toefl.diagnostic?.scale, "legacy_120");
});
