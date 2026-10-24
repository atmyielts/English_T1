import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  biggestMoves,
  chooseDraft,
  criterionDeltas,
  criterionTrend,
  modelAnswerLength,
  modelAnswerLevel,
  normalizeModelAnswer,
  readCriteria,
  rubricSeries,
  sparklinePoints,
  wordsUsedLine,
} from "./english-writing-depth.ts";

const feedbackCriteria = (task: number, organisation: number, vocabulary: number, grammar: number) => [
  { key: "task", score: task, comment: "" },
  { key: "organisation", score: organisation, comment: "" },
  { key: "vocabulary", score: vocabulary, comment: "" },
  { key: "grammar", score: grammar, comment: "" },
];

Deno.test("readCriteria reads both the feedback array and the compact object", () => {
  assertEquals(readCriteria(feedbackCriteria(70, 60, 55, 40)), { task: 70, organisation: 60, vocabulary: 55, grammar: 40 });
  assertEquals(readCriteria({ task: 80, grammar: "65", bogus: 10 }), { task: 80, grammar: 65 });
  assertEquals(readCriteria({ task: { score: 101 } }), { task: 100 });
  assertEquals(readCriteria(null), {});
});

Deno.test("score change per criterion between draft 1 and draft 2", () => {
  const result = criterionDeltas(
    { overall: 58, criteria: feedbackCriteria(70, 60, 55, 45) },
    { overall: 66, criteria: feedbackCriteria(75, 60, 62, 67) },
  );
  assertEquals(result.overall, { before: 58, after: 66, delta: 8 });
  assertEquals(result.criteria.map((entry) => [entry.key, entry.delta]), [["task", 5], ["organisation", 0], ["vocabulary", 7], ["grammar", 22]]);
  const moves = biggestMoves(result.criteria);
  assertEquals(moves.up?.key, "grammar");
  assertEquals(moves.down, null);
});

Deno.test("unknown sides give a null delta, never a made-up number", () => {
  const result = criterionDeltas({ overall: null, criteria: { task: 60 } }, { overall: 70, criteria: feedbackCriteria(65, 60, 50, 40) });
  assertEquals(result.overall.delta, null);
  assertEquals(result.criteria.find((entry) => entry.key === "task")?.delta, 5);
  assertEquals(result.criteria.find((entry) => entry.key === "grammar")?.delta, null);
  assertEquals(biggestMoves(result.criteria).up?.key, "task");
});

Deno.test("rubric history: oldest first, newest kept, trend from first and last results", () => {
  const points = Array.from({ length: 15 }, (_, index) => ({
    at: `2026-10-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
    overall: 40 + index * 2,
    criteria: { task: 50 + index, grammar: 40 + index * 2 },
    title: null,
    slug: null,
    source: "ai" as const,
  }));
  const { points: kept, series, trend } = rubricSeries(points.reverse(), 12);
  assertEquals(kept.length, 12);
  assert(kept[0]!.at < kept[11]!.at);
  assertEquals(series.task.length, 12);
  assertEquals(series.organisation.every((value) => value === null), true);
  assertEquals(trend.organisation, null);
  assert((trend.grammar ?? 0) > (trend.task ?? 0));
  assertEquals(criterionTrend([50, null, 70]), 20);
  assertEquals(criterionTrend([50]), null);
});

Deno.test("sparkline points: 0 at the bottom, 100 at the top, gaps skipped", () => {
  assertEquals(sparklinePoints([0, null, 100], 100, 40), [{ x: 0, y: 40, value: 0 }, { x: 100, y: 0, value: 100 }]);
  assertEquals(sparklinePoints([50], 80, 20), [{ x: 40, y: 10, value: 50 }]);
  assertEquals(sparklinePoints([], 80, 20), []);
});

Deno.test("chooseDraft: the newer copy wins; same text is no conflict", () => {
  assertEquals(chooseDraft(null, null).source, "none");
  assertEquals(chooseDraft({ text: "phone text", at: null }, null), { text: "phone text", source: "local", conflict: false });
  assertEquals(chooseDraft(null, { text: "server", at: "2026-10-01T00:00:00Z" }).source, "server");
  assertEquals(chooseDraft({ text: "same", at: "2026-10-02T00:00:00Z" }, { text: "same", at: "2026-10-01T00:00:00Z" }).conflict, false);
  assertEquals(chooseDraft({ text: "newer on this device", at: "2026-10-03T00:00:00Z" }, { text: "older", at: "2026-10-01T00:00:00Z" }).source, "local");
  assertEquals(chooseDraft({ text: "older here", at: "2026-10-01T00:00:00Z" }, { text: "written on the PC later", at: "2026-10-03T00:00:00Z" }).source, "server");
  // An old app version stored a plain string without a time: the longer text wins.
  assertEquals(chooseDraft({ text: "a long draft typed offline and never sent", at: null }, { text: "short", at: "2026-10-01T00:00:00Z" }).source, "local");
  assertEquals(chooseDraft({ text: "  ", at: null }, { text: "server", at: null }).source, "server");
});

Deno.test("model answer level is one above the learner (or the task), capped at C2", () => {
  assertEquals(modelAnswerLevel("A2", "B1"), "B1");
  assertEquals(modelAnswerLevel(null, "B1"), "B2");
  assertEquals(modelAnswerLevel("c2", null), "C2");
  assertEquals(modelAnswerLevel("x", undefined), "B2");
  assertEquals(modelAnswerLength(80, 120), { min: 80, max: 120 });
  assertEquals(modelAnswerLength(20, 400), { min: 30, max: 180 });
});

Deno.test("model answer validation: inside a generous range, notes trimmed", () => {
  const text = Array.from({ length: 70 }, () => "word").join(" ");
  const ok = normalizeModelAnswer({ text, notes: ["Clear opening.", "", "Linking words.", "x", "y"] }, { min: 60, max: 100 });
  assertEquals(ok?.word_count, 70);
  assertEquals(ok?.notes.length, 3);
  assertEquals(normalizeModelAnswer({ text: "Too short." }, { min: 60, max: 100 }), null);
  assertEquals(normalizeModelAnswer({ text: Array.from({ length: 300 }, () => "w").join(" ") }, { min: 60, max: 100 }), null);
  assertEquals(normalizeModelAnswer("nope", { min: 60, max: 100 }), null);
});

Deno.test("words used line counts only suggested words, once each", () => {
  assertEquals(wordsUsedLine(["decide", "Improve", "rarely"], ["improve", "decide", "decide", "other"]), { used: 2, total: 3 });
  assertEquals(wordsUsedLine([], ["x"]), { used: 0, total: 0 });
});
