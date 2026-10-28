import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BANDS,
  bandFromLegacy,
  basicInterviewEstimate,
  buildToefl2026Result,
  cefrForBand,
  estimateListenRepeat,
  legacyRangeForBand,
  legacyTotalForBand,
  nextStepModules,
  overallBandFrom,
  playbookDiagnosticUrl,
  routeModule,
  scoreBuildSentence,
  scoreCompleteWords,
  scoreToefl2026Unit,
  sectionBandFromRaw,
  TOEFL_2026_SECTIONS,
  type Toefl2026SectionInput,
  type Toefl2026UnitInput,
} from "./toefl-2026.ts";

Deno.test("Complete the Words: exact match per word, letters or whole word", () => {
  const correct = { blanks: { "1": "ght", "2": "at", "3": "ple" }, stems: { "1": "mi", "2": "th", "3": "peo" } };
  const r = scoreCompleteWords(correct, { blanks: { "1": "GHT ", "2": "that", "3": "pel" } });
  assertEquals(r.score, 2);
  assertEquals(r.max, 3);
  assertEquals(r.blanks.map((b) => b.correct), [true, true, false]);
  assertEquals(scoreCompleteWords(correct, null).score, 0);
  assertEquals(scoreCompleteWords(correct, {}).max, 3);
  assertEquals(scoreCompleteWords({}, { blanks: { "1": "ght" } }).max, 0);
  // Near-misses never count: one letter off is wrong.
  assertEquals(scoreCompleteWords({ blanks: { a: "ever" } }, { blanks: { a: "evr" } }).score, 0);
  // A blank with no expected letters is never scored as correct.
  assertEquals(scoreCompleteWords({ blanks: { a: "" } }, { blanks: { a: "" } }).score, 0);
});

Deno.test("Build a Sentence: one correct order; distractors unused; duplicate tiles interchangeable", () => {
  const tiles = { a: "were", b: "the", c: "was", d: "old city", e: "showed us around", f: "who", g: "tour guides" };
  const correct = { order: ["g", "f", "e", "b", "d", "a"], tiles };
  assertEquals(scoreBuildSentence(correct, { order: ["g", "f", "e", "b", "d", "a"] }).score, 1);
  assertEquals(scoreBuildSentence(correct, { order: ["g", "f", "e", "b", "d", "c"] }).score, 0);
  assertEquals(scoreBuildSentence(correct, { order: ["f", "g", "e", "b", "d", "a"] }).score, 0);
  assertEquals(scoreBuildSentence(correct, { order: ["g", "f", "e", "b", "d"] }).score, 0);
  assertEquals(scoreBuildSentence(correct, { order: ["g", "g", "e", "b", "d", "a"] }).score, 0);
  assertEquals(scoreBuildSentence(correct, { order: ["g", "f", "e", "b", "d", "zz"] }).score, 0);
  assertEquals(scoreBuildSentence(correct, null).max, 1);
  const dup = { order: ["x1", "y", "x2"], tiles: { x1: "the", y: "book", x2: "the" } };
  assertEquals(scoreBuildSentence(dup, { order: ["x2", "y", "x1"] }).score, 1);
  assertEquals(scoreBuildSentence({}, { order: [] }).max, 0);
});

Deno.test("scoreToefl2026Unit only owns the new unit types", () => {
  assertEquals(scoreToefl2026Unit("question_single_choice", { option_id: "A" }, "A"), null);
  assertEquals(scoreToefl2026Unit("question_gap_fill", { blanks: { 1: ["x"] } }, { blanks: { 1: "x" } }), null);
  assertEquals(scoreToefl2026Unit("question_complete_words", { blanks: { 1: "ab" } }, { blanks: { 1: "ab" } }), { score: 1, max: 1 });
  assertEquals(scoreToefl2026Unit("question_speaking_repeat", { text: "x" }, { transcript: "x" }), { score: 0, max: 0 });
});

Deno.test("adaptive routing uses a 60% router threshold", () => {
  assertEquals(routeModule(18, 30), "upper");
  assertEquals(routeModule(17, 30), "lower");
  assertEquals(routeModule(0, 0), "lower");
  assertEquals(routeModule(3, 5), "upper");
});

Deno.test("legacy comparison table round-trips for every section and band", () => {
  for (const section of TOEFL_2026_SECTIONS) {
    let covered = 0;
    for (const band of BANDS) {
      const range = legacyRangeForBand(section, band);
      assert(range.max >= range.min, `${section} ${band}`);
      for (let v = range.min; v <= range.max; v += 1) {
        assertEquals(bandFromLegacy(section, v), band, `${section} legacy ${v}`);
        covered += 1;
      }
    }
    assertEquals(covered, 31, `${section} covers 0..30 exactly once`);
  }
  // Spot values straight from ETS Table 6.
  assertEquals(legacyRangeForBand("reading", 4), { min: 18, max: 21 });
  assertEquals(legacyRangeForBand("listening", 5), { min: 22, max: 25 });
  assertEquals(legacyRangeForBand("writing", 4.5), { min: 21, max: 23 });
  assertEquals(legacyRangeForBand("speaking", 5.5), { min: 27, max: 27 });
  assertEquals(legacyTotalForBand(6), 114);
  assertEquals(legacyTotalForBand(4), 72);
  assertEquals(legacyTotalForBand(1), 0);
});

Deno.test("CEFR mapping follows ETS Table 7", () => {
  assertEquals([6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map(cefrForBand), [
    "C2", "C1", "C1", "B2", "B2", "B1", "B1", "A2", "A2", "A1", "A1",
  ]);
});

Deno.test("overall band is the mean rounded to the nearest half band", () => {
  assertEquals(overallBandFrom([4, 4.5, 4, 4.5]), 4.5); // 4.25 -> 4.5
  assertEquals(overallBandFrom([5, 5, 4.5, 4.5]), 5); // 4.75 -> 5
  assertEquals(overallBandFrom([3.5, 3.5, 4, 3.5]), 3.5); // 3.625 -> 3.5
  assertEquals(overallBandFrom([6, 6, 5.5, 6]), 6); // 5.875 -> 6
  assertEquals(overallBandFrom([1, 1, 1, 1.5]), 1); // 1.125 -> 1
  assertEquals(overallBandFrom([4, 4, null, 4]), null);
  assertEquals(overallBandFrom([4, 4, 4]), null);
});

Deno.test("section band from raw points, lower module capped at 4.5", () => {
  assertEquals(sectionBandFromRaw("reading", 50, 50, "upper"), 6);
  assertEquals(sectionBandFromRaw("reading", 50, 50, "lower"), 4.5);
  assertEquals(sectionBandFromRaw("listening", 47, 47, "lower"), 4.5);
  assertEquals(sectionBandFromRaw("reading", 0, 50, "lower"), 1);
  assertEquals(sectionBandFromRaw("writing", 20, 20, null), 6);
  assertEquals(sectionBandFromRaw("writing", 13, 20, null), 4); // 19.5 -> 20 -> 4
  assertEquals(sectionBandFromRaw("speaking", 44, 55, null), 4.5); // 24 -> 4.5
  assertEquals(sectionBandFromRaw("speaking", 0, 0, null), null);
});

Deno.test("Listen and Repeat estimate follows the 0-5 scoring guide shape", () => {
  const target = "You can find sea lions and elephants further down the path.";
  assertEquals(estimateListenRepeat(target, "You can find sea lions and elephants further down the path").score, 5);
  assertEquals(estimateListenRepeat(target, "you can find the sea lions and elephants further down the path").score, 4);
  assertEquals(estimateListenRepeat(target, "You can find sea lion and elephant further down path").score, 4);
  assertEquals(estimateListenRepeat(target, "you can find the lions and elephants down there on the path").score, 3);
  assertEquals(estimateListenRepeat(target, "you can find sea lions").score, 2);
  assertEquals(estimateListenRepeat(target, "elephants").score, 1);
  assertEquals(estimateListenRepeat(target, "").score, 0);
  assertEquals(estimateListenRepeat(target, "I do not know the answer").score, 0);
  assertEquals(estimateListenRepeat("We don't open on Sundays.", "We do not open on Sundays").score, 5);
});

Deno.test("basic interview estimate never awards 5", () => {
  const q = "What kind of reaction do you have to cities, and why?";
  const long = Array.from({ length: 12 }, (_, i) => `cities feel exciting because there are always new places number${i} to explore`).join(" ");
  assertEquals(basicInterviewEstimate(q, "").score, 0);
  assertEquals(basicInterviewEstimate(q, "I like it").score, 1);
  assert(basicInterviewEstimate(q, long).score <= 4);
});

const sections: Toefl2026SectionInput[] = [
  { id: "r1", type: "reading", metadata: { type: "reading", toefl_module: "router" } },
  { id: "r2", type: "reading", metadata: { type: "reading", toefl_module: "second" } },
  { id: "l1", type: "listening", metadata: { type: "listening", toefl_module: "router" } },
  { id: "l2", type: "listening", metadata: { type: "listening", toefl_module: "second" } },
  { id: "w", type: "writing", metadata: { type: "writing" } },
  { id: "s", type: "speaking", metadata: { type: "speaking" } },
];

const unit = (id: string, section: string, task: string, score: number, max: number, tier?: string): Toefl2026UnitInput => ({
  id, section_id: section, type: "x", score, max, metadata: { toefl_task: task, ...(tier ? { difficulty_tier: tier } : {}) },
});

Deno.test("full result: routing, tier filtering, constructed scores and overall band", () => {
  const units: Toefl2026UnitInput[] = [
    unit("cw1", "r1", "complete_the_words", 20, 20),
    unit("ap1", "r1", "read_academic_passage", 4, 10),
    unit("cwL", "r2", "complete_the_words", 10, 10, "standard"),
    unit("cwU", "r2", "complete_the_words", 7, 10, "advanced"),
    unit("apU", "r2", "read_academic_passage", 8, 10, "advanced"),
    unit("lc", "l1", "listen_choose_response", 10, 27),
    unit("lL", "l2", "listen_conversation", 15, 20, "standard"),
    unit("lU", "l2", "listen_conversation", 0, 20, "advanced"),
    unit("bs", "w", "build_sentence", 8, 10),
    unit("em", "w", "write_email", 0, 0),
    unit("ad", "w", "write_academic_discussion", 0, 0),
    ...Array.from({ length: 7 }, (_, i) => unit(`rp${i}`, "s", "listen_repeat", 0, 0)),
    ...Array.from({ length: 4 }, (_, i) => unit(`iv${i}`, "s", "take_interview", 0, 0)),
  ];
  const result = buildToefl2026Result({
    sections,
    units,
    routeDecisions: { r2: { tier: "advanced" } },
    writing: [{ content_unit_id: "em", score: 4 }, { content_unit_id: "ad", score: 5 }],
    speaking: [
      ...Array.from({ length: 7 }, (_, i) => ({ content_unit_id: `rp${i}`, score: 4 })),
      ...Array.from({ length: 4 }, (_, i) => ({ content_unit_id: `iv${i}`, score: 4 })),
    ],
    mode: "full_test",
  });
  // Reading: router 24/30 (80%) -> upper; upper units 15/20 -> 39/50 = 0.78 -> 23 -> 4.5
  assertEquals(result.sections.reading?.module_path, "upper");
  assertEquals(result.sections.reading?.raw, 39);
  assertEquals(result.sections.reading?.max, 50);
  assertEquals(result.sections.reading?.band, 4.5);
  assertEquals(result.sections.reading?.legacy_range, { min: 22, max: 23 });
  // Listening: no stored decision; router 10/27 (37%) -> lower; 25/47 -> round(21*0.532)=11 -> 3
  assertEquals(result.sections.listening?.module_path, "lower");
  assertEquals(result.sections.listening?.raw, 25);
  assertEquals(result.sections.listening?.band, 3);
  // Writing: 8 + 4 + 5 = 17/20 -> 25.5 -> 26 -> 5
  assertEquals(result.sections.writing?.raw, 17);
  assertEquals(result.sections.writing?.band, 5);
  // Speaking: 44/55 -> 24 -> 4.5
  assertEquals(result.sections.speaking?.band, 4.5);
  assertEquals(result.overall_band, 4.5); // (4.5 + 3 + 5 + 4.5) / 4 = 4.25 -> 4.5
  assertEquals(result.overall_cefr, "B2");
  assertEquals(result.overall_legacy_total_min, 86);
  assertEquals(result.is_estimated, true);
  const cw = result.tasks.find((t) => t.task === "complete_the_words");
  assertEquals(cw, { task: "complete_the_words", section: "reading", raw: 27, max: 30, items: 2, scale: "points" });
});

Deno.test("pending constructed scores keep the band and overall empty instead of inventing numbers", () => {
  const units = [
    unit("bs", "w", "build_sentence", 10, 10),
    unit("em", "w", "write_email", 0, 0),
    unit("rp", "s", "listen_repeat", 0, 0),
  ];
  const result = buildToefl2026Result({
    sections, units, routeDecisions: {}, writing: null, speaking: null, speakingUnscored: ["rp"], mode: "full_test",
  });
  assertEquals(result.sections.writing?.band, null);
  assertEquals(result.sections.writing?.pending_reason, "writing_ai_pending");
  assertEquals(result.sections.speaking?.pending_reason, "speaking_no_transcript");
  assertEquals(result.overall_band, null);
  assert(String(result.overall_pending_reason).startsWith("missing:"));
});

Deno.test("practice sets report points, never a band", () => {
  const result = buildToefl2026Result({
    sections: [{ id: "p", type: "reading", metadata: { type: "reading" } }],
    units: [unit("cw", "p", "complete_the_words", 7, 10)],
    routeDecisions: {}, writing: null, speaking: null, mode: "practice",
  });
  assertEquals(result.sections.reading?.raw, 7);
  assertEquals(result.sections.reading?.band, null);
  assertEquals(result.sections.reading?.pending_reason, "practice_set");
  assertEquals(result.overall_band, null);
});

Deno.test("next steps link the weakest tasks to Playbook modules", () => {
  const steps = nextStepModules([
    { task: "complete_the_words", section: "reading", raw: 9, max: 10, items: 1, scale: "points" },
    { task: "write_email", section: "writing", raw: 2, max: 5, items: 1, scale: "0-5" },
    { task: "listen_conversation", section: "listening", raw: 3, max: 10, items: 5, scale: "points" },
    { task: "listen_academic_talk", section: "listening", raw: 4, max: 8, items: 2, scale: "points" },
  ]);
  assertEquals(steps.map((s) => s.slug), ["listening-strategy", "writing-email", "reading-complete-the-words"]);
  assertEquals(
    playbookDiagnosticUrl("abc-123"),
    "https://playbook.toefl.schood.online/diagnostic?source=toefl-simulator&session_id=abc-123",
  );
});
