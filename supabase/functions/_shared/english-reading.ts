// Comprehension questions for reading articles.
//
// Articles store their questions in `reading_articles.questions`:
//   { id, type: "mcq", prompt, options[], answer_index, explanation, skill? }
// The answer key (answer_index, explanation) never leaves the server before
// the learner submits. Scoring is plain accuracy: correct answers / questions.
// Unanswered questions count as wrong.

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

export type ReadingQuestion = {
  id: string;
  type: "mcq";
  prompt: string;
  options: string[];
  answer_index: number;
  explanation: string;
  skill: ReadingSubskill;
};

/** A question as the learner sees it before submitting. */
export type PublicReadingQuestion = Omit<ReadingQuestion, "answer_index" | "explanation">;

export type ReadingAnswerResult = {
  question_id: string;
  correct: boolean;
  /** The option the learner picked, or null if they skipped the question. */
  chosen_index: number | null;
  answer_index: number;
  explanation: string;
  skill: ReadingSubskill;
};

export type ReadingScore = {
  correct: number;
  total: number;
  /** 0..1 accuracy. */
  ratio: number;
  /** 0..100, rounded. */
  score: number;
  results: ReadingAnswerResult[];
};

const text = (value: unknown, maxLen: number): string => String(value ?? "").trim().slice(0, maxLen);

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
export const questionSkill = (value: unknown): ReadingSubskill => {
  const raw = text(value, 60).toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "reading.detail";
  if ((READING_SUBSKILLS as readonly string[]).includes(raw)) return raw as ReadingSubskill;
  const bare = raw.startsWith("reading.") ? raw.slice("reading.".length) : raw;
  return SKILL_ALIASES[bare] ?? "reading.detail";
};

/**
 * Keeps only well-formed multiple-choice questions: a non-empty id and prompt,
 * 2–6 non-empty options, and an answer index that points at one of them.
 * Duplicate ids keep the first question.
 */
export const normalizeQuestions = (raw: unknown): ReadingQuestion[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ReadingQuestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const id = text(rec.id, 80);
    const prompt = text(rec.prompt, 600);
    const type = text(rec.type ?? "mcq", 20).toLowerCase();
    if (!id || !prompt || type !== "mcq" || seen.has(id)) continue;
    if (!Array.isArray(rec.options)) continue;
    const options = rec.options.map((option) => text(option, 400));
    if (options.length < 2 || options.length > 6 || options.some((option) => !option)) continue;
    const answerIndex = typeof rec.answer_index === "number" ? rec.answer_index : Number.NaN;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) continue;
    seen.add(id);
    out.push({
      id,
      type: "mcq",
      prompt,
      options,
      answer_index: answerIndex,
      explanation: text(rec.explanation, 900),
      skill: questionSkill(rec.skill),
    });
  }
  return out;
};

/** Questions without the answer key, safe to send before the learner submits. */
export const publicQuestions = (questions: ReadingQuestion[]): PublicReadingQuestion[] =>
  questions.map(({ id, type, prompt, options, skill }) => ({ id, type, prompt, options: [...options], skill }));

/** First valid answer per question id. Anything malformed is treated as unanswered. */
export const parseAnswers = (raw: unknown): Map<string, number> => {
  const out = new Map<string, number>();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const id = text(rec.question_id, 80);
    const index = typeof rec.option_index === "number" ? rec.option_index : Number.NaN;
    if (!id || out.has(id) || !Number.isInteger(index) || index < 0) continue;
    out.set(id, index);
  }
  return out;
};

export const scoreReadingAnswers = (questions: ReadingQuestion[], rawAnswers: unknown): ReadingScore => {
  const answers = parseAnswers(rawAnswers);
  const results = questions.map((question): ReadingAnswerResult => {
    const picked = answers.get(question.id);
    const chosen = picked !== undefined && picked < question.options.length ? picked : null;
    return {
      question_id: question.id,
      correct: chosen === question.answer_index,
      chosen_index: chosen,
      answer_index: question.answer_index,
      explanation: question.explanation,
      skill: question.skill,
    };
  });
  const total = results.length;
  const correct = results.filter((result) => result.correct).length;
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
      return {
        category: "reading",
        subskill_key: result.skill,
        location_ref: `${slug}#${result.question_id}`,
        explanation: (result.explanation || question?.prompt || "Comprehension question missed.").slice(0, 400),
        correction_hint: SKILL_HINTS[result.skill],
        severity: result.chosen_index === null ? 0.5 : score.ratio < 0.5 ? 0.72 : 0.48,
      };
    });
};
