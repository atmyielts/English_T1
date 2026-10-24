// Daily review quiz in Telegram: up to three multiple-choice questions a day,
// built from the learner's due review items and due saved words.
//
// Pure logic only (question building, message text, callback data), so it is
// testable. Loading, sending and recording live in hub/telegram-quiz.ts. The
// answer key never leaves the server: a button carries only a short question
// id and the option index (`enq:<id>:<index>`), well under Telegram's 64-byte
// callback_data limit.

import { parseReviewPayload } from "./english-review.ts";
import type { ReminderLocale } from "./english-reminders.ts";

export type QuizLocale = ReminderLocale;
export type QuizSource = "review_item" | "notebook_word";

export type QuizQuestion = {
  source: QuizSource;
  source_id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
};

export const QUIZ_CALLBACK_PREFIX = "enq:";
export const QUIZ_ID_LENGTH = 10;
export const MAX_QUIZ_QUESTIONS = 3;
export const MIN_QUIZ_OPTIONS = 2;
export const MAX_QUIZ_OPTIONS = 6;
/** Telegram rejects callback_data longer than 64 bytes. */
export const TELEGRAM_CALLBACK_DATA_LIMIT = 64;
const TELEGRAM_TEXT_LIMIT = 4096;
const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ID_PATTERN = new RegExp(`^[A-Za-z0-9]{${QUIZ_ID_LENGTH}}$`);
const CALLBACK_PATTERN = new RegExp(`^enq:([A-Za-z0-9]{${QUIZ_ID_LENGTH}}):([0-9])$`);

const clip = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
};

const normalize = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** A random base62 id; 62^10 values, so collisions are practically impossible. */
export const newQuizId = (randomBytes: (size: number) => Uint8Array = (size) => crypto.getRandomValues(new Uint8Array(size))): string => {
  let out = "";
  while (out.length < QUIZ_ID_LENGTH) {
    for (const byte of randomBytes(QUIZ_ID_LENGTH * 2)) {
      // 248 = 4 * 62: dropping higher bytes keeps every character equally likely.
      if (byte < 248 && out.length < QUIZ_ID_LENGTH) out += ID_ALPHABET[byte % 62];
    }
  }
  return out;
};

export const isQuizId = (value: unknown): value is string => typeof value === "string" && ID_PATTERN.test(value);

export const quizCallbackData = (id: string, optionIndex: number): string => {
  if (!isQuizId(id) || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= MAX_QUIZ_OPTIONS) {
    throw new Error("Invalid quiz callback");
  }
  return `${QUIZ_CALLBACK_PREFIX}${id}:${optionIndex}`;
};

/** Parses `enq:<id>:<index>`, or null for anything else (including other bots' buttons). */
export const parseQuizCallbackData = (data: unknown): { id: string; option: number } | null => {
  if (typeof data !== "string" || data.length > TELEGRAM_CALLBACK_DATA_LIMIT) return null;
  const match = CALLBACK_PATTERN.exec(data);
  if (!match) return null;
  const option = Number(match[2]);
  return option < MAX_QUIZ_OPTIONS ? { id: match[1]!, option } : null;
};

/** One row of letter buttons: A, B, C… */
export const quizKeyboard = (id: string, optionCount: number) => ({
  inline_keyboard: [
    Array.from({ length: Math.min(optionCount, MAX_QUIZ_OPTIONS) }, (_, index) => ({
      text: LETTERS[index]!,
      callback_data: quizCallbackData(id, index),
    })),
  ],
});

const shuffle = <T>(items: T[], random: () => number): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap]!, out[index]!];
  }
  return out;
};

/** A missed multiple-choice question from learner_review_items, or null if it is not multiple choice. */
export const reviewItemQuestion = (row: { id: string; payload: unknown }): QuizQuestion | null => {
  const payload = parseReviewPayload(row.payload);
  if (!payload || payload.type !== "choice") return null;
  const options = payload.options.map((option) => option.trim());
  if (options.length < MIN_QUIZ_OPTIONS || options.length > MAX_QUIZ_OPTIONS || options.some((option) => !option)) return null;
  if (payload.answer_index < 0 || payload.answer_index >= options.length) return null;
  return {
    source: "review_item",
    source_id: row.id,
    prompt: clip(payload.prompt, 1200),
    options: options.map((option) => clip(option, 200)),
    correct_index: payload.answer_index,
    explanation: payload.explanation ? clip(payload.explanation, 400) : null,
  };
};

export type QuizWord = { id: string; word: string; definition: string | null; example?: string | null };

/**
 * "What does <word> mean?" with the right definition and two or three wrong
 * ones from the learner's other words or deck words. Null when the word has no
 * definition or there are not enough different definitions to choose from.
 */
export const wordQuestion = (
  word: QuizWord,
  locale: QuizLocale,
  definitionPool: string[],
  random: () => number = Math.random,
): QuizQuestion | null => {
  const definition = word.definition?.trim() ?? "";
  const target = word.word.trim();
  if (!definition || !target) return null;
  const seen = new Set([normalize(definition)]);
  const targetKey = normalize(target);
  const distractors: string[] = [];
  for (const candidate of shuffle(definitionPool, random)) {
    const text = candidate?.trim() ?? "";
    const key = normalize(text);
    // A definition that names the word itself would give the answer away.
    if (!key || seen.has(key) || (targetKey && ` ${key} `.includes(` ${targetKey} `))) continue;
    seen.add(key);
    distractors.push(text);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 2) return null;
  const options = shuffle([definition, ...distractors], random);
  const example = word.example?.trim();
  return {
    source: "notebook_word",
    source_id: word.id,
    prompt: WORDING[locale].wordPrompt(clip(target, 80)),
    options: options.map((option) => clip(option, 200)),
    correct_index: options.indexOf(definition),
    explanation: example ? WORDING[locale].example(clip(example, 240)) : null,
  };
};

/** Alternates the sources (review item, word, review item) and never repeats one in a day. */
export const pickNextQuestion = (
  pools: { reviews: QuizQuestion[]; words: QuizQuestion[] },
  usedSourceIds: Iterable<string>,
  position: number,
): QuizQuestion | null => {
  const used = new Set(usedSourceIds);
  const fresh = (list: QuizQuestion[]) => list.find((question) => !used.has(question.source_id)) ?? null;
  const [first, second] = position % 2 === 1 ? [pools.reviews, pools.words] : [pools.words, pools.reviews];
  return fresh(first) ?? fresh(second);
};

type Wording = {
  header: (position: number, total: number) => string;
  tap: string;
  wordPrompt: (word: string) => string;
  example: (sentence: string) => string;
  correct: string;
  wrong: (answer: string) => string;
  toastWrong: string;
  already: string;
  unavailable: string;
  summary: (correct: number, total: number) => string;
};

const WORDING: Record<QuizLocale, Wording> = {
  en: {
    header: (position, total) => `📝 Daily review · ${position} of ${total}`,
    tap: "Tap the letter of your answer.",
    wordPrompt: (word) => `What does “${word}” mean?`,
    example: (sentence) => `Example: ${sentence}`,
    correct: "✅ Correct!",
    wrong: (answer) => `❌ The answer is ${answer}`,
    toastWrong: "❌ Not quite",
    already: "You've already answered this question.",
    unavailable: "This question is no longer available.",
    summary: (correct, total) => `That's all for today: ${correct} of ${total} correct.`,
  },
  ru: {
    header: (position, total) => `📝 Повторение дня · ${position} из ${total}`,
    tap: "Нажмите букву правильного ответа.",
    wordPrompt: (word) => `Что значит «${word}»?`,
    example: (sentence) => `Пример: ${sentence}`,
    correct: "✅ Верно!",
    wrong: (answer) => `❌ Правильный ответ: ${answer}`,
    toastWrong: "❌ Не совсем",
    already: "Вы уже ответили на этот вопрос.",
    unavailable: "Этот вопрос больше недоступен.",
    summary: (correct, total) => `На сегодня всё: правильно ${correct} из ${total}.`,
  },
  uz: {
    header: (position, total) => `📝 Kunlik takrorlash · ${total} tadan ${position}`,
    tap: "Toʻgʻri javob harfini bosing.",
    wordPrompt: (word) => `“${word}” nimani anglatadi?`,
    example: (sentence) => `Misol: ${sentence}`,
    correct: "✅ Toʻgʻri!",
    wrong: (answer) => `❌ Toʻgʻri javob: ${answer}`,
    toastWrong: "❌ Notoʻgʻri",
    already: "Bu savolga allaqachon javob bergansiz.",
    unavailable: "Bu savol endi mavjud emas.",
    summary: (correct, total) => `Bugun shu yetarli: ${total} tadan ${correct} tasi toʻgʻri.`,
  },
};

export const isQuizLocale = (value: unknown): value is QuizLocale => value === "en" || value === "ru" || value === "uz";
const wording = (locale: unknown): Wording => WORDING[isQuizLocale(locale) ? locale : "en"];

const fit = (text: string): string => text.length <= TELEGRAM_TEXT_LIMIT ? text : `${text.slice(0, TELEGRAM_TEXT_LIMIT - 1)}…`;

const questionBody = (locale: QuizLocale, question: Pick<QuizQuestion, "prompt" | "options">, position: number, total: number): string[] => [
  wording(locale).header(position, Math.max(position, total)),
  "",
  question.prompt,
  "",
  ...question.options.map((option, index) => `${LETTERS[index]}) ${option}`),
];

/** Plain text (parse_mode null) for the question message. */
export const questionText = (locale: QuizLocale, question: Pick<QuizQuestion, "prompt" | "options">, position: number, total: number): string =>
  fit([...questionBody(locale, question, position, total), "", wording(locale).tap].join("\n"));

export type QuizVerdict = { correct: boolean; toast: string; text: string };

/**
 * The edited message after an answer: the question, then ✅ or ❌ with the
 * right option and a short explanation, plus the day's score after the last one.
 */
export const answeredText = (
  locale: QuizLocale,
  question: Pick<QuizQuestion, "prompt" | "options" | "correct_index" | "explanation">,
  position: number,
  total: number,
  chosenIndex: number,
  summary?: { correct: number; total: number } | null,
): QuizVerdict => {
  const words = wording(locale);
  const correct = chosenIndex === question.correct_index;
  const answer = `${LETTERS[question.correct_index] ?? "?"}) ${question.options[question.correct_index] ?? ""}`;
  const lines = [
    ...questionBody(locale, question, position, total),
    "",
    correct ? words.correct : words.wrong(answer),
    question.explanation ?? null,
    summary ? "" : null,
    summary ? words.summary(summary.correct, summary.total) : null,
  ].filter((line): line is string => line !== null);
  return { correct, toast: correct ? words.correct : words.toastWrong, text: fit(lines.join("\n")) };
};

export const alreadyAnsweredToast = (locale: unknown): string => wording(locale).already;
export const unavailableToast = (locale: unknown): string => wording(locale).unavailable;
