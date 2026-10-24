import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHECK_ROUNDS,
  checkRound,
  checkStartLevel,
  cleanCheckHistory,
  cleanCheckQuestions,
  currentTestedLevels,
  parseCheckResult,
} from "./english-progress-check.ts";
import { appendLevelHistory, CHECK_INTERVAL_DAYS, levelCheckStatus } from "./english-levels.ts";

Deno.test("the check is two rounds and the last one always finalizes", () => {
  assertEquals(CHECK_ROUNDS, 2);
  assertEquals(checkRound({}), { round: 0, finalize: false });
  assertEquals(checkRound({ round: 1 }), { round: 1, finalize: false });
  assertEquals(checkRound({ round: 7 }), { round: 2, finalize: true });
  assertEquals(checkRound({ round: 0, finalize: true }), { round: 0, finalize: true });
});

Deno.test("each round keeps one clean question per tested skill", () => {
  const questions = cleanCheckQuestions([
    { skill: "Reading", prompt: "What is the main idea?", passage: "Text", choices: [] },
    { skill: "reading", prompt: "A second reading question" },
    { skill: "speaking", prompt: "Not tested here" },
    { skill: "grammar", prompt: "Choose", choices: ["a", "b", "c", "d", "e"] },
    { skill: "writing", prompt: "" },
    "junk",
  ]);
  assertEquals(questions.map((q) => q.skill), ["reading", "grammar"]);
  assertEquals(questions[1]!.choices.length, 4);
  const history = cleanCheckHistory([
    ...Array.from({ length: 10 }, () => ({ question: { skill: "listening", prompt: "Q" }, answer: "A" })),
    { question: { skill: "nope", prompt: "Q" }, answer: "x" },
  ]);
  assertEquals(history.length, 8);
});

Deno.test("the check starts from the learner's own levels", () => {
  const meta = { placement: { per_skill: { reading: { level: "B2" }, grammar: "A2" } } };
  const levels = currentTestedLevels(meta, "B1");
  assertEquals(levels.per_skill, { reading: "B2", listening: "B1", writing: "B1", grammar: "A2" });
  assertEquals(checkStartLevel(levels), "B1");
  assertEquals(checkStartLevel(currentTestedLevels(meta, null)), "B2");
  assertEquals(checkStartLevel({ overall: null, per_skill: {} }), "B1");
});

Deno.test("the result keeps only valid levels", () => {
  const result = parseCheckResult({ overall_level: "b2", per_skill: { reading: { level: "C1", evidence: "ok" }, writing: "Z9" }, next_steps: ["a", "b", "c", "d"] }, "B1");
  assertEquals(result.overall_level, "B2");
  assertEquals(result.per_skill.reading, { level: "C1", evidence: "ok" });
  assertEquals(result.per_skill.writing.level, "B2");
  assertEquals(result.next_steps.length, 3);
  assertEquals(parseCheckResult(null, "A2").overall_level, "A2");
});

Deno.test("a check is ready 28 days after placement, then 28 days after each check", () => {
  const placedAt = "2026-09-01T08:00:00.000Z";
  const meta: Record<string, unknown> = { placement: { overall_level: "B1", per_skill: {}, completed_at: placedAt, method: "self" } };
  const day = (n: number) => new Date(Date.parse(placedAt) + n * 86_400_000);
  assertEquals(levelCheckStatus(meta, day(CHECK_INTERVAL_DAYS - 1)).due, false);
  assertEquals(levelCheckStatus(meta, day(CHECK_INTERVAL_DAYS)).due, true);
  meta.level_history = appendLevelHistory(meta, { at: day(30).toISOString(), source: "check", overall: "B2", per_skill: { reading: "B2" }, method: "test" });
  const after = levelCheckStatus(meta, day(31));
  assertEquals(after.due, false);
  assertEquals(after.next_at, day(30 + CHECK_INTERVAL_DAYS).toISOString());
  assertEquals(levelCheckStatus(meta, day(30 + CHECK_INTERVAL_DAYS)).due, true);
});
