// AI mock generator: turn whatever the model returned into gradable questions,
// and grade learner answers on the server. Models are inconsistent about how
// they report the key ("B", "(b)", "Option 2", 1, the option text, "NG"), so
// every question is normalised to one canonical form before it is stored:
//   choice questions -> correct_index (0-based into options)
//   gap fill         -> accepted (list of acceptable answers)
// Questions whose key cannot be resolved are dropped rather than shown, so a
// learner is never marked wrong by an ambiguous key.

type JsonRecord = Record<string, unknown>;

const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toText = (value: unknown, maxLen = 600): string => String(value ?? "").trim().slice(0, maxLen);

export type MockQuestionType = "multiple_choice" | "true_false_not_given" | "yes_no_not_given" | "matching_headings" | "gap_fill";

export type NormalizedMockQuestion = {
  prompt: string;
  type: MockQuestionType;
  options: string[];
  /** 0-based index into options for choice questions, null for gap fill */
  correct_index: number | null;
  /** accepted answers for gap fill (raw text; compared with normalizeAnswerText) */
  accepted: string[];
  explanation: string;
};

/** Lower-case, unify quotes, drop punctuation and leading articles' spacing noise. */
export const normalizeAnswerText = (raw: unknown): string =>
  String(raw ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripArticles = (text: string): string => text.replace(/^(a|an|the) /, "");

const TFNG = ["True", "False", "Not Given"];
const YNNG = ["Yes", "No", "Not Given"];

/** Canonical TRUE/FALSE/NOT GIVEN (or YES/NO) token, or "" when not one. */
export const judgementToken = (raw: unknown): string => {
  const v = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (v === "t" || v === "true") return "true";
  if (v === "f" || v === "false") return "false";
  if (v === "y" || v === "yes") return "yes";
  if (v === "n" || v === "no") return "no";
  if (v === "ng" || v === "notgiven" || v === "notstated") return "not given";
  return "";
};

const normalizeType = (raw: unknown): MockQuestionType => {
  const v = String(raw ?? "").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (v.includes("true_false") || v === "tfng") return "true_false_not_given";
  if (v.includes("yes_no") || v === "ynng") return "yes_no_not_given";
  if (v.includes("heading")) return "matching_headings";
  if (v.includes("gap") || v.includes("completion") || v.includes("fill") || v.includes("short_answer")) return "gap_fill";
  return "multiple_choice";
};

/** Strip a leading "A)", "B.", "(c)" label the model sometimes bakes into option text. */
const optionBody = (option: string): string => option.replace(/^\(?[a-hA-H]\)?[.):]\s+/, "").replace(/^[ivx]+[.)]\s+/i, "").trim();

/**
 * Resolve a model-reported key to a 0-based option index.
 * Order: exact option text, option text without a letter label, judgement
 * token (True/NG...), letter (A/b/(c)/Option D), number. A JSON number is read
 * as a 0-based index (n === options.length is read as 1-based); a numeric
 * string is read as a 1-based option number (or 0-based when it is "0").
 */
export const resolveChoiceIndex = (answer: unknown, options: string[]): number | null => {
  if (options.length === 0 || answer == null || answer === "") return null;
  const normalizedOptions = options.map((option) => normalizeAnswerText(option));
  const bodies = options.map((option) => normalizeAnswerText(optionBody(option)));

  if (typeof answer === "number" && Number.isInteger(answer)) {
    if (answer >= 0 && answer < options.length) return answer;
    if (answer === options.length) return answer - 1;
    return null;
  }

  const text = String(answer).trim();
  const norm = normalizeAnswerText(text);
  const textIndex = normalizedOptions.indexOf(norm);
  if (norm && textIndex >= 0) return textIndex;
  const bodyNorm = normalizeAnswerText(optionBody(text));
  const bodyIndex = bodies.indexOf(bodyNorm);
  if (bodyNorm && bodyIndex >= 0) return bodyIndex;

  const judgement = judgementToken(text);
  if (judgement) {
    const index = normalizedOptions.findIndex((option) => judgementToken(option) === judgement);
    if (index >= 0) return index;
  }

  const letter = text.match(/^(?:option|choice|answer)?\s*\(?([a-hA-H])\)?[.)]?$/i);
  if (letter) {
    const index = letter[1]!.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) return index;
  }

  const roman = text.match(/^\(?(i{1,3}|iv|v|vi{0,3}|ix|x)\)?[.)]?$/i);
  if (roman) {
    const value = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"].indexOf(roman[1]!.toLowerCase());
    // Headings lists are numbered i, ii, iii... Only trust it when options are labelled that way.
    if (value >= 0 && value < options.length && /^[ivx]+[.)]/i.test(options[value] ?? "")) return value;
  }

  const numeric = text.match(/^(?:option|choice|answer)?\s*#?\(?(\d{1,2})\)?[.)]?$/i);
  if (numeric) {
    const n = Number(numeric[1]);
    if (n >= 1 && n <= options.length) return n - 1;
    if (n === 0) return 0;
  }
  return null;
};

const acceptedAnswers = (answer: unknown): string[] => {
  const raw = Array.isArray(answer) ? answer.map((entry) => toText(entry, 120)) : [toText(answer, 200)];
  return [...new Set(
    raw.flatMap((entry) => entry.split(/\s*(?:\/|\||;|\bor\b)\s*/i))
      .map((entry) => entry.replace(/^["']|["']$/g, "").trim())
      .filter((entry) => normalizeAnswerText(entry).length > 0),
  )].slice(0, 6);
};

/** Normalise one raw model question; null when it cannot be graded fairly. */
export const normalizeMockQuestion = (raw: unknown): NormalizedMockQuestion | null => {
  if (!isObject(raw)) return null;
  const prompt = toText(raw.prompt ?? raw.question, 600);
  if (!prompt) return null;
  let type = normalizeType(raw.type);
  let options = Array.isArray(raw.options)
    ? raw.options.map((option) => toText(isObject(option) ? option.text ?? option.label ?? option.value : option, 240)).filter(Boolean).slice(0, 8)
    : [];
  const answer = raw.correct_answer ?? raw.answer ?? raw.correct ?? raw.correct_option;
  const explanation = toText(raw.explanation, 600);

  // Judgement questions often arrive without options: supply the fixed set.
  const judgement = judgementToken(typeof answer === "string" ? answer : "");
  if ((type === "true_false_not_given" || type === "yes_no_not_given") || (options.length === 0 && judgement)) {
    if (options.length === 0) {
      const yesNo = type === "yes_no_not_given" || judgement === "yes" || judgement === "no";
      options = yesNo ? [...YNNG] : [...TFNG];
      type = yesNo ? "yes_no_not_given" : "true_false_not_given";
    }
  }

  if (type === "gap_fill" || options.length === 0) {
    const accepted = acceptedAnswers(answer);
    if (accepted.length === 0) return null;
    return { prompt, type: "gap_fill", options: [], correct_index: null, accepted, explanation };
  }

  if (options.length < 2 || new Set(options.map(normalizeAnswerText)).size !== options.length) return null;
  const correctIndex = resolveChoiceIndex(answer, options);
  if (correctIndex == null) return null;
  return { prompt, type, options, correct_index: correctIndex, accepted: [], explanation };
};

export const normalizeMockQuestions = (raw: unknown, max = 6): NormalizedMockQuestion[] =>
  (Array.isArray(raw) ? raw : []).map(normalizeMockQuestion).filter((q): q is NormalizedMockQuestion => q != null).slice(0, max);

/** What the learner sees before submitting: no keys, no explanations. */
export const publicMockQuestions = (questions: NormalizedMockQuestion[]) =>
  questions.map((question) => ({ prompt: question.prompt, type: question.type, options: question.options }));

export const correctAnswerLabel = (question: NormalizedMockQuestion): string =>
  question.correct_index != null ? question.options[question.correct_index] ?? "" : question.accepted.join(" / ");

export type MockAnswer = number | string | null | undefined;

/** Grade one answer. Choice answers may be the option index or the option text. */
export const gradeMockAnswer = (question: NormalizedMockQuestion, answer: MockAnswer): boolean => {
  if (answer == null || answer === "") return false;
  if (question.correct_index != null) {
    const index = typeof answer === "number"
      ? (Number.isInteger(answer) && answer >= 0 && answer < question.options.length ? answer : null)
      : (() => {
        const norm = normalizeAnswerText(answer);
        const at = question.options.findIndex((option) => normalizeAnswerText(option) === norm);
        return at >= 0 ? at : null;
      })();
    return index === question.correct_index;
  }
  const given = stripArticles(normalizeAnswerText(answer));
  return given.length > 0 && question.accepted.some((entry) => stripArticles(normalizeAnswerText(entry)) === given);
};

export const gradeMock = (questions: NormalizedMockQuestion[], answers: unknown) => {
  const list = Array.isArray(answers) ? answers : isObject(answers) ? questions.map((_, index) => (answers as JsonRecord)[String(index)]) : [];
  const results = questions.map((question, index) => {
    const given = list[index] as MockAnswer;
    const correct = gradeMockAnswer(question, typeof given === "number" || typeof given === "string" ? given : null);
    return {
      index,
      correct,
      given: given == null ? null : typeof given === "number" ? question.options[given] ?? String(given) : toText(given, 200),
      correct_answer: correctAnswerLabel(question),
      explanation: question.explanation,
      type: question.type,
    };
  });
  const raw = results.filter((row) => row.correct).length;
  return { results, raw_score: raw, max_score: questions.length, accuracy_ratio: questions.length > 0 ? Math.round((raw / questions.length) * 10000) / 10000 : 0 };
};

/** Map the generator's question style onto the practice question_type keys used by mastery and SRS. */
export const practiceQuestionTypeFor = (type: MockQuestionType): string => {
  if (type === "true_false_not_given") return "question_true_false_not_given";
  if (type === "yes_no_not_given") return "question_yes_no_not_given";
  if (type === "matching_headings") return "question_matching_headings";
  if (type === "gap_fill") return "question_gap_fill";
  return "question_single_choice";
};
