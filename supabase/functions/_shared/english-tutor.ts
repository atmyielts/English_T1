// The AI tutor's memory of the learner and its mini-lessons.
//
// Cost rule: the model never sees the raw conversation. Each turn sends a
// compact learner context (levels, goal, top mistakes, words due, class
// work), a rolling summary of the thread (written by the model itself, at
// most 600 characters) and the last few messages, each cut short. The whole
// payload stays within a fixed character budget however long the thread is.
//
// Mini-lessons: explain → practise 3 items → one check question. The model
// writes the lesson once; answers are checked here, without AI, against the
// answer and accepted variants it gave. Lessons for a grammar topic and level
// are the same for everyone, so they are cached and reused.
//
// Pure module (only imports the pure grammar topic list).

import { GRAMMAR_TOPICS, isGrammarTopic } from "./english-mistakes.ts";

export const TUTOR_LIMITS = {
  /** Messages sent to the model each turn (newest). */
  recentMessages: 6,
  /** Each of those messages is cut to this many characters. */
  messageChars: 500,
  /** All recent messages together. */
  historyChars: 2400,
  /** The rolling thread summary. */
  summaryChars: 600,
  /** Learner context as JSON. */
  contextChars: 1800,
  /** Stored per thread (older ones are deleted). */
  threadMessages: 200,
  /** Threads kept per learner (oldest deleted when a new one starts). */
  threadsPerLearner: 20,
  /** Threads untouched this long are deleted by the daily job. */
  retentionDays: 180,
  /** One stored message. */
  storedMessageChars: 4000,
} as const;

export type TutorRole = "user" | "assistant";
export type TutorMessage = { role: TutorRole; content: string };

const clean = (value: unknown, max: number): string => {
  // deno-lint-ignore no-control-regex
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
};

/**
 * The newest messages that fit: at most `recentMessages`, each cut to
 * `messageChars`, together at most `historyChars`. The last message is always
 * kept (it is what the learner just asked).
 */
export const fitMessages = (
  messages: TutorMessage[],
  limits: { recentMessages: number; messageChars: number; historyChars: number } = TUTOR_LIMITS,
): TutorMessage[] => {
  const out: TutorMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0 && out.length < limits.recentMessages; index -= 1) {
    const message = messages[index]!;
    const content = clean(message.content, limits.messageChars);
    if (!content) continue;
    if (out.length > 0 && used + content.length > limits.historyChars) break;
    out.unshift({ role: message.role === "assistant" ? "assistant" : "user", content });
    used += content.length;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Learner context
// ---------------------------------------------------------------------------

export type TutorMistakeInput = { topic: string | null; subskill: string; example: string; times: number };

export type TutorContextInput = {
  goal: {
    current_cefr_estimate?: unknown;
    target_cefr?: unknown;
    goal_keys?: unknown;
    daily_time_minutes?: unknown;
    metadata?: unknown;
  } | null;
  mistakes: TutorMistakeInput[];
  recent: Array<{ skill: string; score: number | null; at: string }>;
  dueWords: { count: number; words: string[] };
  assignments: Array<{ title: string; skill: string | null; due: string | null; route: string | null }>;
  memories: Array<{ kind: string; text: string }>;
  project: { key: string; title: string; day: number; days: number } | null;
  /** Grammar lesson to suggest per topic (slug), when one exists. */
  lessons: Record<string, string>;
};

export type TutorContext = {
  level: string | null;
  levels: Record<string, string>;
  target: string | null;
  goal_date: string | null;
  goals: string[];
  daily_minutes: number | null;
  mistakes: Array<{ topic: string; times: number; example: string | null; lesson: string | null }>;
  words_due: number;
  practise_words: string[];
  assignments: Array<{ title: string; skill: string | null; due: string | null; route: string | null }>;
  recent: string[];
  memories: string[];
  project: string | null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const CEFR = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const level = (value: unknown): string | null => {
  const text = String(value ?? "").trim().toUpperCase();
  return CEFR.has(text) ? text : null;
};

/** "B1 62%" from a stored rating, else the placement level. */
const levelsFrom = (meta: Record<string, unknown>): { overall: string | null; skills: Record<string, string> } => {
  const skills: Record<string, string> = {};
  const ratings = record(meta.skill_ratings);
  for (const [skill, raw] of Object.entries(record(ratings.skills))) {
    const entry = record(raw);
    const lvl = level(entry.level);
    if (!lvl) continue;
    const progress = typeof entry.progress === "number" && Number.isFinite(entry.progress) ? entry.progress : null;
    skills[skill] = progress === null ? lvl : `${lvl} ${Math.round(progress)}%`;
  }
  const placement = record(record(meta.placement).per_skill);
  for (const [skill, raw] of Object.entries(placement)) {
    if (skills[skill]) continue;
    const lvl = level(typeof raw === "string" ? raw : record(raw).level);
    if (lvl) skills[skill] = lvl;
  }
  return { overall: level(record(ratings.overall).level), skills };
};

/** Groups mistakes by grammar topic (or by the mistake itself), most frequent first. */
export const topMistakes = (rows: TutorMistakeInput[], lessons: Record<string, string>, limit = 4): TutorContext["mistakes"] => {
  const groups = new Map<string, { topic: string; times: number; example: string | null }>();
  for (const row of rows) {
    const name = row.topic ?? row.subskill.replace(/^[a-z]+\./, "").replace(/[_.]/g, " ");
    if (!name) continue;
    const group = groups.get(name) ?? { topic: name, times: 0, example: null };
    group.times += Math.max(1, Math.round(row.times || 1));
    // Prefer the learner's own sentence ("wrong → right") as the example.
    if ((!group.example || !group.example.includes("→")) && row.example) group.example = clean(row.example, 120);
    groups.set(name, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.times - a.times || a.topic.localeCompare(b.topic))
    .slice(0, limit)
    .map((group) => ({ ...group, lesson: lessons[group.topic] ?? null }));
};

export const buildTutorContext = (input: TutorContextInput): TutorContext => {
  const goal = input.goal ?? {};
  const meta = record(goal.metadata);
  const levels = levelsFrom(meta);
  const goalDate = String(record(meta.goal_plan).target_date ?? "");
  return {
    level: levels.overall ?? level(goal.current_cefr_estimate),
    levels: levels.skills,
    target: level(goal.target_cefr),
    goal_date: /^\d{4}-\d{2}-\d{2}$/.test(goalDate) ? goalDate : null,
    goals: (Array.isArray(goal.goal_keys) ? goal.goal_keys : []).map((key) => clean(key, 40)).filter(Boolean).slice(0, 4),
    daily_minutes: Number.isFinite(Number(goal.daily_time_minutes)) && Number(goal.daily_time_minutes) > 0 ? Math.round(Number(goal.daily_time_minutes)) : null,
    mistakes: topMistakes(input.mistakes, input.lessons),
    words_due: Math.max(0, Math.round(input.dueWords.count || 0)),
    practise_words: input.dueWords.words.map((word) => clean(word, 40)).filter(Boolean).slice(0, 5),
    assignments: input.assignments.slice(0, 3).map((entry) => ({
      title: clean(entry.title, 100),
      skill: entry.skill ? clean(entry.skill, 24) : null,
      due: entry.due ? clean(entry.due, 10) : null,
      route: entry.route && safeTutorRoute(entry.route) ? entry.route : null,
    })).filter((entry) => entry.title),
    recent: input.recent.slice(0, 6).map((entry) => `${entry.skill} ${entry.score === null ? "-" : entry.score} (${entry.at.slice(5, 10)})`),
    memories: input.memories.slice(-10).map((memory) => clean(memory.text, 160)).filter(Boolean),
    project: input.project ? clean(`${input.project.title}: day ${input.project.day} of ${input.project.days}`, 120) : null,
  };
};

/**
 * Shrinks the context until its JSON fits `maxChars`, dropping the least
 * useful details first: older results, memories, words, mistake examples.
 */
export const fitContext = (context: TutorContext, maxChars: number = TUTOR_LIMITS.contextChars): TutorContext => {
  const next: TutorContext = JSON.parse(JSON.stringify(context));
  const steps: Array<(c: TutorContext) => void> = [
    (c) => { c.recent = c.recent.slice(0, 3); },
    (c) => { c.memories = c.memories.slice(-5); },
    (c) => { c.practise_words = c.practise_words.slice(0, 3); },
    (c) => { c.mistakes = c.mistakes.slice(0, 3); },
    (c) => { c.mistakes = c.mistakes.map((entry) => ({ ...entry, example: null })); },
    (c) => { c.assignments = c.assignments.slice(0, 1); },
    (c) => { c.recent = []; },
    (c) => { c.memories = c.memories.slice(-2); },
    (c) => { c.memories = []; },
  ];
  for (const step of steps) {
    if (JSON.stringify(next).length <= maxChars) break;
    step(next);
  }
  return next;
};

// ---------------------------------------------------------------------------
// Suggested actions (deep links)
// ---------------------------------------------------------------------------

const ROUTE_ROOTS = [
  "today", "practice", "review", "progress", "tutor", "league", "check", "certificate", "roleplay", "speaking-mock",
  "reading", "writing", "listening", "speaking", "grammar", "vocabulary", "immersion",
];

/** An in-app route the tutor may link to, or null. */
export const safeTutorRoute = (route: unknown): string | null => {
  const path = String(route ?? "").trim();
  if (path.length > 160) return null;
  const match = /^\/([a-z-]+)((?:\/[A-Za-z0-9._~-]+){0,2})(#[A-Za-z0-9-]+)?$/.exec(path);
  if (!match || !ROUTE_ROOTS.includes(match[1]!)) return null;
  return path;
};

export type TutorAction = {
  /** review | lesson | handbook | assignment | project | skill | ai */
  kind: string;
  route: string;
  /** Model-written label (kind "ai") or a title (assignment, project, lesson). */
  label: string | null;
  why: string | null;
  topic?: string | null;
};

/** Actions that follow from the context alone (no AI): due words, the top mistake, class work, an active project. */
export const contextActions = (context: TutorContext, projectKey: string | null = null): TutorAction[] => {
  const actions: TutorAction[] = [];
  const assignment = context.assignments.find((entry) => entry.route);
  if (assignment) actions.push({ kind: "assignment", route: assignment.route!, label: assignment.title, why: null });
  if (context.words_due > 0) actions.push({ kind: "review", route: "/review", label: null, why: null });
  const mistake = context.mistakes[0];
  if (mistake?.lesson) actions.push({ kind: "lesson", route: `/grammar/${mistake.lesson}`, label: null, why: null, topic: mistake.topic });
  if (projectKey && context.project) actions.push({ kind: "project", route: `/immersion/projects/${projectKey}`, label: context.project, why: null });
  return actions.filter((action) => safeTutorRoute(action.route));
};

/** Model actions first (validated), then context actions, without repeating a route; at most `max`. */
export const mergeActions = (fromModel: TutorAction[], fromContext: TutorAction[], max = 3): TutorAction[] => {
  const seen = new Set<string>();
  const out: TutorAction[] = [];
  for (const action of [...fromModel, ...fromContext]) {
    const route = safeTutorRoute(action.route);
    if (!route || seen.has(route)) continue;
    seen.add(route);
    out.push({ ...action, route });
    if (out.length >= max) break;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Chat turn
// ---------------------------------------------------------------------------

const MEMORY_KINDS = ["goal", "preference", "struggle", "win", "context", "deadline"];

export const TUTOR_SYSTEM_PROMPT = [
  "You are a warm, concise English tutor for a learner in Uzbekistan (first language usually Uzbek or Russian).",
  "LEARNER is a compact profile built from their real activity: levels per skill, goal, top mistakes (with their own example), words due, class work.",
  "SUMMARY is your own short summary of this conversation so far; RECENT are the last messages.",
  "Personalise: when a question touches a top mistake, mention it kindly with a short example; use their practise words in examples; never invent progress.",
  "Reply in the language the learner wrote in (default English), in 1-3 short paragraphs, at their level.",
  "If they want to practise a grammar point, set lesson_topic to one of the topic keys given in TOPICS; otherwise null.",
  "Suggest up to 2 next actions only as in-app routes like /review, /writing, /grammar/<lesson-slug>, /immersion.",
  "Propose up to 2 NEW long-term memories only when the learner states a goal, deadline, preference, struggle or win (second person, one sentence).",
  "Update summary: at most 400 characters, what the learner wants and what you covered; it replaces SUMMARY.",
  'Return strict JSON only: {"reply": string, "summary": string, "lesson_topic": string|null,',
  '"suggested_actions": [{"label": string (3-5 words), "route": string, "why": string}],',
  '"suggested_memories": [{"kind": "goal"|"preference"|"struggle"|"win"|"context"|"deadline", "text": string}]}.',
].join(" ");

export const buildTutorChatRequest = (input: {
  context: TutorContext;
  summary: string;
  messages: TutorMessage[];
}): { systemPrompt: string; userPayload: string; temperature: number } => ({
  systemPrompt: TUTOR_SYSTEM_PROMPT,
  userPayload: JSON.stringify({
    LEARNER: fitContext(input.context),
    SUMMARY: clean(input.summary, TUTOR_LIMITS.summaryChars),
    RECENT: fitMessages(input.messages),
    TOPICS: GRAMMAR_TOPICS,
  }),
  temperature: 0.5,
});

export type TutorReply = {
  reply: string;
  summary: string;
  lesson_topic: string | null;
  actions: TutorAction[];
  memories: Array<{ kind: string; text: string }>;
};

/** Safe reply from the model's JSON; null when there is no usable reply text. */
export const normalizeTutorReply = (raw: unknown, previousSummary = ""): TutorReply | null => {
  const rec = record(raw);
  const reply = clean(rec.reply, 3000);
  if (!reply) return null;
  const actions = (Array.isArray(rec.suggested_actions) ? rec.suggested_actions : [])
    .map((entry) => record(entry))
    .map((entry): TutorAction | null => {
      const route = safeTutorRoute(entry.route);
      const label = clean(entry.label, 60);
      return route && label ? { kind: "ai", route, label, why: clean(entry.why, 160) || null } : null;
    })
    .filter((entry): entry is TutorAction => entry !== null)
    .slice(0, 2);
  const memories = (Array.isArray(rec.suggested_memories) ? rec.suggested_memories : [])
    .map((entry) => record(entry))
    .map((entry) => ({
      kind: MEMORY_KINDS.includes(String(entry.kind ?? "").toLowerCase()) ? String(entry.kind).toLowerCase() : "context",
      text: clean(entry.text, 240),
    }))
    .filter((entry) => entry.text)
    .slice(0, 2);
  const summary = clean(rec.summary, TUTOR_LIMITS.summaryChars) || clean(previousSummary, TUTOR_LIMITS.summaryChars);
  return {
    reply,
    summary,
    lesson_topic: isGrammarTopic(rec.lesson_topic) ? rec.lesson_topic : null,
    actions,
    memories,
  };
};

/** Thread title from the first learner message. */
export const threadTitle = (firstMessage: string): string => clean(firstMessage.replace(/\s+/g, " "), 60) || "Conversation";

// ---------------------------------------------------------------------------
// Mini-lessons
// ---------------------------------------------------------------------------

export type LessonItemType = "fill" | "fix" | "choose";

export type LessonItem = {
  id: string;
  type: LessonItemType;
  prompt: string;
  options: string[];
  answer: string;
  accept: string[];
  why: string;
};

export type Lesson = {
  topic: string;
  level: string;
  title: string;
  explain: string;
  example: { wrong: string; right: string } | null;
  items: LessonItem[];
  check: LessonItem;
};

export type PublicLessonItem = {
  id: string;
  type: LessonItemType;
  prompt: string;
  options: string[];
  result: { correct: boolean; expected: string; why: string; given: string } | null;
};

export type PublicLesson = {
  topic: string;
  level: string;
  title: string;
  explain: string;
  example: { wrong: string; right: string } | null;
  items: PublicLessonItem[];
  check: PublicLessonItem;
  progress: { answered: number; correct: number; total: number; done: boolean };
};

export type LessonAnswers = Record<string, { given: string; correct: boolean }>;

export const LESSON_SYSTEM_PROMPT = [
  "You write a tiny English grammar lesson for one learner: explain, practise 3 items, then 1 check question.",
  "Level: the given CEFR level; use plain English the learner can read. topic is a grammar point key.",
  "explain: at most 70 words, the rule and when to use it, with a mention of the typical mistake Uzbek or Russian speakers make.",
  "example: one wrong sentence and its correct version showing that typical mistake.",
  'items: exactly 3, mixed types. "fill": prompt is a sentence with ___ for ONE missing word or short phrase.',
  '"fix": prompt is a short sentence with one mistake; answer is the whole corrected sentence.',
  '"choose": 3 options, answer copied exactly from options.',
  "accept: other correct answers (contractions, synonyms), may be empty. why: one sentence, at most 18 words.",
  "check: one more item (any type) a little harder than the items, testing the same rule.",
  'Return strict JSON only: {"title": string, "explain": string, "example": {"wrong": string, "right": string},',
  '"items": [{"type": "fill"|"fix"|"choose", "prompt": string, "options": [string], "answer": string, "accept": [string], "why": string}],',
  '"check": {"type": ..., "prompt": string, "options": [string], "answer": string, "accept": [string], "why": string}}.',
].join(" ");

export const buildLessonRequest = (input: { topic: string; level: string; learnerExample: string | null }): { systemPrompt: string; userPayload: string; temperature: number } => ({
  systemPrompt: LESSON_SYSTEM_PROMPT,
  userPayload: JSON.stringify({ topic: input.topic, level: input.level, learner_mistake: input.learnerExample }),
  temperature: 0.3,
});

/** Lenient answer form: case, spacing, curly quotes and final punctuation do not matter. */
export const normalizeAnswer = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/^[\s"']+|[\s.!?"']+$/g, "")
    .trim();

const parseItem = (raw: unknown, id: string): LessonItem | null => {
  const rec = record(raw);
  const typeRaw = String(rec.type ?? "").toLowerCase();
  const type: LessonItemType | null = typeRaw === "fill" || typeRaw === "fix" || typeRaw === "choose" ? typeRaw : null;
  const prompt = clean(rec.prompt, 220);
  const answer = clean(rec.answer, 160);
  if (!type || !prompt || !answer) return null;
  const options = (Array.isArray(rec.options) ? rec.options : []).map((option) => clean(option, 80)).filter(Boolean);
  const uniqueOptions = [...new Set(options)].slice(0, 4);
  if (type === "choose") {
    if (uniqueOptions.length < 2 || !uniqueOptions.some((option) => normalizeAnswer(option) === normalizeAnswer(answer))) return null;
  }
  if (type === "fill" && !/_{2,}/.test(prompt)) return null;
  if (type === "fix" && normalizeAnswer(prompt) === normalizeAnswer(answer)) return null;
  const accept = (Array.isArray(rec.accept) ? rec.accept : []).map((entry) => clean(entry, 160)).filter(Boolean).slice(0, 4);
  return { id, type, prompt, options: type === "choose" ? uniqueOptions : [], answer, accept, why: clean(rec.why, 160) };
};

/** A usable lesson from the model's JSON (3 valid items and a valid check), or null. */
export const normalizeLesson = (raw: unknown, topic: string, lessonLevel: string): Lesson | null => {
  const rec = record(raw);
  const title = clean(rec.title, 80);
  const explain = clean(rec.explain, 600);
  if (!title || !explain) return null;
  const items = (Array.isArray(rec.items) ? rec.items : [])
    .map((entry, index) => parseItem(entry, `i${index + 1}`))
    .filter((entry): entry is LessonItem => entry !== null)
    .slice(0, 3);
  const check = parseItem(rec.check, "check");
  if (items.length < 3 || !check) return null;
  const example = record(rec.example);
  const wrong = clean(example.wrong, 160);
  const right = clean(example.right, 160);
  return {
    topic,
    level: level(lessonLevel) ?? "B1",
    title,
    explain,
    example: wrong && right && wrong !== right ? { wrong, right } : null,
    items,
    check,
  };
};

/** Whether an answer is right. A choose item accepts the option text or its index. */
export const checkLessonAnswer = (item: LessonItem, given: unknown): { correct: boolean; expected: string; given: string } => {
  let text = String(given ?? "");
  if (item.type === "choose" && /^\d+$/.test(text.trim())) text = item.options[Number(text.trim())] ?? text;
  const answer = normalizeAnswer(text);
  const accepted = [item.answer, ...item.accept].map(normalizeAnswer);
  return { correct: answer.length > 0 && accepted.includes(answer), expected: item.answer, given: clean(text, 200) };
};

export const lessonItemById = (lesson: Lesson, id: string): LessonItem | null =>
  id === "check" ? lesson.check : lesson.items.find((item) => item.id === id) ?? null;

export const lessonProgress = (lesson: Lesson, answers: LessonAnswers): PublicLesson["progress"] => {
  const ids = [...lesson.items.map((item) => item.id), "check"];
  const answered = ids.filter((id) => answers[id]).length;
  return { answered, correct: ids.filter((id) => answers[id]?.correct).length, total: ids.length, done: answered === ids.length };
};

/** The lesson as the learner sees it: answers stay hidden until each item is answered. */
export const publicLesson = (lesson: Lesson, answers: LessonAnswers = {}): PublicLesson => {
  const show = (item: LessonItem): PublicLessonItem => {
    const answer = answers[item.id];
    return {
      id: item.id,
      type: item.type,
      prompt: item.prompt,
      options: item.options,
      result: answer ? { correct: answer.correct, expected: item.answer, why: item.why, given: answer.given } : null,
    };
  };
  return {
    topic: lesson.topic,
    level: lesson.level,
    title: lesson.title,
    explain: lesson.explain,
    example: lesson.example,
    items: lesson.items.map(show),
    check: show(lesson.check),
    progress: lessonProgress(lesson, answers),
  };
};

/** The topic for a lesson request: a known grammar topic, or the learner's top mistake topic. */
export const lessonTopicFor = (requested: unknown, context: TutorContext): string | null => {
  if (isGrammarTopic(requested)) return requested;
  const top = context.mistakes.find((entry) => isGrammarTopic(entry.topic));
  return top ? top.topic : null;
};
