// Compact authoring for the newer job-role tracks. It builds exactly the same Track shape
// as the long-form files; rows replace repeated keys so a whole role stays readable in one
// file. Dialogue speakers alternate, exercise ids are e1, e2, … in order, and the stage
// comes from the lesson id (f = foundation, p = professional). Pure TypeScript.
import type { Difficulty, Exercise, Lesson, Localized, Mission, Scenario, Track, WritingTemplate } from '../content.ts';

/** English, Russian, Uzbek (Latin). */
export type Tr = readonly [en: string, ru: string, uz: string];
/** Like Tr, with an optional short usage note in English. */
export type WordRow = readonly [en: string, ru: string, uz: string, note?: string];
export const loc = ([en, ru, uz]: Tr): Localized => ({ en, ru, uz });

export interface ScenarioRow {
  slug: string; title: Tr; persona: string; learner: string; setting: string; goal: Tr; difficulty: Difficulty; opening: string; check: string[];
}
export interface TemplateRow {
  slug: string; title: Tr; kind: WritingTemplate['kind']; situation: Tr; starter: string; check: string[];
}
type ExerciseRow = Omit<Extract<Exercise, { kind: 'choice' }>, 'id'> | Omit<Extract<Exercise, { kind: 'gap' }>, 'id'> | Omit<Extract<Exercise, { kind: 'order' }>, 'id'> | Omit<Extract<Exercise, { kind: 'match' }>, 'id'>;
export interface LessonRow {
  /** f1 … p12 */
  id: string; level: Lesson['level']; title: Tr; goal: Tr; phrases: Tr[]; words: WordRow[];
  setting: Tr;
  /** The two speakers; `lines` alternate between them, first speaker first. */
  who: readonly [string, string]; lines: string[];
  ex: ExerciseRow[];
  /** A role-play slug (rp) or writing template slug (wr) from this track, with the brief. */
  mission: readonly ['rp' | 'wr', string, Tr];
}

export const choice = (...items: (readonly [q: string, options: string[], answer: number])[]): ExerciseRow =>
  ({ kind: 'choice', items: items.map(([q, options, answer]) => ({ q, options, answer })) });
/** `rows`: the sentence with one ___, then accepted answers. The first answer is shown as the model. */
export const gap = (bank: string[], ...rows: (readonly [text: string, ...answers: string[]])[]): ExerciseRow =>
  ({ kind: 'gap', prompt: 'Complete the sentences with words from the box.', bank, items: rows.map(([text, ...answers]) => ({ text, answers })) });
export const order = (prompt: string, ...lines: string[]): ExerciseRow => ({ kind: 'order', prompt, lines });
export const match = (prompt: string, ...pairs: [string, string][]): ExerciseRow => ({ kind: 'match', prompt, pairs });

export const buildLesson = (track: string, row: LessonRow): Lesson => {
  const mission: Mission = row.mission[0] === 'rp'
    ? { kind: 'roleplay', scenario: `${track}-rp-${row.mission[1]}`, brief: loc(row.mission[2]) }
    : { kind: 'writing', template: `${track}-wr-${row.mission[1]}`, brief: loc(row.mission[2]) };
  return {
    code: `${track}-${row.id}`,
    stage: row.id[0] === 'f' ? 'foundation' : 'professional',
    level: row.level,
    title: loc(row.title),
    goal: loc(row.goal),
    phrases: row.phrases.map(loc),
    words: row.words.map(([en, ru, uz, note]) => (note ? { en, ru, uz, note } : { en, ru, uz })),
    dialogue: { setting: loc(row.setting), lines: row.lines.map((text, index) => ({ speaker: row.who[index % 2], text })) },
    exercises: row.ex.map((exercise, index) => ({ ...exercise, id: `e${index + 1}` }) as Exercise),
    mission,
  };
};

const buildScenario = (track: string, entry: ScenarioRow): Scenario => ({
  code: `${track}-rp-${entry.slug}`, title: loc(entry.title), persona: entry.persona, learnerRole: entry.learner, setting: entry.setting,
  goal: loc(entry.goal), difficulty: entry.difficulty, opening: entry.opening, checklist: entry.check,
});
const buildTemplate = (track: string, entry: TemplateRow): WritingTemplate => ({
  code: `${track}-wr-${entry.slug}`, title: loc(entry.title), kind: entry.kind, situation: loc(entry.situation), starter: entry.starter, checklist: entry.check,
});

export function buildTrack(row: { code: Track['code']; title: Tr; summary: Tr; scenarios: ScenarioRow[]; templates: TemplateRow[]; lessons: LessonRow[] }): Track {
  return {
    code: row.code,
    title: loc(row.title),
    summary: loc(row.summary),
    scenarios: row.scenarios.map((entry) => buildScenario(row.code, entry)),
    templates: row.templates.map((entry) => buildTemplate(row.code, entry)),
    lessons: row.lessons.map((lesson) => buildLesson(row.code, lesson)),
  };
}

/** Lessons and tasks a later release adds to a track. */
export interface TrackMore { scenarios: ScenarioRow[]; templates: TemplateRow[]; lessons: LessonRow[] }

/** Appends to a long-form track: earlier lessons keep their codes and positions, so progress and links stay valid. */
export const extendTrack = (track: Track, more: TrackMore): Track => ({
  ...track,
  scenarios: [...track.scenarios, ...more.scenarios.map((entry) => buildScenario(track.code, entry))],
  templates: [...track.templates, ...more.templates.map((entry) => buildTemplate(track.code, entry))],
  lessons: [...track.lessons, ...more.lessons.map((lesson) => buildLesson(track.code, lesson))],
});
