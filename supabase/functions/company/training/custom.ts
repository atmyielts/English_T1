// The company's own content: the shapes of company lessons, courses and scenarios,
// how HR's input is read, what must be true before something is published, and the
// lookups the learner routes share. Published content has the same shape as the
// built-in tracks, so the same player and the same server-side checking serve both.
// Codes: a company lesson is `co-<uuid>`, a course `c-<uuid>`, a scenario `cs-<uuid>`.
import { isLevel, type Level } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll } from '../people/shared.ts';
import { check, CompanyError, UUID, type Ctx } from '../types.ts';
import { inChunks } from '../util.ts';
import { aiList, aiText } from './shared.ts';
import { DIFFICULTIES, EXERCISE_KINDS, normalizeAnswer, type Difficulty, type DialogueLine, type Exercise, type Localized, type Phrase, type Scenario, type Word } from './content.ts';
import { findScenario, findTemplate } from './tracks/index.ts';

export const lessonCode = (id: string) => `co-${id}`;
export const courseCode = (id: string) => `c-${id}`;
export const scenarioCode = (id: string) => `cs-${id}`;
const idOf = (code: string, prefix: string) => code.startsWith(prefix) && UUID.test(code.slice(prefix.length)) ? code.slice(prefix.length) : null;
export const lessonIdOf = (code: string) => idOf(code, 'co-');
export const courseIdOf = (code: string) => idOf(code, 'c-');
export const scenarioIdOf = (code: string) => idOf(code, 'cs-');

export type CustomMission =
  | { kind: 'roleplay'; scenario: string; brief: Localized }
  | { kind: 'writing'; template: string | null; brief: Localized }
  | { kind: 'task'; brief: Localized };

/** What HR edits and what a published version freezes. */
export interface CustomLesson {
  title: Localized; goal: Localized; level: Level;
  phrases: Phrase[]; words: Word[];
  dialogue: { setting: Localized; lines: DialogueLine[] };
  exercises: Exercise[];
  mission: CustomMission | null;
}

export interface LessonRow {
  id: string; org_id: string; title: Localized; level: Level; draft: CustomLesson; published: CustomLesson | null;
  status: 'draft' | 'published' | 'archived'; revision: number; published_version: number; published_revision: number; published_at: string | null;
  source: 'manual' | 'ai'; approved_at: string | null; created_at: string; updated_at: string;
}
export const LESSON_COLUMNS = 'id,org_id,title,level,draft,published,status,revision,published_version,published_revision,published_at,source,approved_at,created_at,updated_at';
export const LESSON_LIST_COLUMNS = 'id,org_id,title,level,status,revision,published_version,published_revision,published_at,source,approved_at,created_at,updated_at';

export interface CourseSnapshot { title: Localized; summary: Localized; job_role: string | null; lesson_ids: string[] }
export interface CourseRow {
  id: string; org_id: string; title: Localized; summary: Localized; job_role: string | null; lesson_ids: string[];
  status: 'draft' | 'published' | 'archived'; revision: number; published_version: number; published_revision: number; published: CourseSnapshot | null; published_at: string | null;
  created_at: string; updated_at: string;
}
export const COURSE_COLUMNS = 'id,org_id,title,summary,job_role,lesson_ids,status,revision,published_version,published_revision,published,published_at,created_at,updated_at';

export interface ScenarioRow {
  id: string; org_id: string; title: Localized; goal: Localized; persona: string; learner_role: string; setting: string; opening: string;
  difficulty: Difficulty; checklist: string[]; status: 'draft' | 'published' | 'archived'; created_at: string; updated_at: string;
}
export const SCENARIO_COLUMNS = 'id,org_id,title,goal,persona,learner_role,setting,opening,difficulty,checklist,status,created_at,updated_at';

export const MAX = { phrases: 40, words: 40, lines: 40, exercises: 12, items: 12, options: 6, lessons: 500, courses: 100, scenarios: 200, courseLessons: 60, criteria: 6 };

/** Characters Postgres cannot store, as in util.ts; refused here so a field names itself. */
const UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Draft text: may be empty, must fit and must be storable. */
function str(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new CompanyError('invalid_field', `${field} must be text.`, 400, { field });
  if (UNSTORABLE.test(value)) throw new CompanyError('invalid_field', `${field} has characters that cannot be saved.`, 400, { field });
  const trimmed = value.trim();
  if (trimmed.length > max) throw new CompanyError('invalid_field', `${field} must be at most ${max} characters.`, 400, { field, max });
  return trimmed;
}
const list = (value: unknown, field: string, max: number): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new CompanyError('invalid_field', `${field} must be a list.`, 400, { field });
  if (value.length > max) throw new CompanyError('invalid_field', `${field} can have at most ${max} entries.`, 400, { field, max });
  return value;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function readLocalized(value: unknown, field: string, max: number): Localized {
  const raw = record(value);
  return { en: str(raw.en, `${field}.en`, max), ru: str(raw.ru, `${field}.ru`, max), uz: str(raw.uz, `${field}.uz`, max) };
}

function readPhrase(value: unknown, field: string): Word {
  const raw = record(value);
  const note = str(raw.note, `${field}.note`, 120);
  return { en: str(raw.en, `${field}.en`, 300), ru: str(raw.ru, `${field}.ru`, 300), uz: str(raw.uz, `${field}.uz`, 300), ...(note ? { note } : {}) };
}

/** Exercise ids stay as written, so a learner's answers match across versions; a bad or repeated id gets a new one. */
function readExercises(value: unknown): Exercise[] {
  const used = new Set<string>();
  return list(value, 'exercises', MAX.exercises).map((entry, index) => {
    const raw = record(entry);
    const where = `exercises[${index}]`;
    const kind = String(raw.kind);
    if (!(EXERCISE_KINDS as readonly string[]).includes(kind)) throw new CompanyError('invalid_field', `${where}.kind is not an exercise type.`, 400, { field: `${where}.kind` });
    let id = typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : `e${index + 1}`;
    while (used.has(id)) id = `${id}x`;
    used.add(id);
    const prompt = str(raw.prompt, `${where}.prompt`, 300);
    const base = { id, ...(prompt ? { prompt } : {}) };
    switch (kind as Exercise['kind']) {
      case 'choice':
        return { ...base, kind: 'choice' as const, items: list(raw.items, `${where}.items`, MAX.items).map((item, i) => {
          const row = record(item);
          const answer = Number(row.answer);
          return { q: str(row.q, `${where}.items[${i}].q`, 400), options: list(row.options, `${where}.items[${i}].options`, MAX.options).map((option, o) => str(option, `${where}.items[${i}].options[${o}]`, 300)), answer: Number.isInteger(answer) ? answer : 0 };
        }) };
      case 'gap': {
        const bank = list(raw.bank, `${where}.bank`, 30).map((word, w) => str(word, `${where}.bank[${w}]`, 120));
        return { ...base, kind: 'gap' as const, ...(bank.length ? { bank } : {}), items: list(raw.items, `${where}.items`, MAX.items).map((item, i) => {
          const row = record(item);
          return { text: str(row.text, `${where}.items[${i}].text`, 400), answers: list(row.answers, `${where}.items[${i}].answers`, 8).map((answer, a) => str(answer, `${where}.items[${i}].answers[${a}]`, 120)) };
        }) };
      }
      case 'order':
        return { ...base, kind: 'order' as const, lines: list(raw.lines, `${where}.lines`, MAX.items).map((line, l) => str(line, `${where}.lines[${l}]`, 400)) };
      case 'match':
        return { ...base, kind: 'match' as const, pairs: list(raw.pairs, `${where}.pairs`, MAX.items).map((pair, p) => {
          const row = Array.isArray(pair) ? pair : [];
          return [str(row[0], `${where}.pairs[${p}][0]`, 300), str(row[1], `${where}.pairs[${p}][1]`, 300)] as [string, string];
        }) };
    }
  });
}

function readMission(value: unknown): CustomMission | null {
  if (value === undefined || value === null) return null;
  const raw = record(value);
  const brief = readLocalized(raw.brief, 'mission.brief', 600);
  if (raw.kind === 'roleplay') return { kind: 'roleplay', scenario: str(raw.scenario, 'mission.scenario', 120), brief };
  if (raw.kind === 'writing') return { kind: 'writing', template: str(raw.template, 'mission.template', 120) || null, brief };
  if (raw.kind === 'task') return { kind: 'task', brief };
  throw new CompanyError('invalid_field', 'mission.kind is not a mission type.', 400, { field: 'mission.kind' });
}

/** Reads a whole lesson as HR sent it. A draft may be incomplete; `lessonProblems` says what publishing still needs. */
export function readLesson(body: unknown): CustomLesson {
  const raw = record(body);
  const dialogue = record(raw.dialogue);
  return {
    title: readLocalized(raw.title, 'title', 200),
    goal: readLocalized(raw.goal, 'goal', 500),
    level: isLevel(raw.level) ? raw.level : 'b1',
    phrases: list(raw.phrases, 'phrases', MAX.phrases).map((value, index) => readPhrase(value, `phrases[${index}]`)),
    words: list(raw.words, 'words', MAX.words).map((value, index) => readPhrase(value, `words[${index}]`)),
    dialogue: {
      setting: readLocalized(dialogue.setting, 'dialogue.setting', 500),
      lines: list(dialogue.lines, 'dialogue.lines', MAX.lines).map((line, index) => {
        const row = record(line);
        return { speaker: str(row.speaker, `dialogue.lines[${index}].speaker`, 60), text: str(row.text, `dialogue.lines[${index}].text`, 500) };
      }),
    },
    exercises: readExercises(raw.exercises),
    mission: readMission(raw.mission),
  };
}

export const blankLesson = (title = '', level: Level = 'b1'): CustomLesson => ({
  title: { en: title, ru: '', uz: '' }, goal: { en: '', ru: '', uz: '' }, level, phrases: [], words: [],
  dialogue: { setting: { en: '', ru: '', uz: '' }, lines: [] }, exercises: [], mission: null,
});

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const distinct = (values: string[]) => new Set(values.map((value) => normalizeAnswer(value))).size === values.length;

/** One thing that stops publishing. The app words it from `code` in the reader's language. */
export interface Problem { code: string; n?: number; m?: number }

/** What is wrong with one exercise for a learner. HR lessons can be shorter than the built-in ones. */
export function exerciseProblems(exercise: Exercise, n: number): Problem[] {
  const problems: Problem[] = [];
  const add = (code: string, m?: number) => problems.push(m === undefined ? { code, n } : { code, n, m });
  switch (exercise.kind) {
    case 'choice':
      if (!exercise.items.length) add('ex_no_items');
      exercise.items.forEach((item, index) => {
        if (!filled(item.q)) add('ex_question', index + 1);
        if (item.options.length < 2 || !item.options.every(filled)) add('ex_options', index + 1);
        else if (!distinct(item.options)) add('ex_options_repeat', index + 1);
        if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length) add('ex_correct', index + 1);
      });
      break;
    case 'gap':
      if (!exercise.items.length) add('ex_no_items');
      exercise.items.forEach((item, index) => {
        if (!filled(item.text) || item.text.split('___').length !== 2) add('ex_gap', index + 1);
        if (!item.answers.length || !item.answers.every(filled)) add('ex_gap_answer', index + 1);
      });
      break;
    case 'order':
      if (exercise.lines.length < 2 || !exercise.lines.every(filled)) add('ex_lines');
      else if (!distinct(exercise.lines)) add('ex_lines_repeat');
      break;
    case 'match':
      if (exercise.pairs.length < 2 || !exercise.pairs.every((pair) => filled(pair[0]) && filled(pair[1]))) add('ex_pairs');
      else if (!distinct(exercise.pairs.map((pair) => pair[0])) || !distinct(exercise.pairs.map((pair) => pair[1]))) add('ex_pairs_repeat');
      break;
  }
  return problems;
}

/** Every reason this lesson cannot be published yet (empty when it can). */
export function lessonProblems(lesson: CustomLesson): Problem[] {
  const problems: Problem[] = [];
  if (!filled(lesson.title.en)) problems.push({ code: 'title' });
  if (!filled(lesson.goal.en)) problems.push({ code: 'goal' });
  if (!lesson.phrases.length && !lesson.words.length) problems.push({ code: 'no_content' });
  lesson.phrases.forEach((phrase, index) => { if (!filled(phrase.en)) problems.push({ code: 'phrase', n: index + 1 }); });
  lesson.words.forEach((word, index) => { if (!filled(word.en)) problems.push({ code: 'word', n: index + 1 }); });
  if (new Set(lesson.phrases.map((phrase) => phrase.en.toLowerCase())).size !== lesson.phrases.length) problems.push({ code: 'phrases_repeat' });
  if (new Set(lesson.words.map((word) => word.en.toLowerCase())).size !== lesson.words.length) problems.push({ code: 'words_repeat' });
  lesson.dialogue.lines.forEach((line, index) => { if (!filled(line.speaker) || !filled(line.text)) problems.push({ code: 'line', n: index + 1 }); });
  if (!lesson.exercises.length) problems.push({ code: 'no_exercises' });
  lesson.exercises.forEach((exercise, index) => problems.push(...exerciseProblems(exercise, index + 1)));
  if (!lesson.mission) problems.push({ code: 'no_mission' });
  else {
    if (!filled(lesson.mission.brief.en)) problems.push({ code: 'mission_brief' });
    if (lesson.mission.kind === 'roleplay' && !filled(lesson.mission.scenario)) problems.push({ code: 'mission_scenario' });
  }
  return problems;
}

/** Reads AI output into a lesson: anything unusable is dropped rather than failing the draft. Null when too little is left. */
export function aiLesson(data: unknown, level: Level): CustomLesson | null {
  const raw = record(data);
  const localized = (value: unknown, max: number): Localized => {
    const row = record(value);
    return { en: aiText(row.en, max), ru: aiText(row.ru, max), uz: aiText(row.uz, max) };
  };
  const entry = (value: unknown): Word => {
    const row = record(value);
    const note = aiText(row.note, 120);
    return { en: aiText(row.en, 300), ru: aiText(row.ru, 300), uz: aiText(row.uz, 300), ...(note ? { note } : {}) };
  };
  const seen = (rows: Word[], max: number) => {
    const out = new Map<string, Word>();
    for (const row of rows) if (row.en && !out.has(row.en.toLowerCase())) out.set(row.en.toLowerCase(), row);
    return [...out.values()].slice(0, max);
  };
  const phrases = seen(Array.isArray(raw.phrases) ? raw.phrases.map(entry) : [], 16);
  const words = seen(Array.isArray(raw.words) ? raw.words.map(entry) : [], 16);
  const dialogue = record(raw.dialogue);
  const exercises: Exercise[] = [];
  for (const [index, value] of (Array.isArray(raw.exercises) ? raw.exercises : []).entries()) {
    const row = record(value);
    let exercise: Exercise | null = null;
    const id = `e${index + 1}`;
    const prompt = aiText(row.prompt, 300);
    const base = { id, ...(prompt ? { prompt } : {}) };
    if (row.kind === 'choice') exercise = { ...base, kind: 'choice', items: (Array.isArray(row.items) ? row.items : []).slice(0, 8).map((item) => { const r = record(item); return { q: aiText(r.q, 400), options: aiList(r.options, 5, 300), answer: Number(r.answer) }; }) };
    else if (row.kind === 'gap') exercise = { ...base, kind: 'gap', items: (Array.isArray(row.items) ? row.items : []).slice(0, 8).map((item) => { const r = record(item); return { text: aiText(r.text, 400), answers: aiList(r.answers, 6, 120) }; }) };
    else if (row.kind === 'order') exercise = { ...base, kind: 'order', lines: aiList(row.lines, 10, 400) };
    else if (row.kind === 'match') exercise = { ...base, kind: 'match', pairs: (Array.isArray(row.pairs) ? row.pairs : []).slice(0, 8).map((pair) => { const r = Array.isArray(pair) ? pair : []; return [aiText(r[0], 300), aiText(r[1], 300)] as [string, string]; }) };
    if (exercise && exerciseProblems(exercise, 1).length === 0) exercises.push(exercise);
    if (exercises.length >= 6) break;
  }
  const mission = record(raw.mission);
  const lesson: CustomLesson = {
    title: localized(raw.title, 200), goal: localized(raw.goal, 500), level, phrases, words,
    dialogue: {
      setting: localized(dialogue.setting, 500),
      lines: (Array.isArray(dialogue.lines) ? dialogue.lines : []).map((line) => { const r = record(line); return { speaker: aiText(r.speaker, 60), text: aiText(r.text, 500) }; }).filter((line) => line.speaker && line.text).slice(0, 16),
    },
    exercises,
    mission: filled(record(mission.brief).en) ? { kind: 'task', brief: localized(mission.brief, 600) } : null,
  };
  return lesson.title.en && (phrases.length || words.length || exercises.length) ? lesson : null;
}

// --- Scenarios ---

export interface ScenarioInput { title: Localized; goal: Localized; persona: string; learner_role: string; setting: string; opening: string; difficulty: Difficulty; checklist: string[] }

export function readScenario(body: unknown): ScenarioInput {
  const raw = record(body);
  return {
    title: readLocalized(raw.title, 'title', 200),
    goal: readLocalized(raw.goal, 'goal', 500),
    persona: str(raw.persona, 'persona', 2000),
    learner_role: str(raw.learner_role, 'learner_role', 600),
    setting: str(raw.setting, 'setting', 1000),
    opening: str(raw.opening, 'opening', 600),
    difficulty: (DIFFICULTIES as readonly unknown[]).includes(raw.difficulty) ? raw.difficulty as Difficulty : 'medium',
    checklist: list(raw.checklist, 'checklist', MAX.criteria).map((item, index) => str(item, `checklist[${index}]`, 200)).filter(Boolean),
  };
}

export function scenarioProblems(input: ScenarioInput): Problem[] {
  const problems: Problem[] = [];
  if (!filled(input.title.en)) problems.push({ code: 'title' });
  if (!filled(input.goal.en)) problems.push({ code: 'goal' });
  if (!filled(input.persona)) problems.push({ code: 'persona' });
  if (!filled(input.learner_role)) problems.push({ code: 'learner_role' });
  if (!filled(input.setting)) problems.push({ code: 'setting' });
  if (!filled(input.opening)) problems.push({ code: 'opening' });
  if (input.checklist.length < 2) problems.push({ code: 'criteria' });
  return problems;
}

export const asScenario = (row: ScenarioRow): Scenario => ({
  code: scenarioCode(row.id), title: row.title, persona: row.persona, learnerRole: row.learner_role, setting: row.setting,
  goal: row.goal, difficulty: row.difficulty, opening: row.opening, checklist: row.checklist,
});

export async function publishedScenarios(ctx: Ctx): Promise<ScenarioRow[]> {
  return await fetchAll<ScenarioRow>(() => ctx.db.from('company_scenarios').select(SCENARIO_COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'published').order('id'), 1000);
}

/** A built-in scenario, or a published one of this workspace. */
export async function resolveScenario(ctx: Ctx, code: string): Promise<{ scenario: Scenario; trackCode: string; custom: boolean } | null> {
  const builtIn = findScenario(code);
  if (builtIn) return { scenario: builtIn.scenario, trackCode: builtIn.track.code, custom: false };
  const id = scenarioIdOf(code);
  if (!id) return null;
  const row = check<ScenarioRow | null>(await ctx.db.from('company_scenarios').select(SCENARIO_COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).eq('status', 'published').maybeSingle());
  return row ? { scenario: asScenario(row), trackCode: 'company', custom: true } : null;
}

/** Whether a mission points at something this workspace can open. */
export async function missionProblems(ctx: Ctx, mission: CustomMission | null): Promise<Problem[]> {
  if (mission?.kind === 'roleplay' && mission.scenario && !await resolveScenario(ctx, mission.scenario)) return [{ code: 'mission_unpublished' }];
  if (mission?.kind === 'writing' && mission.template && !findTemplate(mission.template)) return [{ code: 'mission_template' }];
  return [];
}

// --- What learners can open ---

export interface LiveLesson { id: string; code: string; version: number; content: CustomLesson }
export interface LiveCourse { id: string; code: string; version: number; title: Localized; summary: Localized; job_role: string | null; lessons: LiveLesson[] }

/** Published lessons by id; archived and unpublished ones are left out. */
export async function liveLessons(ctx: Ctx, ids: readonly string[]): Promise<Map<string, LiveLesson>> {
  const rows = await inChunks([...new Set(ids)], async (chunk) => check<Pick<LessonRow, 'id' | 'published' | 'published_version'>[]>(await ctx.db.from('company_lessons').select('id,published,published_version').in('id', chunk).eq('org_id', ctx.org!.id).eq('status', 'published')));
  return new Map(rows.filter((row) => row.published).map((row) => [row.id, { id: row.id, code: lessonCode(row.id), version: row.published_version, content: row.published! }]));
}

/** Every published course of the workspace with the lessons learners can open. */
export async function liveCourses(ctx: Ctx): Promise<LiveCourse[]> {
  const rows = await fetchAll<CourseRow>(() => ctx.db.from('company_courses').select(COURSE_COLUMNS).eq('org_id', ctx.org!.id).eq('status', 'published').order('id'), 500);
  const usable = rows.filter((row) => row.published);
  if (!usable.length) return [];
  const lessons = await liveLessons(ctx, usable.flatMap((row) => row.published!.lesson_ids));
  return usable.map((row) => {
    const snapshot = row.published!;
    return {
      id: row.id, code: courseCode(row.id), version: row.published_version, title: snapshot.title, summary: snapshot.summary, job_role: snapshot.job_role,
      lessons: snapshot.lesson_ids.map((id) => lessons.get(id)).filter((lesson): lesson is LiveLesson => Boolean(lesson)),
    };
  }).filter((course) => course.lessons.length > 0).sort((a, b) => a.title.en.localeCompare(b.title.en));
}
