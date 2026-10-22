import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  combineDictation,
  gradeQuestions,
  listeningCorrectness,
  normalizeWords,
  parseQuestions,
  publicQuestions,
  scoreDictation,
} from "./english-listening.ts";

Deno.test("normalisation ignores case and punctuation", () => {
  assertEquals(normalizeWords("The doors are CLOSING, now!"), ["the", "doors", "are", "closing", "now"]);
});

Deno.test("accents are optional", () => {
  assertEquals(scoreDictation("The café car is in carriage six.", "the cafe car is in carriage 6").accuracy, 1);
});

Deno.test("contractions match their long forms", () => {
  assertEquals(scoreDictation("It's raining, so we can't go.", "it is raining so we cannot go").accuracy, 1);
  assertEquals(scoreDictation("It is late.", "It's late").accuracy, 1);
  assertEquals(scoreDictation("She's finished her work.", "She has finished her work").accuracy, 1);
  assertEquals(scoreDictation("I don't know, and I won't guess.", "I do not know and I will not guess").accuracy, 1);
  assertEquals(scoreDictation("I’m here.", "I am here").accuracy, 1);
});

Deno.test("digits and number words are the same", () => {
  assertEquals(scoreDictation("Leave from platform four.", "leave from platform 4").accuracy, 1);
  assertEquals(scoreDictation("It is thirty-two degrees.", "it is 32 degrees").accuracy, 1);
  assertEquals(scoreDictation("Wait twenty four hours.", "wait 24 hours").accuracy, 1);
  assertEquals(scoreDictation("About two hundred and fifty people came.", "about 250 people came").accuracy, 1);
  assertEquals(scoreDictation("Come to the 3rd floor at 7:30.", "come to the third floor at seven thirty").accuracy, 1);
  assertEquals(scoreDictation("It costs fifteen thousand som.", "it costs 15,000 som").accuracy, 1);
});

Deno.test("numbers separated by punctuation stay separate", () => {
  assertEquals(normalizeWords("I said twenty. Four came."), ["i", "said", "20", "4", "came"]);
  assertEquals(normalizeWords("Carriages one to five"), ["carriages", "1", "to", "5"]);
});

Deno.test("a wrong number is a mistake, not a spelling slip", () => {
  const result = scoreDictation("Platform four.", "platform five");
  assertEquals(result.correct_words, 1);
  assertEquals(result.missed_words, 1);
  assertEquals(result.extra_words, 1);
  assertEquals(result.tokens.map((token) => token.kind), ["ok", "missed", "extra"]);
});

Deno.test("missed, extra and misspelled words are reported in order", () => {
  const result = scoreDictation("The next train will leave from platform four.", "the next big trian will leave platform four");
  assertEquals(result.tokens, [
    { kind: "ok", text: "The" },
    { kind: "ok", text: "next" },
    { kind: "extra", text: "big" },
    { kind: "misspelled", text: "train", typed: "trian" },
    { kind: "ok", text: "will" },
    { kind: "ok", text: "leave" },
    { kind: "missed", text: "from" },
    { kind: "ok", text: "platform" },
    { kind: "ok", text: "four." },
  ]);
  assertEquals(result.expected_words, 8);
  assertEquals(result.correct_words, 6);
  assertEquals(result.misspelled_words, 1);
  assertEquals(result.missed_words, 1);
  assertEquals(result.extra_words, 1);
  // (6 + 0.5) / (8 + 0.5)
  assertEquals(result.accuracy, Math.round((6.5 / 8.5) * 10000) / 10000);
  assertEquals(result.review_words, ["train"]);
});

Deno.test("short different words are mishearings, not spelling slips", () => {
  const result = scoreDictation("The cat sat.", "the bat sat");
  assertEquals(result.misspelled_words, 0);
  assertEquals(result.missed_words, 1);
});

Deno.test("long words allow two slips", () => {
  const result = scoreDictation("Unfortunately the doctor is ill.", "Unfortunatly the docter is ill");
  assertEquals(result.misspelled_words, 2);
  assertEquals(result.correct_words, 3);
  assertEquals(result.review_words, ["Unfortunately", "doctor"]);
});

Deno.test("empty answer scores zero and lists every content word for review", () => {
  const result = scoreDictation("Please keep your ticket with you.", "");
  assertEquals(result.accuracy, 0);
  assertEquals(result.missed_words, 6);
  assertEquals(result.review_words, ["Please", "keep", "ticket"]);
});

Deno.test("partly typed contraction counts as a slip on that word", () => {
  const result = scoreDictation("It's late.", "it late");
  assertEquals(result.tokens, [{ kind: "misspelled", text: "It's", typed: "it" }, { kind: "ok", text: "late." }]);
});

Deno.test("possessives and o'clock tolerate a missing apostrophe", () => {
  assertEquals(scoreDictation("Anna's bag is here at seven o'clock.", "annas bag is here at 7 oclock").accuracy, 1);
});

Deno.test("combined dictation accuracy is word-weighted", () => {
  const a = scoreDictation("one two three four", "1 2 3 4");
  assertEquals(a.accuracy, 1);
  const short = scoreDictation("Hello there.", "");
  const long = scoreDictation("The doors are closing now, please stand back.", "The doors are closing now, please stand back.");
  // 8 of 10 words right overall, not the 50% average of the two sentences.
  assertEquals(combineDictation([short, long]), 0.8);
  assertEquals(combineDictation([]), null);
});

const rawQuestions = [
  { id: "q1", type: "mcq", prompt: "Which platform?", options: ["Two", "Four", "Six"], answer_index: 1, explanation: "\"platform four\"" },
  { id: "q2", type: "mcq", prompt: "When?", options: ["Now", "Later"], answer_index: 0, explanation: "" },
  { id: "bad", prompt: "No options", options: ["Only one"], answer_index: 0 },
  { id: "bad2", prompt: "Out of range", options: ["A", "B"], answer_index: 5 },
  { id: "q1", prompt: "Duplicate id", options: ["A", "B"], answer_index: 0 },
];

Deno.test("malformed questions are dropped and keys are stripped for the browser", () => {
  const questions = parseQuestions(rawQuestions);
  assertEquals(questions.map((question) => question.id), ["q1", "q2"]);
  const shown = publicQuestions(questions);
  assertEquals(shown[0], { id: "q1", type: "mcq", prompt: "Which platform?", options: ["Two", "Four", "Six"] });
  assert(!JSON.stringify(shown).includes("answer_index"));
  assert(!JSON.stringify(shown).includes("explanation"));
  assertEquals(parseQuestions(null), []);
});

Deno.test("questions are graded; missing or invalid answers are wrong", () => {
  const questions = parseQuestions(rawQuestions);
  const graded = gradeQuestions(questions, [{ question_id: "q1", option_index: 1 }, { question_id: "q2", option_index: 9 }]);
  assertEquals(graded.correct, 1);
  assertEquals(graded.total, 2);
  assertEquals(graded.results[1]!.chosen_index, null);
  assertEquals(graded.results[1]!.correct, false);
  assertEquals(gradeQuestions(questions, []).correct, 0);
});

Deno.test("activity correctness blends questions and dictation 60/40", () => {
  assertEquals(listeningCorrectness({ questionCorrect: 3, questionTotal: 4, dictationAccuracy: 0.5 }), 0.65);
  assertEquals(listeningCorrectness({ questionCorrect: 0, questionTotal: 0, dictationAccuracy: 0.8 }), 0.8);
  assertEquals(listeningCorrectness({ questionCorrect: 2, questionTotal: 4, dictationAccuracy: null }), 0.5);
  assertEquals(listeningCorrectness({ questionCorrect: 0, questionTotal: 0, dictationAccuracy: null }), 0);
});
