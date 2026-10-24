// IELTS-style speaking mock: Part 1 questions, a Part 2 cue card (1 minute to
// prepare, up to 2 minutes to talk) and Part 3 discussion.
//
// Questions come from a static bank (no AI to start a mock). One AI call at
// the end scores the transcript on the four IELTS criteria. Bands are an
// estimate: a browser transcript cannot judge pronunciation precisely, and a
// typed answer cannot judge it at all, so pronunciation is left out then.
// Limits: one free mock per learner week; learners with Speaking up to
// MOCK_OWNER_PER_DAY a day. The day and week follow Uzbekistan time (UTC+5).

import { grammarTopicFor, isGrammarTopic, topicSubskill } from "./english-mistakes.ts";
import { matchL1Notes } from "./english-l1-notes.ts";

export const MOCK_FREE_PER_WEEK = 1;
export const MOCK_OWNER_PER_DAY = 5;
export const MOCK_PART1_QUESTIONS = 6;
export const MOCK_PART3_QUESTIONS = 3;
export const MOCK_PREP_SECONDS = 60;
export const MOCK_TALK_SECONDS = 120;
/** An unfinished mock started within this time is resumed instead of starting a new one. */
export const MOCK_RESUME_MS = 3 * 3_600_000;
const LEARNER_UTC_OFFSET_HOURS = 5;

export type Part1Topic = { id: string; questions: string[] };
export type CueCard = { id: string; prompt: string; points: string[]; part3: string[] };

export const PART1_TOPICS: readonly Part1Topic[] = [
  { id: "hometown", questions: ["Where is your home town?", "What do you like most about your home town?", "Has your home town changed much in recent years?", "Would you like to live there in the future? Why?"] },
  { id: "work-study", questions: ["Do you work or are you a student?", "Why did you choose this job or subject?", "What do you find most difficult about it?", "What would you like to do in the future?"] },
  { id: "free-time", questions: ["What do you usually do in your free time?", "Do you prefer spending free time alone or with friends?", "Is there a hobby you would like to try?", "How much free time do you have during the week?"] },
  { id: "food", questions: ["What kind of food do you like?", "Do you often cook at home?", "Is there a dish from your country you would recommend to visitors?", "Have your eating habits changed since you were a child?"] },
  { id: "weather", questions: ["What is the weather usually like where you live?", "Which season do you like best? Why?", "Does the weather affect your mood?", "What do you like to do on hot days?"] },
  { id: "phones", questions: ["How often do you use your phone?", "What do you mostly use it for?", "Could you live without your phone for a week?", "Do you think people use phones too much?"] },
  { id: "music", questions: ["What kind of music do you like?", "Did you learn to play an instrument as a child?", "Do you prefer live music or recordings?", "Is traditional music popular in your country?"] },
  { id: "travel", questions: ["Do you like travelling?", "Where did you go on your last trip?", "Do you prefer travelling by plane, train or car?", "Which country would you like to visit? Why?"] },
];

export const CUE_CARDS: readonly CueCard[] = [
  {
    id: "helpful-person",
    prompt: "Describe a person who has helped you a lot.",
    points: ["who this person is", "how you know them", "what they did to help you", "and explain why their help was important to you"],
    part3: ["Why do some people enjoy helping others?", "Should schools teach children to help in their community?", "Do people help their neighbours less than in the past?"],
  },
  {
    id: "memorable-trip",
    prompt: "Describe a trip you remember well.",
    points: ["where you went", "who you went with", "what you did there", "and explain why you remember this trip"],
    part3: ["Why do people like to travel to other countries?", "How has tourism changed cities in your country?", "Is it better to travel alone or in a group?"],
  },
  {
    id: "useful-skill",
    prompt: "Describe a skill you learned that is useful to you.",
    points: ["what the skill is", "when and how you learned it", "how often you use it", "and explain why it is useful"],
    part3: ["Which skills will be most important in the future?", "Is it better to learn skills at school or at work?", "Why do some adults stop learning new things?"],
  },
  {
    id: "favourite-place",
    prompt: "Describe a place in your city where you like to spend time.",
    points: ["where it is", "what it looks like", "what you do there", "and explain why you like spending time there"],
    part3: ["Why are parks and public spaces important in cities?", "How could your city be made better for young people?", "Do people spend more time indoors than before?"],
  },
  {
    id: "book-or-film",
    prompt: "Describe a book or film that made a strong impression on you.",
    points: ["what it was", "when you read or watched it", "what it was about", "and explain why it made a strong impression"],
    part3: ["Do young people read less than in the past?", "Should films based on books follow the story exactly?", "Why are some stories popular in many countries?"],
  },
  {
    id: "celebration",
    prompt: "Describe a celebration or festival you enjoyed.",
    points: ["what the celebration was", "where and when it took place", "what people did", "and explain why you enjoyed it"],
    part3: ["Why are traditional festivals important?", "Have celebrations in your country changed over time?", "Do people spend too much money on celebrations?"],
  },
  {
    id: "goal",
    prompt: "Describe a goal you would like to achieve in the next few years.",
    points: ["what the goal is", "why you chose it", "what you need to do to achieve it", "and explain how you will feel when you achieve it"],
    part3: ["Is it important for young people to have clear goals?", "Why do some people give up on their goals?", "Should parents choose goals for their children?"],
  },
  {
    id: "technology",
    prompt: "Describe a piece of technology you use every day.",
    points: ["what it is", "how long you have had it", "what you use it for", "and explain how your life would be different without it"],
    part3: ["Has technology made people's lives easier or more stressful?", "Should children use technology at school?", "What new technology do you think will change our lives?"],
  },
];

/** Mulberry32: a small seeded generator, so question picks are testable. */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = <T>(items: readonly T[], rand: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

export type MockQuestions = {
  part1: Array<{ topic: string; question: string }>;
  part2: { id: string; prompt: string; points: string[] };
  part3: string[];
};

/**
 * Questions for one mock: work/study first (as in the real test), then two
 * more Part 1 topics, and a cue card the learner hasn't had recently.
 */
export const pickMockQuestions = (rand: () => number, recentCueIds: string[] = []): MockQuestions => {
  const opener = PART1_TOPICS.find((topic) => topic.id === "work-study")!;
  const others = shuffle(PART1_TOPICS.filter((topic) => topic.id !== opener.id), rand).slice(0, 2);
  const part1 = [
    ...opener.questions.slice(0, 2).map((question) => ({ topic: opener.id, question })),
    ...others.flatMap((topic) => topic.questions.slice(0, 2).map((question) => ({ topic: topic.id, question }))),
  ].slice(0, MOCK_PART1_QUESTIONS);
  const fresh = CUE_CARDS.filter((card) => !recentCueIds.includes(card.id));
  const pool = fresh.length ? fresh : CUE_CARDS;
  const card = pool[Math.floor(rand() * pool.length)] ?? CUE_CARDS[0]!;
  return { part1, part2: { id: card.id, prompt: card.prompt, points: card.points }, part3: card.part3.slice(0, MOCK_PART3_QUESTIONS) };
};

/** Reads stored questions back (from english_speaking_mocks.questions). */
export const readMockQuestions = (value: unknown): MockQuestions | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const part2 = record.part2 as Record<string, unknown> | undefined;
  if (!Array.isArray(record.part1) || !part2 || !Array.isArray(record.part3)) return null;
  return {
    part1: record.part1.map((entry) => ({ topic: String((entry as Record<string, unknown>)?.topic ?? ""), question: String((entry as Record<string, unknown>)?.question ?? "") })),
    part2: { id: String(part2.id ?? ""), prompt: String(part2.prompt ?? ""), points: Array.isArray(part2.points) ? part2.points.map(String) : [] },
    part3: record.part3.map(String),
  };
};

// --- Limits -----------------------------------------------------------------

/** Start of the learner's current week (Monday 00:00 in UTC+5), as ISO in UTC. */
export const learnerWeekStart = (now: Date = new Date()): string => {
  const shifted = new Date(now.getTime() + LEARNER_UTC_OFFSET_HOURS * 3_600_000);
  const sinceMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - sinceMonday);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - LEARNER_UTC_OFFSET_HOURS * 3_600_000).toISOString();
};

export type MockAllowance = {
  allowed: boolean;
  basis: "owner" | "admin" | "free";
  /** Mocks left in the current window (day for owners, week otherwise). */
  left: number;
  per: "day" | "week";
  limit: number;
};

export const decideMockStart = (input: { admin: boolean; ownsSpeaking: boolean; startedToday: number; startedThisWeek: number }): MockAllowance => {
  if (input.admin || input.ownsSpeaking) {
    const left = Math.max(0, MOCK_OWNER_PER_DAY - input.startedToday);
    return { allowed: left > 0, basis: input.admin ? "admin" : "owner", left, per: "day", limit: MOCK_OWNER_PER_DAY };
  }
  const left = Math.max(0, MOCK_FREE_PER_WEEK - input.startedThisWeek);
  return { allowed: left > 0, basis: "free", left, per: "week", limit: MOCK_FREE_PER_WEEK };
};

// --- Answers ------------------------------------------------------------------

export type MockMode = "speech" | "typed";
export type MockAnswer = { question: string; text: string; mode: MockMode; seconds: number | null; words: number };
export type MockAnswers = { part1: MockAnswer[]; part2: MockAnswer; part3: MockAnswer[] };

export const countWords = (text: string): number => (text.match(/[A-Za-z0-9’']+/g) ?? []).length;

const answerFrom = (value: unknown, question: string, maxChars: number, maxSeconds: number): MockAnswer => {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = String(record.text ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars);
  const mode: MockMode = record.mode === "speech" ? "speech" : "typed";
  const secondsRaw = Number(record.seconds);
  const seconds = mode === "speech" && Number.isFinite(secondsRaw) && secondsRaw > 0 ? Math.min(maxSeconds, Math.round(secondsRaw)) : null;
  return { question, text, mode, seconds, words: countWords(text) };
};

/** The learner's answers, matched to the stored questions by position and bounded in size. */
export const parseMockAnswers = (body: unknown, questions: MockQuestions): MockAnswers => {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  return {
    part1: questions.part1.map((entry, index) => answerFrom(list(record.part1)[index], entry.question, 1500, 180)),
    part2: answerFrom(record.part2, questions.part2.prompt, 3500, MOCK_TALK_SECONDS + 30),
    part3: questions.part3.map((question, index) => answerFrom(list(record.part3)[index], question, 2000, 240)),
  };
};

export const MOCK_MIN_TOTAL_WORDS = 60;
export const MOCK_MIN_PART2_WORDS = 25;

/** Why the answers can't be scored yet, or null when they can. */
export const mockAnswersProblem = (answers: MockAnswers): "too_short" | "part2_too_short" | null => {
  const total = [...answers.part1, answers.part2, ...answers.part3].reduce((sum, answer) => sum + answer.words, 0);
  if (total < MOCK_MIN_TOTAL_WORDS) return "too_short";
  if (answers.part2.words < MOCK_MIN_PART2_WORDS) return "part2_too_short";
  return null;
};

const allAnswers = (answers: MockAnswers): MockAnswer[] => [...answers.part1, answers.part2, ...answers.part3];

/** Pronunciation can only be estimated when at least one part was spoken. */
export const spokenAnything = (answers: MockAnswers): boolean => allAnswers(answers).some((answer) => answer.mode === "speech" && answer.words > 0);

// --- Scoring --------------------------------------------------------------------

export const CRITERIA = ["fluency", "lexical", "grammar", "pronunciation"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const PRACTICE_TARGETS = ["roleplay", "speaking", "pronunciation", "vocabulary", "grammar"] as const;
export type PracticeTarget = (typeof PRACTICE_TARGETS)[number];

export type MockPriority = { criterion: Criterion; text: string; practice: PracticeTarget; topic: string | null };
export type MockFix = { said: string; better: string; why: string; topic: string | null; l1: string | null };
export type MockResult = {
  source: "ai";
  bands: Record<Criterion, number | null>;
  overall: number;
  comments: Record<Criterion, string | null>;
  priorities: MockPriority[];
  fixes: MockFix[];
  /** The pronunciation band is a rough guess from the transcript (or absent when typed). */
  pronunciation_note: "transcript_only" | "not_assessed";
  words: number;
};

/** A band on the IELTS scale: 1–9 in half bands. */
export const roundBand = (value: unknown): number | null => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.max(1, Math.min(9, Math.round(number * 2) / 2));
};

/** Overall band: the mean of the criteria, rounded to the nearest half band (.25 and .75 round up). */
export const overallBand = (bands: Array<number | null>): number => {
  const present = bands.filter((band): band is number => band !== null);
  if (!present.length) return 0;
  const mean = present.reduce((sum, band) => sum + band, 0) / present.length;
  return Math.round(mean * 2) / 2;
};

export const buildMockScoringRequest = (questions: MockQuestions, answers: MockAnswers) => ({
  systemPrompt:
    "You are an experienced IELTS Speaking examiner. Estimate band scores (1-9, half bands allowed) from a transcript of a practice mock. " +
    "Criteria: fluency (Fluency and Coherence), lexical (Lexical Resource), grammar (Grammatical Range and Accuracy), pronunciation. " +
    "The transcript comes from browser speech recognition or typing, so it cannot show pronunciation well: estimate pronunciation only from clues (recognition errors, very short answers) and keep it close to the other bands; if no part was spoken, return null for it. " +
    "Be realistic and strict, like the real test; very short answers lower fluency. " +
    'Return strict JSON: {"bands": {"fluency": n, "lexical": n, "grammar": n, "pronunciation": n|null}, ' +
    '"comments": {"fluency": one short sentence, "lexical": ..., "grammar": ..., "pronunciation": ...}, ' +
    '"priorities": exactly 3 [{"criterion": one of fluency|lexical|grammar|pronunciation, "text": one concrete, simple instruction, "practice": one of roleplay|speaking|pronunciation|vocabulary|grammar}], ' +
    '"fixes": up to 3 [{"said": the learner\'s exact words with a real mistake, "better": corrected, "why": one short sentence}]}.',
  userPayload: JSON.stringify({
    spoken: spokenAnything(answers),
    part1: answers.part1.map((answer) => ({ q: answer.question, a: answer.text })),
    part2: { cue_card: questions.part2.prompt, points: questions.part2.points, a: answers.part2.text, seconds: answers.part2.seconds },
    part3: answers.part3.map((answer) => ({ q: answer.question, a: answer.text })),
  }),
  temperature: 0.2,
});

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const norm = (text: string): string =>
  text.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\s]+/g, " ").replace(/\s+/g, " ").trim();

const DEFAULT_PRACTICE: Record<Criterion, PracticeTarget> = {
  fluency: "roleplay",
  lexical: "vocabulary",
  grammar: "grammar",
  pronunciation: "pronunciation",
};

/** Validated scores, or null when the model's answer can't be used. */
export const parseMockScore = (raw: unknown, answers: MockAnswers): MockResult | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const bandsRaw = record.bands && typeof record.bands === "object" ? record.bands as Record<string, unknown> : null;
  if (!bandsRaw) return null;
  const spoken = spokenAnything(answers);
  const bands: Record<Criterion, number | null> = {
    fluency: roundBand(bandsRaw.fluency),
    lexical: roundBand(bandsRaw.lexical),
    grammar: roundBand(bandsRaw.grammar),
    pronunciation: spoken ? roundBand(bandsRaw.pronunciation) : null,
  };
  if (bands.fluency === null || bands.lexical === null || bands.grammar === null) return null;
  // A guess from a transcript must not pull the estimate far from what the text shows.
  if (bands.pronunciation !== null) {
    const textMean = (bands.fluency + bands.lexical + bands.grammar) / 3;
    bands.pronunciation = Math.max(textMean - 1, Math.min(textMean + 1, bands.pronunciation));
    bands.pronunciation = Math.round(bands.pronunciation * 2) / 2;
  }
  const commentsRaw = record.comments && typeof record.comments === "object" ? record.comments as Record<string, unknown> : {};
  const comments = Object.fromEntries(CRITERIA.map((criterion) => [criterion, str(commentsRaw[criterion], 240) || null])) as Record<Criterion, string | null>;
  if (!spoken) comments.pronunciation = null;

  const learnerText = norm(allAnswers(answers).map((answer) => answer.text).join(" "));
  const fixes: MockFix[] = (Array.isArray(record.fixes) ? record.fixes : [])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({ said: str(entry.said, 200), better: str(entry.better, 200), why: str(entry.why, 240) }))
    .filter((fix) => fix.said && fix.better && norm(fix.said) !== norm(fix.better) && learnerText.includes(norm(fix.said)))
    .slice(0, 3)
    .map((fix) => {
      const topic = grammarTopicFor({ original: fix.said, corrected: fix.better, explanation: fix.why });
      return { ...fix, topic, l1: matchL1Notes({ original: fix.said, corrected: fix.better, explanation: fix.why, topic })[0]?.id ?? null };
    });

  const grammarTopic = fixes.find((fix) => fix.topic)?.topic ?? null;
  const priorities: MockPriority[] = (Array.isArray(record.priorities) ? record.priorities : [])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => {
      const criterion = (CRITERIA as readonly string[]).includes(String(entry.criterion)) ? entry.criterion as Criterion : null;
      const text = str(entry.text, 240);
      if (!criterion || !text || (criterion === "pronunciation" && !spoken)) return null;
      const practice = (PRACTICE_TARGETS as readonly string[]).includes(String(entry.practice)) ? entry.practice as PracticeTarget : DEFAULT_PRACTICE[criterion];
      return { criterion, text, practice, topic: practice === "grammar" ? grammarTopic : null };
    })
    .filter((entry): entry is MockPriority => entry !== null)
    .slice(0, 3);
  if (!priorities.length) return null;

  return {
    source: "ai",
    bands,
    overall: overallBand(CRITERIA.map((criterion) => bands[criterion])),
    comments,
    priorities,
    fixes,
    pronunciation_note: spoken ? "transcript_only" : "not_assessed",
    words: allAnswers(answers).reduce((sum, answer) => sum + answer.words, 0),
  };
};

/** Mistake rows for the shared mistake list (learner_language_errors). */
export const issuesFromMock = (result: MockResult): Array<Record<string, unknown>> =>
  result.fixes.map((fix) => ({
    category: "grammar",
    subskill_key: isGrammarTopic(fix.topic) ? topicSubskill(fix.topic) : "speaking.accuracy",
    location_ref: "ielts-speaking-mock",
    explanation: `"${fix.said}" → "${fix.better}"`.slice(0, 240),
    correction_hint: fix.why || fix.better,
    severity: 0.55,
  }));
