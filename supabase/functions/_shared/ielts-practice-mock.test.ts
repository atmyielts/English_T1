import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  gradeMock,
  gradeMockAnswer,
  judgementToken,
  normalizeMockQuestion,
  normalizeMockQuestions,
  publicMockQuestions,
  resolveChoiceIndex,
} from "./ielts-practice-mock.ts";

const options = ["Rising sea levels", "Coastal tourism", "Urban flooding", "Soil erosion"];

Deno.test("choice key: option text, letter, labelled text and number forms all resolve", () => {
  assertEquals(resolveChoiceIndex("Urban flooding", options), 2);
  assertEquals(resolveChoiceIndex("  urban FLOODING. ", options), 2);
  assertEquals(resolveChoiceIndex("C", options), 2);
  assertEquals(resolveChoiceIndex("(c)", options), 2);
  assertEquals(resolveChoiceIndex("Option C", options), 2);
  assertEquals(resolveChoiceIndex("C) Urban flooding", options), 2);
  // A JSON number is a 0-based index; a numeric string is a 1-based option number.
  assertEquals(resolveChoiceIndex(2, options), 2);
  assertEquals(resolveChoiceIndex("3", options), 2);
  assertEquals(resolveChoiceIndex(4, options), 3);
  assertEquals(resolveChoiceIndex("Z", options), null);
  assertEquals(resolveChoiceIndex(9, options), null);
  assertEquals(resolveChoiceIndex("", options), null);
});

Deno.test("option text wins over letter/number readings", () => {
  // An option that is literally a number or a letter must match as text first.
  assertEquals(resolveChoiceIndex("1990", ["1980", "1990", "2000"]), 1);
  assertEquals(resolveChoiceIndex("B", ["A", "B", "C"]), 1);
});

Deno.test("True/False/Not Given keys normalise from T, NG, not given", () => {
  assertEquals(judgementToken("NG"), "not given");
  assertEquals(judgementToken("Not given"), "not given");
  const q = normalizeMockQuestion({ prompt: "The study lasted ten years.", type: "true_false_not_given", correct_answer: "NG", explanation: "x" });
  assertEquals(q?.options, ["True", "False", "Not Given"]);
  assertEquals(q?.correct_index, 2);
  const t = normalizeMockQuestion({ prompt: "p", type: "TFNG", options: ["True", "False", "Not Given"], correct_answer: "T" });
  assertEquals(t?.correct_index, 0);
  const yn = normalizeMockQuestion({ prompt: "p", type: "yes_no_not_given", correct_answer: "No" });
  assertEquals(yn?.options, ["Yes", "No", "Not Given"]);
  assertEquals(yn?.correct_index, 1);
});

Deno.test("the reported bug: chosen option text vs a letter key is graded correct", () => {
  const q = normalizeMockQuestion({ prompt: "Main cause?", type: "multiple_choice", options, correct_answer: "C" })!;
  assertEquals(gradeMockAnswer(q, "Urban flooding"), true);
  assertEquals(gradeMockAnswer(q, 2), true);
  assertEquals(gradeMockAnswer(q, "Soil erosion"), false);
  assertEquals(gradeMockAnswer(q, ""), false);
  assertEquals(gradeMockAnswer(q, null), false);
});

Deno.test("gap fill accepts listed alternatives, case, punctuation and articles", () => {
  const q = normalizeMockQuestion({ prompt: "Farmers planted ____.", type: "gap_fill", correct_answer: "drought-resistant crops / hardy crops" })!;
  assertEquals(q.type, "gap_fill");
  assertEquals(q.accepted, ["drought-resistant crops", "hardy crops"]);
  assertEquals(gradeMockAnswer(q, "Drought resistant crops."), true);
  assertEquals(gradeMockAnswer(q, "the hardy crops"), true);
  assertEquals(gradeMockAnswer(q, "crops"), false);
});

Deno.test("ungradable questions are dropped instead of shown", () => {
  assertEquals(normalizeMockQuestion({ prompt: "p", type: "multiple_choice", options, correct_answer: "Volcanoes" }), null);
  assertEquals(normalizeMockQuestion({ prompt: "p", type: "multiple_choice", options: ["Same", "same"], correct_answer: "Same" }), null);
  assertEquals(normalizeMockQuestion({ prompt: "", options, correct_answer: "A" }), null);
  assertEquals(normalizeMockQuestion({ prompt: "p", type: "gap_fill", correct_answer: "" }), null);
  assertEquals(normalizeMockQuestions([null, { prompt: "p", options, correct_answer: "A" }]).length, 1);
});

Deno.test("public questions never carry the key", () => {
  const questions = normalizeMockQuestions([{ prompt: "p", options, correct_answer: "A", explanation: "because" }]);
  const shown = publicMockQuestions(questions)[0] as Record<string, unknown>;
  assertEquals("correct_index" in shown, false);
  assertEquals("explanation" in shown, false);
  assertEquals("accepted" in shown, false);
});

Deno.test("gradeMock scores a whole submission", () => {
  const questions = normalizeMockQuestions([
    { prompt: "1", options, correct_answer: "A" },
    { prompt: "2", type: "true_false_not_given", correct_answer: "False" },
    { prompt: "3", type: "gap_fill", correct_answer: "wetlands" },
  ]);
  const graded = gradeMock(questions, ["Rising sea levels", 0, "Wetlands"]);
  assertEquals(graded.raw_score, 2);
  assertEquals(graded.max_score, 3);
  assertEquals(graded.results.map((row) => row.correct), [true, false, true]);
  assertEquals(graded.results[1]?.correct_answer, "False");
  assertEquals(graded.accuracy_ratio, 0.6667);
});
