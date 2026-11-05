import { SchemaError, type Schema } from '../schema.ts';
import {
  CHOICE_TYPES, FIXED_OPTIONS, ID_PATTERN, LEVEL_PATTERN, QUESTION_TYPES, TEXT_ROLES, toCefrLevel,
  type Block, type Choice, type Question, type QuestionsBlock, type QuestionType, type TextBlock,
} from './model.ts';

// Reading model drafts. Models write options as plain strings, answers as a letter,
// an option's text, an index or "Not given", numbers as text, and sometimes a lone
// string where a list belongs. These schemas accept those forms and return the
// canonical blocks of model.ts, or throw SchemaError so the gateway's one repair
// turn can ask again. Ids are provisional; `renumber` makes them final.

const fail = (path: string, problem: string): never => { throw new SchemaError(path, problem); };
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, path: string, max: number, min = 1): string => {
  const raw = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
  if (typeof raw !== 'string') return fail(path, 'expected text');
  const out = raw.replace(/\r\n?/g, '\n').trim();
  if (out.length < min) return fail(path, `at least ${min} characters`);
  return out.length > max ? out.slice(0, max).trimEnd() : out;
};
const optionalText = (value: unknown, path: string, max: number): string | undefined =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim()) ? undefined : text(value, path, max);
const list = (value: unknown): unknown[] => (value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value]);
const texts = (value: unknown, path: string, max: number, limit: number): string[] =>
  list(value).slice(0, limit).map((entry, index) => text(entry, `${path}[${index}]`, max)).filter(Boolean);
const int = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : undefined;
};

const LETTERS = 'ABCDEFGHIJKLMNOP';
/** "A) Paris", "B. London", "(c) Rome" → the text without its label. */
const stripLabel = (value: string) => value.replace(/^\(?([A-Pa-p]|[1-9]|i{1,3}|iv|v|vi{0,3}|ix|x)[).:\]]\s+/, '').trim();

function readOptions(value: unknown, path: string): Choice[] {
  const entries = list(value).slice(0, 16);
  const out: Choice[] = [];
  entries.forEach((entry, index) => {
    if (isObject(entry)) {
      const rawId = typeof entry.id === 'string' && /^[A-Za-z0-9]{1,4}$/.test(entry.id.trim()) ? entry.id.trim() : LETTERS[index];
      out.push({ id: rawId, text: text(entry.text ?? entry.label ?? entry.value, `${path}[${index}]`, 600) });
    } else out.push({ id: LETTERS[index], text: stripLabel(text(entry, `${path}[${index}]`, 600)) });
  });
  const ids = new Set<string>();
  for (const option of out) {
    if (ids.has(option.id)) return out.map((entry, index) => ({ ...entry, id: LETTERS[index] }));
    ids.add(option.id);
  }
  return out;
}

const JUDGEMENT: Record<string, string> = {
  true: 'T', t: 'T', yes: 'Y', y: 'Y', false: 'F', f: 'F', no: 'N', n: 'N',
  'not given': 'NG', notgiven: 'NG', ng: 'NG', 'not_given': 'NG', 'not-given': 'NG',
};
const clean = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/[.!]+$/, '');

/** One key entry to an option id: the id itself, a letter, a 1-based number or the option's text. */
function resolveOption(answer: string, options: readonly Choice[]): string | null {
  const raw = answer.trim();
  const direct = options.find((option) => option.id.toLowerCase() === raw.toLowerCase());
  if (direct) return direct.id;
  const labelled = /^\(?([A-Pa-p])[).:\]]?(\s|$)/.exec(raw);
  if (labelled) {
    const byLetter = options.find((option) => option.id.toLowerCase() === labelled[1].toLowerCase());
    if (byLetter) return byLetter.id;
  }
  if (/^[1-9][0-9]?$/.test(raw)) {
    const option = options[Number(raw) - 1];
    if (option) return option.id;
  }
  const byText = options.find((option) => clean(option.text) === clean(stripLabel(raw)));
  return byText ? byText.id : null;
}

function readQuestion(value: unknown, path: string, shared: Choice[] | undefined, fallbackType: QuestionType | undefined): Question {
  if (!isObject(value)) return fail(path, 'expected an object');
  const rawType = typeof value.type === 'string' ? value.type.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  const aliases: Record<string, QuestionType> = {
    mcq: 'single_choice', multiple_choice: 'single_choice', choice: 'single_choice', single: 'single_choice', multi: 'multi_choice', multiple_select: 'multi_choice',
    tfng: 'true_false_not_given', ynng: 'yes_no_not_given', tf: 'true_false', fill: 'gap', gap_fill: 'gap', fill_in: 'gap', completion: 'gap', cloze: 'gap',
    short: 'short_answer', open_ended: 'open', essay: 'open', speaking: 'open', order: 'ordering', reorder: 'ordering', match: 'matching', spr: 'numeric', number: 'numeric',
    error: 'error_correction', correction: 'error_correction', rewrite: 'transformation', sentence_transformation: 'transformation',
  };
  const type = ((QUESTION_TYPES as readonly string[]).includes(rawType) ? rawType : aliases[rawType] ?? fallbackType) as QuestionType | undefined;
  if (!type) return fail(`${path}.type`, `expected one of ${QUESTION_TYPES.join(', ')}`);
  const prompt = text(value.prompt ?? value.question ?? value.stem ?? '', `${path}.prompt`, 2000, 0);
  let options = FIXED_OPTIONS[type] ? [...FIXED_OPTIONS[type]!] : value.options !== undefined ? readOptions(value.options, `${path}.options`) : undefined;
  if (type === 'matching' && (!options || !options.length) && shared?.length) options = undefined;
  const answers = list(value.answer ?? value.answers ?? value.key ?? value.correct).map((entry) => (typeof entry === 'number' ? String(entry) : entry));
  let answer: string[];
  if (CHOICE_TYPES.includes(type)) {
    const pool = options ?? shared ?? [];
    answer = [];
    for (const entry of answers) {
      if (typeof entry !== 'string') continue;
      const judged = FIXED_OPTIONS[type] ? JUDGEMENT[clean(entry)] ?? entry.trim().toUpperCase() : entry;
      // "A, C" for a multi-choice key.
      const parts = type === 'multi_choice' || type === 'ordering' ? judged.split(/\s*[,;]\s*|\s+and\s+/).filter(Boolean) : [judged];
      for (const part of parts) answer.push(resolveOption(part, pool) ?? part.trim().slice(0, 300));
    }
  } else if (type === 'open') answer = [];
  else answer = answers.flatMap((entry) => (typeof entry === 'string' ? entry.split(/\s*\/\s*|\s*\|\s*/) : [])).map((entry) => entry.trim()).filter(Boolean).slice(0, 12);
  const choose = type === 'multi_choice' ? int(value.choose, 2, 6) ?? (answer.length >= 2 ? answer.length : undefined) : undefined;
  const tolerance = type === 'numeric' ? (typeof value.tolerance === 'number' && value.tolerance >= 0 ? value.tolerance : undefined) : undefined;
  return {
    id: typeof value.id === 'string' && ID_PATTERN.test(value.id) ? value.id : 'q0',
    type, prompt, answer: [...new Set(answer)],
    ...(options ? { options } : {}),
    ...(choose ? { choose } : {}),
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(optionalText(value.explanation, `${path}.explanation`, 1500) ? { explanation: optionalText(value.explanation, `${path}.explanation`, 1500) } : {}),
    ...(optionalText(value.skill, `${path}.skill`, 80) ? { skill: optionalText(value.skill, `${path}.skill`, 80) } : {}),
    ...(optionalText(value.exam_type, `${path}.exam_type`, 60) ? { exam_type: optionalText(value.exam_type, `${path}.exam_type`, 60) } : {}),
    ...(readLevel(value.level) ? { level: readLevel(value.level)! } : {}),
  };
}

/** A level as a model writes it (`pre_a1`, `b2`, `band:6.5`) in the model's spelling; undefined when it is not one (dropped, not an error). */
function readLevel(value: unknown): string | undefined {
  const cefr = toCefrLevel(value);
  if (cefr) return cefr;
  return typeof value === 'string' && LEVEL_PATTERN.test(value.trim()) ? value.trim() : undefined;
}

function readQuestionSet(value: Record<string, unknown>, path: string, fallbackType?: QuestionType): QuestionsBlock {
  const shared = value.options !== undefined ? readOptions(value.options, `${path}.options`) : undefined;
  const examType = optionalText(value.exam_type, `${path}.exam_type`, 60);
  const questions = list(value.questions).slice(0, 60).map((entry, index) => readQuestion(entry, `${path}.questions[${index}]`, shared, fallbackType));
  if (!questions.length) return fail(`${path}.questions`, 'at least 1 items');
  const wordLimit = int(value.word_limit ?? value.max_words, 1, 10);
  const box = texts(value.word_box, `${path}.word_box`, 80, 30);
  return {
    id: 'b0', type: 'questions', instructions: text(value.instructions ?? 'Answer the questions.', `${path}.instructions`, 1000),
    ...(optionalText(value.title, `${path}.title`, 200) ? { title: optionalText(value.title, `${path}.title`, 200) } : {}),
    ...(wordLimit ? { word_limit: wordLimit } : {}),
    ...(box.length ? { word_box: box } : {}),
    ...(shared?.length ? { options: shared } : {}),
    ...(value.from_source === true || value.from_source === 'true' ? { from_source: true } : {}),
    ...(examType ? { exam_type: examType } : {}),
    ...(readLevel(value.level) ? { level: readLevel(value.level)! } : {}),
    questions: questions.map((question) => (examType && !question.exam_type ? { ...question, exam_type: examType } : question)),
  };
}

/** One draft block of any type into its canonical form. */
export function readDraftBlock(value: unknown, path: string, fallbackQuestionType?: QuestionType): Block {
  if (!isObject(value)) return fail(path, 'expected an object');
  const type = typeof value.type === 'string' ? value.type.trim().toLowerCase() : value.questions ? 'questions' : '';
  const title = optionalText(value.title, `${path}.title`, 200);
  const withTitle = <T extends object>(block: T) => (title ? { ...block, title } : block);
  switch (type) {
    case 'text': case 'passage': case 'explanation': case 'tip': {
      const role: TextBlock['role'] = (TEXT_ROLES as readonly string[]).includes(String(value.role)) ? value.role as TextBlock['role'] : type === 'passage' ? 'passage' : type === 'tip' ? 'tip' : 'explanation';
      return withTitle({ id: 'b0', type: 'text', role, body: text(value.body ?? value.text ?? value.content, `${path}.body`, 14_000) }) as Block;
    }
    case 'script': case 'dialogue': case 'listening': {
      const lines = list(value.lines).slice(0, 160).map((line, index) => {
        if (typeof line === 'string') {
          const match = /^([^:]{1,40}):\s*(.+)$/s.exec(line.trim());
          return match ? { speaker: match[1].trim(), text: text(match[2], `${path}.lines[${index}]`, 1500) } : { speaker: 'Speaker', text: text(line, `${path}.lines[${index}]`, 1500) };
        }
        if (!isObject(line)) return fail(`${path}.lines[${index}]`, 'expected an object');
        return { speaker: text(line.speaker ?? 'Speaker', `${path}.lines[${index}].speaker`, 60), text: text(line.text, `${path}.lines[${index}].text`, 1500) };
      });
      if (!lines.length) return fail(`${path}.lines`, 'at least 1 items');
      const setting = optionalText(value.setting, `${path}.setting`, 400);
      return withTitle({ id: 'b0', type: 'script', role: type === 'dialogue' || value.role === 'dialogue' ? 'dialogue' : 'listening', lines, ...(setting ? { setting } : {}) }) as Block;
    }
    case 'questions': case 'question_set': case 'exercise':
      return readQuestionSet(value, path, fallbackQuestionType);
    case 'words': case 'word_list': case 'vocabulary': {
      const words = list(value.words ?? value.items).slice(0, 60).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.words[${index}]`, 'expected an object');
        const extra = (key: string, max: number) => { const v = optionalText(entry[key], `${path}.words[${index}].${key}`, max); return v ? { [key]: v } : {}; };
        return { term: text(entry.term ?? entry.word, `${path}.words[${index}].term`, 80), meaning: text(entry.meaning ?? entry.definition, `${path}.words[${index}].meaning`, 300), ...extra('part_of_speech', 30), ...extra('meaning_uz', 300), ...extra('meaning_ru', 300), ...extra('example', 400) };
      });
      if (!words.length) return fail(`${path}.words`, 'at least 1 items');
      return withTitle({ id: 'b0', type: 'words', words }) as Block;
    }
    case 'cards': case 'speaking_cards': case 'roleplay': {
      const cards = list(value.cards).slice(0, 40).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.cards[${index}]`, 'expected an object');
        const points = texts(entry.points ?? entry.bullets, `${path}.cards[${index}].points`, 300, 8);
        const role = optionalText(entry.role, `${path}.cards[${index}].role`, 300);
        const prep = int(entry.prep_seconds, 0, 600), talk = int(entry.talk_seconds, 0, 900);
        return { title: text(entry.title ?? `Card ${index + 1}`, `${path}.cards[${index}].title`, 120), prompt: text(entry.prompt ?? entry.text, `${path}.cards[${index}].prompt`, 1200), ...(points.length ? { points } : {}), ...(role ? { role } : {}), ...(prep !== undefined ? { prep_seconds: prep } : {}), ...(talk !== undefined ? { talk_seconds: talk } : {}) };
      });
      if (!cards.length) return fail(`${path}.cards`, 'at least 1 items');
      return withTitle({ id: 'b0', type: 'cards', cards }) as Block;
    }
    case 'flashcards': {
      const cards = list(value.cards).slice(0, 80).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.cards[${index}]`, 'expected an object');
        const example = optionalText(entry.example, `${path}.cards[${index}].example`, 300);
        return { front: text(entry.front, `${path}.cards[${index}].front`, 200), back: text(entry.back, `${path}.cards[${index}].back`, 400), ...(example ? { example } : {}) };
      });
      if (!cards.length) return fail(`${path}.cards`, 'at least 1 items');
      return withTitle({ id: 'b0', type: 'flashcards', cards }) as Block;
    }
    case 'task': case 'writing_task': {
      const words = isObject(value.words) ? { min: int(value.words.min, 0, 2000) ?? 0, max: int(value.words.max, 1, 3000) ?? 250 } : undefined;
      const minutes = int(value.minutes, 1, 240), examTask = optionalText(value.exam_task, `${path}.exam_task`, 60);
      return withTitle({ id: 'b0', type: 'task', prompt: text(value.prompt ?? value.text, `${path}.prompt`, 4000), ...(words ? { words: { min: Math.min(words.min, words.max), max: Math.max(words.min, words.max) } } : {}), ...(minutes ? { minutes } : {}), ...(examTask ? { exam_task: examTask } : {}) }) as Block;
    }
    case 'model_answer': case 'model': {
      const notes = texts(value.notes, `${path}.notes`, 400, 10);
      return withTitle({ id: 'b0', type: 'model_answer', body: text(value.body ?? value.text, `${path}.body`, 8000), ...(notes.length ? { notes } : {}) }) as Block;
    }
    case 'rubric': {
      const criteria = list(value.criteria).slice(0, 12).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.criteria[${index}]`, 'expected an object');
        const name = text(entry.name, `${path}.criteria[${index}].name`, 80);
        const rawId = typeof entry.id === 'string' && ID_PATTERN.test(entry.id) ? entry.id : name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || `c${index + 1}`;
        return { id: /^[a-z]/.test(rawId) ? rawId : `c${index + 1}`, name, description: text(entry.description ?? name, `${path}.criteria[${index}].description`, 600), max: int(entry.max, 1, 100) ?? 9 };
      });
      if (!criteria.length) return fail(`${path}.criteria`, 'at least 1 items');
      return withTitle({ id: 'b0', type: 'rubric', criteria }) as Block;
    }
    case 'stages': case 'lesson_stages': {
      const stages = list(value.stages).slice(0, 16).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.stages[${index}]`, 'expected an object');
        const interaction = optionalText(entry.interaction, `${path}.stages[${index}].interaction`, 40), materials = optionalText(entry.materials, `${path}.stages[${index}].materials`, 300);
        const steps = texts(entry.steps ?? entry.procedure, `${path}.stages[${index}].steps`, 500, 12);
        return { name: text(entry.name, `${path}.stages[${index}].name`, 80), minutes: int(entry.minutes, 1, 180) ?? 5, aim: text(entry.aim ?? entry.name, `${path}.stages[${index}].aim`, 400), steps: steps.length ? steps : [text(entry.aim ?? entry.name, `${path}.stages[${index}].steps`, 500)], ...(interaction ? { interaction } : {}), ...(materials ? { materials } : {}) };
      });
      if (!stages.length) return fail(`${path}.stages`, 'at least 1 items');
      const homework = optionalText(value.homework, `${path}.homework`, 1500);
      return withTitle({ id: 'b0', type: 'stages', stages, ...(homework ? { homework } : {}) }) as Block;
    }
    case 'slides': {
      const slides = list(value.slides).slice(0, 40).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.slides[${index}]`, 'expected an object');
        const notes = optionalText(entry.notes, `${path}.slides[${index}].notes`, 800);
        return { title: text(entry.title, `${path}.slides[${index}].title`, 120), bullets: texts(entry.bullets ?? entry.points, `${path}.slides[${index}].bullets`, 300, 8), ...(notes ? { notes } : {}) };
      });
      if (!slides.length) return fail(`${path}.slides`, 'at least 1 items');
      return withTitle({ id: 'b0', type: 'slides', slides }) as Block;
    }
    case 'outline': case 'units': {
      const units = list(value.units).slice(0, 40).map((entry, index) => {
        if (!isObject(entry)) return fail(`${path}.units[${index}]`, 'expected an object');
        const extra = (key: 'grammar' | 'vocabulary' | 'skills') => { const v = texts(entry[key], `${path}.units[${index}].${key}`, 120, 12); return v.length ? { [key]: v } : {}; };
        const weeks = int(entry.weeks, 1, 20), assessment = optionalText(entry.assessment, `${path}.units[${index}].assessment`, 400);
        return { title: text(entry.title, `${path}.units[${index}].title`, 160), aims: texts(entry.aims, `${path}.units[${index}].aims`, 300, 10), can_do: texts(entry.can_do ?? entry.outcomes, `${path}.units[${index}].can_do`, 300, 12), ...extra('grammar'), ...extra('vocabulary'), ...extra('skills'), ...(weeks ? { weeks } : {}), ...(assessment ? { assessment } : {}) };
      });
      if (!units.length) return fail(`${path}.units`, 'at least 1 items');
      return withTitle({ id: 'b0', type: 'outline', units }) as Block;
    }
    default: return fail(`${path}.type`, 'unknown block type');
  }
}

export interface DraftContent { title?: string; aims?: string[]; blocks: Block[] }
/** Model output of a `content` or `variant` step: blocks, optionally a title and aims. */
export function draftContentSchema(fallbackQuestionType?: QuestionType): Schema<DraftContent> {
  return {
    parse(value, path = '') {
      if (!isObject(value)) return fail(path, 'expected an object');
      const raw = list(value.blocks ?? value.sections);
      const blocks = raw.slice(0, 40).map((entry, index) => readDraftBlock(entry, `${path ? `${path}.` : ''}blocks[${index}]`, fallbackQuestionType));
      if (!blocks.length) return fail('blocks', 'at least 1 items');
      const title = optionalText(value.title, 'title', 200);
      const aims = texts(value.aims, 'aims', 300, 10);
      return { ...(title ? { title } : {}), ...(aims.length ? { aims } : {}), blocks };
    },
    json: { type: 'object', properties: { title: { type: 'string' }, aims: { type: 'array', items: { type: 'string' } }, blocks: { type: 'array', items: { type: 'object' }, minItems: 1 } }, required: ['blocks'] },
  };
}

/** Model output of a `source` step: one passage (`text`) or one script (`lines`). */
export function draftSourceSchema(kind: 'passage' | 'script'): Schema<{ title?: string; block: Block }> {
  return {
    parse(value, path = '') {
      if (!isObject(value)) return fail(path, 'expected an object');
      const title = optionalText(value.title, 'title', 200);
      const block = kind === 'passage'
        ? readDraftBlock({ type: 'text', role: 'passage', title: value.title, body: value.text ?? value.body ?? value.passage }, 'passage')
        : readDraftBlock({ type: 'script', role: value.role === 'dialogue' ? 'dialogue' : 'listening', title: value.title, setting: value.setting, lines: value.lines ?? value.script }, 'script');
      return { ...(title ? { title } : {}), block };
    },
    json: kind === 'passage'
      ? { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['text'] }
      : { type: 'object', properties: { title: { type: 'string' }, setting: { type: 'string' }, lines: { type: 'array', items: { type: 'object', properties: { speaker: { type: 'string' }, text: { type: 'string' } }, required: ['speaker', 'text'] } } }, required: ['lines'] },
  };
}

/** Model output of a `questions` step: one or more question sets over the source. */
export function draftQuestionsSchema(fallbackQuestionType?: QuestionType): Schema<QuestionsBlock[]> {
  return {
    parse(value, path = '') {
      if (!isObject(value)) return fail(path, 'expected an object');
      const sets = list(value.sets ?? (value.questions ? [value] : []));
      const out = sets.slice(0, 8).map((entry, index) => {
        if (!isObject(entry)) return fail(`sets[${index}]`, 'expected an object');
        return readQuestionSet(entry, `sets[${index}]`, fallbackQuestionType);
      });
      if (!out.length) return fail('sets', 'at least 1 items');
      return out;
    },
    json: { type: 'object', properties: { sets: { type: 'array', minItems: 1, items: { type: 'object', properties: { instructions: { type: 'string' }, questions: { type: 'array', items: { type: 'object' } } }, required: ['instructions', 'questions'] } } }, required: ['sets'] },
  };
}

/**
 * Final ids: blocks b1…, questions q1… in reading order, per version. Cloze markers
 * `[[3]]` in a text block (the 3rd question of the next question set) become
 * `[[q<id>]]`, and a question set written right after a passage or script points at it.
 */
export function renumber(blocksIn: readonly Block[], prefix = ''): Block[] {
  let blockNo = 0, questionNo = 0;
  const blocks = blocksIn.map((block) => ({ ...block, id: `${prefix}b${++blockNo}` })) as Block[];
  let lastSource: string | undefined;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if ((block.type === 'text' && block.role === 'passage') || block.type === 'script') lastSource = block.id;
    if (block.type !== 'questions') continue;
    const renamed = new Map<string, string>();
    const questions = block.questions.map((question, position) => {
      const next = `${prefix}q${++questionNo}`;
      renamed.set(String(position + 1), next);
      renamed.set(question.id, next);
      return { ...question, id: next };
    });
    blocks[index] = { ...block, questions, ...(block.source || !lastSource ? {} : { source: lastSource }) };
    // A cloze text just before this set refers to its questions by number.
    const previous = blocks[index - 1];
    if (previous?.type === 'text' && /\[\[[^\]]{1,31}\]\]/.test(previous.body)) {
      blocks[index - 1] = { ...previous, body: previous.body.replace(/\[\[([^\]]{1,31})\]\]/g, (whole, ref: string) => (renamed.has(ref.trim()) ? `[[${renamed.get(ref.trim())}]]` : whole)) };
    }
  }
  return blocks;
}
