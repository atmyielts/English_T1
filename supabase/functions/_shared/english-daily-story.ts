// "Story of the day": one short new story per CEFR level per learner day,
// written once by the AI gateway (feature "daily-story") on the first request
// of the day and cached in english_daily_stories for everyone at that level.
// When AI is off, failing or switched off for this feature, the day's story is
// a text from the reading library instead, so the card is never empty.
//
// Generation is guarded by a row-level lock: the first request inserts the
// day's row as "generating" with a short lease (locked_until); everyone else
// sees "being written" until it is ready. A lease that ran out (the function
// died mid-call) can be taken over by the next request.
//
// Pure helpers only; hub/daily-story.ts does the I/O.

import { type McqQuestion, normalizeQuestions, type ReadingQuestion } from "./english-reading.ts";
import { wordCount } from "./english-reading-depth.ts";

export const STORY_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type StoryLevel = (typeof STORY_LEVELS)[number];
export const isStoryLevel = (value: unknown): value is StoryLevel => (STORY_LEVELS as readonly string[]).includes(String(value));

/** How long one request may hold the right to write the day's story. */
export const LOCK_SECONDS = 90;
/** After this many failed tries in a day, use the library. */
export const MAX_ATTEMPTS = 3;
export const STORY_QUESTIONS = 3;
const LEARNER_UTC_OFFSET_HOURS = 5;

/** The learner's day (Uzbekistan, UTC+5) as YYYY-MM-DD; a new story appears at local midnight. */
export const storyDate = (now: Date = new Date()): string =>
  new Date(now.getTime() + LEARNER_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);

/** Story length in words for each level. */
export const STORY_WORDS: Record<StoryLevel, { min: number; max: number }> = {
  A1: { min: 70, max: 140 },
  A2: { min: 100, max: 180 },
  B1: { min: 140, max: 240 },
  B2: { min: 170, max: 280 },
  C1: { min: 200, max: 320 },
  C2: { min: 220, max: 350 },
};

const LEVEL_GUIDE: Record<StoryLevel, string> = {
  A1: "very simple present tense, short sentences, the 800 most common words",
  A2: "simple past and present, short sentences, everyday words",
  B1: "mix of tenses, some linking words, everyday and work topics",
  B2: "varied structures, some idioms, opinions and reasons",
  C1: "rich vocabulary, complex sentences, nuance and implication",
  C2: "sophisticated style, idiom, irony and subtle implication",
};

export type StoryRow = {
  id?: string;
  status: "generating" | "ready" | "failed";
  locked_until: string | null;
  attempts: number;
};

export type LockDecision = "serve" | "wait" | "take_over" | "fallback";

/**
 * What a request should do with the day's row:
 *  serve      it is ready;
 *  wait       someone else is writing it now;
 *  take_over  the writer's lease ran out (or it failed and may be retried): try to claim it;
 *  fallback   it failed too often today: use the library.
 */
export const lockDecision = (row: StoryRow, now: Date = new Date()): LockDecision => {
  if (row.status === "ready") return "serve";
  const leaseActive = row.locked_until !== null && Date.parse(row.locked_until) > now.getTime();
  if (row.status === "generating" && leaseActive) return "wait";
  return row.attempts >= MAX_ATTEMPTS ? "fallback" : "take_over";
};

export const leaseUntil = (now: Date = new Date()): string => new Date(now.getTime() + LOCK_SECONDS * 1000).toISOString();

/** Rotates themes by date so stories differ day to day (and level to level). */
const THEMES = [
  "a small surprise at a bazaar", "a train journey", "a new neighbour", "a lost phone", "a rainy weekend",
  "a first day at a new job", "cooking for guests", "a football match", "a trip to the mountains", "a job interview",
  "an old photograph", "a birthday plan that goes wrong", "learning to drive", "a library mystery", "a wedding in the mahalla",
  "a power cut", "a message from a stranger", "an exam morning", "a street musician", "a volunteer day",
  "a misunderstanding at a hotel", "a grandmother's recipe", "a broken laptop", "moving to a new city", "a quiet hero",
  "a late bus", "a market price", "a lucky mistake", "a weekend without phones", "a letter from abroad", "planting a tree",
];

export const dayHash = (text: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const themeFor = (date: string, level: StoryLevel): string => THEMES[dayHash(`${date}:${level}`) % THEMES.length]!;

/** A short system prompt and payload; the answer is small JSON. */
export const storyPrompt = (level: StoryLevel, date: string): { systemPrompt: string; userPayload: string } => {
  const words = STORY_WORDS[level];
  return {
    systemPrompt: [
      "You write short original stories for learners of English in Uzbekistan.",
      `Level ${level}: ${LEVEL_GUIDE[level]}. Length ${words.min + 20}-${words.max - 20} words.`,
      "Use names and places familiar in Uzbekistan when natural. Friendly, everyday, no politics, religion or violence.",
      "Paragraphs separated by a blank line. No title inside the text.",
      `Then exactly ${STORY_QUESTIONS} multiple-choice comprehension questions with 3 options each: one main idea, one detail, one inference. Only one option is right; explanations quote the text.`,
      'Return JSON only: {"title": string, "text": string, "questions": [{"prompt": string, "options": [string, string, string], "answer_index": 0|1|2, "explanation": string, "skill": "main_idea"|"detail"|"inference"}]}',
    ].join("\n"),
    userPayload: JSON.stringify({ level, theme: themeFor(date, level), date }),
  };
};

export type StoryContent = { title: string; body: string; questions: ReadingQuestion[]; word_count: number };

const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Checks the AI's answer: a title, a text of the right length for the level,
 * and exactly three well-formed questions. Anything else is rejected (the
 * library is used instead), never shown half-broken.
 */
export const parseStoryOutput = (raw: unknown, level: StoryLevel): StoryContent | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const title = clip(record.title, 120).replace(/^["“]|["”]$/g, "");
  const body = clip(record.text ?? record.body, 4000).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (!title || !body) return null;
  const words = wordCount(body);
  const range = STORY_WORDS[level];
  if (words < range.min || words > range.max) return null;
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questions = normalizeQuestions(
    rawQuestions.slice(0, STORY_QUESTIONS).map((question, index) =>
      question && typeof question === "object" ? { ...(question as Record<string, unknown>), id: `q${index + 1}`, type: "mcq" } : question
    ),
  );
  if (questions.length !== STORY_QUESTIONS) return null;
  // Options must differ, or the question cannot be answered fairly.
  if (questions.some((question) => question.type === "mcq" && new Set(question.options.map((option) => option.toLowerCase())).size !== question.options.length)) return null;
  return { title, body, questions, word_count: words };
};

export type LibraryArticle = { slug: string; title: string; level: string; content_markdown: string | null; questions: unknown };

/**
 * The library text for a day when AI cannot write one: a published text at
 * the level (else the nearest level) with at least three choice questions,
 * picked by date so it is the same for everyone that day.
 */
export const libraryStoryFor = (articles: LibraryArticle[], level: StoryLevel, date: string): (StoryContent & { slug: string; level: StoryLevel }) | null => {
  const usable = articles
    .map((article) => ({
      article,
      questions: normalizeQuestions(article.questions).filter((question): question is McqQuestion | Extract<ReadingQuestion, { type: "tfng" }> =>
        question.type === "mcq" || question.type === "tfng"),
    }))
    .filter((entry) => entry.questions.length >= STORY_QUESTIONS && isStoryLevel(entry.article.level) && (entry.article.content_markdown ?? "").trim());
  const target = STORY_LEVELS.indexOf(level);
  const distance = (entry: (typeof usable)[number]) => Math.abs(STORY_LEVELS.indexOf(entry.article.level as StoryLevel) - target);
  const nearest = Math.min(...usable.map(distance));
  const pool = usable.filter((entry) => distance(entry) === nearest).sort((a, b) => a.article.slug.localeCompare(b.article.slug));
  if (!pool.length) return null;
  const pick = pool[dayHash(`${date}:${level}:library`) % pool.length]!;
  const body = (pick.article.content_markdown ?? "").trim();
  return {
    slug: pick.article.slug,
    level: pick.article.level as StoryLevel,
    title: pick.article.title,
    body,
    questions: pick.questions.slice(0, STORY_QUESTIONS),
    word_count: wordCount(body),
  };
};
