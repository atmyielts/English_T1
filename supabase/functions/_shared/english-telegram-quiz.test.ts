import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alreadyAnsweredToast,
  answeredText,
  isQuizId,
  newQuizId,
  parseQuizCallbackData,
  pickNextQuestion,
  type QuizQuestion,
  QUIZ_ID_LENGTH,
  questionText,
  quizCallbackData,
  quizKeyboard,
  reviewItemQuestion,
  TELEGRAM_CALLBACK_DATA_LIMIT,
  unavailableToast,
  wordQuestion,
} from "./english-telegram-quiz.ts";

const seeded = (seed: number) => () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};

const choicePayload = {
  type: "choice",
  prompt: "Why did Ana move to Tashkent?",
  options: ["For work", "For study", "For family"],
  answer_index: 1,
  explanation: "She says she got a place at the university.",
  source_title: "A new city",
  source_slug: "a-new-city",
};

Deno.test("quiz ids are short base62 and callback data stays under Telegram's 64 bytes", () => {
  for (let index = 0; index < 50; index += 1) {
    const id = newQuizId();
    assertEquals(id.length, QUIZ_ID_LENGTH);
    assert(isQuizId(id));
    const data = quizCallbackData(id, 5);
    assert(new TextEncoder().encode(data).length <= TELEGRAM_CALLBACK_DATA_LIMIT);
    assertEquals(parseQuizCallbackData(data), { id, option: 5 });
  }
  // Bytes 248..255 are skipped so every character is equally likely.
  assertEquals(newQuizId(() => new Uint8Array(20).fill(255).map((value, index) => (index % 2 ? value : 0))), "AAAAAAAAAA");
});

Deno.test("only enq: buttons with a valid id and option parse", () => {
  assertEquals(parseQuizCallbackData("enq:Ab3dE6gH9k:2"), { id: "Ab3dE6gH9k", option: 2 });
  assertEquals(parseQuizCallbackData("hw:Ab3dE6gH9k:2"), null);
  assertEquals(parseQuizCallbackData("ctr:123"), null);
  assertEquals(parseQuizCallbackData("enq:Ab3dE6gH9k:7"), null);
  assertEquals(parseQuizCallbackData("enq:Ab3dE6gH9k:12"), null);
  assertEquals(parseQuizCallbackData("enq:short:1"), null);
  assertEquals(parseQuizCallbackData("enq:Ab3dE6gH9k-:1"), null);
  assertEquals(parseQuizCallbackData(`enq:${"a".repeat(80)}:1`), null);
  assertEquals(parseQuizCallbackData(null), null);
  let threw = false;
  try {
    quizCallbackData("bad id", 0);
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("the keyboard has one letter button per option", () => {
  const keyboard = quizKeyboard("Ab3dE6gH9k", 3);
  assertEquals(keyboard.inline_keyboard[0]!.map((button) => button.text), ["A", "B", "C"]);
  assertEquals(keyboard.inline_keyboard[0]![2]!.callback_data, "enq:Ab3dE6gH9k:2");
});

Deno.test("only multiple-choice review items become quiz questions", () => {
  const question = reviewItemQuestion({ id: "r1", payload: choicePayload })!;
  assertEquals(question.source, "review_item");
  assertEquals(question.correct_index, 1);
  assertEquals(question.options, ["For work", "For study", "For family"]);
  assertEquals(reviewItemQuestion({ id: "r2", payload: { type: "grammar", prompt: "She ___ (go).", accepted: ["goes"] } }), null);
  assertEquals(reviewItemQuestion({ id: "r3", payload: { type: "dictation", sentence: "Hello there." } }), null);
  assertEquals(reviewItemQuestion({ id: "r4", payload: { ...choicePayload, options: ["Only one"], answer_index: 0 } }), null);
  assertEquals(reviewItemQuestion({ id: "r5", payload: { ...choicePayload, answer_index: 5 } }), null);
  assertEquals(reviewItemQuestion({ id: "r6", payload: { ...choicePayload, options: ["a", "b", "c", "d", "e", "f", "g"] } }), null);
});

Deno.test("a word question has the right definition and distinct wrong ones", () => {
  const pool = ["to make something better", "very tired", "Very tired.", "a large town", "to improve the quality of a thing", "happy"];
  const word = { id: "w1", word: "improve", definition: "to make something better", example: "Practice will improve your English." };
  for (let seed = 1; seed < 30; seed += 1) {
    const question = wordQuestion(word, "en", pool, seeded(seed))!;
    assertEquals(question.prompt, "What does “improve” mean?");
    assertEquals(question.options[question.correct_index], "to make something better");
    assertEquals(question.options.length, 4);
    assertEquals(new Set(question.options.map((option) => option.toLowerCase().replace(/\W/g, ""))).size, 4);
    // A definition naming the word itself would give the answer away.
    assert(!question.options.some((option) => option.includes("improve the quality")));
    assertEquals(question.explanation, "Example: Practice will improve your English.");
  }
  assertEquals(wordQuestion({ ...word, definition: null }, "en", pool), null);
  assertEquals(wordQuestion(word, "en", ["to make something better", "happy"]), null);
  assertEquals(wordQuestion({ id: "w2", word: "tired", definition: "very tired" }, "ru", pool, seeded(3))?.prompt, "Что значит «tired»?");
});

const question = (source: QuizQuestion["source"], id: string): QuizQuestion => ({
  source, source_id: id, prompt: id, options: ["a", "b"], correct_index: 0, explanation: null,
});

Deno.test("questions alternate between review items and words without repeats", () => {
  const pools = { reviews: [question("review_item", "r1"), question("review_item", "r2")], words: [question("notebook_word", "w1")] };
  assertEquals(pickNextQuestion(pools, [], 1)?.source_id, "r1");
  assertEquals(pickNextQuestion(pools, ["r1"], 2)?.source_id, "w1");
  assertEquals(pickNextQuestion(pools, ["r1", "w1"], 3)?.source_id, "r2");
  assertEquals(pickNextQuestion({ reviews: [], words: pools.words }, [], 1)?.source_id, "w1");
  assertEquals(pickNextQuestion(pools, ["r1", "r2", "w1"], 3), null);
});

Deno.test("question and feedback text in each locale", () => {
  const q = reviewItemQuestion({ id: "r1", payload: choicePayload })!;
  const en = questionText("en", q, 1, 3);
  assertStringIncludes(en, "Daily review · 1 of 3");
  assertStringIncludes(en, "A) For work\nB) For study\nC) For family");
  assertStringIncludes(en, "Tap the letter");
  assertStringIncludes(questionText("ru", q, 2, 3), "Повторение дня · 2 из 3");
  assertStringIncludes(questionText("uz", q, 2, 3), "3 tadan 2");

  const right = answeredText("en", q, 1, 3, 1);
  assertEquals(right.correct, true);
  assertEquals(right.toast, "✅ Correct!");
  assertStringIncludes(right.text, "✅ Correct!\nShe says she got a place at the university.");
  assert(!right.text.includes("Tap the letter"));

  const wrong = answeredText("ru", q, 3, 3, 0, { correct: 2, total: 3 });
  assertEquals(wrong.correct, false);
  assertStringIncludes(wrong.text, "❌ Правильный ответ: B) For study");
  assertStringIncludes(wrong.text, "правильно 2 из 3");
  assertStringIncludes(answeredText("uz", q, 1, 1, 2).text, "Toʻgʻri javob: B) For study");

  assertEquals(alreadyAnsweredToast("ru"), "Вы уже ответили на этот вопрос.");
  assertEquals(unavailableToast("fr"), "This question is no longer available.");
});

Deno.test("long content is clipped to fit Telegram", () => {
  const long = reviewItemQuestion({ id: "r1", payload: { ...choicePayload, prompt: "word ".repeat(2000), options: ["x ".repeat(500), "y", "z"] } })!;
  assert(long.prompt.length <= 1200);
  assert(long.options[0]!.length <= 200);
  assert(questionText("en", long, 1, 3).length <= 4096);
  assert(answeredText("en", long, 1, 3, 0).text.length <= 4096);
});
