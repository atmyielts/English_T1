// Feedback for spoken (or typed) answers to speaking prompts.
//
// What a transcript can and cannot show:
// - It shows WHAT the learner said: task coverage, vocabulary, grammar.
// - With an honest speaking time it gives a pace proxy (words per minute).
// - It cannot show pronunciation, accent, intonation or pauses. Speech
//   recognition confidence is not a pronunciation score, so nothing here
//   claims to measure pronunciation.
//
// The AI path scores task / vocabulary / grammar; pace is always computed
// here from the transcript and speaking time. Without AI a rule-based check
// covers cue points (by keyword), length, pace, variety and filler words,
// and says plainly that the feedback is basic.

export type SpeakingMode = "speech" | "typed";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const asLevel = (value: unknown): CefrLevel => {
  const upper = String(value ?? "").trim().toUpperCase();
  return (LEVELS as string[]).includes(upper) ? upper as CefrLevel : "B1";
};

export type SpeakingPromptInput = {
  title: string;
  prompt_text: string;
  level: CefrLevel;
  target_duration_seconds: number;
  target_grammar: string;
  target_vocabulary: string[];
  cue_points: string[];
  /** Optional keywords per cue point for the basic check (same order as cue_points). */
  cue_keywords?: string[][];
  /** Example answer written for this prompt (used when AI is unavailable). */
  model_answer?: string | null;
};

export type SpeakingCorrection = { said: string; better: string; explanation: string };

export type SpeakingStats = {
  words: number;
  speaking_seconds: number | null;
  wpm: number | null;
  pace: "slow" | "steady" | "fast" | null;
  pace_band: [number, number];
  filler_count: number;
  sentences: number | null;
  variety: number;
  linkers: number;
  target_words_used: string[];
};

export type SpeakingFeedback = {
  source: "ai" | "basic";
  overall: number;
  scores: { task: number; vocabulary: number; grammar: number | null; fluency: number | null };
  cue_points: Array<{ text: string; covered: boolean }>;
  strengths: string[];
  corrections: SpeakingCorrection[];
  tip: string;
  model_answer: string | null;
  /** "improved" = the learner's own answer improved by AI; "example" = a prepared example answer. */
  model_answer_kind: "improved" | "example" | null;
  stats: SpeakingStats;
};

// ---------------------------------------------------------------------------
// Text helpers

export const normalizeText = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (value: string): string[] => normalizeText(value).split(" ").filter(Boolean);

export const countWords = (value: string): number => tokenize(value).length;

const SINGLE_FILLERS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "mm", "ah"]);
const PHRASE_FILLERS = ["you know", "i mean", "kind of", "sort of"];

/** Hesitation words and stock filler phrases. "like" is not counted: it is usually a real word. */
export const countFillers = (value: string): number => {
  const tokens = tokenize(value);
  const text = ` ${tokens.join(" ")} `;
  let count = tokens.filter((token) => SINGLE_FILLERS.has(token)).length;
  for (const phrase of PHRASE_FILLERS) {
    count += text.split(` ${phrase} `).length - 1;
  }
  return count;
};

/** Sentences, counted only when the text has end punctuation (speech transcripts usually do not). */
export const countSentences = (value: string): number | null => {
  const text = String(value ?? "").trim();
  if (!/[.!?]/.test(text)) return null;
  return text.split(/[.!?]+/).map((part) => part.trim()).filter((part) => countWords(part) >= 2).length;
};

const LINKERS = [
  "because", "so", "but", "and then", "then", "after that", "first", "firstly", "second", "secondly", "finally",
  "also", "however", "although", "though", "while", "when", "if", "for example", "for instance", "on the other hand",
  "as a result", "that's why", "in my opinion", "i think", "i believe", "in addition", "moreover", "therefore",
  "whereas", "unless", "even though", "overall", "to sum up", "in short", "besides", "instead",
];

export const countLinkers = (value: string): number => {
  const text = ` ${normalizeText(value)} `;
  let count = 0;
  for (const linker of LINKERS) count += text.split(` ${linker} `).length - 1;
  return count;
};

/**
 * Lexical variety, 0..1: moving-average type/token ratio over 30-word windows,
 * so long answers are not punished just for being long. Fillers are ignored.
 */
export const lexicalVariety = (value: string): number => {
  const tokens = tokenize(value).filter((token) => !SINGLE_FILLERS.has(token));
  if (tokens.length === 0) return 0;
  const window = 30;
  if (tokens.length <= window) return new Set(tokens).size / tokens.length;
  let total = 0;
  let windows = 0;
  for (let start = 0; start + window <= tokens.length; start += 1) {
    total += new Set(tokens.slice(start, start + window)).size / window;
    windows += 1;
  }
  return total / windows;
};

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with", "about", "from", "your", "you", "yours",
  "one", "two", "three", "some", "any", "it", "its", "is", "are", "be", "do", "does", "how", "what", "why", "who",
  "when", "where", "which", "that", "this", "these", "those", "say", "tell", "give", "ask", "describe", "explain",
  "mention", "talk", "speak", "name", "state", "suggest", "offer", "end", "start", "finish", "with", "short", "main",
  "least", "more", "most", "can", "could", "would", "will", "should", "if", "not", "no", "yes", "they", "them", "their",
]);

/** Keywords for a cue point: authored ones, else its content words. */
export const cueKeywords = (cue: string, authored?: string[] | null): string[] => {
  const given = (authored ?? []).map(normalizeText).filter(Boolean);
  if (given.length) return given;
  return [...new Set(tokenize(cue).filter((token) => token.length >= 3 && !STOP.has(token)))];
};

/** One word matches a token exactly, or as a prefix when it has 4+ letters (deliver → delivered). */
const wordMatches = (token: string, word: string): boolean => token === word || (word.length >= 4 && token.startsWith(word));

/** A keyword appears in the text; in phrases each word matches the same way, in order (struggle with → struggled with). */
export const keywordHit = (tokens: string[], keyword: string): boolean => {
  const parts = normalizeText(keyword).split(" ").filter(Boolean);
  if (!parts.length) return false;
  for (let start = 0; start + parts.length <= tokens.length; start += 1) {
    if (parts.every((part, offset) => wordMatches(tokens[start + offset]!, part))) return true;
  }
  return false;
};

export const coverCuePoints = (prompt: SpeakingPromptInput, transcript: string): Array<{ text: string; covered: boolean }> => {
  const tokens = tokenize(transcript);
  return prompt.cue_points.map((cue, index) => ({
    text: cue,
    covered: cueKeywords(cue, prompt.cue_keywords?.[index]).some((keyword) => keywordHit(tokens, keyword)),
  }));
};

export const targetWordsUsed = (prompt: SpeakingPromptInput, transcript: string): string[] => {
  const tokens = tokenize(transcript);
  return prompt.target_vocabulary.filter((word) => keywordHit(tokens, word));
};

/** Does `said` appear word-for-word in the transcript (ignoring case and punctuation)? */
export const appearsIn = (said: string, transcript: string): boolean => {
  const needle = normalizeText(said);
  if (!needle) return false;
  return ` ${normalizeText(transcript)} `.includes(` ${needle} `);
};

// ---------------------------------------------------------------------------
// Pace

/** Rough spontaneous-speech pace bands (words per minute) by level. A guide, not a test standard. */
export const PACE_BANDS: Record<CefrLevel, [number, number]> = {
  A1: [40, 85],
  A2: [55, 100],
  B1: [70, 120],
  B2: [85, 135],
  C1: [100, 150],
  C2: [110, 160],
};

/** Words a learner at this level would roughly say in the target time (middle of the pace band). */
export const expectedWords = (level: CefrLevel, targetSeconds: number): number => {
  const [low, high] = PACE_BANDS[level];
  return Math.max(15, Math.round(((low + high) / 2) * (Math.max(10, targetSeconds) / 60)));
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Pace/fluency proxy (0..100) from words per minute, speaking time and filler density. Speech mode only. */
export const fluencyScore = (input: {
  level: CefrLevel;
  words: number;
  speakingSeconds: number;
  targetSeconds: number;
  fillers: number;
}): { score: number; wpm: number; pace: "slow" | "steady" | "fast" } => {
  const [low, high] = PACE_BANDS[input.level];
  const minutes = Math.max(1, input.speakingSeconds) / 60;
  const wpm = Math.round(input.words / minutes);
  let score = wpm < low ? 100 * (wpm / low) : wpm > high ? 100 - (wpm - high) * 0.8 : 100;
  score = clamp(score, 20, 100);
  const timeRatio = input.speakingSeconds / Math.max(10, input.targetSeconds);
  if (timeRatio < 0.4) score *= 0.6;
  else if (timeRatio < 0.7) score *= 0.85;
  const density = input.words > 0 ? (input.fillers / input.words) * 100 : 0;
  if (density > 3) score -= Math.min(30, (density - 3) * 4);
  return { score: Math.round(clamp(score, 0, 100)), wpm, pace: wpm < low ? "slow" : wpm > high ? "fast" : "steady" };
};

export const buildStats = (
  prompt: SpeakingPromptInput,
  transcript: string,
  mode: SpeakingMode,
  speakingSeconds: number | null,
): SpeakingStats & { fluency: number | null } => {
  const words = countWords(transcript);
  const fillers = countFillers(transcript);
  const seconds = mode === "speech" && speakingSeconds !== null && speakingSeconds >= 3 ? Math.round(speakingSeconds) : null;
  const pace = seconds !== null && words > 0
    ? fluencyScore({ level: prompt.level, words, speakingSeconds: seconds, targetSeconds: prompt.target_duration_seconds, fillers })
    : null;
  return {
    words,
    speaking_seconds: seconds,
    wpm: pace?.wpm ?? null,
    pace: pace?.pace ?? null,
    pace_band: PACE_BANDS[prompt.level],
    filler_count: fillers,
    sentences: mode === "typed" ? countSentences(transcript) : null,
    variety: Math.round(lexicalVariety(transcript) * 100) / 100,
    linkers: countLinkers(transcript),
    target_words_used: targetWordsUsed(prompt, transcript),
    fluency: pace?.score ?? null,
  };
};

/** An answer much shorter than the task needs cannot show the skill, whatever its quality. */
const lengthCap = (words: number, expected: number): number => {
  const ratio = words / expected;
  if (ratio < 0.15) return 25;
  if (ratio < 0.3) return 45;
  if (ratio < 0.45) return 65;
  return 100;
};

/**
 * Without AI nothing checks grammar or meaning, so a basic result never claims
 * a top score: a fully covered, well-paced answer tops out here.
 */
export const BASIC_MAX = 85;

const weighted = (parts: Array<[number | null, number]>): number => {
  const present = parts.filter((part): part is [number, number] => part[0] !== null);
  const weight = present.reduce((sum, [, w]) => sum + w, 0);
  if (!weight) return 0;
  return present.reduce((sum, [value, w]) => sum + value * w, 0) / weight;
};

// ---------------------------------------------------------------------------
// Rule-based feedback (no AI)

export const ruleBasedFeedback = (
  prompt: SpeakingPromptInput,
  transcript: string,
  mode: SpeakingMode,
  speakingSeconds: number | null,
): SpeakingFeedback => {
  const { fluency, ...stats } = buildStats(prompt, transcript, mode, speakingSeconds);
  const cues = coverCuePoints(prompt, transcript);
  const covered = cues.filter((cue) => cue.covered).length;
  const expected = expectedWords(prompt.level, prompt.target_duration_seconds);
  const lengthRatio = clamp(stats.words / (expected * 0.6), 0, 1);
  const coverage = cues.length ? covered / cues.length : lengthRatio;

  const task = Math.round(100 * (0.75 * coverage + 0.25 * lengthRatio));
  const varietyScore = stats.variety >= 0.72 ? 100 : stats.variety >= 0.6 ? 80 : stats.variety >= 0.5 ? 60 : 40;
  const targetShare = prompt.target_vocabulary.length
    ? Math.min(1, stats.target_words_used.length / Math.min(3, prompt.target_vocabulary.length))
    : 1;
  const vocabulary = Math.round(0.65 * varietyScore + 0.35 * 100 * targetShare);
  const fillerDensity = stats.words ? (stats.filler_count / stats.words) * 100 : 0;
  const typedFillerPenalty = fluency === null && fillerDensity > 3 ? Math.min(8, fillerDensity - 3) : 0;

  const raw = fluency !== null
    ? weighted([[task, 0.45], [vocabulary, 0.3], [fluency, 0.25]])
    : weighted([[task, 0.6], [vocabulary, 0.4]]) - typedFillerPenalty;
  const overall = Math.round(clamp(Math.min(raw, lengthCap(stats.words, expected), BASIC_MAX), 0, 100));

  const strengths: string[] = [];
  if (covered === cues.length && cues.length) strengths.push("You talked about every point in the task.");
  else if (covered > 0) strengths.push(`You talked about ${covered} of the ${cues.length} points in the task.`);
  if (stats.target_words_used.length) {
    strengths.push(`You used useful words from the task: ${stats.target_words_used.slice(0, 4).join(", ")}.`);
  }
  if (stats.pace === "steady") strengths.push("Your speaking pace was steady for your level.");
  if (stats.linkers >= 2) strengths.push("You joined your ideas with linking words.");
  if (stats.variety >= 0.72 && stats.words >= 20) strengths.push("You used a good variety of words.");
  if (stats.words >= expected * 0.8) strengths.push("Your answer was a good length for the task.");
  if (!strengths.length) strengths.push("You finished an answer. That is the first step.");

  const missing = cues.filter((cue) => !cue.covered).map((cue) => cue.text);
  const tips: string[] = [];
  if (missing.length) tips.push(`Next time, also talk about: ${missing.join("; ")}.`);
  if (stats.words < expected * 0.45) tips.push(`Say more. Aim for about ${Math.round(expected * 0.7)}–${expected} words: add a reason or an example for each point.`);
  if (stats.pace === "slow") tips.push("Try to keep talking. Plan your points first, then speak in short, connected sentences.");
  if (stats.pace === "fast") tips.push("Slow down a little so each idea is clear.");
  if (fillerDensity > 3) tips.push("Use fewer filler sounds like \"um\". A short silent pause is fine.");
  if (stats.variety < 0.6) tips.push("Try not to repeat the same words. Use one or two words from the useful words list.");
  if (stats.linkers < 2 && stats.words >= 15) tips.push("Join your ideas with words like because, so, but and after that.");
  if (!tips.length) tips.push("Try the task again and add one more detail or example to each point.");

  return {
    source: "basic",
    overall,
    scores: { task, vocabulary, grammar: null, fluency },
    cue_points: cues,
    strengths: strengths.slice(0, 3),
    corrections: [],
    tip: tips[0]!,
    model_answer: prompt.model_answer?.trim() || null,
    model_answer_kind: prompt.model_answer?.trim() ? "example" : null,
    stats,
  };
};

// ---------------------------------------------------------------------------
// AI feedback

export type SpeakingAIRaw = {
  cue_points_covered?: unknown;
  task_score?: unknown;
  vocabulary_score?: unknown;
  grammar_score?: unknown;
  strengths?: unknown;
  corrections?: unknown;
  tip?: unknown;
  model_answer?: unknown;
};

export const buildSpeakingAIRequest = (
  prompt: SpeakingPromptInput,
  transcript: string,
  mode: SpeakingMode,
  stats: SpeakingStats,
): { systemPrompt: string; userPayload: string; temperature: number } => {
  const modelWords = Math.min(260, Math.round(expectedWords(prompt.level, prompt.target_duration_seconds) * 0.9));
  return {
    systemPrompt: [
      "You are a friendly, honest English speaking coach. A learner answered a speaking task.",
      "You receive the task, its cue points, the learner's CEFR level, how the answer was produced and the transcript.",
      "mode 'speech' means an automatic speech-recognition transcript: it has little or no punctuation and may mis-hear words.",
      "Ignore missing punctuation and capital letters in speech transcripts, and do not correct words that are probably recognition mistakes (for example homophones).",
      "mode 'typed' means the learner typed the answer.",
      "Judge ONLY what the words show. You cannot hear the audio: never comment on pronunciation, accent, intonation, stress or pauses.",
      "Return strict JSON with exactly these keys:",
      "{cue_points_covered: array of booleans, one per cue point in the same order;",
      "task_score: integer 0-100, how fully and relevantly the task and its cue points were answered;",
      "vocabulary_score: integer 0-100, range and precision of vocabulary for the learner's level;",
      "grammar_score: integer 0-100, grammar accuracy for the level (serious errors count more than small slips);",
      "strengths: 2-3 short, specific sentences about what the learner did well, quoting their words where useful;",
      "corrections: up to 5 objects {said, better, explanation}, most important first. 'said' MUST be copied exactly from the transcript (2-12 words).",
      "'better' is the corrected or more natural version. 'explanation' is one short, plain sentence. Only include real errors or clearly unnatural phrasing;",
      "tip: one concrete thing to do on the next attempt;",
      `model_answer: an improved version of the learner's answer at their level: keep their ideas, fix the errors, cover every cue point, about ${modelWords} words, written as natural speech}.`,
      `Write all feedback for a learner at level ${prompt.level}: short, plain, friendly sentences.`,
    ].join(" "),
    userPayload: JSON.stringify({
      task_title: prompt.title,
      task: prompt.prompt_text,
      cue_points: prompt.cue_points,
      target_grammar: prompt.target_grammar || null,
      useful_words: prompt.target_vocabulary,
      learner_level: prompt.level,
      mode,
      target_seconds: prompt.target_duration_seconds,
      speaking_seconds: stats.speaking_seconds,
      words_per_minute: stats.wpm,
      transcript,
    }),
    temperature: 0.3,
  };
};

const text = (value: unknown, max: number): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const score = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(clamp(number, 0, 100)) : null;
};

/** Sentences that claim to judge sound cannot come from a transcript; drop them. */
const CLAIMS_SOUND = /\b(pronunciation|pronounc\w*|accent|intonation|stress(ed)? (the|on)|sounded|your voice)\b/i;

/**
 * Validates and clamps the model's JSON. Returns null when it is unusable
 * (then the caller uses the rule-based feedback). Pace always comes from our
 * own numbers, never from the model.
 */
export const normalizeAIFeedback = (
  raw: unknown,
  prompt: SpeakingPromptInput,
  transcript: string,
  mode: SpeakingMode,
  speakingSeconds: number | null,
): SpeakingFeedback | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as SpeakingAIRaw;
  const task = score(data.task_score);
  const vocabulary = score(data.vocabulary_score);
  const grammar = score(data.grammar_score);
  if (task === null || vocabulary === null || grammar === null) return null;

  const basic = ruleBasedFeedback(prompt, transcript, mode, speakingSeconds);
  const fluency = basic.scores.fluency;
  const flags = Array.isArray(data.cue_points_covered) ? data.cue_points_covered : null;
  const cues = flags && flags.length === prompt.cue_points.length && flags.every((flag) => typeof flag === "boolean")
    ? prompt.cue_points.map((cue, index) => ({ text: cue, covered: flags[index] as boolean }))
    : basic.cue_points;

  const strengths = (Array.isArray(data.strengths) ? data.strengths : [])
    .map((entry) => text(entry, 240))
    .filter((entry) => entry && !CLAIMS_SOUND.test(entry))
    .slice(0, 3);

  const seen = new Set<string>();
  const corrections: SpeakingCorrection[] = [];
  for (const entry of Array.isArray(data.corrections) ? data.corrections : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const said = text(rec.said, 200);
    const better = text(rec.better, 240);
    const explanation = text(rec.explanation, 280);
    if (!said || !better) continue;
    if (!appearsIn(said, transcript)) continue;
    if (normalizeText(said) === normalizeText(better)) continue;
    if (CLAIMS_SOUND.test(explanation)) continue;
    const key = normalizeText(said);
    if (seen.has(key)) continue;
    seen.add(key);
    corrections.push({ said, better, explanation });
    if (corrections.length >= 5) break;
  }

  const tipText = text(data.tip, 300);
  const tip = tipText && !CLAIMS_SOUND.test(tipText) ? tipText : basic.tip;
  const modelAnswer = text(data.model_answer, 2000);

  const expected = expectedWords(prompt.level, prompt.target_duration_seconds);
  const raw100 = weighted([[task, 0.35], [grammar, 0.25], [vocabulary, 0.2], [fluency, 0.2]]);
  const overall = Math.round(clamp(Math.min(raw100, lengthCap(basic.stats.words, expected)), 0, 100));

  return {
    source: "ai",
    overall,
    scores: { task, vocabulary, grammar, fluency },
    cue_points: cues,
    strengths: strengths.length ? strengths : basic.strengths,
    corrections,
    tip,
    model_answer: modelAnswer || basic.model_answer,
    model_answer_kind: modelAnswer ? "improved" : basic.model_answer_kind,
    stats: basic.stats,
  };
};

// ---------------------------------------------------------------------------
// Mistakes for the learner's Review list

export const issuesFromFeedback = (feedback: SpeakingFeedback, slug: string): Array<Record<string, unknown>> => {
  const issues: Array<Record<string, unknown>> = feedback.corrections.map((correction) => ({
    category: "grammar",
    subskill_key: "speaking.accuracy",
    location_ref: slug,
    explanation: `"${correction.said}" → "${correction.better}"`.slice(0, 240),
    correction_hint: correction.explanation || correction.better,
    severity: 0.55,
  }));
  const missing = feedback.cue_points.filter((cue) => !cue.covered);
  if (missing.length) {
    issues.push({
      category: "speaking",
      subskill_key: "speaking.task_completion",
      location_ref: slug,
      explanation: "Answer every point in a speaking task",
      correction_hint: `Missed: ${missing.map((cue) => cue.text).join("; ")}`.slice(0, 240),
      severity: missing.length >= 2 ? 0.7 : 0.5,
    });
  }
  if (feedback.stats.pace === "slow") {
    issues.push({
      category: "speaking",
      subskill_key: "speaking.fluency",
      location_ref: slug,
      explanation: "Keep speaking at a steady pace",
      correction_hint: "Plan your points first, then speak in short, connected sentences.",
      severity: 0.45,
    });
  }
  return issues;
};
