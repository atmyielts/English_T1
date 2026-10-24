import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  AdminEnglishStudioError,
  adminEnglishStudioCreate,
  adminEnglishStudioDraft,
  adminEnglishStudioUpdate,
  type AdminEnglishStudioFieldError,
  type AdminEnglishStudioItem,
  type AdminEnglishStudioRecord,
} from '../../lib/platformClient';
import { toFriendlyAdminError } from './AdminEnglishUtils';

// Full content editor for one English item (parent fields + child rows).
// Field names match the admin-english-content studio routes; the server
// validates everything and answers with per-field errors.

export type StudioServiceKey = 'reading' | 'listening' | 'writing' | 'speaking' | 'grammar' | 'vocabulary' | 'immersion';

type Rec = AdminEnglishStudioRecord;
type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'list' | 'checkbox';
type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  rows?: number;
  options?: readonly string[];
  hint?: string;
  wide?: boolean;
  placeholder?: string;
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const STATUSES = ['draft', 'published', 'archived'] as const;

const PARENT_FIELDS: Record<StudioServiceKey, FieldSpec[]> = {
  reading: [
    { key: 'summary', label: 'Summary', kind: 'textarea', rows: 2, wide: true },
    { key: 'content_markdown', label: 'Article text (Markdown)', kind: 'textarea', rows: 14, wide: true },
    { key: 'category', label: 'Category', kind: 'text', placeholder: 'Daily life' },
    { key: 'theme', label: 'Theme', kind: 'text', placeholder: 'shopping' },
    { key: 'tone', label: 'Card colour', kind: 'select', options: ['mint', 'lime', 'sky', 'peach', 'lavender', 'sand'] },
    { key: 'read_time_minutes', label: 'Read time (minutes)', kind: 'number', hint: 'Leave empty to estimate from the text.' },
    { key: 'is_hot', label: 'Show as trending', kind: 'checkbox' },
  ],
  listening: [
    { key: 'summary', label: 'Summary', kind: 'textarea', rows: 2, wide: true },
    {
      key: 'transcript_text',
      label: 'Script',
      kind: 'textarea',
      rows: 10,
      wide: true,
      hint: 'Read aloud by the browser when there is no audio file. For dialogues write "Name: line" on each line.',
    },
    { key: 'category', label: 'Category', kind: 'text', placeholder: 'Travel' },
    { key: 'audio_url', label: 'Audio URL (optional)', kind: 'text', placeholder: 'https://…' },
    { key: 'accent', label: 'Accent', kind: 'text', placeholder: 'general' },
    { key: 'speed_label', label: 'Speed', kind: 'select', options: ['slow', 'natural', 'fast'] },
    { key: 'speed_wpm', label: 'Words per minute', kind: 'number' },
    { key: 'duration_seconds', label: 'Duration (seconds)', kind: 'number', hint: 'Leave empty to estimate from the script.' },
    { key: 'focus_skill', label: 'Focus skill', kind: 'text', placeholder: 'detail' },
    { key: 'tags', label: 'Tags (one per line)', kind: 'list', rows: 3 },
  ],
  writing: [
    { key: 'prompt_text', label: 'Task', kind: 'textarea', rows: 4, wide: true },
    { key: 'genre', label: 'Genre', kind: 'text', placeholder: 'email' },
    { key: 'audience', label: 'Reader', kind: 'text', placeholder: 'Your new classmates' },
    { key: 'expected_length_min', label: 'Minimum words', kind: 'number' },
    { key: 'expected_length_max', label: 'Maximum words', kind: 'number' },
    { key: 'target_grammar', label: 'Target grammar', kind: 'text' },
    { key: 'target_structure', label: 'Suggested structure', kind: 'text' },
    { key: 'target_vocabulary', label: 'Useful words (one per line)', kind: 'list', rows: 4, wide: true },
  ],
  speaking: [
    { key: 'prompt_text', label: 'Task', kind: 'textarea', rows: 4, wide: true },
    {
      key: 'prompt_type',
      label: 'Prompt type',
      kind: 'select',
      options: ['guided_response', 'roleplay', 'storytelling', 'shadowing', 'read_aloud'],
    },
    { key: 'task_type', label: 'Task type', kind: 'select', options: ['', 'describe', 'explain', 'opinion', 'story', 'roleplay', 'presentation'] },
    { key: 'target_duration_seconds', label: 'Target length (seconds)', kind: 'number' },
    { key: 'target_grammar', label: 'Target grammar', kind: 'text' },
    { key: 'target_vocabulary', label: 'Useful words (one per line)', kind: 'list', rows: 4, wide: true },
    { key: 'fluency_objective', label: 'Fluency objective', kind: 'textarea', rows: 2 },
    { key: 'pronunciation_objective', label: 'Pronunciation objective', kind: 'textarea', rows: 2 },
    { key: 'model_opening', label: 'Model opening sentence', kind: 'text', wide: true },
    { key: 'model_answer', label: 'Model answer', kind: 'textarea', rows: 4, wide: true, hint: 'Shown after the learner answers.' },
  ],
  grammar: [
    { key: 'focus_area', label: 'Focus area key', kind: 'text', placeholder: 'present-simple', hint: 'Used for the skill key grammar.<focus area>.' },
    { key: 'tags', label: 'Tags (one per line)', kind: 'list', rows: 2 },
    { key: 'explanation_text', label: 'Explanation', kind: 'textarea', rows: 6, wide: true },
    { key: 'contrast_text', label: 'Compare (shown as the lesson goal)', kind: 'textarea', rows: 3, wide: true },
    { key: 'common_error_pattern', label: 'Common mistake', kind: 'textarea', rows: 2, wide: true },
  ],
  immersion: [
    { key: 'context_text', label: 'Situation', kind: 'textarea', rows: 3, wide: true },
    { key: 'objective_text', label: 'Goal', kind: 'textarea', rows: 2, wide: true },
    { key: 'mission_type', label: 'Mission type', kind: 'select', options: ['travel', 'workplace', 'study', 'service', 'social', 'problem_solving'] },
    { key: 'target_grammar', label: 'Target grammar', kind: 'text' },
    { key: 'target_vocabulary', label: 'Useful words (one per line)', kind: 'list', rows: 3 },
    { key: 'success_conditions', label: 'Success conditions (one per line)', kind: 'list', rows: 3 },
    { key: 'cultural_note', label: 'Cultural note', kind: 'textarea', rows: 2, wide: true },
  ],
  vocabulary: [
    { key: 'topic', label: 'Topic', kind: 'text', placeholder: 'home' },
    { key: 'description', label: 'Description', kind: 'textarea', rows: 2, wide: true },
  ],
};

const NEW_ITEM: Record<StudioServiceKey, Rec> = {
  reading: { summary: '', content_markdown: '', category: '', theme: '', tone: 'mint', read_time_minutes: '', is_hot: false, questions: [] },
  listening: {
    summary: '',
    transcript_text: '',
    category: '',
    accent: 'general',
    speed_label: 'natural',
    speed_wpm: 130,
    duration_seconds: '',
    audio_url: '',
    focus_skill: 'detail',
    tags: [],
    questions: [],
  },
  writing: {
    prompt_text: '',
    genre: '',
    audience: '',
    checklist: [],
    target_grammar: '',
    target_structure: '',
    target_vocabulary: [],
    expected_length_min: 60,
    expected_length_max: 120,
  },
  speaking: {
    prompt_text: '',
    prompt_type: 'guided_response',
    task_type: 'describe',
    target_duration_seconds: 60,
    target_grammar: '',
    target_vocabulary: [],
    fluency_objective: '',
    pronunciation_objective: '',
    cues: [],
    model_opening: '',
    model_answer: '',
  },
  grammar: { focus_area: '', explanation_text: '', contrast_text: '', common_error_pattern: '', examples: [], tags: [] },
  immersion: {
    context_text: '',
    objective_text: '',
    mission_type: 'travel',
    target_vocabulary: [],
    target_grammar: '',
    cultural_note: '',
    success_conditions: [],
  },
  vocabulary: { topic: '', description: '' },
};

const CHILD_LABEL: Partial<Record<StudioServiceKey, { title: string; one: string; hint: string }>> = {
  listening: {
    title: 'Dictation segments',
    one: 'Segment',
    hint: 'Sentences of the script. Segments with a focus phrase become the dictation (first two).',
  },
  grammar: {
    title: 'Practice items',
    one: 'Item',
    hint: 'Learners type an answer; it is checked against the accepted answers. Write gaps as ___.',
  },
  immersion: {
    title: 'Steps',
    one: 'Step',
    hint: 'Read and Listen steps need questions; Reply and Speak steps need a goal and points to cover.',
  },
  vocabulary: {
    title: 'Words',
    one: 'Word',
    hint: 'The quiz shows a meaning and uses other words of the set as options, so publish at least 4.',
  },
};

const newChild = (key: StudioServiceKey): Rec => {
  switch (key) {
    case 'listening':
      return { segment_text: '', focus_phrase: '', starts_at_seconds: '', ends_at_seconds: '', metadata: {} };
    case 'grammar':
      return { drill_type: 'fill', title: '', instructions: '', prompt_text: '', accepted_answers: [], status: 'published', metadata: {} };
    case 'immersion':
      return {
        kind: 'read',
        title: '',
        instructions: '',
        prompt_text: '',
        estimated_minutes: 3,
        status: 'published',
        accent: '',
        questions: [],
        goal: '',
        points: [],
        model_answer: '',
        min_words: '',
        metadata: {},
      };
    case 'vocabulary':
      return { word: '', part_of_speech: '', definition: '', example: '', translation_ru: '', translation_uz: '' };
    default:
      return {};
  }
};

export const newStudioDraft = (key: StudioServiceKey): { item: Rec; children: Rec[] } => ({
  item: {
    slug: '',
    title: '',
    level: 'A1',
    status: 'draft',
    sort_order: 100,
    metadata: {},
    ...(key === 'vocabulary' ? {} : { presentation_meta: {} }),
    ...structuredClone(NEW_ITEM[key]),
  },
  children: [],
});

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '')).join('\n');
  return String(value);
};

const asArray = (value: unknown): Rec[] => (Array.isArray(value) ? (value as Rec[]) : []);

const prettyJson = (value: unknown): string => JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);

/** "children[2].questions[0].options[1]" -> "Step 3 · Question 1 · Option 2". */
const humanPath = (path: string, childOne: string): string =>
  path
    .replace(/children\[(\d+)\]/g, (_m, n) => `${childOne} ${Number(n) + 1}`)
    .replace(/(questions|options|points|examples|checklist|cues)\[(\d+)\]/g, (_m, name: string, n) => {
      const label: Record<string, string> = {
        questions: 'Question',
        options: 'Option',
        points: 'Point',
        examples: 'Example',
        checklist: 'Task point',
        cues: 'Cue',
      };
      return `${label[name] ?? name} ${Number(n) + 1}`;
    })
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ');

// ---------------------------------------------------------------------------
// Field building blocks
// ---------------------------------------------------------------------------

const ErrorsContext = createContext<AdminEnglishStudioFieldError[]>([]);

const useFieldErrors = (path: string): string[] => {
  const errors = useContext(ErrorsContext);
  return errors.filter((error) => error.field === path).map((error) => error.message);
};

const inputClass = (hasError: boolean) =>
  `mt-2 w-full rounded-2xl border px-4 py-3 text-sm ${hasError ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`;

const FieldMessages: React.FC<{ path: string }> = ({ path }) => {
  const messages = useFieldErrors(path);
  if (!messages.length) return null;
  return (
    <span className="mt-1 block text-xs font-medium text-red-600">
      {messages.map((message) => (
        <span key={message} className="block">
          {message}
        </span>
      ))}
    </span>
  );
};

const Field: React.FC<{
  spec: FieldSpec;
  path: string;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ spec, path, value, onChange }) => {
  const hasError = useFieldErrors(path).length > 0;
  const wide = spec.wide || spec.kind === 'textarea' ? 'md:col-span-2' : '';
  if (spec.kind === 'checkbox') {
    return (
      <label className={`flex items-center gap-3 text-sm font-medium text-gray-700 ${wide}`}>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {spec.label}
        <FieldMessages path={path} />
      </label>
    );
  }
  return (
    <label className={`block text-sm font-medium text-gray-700 ${wide}`}>
      {spec.label}
      {spec.kind === 'select' ? (
        <select value={asText(value)} onChange={(event) => onChange(event.target.value)} className={inputClass(hasError)}>
          {(spec.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option || '—'}
            </option>
          ))}
        </select>
      ) : spec.kind === 'textarea' || spec.kind === 'list' ? (
        <textarea
          rows={spec.rows ?? 3}
          value={asText(value)}
          placeholder={spec.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass(hasError)}
        />
      ) : (
        <input
          type={spec.kind === 'number' ? 'number' : 'text'}
          value={asText(value)}
          placeholder={spec.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass(hasError)}
        />
      )}
      {spec.hint ? <span className="mt-1 block text-xs font-normal text-gray-500">{spec.hint}</span> : null}
      <FieldMessages path={path} />
    </label>
  );
};

const FieldGrid: React.FC<{ specs: FieldSpec[]; prefix: string; record: Rec; onChange: (key: string, value: unknown) => void }> = ({
  specs,
  prefix,
  record,
  onChange,
}) => (
  <div className="grid gap-4 md:grid-cols-2">
    {specs.map((spec) => (
      <Field key={spec.key} spec={spec} path={`${prefix}${spec.key}`} value={record[spec.key]} onChange={(value) => onChange(spec.key, value)} />
    ))}
  </div>
);

const smallButton = 'rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-40';

/** Add / remove / reorder rows of a list. */
function RowList<T extends Rec>({
  rows,
  onChange,
  makeRow,
  label,
  path,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  makeRow: () => T;
  label: string;
  path: string;
  render: (row: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const move = (index: number, delta: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row!);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <FieldMessages path={path} />
      {rows.map((row, index) => (
        <div key={index} className="rounded-3xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              {label} {index + 1}
            </span>
            <div className="flex gap-2">
              <button type="button" className={smallButton} disabled={index === 0} onClick={() => move(index, -1)}>
                Up
              </button>
              <button type="button" className={smallButton} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                Down
              </button>
              <button type="button" className={smallButton} onClick={() => onChange(rows.filter((_row, at) => at !== index))}>
                Remove
              </button>
            </div>
          </div>
          {render(row, index, (patch) => onChange(rows.map((entry, at) => (at === index ? { ...entry, ...patch } : entry))))}
        </div>
      ))}
      <button type="button" className={smallButton} onClick={() => onChange([...rows, makeRow()])}>
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

/** Templates for the reading question types beyond multiple choice (english-reading.ts). */
const READING_TYPE_TEMPLATES: Record<string, Rec> = {
  tfng: { type: 'tfng', prompt: 'A statement about the text.', answer: 'not_given', explanation: '', skill: 'reading.detail' },
  headings: {
    type: 'headings',
    prompt: 'Choose the best heading for each paragraph. There are more headings than paragraphs.',
    options: ['Heading A', 'Heading B', 'Heading C'],
    items: [{ paragraph: 1, answer_index: 0 }, { paragraph: 2, answer_index: 1 }],
    explanation: '',
    skill: 'reading.main_idea',
  },
  gap: {
    type: 'gap',
    prompt: 'Complete the summary. Use ONE word from the text in each gap.',
    text: 'The writer ___ to work and finds it ___.',
    answers: [['walks'], ['relaxing']],
    word_bank: [],
    explanation: '',
    skill: 'reading.detail',
  },
};

/**
 * True/False/Not given, matching headings and gap-fill questions are edited
 * as JSON; the server checks them exactly as the reading activity grades them.
 */
const JsonQuestion: React.FC<{ question: Rec; path: string; onReplace: (next: Rec) => void }> = ({ question, path, onReplace }) => {
  const [text, setText] = useState(() => JSON.stringify(question, null, 2));
  const [invalid, setInvalid] = useState(false);
  const label = question.type === 'tfng'
    ? (question.variant === 'yes_no' ? 'Yes / No / Not given' : 'True / False / Not given')
    : question.type === 'headings' ? 'Matching headings' : question.type === 'gap' ? 'Gap fill (summary completion)' : String(question.type);
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-gray-700">{label} (edited as JSON)</span>
      <textarea
        value={text}
        rows={Math.min(18, text.split('\n').length + 1)}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(text) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
            setInvalid(false);
            onReplace(parsed as Rec);
          } catch {
            setInvalid(true);
          }
        }}
        className="w-full rounded-2xl border border-gray-200 px-3 py-2 font-mono text-xs"
      />
      {invalid ? <p className="text-xs text-red-600">This is not valid JSON yet; the last valid version is kept.</p> : null}
      <p className="text-xs text-gray-500">
        tfng: answer true | false | not_given (variant "yes_no" for opinions). headings: options = headings, items = [{'{'} paragraph, answer_index {'}'}].
        gap: text with ___ per gap, answers = one list of accepted answers per gap, optional word_bank.
      </p>
      <FieldMessages path={path} />
    </div>
  );
};

/** Multiple-choice questions: prompt, options with the correct one marked, explanation. */
const QuestionsEditor: React.FC<{ value: unknown; onChange: (value: Rec[]) => void; path: string; withSkill?: boolean }> = ({
  value,
  onChange,
  path,
  withSkill,
}) => (
  <RowList
    rows={asArray(value)}
    onChange={onChange}
    path={path}
    label="Question"
    makeRow={() => ({ prompt: '', options: ['', '', ''], answer_index: 0, explanation: '', ...(withSkill ? { skill: 'reading.detail' } : {}) })}
    render={(question, index, update) => {
      const at = `${path}[${index}]`;
      if (withSkill && typeof question.type === 'string' && question.type !== 'mcq') {
        return (
          <JsonQuestion
            question={question}
            path={at}
            onReplace={(next) => onChange(asArray(value).map((entry, position) => (position === index ? next : entry)))}
          />
        );
      }
      const options = Array.isArray(question.options) ? (question.options as unknown[]).map((option) => asText(option)) : [];
      return (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              spec={{ key: 'prompt', label: 'Question', kind: 'text', wide: !withSkill }}
              path={`${at}.prompt`}
              value={question.prompt}
              onChange={(next) => update({ prompt: next })}
            />
            {withSkill ? (
              <Field
                spec={{
                  key: 'skill',
                  label: 'Skill',
                  kind: 'select',
                  options: ['reading.detail', 'reading.main_idea', 'reading.inference', 'reading.vocabulary'],
                }}
                path={`${at}.skill`}
                value={question.skill}
                onChange={(next) => update({ skill: next })}
              />
            ) : (
              <Field
                spec={{ key: 'focus', label: 'Asked (gist = after the first listen)', kind: 'select', options: ['', 'gist', 'detail'] }}
                path={`${at}.focus`}
                value={question.focus ?? ''}
                onChange={(next) => update({ focus: next || undefined })}
              />
            )}
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Options (select the correct one)</span>
            {options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${at}-answer`}
                  checked={Number(question.answer_index) === optionIndex}
                  onChange={() => update({ answer_index: optionIndex })}
                  aria-label={`Option ${optionIndex + 1} is correct`}
                />
                <input
                  value={option}
                  onChange={(event) => update({ options: options.map((entry, at2) => (at2 === optionIndex ? event.target.value : entry)) })}
                  className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  className={smallButton}
                  disabled={options.length <= 2}
                  onClick={() => {
                    const answer = Number(question.answer_index);
                    update({
                      options: options.filter((_entry, at2) => at2 !== optionIndex),
                      answer_index: answer === optionIndex ? null : answer > optionIndex ? answer - 1 : answer,
                    });
                  }}
                >
                  ✕
                </button>
                <FieldMessages path={`${at}.options[${optionIndex}]`} />
              </div>
            ))}
            <button type="button" className={smallButton} disabled={options.length >= 6} onClick={() => update({ options: [...options, ''] })}>
              + Option
            </button>
            <FieldMessages path={`${at}.options`} />
            <FieldMessages path={`${at}.answer_index`} />
          </div>
          <Field
            spec={{ key: 'explanation', label: 'Explanation (shown after checking)', kind: 'text', wide: true }}
            path={`${at}.explanation`}
            value={question.explanation}
            onChange={(next) => update({ explanation: next })}
          />
        </div>
      );
    }}
  />
);

/** Points with keyword lists (writing task points, speaking cue points). */
const PointsWithKeywords: React.FC<{
  value: unknown;
  onChange: (value: Rec[]) => void;
  path: string;
  textKey: string;
  label: string;
  hint: string;
}> = ({ value, onChange, path, textKey, label, hint }) => (
  <RowList
    rows={asArray(value)}
    onChange={onChange}
    path={path}
    label={label}
    makeRow={() => ({ [textKey]: '', keywords: [] })}
    render={(row, index, update) => (
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          spec={{ key: textKey, label, kind: 'text' }}
          path={`${path}[${index}].${textKey}`}
          value={row[textKey]}
          onChange={(next) => update({ [textKey]: next } as Partial<Rec>)}
        />
        <Field
          spec={{ key: 'keywords', label: 'Keywords (comma separated)', kind: 'text', hint }}
          path={`${path}[${index}].keywords`}
          value={Array.isArray(row.keywords) ? (row.keywords as unknown[]).join(', ') : row.keywords}
          onChange={(next) => update({ keywords: next })}
        />
      </div>
    )}
  />
);

// ---------------------------------------------------------------------------
// Child row editors
// ---------------------------------------------------------------------------

const ChildFields: React.FC<{ serviceKey: StudioServiceKey; row: Rec; index: number; update: (patch: Rec) => void }> = ({
  serviceKey,
  row,
  index,
  update,
}) => {
  const at = `children[${index}].`;
  const set = (key: string, value: unknown) => update({ [key]: value });
  if (serviceKey === 'listening') {
    return (
      <FieldGrid
        prefix={at}
        record={row}
        onChange={set}
        specs={[
          { key: 'segment_text', label: 'Sentence', kind: 'text', wide: true },
          { key: 'focus_phrase', label: 'Focus phrase (makes it a dictation sentence)', kind: 'text', wide: true },
          { key: 'starts_at_seconds', label: 'Starts at (s, optional)', kind: 'number' },
          { key: 'ends_at_seconds', label: 'Ends at (s, optional)', kind: 'number' },
        ]}
      />
    );
  }
  if (serviceKey === 'grammar') {
    return (
      <FieldGrid
        prefix={at}
        record={row}
        onChange={set}
        specs={[
          { key: 'drill_type', label: 'Type', kind: 'select', options: ['fill', 'error_correction', 'transformation'] },
          { key: 'status', label: 'Status', kind: 'select', options: STATUSES },
          { key: 'title', label: 'Title (optional)', kind: 'text' },
          { key: 'instructions', label: 'Instructions (optional)', kind: 'text' },
          { key: 'prompt_text', label: 'Prompt', kind: 'text', wide: true, placeholder: 'Yesterday I ___ (go) to the market.' },
          {
            key: 'accepted_answers',
            label: 'Accepted answers (one per line)',
            kind: 'list',
            rows: 3,
            wide: true,
            hint: 'For gaps give the words that go in the gap; for corrections give the whole correct sentence.',
          },
        ]}
      />
    );
  }
  if (serviceKey === 'vocabulary') {
    return (
      <FieldGrid
        prefix={at}
        record={row}
        onChange={set}
        specs={[
          { key: 'word', label: 'Word', kind: 'text' },
          { key: 'part_of_speech', label: 'Part of speech', kind: 'text', placeholder: 'noun' },
          { key: 'definition', label: 'Meaning', kind: 'text', wide: true },
          { key: 'example', label: 'Example', kind: 'text', wide: true },
          { key: 'translation_ru', label: 'Russian', kind: 'text' },
          { key: 'translation_uz', label: 'Uzbek', kind: 'text' },
        ]}
      />
    );
  }
  if (serviceKey === 'immersion') {
    const kind = asText(row.kind) || 'read';
    const choice = kind === 'read' || kind === 'listen';
    return (
      <div className="space-y-4">
        <FieldGrid
          prefix={at}
          record={row}
          onChange={set}
          specs={[
            {
              key: 'kind',
              label: 'Step type',
              kind: 'select',
              options: ['read', 'listen', 'reply', 'speak'],
              hint: 'read / listen: questions · reply: write a message · speak: say a reply',
            },
            { key: 'status', label: 'Status', kind: 'select', options: STATUSES },
            { key: 'title', label: 'Title', kind: 'text' },
            { key: 'estimated_minutes', label: 'Minutes', kind: 'number' },
            { key: 'instructions', label: 'Instructions', kind: 'textarea', rows: 2 },
            {
              key: 'prompt_text',
              label: kind === 'read' ? 'Notice / message text' : kind === 'listen' ? 'Script (read aloud)' : 'Cue (what the other person says)',
              kind: 'textarea',
              rows: 4,
            },
            ...(kind === 'listen' ? [{ key: 'accent', label: 'Accent', kind: 'select' as const, options: ['', 'us', 'gb'] }] : []),
          ]}
        />
        {choice ? (
          <QuestionsEditor value={row.questions} path={`children[${index}].questions`} onChange={(next) => set('questions', next)} />
        ) : (
          <div className="space-y-4">
            <FieldGrid
              prefix={at}
              record={row}
              onChange={set}
              specs={[
                { key: 'goal', label: 'What the reply must achieve', kind: 'text', wide: true },
                { key: 'model_answer', label: 'Model answer', kind: 'textarea', rows: 3 },
                { key: 'min_words', label: 'Minimum words (optional)', kind: 'number', hint: 'Default depends on the level.' },
              ]}
            />
            <RowList
              rows={asArray(row.points)}
              onChange={(next) => set('points', next)}
              path={`children[${index}].points`}
              label="Point"
              makeRow={() => ({ label: '', any: [] })}
              render={(point, pointIndex, updatePoint) => (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    spec={{ key: 'label', label: 'Point to cover', kind: 'text' }}
                    path={`children[${index}].points[${pointIndex}].label`}
                    value={point.label}
                    onChange={(next) => updatePoint({ label: next })}
                  />
                  <Field
                    spec={{
                      key: 'any',
                      label: 'Words that show it (comma separated)',
                      kind: 'text',
                      hint: 'A trailing * matches word endings: thank*',
                    }}
                    path={`children[${index}].points[${pointIndex}].any`}
                    value={Array.isArray(point.any) ? (point.any as unknown[]).join(', ') : point.any}
                    onChange={(next) => updatePoint({ any: next })}
                  />
                </div>
              )}
            />
          </div>
        )}
      </div>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export const AdminEnglishStudioEditor: React.FC<{
  serviceKey: StudioServiceKey;
  initial: { item: Rec; children: Rec[] };
  /** Present when editing an existing item. */
  existing: AdminEnglishStudioItem | null;
  withFreshToken: <T>(run: (token: string) => Promise<T>) => Promise<T>;
  onSaved: (saved: AdminEnglishStudioItem, created: boolean) => void;
  onClose: () => void;
}> = ({ serviceKey, initial, existing, withFreshToken, onSaved, onClose }) => {
  const [item, setItem] = useState<Rec>(() => structuredClone(initial.item));
  const [children, setChildren] = useState<Rec[]>(() => structuredClone(initial.children));
  const [metadataText, setMetadataText] = useState(() => prettyJson(initial.item.metadata));
  const [presentationText, setPresentationText] = useState(() => prettyJson(initial.item.presentation_meta));
  const [slugTouched, setSlugTouched] = useState(Boolean(existing));
  const [errors, setErrors] = useState<AdminEnglishStudioFieldError[]>([]);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLevel, setAiLevel] = useState(() => asText(initial.item.level) || 'B1');
  const [aiNotes, setAiNotes] = useState('');
  const [drafting, setDrafting] = useState(false);

  const childMeta = CHILD_LABEL[serviceKey];
  const isNew = !existing;
  const hasPresentation = serviceKey !== 'vocabulary';

  const set = (key: string, value: unknown) =>
    setItem((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'title' && !slugTouched) next.slug = slugify(String(value ?? ''));
      return next;
    });

  const save = async () => {
    setMessage(null);
    const local: AdminEnglishStudioFieldError[] = [];
    let metadata: unknown;
    let presentation: unknown;
    try {
      metadata = JSON.parse(metadataText || '{}');
    } catch {
      local.push({ field: 'metadata', message: 'Advanced metadata is not valid JSON.' });
    }
    if (hasPresentation) {
      try {
        presentation = JSON.parse(presentationText || '{}');
      } catch {
        local.push({ field: 'presentation_meta', message: 'Presentation meta is not valid JSON.' });
      }
    }
    if (local.length) {
      setErrors(local);
      setMessage({ kind: 'error', text: 'Fix the highlighted fields.' });
      return;
    }
    const payload: Rec = { ...item, metadata };
    if (hasPresentation) payload.presentation_meta = presentation;

    setSaving(true);
    try {
      const saved = await withFreshToken((token) =>
        existing
          ? adminEnglishStudioUpdate(token, { service_key: serviceKey, id: existing.item.id, item: payload, children })
          : adminEnglishStudioCreate(token, { service_key: serviceKey, item: payload, children }),
      );
      setErrors([]);
      setItem(structuredClone(saved.editor.item));
      setChildren(structuredClone(saved.editor.children));
      setMetadataText(prettyJson(saved.editor.item.metadata));
      setPresentationText(prettyJson(saved.editor.item.presentation_meta));
      setSlugTouched(true);
      setMessage({ kind: 'success', text: `${saved.item.title} saved (${saved.item.status}).` });
      onSaved(saved, isNew);
    } catch (err) {
      if (err instanceof AdminEnglishStudioError && err.fieldErrors.length) {
        setErrors(err.fieldErrors);
        setMessage({ kind: 'error', text: err.serverMessage || 'Fix the highlighted fields.' });
      } else if (err instanceof AdminEnglishStudioError && err.status >= 500) {
        setErrors([]);
        setMessage({ kind: 'error', text: err.serverMessage || 'Could not save this item.' });
      } else {
        setErrors([]);
        setMessage({ kind: 'error', text: toFriendlyAdminError(err, 'Could not save this item.') });
      }
    } finally {
      setSaving(false);
    }
  };

  const draftWithAi = async () => {
    setMessage(null);
    setDrafting(true);
    try {
      const draft = await withFreshToken((token) =>
        adminEnglishStudioDraft(token, { service_key: serviceKey, topic: aiTopic.trim(), level: aiLevel, notes: aiNotes.trim() }),
      );
      setItem({ ...structuredClone(draft.editor.item), metadata: item.metadata, presentation_meta: item.presentation_meta });
      setChildren(structuredClone(draft.editor.children));
      setSlugTouched(true);
      setErrors(draft.errors);
      setMessage(
        draft.errors.length
          ? { kind: 'error', text: `Draft ready, but ${draft.errors.length} thing(s) need fixing before it can be saved. Review every field.` }
          : { kind: 'success', text: 'Draft ready. Read it through and fix anything that is off, then Create item. It stays a draft until you publish.' },
      );
    } catch (err) {
      if (err instanceof AdminEnglishStudioError && err.fieldErrors.length) setErrors(err.fieldErrors);
      setMessage({
        kind: 'error',
        text: err instanceof AdminEnglishStudioError && err.serverMessage ? err.serverMessage : toFriendlyAdminError(err, 'Could not draft this item.'),
      });
    } finally {
      setDrafting(false);
    }
  };

  const registryStatus = existing?.registry ? String(existing.registry.status ?? '') : null;
  const errorList = useMemo(
    () => errors.map((error) => `${error.field ? `${humanPath(error.field, childMeta?.one ?? 'Row')}: ` : ''}${error.message}`),
    [errors, childMeta],
  );

  return (
    <ErrorsContext.Provider value={errors}>
      <section className="space-y-6 rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              {serviceKey} · {isNew ? 'new item' : 'edit content'}
            </span>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">{asText(item.title) || 'Untitled'}</h2>
            {existing ? (
              <p className="mt-1 text-sm text-gray-500">
                Learner catalog: {registryStatus ? registryStatus : 'not listed yet (saved with the next save)'}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">New items start as drafts; learners see them once published.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-gray-200 p-1" role="group" aria-label="Status">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => set('status', status)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                    item.status === status ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {status === 'draft' ? 'Draft' : status === 'published' ? 'Publish' : 'Archive'}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
              Back to list
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {saving ? 'Saving...' : isNew ? 'Create item' : 'Save content'}
            </button>
          </div>
        </div>

        {isNew ? (
          <div className="space-y-3 rounded-3xl border border-violet-200 bg-violet-50/60 p-5">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Draft with AI</h3>
              <p className="mt-1 text-xs text-gray-600">
                Describe the topic and the AI fills in the whole {serviceKey} item, modelled on one of your published items. Nothing is
                saved until you click Create item, so check every fact and answer first.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block text-xs font-semibold text-gray-700">
                Topic
                <input
                  value={aiTopic}
                  onChange={(event) => setAiTopic(event.target.value)}
                  placeholder="e.g. ordering food at a Tashkent café"
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-gray-700">
                Level
                <select
                  value={aiLevel}
                  onChange={(event) => setAiLevel(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-gray-700">
              Notes for the AI (optional)
              <input
                value={aiNotes}
                onChange={(event) => setAiNotes(event.target.value)}
                placeholder="e.g. focus on polite requests; 5 questions"
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void draftWithAi()}
              disabled={drafting || aiTopic.trim().length < 3}
              className="rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {drafting ? 'Drafting… (up to a minute)' : 'Draft with AI'}
            </button>
          </div>
        ) : null}

        {message ? (
          <div
            className={`rounded-3xl border px-5 py-4 text-sm ${
              message.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {message.text}
            {message.kind === 'error' && errorList.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errorList.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field spec={{ key: 'title', label: 'Title', kind: 'text' }} path="title" value={item.title} onChange={(value) => set('title', value)} />
          <Field
            spec={{ key: 'slug', label: 'Slug', kind: 'text', hint: 'Lowercase words with hyphens; used in links. Changing it changes the item URL.' }}
            path="slug"
            value={item.slug}
            onChange={(value) => {
              setSlugTouched(true);
              set('slug', value);
            }}
          />
          <Field spec={{ key: 'level', label: 'Level', kind: 'select', options: LEVELS }} path="level" value={item.level} onChange={(value) => set('level', value)} />
          <Field spec={{ key: 'sort_order', label: 'Sort order', kind: 'number' }} path="sort_order" value={item.sort_order} onChange={(value) => set('sort_order', value)} />
          <FieldMessages path="status" />
        </div>

        <FieldGrid specs={PARENT_FIELDS[serviceKey]} prefix="" record={item} onChange={set} />

        {serviceKey === 'reading' || serviceKey === 'listening' ? (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Questions</h3>
            <QuestionsEditor value={item.questions} path="questions" withSkill={serviceKey === 'reading'} onChange={(next) => set('questions', next)} />
            {serviceKey === 'reading' ? (
              <div className="flex flex-wrap gap-2">
                {[['tfng', '+ True / False / Not given'], ['headings', '+ Matching headings'], ['gap', '+ Gap fill']].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    className={smallButton}
                    onClick={() => set('questions', [...asArray(item.questions), { id: `${type}${asArray(item.questions).length + 1}`, ...READING_TYPE_TEMPLATES[type!] }])}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {serviceKey === 'writing' ? (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Task points (checklist)</h3>
            <p className="text-sm text-gray-500">Each point becomes one checklist line. Keywords let the basic check see that the point is covered.</p>
            <PointsWithKeywords
              value={item.checklist}
              onChange={(next) => set('checklist', next)}
              path="checklist"
              textKey="point"
              label="Task point"
              hint="Optional, e.g. because, reason"
            />
          </div>
        ) : null}

        {serviceKey === 'speaking' ? (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Cue points</h3>
            <PointsWithKeywords
              value={item.cues}
              onChange={(next) => set('cues', next)}
              path="cues"
              textKey="text"
              label="Cue point"
              hint="Optional words that show the cue was covered"
            />
          </div>
        ) : null}

        {serviceKey === 'grammar' ? (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">Examples</h3>
            <RowList
              rows={asArray(item.examples)}
              onChange={(next) => set('examples', next)}
              path="examples"
              label="Example"
              makeRow={() => ({ bad: '', good: '' })}
              render={(row, index, update) => (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    spec={{ key: 'bad', label: 'Wrong', kind: 'text' }}
                    path={`examples[${index}].bad`}
                    value={row.bad}
                    onChange={(next) => update({ bad: next })}
                  />
                  <Field
                    spec={{ key: 'good', label: 'Right', kind: 'text' }}
                    path={`examples[${index}].good`}
                    value={row.good}
                    onChange={(next) => update({ good: next })}
                  />
                </div>
              )}
            />
          </div>
        ) : null}

        {childMeta ? (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">{childMeta.title}</h3>
            <p className="text-sm text-gray-500">{childMeta.hint}</p>
            <RowList
              rows={children}
              onChange={setChildren}
              path="children"
              label={childMeta.one}
              makeRow={() => newChild(serviceKey)}
              render={(row, index, update) => <ChildFields serviceKey={serviceKey} row={row} index={index} update={update} />}
            />
          </div>
        ) : null}

        <details className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">Advanced (JSON)</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Metadata
              <textarea
                rows={8}
                value={metadataText}
                onChange={(event) => setMetadataText(event.target.value)}
                className={`${inputClass(errors.some((error) => error.field === 'metadata'))} font-mono`}
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">Fields edited above are not shown here.</span>
              <FieldMessages path="metadata" />
            </label>
            {hasPresentation ? (
              <label className="block text-sm font-medium text-gray-700">
                Presentation meta
                <textarea
                  rows={8}
                  value={presentationText}
                  onChange={(event) => setPresentationText(event.target.value)}
                  className={`${inputClass(errors.some((error) => error.field === 'presentation_meta'))} font-mono`}
                />
                <FieldMessages path="presentation_meta" />
              </label>
            ) : null}
          </div>
        </details>
      </section>
    </ErrorsContext.Provider>
  );
};
