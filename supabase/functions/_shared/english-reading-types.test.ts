import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  countGaps,
  normalizeGap,
  normalizeQuestions,
  publicQuestions,
  reviewItemsFor,
  scoreReadingAnswers,
} from "./english-reading.ts";
import { normalizeStudioItem, rowToStudioPayload } from "./english-content-studio.ts";

const mixed = [
  { id: "q1", prompt: "What is the text about?", options: ["A", "B", "C"], answer_index: 1, explanation: "Title.", skill: "main_idea" },
  { id: "t1", type: "tfng", prompt: "The library opens at 8.", answer: "false", explanation: "It opens at 9." },
  { id: "t2", type: "tfng", variant: "yes_no", prompt: "The writer likes rain.", answer: "No", explanation: "\"I hate grey days.\"" },
  {
    id: "h1",
    type: "headings",
    prompt: "Choose the best heading for each paragraph.",
    options: ["A new start", "Problems at work", "Help from a stranger", "Saving money"],
    items: [{ paragraph: 1, answer_index: 1 }, { paragraph: 2, answer_index: 2 }],
    explanation: "Paragraph 1 is about work; paragraph 2 about the woman.",
  },
  {
    id: "g1",
    type: "gap",
    prompt: "Complete the summary with ONE word from the text.",
    text: "Jasur forgot his ___ and got ___ at the bus stop.",
    answers: [["umbrella"], ["wet", "soaked"]],
    explanation: "Paragraph 2.",
  },
];

Deno.test("reading types: every type parses; untyped questions stay multiple choice", () => {
  const questions = normalizeQuestions(mixed);
  assertEquals(questions.map((question) => question.type), ["mcq", "tfng", "tfng", "headings", "gap"]);
  const yesNo = questions[2]!;
  assert(yesNo.type === "tfng" && yesNo.variant === "yes_no" && yesNo.answer === "false");
  const headings = questions[3]!;
  assert(headings.type === "headings");
  assertEquals(headings.skill, "reading.main_idea", "headings default to the main-idea subskill");
  assertEquals(headings.items.map((item) => item.id), ["p1", "p2"]);
});

Deno.test("reading types: malformed questions of the new types are dropped", () => {
  assertEquals(normalizeQuestions([
    { id: "a", type: "tfng", prompt: "x", answer: "maybe" },
    { id: "b", type: "headings", prompt: "x", options: ["one"], items: [{ paragraph: 1, answer_index: 0 }] },
    { id: "c", type: "headings", prompt: "x", options: ["one", "two"], items: [{ paragraph: 1, answer_index: 0 }, { paragraph: 2, answer_index: 1 }, { paragraph: 3, answer_index: 1 }] },
    { id: "d", type: "headings", prompt: "x", options: ["one", "two"], items: [{ paragraph: 0, answer_index: 0 }] },
    { id: "e", type: "gap", prompt: "x", text: "No gaps here.", answers: [] },
    { id: "f", type: "gap", prompt: "x", text: "One ___ gap.", answers: [["a"], ["b"]] },
    { id: "g", type: "gap", prompt: "x", text: "One ___ gap.", answers: [["word"]], word_bank: ["other", "words"] },
    { id: "h", type: "essay", prompt: "x" },
  ]), []);
});

Deno.test("reading types: public questions hide every answer and keep options for older apps", () => {
  const shown = publicQuestions(normalizeQuestions(mixed));
  const json = JSON.stringify(shown);
  for (const secret of ["answer_index", "\"answer\"", "answers", "explanation", "umbrella", "soaked"]) {
    assert(!json.includes(secret), `public questions leak ${secret}`);
  }
  assertEquals(shown[1], { id: "t1", type: "tfng", variant: "tfng", prompt: "The library opens at 8.", options: ["True", "False", "Not given"], skill: "reading.detail" });
  assertEquals(shown[2]!.options, ["Yes", "No", "Not given"]);
  const gap = shown[4]!;
  assert(gap.type === "gap" && gap.gaps === 2 && gap.options.length === 0);
  const headings = shown[3]!;
  assert(headings.type === "headings");
  assertEquals(headings.items, [{ id: "p1", paragraph: 1 }, { id: "p2", paragraph: 2 }]);
});

Deno.test("reading types: scoring counts one point per heading item and per gap", () => {
  const questions = normalizeQuestions(mixed);
  const score = scoreReadingAnswers(questions, [
    { question_id: "q1", option_index: 1 },
    { question_id: "t1", value: "false" },
    { question_id: "t2", value: "yes" },
    { question_id: "h1", values: [1, 0] },
    { question_id: "g1", texts: ["an Umbrella!", "soaked"] },
  ]);
  assertEquals(score.total, 1 + 1 + 1 + 2 + 2);
  assertEquals(score.correct, 1 + 1 + 0 + 1 + 2);
  assertEquals(score.score, Math.round((5 / 7) * 100));
  const headings = score.results[3]!;
  assertEquals(headings.parts.map((part) => part.correct), [true, false]);
  assertEquals(headings.parts[1], { id: "p2", correct: false, given: "A new start", expected: "Help from a stranger" });
  const gap = score.results[4]!;
  assert(gap.correct);
  assertEquals(gap.parts.map((part) => part.expected), ["umbrella", "wet"]);
  const tf = score.results[2]!;
  assertEquals([tf.chosen_index, tf.answer_index], [0, 1]);
});

Deno.test("reading types: an older app's option index answers a True/False/Not given question", () => {
  const questions = normalizeQuestions(mixed);
  const score = scoreReadingAnswers(questions, [{ question_id: "t1", option_index: 1 }]);
  assertEquals(score.results[1]!.correct, true);
  assertEquals(score.results.filter((result) => result.correct).length, 1);
});

Deno.test("reading types: skipped parts are wrong and reported as given ''", () => {
  const questions = normalizeQuestions(mixed);
  const score = scoreReadingAnswers(questions, []);
  assertEquals(score.correct, 0);
  assertEquals(score.results[3]!.parts.map((part) => part.given), ["", ""]);
  assertEquals(score.results[4]!.parts.map((part) => part.given), ["", ""]);
});

Deno.test("reading types: gaps compare without case, punctuation or a leading article", () => {
  assertEquals(normalizeGap("  The Umbrella. "), "umbrella");
  assertEquals(normalizeGap("well-known"), "well known");
  assertEquals(countGaps("A ___ and a _____ but not __."), 2);
});

Deno.test("reading types: wrong answers come back as choice review items", () => {
  const questions = normalizeQuestions(mixed);
  const score = scoreReadingAnswers(questions, [{ question_id: "h1", values: [1, 3] }]);
  const items = reviewItemsFor(questions, score, "rain");
  assertEquals(items.map((item) => item.item_key), ["reading:rain:q1", "reading:rain:t1", "reading:rain:t2", "reading:rain:h1:p2"]);
  assertEquals(items[1]!.payload.options, ["True", "False", "Not given"]);
  assertEquals(items[1]!.payload.answer_index, 1);
  assertEquals(items[3]!.payload.prompt, "Which heading fits paragraph 2?");
});

Deno.test("reading types: the content studio accepts and round-trips every type", () => {
  const item = {
    slug: "a-rainy-day",
    title: "A rainy day",
    level: "A1",
    status: "published",
    summary: "s",
    content_markdown: "One. Two.",
    category: "Everyday",
    theme: "weather",
    questions: mixed,
  };
  const result = normalizeStudioItem("reading", item, []);
  assert(result.ok, JSON.stringify(!result.ok ? result.errors : null));
  const stored = result.parent.questions as unknown[];
  assertEquals(normalizeQuestions(stored).length, 5);
  const payload = rowToStudioPayload("reading", { ...result.parent, slug: "a-rainy-day" }, []);
  const again = normalizeStudioItem("reading", { ...payload.item, status: "published" }, []);
  assert(again.ok);
  assertEquals(again.parent.questions, stored);
});

Deno.test("reading types: the studio explains a broken question of a new type", () => {
  const result = normalizeStudioItem("reading", {
    slug: "broken-gap", title: "Broken gap", level: "A1", status: "draft", summary: "s", content_markdown: "t", category: "c", theme: "t",
    questions: [mixed[0], { id: "bad", type: "gap", prompt: "x", text: "no gaps", answers: [["a"]] }],
  }, []);
  assert(!result.ok);
  assertEquals(result.errors.map((error) => error.field), ["questions[1]"]);
});
