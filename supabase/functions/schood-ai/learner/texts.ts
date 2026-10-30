import { s } from '../../../../packages/ai-core/src/mod.ts';
import { integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { loadProfile, openAssignments } from './tutor.ts';
import { CEFR, countWords, imageFrom, isCefr, learnerInput, normalise, ownRecord, quoted, receipt, requireLearner, saveRecord, store, systemFor, track, type Cefr } from './common.ts';
import type { NotebookWord } from './store.ts';

// L6 Words from my texts, L10 Graded reading and L9 Photo explain.
// Words are saved into the learner's existing English vocabulary notebook (the
// one word store the English apps and the bot use), never a second notebook.
// Reading answer keys and photo solutions stay on the server until earned.

const levelFrom = async (ctx: RequestContext, value: unknown): Promise<Cefr> => {
  if (isCefr(value)) return value;
  try {
    const profile = await loadProfile(ctx);
    const estimate = profile?.cefr_estimate;
    if (isCefr(estimate)) return estimate;
  } catch { /* no profile yet */ }
  return 'B1';
};

// --- L6 -------------------------------------------------------------------------------------
const WORD = s.object({
  word: s.string({ min: 1, max: 60 }), lemma: s.optional(s.string({ max: 60 })), pos: s.optional(s.string({ max: 20 })), level: s.optional(s.string({ max: 4 })),
  definition: s.string({ min: 2, max: 300 }), meaning_uz: s.string({ max: 200 }), meaning_ru: s.string({ max: 200 }), example: s.string({ max: 300 }),
});
const WORDS_SCHEMA = s.object({ title: s.optional(s.string({ max: 120 })), words: s.array(WORD, { min: 1, max: 25 }) });

/** Words that really occur in the text (as written or as their lemma), each once. */
export function wordsInText<T extends { word: string; lemma?: string }>(words: T[], source: string | null): T[] {
  const haystack = source ? ` ${normalise(source)} ` : null;
  const seen = new Set<string>();
  return words.filter((entry) => {
    const key = normalise(entry.word);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (!haystack) return true;
    const stem = key.length > 4 ? key.slice(0, key.length - 2) : key;
    return haystack.includes(` ${key}`) || (entry.lemma ? haystack.includes(` ${normalise(entry.lemma)}`) : false) || haystack.includes(` ${stem}`);
  });
}

// POST learner/words { text? | image?, level? }
export async function wordsFromText(ctx: RequestContext) {
  const body = record(await ctx.body());
  const image = body.image === undefined || body.image === null ? null : imageFrom(body.image);
  const source = image ? null : text(body.text, 'text', { max: 6000 });
  if (source && countWords(source) < 10) throw new SchoodAIError('too_short', 'Paste at least a few sentences.', 422);
  const key = image ? 'words.from_photo' : 'words.from_text';
  const access = await requireLearner(ctx, key);
  const level = await levelFrom(ctx, body.level);
  const out = await ctx.ai.json({
    key, schema: WORDS_SCHEMA, maxTokens: 2500, temperature: 0.2,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Vocabulary coach', instructions: [
        `Pick up to 15 words or short phrases from the learner's text that are worth learning for a ${level} learner: a little above their level, useful, not names.`,
        'Copy each word exactly as it appears in the text; give its lemma, part of speech, CEFR level, a simple English definition, the meaning in Uzbek (Latin script) and in Russian, and one new example sentence.',
        image ? 'The text is in the photo: read it carefully first. Ignore handwriting you cannot read.' : '',
      ].filter(Boolean) }) },
      { role: 'user', content: image ? [{ type: 'text', text: learnerInput({ level, note: 'The text is in the attached photo.' }) }, { type: 'image', url: image }] : learnerInput({ level, text: source }) },
    ],
  });
  const words = wordsInText(out.data.words, source).slice(0, 15).map((entry) => ({ ...entry, level: isCefr(entry.level) ? entry.level : null }));
  if (!words.length) throw new SchoodAIError('no_words', 'No new words were found in this text.', 422);
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'words', credits: out.credits, input: { source: image ? 'photo' : 'text', text: source?.slice(0, 6000) ?? null, level }, output: { title: out.data.title ?? null, words }, state: { saved: [] } });
  track(ctx, access, { feature: 'L6', kind: 'words', summary: { count: words.length, words: words.slice(0, 6).map((entry) => entry.word) } });
  return { list: { id: row.id, level, title: out.data.title ?? null, words, saved: [] }, ...receipt(out) };
}

// POST learner/words-save { id, indices }: into the English vocabulary notebook.
export async function saveWords(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'L6');
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), body.kind === 'reading' ? 'reading' : 'words');
  const words = ((row.kind === 'reading' ? row.output.words : row.output.words) ?? []) as { word: string; definition?: string; meaning_en?: string; meaning_uz: string; meaning_ru: string; example?: string; level?: string | null }[];
  if (!Array.isArray(body.indices) || body.indices.length > 25) throw new SchoodAIError('invalid_request', 'indices must be a list.', 400, { field: 'indices' });
  const indices = [...new Set(body.indices.map((value) => integer(value, 'indices', 0, Math.max(0, words.length - 1))))];
  const picked: NotebookWord[] = indices.map((index) => words[index]).filter(Boolean).map((entry) => ({
    word: entry.word, definition: entry.definition ?? entry.meaning_en ?? '', example: entry.example ?? null, meaningUz: entry.meaning_uz || null, meaningRu: entry.meaning_ru || null, level: entry.level ?? null,
  }));
  const added = await store(ctx).saveNotebookWords(ctx.user.id, picked, { label: 'Schood AI', ref: `${row.kind}:${row.id}` }, ctx.now().toISOString());
  const saved = [...new Set([...((row.state.saved ?? []) as number[]), ...indices])];
  await saveRecord(ctx, row, { state: { ...row.state, saved } });
  track(ctx, access, { feature: 'L6', kind: 'words_saved', summary: { count: picked.length, added } });
  return { saved, added, already: picked.length - added };
}

// --- L10 ------------------------------------------------------------------------------------
const READING_SCHEMA = s.object({
  title: s.string({ min: 2, max: 120 }),
  text: s.string({ min: 200, max: 4000 }),
  questions: s.array(s.object({ prompt: s.string({ min: 3, max: 300 }), options: s.array(s.string({ min: 1, max: 200 }), { min: 3, max: 4 }), answer_index: s.number({ min: 0, max: 3, integer: true }), explanation: s.string({ max: 300 }) }), { min: 3, max: 6 }),
  words: s.array(s.object({ word: s.string({ max: 60 }), meaning_en: s.string({ max: 200 }), meaning_uz: s.string({ max: 200 }), meaning_ru: s.string({ max: 200 }) }), { max: 10 }),
});
const LENGTHS = { short: [150, 220], medium: [250, 380] } as const;

// POST learner/reading { topic, level?, length? }
export async function gradedReading(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'reading.graded');
  const topic = text(body.topic, 'topic', { max: 120 });
  const length = body.length === undefined ? 'short' : oneOf(body.length, 'length', ['short', 'medium'] as const);
  const level = await levelFrom(ctx, body.level);
  const [min, max] = LENGTHS[length];
  const out = await ctx.ai.json({
    key: 'reading.graded', schema: READING_SCHEMA, maxTokens: 2500, temperature: 0.6,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Graded reader', instructions: [
        `Write an original, interesting text in English of ${min}-${max} words about the learner's topic, strictly at CEFR ${level} (grammar and vocabulary). The text itself is in English.`,
        'Then 4-5 multiple-choice questions on the text (main idea, detail, vocabulary in context, inference), each with 3-4 options, exactly one correct, and a one-sentence explanation.',
        'words: 5-8 words from the text that are new at this level, with meanings in English, Uzbek (Latin) and Russian.',
      ] }) },
      { role: 'user', content: learnerInput({ topic, level, length }) },
    ],
  });
  const reading = out.data;
  const questions = reading.questions.filter((question) => question.answer_index < question.options.length && new Set(question.options.map((option) => option.toLowerCase().trim())).size === question.options.length);
  if (questions.length < 3) throw new SchoodAIError('ai_failed', 'The reading could not be checked. Try again.', 502);
  const words = wordsInText(reading.words, reading.text);
  const row = await store(ctx).createRecord({
    userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'reading', credits: out.credits,
    input: { topic, level, length }, output: { title: reading.title, text: reading.text, questions: questions.map((question) => ({ prompt: question.prompt, options: question.options })), words, words_count: countWords(reading.text) },
    secret: { keys: questions.map((question) => ({ answer_index: question.answer_index, explanation: question.explanation })) }, state: {},
  });
  track(ctx, access, { feature: 'L10', kind: 'reading_started', summary: { topic, level } });
  return { reading: readingView(row), ...receipt(out) };
}
function readingView(row: Awaited<ReturnType<typeof ownRecord>>) {
  return { id: row.id, ...row.input, ...row.output, result: row.state.result ?? null, created_at: row.createdAt };
}

// POST learner/reading-check { id, answers }: marks once and shows the keys.
export async function readingCheck(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'L10');
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'reading');
  if (row.state.result) return { reading: readingView(row) };
  const keys = (row.secret.keys ?? []) as { answer_index: number; explanation: string }[];
  if (!Array.isArray(body.answers) || body.answers.length !== keys.length) throw new SchoodAIError('invalid_request', 'Answer every question.', 400, { field: 'answers' });
  const answers = body.answers.map((value) => integer(value, 'answers', 0, 3));
  const items = keys.map((key, index) => ({ choice: answers[index], answer_index: key.answer_index, correct: answers[index] === key.answer_index, explanation: key.explanation }));
  const correct = items.filter((item) => item.correct).length;
  const score = Math.round((correct / keys.length) * 100);
  const minutes = Math.max(2, Math.round(Number(row.output.words_count ?? 200) / 120) + keys.length);
  const saved = await saveRecord(ctx, row, { status: 'finished', state: { result: { items, correct, total: keys.length, score } } });
  track(ctx, access, { feature: 'L10', kind: 'reading', score, minutes, summary: { topic: row.input.topic, level: row.input.level, correct, total: keys.length }, event: { kind: 'drill_finished', skill: `reading.${String(row.input.level ?? 'b1').toLowerCase()}`, score, verified_minutes: Math.min(30, minutes), ref: row.id } });
  return { reading: readingView(saved) };
}

// GET learner/readings: recent ones; ?id= for one.
export async function readings(ctx: RequestContext) {
  const access = await ctx.workspace();
  const id = ctx.query.get('id');
  if (id) return { reading: readingView(await ownRecord(ctx, access, uuid(id, 'id'), 'reading')) };
  const rows = await store(ctx).records(ctx.user.id, { kind: 'reading', workspaceId: access.workspace.id, limit: 20 });
  return { readings: rows.map((row) => ({ id: row.id, title: row.output.title, level: row.input.level, score: (row.state.result as { score?: number } | undefined)?.score ?? null, created_at: row.createdAt })), levels: CEFR };
}

// --- L9 -------------------------------------------------------------------------------------
const PHOTO_SCHEMA = s.object({
  problem: s.string({ min: 3, max: 1500 }),
  subject: s.enumOf(['maths', 'english', 'other'] as const),
  hints: s.array(s.string({ min: 3, max: 500 }), { min: 2, max: 5 }),
  steps: s.array(s.object({ text: s.string({ min: 1, max: 800 }) }), { min: 1, max: 12 }),
  answer: s.string({ max: 500 }),
});
// POST learner/photo-explain { image, subject?, note? }: hints first; the worked solution on request.
export async function photoExplain(ctx: RequestContext) {
  const body = record(await ctx.body());
  const image = imageFrom(body.image);
  const access = await requireLearner(ctx, 'photo.explain');
  const subject = body.subject === undefined ? 'maths' : oneOf(body.subject, 'subject', ['maths', 'english', 'other'] as const);
  const note = optionalText(body.note, 'note', { max: 500 });
  const out = await ctx.ai.json({
    key: 'photo.explain', schema: PHOTO_SCHEMA, maxTokens: 2500, temperature: 0.2,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Photo explainer', instructions: [
        `The photo shows a ${subject} exercise. Read it carefully and restate the problem in "problem" (with maths in \\( \\) delimiters).`,
        'hints: 2-4 step-by-step hints that lead the learner to solve it themselves, without giving the answer.',
        'steps and answer: the full worked solution, checked twice. These are shown only if the learner asks.',
        'If the photo is unreadable or not an exercise, say so in problem and give hints on how to take a clearer photo.',
      ] }) },
      { role: 'user', content: [{ type: 'text', text: learnerInput({ subject, note }) }, { type: 'image', url: image }] },
    ],
  });
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'photo', credits: out.credits, input: { subject, note }, output: { problem: out.data.problem, subject: out.data.subject, hints: out.data.hints }, secret: { steps: out.data.steps, answer: out.data.answer }, state: {} });
  track(ctx, access, { feature: 'L9', kind: 'photo', summary: { subject, problem: out.data.problem.slice(0, 160) } });
  return { photo: { id: row.id, ...row.output, revealed: false, solution: null }, ...receipt(out) };
}

// POST learner/photo-solution { id }: reveals the worked solution (no new charge),
// unless the learner has centre homework open, which stays hints only.
export async function photoSolution(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'L9');
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'photo');
  if (!row.state.revealed_at) {
    let open = 0;
    try {
      const payload = ctx.user.token ? await ctx.functions.call<Record<string, unknown>>('academy', '', { query: { action: 'student_assignments' }, timeoutMs: 4_000, maxBytes: 600_000 }) : null;
      open = payload ? openAssignments(payload, ctx.now()).length : 0;
    } catch { open = 0; }
    if (open > 0) throw new SchoodAIError('homework_open', 'You have centre homework open, so Schood AI gives hints only for now.', 403, { open });
  }
  const saved = row.state.revealed_at ? row : await saveRecord(ctx, row, { state: { ...row.state, revealed_at: ctx.now().toISOString() } });
  return { photo: { id: saved.id, ...saved.output, revealed: true, solution: saved.secret } };
}

export const textRoutes = {
  words: { POST: wordsFromText, maxBody: 4_500_000 },
  'words-save': { POST: saveWords },
  reading: { POST: gradedReading },
  'reading-check': { POST: readingCheck },
  readings: { GET: readings },
  'photo-explain': { POST: photoExplain, maxBody: 4_500_000 },
  'photo-solution': { POST: photoSolution },
};
