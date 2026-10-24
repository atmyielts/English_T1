// National exam track (hub /exam): practice papers in the style of
// Uzbekistan's Multilevel English exam, their auto-scoring, the AI marking
// requests for writing and speaking, mock limits and the days-to-exam plan.
// Pure functions only; hub/exam.ts loads and stores rows.
//
// Papers live in public.english_exam_papers (seeded from
// supabase/content/english/exam/*.json). Answer keys never leave the server:
// publicSection() strips them before a section is sent to the learner.

import {
  EXAM_SECTIONS,
  type ExamLevel,
  type ExamSection,
  examLevelFor,
  examOverall,
  isExamSection,
  objectiveScore,
  SECTION_SECONDS,
  speakingScore,
  writingScore,
} from "./english-exam-format.ts";
import { grammarTopicFor, isGrammarTopic, topicSubskill } from "./english-mistakes.ts";
import { matchL1Notes } from "./english-l1-notes.ts";

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec => !!value && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "");

export const PAPER_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const PAPER_LEVELS = ["B1", "B2", "C1"] as const;
export type PaperLevel = (typeof PAPER_LEVELS)[number];

// --- Paper shape -------------------------------------------------------------------

export type Choice = { id: string; text: string };
export type McqQuestion = { id: string; prompt: string; options: Choice[]; answer: string };

export type ReadingPart =
  | { id: string; type: "gap_fill"; level: PaperLevel; title: string; text: string; answers: Record<string, string> }
  | { id: string; type: "mcq"; level: PaperLevel; title: string; text: string; questions: McqQuestion[] }
  | { id: string; type: "headings"; level: PaperLevel; title: string; headings: Choice[]; paragraphs: Array<{ id: string; text: string; answer: string }> };

export type ListeningPart =
  | { id: string; type: "dialogues"; level: PaperLevel; title: string; items: Array<McqQuestion & { script: string }> }
  | { id: string; type: "notes"; level: PaperLevel; title: string; script: string; notes: Array<{ id: string; before: string; after: string; answers: string[] }> }
  | { id: string; type: "mcq"; level: PaperLevel; title: string; script: string; questions: McqQuestion[] };

export type WritingPaper = {
  input: { from: string; subject: string; body: string };
  task11: string;
  task12: string;
  part2: string;
};

export type SpeakingPaper = {
  part11: string[];
  part12: { scene: string; questions: string[] };
  part2: { scene: string; questions: string[] };
  part3: { statement: string; for: string[]; against: string[] };
};

export type ExamPaper = {
  id: string;
  title: string;
  level_focus: PaperLevel;
  reading: { parts: ReadingPart[] };
  listening: { parts: ListeningPart[] };
  writing: WritingPaper;
  speaking: SpeakingPaper;
};

export type PaperProblem = { field: string; message: string };

/** Items marked in a gap-fill text as {{1}} … {{6}}. */
const GAP = /\{\{(\d{1,2})\}\}/g;
const gapIds = (value: string): string[] => [...value.matchAll(GAP)].map((match) => match[1]!);

const readChoices = (value: unknown, field: string, problems: PaperProblem[]): Choice[] => {
  const list = Array.isArray(value) ? value : [];
  const choices = list.filter(isRec).map((entry) => ({ id: str(entry.id, 8), text: str(entry.text, 400) }));
  if (choices.length < 2 || choices.some((choice) => !choice.id || !choice.text)) problems.push({ field, message: "needs at least two options with id and text" });
  if (new Set(choices.map((choice) => choice.id)).size !== choices.length) problems.push({ field, message: "option ids must be unique" });
  return choices;
};

const readMcq = (value: unknown, field: string, problems: PaperProblem[], withScript = false): Array<McqQuestion & { script: string }> =>
  (Array.isArray(value) ? value : []).filter(isRec).map((entry, index) => {
    const at = `${field}[${index}]`;
    const question = {
      id: str(entry.id, 16),
      prompt: str(entry.prompt, 400),
      options: readChoices(entry.options, `${at}.options`, problems),
      answer: str(entry.answer, 8),
      script: withScript ? text(entry.script, 2000) : "",
    };
    if (!question.id || !question.prompt) problems.push({ field: at, message: "needs id and prompt" });
    if (!question.options.some((option) => option.id === question.answer)) problems.push({ field: at, message: "answer must be one of the option ids" });
    if (withScript && !question.script) problems.push({ field: at, message: "needs a script" });
    return question;
  });

const readLevel = (value: unknown, field: string, problems: PaperProblem[]): PaperLevel => {
  if ((PAPER_LEVELS as readonly string[]).includes(String(value))) return value as PaperLevel;
  problems.push({ field, message: "level must be B1, B2 or C1" });
  return "B1";
};

const readReadingPart = (raw: Rec, field: string, problems: PaperProblem[]): ReadingPart | null => {
  const id = str(raw.id, 16);
  const level = readLevel(raw.level, `${field}.level`, problems);
  const title = str(raw.title, 200);
  if (!id || !title) problems.push({ field, message: "needs id and title" });
  if (raw.type === "gap_fill") {
    const body = text(raw.text, 4000);
    const answers = isRec(raw.answers) ? Object.fromEntries(Object.entries(raw.answers).map(([key, value]) => [key, str(value, 40).toLowerCase()])) : {};
    const ids = gapIds(body);
    if (ids.length < 4) problems.push({ field, message: "a gap fill needs at least 4 gaps marked {{n}}" });
    if (ids.some((gap) => !answers[gap]) || Object.keys(answers).some((key) => !ids.includes(key))) problems.push({ field, message: "every gap needs exactly one answer" });
    // Intra-text gap fill: each missing word appears elsewhere in the text.
    const visible = ` ${body.replace(GAP, " ").toLowerCase().replace(/[^a-z'\s-]+/g, " ")} `;
    for (const gap of ids) {
      const word = answers[gap];
      if (word && !visible.includes(` ${word} `)) problems.push({ field: `${field}.answers.${gap}`, message: `"${word}" must appear elsewhere in the text` });
    }
    return { id, type: "gap_fill", level, title, text: body, answers };
  }
  if (raw.type === "mcq") {
    const body = text(raw.text, 6000);
    if (!body) problems.push({ field, message: "needs a text" });
    const questions = readMcq(raw.questions, `${field}.questions`, problems).map(({ script: _script, ...question }) => question);
    if (questions.length < 4) problems.push({ field, message: "needs at least 4 questions" });
    return { id, type: "mcq", level, title, text: body, questions };
  }
  if (raw.type === "headings") {
    const headings = readChoices(raw.headings, `${field}.headings`, problems);
    const paragraphs = (Array.isArray(raw.paragraphs) ? raw.paragraphs : []).filter(isRec).map((entry) => ({ id: str(entry.id, 16), text: text(entry.text, 1500), answer: str(entry.answer, 8) }));
    if (paragraphs.length < 4) problems.push({ field, message: "needs at least 4 paragraphs" });
    if (headings.length <= paragraphs.length) problems.push({ field, message: "needs more headings than paragraphs" });
    for (const paragraph of paragraphs) {
      if (!paragraph.id || !paragraph.text) problems.push({ field, message: "every paragraph needs id and text" });
      if (!headings.some((heading) => heading.id === paragraph.answer)) problems.push({ field: `${field}.${paragraph.id}`, message: "answer must be a heading id" });
    }
    if (new Set(paragraphs.map((paragraph) => paragraph.answer)).size !== paragraphs.length) problems.push({ field, message: "each heading fits one paragraph only" });
    return { id, type: "headings", level, title, headings, paragraphs };
  }
  problems.push({ field, message: "type must be gap_fill, mcq or headings" });
  return null;
};

const readListeningPart = (raw: Rec, field: string, problems: PaperProblem[]): ListeningPart | null => {
  const id = str(raw.id, 16);
  const level = readLevel(raw.level, `${field}.level`, problems);
  const title = str(raw.title, 200);
  if (!id || !title) problems.push({ field, message: "needs id and title" });
  if (raw.type === "dialogues") {
    const items = readMcq(raw.items, `${field}.items`, problems, true);
    if (items.length < 4) problems.push({ field, message: "needs at least 4 dialogues" });
    return { id, type: "dialogues", level, title, items };
  }
  const script = text(raw.script, 8000);
  if (!script) problems.push({ field, message: "needs a script" });
  if (raw.type === "notes") {
    const notes = (Array.isArray(raw.notes) ? raw.notes : []).filter(isRec).map((entry) => ({
      id: str(entry.id, 16),
      before: str(entry.before, 200),
      after: str(entry.after, 200),
      answers: (Array.isArray(entry.answers) ? entry.answers : []).map((answer) => str(answer, 40).toLowerCase()).filter(Boolean),
    }));
    if (notes.length < 4) problems.push({ field, message: "needs at least 4 notes" });
    const heard = normalizeAnswer(script);
    for (const note of notes) {
      if (!note.id || !note.answers.length) problems.push({ field, message: "every note needs id and answers" });
      if (note.answers[0] && !heard.includes(normalizeAnswer(note.answers[0]))) problems.push({ field: `${field}.${note.id}`, message: `"${note.answers[0]}" must be said in the script` });
    }
    return { id, type: "notes", level, title, script, notes };
  }
  if (raw.type === "mcq") {
    const questions = readMcq(raw.questions, `${field}.questions`, problems).map(({ script: _script, ...question }) => question);
    if (questions.length < 4) problems.push({ field, message: "needs at least 4 questions" });
    return { id, type: "mcq", level, title, script, questions };
  }
  problems.push({ field, message: "type must be dialogues, notes or mcq" });
  return null;
};

const strings = (value: unknown, max: number): string[] => (Array.isArray(value) ? value : []).map((entry) => str(entry, max)).filter(Boolean);

/** Validates an authored paper. Used by the seed builder, its test and the hub when loading rows. */
export const validatePaper = (raw: unknown): { ok: true; paper: ExamPaper } | { ok: false; problems: PaperProblem[] } => {
  const problems: PaperProblem[] = [];
  if (!isRec(raw)) return { ok: false, problems: [{ field: "paper", message: "must be an object" }] };
  const id = str(raw.id, 64);
  if (!PAPER_ID.test(id)) problems.push({ field: "id", message: "lowercase letters, digits and dashes" });
  const title = str(raw.title, 200);
  if (!title) problems.push({ field: "title", message: "required" });
  const levelFocus = readLevel(raw.level_focus, "level_focus", problems);

  const readingRaw = isRec(raw.reading) && Array.isArray(raw.reading.parts) ? raw.reading.parts : [];
  const reading = readingRaw.filter(isRec).map((part, index) => readReadingPart(part, `reading.parts[${index}]`, problems)).filter((part): part is ReadingPart => part !== null);
  const listeningRaw = isRec(raw.listening) && Array.isArray(raw.listening.parts) ? raw.listening.parts : [];
  const listening = listeningRaw.filter(isRec).map((part, index) => readListeningPart(part, `listening.parts[${index}]`, problems)).filter((part): part is ListeningPart => part !== null);
  if (reading.length < 3) problems.push({ field: "reading", message: "needs at least 3 parts" });
  if (listening.length < 3) problems.push({ field: "listening", message: "needs at least 3 parts" });
  const itemIds = [...reading.flatMap(partItemIds), ...listening.flatMap(partItemIds)];
  if (new Set(itemIds).size !== itemIds.length) problems.push({ field: "items", message: "item ids must be unique within a paper" });

  const w = isRec(raw.writing) ? raw.writing : {};
  const input = isRec(w.input) ? w.input : {};
  const writing: WritingPaper = {
    input: { from: str(input.from, 120), subject: str(input.subject, 160), body: text(input.body, 1200) },
    task11: str(w.task11, 400),
    task12: str(w.task12, 400),
    part2: text(w.part2, 600),
  };
  const inputWords = countWords(writing.input.body);
  if (inputWords < 40 || inputWords > 110) problems.push({ field: "writing.input.body", message: `the input email should be about 50-80 words (has ${inputWords})` });
  if (!writing.input.from || !writing.input.subject || !writing.task11 || !writing.task12 || !writing.part2) problems.push({ field: "writing", message: "needs input from/subject/body, task11, task12 and part2" });

  const s = isRec(raw.speaking) ? raw.speaking : {};
  const p12 = isRec(s.part12) ? s.part12 : {};
  const p2 = isRec(s.part2) ? s.part2 : {};
  const p3 = isRec(s.part3) ? s.part3 : {};
  const speaking: SpeakingPaper = {
    part11: strings(s.part11, 240),
    part12: { scene: str(p12.scene, 600), questions: strings(p12.questions, 240) },
    part2: { scene: str(p2.scene, 600), questions: strings(p2.questions, 240) },
    part3: { statement: str(p3.statement, 240), for: strings(p3.for, 240), against: strings(p3.against, 240) },
  };
  if (speaking.part11.length !== 3) problems.push({ field: "speaking.part11", message: "needs exactly 3 questions" });
  if (!speaking.part12.scene || speaking.part12.questions.length !== 3) problems.push({ field: "speaking.part12", message: "needs a scene and exactly 3 questions" });
  if (!speaking.part2.scene || speaking.part2.questions.length !== 3) problems.push({ field: "speaking.part2", message: "needs a scene and exactly 3 questions" });
  if (!speaking.part3.statement || speaking.part3.for.length < 2 || speaking.part3.against.length < 2) problems.push({ field: "speaking.part3", message: "needs a statement and at least 2 points for and against" });

  if (problems.length) return { ok: false, problems };
  return { ok: true, paper: { id, title, level_focus: levelFocus, reading: { parts: reading }, listening: { parts: listening }, writing, speaking } };
};

// --- Items and answers -------------------------------------------------------------

export const partItemIds = (part: ReadingPart | ListeningPart): string[] => {
  switch (part.type) {
    case "gap_fill": return gapIds(part.text).map((gap) => `${part.id}.${gap}`);
    case "mcq": return part.questions.map((question) => `${part.id}.${question.id}`);
    case "headings": return part.paragraphs.map((paragraph) => `${part.id}.${paragraph.id}`);
    case "dialogues": return part.items.map((item) => `${part.id}.${item.id}`);
    case "notes": return part.notes.map((note) => `${part.id}.${note.id}`);
  }
};

export const normalizeAnswer = (value: string): string =>
  value.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\s-]+/g, " ").replace(/\s+/g, " ").trim();

/** Is `given` right for this item? Choice ids compare exactly; written answers ignore case and punctuation. */
const isCorrect = (part: ReadingPart | ListeningPart, itemId: string, given: string): boolean => {
  const answer = normalizeAnswer(given);
  if (!answer) return false;
  switch (part.type) {
    case "gap_fill": return answer === normalizeAnswer(part.answers[itemId] ?? "");
    case "mcq": return part.questions.find((question) => question.id === itemId)?.answer.toLowerCase() === answer;
    case "headings": return part.paragraphs.find((paragraph) => paragraph.id === itemId)?.answer.toLowerCase() === answer;
    case "dialogues": return part.items.find((item) => item.id === itemId)?.answer.toLowerCase() === answer;
    case "notes": return (part.notes.find((note) => note.id === itemId)?.answers ?? []).some((option) => normalizeAnswer(option) === answer);
  }
};

const correctText = (part: ReadingPart | ListeningPart, itemId: string): string => {
  switch (part.type) {
    case "gap_fill": return part.answers[itemId] ?? "";
    case "mcq": return part.questions.find((question) => question.id === itemId)?.answer ?? "";
    case "headings": return part.paragraphs.find((paragraph) => paragraph.id === itemId)?.answer ?? "";
    case "dialogues": return part.items.find((item) => item.id === itemId)?.answer ?? "";
    case "notes": return part.notes.find((note) => note.id === itemId)?.answers[0] ?? "";
  }
};

/** Learner answers for an objective section: { "<part>.<item>": "B" | "word" }, bounded. */
export const parseObjectiveAnswers = (value: unknown, parts: Array<ReadingPart | ListeningPart>): Record<string, string> => {
  const raw = isRec(value) ? value : {};
  const out: Record<string, string> = {};
  for (const part of parts) {
    for (const key of partItemIds(part)) out[key] = str(raw[key], 60);
  }
  return out;
};

export type PartResult = { id: string; type: string; level: PaperLevel; correct: number; total: number };
export type ItemReview = { id: string; given: string; correct: string; ok: boolean };

export type ObjectiveResult = {
  correct: number;
  total: number;
  parts: PartResult[];
  items: ItemReview[];
};

export const scoreObjective = (parts: Array<ReadingPart | ListeningPart>, answers: Record<string, string>): ObjectiveResult => {
  const partResults: PartResult[] = [];
  const items: ItemReview[] = [];
  for (const part of parts) {
    let correct = 0;
    const ids = partItemIds(part);
    for (const key of ids) {
      const itemId = key.slice(part.id.length + 1);
      const given = answers[key] ?? "";
      const ok = isCorrect(part, itemId, given);
      if (ok) correct += 1;
      items.push({ id: key, given, correct: correctText(part, itemId), ok });
    }
    partResults.push({ id: part.id, type: part.type, level: part.level, correct, total: ids.length });
  }
  return {
    correct: partResults.reduce((sum, part) => sum + part.correct, 0),
    total: partResults.reduce((sum, part) => sum + part.total, 0),
    parts: partResults,
    items,
  };
};

// --- Public (answer-free) views ------------------------------------------------------

const publicMcq = (question: McqQuestion) => ({ id: question.id, prompt: question.prompt, options: question.options });

export const publicReading = (paper: ExamPaper) => ({
  parts: paper.reading.parts.map((part) => {
    if (part.type === "gap_fill") return { id: part.id, type: part.type, level: part.level, title: part.title, text: part.text, gaps: gapIds(part.text) };
    if (part.type === "mcq") return { id: part.id, type: part.type, level: part.level, title: part.title, text: part.text, questions: part.questions.map(publicMcq) };
    return { id: part.id, type: part.type, level: part.level, title: part.title, headings: part.headings, paragraphs: part.paragraphs.map(({ id, text }) => ({ id, text })) };
  }),
});

/** Scripts are sent so the browser can read them aloud; the page shows them only after submitting. */
export const publicListening = (paper: ExamPaper) => ({
  parts: paper.listening.parts.map((part) => {
    if (part.type === "dialogues") return { id: part.id, type: part.type, level: part.level, title: part.title, items: part.items.map((item) => ({ ...publicMcq(item), script: item.script })) };
    if (part.type === "notes") return { id: part.id, type: part.type, level: part.level, title: part.title, script: part.script, notes: part.notes.map(({ id, before, after }) => ({ id, before, after })) };
    return { id: part.id, type: part.type, level: part.level, title: part.title, script: part.script, questions: part.questions.map(publicMcq) };
  }),
});

export const publicSection = (paper: ExamPaper, section: ExamSection) => {
  switch (section) {
    case "reading": return publicReading(paper);
    case "listening": return publicListening(paper);
    case "writing": return paper.writing;
    case "speaking": return paper.speaking;
  }
};

// --- Mock kinds and limits ------------------------------------------------------------

export const MOCK_KINDS = ["full", ...EXAM_SECTIONS] as const;
export type MockKind = (typeof MOCK_KINDS)[number];
export const isMockKind = (value: unknown): value is MockKind => (MOCK_KINDS as readonly string[]).includes(String(value));
export const sectionsOf = (kind: MockKind): ExamSection[] => (kind === "full" ? [...EXAM_SECTIONS] : [kind]);

/** Free learners: one full mock per learner week and one section mock per learner day. */
export const EXAM_FREE_FULL_PER_WEEK = 1;
export const EXAM_FREE_SECTIONS_PER_DAY = 1;
/** Learners holding any English product (and admins). */
export const EXAM_OWNER_FULL_PER_DAY = 2;
export const EXAM_OWNER_SECTIONS_PER_DAY = 8;
/** An unfinished mock started within this time is resumed instead of starting another. */
export const EXAM_RESUME_MS = 4 * 3_600_000;
/** Extra time after a section's timer before the result is marked "over time". */
export const EXAM_GRACE_SECONDS = 120;

export type ExamAllowance = {
  allowed: boolean;
  basis: "owner" | "admin" | "free";
  /** Mocks of this kind left in the current window. */
  left: number;
  per: "day" | "week";
  limit: number;
};

export const decideExamStart = (input: {
  kind: MockKind;
  admin: boolean;
  holdsEnglish: boolean;
  fullToday: number;
  fullThisWeek: number;
  sectionsToday: number;
}): ExamAllowance => {
  const owner = input.admin || input.holdsEnglish;
  const basis = input.admin ? "admin" : owner ? "owner" : "free";
  if (input.kind === "full") {
    if (owner) {
      const left = Math.max(0, EXAM_OWNER_FULL_PER_DAY - input.fullToday);
      return { allowed: left > 0, basis, left, per: "day", limit: EXAM_OWNER_FULL_PER_DAY };
    }
    const left = Math.max(0, EXAM_FREE_FULL_PER_WEEK - input.fullThisWeek);
    return { allowed: left > 0, basis, left, per: "week", limit: EXAM_FREE_FULL_PER_WEEK };
  }
  const limit = owner ? EXAM_OWNER_SECTIONS_PER_DAY : EXAM_FREE_SECTIONS_PER_DAY;
  const left = Math.max(0, limit - input.sectionsToday);
  return { allowed: left > 0, basis, left, per: "day", limit };
};

/** A paper the learner has not had recently (the least recently used when all were). */
export const pickPaper = (paperIds: string[], recent: string[], rand: () => number): string | null => {
  if (!paperIds.length) return null;
  const fresh = paperIds.filter((id) => !recent.includes(id));
  if (fresh.length) return fresh[Math.floor(rand() * fresh.length)] ?? fresh[0]!;
  // recent is newest first: the paper seen longest ago comes back first.
  return [...paperIds].sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0]!;
};

/** Was the section handed in after its timer (plus grace)? */
export const isOvertime = (section: ExamSection, startedAt: string | null, now: Date = new Date()): boolean => {
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isFinite(started)) return false;
  return (now.getTime() - started) / 1000 > SECTION_SECONDS[section] + EXAM_GRACE_SECONDS;
};

// --- Writing ----------------------------------------------------------------------------

export const countWords = (value: string): number => (value.match(/[A-Za-z0-9’']+/g) ?? []).length;

export type WritingAnswers = { task11: string; task12: string; part2: string };
export const WRITING_TASKS = ["task11", "task12", "part2"] as const;
export type WritingTask = (typeof WRITING_TASKS)[number];
export const WRITING_TASK_MAX: Record<WritingTask, number> = { task11: 5, task12: 5, part2: 6 };

export const parseWritingAnswers = (value: unknown): WritingAnswers => {
  const raw = isRec(value) ? value : {};
  return { task11: text(raw.task11, 1500), task12: text(raw.task12, 3000), part2: text(raw.part2, 4000) };
};

/** Too little to mark at all (the AI is not asked). */
export const writingTooShort = (answers: WritingAnswers): boolean =>
  WRITING_TASKS.reduce((sum, task) => sum + countWords(answers[task]), 0) < 20;

/**
 * Highest band a response of this length can get, from the length notes in
 * the Agency's descriptors: Task 1.1 at half the length or less fits band 2;
 * Task 1.2 at 25-60 words band 2, 24 or fewer band 1; Part 2 at 38-90 words
 * band 2, 37 or fewer band 1. A blank (or a few words) scores 0.
 */
export const writingCap = (task: WritingTask, words: number): number => {
  if (words < 5) return 0;
  if (task === "task11") return words <= 25 ? 2 : 5;
  if (task === "task12") return words <= 24 ? 1 : words <= 60 ? 2 : 5;
  return words <= 37 ? 1 : words <= 90 ? 2 : 6;
};

export const buildWritingRequest = (paper: ExamPaper, answers: WritingAnswers) => ({
  systemPrompt:
    "You are a trained rater for Uzbekistan's national Multilevel English writing test (new format). Mark a practice attempt strictly with the official holistic scales. " +
    "Task 1.1: informal email to a friend, about 50 words, B1 task, 0-5 (3-4 = B1 performance, 5 = above B1). " +
    "Task 1.2: formal email, 120-150 words, B2 task, 0-5 (3-4 = B2, 5 = C1 or above). " +
    "Part 2: online post or article giving and supporting an opinion, 180-200 words, C1 task, 0-6 (5 = C1, 6 = above C1, 4 = higher B2, 3 = lower B2, 2 = B1, 1 = A2). " +
    "Judge: how fully the task requirements are covered (the three points in the input email), register/style, grammar range and accuracy, punctuation and spelling, vocabulary range, cohesion and paragraphing. " +
    "Off-topic, memorised or copied answers score 0 or 1. Whole numbers only. " +
    'Return strict JSON: {"task11": {"score": n, "comment": one short sentence}, "task12": {...}, "part2": {...}, ' +
    '"priorities": up to 3 [{"area": one of task|style|grammar|vocabulary|cohesion|spelling, "text": one concrete, simple instruction, "practice": one of writing|grammar|vocabulary}], ' +
    '"fixes": up to 3 [{"said": the learner\'s exact words with a real mistake, "better": corrected, "why": one short sentence}]}.',
  userPayload: JSON.stringify({
    input_email: paper.writing.input,
    task11: { instruction: paper.writing.task11, answer: answers.task11, words: countWords(answers.task11) },
    task12: { instruction: paper.writing.task12, answer: answers.task12, words: countWords(answers.task12) },
    part2: { prompt: paper.writing.part2, answer: answers.part2, words: countWords(answers.part2) },
  }),
  temperature: 0.2,
});

// --- Speaking ---------------------------------------------------------------------------

export const SPEAKING_GROUPS = ["q1_3", "q4_6", "q7", "q8"] as const;
export type SpeakingGroup = (typeof SPEAKING_GROUPS)[number];
export const SPEAKING_GROUP_MAX: Record<SpeakingGroup, number> = { q1_3: 5, q4_6: 5, q7: 5, q8: 6 };
/** Which of the eight answers belong to each group. */
const GROUP_ANSWERS: Record<SpeakingGroup, number[]> = { q1_3: [0, 1, 2], q4_6: [3, 4, 5], q7: [6], q8: [7] };

export type SpeakingAnswer = { text: string; mode: "speech" | "typed"; seconds: number | null; words: number };

export const parseSpeakingAnswers = (value: unknown): SpeakingAnswer[] => {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: 8 }, (_, index) => {
    const raw = isRec(list[index]) ? list[index] as Rec : {};
    const answer = text(raw.text, index >= 6 ? 3000 : 1200).replace(/\s+/g, " ");
    const mode = raw.mode === "speech" ? "speech" : "typed";
    const seconds = Number(raw.seconds);
    return {
      text: answer,
      mode,
      seconds: mode === "speech" && Number.isFinite(seconds) && seconds > 0 ? Math.min(300, Math.round(seconds)) : null,
      words: countWords(answer),
    };
  });
};

export const speakingTooShort = (answers: SpeakingAnswer[]): boolean => answers.reduce((sum, answer) => sum + answer.words, 0) < 25;

/** An answer counts as given when it has a few words. */
const answered = (answer: SpeakingAnswer | undefined): boolean => (answer?.words ?? 0) >= 3;

/**
 * Highest score a group can get from how many answers were given, following
 * the official scale: 4 needs all three answers on topic, 3 two of them, 1
 * one; Q7 and Q8 with no answer score 0.
 */
export const speakingCap = (group: SpeakingGroup, answers: SpeakingAnswer[]): number => {
  const given = GROUP_ANSWERS[group].filter((index) => answered(answers[index])).length;
  if (group === "q7" || group === "q8") return given ? SPEAKING_GROUP_MAX[group] : 0;
  return given === 0 ? 0 : given === 1 ? 1 : given === 2 ? 3 : 5;
};

export const speakingQuestions = (paper: ExamPaper): string[] => [
  ...paper.speaking.part11,
  ...paper.speaking.part12.questions,
  paper.speaking.part2.questions.join(" "),
  paper.speaking.part3.statement,
];

export const buildSpeakingRequest = (paper: ExamPaper, answers: SpeakingAnswer[]) => {
  const questions = speakingQuestions(paper);
  return {
    systemPrompt:
      "You are a trained examiner for Uzbekistan's national Multilevel English speaking test (2024 format). Mark a practice transcript with the official rating scale. " +
      "q1_3: three personal questions, 0-5 (4 = higher A2 with all three on topic, 5 = above A2). " +
      "q4_6: questions about two described pictures, 0-5 (4 = higher B1, 5 = above B1). " +
      "q7: abstract topic with three questions, 0-5 (4 = higher B2, 5 = above B2). " +
      "q8: balanced argument using points for and against, 0-6 (5 = C1, 6 = above C1, 4 = higher B2, 3 = only one side addressed). " +
      "Judge relevance (how many answers are on topic), grammar, vocabulary, fluency (pausing, false starts), cohesion, and pronunciation only from clues. " +
      "The transcript comes from browser speech recognition or typing, so do not penalise punctuation or capital letters. Memorised or off-topic answers score 0. Whole numbers only. " +
      'Return strict JSON: {"q1_3": {"score": n, "comment": one short sentence}, "q4_6": {...}, "q7": {...}, "q8": {...}, ' +
      '"priorities": up to 3 [{"area": one of relevance|grammar|vocabulary|fluency|cohesion, "text": one concrete, simple instruction, "practice": one of speaking|roleplay|grammar|vocabulary}], ' +
      '"fixes": up to 3 [{"said": the learner\'s exact words with a real mistake, "better": corrected, "why": one short sentence}]}.',
    userPayload: JSON.stringify({
      spoken: answers.some((answer) => answer.mode === "speech" && answer.words > 0),
      part1_2_scene: paper.speaking.part12.scene,
      part2_scene: paper.speaking.part2.scene,
      part3: paper.speaking.part3,
      answers: answers.map((answer, index) => ({ q: index + 1, question: questions[index] ?? "", a: answer.text, seconds: answer.seconds })),
    }),
    temperature: 0.2,
  };
};

// --- Marking output (writing and speaking) ----------------------------------------------

export const PRACTICE_TARGETS = ["writing", "speaking", "roleplay", "grammar", "vocabulary"] as const;
export type PracticeTarget = (typeof PRACTICE_TARGETS)[number];
const AREAS = ["task", "style", "grammar", "vocabulary", "cohesion", "spelling", "relevance", "fluency"] as const;
type Area = (typeof AREAS)[number];

export type MarkedPart = { score: number; max: number; comment: string | null };
export type MarkPriority = { area: Area; text: string; practice: PracticeTarget; topic: string | null };
export type MarkFix = { said: string; better: string; why: string; topic: string | null; l1: string | null };

export type MarkedSection = {
  parts: Record<string, MarkedPart>;
  raw: number;
  raw_max: number;
  priorities: MarkPriority[];
  fixes: MarkFix[];
};

/** Whole or half points within 0..max. */
const points = (value: unknown, max: number): number | null => {
  const number = Number(isRec(value) ? value.score : value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(max, Math.round(number * 2) / 2));
};

const parseMark = (
  raw: unknown,
  keys: readonly string[],
  maxOf: (key: string) => number,
  capOf: (key: string) => number,
  learnerText: string,
  defaultPractice: PracticeTarget,
): MarkedSection | null => {
  if (!isRec(raw)) return null;
  const parts: Record<string, MarkedPart> = {};
  for (const key of keys) {
    const score = points(raw[key], maxOf(key));
    if (score === null) return null;
    const comment = isRec(raw[key]) ? str((raw[key] as Rec).comment, 240) || null : null;
    parts[key] = { score: Math.min(score, capOf(key)), max: maxOf(key), comment };
  }
  const norm = normalizeAnswer(learnerText);
  const fixes: MarkFix[] = (Array.isArray(raw.fixes) ? raw.fixes : [])
    .filter(isRec)
    .map((entry) => ({ said: str(entry.said, 200), better: str(entry.better, 200), why: str(entry.why, 240) }))
    .filter((fix) => fix.said && fix.better && normalizeAnswer(fix.said) !== normalizeAnswer(fix.better) && norm.includes(normalizeAnswer(fix.said)))
    .slice(0, 3)
    .map((fix) => {
      const topic = grammarTopicFor({ original: fix.said, corrected: fix.better, explanation: fix.why });
      return { ...fix, topic, l1: matchL1Notes({ original: fix.said, corrected: fix.better, explanation: fix.why, topic })[0]?.id ?? null };
    });
  const grammarTopic = fixes.find((fix) => fix.topic)?.topic ?? null;
  const priorities: MarkPriority[] = (Array.isArray(raw.priorities) ? raw.priorities : [])
    .filter(isRec)
    .map((entry) => {
      const area = (AREAS as readonly string[]).includes(String(entry.area)) ? entry.area as Area : null;
      const instruction = str(entry.text, 240);
      if (!area || !instruction) return null;
      const practice = (PRACTICE_TARGETS as readonly string[]).includes(String(entry.practice))
        ? entry.practice as PracticeTarget
        : area === "grammar" ? "grammar" : area === "vocabulary" ? "vocabulary" : defaultPractice;
      return { area, text: instruction, practice, topic: practice === "grammar" ? grammarTopic : null };
    })
    .filter((entry): entry is MarkPriority => entry !== null)
    .slice(0, 3);
  const rawTotal = keys.reduce((sum, key) => sum + parts[key]!.score, 0);
  return { parts, raw: rawTotal, raw_max: keys.reduce((sum, key) => sum + maxOf(key), 0), priorities, fixes };
};

export const parseWritingMark = (raw: unknown, answers: WritingAnswers): MarkedSection | null =>
  parseMark(
    raw,
    WRITING_TASKS,
    (key) => WRITING_TASK_MAX[key as WritingTask],
    (key) => writingCap(key as WritingTask, countWords(answers[key as WritingTask])),
    WRITING_TASKS.map((task) => answers[task]).join(" "),
    "writing",
  );

export const parseSpeakingMark = (raw: unknown, answers: SpeakingAnswer[]): MarkedSection | null =>
  parseMark(
    raw,
    SPEAKING_GROUPS,
    (key) => SPEAKING_GROUP_MAX[key as SpeakingGroup],
    (key) => speakingCap(key as SpeakingGroup, answers),
    answers.map((answer) => answer.text).join(" "),
    "speaking",
  );

// --- Section and mock results -----------------------------------------------------------

export type SectionResult = {
  section: ExamSection;
  /** 0-75, an estimate. */
  score: number;
  level: ExamLevel;
  overtime: boolean;
  submitted_at: string;
  /** Listening and reading. */
  objective?: ObjectiveResult;
  /** Writing and speaking. */
  marked?: MarkedSection;
  /** Speaking: pronunciation cannot be judged from a transcript. */
  spoken?: boolean;
};

export const objectiveSection = (section: "reading" | "listening", result: ObjectiveResult, overtime: boolean, now: Date = new Date()): SectionResult => {
  const score = objectiveScore(result.correct, result.total);
  return { section, score, level: examLevelFor(score)!, overtime, submitted_at: now.toISOString(), objective: result };
};

export const markedSection = (section: "writing" | "speaking", marked: MarkedSection, overtime: boolean, extra: Partial<SectionResult> = {}, now: Date = new Date()): SectionResult => {
  const score = section === "writing" ? writingScore(marked.raw) : speakingScore(marked.raw);
  return { section, score, level: examLevelFor(score)!, overtime, submitted_at: now.toISOString(), marked, ...extra };
};

export type MockSummary = {
  scores: Partial<Record<ExamSection, number>>;
  overall: number | null;
  level: ExamLevel | null;
  /** The section with the lowest score (ties: the usual order). */
  weakest: ExamSection | null;
};

export const summarizeMock = (sections: Partial<Record<ExamSection, SectionResult>>): MockSummary => {
  const scores: Partial<Record<ExamSection, number>> = {};
  for (const section of EXAM_SECTIONS) {
    const result = sections[section];
    if (result) scores[section] = result.score;
  }
  const overall = examOverall(scores);
  const done = EXAM_SECTIONS.filter((section) => scores[section] !== undefined);
  const weakest = done.length ? done.reduce((low, section) => (scores[section]! < scores[low]! ? section : low), done[0]!) : null;
  return { scores, overall, level: examLevelFor(overall), weakest };
};

/** Reads a stored section result back (english_exam_mocks.sections[section].result). */
export const readSectionResult = (value: unknown): SectionResult | null => {
  if (!isRec(value) || !isExamSection(value.section) || typeof value.score !== "number") return null;
  return value as unknown as SectionResult;
};

/** Mistake rows for the shared mistake list (learner_language_errors). */
export const issuesFromMark = (section: "writing" | "speaking", marked: MarkedSection): Array<Record<string, unknown>> =>
  marked.fixes.map((fix) => ({
    category: "grammar",
    subskill_key: isGrammarTopic(fix.topic) ? topicSubskill(fix.topic) : `${section}.accuracy`,
    location_ref: `exam-${section}`,
    explanation: `"${fix.said}" → "${fix.better}"`.slice(0, 240),
    correction_hint: fix.why || fix.better,
    severity: 0.55,
  }));
