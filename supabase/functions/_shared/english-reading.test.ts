import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildReadingIssues,
  normalizeQuestions,
  parseAnswers,
  publicQuestions,
  questionSkill,
  scoreReadingAnswers,
} from "./english-reading.ts";

const raw = [
  { id: "q1", type: "mcq", prompt: "Where does Aziz work?", options: ["A bank", "A school", "A shop", "A farm"], answer_index: 1, explanation: "Paragraph 1: he teaches at a school.", skill: "detail" },
  { id: "q2", type: "mcq", prompt: "What is the text mainly about?", options: ["a", "b", "c", "d"], answer_index: 3, explanation: "The title and last line.", skill: "reading.main_idea" },
  { id: "q3", type: "mcq", prompt: "How does Aziz probably feel?", options: ["a", "b", "c", "d"], answer_index: 0, explanation: "He smiles.", skill: "inference" },
];

Deno.test("well-formed questions are kept and malformed ones dropped", () => {
  const questions = normalizeQuestions([
    ...raw,
    { id: "bad-index", prompt: "x", options: ["a", "b"], answer_index: 2 },
    { id: "one-option", prompt: "x", options: ["a"], answer_index: 0 },
    { id: "empty-option", prompt: "x", options: ["a", " "], answer_index: 0 },
    { id: "q1", prompt: "duplicate id", options: ["a", "b"], answer_index: 0 },
    { prompt: "no id", options: ["a", "b"], answer_index: 0 },
    "not an object",
  ]);
  assertEquals(questions.map((question) => question.id), ["q1", "q2", "q3"]);
  assertEquals(normalizeQuestions(null), []);
  assertEquals(normalizeQuestions({}), []);
});

Deno.test("skills are normalised, defaulting to detail", () => {
  assertEquals(questionSkill("detail"), "reading.detail");
  assertEquals(questionSkill("reading.inference"), "reading.inference");
  assertEquals(questionSkill("Main idea"), "reading.main_idea");
  assertEquals(questionSkill("vocabulary"), "reading.vocabulary");
  assertEquals(questionSkill("something else"), "reading.detail");
  assertEquals(questionSkill(undefined), "reading.detail");
});

Deno.test("public questions never include the answer key", () => {
  for (const question of publicQuestions(normalizeQuestions(raw))) {
    assertEquals("answer_index" in question, false);
    assertEquals("explanation" in question, false);
  }
});

Deno.test("scoring is accuracy; skipped and out-of-range answers are wrong", () => {
  const questions = normalizeQuestions(raw);
  const score = scoreReadingAnswers(questions, [
    { question_id: "q1", option_index: 1 },
    { question_id: "q1", option_index: 0 }, // a second answer for the same question is ignored
    { question_id: "q2", option_index: 9 },
  ]);
  assertEquals(score.correct, 1);
  assertEquals(score.total, 3);
  assertEquals(score.score, 33);
  assertEquals(score.results.map((result) => result.chosen_index), [1, null, null]);
  assertEquals(score.results.map((result) => result.correct), [true, false, false]);
  assertEquals(score.results[0]?.explanation, "Paragraph 1: he teaches at a school.");
});

Deno.test("all correct scores 100 and produces no issues", () => {
  const questions = normalizeQuestions(raw);
  const score = scoreReadingAnswers(questions, questions.map((question) => ({ question_id: question.id, option_index: question.type === "mcq" ? question.answer_index : 0 })));
  assertEquals(score.score, 100);
  assertEquals(buildReadingIssues(questions, score, "slug"), []);
});

Deno.test("issues carry the question's subskill", () => {
  const questions = normalizeQuestions(raw);
  const score = scoreReadingAnswers(questions, [{ question_id: "q1", option_index: 0 }]);
  const issues = buildReadingIssues(questions, score, "a-text");
  assertEquals(issues.map((issue) => issue.subskill_key), ["reading.detail", "reading.main_idea", "reading.inference"]);
  assertEquals(issues[0]?.category, "reading");
  assertEquals(issues[0]?.location_ref, "a-text#q1");
});

Deno.test("malformed answer payloads are treated as unanswered", () => {
  assertEquals(parseAnswers("nope").size, 0);
  assertEquals(parseAnswers([{ question_id: "q1", option_index: "1" }, { question_id: "q2", option_index: 1.5 }]).size, 0);
  assertEquals(scoreReadingAnswers([], []).score, 0);
});
