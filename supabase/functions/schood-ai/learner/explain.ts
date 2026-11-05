import { s } from '../../../../packages/ai-core/src/mod.ts';
import { integer, isUuid, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { learnerInput, ownRecord, receipt, requireLearner, saveRecord, store, systemFor, track } from './common.ts';

// L2 Explain my mistake: why an answer is wrong, the rule behind it, then three
// new similar items to try. The answer keys of the new items stay on the server
// until the learner answers. A results screen in another Schood app opens
// ai.schood.online/explain?source=<app>&session=<id>&item=<id>; for the exam
// simulators (IELTS, SAT, TOEFL, iTEP) the item is loaded from review-session with
// the learner's own token, otherwise the learner pastes the question.

export const EXAMS = ['ielts', 'toefl', 'sat', 'multilevel', 'itep', 'admission', 'general'] as const;
const REVIEW_SOURCES: Record<string, (typeof EXAMS)[number]> = { ielts: 'ielts', 'ielts-practice': 'ielts', sat: 'sat', toefl: 'toefl', itep: 'itep' };

const similarItem = s.object({
  prompt: s.string({ min: 3, max: 500 }),
  options: s.array(s.string({ min: 1, max: 200 }), { min: 2, max: 5 }),
  answer_index: s.number({ min: 0, max: 4, integer: true }),
  explanation: s.string({ min: 1, max: 500 }),
});
export const EXPLAIN_SCHEMA = s.object({
  correct_answer: s.string({ max: 400 }),
  why_wrong: s.string({ min: 1, max: 1500 }),
  rule: s.string({ min: 1, max: 1000 }),
  tip: s.string({ max: 400 }),
  similar: s.array(similarItem, { max: 3 }),
});
type Similar = { prompt: string; options: string[]; answer_index: number; explanation: string };

/** Keeps items whose options are distinct and whose key points at one of them. */
export function checkedItems(items: Similar[]): Similar[] {
  return items.filter((item) => {
    const options = item.options.map((option) => option.trim().toLowerCase());
    return new Set(options).size === options.length && item.answer_index < item.options.length && !options.some((option) => !option);
  }).slice(0, 3);
}

// POST learner/explain { question, my_answer?, correct_answer?, options?, exam?, skill?, source? }
export async function explain(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'explain.mistake');
  const input = {
    question: text(body.question, 'question', { max: 3000 }),
    my_answer: optionalText(body.my_answer, 'my_answer', { max: 500 }),
    correct_answer: optionalText(body.correct_answer, 'correct_answer', { max: 500 }),
    options: body.options === undefined ? [] : stringList(body.options, 'options', { max: 6, pattern: /^[\s\S]{1,300}$/ }),
    exam: body.exam === undefined ? 'general' : oneOf(body.exam, 'exam', EXAMS),
    skill: optionalText(body.skill, 'skill', { max: 60 }),
    source: body.source && typeof body.source === 'object' ? sourceRef(body.source as Record<string, unknown>) : null,
  };
  const blocks = await ctx.context(['learner_profile', 'learner_snapshot'], { specialist: 'explain' });
  const out = await ctx.ai.json({
    key: 'explain.mistake', schema: EXPLAIN_SCHEMA, maxTokens: 1600, temperature: 0.3,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Mistake explainer', instructions: [
        `You explain one ${input.exam === 'general' ? 'English or Maths' : input.exam.toUpperCase()} question the learner got wrong.`,
        'If the correct answer is given, trust it; if not, work it out carefully and say so in correct_answer.',
        'why_wrong: why the learner\'s answer is wrong (or, if they gave none, the trap in the question), in 2-4 short sentences that refer to their answer.',
        'rule: the rule, strategy or concept behind the question, with one short example.',
        'tip: one practical tip for next time.',
        'similar: exactly three NEW questions that test the same rule at the same level, each with 3-4 options, exactly one correct (answer_index from 0) and a one-sentence explanation. Do not copy the original question.',
      ] }, blocks) },
      { role: 'user', content: learnerInput({ question: input.question, options: input.options, learner_answer: input.my_answer, correct_answer: input.correct_answer, skill: input.skill }) },
    ],
  });
  const similar = checkedItems(out.data.similar as Similar[]);
  const row = await store(ctx).createRecord({
    userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'explain', credits: out.credits,
    input, output: { correct_answer: out.data.correct_answer, why_wrong: out.data.why_wrong, rule: out.data.rule, tip: out.data.tip, similar: similar.map((item) => ({ prompt: item.prompt, options: item.options })) },
    secret: { keys: similar.map((item) => ({ answer_index: item.answer_index, explanation: item.explanation })) }, state: { answers: {} },
  });
  track(ctx, access, { feature: 'L2', kind: 'mistake', summary: { exam: input.exam, skill: input.skill, question: input.question.slice(0, 160), rule: out.data.rule.slice(0, 160) } });
  return { explanation: explanationView(row), ...receipt(out) };
}

function explanationView(row: Awaited<ReturnType<typeof ownRecord>>) {
  const answers = (row.state.answers ?? {}) as Record<string, { choice: number; correct: boolean }>;
  const keys = (row.secret.keys ?? []) as { answer_index: number; explanation: string }[];
  return {
    id: row.id, ...row.output, input: row.input,
    // A key is shown only for items already answered.
    results: Object.fromEntries(Object.entries(answers).map(([index, answer]) => [index, { ...answer, answer_index: keys[Number(index)]?.answer_index ?? null, explanation: keys[Number(index)]?.explanation ?? null }])),
    created_at: row.createdAt,
  };
}

// POST learner/explain-answer { id, item, choice }: checks one of the three new items (no model call).
export async function explainAnswer(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'L2');
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'explain');
  const keys = (row.secret.keys ?? []) as { answer_index: number; explanation: string }[];
  const item = integer(body.item, 'item', 0, Math.max(0, keys.length - 1));
  const choice = integer(body.choice, 'choice', 0, 4);
  const answers = (row.state.answers ?? {}) as Record<string, { choice: number; correct: boolean }>;
  if (!keys[item]) throw new SchoodAIError('not_found', 'Not found.', 404);
  if (!answers[item]) {
    const correct = keys[item].answer_index === choice;
    answers[item] = { choice, correct };
    await saveRecord(ctx, row, { state: { ...row.state, answers } });
    track(ctx, access, { feature: 'L2', kind: 'check', score: correct ? 1 : 0, summary: { rule: String(row.output.rule ?? '').slice(0, 120), correct }, event: { kind: correct ? 'check_passed' : 'check_failed', skill: `explain.${row.input.exam ?? 'general'}`, verified_minutes: correct ? 1 : 0, ref: `${row.id}:${item}` } });
  }
  return { item, correct: answers[item].correct, choice: answers[item].choice, answer_index: keys[item].answer_index, explanation: keys[item].explanation };
}

// GET learner/explanations: the recent ones; ?id= for one.
export async function explanations(ctx: RequestContext) {
  const access = await ctx.workspace();
  const id = ctx.query.get('id');
  if (id) return { explanation: explanationView(await ownRecord(ctx, access, uuid(id, 'id'), 'explain')) };
  const list = await store(ctx).records(ctx.user.id, { kind: 'explain', workspaceId: access.workspace.id, limit: 20 });
  return { explanations: list.map((row) => ({ id: row.id, question: String(row.input.question ?? '').slice(0, 160), exam: row.input.exam, created_at: row.createdAt })) };
}

const sourceRef = (value: Record<string, unknown>) => ({
  app: typeof value.app === 'string' && /^[a-z][a-z0-9-]{1,30}$/.test(value.app) ? value.app : null,
  session: isUuid(value.session) ? String(value.session).toLowerCase() : null,
  item: isUuid(value.item) ? String(value.item).toLowerCase() : null,
});

const flat = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flat).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    for (const key of ['value', 'answer', 'text', 'selected', 'selected_options', 'choice', 'answers', 'correct']) if (row[key] !== undefined) return flat(row[key]);
  }
  return '';
};
const optionText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const label = flat(row.label ?? row.key ?? row.id), body = flat(row.text ?? row.content ?? row.value);
    return label && body && label !== body ? `${label}. ${body}` : body || label;
  }
  return '';
};

/** A review-session unit as the explain form needs it. */
export function itemFromReview(unit: Record<string, unknown>) {
  const data = unit.data && typeof unit.data === 'object' ? unit.data as Record<string, unknown> : {};
  const question = [data.question, data.prompt, data.stem, data.text, data.instruction, data.title].map(flat).find((entry) => entry.trim().length > 3) ?? '';
  const options = (Array.isArray(data.options) ? data.options : Array.isArray(data.choices) ? data.choices : []).map(optionText).filter(Boolean).slice(0, 6);
  return {
    question: question.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000),
    options: options.map((entry) => entry.slice(0, 300)),
    my_answer: flat(unit.answer).slice(0, 500) || null,
    correct_answer: flat(unit.correct).slice(0, 500) || null,
    is_correct: typeof unit.is_correct === 'boolean' ? unit.is_correct : null,
    part:typeof unit.part_name === 'string' ? unit.part_name.slice(0, 80) : null,
  };
}

// GET learner/explain-source?source=&session=&item=: loads the question behind a deep link (no model call).
export async function explainSource(ctx: RequestContext) {
  await ctx.workspace();
  const source = ctx.query.get('source') ?? '', session = ctx.query.get('session'), item = ctx.query.get('item');
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(source)) throw new SchoodAIError('invalid_request', 'source must name a Schood app.', 400, { field: 'source' });
  const exam = REVIEW_SOURCES[source] ?? (source.startsWith('sat') ? 'sat' : source.startsWith('english') ? 'general' : source === 'admission' ? 'admission' : 'general');
  const ref = { app: source, session: isUuid(session) ? session!.toLowerCase() : null, item: isUuid(item) ? item!.toLowerCase() : null };
  if (!REVIEW_SOURCES[source] || !ref.session || !ref.item || !ctx.user.token) return { found: false, exam, source: ref };
  try {
    const review = await ctx.functions.call<Record<string, unknown>>('review-session', '', { query: { session_id: ref.session }, timeoutMs: 6_000, maxBytes: 2_000_000 });
    const unit = (Array.isArray(review?.units) ? review.units as Record<string, unknown>[] : []).find((entry) => String(entry.id).toLowerCase() === ref.item);
    if (!unit) return { found: false, exam, source: ref };
    const loaded = itemFromReview(unit);
    return loaded.question ? { found: true, exam, source: ref, item: loaded } : { found: false, exam, source: ref };
  } catch {
    return { found: false, exam, source: ref };
  }
}

export const explainRoutes = {
  explain: { POST: explain },
  'explain-answer': { POST: explainAnswer },
  explanations: { GET: explanations },
  'explain-source': { GET: explainSource },
};
