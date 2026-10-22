import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { firstReviewAt, missedFirst, normalizeChoice, parseDeckAnswers, scoreDeckQuiz } from "./english-vocabulary.ts";

const words = [
  { id: "w1", word: "anxious" },
  { id: "w2", word: "proud" },
  { id: "w3", word: "draw a conclusion" },
  { id: "w4", word: "lonely" },
];

Deno.test("right, wrong and unanswered words are scored against the deck", () => {
  const score = scoreDeckQuiz(words, [
    { word_id: "w1", option: "anxious" },
    { word_id: "w2", option: "lonely" },
    { word_id: "w3", option: "Draw  a conclusion " },
  ]);
  assertEquals(score.correct, 2);
  assertEquals(score.total, 4);
  assertEquals(score.ratio, 0.5);
  assertEquals(score.results.map((result) => result.correct), [true, false, true, false]);
  assertEquals(score.results[3], { word_id: "w4", word: "lonely", chosen: "", correct: false });
});

Deno.test("answers for words outside the deck are ignored", () => {
  const score = scoreDeckQuiz(words, [{ word_id: "other", option: "anxious" }]);
  assertEquals(score.correct, 0);
  assertEquals(score.total, 4);
});

Deno.test("an empty deck scores zero, not NaN", () => {
  assertEquals(scoreDeckQuiz([], []).ratio, 0);
});

Deno.test("parsing keeps the first answer per word and drops junk", () => {
  const parsed = parseDeckAnswers([
    { word_id: "w1", option: "proud" },
    { word_id: "w1", option: "anxious" },
    null,
    "w2",
    { word_id: "", option: "x" },
    { word_id: "w2" },
  ]);
  assertEquals(parsed, [{ word_id: "w1", option: "proud" }, { word_id: "w2", option: "" }]);
  assertEquals(parseDeckAnswers("nope"), []);
  assertEquals(parseDeckAnswers(Array.from({ length: 500 }, (_, index) => ({ word_id: `w${index}`, option: "a" }))).length, 100);
});

Deno.test("an empty choice never matches", () => {
  const score = scoreDeckQuiz([{ id: "w1", word: "x" }], [{ word_id: "w1", option: "" }]);
  assertEquals(score.correct, 0);
});

Deno.test("curly apostrophes match straight ones", () => {
  assertEquals(normalizeChoice("don’t"), normalizeChoice("don't"));
});

Deno.test("missed words are due now; known words wait a day", () => {
  const now = new Date("2026-10-22T10:00:00.000Z");
  assertEquals(firstReviewAt(false, now), "2026-10-22T10:00:00.000Z");
  assertEquals(firstReviewAt(true, now), "2026-10-23T10:00:00.000Z");
});

Deno.test("missed words come first, each group in deck order", () => {
  const ordered = missedFirst([
    { id: 1, correct: true },
    { id: 2, correct: false },
    { id: 3, correct: true },
    { id: 4, correct: false },
  ]);
  assertEquals(ordered.map((entry) => entry.id), [2, 4, 1, 3]);
});
