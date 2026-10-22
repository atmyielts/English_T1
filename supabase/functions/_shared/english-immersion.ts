// Checking for real-life tasks (immersion missions).
//
// A mission is a short situation in 3–4 steps. Each step is one of:
//   read   — a notice or message + multiple-choice questions
//   listen — a short spoken message (browser TTS) + multiple-choice questions
//   reply  — the learner writes a short message
//   speak  — the learner says a reply (speech recognition, or typed)
//
// Choice questions are checked against the key in expected_answer_json.
// Replies are judged by AI when it is available (does the reply do the job,
// is the tone right, 1–2 corrections). Without AI, a basic check looks for the
// required points using synonym lists. Words the learner copies from the task
// text never earn credit.

export type StepKind = "read" | "listen" | "reply" | "speak";

export type ChoiceQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type ReplyPoint = { label: string; any: string[] };

export type Correction = { original: string; better: string; explanation: string };

export type Tone = "good" | "could_be_better" | "inappropriate";

export type ChoiceResult = {
  id: string;
  prompt: string;
  options: string[];
  chosen: number | null;
  answer: number;
  correct: boolean;
  explanation: string;
};

export type ReplyCheck = {
  feedback_mode: "ai" | "basic";
  score: number;
  achieved: boolean;
  points: Array<{ label: string; met: boolean }>;
  tone: Tone | null;
  tone_note: string;
  corrections: Correction[];
  summary: string;
  word_count: number;
  own_word_count: number;
  min_words: number;
  too_short: boolean;
};

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const text = (value: unknown, max = 600): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const stepKind = (stepType: unknown): StepKind | null => {
  const raw = String(stepType ?? "").toLowerCase();
  if (raw === "read" || raw === "reading") return "read";
  if (raw === "listen" || raw === "listening") return "listen";
  if (raw === "reply" || raw === "writing") return "reply";
  if (raw === "speak" || raw === "speaking") return "speak";
  return null;
};

export const normalizeText = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokens = (value: string): string[] => normalizeText(value).split(" ").filter(Boolean);

export const countWords = (value: string): number => tokens(value).length;

/** Questions from expected_answer_json, only well-formed ones. */
export const parseQuestions = (expected: unknown): ChoiceQuestion[] => {
  const list = asRecord(expected).questions;
  if (!Array.isArray(list)) return [];
  const out: ChoiceQuestion[] = [];
  list.forEach((entry, index) => {
    const rec = asRecord(entry);
    const options = Array.isArray(rec.options) ? rec.options.map((option) => text(option, 300)).filter(Boolean) : [];
    const answer = typeof rec.answer === "number" ? Math.floor(rec.answer) : -1;
    const prompt = text(rec.prompt, 400);
    if (!prompt || options.length < 2 || answer < 0 || answer >= options.length) return;
    out.push({ id: text(rec.id, 40) || `q${index + 1}`, prompt, options, answer, explanation: text(rec.explanation, 500) });
  });
  return out;
};

/** Questions as sent to the learner before submitting: no key, no explanation. */
export const publicQuestions = (expected: unknown): Array<{ id: string; prompt: string; options: string[] }> =>
  parseQuestions(expected).map(({ id, prompt, options }) => ({ id, prompt, options }));

export const parsePoints = (expected: unknown): ReplyPoint[] => {
  const list = asRecord(expected).points;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      const rec = asRecord(entry);
      const any = Array.isArray(rec.any) ? rec.any.map((phrase) => text(phrase, 80)).filter(Boolean) : [];
      return { label: text(rec.label, 160), any };
    })
    .filter((point) => point.label && point.any.length > 0);
};

/** Choice answers arrive as {questionId: optionIndex}. Anything else counts as unanswered. */
export const checkChoices = (questions: ChoiceQuestion[], answers: unknown): { results: ChoiceResult[]; score: number } => {
  const given = asRecord(answers);
  const results = questions.map((question) => {
    const raw = given[question.id];
    const chosen = typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < question.options.length ? raw : null;
    return {
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      chosen,
      answer: question.answer,
      correct: chosen === question.answer,
      explanation: question.explanation,
    };
  });
  const score = results.length ? results.filter((result) => result.correct).length / results.length : 0;
  return { results, score };
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A phrase like "another time" or "reschedul*" (trailing * = any word ending). */
const phraseRegex = (phrase: string): RegExp | null => {
  const wildcard = phrase.trim().endsWith("*");
  const words = tokens(phrase.replace(/\*+$/, ""));
  if (!words.length) return null;
  const body = words.map(escapeRegex).join(" ") + (wildcard ? "[a-z0-9']*" : "");
  return new RegExp(`(?:^| )${body}(?= |$)`);
};

const containsPhrase = (normalized: string, phrase: string): boolean => {
  const regex = phraseRegex(phrase);
  return regex ? regex.test(normalized) : false;
};

/**
 * Required-point detection. A synonym only counts if it is NOT already in the
 * task text: copying the prompt never earns credit. A point whose synonyms all
 * appear in the prompt cannot be checked this way and is left out.
 */
export const matchPoints = (input: { prompt: string; response: string; points: ReplyPoint[] }): Array<{ label: string; met: boolean }> => {
  const prompt = normalizeText(input.prompt);
  const response = normalizeText(input.response);
  const out: Array<{ label: string; met: boolean }> = [];
  for (const point of input.points) {
    const usable = point.any.filter((phrase) => !containsPhrase(prompt, phrase));
    if (!usable.length) continue;
    out.push({ label: point.label, met: usable.some((phrase) => containsPhrase(response, phrase)) });
  }
  return out;
};

/** Words in the response that the task text does not already contain. */
export const ownWordCount = (prompt: string, response: string): number => {
  const promptTokens = new Set(tokens(prompt));
  return tokens(response).filter((token) => !promptTokens.has(token)).length;
};

const MIN_WORDS: Record<"reply" | "speak", Record<string, number>> = {
  reply: { A1: 12, A2: 20, B1: 30, B2: 45, C1: 60, C2: 70 },
  speak: { A1: 8, A2: 12, B1: 20, B2: 28, C1: 35, C2: 40 },
};

export const minWordsFor = (kind: "reply" | "speak", level: string | null | undefined, expected?: unknown): number => {
  const override = asRecord(expected).min_words;
  if (typeof override === "number" && override >= 3 && override <= 300) return Math.floor(override);
  return MIN_WORDS[kind][String(level ?? "").toUpperCase()] ?? MIN_WORDS[kind].B1!;
};

/** Mechanical fixes we can be sure about without AI. At most two. */
export const basicCorrections = (response: string, kind: "reply" | "speak"): Correction[] => {
  const out: Correction[] = [];
  const trimmed = response.trim();
  if (!trimmed) return out;
  // Speech transcripts have no reliable capitals or punctuation: only check typed replies.
  if (kind !== "reply") return out;
  const words = trimmed.split(/\s+/);
  const isLowerI = (word: string) => /^i(?:['’](?:m|ll|ve|d))?[,.!?;:]*$/.test(word);
  const lowerIndex = words.findIndex((word, index) => index > 0 && isLowerI(word));
  if (lowerIndex > 0) {
    const slice = words.slice(Math.max(0, lowerIndex - 2), lowerIndex + 3);
    out.push({
      original: slice.join(" "),
      better: slice.map((word) => (isLowerI(word) ? `I${word.slice(1)}` : word)).join(" "),
      explanation: "Write \"I\" with a capital letter.",
    });
  }
  if (/^[a-z]/.test(trimmed)) {
    const firstWords = trimmed.split(/\s+/).slice(0, 3).join(" ");
    out.push({ original: firstWords, better: firstWords.charAt(0).toUpperCase() + firstWords.slice(1), explanation: "Start a message with a capital letter." });
  }
  // The text after the last full stop: skip sign-offs ("Best, Aziz") and very short endings.
  const tail = trimmed.split(/[.!?]/).pop()?.trim() ?? "";
  const signOff = /\b(best|regards|wishes|thanks|thank you|cheers|sincerely|see you|love|bye)\b/i.test(tail) || tail.split(/\s+/).length < 4;
  if (out.length < 2 && !/[.!?)]$/.test(trimmed) && !signOff) {
    const lastWords = trimmed.split(/\s+/).slice(-3).join(" ");
    out.push({ original: lastWords, better: `${lastWords}.`, explanation: "End your last sentence with a full stop." });
  }
  return out.slice(0, 2);
};

const tooShortFloor = (wordCount: number, minWords: number): boolean => wordCount < minWords;

/** Rule-based check used when AI is not available. */
export const basicReplyCheck = (input: {
  kind: "reply" | "speak";
  level: string | null;
  prompt: string;
  response: string;
  expected: unknown;
}): ReplyCheck => {
  const minWords = minWordsFor(input.kind, input.level, input.expected);
  const wordCount = countWords(input.response);
  const own = ownWordCount(input.prompt, input.response);
  const points = matchPoints({ prompt: input.prompt, response: input.response, points: parsePoints(input.expected) });
  const met = points.filter((point) => point.met).length;
  const coverage = points.length ? met / points.length : 0;
  let lengthRatio = clamp01(wordCount / minWords);
  const ownNeeded = Math.max(3, Math.ceil(minWords / 2));
  if (own < ownNeeded) lengthRatio *= own / ownNeeded;
  let score = own < 3 ? 0 : clamp01(coverage * 0.8 + lengthRatio * 0.2);
  // A reply far shorter than the level needs cannot score high, whatever it covers.
  if (wordCount < minWords * 0.5) score = Math.min(score, 0.6);
  return {
    feedback_mode: "basic",
    score,
    achieved: points.length > 0 && coverage >= 0.67 && own >= ownNeeded,
    points,
    tone: null,
    tone_note: "",
    corrections: basicCorrections(input.response, input.kind),
    summary: "",
    word_count: wordCount,
    own_word_count: own,
    min_words: minWords,
    too_short: tooShortFloor(wordCount, minWords),
  };
};

/** The request sent to the AI judge for one reply/speak step. */
export const buildJudgeRequest = (input: {
  kind: "reply" | "speak";
  level: string | null;
  situation: string;
  stepTitle: string;
  instructions: string;
  prompt: string;
  response: string;
  expected: unknown;
}): { systemPrompt: string; userPayload: string; temperature: number } => {
  const expected = asRecord(input.expected);
  const level = String(input.level ?? "B1").toUpperCase();
  return {
    systemPrompt: [
      "You are a friendly, honest English teacher checking a learner's response in a real-life task.",
      `The learner's level is ${level} (CEFR). Judge what a ${level} learner can reasonably do.`,
      input.kind === "speak"
        ? "The response was SPOKEN and turned into text by speech recognition: ignore capital letters, punctuation and small recognition slips."
        : "The response was WRITTEN.",
      "Decide: (1) does the response achieve the goal of the task, (2) which of the required points it covers (meaning counts, not exact words;",
      "words simply copied from the task text without being used to do the job do not count), (3) is the tone right for this situation and person.",
      "Give 0-2 corrections of real mistakes or clearly unnatural phrases. 'original' MUST be copied exactly from the learner's response.",
      "Do not correct style that is already acceptable. Use plain, short English the learner can understand.",
      "Return strict JSON only: {\"achieved\": boolean, \"points_met\": [labels copied exactly from required_points],",
      "\"tone\": \"good\"|\"could_be_better\"|\"inappropriate\", \"tone_note\": string (max 25 words),",
      "\"corrections\": [{\"original\": string, \"better\": string, \"explanation\": string (max 20 words)}], \"summary\": string (one short sentence)}.",
    ].join(" "),
    userPayload: JSON.stringify({
      situation: input.situation,
      step: input.stepTitle,
      task: input.instructions,
      task_text: input.prompt,
      goal: text(expected.goal, 400),
      required_points: parsePoints(expected).map((point) => point.label),
      learner_response: input.response.slice(0, 3000),
    }),
    temperature: 0.2,
  };
};

const TONES: Tone[] = ["good", "could_be_better", "inappropriate"];
const TONE_SCORE: Record<Tone, number> = { good: 1, could_be_better: 0.6, inappropriate: 0.2 };

const squash = (value: string): string => value.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/**
 * Validates the AI judgement and turns it into a step result. Returns null when
 * the reply is unusable, so the caller falls back to the basic check.
 */
export const applyJudgement = (input: {
  raw: unknown;
  kind: "reply" | "speak";
  level: string | null;
  prompt: string;
  response: string;
  expected: unknown;
}): ReplyCheck | null => {
  const raw = asRecord(input.raw);
  const allPoints = parsePoints(input.expected);
  const hasAchieved = typeof raw.achieved === "boolean";
  const hasPoints = Array.isArray(raw.points_met);
  if (!hasAchieved && !hasPoints) return null;

  const metLabels = new Set(
    (hasPoints ? raw.points_met as unknown[] : [])
      .map((label) => squash(text(label, 200)))
      .filter(Boolean),
  );
  const points = allPoints.map((point) => ({ label: point.label, met: metLabels.has(squash(point.label)) }));
  const met = points.filter((point) => point.met).length;
  const coverage = points.length ? met / points.length : (raw.achieved === true ? 1 : 0);
  const achieved = hasAchieved ? raw.achieved === true : coverage >= 0.67;
  const tone = TONES.includes(raw.tone as Tone) ? raw.tone as Tone : null;
  const toneScore = tone ? TONE_SCORE[tone] : 0.75;

  const responseSquashed = squash(input.response);
  const corrections: Correction[] = (Array.isArray(raw.corrections) ? raw.corrections : [])
    .map((entry) => {
      const rec = asRecord(entry);
      return { original: text(rec.original, 200), better: text(rec.better, 240), explanation: text(rec.explanation, 240) };
    })
    .filter((entry) =>
      entry.original && entry.better && squash(entry.original) !== squash(entry.better)
      && responseSquashed.includes(squash(entry.original)))
    .slice(0, 2);

  const minWords = minWordsFor(input.kind, input.level, input.expected);
  const wordCount = countWords(input.response);
  const own = ownWordCount(input.prompt, input.response);
  let score = clamp01(coverage * 0.5 + (achieved ? 0.3 : 0) + toneScore * 0.2);
  if (wordCount < minWords * 0.5) score = Math.min(score, 0.6);
  if (own < 3) score = 0;

  return {
    feedback_mode: "ai",
    score,
    achieved,
    points,
    tone,
    tone_note: text(raw.tone_note, 240),
    corrections,
    summary: text(raw.summary, 300),
    word_count: wordCount,
    own_word_count: own,
    min_words: minWords,
    too_short: tooShortFloor(wordCount, minWords),
  };
};

/** Mission accuracy: the plain mean of step scores (0..1). */
export const missionScore = (stepScores: number[]): number =>
  stepScores.length ? clamp01(stepScores.reduce((sum, value) => sum + clamp01(value), 0) / stepScores.length) : 0;
