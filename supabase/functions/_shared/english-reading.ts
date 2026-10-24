// Comprehension questions for reading articles.
//
// Articles store their questions in `reading_articles.questions`. Four types:
//   mcq       { id, type: "mcq", prompt, options[], answer_index, explanation, skill? }
//   tfng      { id, type: "tfng", prompt (a statement), answer: "true"|"false"|"not_given",
//               variant?: "yes_no" (opinions: yes/no/not given), explanation, skill? }
//   headings  { id, type: "headings", prompt, options[] (the headings),
//               items: [{ id?, paragraph (1-based), answer_index }], explanation, skill? }
//   gap       { id, type: "gap", prompt, text (a summary with ___ for each gap),
//               answers: [[accepted, ...], ...] (one list per gap), word_bank?: [], explanation, skill? }
// A question without `type` is mcq, so every article written before the other
// types existed reads exactly as before.
//
// The answer key (answer_index, answer, items[].answer_index, answers,
// explanation) never leaves the server before the learner submits. Every
// public question carries `options` (True/False/Not given for tfng, the
// headings for headings, the word bank or [] for gap) so an older app that
// only knows multiple choice can still show it.
//
// Scoring is points: one per mcq / tfng question, one per heading item, one
// per gap. Unanswered parts count as wrong.

export type ReadingSubskill =
  | "reading.detail"
  | "reading.main_idea"
  | "reading.inference"
  | "reading.vocabulary";

export const READING_SUBSKILLS: readonly ReadingSubskill[] = [
  "reading.detail",
  "reading.main_idea",
  "reading.inference",
  "reading.vocabulary",
];

export const READING_QUESTION_TYPES = ["mcq", "tfng", "headings", "gap"] as const;
export type ReadingQuestionType = (typeof READING_QUESTION_TYPES)[number];

export type TfngValue = "true" | "false" | "not_given";
export const TFNG_VALUES: readonly TfngValue[] = ["true", "false", "not_given"];
const TFNG_LABELS: Record<"tfng" | "yes_no", [string, string, string]> = {
  tfng: ["True", "False", "Not given"],
  yes_no: ["Yes", "No", "Not given"],
};

type Base = { id: string; prompt: string; explanation: string; skill: ReadingSubskill };

export type McqQuestion = Base & { type: "mcq"; options: string[]; answer_index: number };
export type TfngQuestion = Base & { type: "tfng"; variant: "tfng" | "yes_no"; answer: TfngValue };
export type HeadingsQuestion = Base & {
  type: "headings";
  options: string[];
  items: Array<{ id: string; paragraph: number; answer_index: number }>;
};
export type GapQuestion = Base & { type: "gap"; text: string; answers: string[][]; word_bank: string[] };

export type ReadingQuestion = McqQuestion | TfngQuestion | HeadingsQuestion | GapQuestion;

/** A question as the learner sees it before submitting. */
export type PublicReadingQuestion =
  | { id: string; type: "mcq"; prompt: string; options: string[]; skill: ReadingSubskill }
  | { id: string; type: "tfng"; variant: "tfng" | "yes_no"; prompt: string; options: string[]; skill: ReadingSubskill }
  | {
    id: string;
    type: "headings";
    prompt: string;
    options: string[];
    items: Array<{ id: string; paragraph: number }>;
    skill: ReadingSubskill;
  }
  | { id: string; type: "gap"; prompt: string; text: string; gaps: number; word_bank: string[]; options: string[]; skill: ReadingSubskill };

export type ReadingPartResult = {
  id: string;
  correct: boolean;
  /** What the learner gave (option text, value or typed words); "" when skipped. */
  given: string;
  /** The right answer to show. */
  expected: string;
};

export type ReadingAnswerResult = {
  question_id: string;
  type: ReadingQuestionType;
  /** Every part right. */
  correct: boolean;
  /** mcq / tfng: the option the learner picked, or null if skipped (tfng: index in True/False/Not given). */
  chosen_index: number | null;
  /** mcq / tfng: the right option (-1 for multi-part questions). */
  answer_index: number;
  explanation: string;
  skill: ReadingSubskill;
  points: number;
  earned: number;
  /** headings items / gaps, in order (empty for mcq and tfng). */
  parts: ReadingPartResult[];
};

export type ReadingScore = {
  /** Points earned. */
  correct: number;
  /** Points possible. */
  total: number;
  /** 0..1 accuracy. */
  ratio: number;
  /** 0..100, rounded. */
  score: number;
  results: ReadingAnswerResult[];
};

const text = (value: unknown, maxLen: number): string => String(value ?? "").trim().slice(0, maxLen);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const SKILL_ALIASES: Record<string, ReadingSubskill> = {
  detail: "reading.detail",
  details: "reading.detail",
  main_idea: "reading.main_idea",
  "main-idea": "reading.main_idea",
  mainidea: "reading.main_idea",
  gist: "reading.main_idea",
  inference: "reading.inference",
  infer: "reading.inference",
  vocabulary: "reading.vocabulary",
  vocab: "reading.vocabulary",
  vocabulary_in_context: "reading.vocabulary",
};

/** Maps an authored `skill` value ("inference", "reading.inference", …) to a known subskill. Defaults to detail. */
export const questionSkill = (value: unknown, fallback: ReadingSubskill = "reading.detail"): ReadingSubskill => {
  const raw = text(value, 60).toLowerCase().replace(/\s+/g, "_");
  if (!raw) return fallback;
  if ((READING_SUBSKILLS as readonly string[]).includes(raw)) return raw as ReadingSubskill;
  const bare = raw.startsWith("reading.") ? raw.slice("reading.".length) : raw;
  return SKILL_ALIASES[bare] ?? fallback;
};

const GAP = /_{3,}/g;

/** Number of gaps (runs of three or more underscores) in a summary text. */
export const countGaps = (summary: string): number => (summary.match(GAP) ?? []).length;

const options = (raw: unknown, min: number, max: number, maxLen = 400): string[] | null => {
  if (!Array.isArray(raw)) return null;
  const list = raw.map((option) => text(option, maxLen));
  if (list.length < min || list.length > max || list.some((option) => !option)) return null;
  return list;
};

const parseOne = (rec: Record<string, unknown>, id: string, prompt: string): ReadingQuestion | null => {
  const type = text(rec.type ?? "mcq", 20).toLowerCase();
  const explanation = text(rec.explanation, 900);
  if (type === "mcq") {
    const list = options(rec.options, 2, 6);
    const answerIndex = typeof rec.answer_index === "number" ? rec.answer_index : Number.NaN;
    if (!list || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= list.length) return null;
    return { id, type: "mcq", prompt, options: list, answer_index: answerIndex, explanation, skill: questionSkill(rec.skill) };
  }
  if (type === "tfng") {
    const raw = text(rec.answer, 20).toLowerCase().replace(/[\s-]+/g, "_");
    const answer = raw === "yes" ? "true" : raw === "no" ? "false" : raw;
    if (!(TFNG_VALUES as readonly string[]).includes(answer)) return null;
    const variant = text(rec.variant, 20).toLowerCase() === "yes_no" ? "yes_no" : "tfng";
    return { id, type: "tfng", variant, prompt, answer: answer as TfngValue, explanation, skill: questionSkill(rec.skill) };
  }
  if (type === "headings") {
    const list = options(rec.options, 2, 12, 200);
    if (!list || !Array.isArray(rec.items) || rec.items.length < 1 || rec.items.length > 10) return null;
    const seen = new Set<string>();
    const items: HeadingsQuestion["items"] = [];
    for (const [index, entry] of rec.items.entries()) {
      if (!isRecord(entry)) return null;
      const paragraph = typeof entry.paragraph === "number" ? entry.paragraph : Number.NaN;
      const answerIndex = typeof entry.answer_index === "number" ? entry.answer_index : Number.NaN;
      if (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > 60) return null;
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= list.length) return null;
      const itemId = text(entry.id, 40) || `p${paragraph}`;
      if (seen.has(itemId)) return null;
      seen.add(itemId);
      items.push({ id: itemId || `i${index + 1}`, paragraph, answer_index: answerIndex });
    }
    // More headings than paragraphs is normal (distractors); fewer would force a repeat.
    if (list.length < items.length) return null;
    return { id, type: "headings", prompt, options: list, items, explanation, skill: questionSkill(rec.skill, "reading.main_idea") };
  }
  if (type === "gap") {
    const summary = text(rec.text, 2000);
    const gaps = countGaps(summary);
    if (!summary || gaps < 1 || gaps > 10 || !Array.isArray(rec.answers) || rec.answers.length !== gaps) return null;
    const answers: string[][] = [];
    for (const accepted of rec.answers) {
      const list = (Array.isArray(accepted) ? accepted : [accepted]).map((entry) => text(entry, 80)).filter(Boolean);
      if (!list.length) return null;
      answers.push(list);
    }
    const bank = Array.isArray(rec.word_bank) ? rec.word_bank.map((entry) => text(entry, 80)).filter(Boolean).slice(0, 16) : [];
    // With a word bank every answer must be choosable from it.
    if (bank.length && !answers.every((list) => list.some((answer) => bank.some((word) => normalizeGap(word) === normalizeGap(answer))))) return null;
    return { id, type: "gap", prompt, text: summary, answers, word_bank: bank, explanation, skill: questionSkill(rec.skill) };
  }
  return null;
};

/**
 * Keeps only well-formed questions of a known type. Duplicate ids keep the
 * first question. Questions without `type` are multiple choice.
 */
export const normalizeQuestions = (raw: unknown): ReadingQuestion[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ReadingQuestion[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = text(entry.id, 80);
    const prompt = text(entry.prompt, 600);
    if (!id || !prompt || seen.has(id)) continue;
    const question = parseOne(entry, id, prompt);
    if (!question) continue;
    seen.add(id);
    out.push(question);
  }
  return out;
};

/** Questions without the answer key, safe to send before the learner submits. */
export const publicQuestions = (questions: ReadingQuestion[]): PublicReadingQuestion[] =>
  questions.map((question): PublicReadingQuestion => {
    const { id, prompt, skill } = question;
    switch (question.type) {
      case "mcq":
        return { id, type: "mcq", prompt, options: [...question.options], skill };
      case "tfng":
        return { id, type: "tfng", variant: question.variant, prompt, options: [...TFNG_LABELS[question.variant]], skill };
      case "headings":
        return {
          id,
          type: "headings",
          prompt,
          options: [...question.options],
          items: question.items.map((item) => ({ id: item.id, paragraph: item.paragraph })),
          skill,
        };
      case "gap":
        return {
          id,
          type: "gap",
          prompt,
          text: question.text,
          gaps: question.answers.length,
          word_bank: [...question.word_bank],
          options: [...question.word_bank],
          skill,
        };
    }
  });

/** How many points a question is worth. */
export const questionPoints = (question: ReadingQuestion): number =>
  question.type === "headings" ? question.items.length : question.type === "gap" ? question.answers.length : 1;

export type ReadingAnswer = {
  option_index?: number;
  value?: string;
  values?: Array<number | null>;
  texts?: string[];
};

/** First valid multiple-choice answer per question id (option_index only). Kept for callers that only grade mcq. */
export const parseAnswers = (raw: unknown): Map<string, number> => {
  const out = new Map<string, number>();
  for (const [id, answer] of parseRichAnswers(raw)) {
    if (answer.option_index !== undefined) out.set(id, answer.option_index);
  }
  return out;
};

/** First answer per question id, in whichever shape it came. Anything malformed is unanswered. */
export const parseRichAnswers = (raw: unknown): Map<string, ReadingAnswer> => {
  const out = new Map<string, ReadingAnswer>();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw.slice(0, 100)) {
    if (!isRecord(entry)) continue;
    const id = text(entry.question_id, 80);
    if (!id || out.has(id)) continue;
    const answer: ReadingAnswer = {};
    if (typeof entry.option_index === "number" && Number.isInteger(entry.option_index) && entry.option_index >= 0) {
      answer.option_index = entry.option_index;
    }
    if (typeof entry.value === "string") answer.value = text(entry.value, 20).toLowerCase().replace(/[\s-]+/g, "_");
    if (Array.isArray(entry.values)) {
      answer.values = entry.values.slice(0, 20).map((value) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null));
    }
    if (Array.isArray(entry.texts)) answer.texts = entry.texts.slice(0, 20).map((value) => text(value, 80));
    if (Object.keys(answer).length) out.set(id, answer);
  }
  return out;
};

/** Gap answers compare without case, punctuation, articles at the start or doubled spaces. */
export const normalizeGap = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^a-z0-9'%\s-]+/g, " ")
    .replace(/[-\s]+/g, " ")
    .trim()
    .replace(/^(?:a|an|the) /, "");

const scoreOne = (question: ReadingQuestion, answer: ReadingAnswer | undefined): ReadingAnswerResult => {
  const base = { question_id: question.id, type: question.type, explanation: question.explanation, skill: question.skill };
  if (question.type === "mcq") {
    const picked = answer?.option_index;
    const chosen = picked !== undefined && picked < question.options.length ? picked : null;
    const correct = chosen === question.answer_index;
    return { ...base, correct, chosen_index: chosen, answer_index: question.answer_index, points: 1, earned: correct ? 1 : 0, parts: [] };
  }
  if (question.type === "tfng") {
    // An older app answers with the option index (0 True, 1 False, 2 Not given).
    const raw = answer?.value ?? (answer?.option_index !== undefined ? TFNG_VALUES[answer.option_index] : undefined);
    const value = raw === "yes" ? "true" : raw === "no" ? "false" : raw;
    const chosen = value && (TFNG_VALUES as readonly string[]).includes(value) ? TFNG_VALUES.indexOf(value as TfngValue) : null;
    const answerIndex = TFNG_VALUES.indexOf(question.answer);
    const correct = chosen === answerIndex;
    return { ...base, correct, chosen_index: chosen, answer_index: answerIndex, points: 1, earned: correct ? 1 : 0, parts: [] };
  }
  if (question.type === "headings") {
    const values = answer?.values ?? [];
    const parts = question.items.map((item, index): ReadingPartResult => {
      const picked = values[index];
      const valid = picked !== undefined && picked !== null && picked < question.options.length ? picked : null;
      return {
        id: item.id,
        correct: valid === item.answer_index,
        given: valid === null ? "" : question.options[valid] ?? "",
        expected: question.options[item.answer_index] ?? "",
      };
    });
    const earned = parts.filter((part) => part.correct).length;
    return { ...base, correct: earned === parts.length, chosen_index: null, answer_index: -1, points: parts.length, earned, parts };
  }
  const texts = answer?.texts ?? [];
  const parts = question.answers.map((accepted, index): ReadingPartResult => {
    const given = texts[index] ?? "";
    const normal = normalizeGap(given);
    return {
      id: `g${index + 1}`,
      correct: Boolean(normal) && accepted.some((option) => normalizeGap(option) === normal),
      given,
      expected: accepted[0] ?? "",
    };
  });
  const earned = parts.filter((part) => part.correct).length;
  return { ...base, correct: earned === parts.length, chosen_index: null, answer_index: -1, points: parts.length, earned, parts };
};

export const scoreReadingAnswers = (questions: ReadingQuestion[], rawAnswers: unknown): ReadingScore => {
  const answers = parseRichAnswers(rawAnswers);
  const results = questions.map((question) => scoreOne(question, answers.get(question.id)));
  const total = results.reduce((sum, result) => sum + result.points, 0);
  const correct = results.reduce((sum, result) => sum + result.earned, 0);
  const ratio = total ? correct / total : 0;
  return { correct, total, ratio, score: Math.round(ratio * 100), results };
};

const SKILL_HINTS: Record<ReadingSubskill, string> = {
  "reading.detail": "Find the key words from the question in the text, then read that sentence slowly.",
  "reading.main_idea": "Read the first and last sentence of each paragraph to see what the whole text is about.",
  "reading.inference": "Look for what the writer suggests but does not say directly, and check the text supports it.",
  "reading.vocabulary": "Use the words around the new word to guess its meaning, then test your guess in the sentence.",
};

export const readingSkillHint = (skill: ReadingSubskill): string => SKILL_HINTS[skill];

/** One issue per wrong or skipped answer, for the shared learning record. */
export const buildReadingIssues = (
  questions: ReadingQuestion[],
  score: ReadingScore,
  slug: string,
): Array<Record<string, unknown>> => {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return score.results
    .filter((result) => !result.correct)
    .map((result) => {
      const question = byId.get(result.question_id);
      const skipped = result.parts.length ? result.parts.every((part) => !part.given) : result.chosen_index === null;
      return {
        category: "reading",
        subskill_key: result.skill,
        location_ref: `${slug}#${result.question_id}`,
        explanation: (result.explanation || question?.prompt || "Comprehension question missed.").slice(0, 400),
        correction_hint: SKILL_HINTS[result.skill],
        severity: skipped ? 0.5 : score.ratio < 0.5 ? 0.72 : 0.48,
      };
    });
};

export type ReadingReviewItem = {
  item_key: string;
  payload: { type: "choice"; prompt: string; options: string[]; answer_index: number; explanation: string };
};

/**
 * Wrong answers that can come back on the Review page as a choice question:
 * mcq and tfng as they are, and each wrong heading as "Which heading fits
 * paragraph N?". Gap answers are typed and stay with the text.
 */
export const reviewItemsFor = (questions: ReadingQuestion[], score: ReadingScore, slug: string): ReadingReviewItem[] => {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return score.results.filter((result) => !result.correct).flatMap((result): ReadingReviewItem[] => {
    const question = byId.get(result.question_id);
    if (!question) return [];
    if (question.type === "mcq") {
      return [{ item_key: `reading:${slug}:${question.id}`, payload: { type: "choice", prompt: question.prompt, options: question.options, answer_index: question.answer_index, explanation: question.explanation } }];
    }
    if (question.type === "tfng") {
      return [{
        item_key: `reading:${slug}:${question.id}`,
        payload: {
          type: "choice",
          prompt: question.prompt,
          options: [...TFNG_LABELS[question.variant]],
          answer_index: TFNG_VALUES.indexOf(question.answer),
          explanation: question.explanation,
        },
      }];
    }
    if (question.type === "headings") {
      return question.items.flatMap((item, index) => (result.parts[index]?.correct ? [] : [{
        item_key: `reading:${slug}:${question.id}:${item.id}`,
        payload: {
          type: "choice" as const,
          prompt: `Which heading fits paragraph ${item.paragraph}?`,
          options: question.options,
          answer_index: item.answer_index,
          explanation: question.explanation,
        },
      }]));
    }
    return [];
  });
};
