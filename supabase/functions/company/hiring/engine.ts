// The test engine: builds an attempt's sections from the bank, runs the staged
// adaptive grammar and vocabulary sections, picks reading and listening texts at
// the estimated level, and scores every objective skill 0–100. Pure functions
// (randomness is injected) so the same code runs in the function, tests and preview.
import { LEVEL_FLOORS, SKILLS, scoreToLevel, type JobRole, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import {
  BANK_LEVELS, CHOICES, GRAMMAR, LISTENING, PASSAGES, QUESTIONS, READING, SPEAKING, VOCABULARY, WRITING,
  type BankLevel, type ChoiceItem, type Passage, type ProductionTask,
} from './bank/index.ts';

export const STAGE_SIZE = 5;
export const ADAPTIVE_STAGES = 3;
export const START_LEVEL: BankLevel = 'b1';
/** Minutes after the deadline during which answers are still accepted (network, slow submit). */
export const GRACE_MS = 120_000;
export const SPEAKING_PROMPTS = 2;
export const MAX_TEXT = 6000;

export type Rng = () => number;
export const ADAPTIVE: readonly Skill[] = ['grammar', 'vocabulary'];
export const PASSAGE_SKILLS: readonly Skill[] = ['reading', 'listening'];
export const PRODUCTION: readonly Skill[] = ['writing', 'speaking'];

export interface ServedChoice { id: string; prompt: string; options: string[] }
export interface ServedPassage {
  id: string; level: BankLevel; genre: string; title: string;
  text?: string; lines?: { speaker: string; text: string }[];
  questions: ServedChoice[];
}
export interface ServedTask { id: string; level: BankLevel; prompt: string; points: string[]; target: number }
export interface Stage { level: BankLevel; items: ServedChoice[] }
export interface Section {
  skill: Skill;
  status: 'pending' | 'active' | 'done';
  started_at: string | null;
  finished_at: string | null;
  stages?: Stage[];
  passages?: ServedPassage[];
  tasks?: ServedTask[];
}
export interface SpokenAnswer { transcript: string; mode: 'speech' | 'typed' }
export type Answer = number | string | SpokenAnswer;
export type Answers = Record<string, Answer>;

export interface SkillResult {
  score: number;
  level: Level;
  /** How the score was reached: objective marking, AI rubric, HR's manual score, an empty answer or a section never reached. */
  source: 'auto' | 'ai' | 'manual' | 'empty' | 'skipped';
  correct?: number;
  total?: number;
  stages?: { level: BankLevel; correct: number; total: number }[];
  transcript_based?: boolean;
  by?: string | null;
  at?: string;
}
export type Results = Partial<Record<Skill, SkillResult>>;

export interface BuildOptions {
  jobRole: JobRole;
  rng: Rng;
  now: string;
  /** Level to aim reading/listening/writing at when grammar and vocabulary were not tested. */
  fallback: BankLevel;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
export const bankIndex = (level: BankLevel) => BANK_LEVELS.indexOf(level);
export const shiftLevel = (level: BankLevel, delta: number, min: BankLevel = 'a1', max: BankLevel = 'c2'): BankLevel =>
  BANK_LEVELS[Math.min(bankIndex(max), Math.max(bankIndex(min), bankIndex(level) + delta))];
/** A test-taker level as a bank level (the bank has no pre-A1 content). */
export const toBankLevel = (level: Level | null | undefined, fallback: BankLevel = START_LEVEL): BankLevel =>
  !level ? fallback : level === 'pre_a1' ? 'a1' : level as BankLevel;

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** Orders skills the way a test runs: objective sections first, then writing and speaking. */
export const orderSkills = (skills: readonly string[]): Skill[] => SKILLS.filter((skill) => skills.includes(skill));

const serveChoice = (item: { id: string; prompt: string; options: string[] }, rng: Rng): ServedChoice =>
  ({ id: item.id, prompt: item.prompt, options: shuffle(item.options, rng) });

const roleRank = (itemRole: JobRole, wanted: JobRole) => itemRole === wanted && wanted !== 'general' ? 0 : itemRole === 'general' ? 1 : itemRole === wanted ? 1 : 2;

/** Picks unused items nearest the level, preferring the job role, then general workplace items. */
export function pickChoices(skill: 'grammar' | 'vocabulary', level: BankLevel, jobRole: JobRole, used: Set<string>, rng: Rng, count = STAGE_SIZE): ChoiceItem[] {
  const pool = (skill === 'grammar' ? GRAMMAR : VOCABULARY).filter((item) => !used.has(item.id));
  const ranked = shuffle(pool, rng)
    .map((item, order) => ({ item, key: Math.abs(bankIndex(item.level) - bankIndex(level)) * 100 + roleRank(item.job_role, jobRole) * 10 + order / pool.length }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map(({ item }) => item);
  for (const item of ranked) used.add(item.id);
  return ranked;
}

/** Picks a text near `level`, preferring the job role and a genre not used yet. */
function pickPassage(list: readonly Passage[], level: BankLevel, jobRole: JobRole, used: Set<string>, genres: Set<string>, rng: Rng): Passage | null {
  const pool = list.filter((passage) => !used.has(passage.id));
  if (!pool.length) return null;
  const ranked = shuffle(pool, rng)
    .map((passage, order) => ({ passage, key: Math.abs(bankIndex(passage.level) - bankIndex(level)) * 100 + roleRank(passage.job_role, jobRole) * 10 + (genres.has(passage.genre) ? 5 : 0) + order / pool.length }))
    .sort((a, b) => a.key - b.key);
  const chosen = ranked[0].passage;
  used.add(chosen.id);
  genres.add(chosen.genre);
  return chosen;
}

const servePassage = (passage: Passage, rng: Rng): ServedPassage => ({
  id: passage.id, level: passage.level, genre: passage.genre, title: passage.title,
  ...(passage.skill === 'reading' ? { text: passage.text } : { lines: passage.lines.map((line) => ({ ...line })) }),
  questions: passage.questions.map((question) => serveChoice(question, rng)),
});

const serveTask = (task: ProductionTask): ServedTask => ({ id: task.id, level: task.level, prompt: task.prompt, points: [...task.points], target: task.target });

/** Production tasks for the job role nearest the level (general when the role has none). */
export function pickTasks(skill: 'writing' | 'speaking', level: BankLevel, jobRole: JobRole, count: number, rng: Rng): ProductionTask[] {
  const all = skill === 'writing' ? WRITING : SPEAKING;
  const own = all.filter((task) => task.job_role === jobRole);
  const pool = own.length ? own : all.filter((task) => task.job_role === 'general');
  return shuffle(pool, rng)
    .sort((a, b) => Math.abs(bankIndex(a.level) - bankIndex(level)) - Math.abs(bankIndex(b.level) - bankIndex(level)))
    .slice(0, count)
    .sort((a, b) => bankIndex(a.level) - bankIndex(b.level));
}

/** Every bank id an attempt has already been served. */
export function servedIds(sections: Section[]): Set<string> {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const stage of section.stages ?? []) for (const item of stage.items) ids.add(item.id);
    for (const passage of section.passages ?? []) ids.add(passage.id);
    for (const task of section.tasks ?? []) ids.add(task.id);
  }
  return ids;
}

/** The level to aim the next section at: the mean of the objective scores so far. */
export function estimateLevel(results: Results, fallback: BankLevel): BankLevel {
  const scores = (['grammar', 'vocabulary', 'reading', 'listening'] as Skill[])
    .map((skill) => results[skill])
    .filter((result): result is SkillResult => !!result && result.source === 'auto')
    .map((result) => result.score);
  if (!scores.length) return fallback;
  return toBankLevel(scoreToLevel(scores.reduce((sum, value) => sum + value, 0) / scores.length));
}

function build(section: Section, sections: Section[], results: Results, options: BuildOptions): Section {
  const used = servedIds(sections);
  const level = estimateLevel(results, options.fallback);
  const built: Section = { ...section, status: 'active', started_at: options.now };
  if (section.skill === 'grammar' || section.skill === 'vocabulary') {
    built.stages = [{ level: START_LEVEL, items: pickChoices(section.skill, START_LEVEL, options.jobRole, used, options.rng).map((item) => serveChoice(item, options.rng)) }];
  } else if (section.skill === 'reading' || section.skill === 'listening') {
    const list = section.skill === 'reading' ? READING : LISTENING;
    const high = shiftLevel(level, 0, 'a2', 'c1'), low = shiftLevel(level, -1, 'a2', 'c1');
    const genres = new Set<string>();
    built.passages = [low, high]
      .map((target) => pickPassage(list, target, options.jobRole, used, genres, options.rng))
      .filter((passage): passage is Passage => passage !== null)
      .sort((a, b) => bankIndex(a.level) - bankIndex(b.level))
      .map((passage) => servePassage(passage, options.rng));
  } else {
    const count = section.skill === 'writing' ? 1 : SPEAKING_PROMPTS;
    built.tasks = pickTasks(section.skill, level, options.jobRole, count, options.rng).map(serveTask);
  }
  return built;
}

/** A new attempt's sections: all pending, the first one built and active. */
export function createSections(skills: readonly string[], options: BuildOptions): Section[] {
  const sections: Section[] = orderSkills(skills).map((skill) => ({ skill, status: 'pending', started_at: null, finished_at: null }));
  if (sections.length) sections[0] = build(sections[0], sections, {}, options);
  return sections;
}

export const activeIndex = (sections: Section[]) => sections.findIndex((section) => section.status === 'active');

/** Ids the test taker may still change: the current stage, text questions or tasks of the active section. */
export function editableIds(section: Section | undefined): string[] {
  if (!section || section.status !== 'active') return [];
  if (section.stages) return section.stages[section.stages.length - 1].items.map((item) => item.id);
  if (section.passages) return section.passages.flatMap((passage) => passage.questions.map((question) => question.id));
  return (section.tasks ?? []).map((task) => task.id);
}

function optionCount(section: Section, id: string): number {
  for (const stage of section.stages ?? []) for (const item of stage.items) if (item.id === id) return item.options.length;
  for (const passage of section.passages ?? []) for (const question of passage.questions) if (question.id === id) return question.options.length;
  return 0;
}

/** Keeps only valid answers to the active section's editable ids. */
export function cleanAnswers(section: Section | undefined, input: unknown): Answers {
  if (!section || !input || typeof input !== 'object' || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>, out: Answers = {};
  for (const id of editableIds(section)) {
    const value = raw[id];
    if (value === undefined || value === null) continue;
    if (section.skill === 'writing') {
      if (typeof value === 'string') out[id] = value.slice(0, MAX_TEXT);
    } else if (section.skill === 'speaking') {
      const spoken = value as Partial<SpokenAnswer>;
      if (value && typeof value === 'object' && typeof spoken.transcript === 'string') out[id] = { transcript: spoken.transcript.slice(0, MAX_TEXT), mode: spoken.mode === 'speech' ? 'speech' : 'typed' };
    } else if (Number.isInteger(value) && (value as number) >= 0 && (value as number) < optionCount(section, id)) {
      out[id] = value as number;
    }
  }
  return out;
}

const correctOption = (id: string): string | null => {
  const choice = CHOICES.get(id);
  if (choice) return choice.options[choice.answer];
  const question = QUESTIONS.get(id)?.question;
  return question ? question.options[question.answer] : null;
};
export const isCorrect = (served: ServedChoice, answer: Answer | undefined): boolean =>
  typeof answer === 'number' && served.options[answer] !== undefined && served.options[answer] === correctOption(served.id);

const FLOOR: Record<Level, number> = Object.fromEntries(LEVEL_FLOORS.map(([level, floor]) => [level, floor])) as Record<Level, number>;
/**
 * What a share of correct answers on material at `level` says on the 0–100 scale:
 * nothing right puts you at the floor of the level below, everything right at the
 * floor of the level above.
 */
export function stageEstimate(level: BankLevel, share: number): number {
  const index = bankIndex(level);
  const below = index === 0 ? 0 : FLOOR[BANK_LEVELS[index - 1]];
  const above = index === BANK_LEVELS.length - 1 ? 100 : FLOOR[BANK_LEVELS[index + 1]];
  return below + Math.min(1, Math.max(0, share)) * (above - below);
}

/** The next stage moves up a level after 4–5 of 5, down after 0–2, and stays after 3. */
export function nextStageLevel(level: BankLevel, correct: number, total = STAGE_SIZE): BankLevel {
  const share = total ? correct / total : 0;
  return share >= 0.8 ? shiftLevel(level, 1) : share <= 0.4 ? shiftLevel(level, -1) : level;
}

/** Objective score of a finished section. Later adaptive stages count more (weights 1, 2, 3…). */
export function scoreSection(section: Section, answers: Answers): SkillResult | null {
  if (section.stages) {
    const stages = section.stages.map((stage) => ({ level: stage.level, correct: stage.items.filter((item) => isCorrect(item, answers[item.id])).length, total: stage.items.length }));
    let weighted = 0, weights = 0;
    stages.forEach((stage, index) => { weighted += (index + 1) * stageEstimate(stage.level, stage.total ? stage.correct / stage.total : 0); weights += index + 1; });
    const score = round1(weights ? weighted / weights : 0);
    return { score, level: scoreToLevel(score), source: 'auto', stages, correct: stages.reduce((sum, stage) => sum + stage.correct, 0), total: stages.reduce((sum, stage) => sum + stage.total, 0) };
  }
  if (section.passages) {
    const parts = section.passages.map((passage) => ({ level: passage.level, correct: passage.questions.filter((question) => isCorrect(question, answers[question.id])).length, total: passage.questions.length }));
    const top = Math.max(...parts.map((part) => bankIndex(part.level)));
    let weighted = 0, weights = 0;
    for (const part of parts) {
      const weight = bankIndex(part.level) === top && parts.some((other) => bankIndex(other.level) < top) ? 2 : 1;
      weighted += weight * stageEstimate(part.level, part.total ? part.correct / part.total : 0);
      weights += weight;
    }
    const score = round1(weights ? weighted / weights : 0);
    return { score, level: scoreToLevel(score), source: 'auto', stages: parts, correct: parts.reduce((sum, part) => sum + part.correct, 0), total: parts.reduce((sum, part) => sum + part.total, 0) };
  }
  return null;
}

/** Text of a production answer (writing text or speaking transcript). */
export const answerText = (answer: Answer | undefined): string =>
  typeof answer === 'string' ? answer : answer && typeof answer === 'object' ? answer.transcript : '';
export const wordCount = (text: string) => (text.trim().match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

/**
 * Moves the attempt on: the next adaptive stage, or closes the active section and
 * opens the next one. `finished` once no section is left.
 */
export function advance(sections: Section[], answers: Answers, results: Results, options: BuildOptions): { sections: Section[]; results: Results; finished: boolean } {
  const next = sections.map((section) => ({ ...section }));
  const out: Results = { ...results };
  const index = activeIndex(next);
  if (index < 0) return { sections: next, results: out, finished: true };
  const section = next[index];
  if (section.stages && section.stages.length < ADAPTIVE_STAGES) {
    const last = section.stages[section.stages.length - 1];
    const correct = last.items.filter((item) => isCorrect(item, answers[item.id])).length;
    const level = nextStageLevel(last.level, correct, last.items.length);
    const items = pickChoices(section.skill as 'grammar' | 'vocabulary', level, options.jobRole, servedIds(next), options.rng);
    if (items.length) {
      section.stages = [...section.stages, { level, items: items.map((item) => serveChoice(item, options.rng)) }];
      return { sections: next, results: out, finished: false };
    }
  }
  closeSection(section, answers, out, options.now);
  const following = next.findIndex((candidate, position) => position > index && candidate.status === 'pending');
  if (following < 0) return { sections: next, results: out, finished: true };
  next[following] = build(next[following], next, out, options);
  return { sections: next, results: out, finished: false };
}

function closeSection(section: Section, answers: Answers, results: Results, now: string) {
  section.status = 'done';
  section.finished_at = now;
  const scored = scoreSection(section, answers);
  if (scored) results[section.skill] = scored;
  else if (section.tasks && section.tasks.every((task) => wordCount(answerText(answers[task.id])) < 3)) {
    results[section.skill] = { score: 0, level: 'pre_a1', source: 'empty' };
  }
}

/** Ends the attempt: scores the active section and marks sections never reached as skipped (0). */
export function closeAll(sections: Section[], answers: Answers, results: Results, now: string): { sections: Section[]; results: Results } {
  const next = sections.map((section) => ({ ...section }));
  const out: Results = { ...results };
  for (const section of next) {
    if (section.status === 'active') closeSection(section, answers, out, now);
    else if (section.status === 'pending') {
      section.status = 'done';
      section.finished_at = now;
      out[section.skill] = { score: 0, level: 'pre_a1', source: 'skipped' };
    }
  }
  return { sections: next, results: out };
}

/** Skills still waiting for a writing/speaking grade. */
export const pendingSkills = (sections: Section[], results: Results): Skill[] =>
  sections.filter((section) => section.status === 'done' && !results[section.skill]).map((section) => section.skill);

/** The bank text or script behind a served passage (for grading prompts and HR review). */
export const passageOf = (id: string) => PASSAGES.get(id) ?? null;
