// Shapes of the job-role track content (lessons, role-play scenarios, writing
// templates) and the validator the tests run over every track. Pure TypeScript:
// no Deno or DOM APIs, so the browser preview can bundle it.
import { JOB_ROLES, type JobRole } from '../../../../packages/company-core/src/mod.ts';

/** Text the learner reads in their interface language. */
export interface Localized { en: string; ru: string; uz: string }

export type Stage = 'foundation' | 'professional';
export const STAGES: readonly Stage[] = ['foundation', 'professional'];
/** Foundation lessons are A2–B1, Professional lessons B1–B2. */
export const STAGE_LEVELS: Record<Stage, readonly ('a2' | 'b1' | 'b2')[]> = { foundation: ['a2', 'b1'], professional: ['b1', 'b2'] };

/** A key phrase or word with its Russian and Uzbek (Latin) translation. */
export interface Phrase { en: string; ru: string; uz: string }
export interface Word extends Phrase {
  /** Part of speech or a short usage note in English, e.g. "noun", "phrasal verb". */
  note?: string;
}

export interface DialogueLine {
  /** Speaker label shown and used to pick a voice, e.g. "Guest", "Receptionist". */
  speaker: string;
  text: string;
}

export interface ChoiceItem { q: string; options: string[]; answer: number }
export interface GapItem {
  /** One sentence with exactly one gap written as ___ */
  text: string;
  /** Accepted answers; the first is shown as the model answer. */
  answers: string[];
}

export type Exercise =
  | { id: string; kind: 'choice'; prompt?: string; items: ChoiceItem[] }
  | { id: string; kind: 'gap'; prompt?: string; bank?: string[]; items: GapItem[] }
  | { id: string; kind: 'order'; prompt?: string; lines: string[] }
  | { id: string; kind: 'match'; prompt?: string; pairs: [string, string][] };
export type ExerciseKind = Exercise['kind'];
export const EXERCISE_KINDS: readonly ExerciseKind[] = ['choice', 'gap', 'order', 'match'];

/** The workplace task at the end of a lesson: a role-play or a writing task from the same track. */
export type Mission =
  | { kind: 'roleplay'; scenario: string; brief: Localized }
  | { kind: 'writing'; template: string; brief: Localized };

export interface Lesson {
  /** Globally unique, `<track>-f1` … `<track>-p4`. */
  code: string;
  stage: Stage;
  level: 'a2' | 'b1' | 'b2';
  title: Localized;
  goal: Localized;
  phrases: Phrase[];
  words: Word[];
  dialogue: { setting: Localized; lines: DialogueLine[] };
  exercises: Exercise[];
  mission: Mission;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** An AI role-play: the AI plays `persona`, the learner plays `learnerRole`. */
export interface Scenario {
  /** Globally unique, `<track>-rp-<slug>`. */
  code: string;
  title: Localized;
  /** Who the AI plays and how they behave (English, for the AI). */
  persona: string;
  /** Who the learner is (English, for the AI). */
  learnerRole: string;
  /** Where and what is happening (English, for the AI). */
  setting: string;
  /** What the learner must achieve, shown to the learner. */
  goal: Localized;
  difficulty: Difficulty;
  /** The persona's first line, in English. */
  opening: string;
  /** 2–4 things the learner should do, in English, used for feedback. */
  checklist: string[];
}

/** A writing task: the learner writes a work email or message and the AI checks it. */
export interface WritingTemplate {
  /** Globally unique, `<track>-wr-<slug>`. */
  code: string;
  title: Localized;
  kind: 'email' | 'message' | 'report' | 'notice';
  /** The situation to write about, shown to the learner. */
  situation: Localized;
  /** A starting skeleton in English the learner may edit (greeting, structure). */
  starter: string;
  /** 2–4 things a good answer includes, in English. */
  checklist: string[];
}

export interface Track {
  code: JobRole;
  title: Localized;
  summary: Localized;
  lessons: Lesson[];
  scenarios: Scenario[];
  templates: WritingTemplate[];
}

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

function localized(value: unknown, where: string, errors: string[]) {
  const v = value as Localized | undefined;
  if (!v || typeof v !== 'object') { errors.push(`${where}: missing translations`); return; }
  for (const lang of ['en', 'ru', 'uz'] as const) {
    if (typeof v[lang] !== 'string' || !v[lang].trim()) errors.push(`${where}.${lang}: empty`);
  }
  if (typeof v.ru === 'string' && v.ru.trim() && !CYRILLIC.test(v.ru)) errors.push(`${where}.ru: not Russian`);
  uzbek(v.uz, `${where}.uz`, errors);
}

function uzbek(value: unknown, where: string, errors: string[]) {
  if (typeof value !== 'string' || !value.trim()) return;
  if (CYRILLIC.test(value)) errors.push(`${where}: Uzbek must be Latin script`);
  if (!LATIN.test(value)) errors.push(`${where}: not Uzbek Latin`);
  // Uzbek Latin o‘ and g‘ use U+2018; no ASCII apostrophes, backticks or modifier letters.
  if (/['`ʻʼ]/.test(value)) errors.push(`${where}: use ‘ (U+2018) for o‘/g‘ and ’ for the tutuq belgisi`);
  if (/[oOgG]’/.test(value)) errors.push(`${where}: write o‘/g‘ with U+2018, not ’`);
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const unique = (values: string[]) => new Set(values.map((value) => value.trim().toLowerCase())).size === values.length;

function phrase(value: Phrase, where: string, errors: string[]) {
  if (!filled(value?.en)) errors.push(`${where}.en: empty`);
  localized(value, where, errors);
}

/** Every problem with a track, as readable strings (empty when the track is valid). */
export function validateTrack(track: Track): string[] {
  const errors: string[] = [];
  const at = (where: string) => `${track.code}${where}`;
  if (!JOB_ROLES.includes(track.code)) errors.push(at(': unknown job role'));
  localized(track.title, at('.title'), errors);
  localized(track.summary, at('.summary'), errors);

  const scenarioCodes = new Set<string>();
  if (!Array.isArray(track.scenarios) || track.scenarios.length < 3) errors.push(at(': needs at least 3 role-play scenarios'));
  for (const [index, scenario] of (track.scenarios ?? []).entries()) {
    const where = at(`.scenarios[${index}]`);
    if (!filled(scenario.code) || !scenario.code.startsWith(`${track.code}-rp-`)) errors.push(`${where}.code: must start with ${track.code}-rp-`);
    if (scenarioCodes.has(scenario.code)) errors.push(`${where}.code: duplicate`);
    scenarioCodes.add(scenario.code);
    localized(scenario.title, `${where}.title`, errors);
    localized(scenario.goal, `${where}.goal`, errors);
    for (const field of ['persona', 'learnerRole', 'setting', 'opening'] as const) if (!filled(scenario[field])) errors.push(`${where}.${field}: empty`);
    if (!DIFFICULTIES.includes(scenario.difficulty)) errors.push(`${where}.difficulty: unknown`);
    if (!Array.isArray(scenario.checklist) || scenario.checklist.length < 2 || scenario.checklist.length > 4 || !scenario.checklist.every(filled)) errors.push(`${where}.checklist: 2–4 items`);
  }

  const templateCodes = new Set<string>();
  if (!Array.isArray(track.templates) || track.templates.length < 3) errors.push(at(': needs at least 3 writing templates'));
  for (const [index, template] of (track.templates ?? []).entries()) {
    const where = at(`.templates[${index}]`);
    if (!filled(template.code) || !template.code.startsWith(`${track.code}-wr-`)) errors.push(`${where}.code: must start with ${track.code}-wr-`);
    if (templateCodes.has(template.code)) errors.push(`${where}.code: duplicate`);
    templateCodes.add(template.code);
    localized(template.title, `${where}.title`, errors);
    localized(template.situation, `${where}.situation`, errors);
    if (!['email', 'message', 'report', 'notice'].includes(template.kind)) errors.push(`${where}.kind: unknown`);
    if (!filled(template.starter)) errors.push(`${where}.starter: empty`);
    if (!Array.isArray(template.checklist) || template.checklist.length < 2 || template.checklist.length > 4 || !template.checklist.every(filled)) errors.push(`${where}.checklist: 2–4 items`);
  }

  if (!Array.isArray(track.lessons) || track.lessons.length < 8) errors.push(at(': needs at least 8 lessons'));
  const lessonCodes = new Set<string>();
  for (const stage of STAGES) {
    if ((track.lessons ?? []).filter((lesson) => lesson.stage === stage).length < 3) errors.push(at(`: needs at least 3 ${stage} lessons`));
  }
  let seenProfessional = false;
  for (const [index, lesson] of (track.lessons ?? []).entries()) {
    const where = at(`.lessons[${index}]`);
    if (!filled(lesson.code) || !new RegExp(`^${track.code}-[fp]\\d{1,2}$`).test(lesson.code)) errors.push(`${where}.code: must look like ${track.code}-f1 or ${track.code}-p1`);
    if (lessonCodes.has(lesson.code)) errors.push(`${where}.code: duplicate`);
    lessonCodes.add(lesson.code);
    if (!STAGES.includes(lesson.stage)) errors.push(`${where}.stage: unknown`);
    else {
      if (!STAGE_LEVELS[lesson.stage].includes(lesson.level)) errors.push(`${where}.level: ${lesson.level} is outside the ${lesson.stage} stage`);
      if (lesson.code?.[track.code.length + 1] !== lesson.stage[0]) errors.push(`${where}.code: letter does not match the stage`);
      if (lesson.stage === 'professional') seenProfessional = true;
      else if (seenProfessional) errors.push(`${where}: foundation lessons come before professional ones`);
    }
    localized(lesson.title, `${where}.title`, errors);
    localized(lesson.goal, `${where}.goal`, errors);

    if (!Array.isArray(lesson.phrases) || lesson.phrases.length < 8 || lesson.phrases.length > 12) errors.push(`${where}.phrases: 8–12 needed (has ${lesson.phrases?.length ?? 0})`);
    (lesson.phrases ?? []).forEach((value, i) => phrase(value, `${where}.phrases[${i}]`, errors));
    if (lesson.phrases && !unique(lesson.phrases.map((value) => value.en))) errors.push(`${where}.phrases: duplicates`);
    if (!Array.isArray(lesson.words) || lesson.words.length < 8 || lesson.words.length > 10) errors.push(`${where}.words: 8–10 needed (has ${lesson.words?.length ?? 0})`);
    (lesson.words ?? []).forEach((value, i) => phrase(value, `${where}.words[${i}]`, errors));
    if (lesson.words && !unique(lesson.words.map((value) => value.en))) errors.push(`${where}.words: duplicates`);

    localized(lesson.dialogue?.setting, `${where}.dialogue.setting`, errors);
    const lines = lesson.dialogue?.lines ?? [];
    if (lines.length < 8 || lines.length > 14) errors.push(`${where}.dialogue: 8–14 lines needed (has ${lines.length})`);
    if (lines.some((line) => !filled(line.speaker) || !filled(line.text))) errors.push(`${where}.dialogue: empty line`);
    if (new Set(lines.map((line) => line.speaker)).size < 2) errors.push(`${where}.dialogue: needs two speakers`);

    const exercises = lesson.exercises ?? [];
    if (exercises.length < 4 || exercises.length > 6) errors.push(`${where}.exercises: 4–6 needed (has ${exercises.length})`);
    if (new Set(exercises.map((exercise) => exercise.kind)).size < 3) errors.push(`${where}.exercises: use at least 3 different kinds`);
    if (!unique(exercises.map((exercise) => exercise.id))) errors.push(`${where}.exercises: duplicate ids`);
    for (const exercise of exercises) errors.push(...validateExercise(exercise, `${where}.exercises.${exercise.id}`));

    const mission = lesson.mission;
    if (!mission) errors.push(`${where}.mission: missing`);
    else {
      localized(mission.brief, `${where}.mission.brief`, errors);
      if (mission.kind === 'roleplay' && !scenarioCodes.has(mission.scenario)) errors.push(`${where}.mission: unknown scenario ${mission.scenario}`);
      else if (mission.kind === 'writing' && !templateCodes.has(mission.template)) errors.push(`${where}.mission: unknown template ${mission.template}`);
      else if (mission.kind !== 'roleplay' && mission.kind !== 'writing') errors.push(`${where}.mission.kind: unknown`);
    }
  }
  return errors;
}

export function validateExercise(exercise: Exercise, where: string): string[] {
  const errors: string[] = [];
  if (!filled(exercise.id)) errors.push(`${where}: id missing`);
  if (exercise.prompt !== undefined && !filled(exercise.prompt)) errors.push(`${where}.prompt: empty`);
  switch (exercise.kind) {
    case 'choice': {
      if (!Array.isArray(exercise.items) || exercise.items.length < 3 || exercise.items.length > 6) errors.push(`${where}: 3–6 items needed`);
      for (const [i, item] of (exercise.items ?? []).entries()) {
        if (!filled(item.q)) errors.push(`${where}[${i}].q: empty`);
        if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 4 || !item.options.every(filled)) errors.push(`${where}[${i}].options: 2–4 needed`);
        else if (!unique(item.options)) errors.push(`${where}[${i}].options: duplicates`);
        if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= (item.options?.length ?? 0)) errors.push(`${where}[${i}].answer: out of range`);
      }
      break;
    }
    case 'gap': {
      if (!Array.isArray(exercise.items) || exercise.items.length < 3 || exercise.items.length > 6) errors.push(`${where}: 3–6 items needed`);
      for (const [i, item] of (exercise.items ?? []).entries()) {
        if (!filled(item.text) || item.text.split('___').length !== 2) errors.push(`${where}[${i}].text: exactly one ___ gap`);
        if (!Array.isArray(item.answers) || !item.answers.length || !item.answers.every(filled)) errors.push(`${where}[${i}].answers: empty`);
        else if (exercise.bank && !exercise.bank.some((word) => normalizeAnswer(word) === normalizeAnswer(item.answers[0]))) errors.push(`${where}[${i}]: first answer is not in the word bank`);
      }
      if (exercise.bank && (!exercise.bank.every(filled) || !unique(exercise.bank))) errors.push(`${where}.bank: empty or duplicate words`);
      break;
    }
    case 'order': {
      if (!Array.isArray(exercise.lines) || exercise.lines.length < 4 || exercise.lines.length > 8) errors.push(`${where}: 4–8 lines needed`);
      else if (!exercise.lines.every(filled) || !unique(exercise.lines)) errors.push(`${where}: empty or duplicate lines`);
      break;
    }
    case 'match': {
      if (!Array.isArray(exercise.pairs) || exercise.pairs.length < 4 || exercise.pairs.length > 6) errors.push(`${where}: 4–6 pairs needed`);
      else {
        if (!exercise.pairs.every((pair) => Array.isArray(pair) && pair.length === 2 && filled(pair[0]) && filled(pair[1]))) errors.push(`${where}: empty pair`);
        else if (!unique(exercise.pairs.map((pair) => pair[0])) || !unique(exercise.pairs.map((pair) => pair[1]))) errors.push(`${where}: duplicate sides`);
      }
      break;
    }
    default:
      errors.push(`${where}: unknown kind`);
  }
  return errors;
}

/** How typed answers are compared: case, spacing, curly quotes and end punctuation do not matter. */
export function normalizeAnswer(value: string): string {
  return String(value ?? '').toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '').trim();
}
