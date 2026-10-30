import { s } from '../../../../packages/ai-core/src/mod.ts';
import { buildWritingRequest, type ExamPaper } from '../../_shared/english-exam.ts';
import { WRITING_WORDS } from '../../_shared/english-exam-format.ts';
import { WRITING_SYSTEM_PROMPT } from '../../_shared/english-writing.ts';
import { TOEFL_2026_WRITING_PROFILE } from '../../_shared/toefl-2026-writing.ts';
import { integer, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { countWords, isCefr, learnerInput, ownRecord, quoted, receipt, requireLearner, saveRecord, store, systemFor, track } from './common.ts';
import type { RecordRow } from './store.ts';
import { recordEssay } from '../seams/samples.ts';

// L3 writing coach, L11 essay ladder and L8 application essays.
// Rubrics are Schood's existing ones, not new ones:
//   IELTS Task 1/2: the IELTS profile of grade-writing-v2 (TR, CC, LR, GRA, half bands);
//   TOEFL 2026: _shared/toefl-2026-writing.ts (email and academic discussion, 0–5);
//   Multilevel: _shared/english-exam.ts buildWritingRequest (Task 1.1, 1.2, Part 2);
//   general English: _shared/english-writing.ts (four criteria against the CEFR level).
// Only their rubric text is reused; the output shape is ours. Every line comment
// quotes the learner's draft; a model answer is always labelled as a model.

export const WRITING_EXAMS = ['ielts_task1', 'ielts_task2', 'toefl_email', 'toefl_discussion', 'multilevel_task11', 'multilevel_task12', 'multilevel_part2', 'general'] as const;
export type WritingExam = (typeof WRITING_EXAMS)[number];

// Same rubric sentences as grade-writing-v2's IELTS profile (not exported there).
const IELTS_RUBRIC = [
  'You are a Senior IELTS Writing Examiner.',
  'Grade STRICTLY using IELTS Academic Writing band descriptors on a 0.0-9.0 scale.',
  'For each task, score: Task Response (TR), Coherence and Cohesion (CC), Lexical Resource (LR), Grammatical Range and Accuracy (GRA).',
  'Use 0.5 band increments only.',
  'Be clinical and exam-standard. Do not be lenient.',
].join(' ');
/** The rubric part of a shared prompt, without its own output-format instructions. */
export const rubricOnly = (prompt: string) => prompt.split(/\s*(?:Return (?:strict|ONLY|only)\b|Return strict JSON)/)[0].replace(/Return ONLY valid JSON[^.]*\./g, '').trim();

interface Scale { criteria: { key: string; name: string; max: number }[]; step: number; label: string; overallMax: number }
export const SCALES: Record<WritingExam, Scale> = {
  ielts_task1: { criteria: [{ key: 'TR', name: 'Task Achievement', max: 9 }, { key: 'CC', name: 'Coherence and Cohesion', max: 9 }, { key: 'LR', name: 'Lexical Resource', max: 9 }, { key: 'GRA', name: 'Grammatical Range and Accuracy', max: 9 }], step: 0.5, label: 'IELTS band', overallMax: 9 },
  ielts_task2: { criteria: [{ key: 'TR', name: 'Task Response', max: 9 }, { key: 'CC', name: 'Coherence and Cohesion', max: 9 }, { key: 'LR', name: 'Lexical Resource', max: 9 }, { key: 'GRA', name: 'Grammatical Range and Accuracy', max: 9 }], step: 0.5, label: 'IELTS band', overallMax: 9 },
  toefl_email: { criteria: [{ key: 'score', name: 'Write an Email', max: 5 }], step: 1, label: 'TOEFL score', overallMax: 5 },
  toefl_discussion: { criteria: [{ key: 'score', name: 'Academic Discussion', max: 5 }], step: 1, label: 'TOEFL score', overallMax: 5 },
  multilevel_task11: { criteria: [{ key: 'task11', name: 'Task 1.1', max: 5 }], step: 1, label: 'Multilevel points', overallMax: 5 },
  multilevel_task12: { criteria: [{ key: 'task12', name: 'Task 1.2', max: 5 }], step: 1, label: 'Multilevel points', overallMax: 5 },
  multilevel_part2: { criteria: [{ key: 'part2', name: 'Part 2', max: 6 }], step: 1, label: 'Multilevel points', overallMax: 6 },
  general: { criteria: [{ key: 'task', name: 'Task', max: 100 }, { key: 'organisation', name: 'Organisation', max: 100 }, { key: 'vocabulary', name: 'Vocabulary', max: 100 }, { key: 'grammar', name: 'Grammar', max: 100 }], step: 1, label: 'Score', overallMax: 100 },
};

function rubricFor(exam: WritingExam, prompt: string, draft: string): string {
  if (exam.startsWith('ielts')) return `${IELTS_RUBRIC} This is ${exam === 'ielts_task1' ? 'Task 1 (report on a visual, at least 150 words)' : 'Task 2 (essay, at least 250 words)'}.`;
  if (exam.startsWith('toefl')) return `${rubricOnly(TOEFL_2026_WRITING_PROFILE.systemInstruction)} This answer is task type ${exam === 'toefl_email' ? 'toefl_email' : 'toefl_academic_discussion'}.`;
  if (exam.startsWith('multilevel')) {
    const task = exam.replace('multilevel_', '') as 'task11' | 'task12' | 'part2';
    const shared = buildWritingRequest({ writing: { input: '', task11: prompt, task12: prompt, part2: prompt } } as unknown as ExamPaper, { task11: draft, task12: draft, part2: draft }).systemPrompt;
    return `${rubricOnly(shared)} Mark only ${task === 'task11' ? 'Task 1.1' : task === 'task12' ? 'Task 1.2' : 'Part 2'} (target ${WRITING_WORDS[task].label} words).`;
  }
  return rubricOnly(WRITING_SYSTEM_PROMPT);
}

const FEEDBACK_SCHEMA = s.object({
  overall: s.number({ min: 0, max: 100 }),
  cefr: s.optional(s.nullable(s.string({ max: 4 }))),
  criteria: s.array(s.object({ key: s.string({ max: 20 }), score: s.number({ min: 0, max: 100 }), comment: s.string({ max: 400 }) }), { min: 1, max: 6 }),
  summary: s.string({ max: 800 }),
  strengths: s.array(s.string({ max: 300 }), { max: 4 }),
  line_comments: s.array(s.object({ quote: s.string({ max: 300 }), issue: s.string({ max: 300 }), suggestion: s.string({ max: 300 }), category: s.optional(s.string({ max: 20 })) }), { max: 12 }),
  rewrite: s.object({ original: s.string({ max: 1500 }), improved: s.string({ max: 2000 }), why: s.string({ max: 400 }) }),
  next_steps: s.array(s.string({ max: 300 }), { max: 4 }),
});

const roundTo = (value: number, step: number, max: number) => Math.max(0, Math.min(max, Math.round(value / step) * step));

// POST learner/writing-feedback { exam, task_prompt?, draft, level? }
export async function writingFeedback(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'writing.feedback');
  const exam = oneOf(body.exam, 'exam', WRITING_EXAMS);
  const prompt = optionalText(body.task_prompt, 'task_prompt', { max: 3000 }) ?? '';
  const draft = text(body.draft, 'draft', { max: 12000 });
  const words = countWords(draft);
  if (words < 20) throw new SchoodAIError('too_short', 'Write at least 20 words for feedback.', 422, { words });
  const level = isCefr(body.level) ? body.level : null;
  const scale = SCALES[exam];
  const out = await ctx.ai.json({
    key: 'writing.feedback', schema: FEEDBACK_SCHEMA, maxTokens: 2500, temperature: 0.2,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Writing coach', instructions: [
        rubricFor(exam, prompt, draft),
        `Score each criterion (${scale.criteria.map((entry) => `${entry.key} 0-${entry.max}`).join(', ')}) and give overall on the same scale (0-${scale.overallMax}${scale.step === 0.5 ? ', half bands' : ', whole numbers'}). Set cefr to your CEFR estimate of the writing (A1-C2).`,
        'line_comments: up to 8 of the most useful comments. quote MUST be copied exactly from the learner\'s draft (a short phrase or sentence); issue says what is wrong; suggestion gives a better version of that same phrase.',
        'rewrite: take one weak paragraph (original copied exactly) and rewrite it one level higher, keeping the learner\'s ideas; why says what changed.',
        'next_steps: up to 3 concrete things to practise. Do not write a full model essay here.',
      ] }) },
      { role: 'user', content: learnerInput({ exam, task: prompt || null, target_level: level, word_count: words, draft }) },
    ],
  });
  const data = out.data;
  const criteria = scale.criteria.map((entry) => {
    const given = data.criteria.find((row) => row.key.toLowerCase() === entry.key.toLowerCase()) ?? (scale.criteria.length === 1 ? data.criteria[0] : undefined);
    return given ? { key: entry.key, name: entry.name, score: roundTo(given.score, scale.step, entry.max), max: entry.max, comment: given.comment } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => !!entry);
  const comments = data.line_comments.filter((entry) => quoted(entry.quote, draft)).slice(0, 8);
  const rewrite = quoted(data.rewrite.original, draft) ? data.rewrite : null;
  const overall = roundTo(data.overall, scale.step, scale.overallMax);
  const feedback = {
    exam, scale: { label: scale.label, max: scale.overallMax, step: scale.step }, overall, cefr: isCefr(data.cefr) ? data.cefr : null, words,
    criteria, summary: data.summary, strengths: data.strengths, line_comments: comments, rewrite, next_steps: data.next_steps,
  };
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'writing', credits: out.credits, input: { exam, task_prompt: prompt, draft, level }, output: { feedback } });
  track(ctx, access, {
    feature: 'L3', kind: 'writing', score: overall, minutes: Math.min(60, Math.round(words / 15)),
    summary: { exam, overall, issues: comments.slice(0, 3).map((entry) => ({ said: entry.quote, better: entry.suggestion })), next: data.next_steps.slice(0, 2) },
    event: { kind: 'drill_finished', skill: `writing.${exam}`, score: overall, verified_minutes: Math.max(1, Math.min(60, Math.round(words / 15))), ref: row.id },
  });
  // Engage's then-vs-now: the essay with its scores (seams/samples.ts).
  recordEssay(ctx, { id: row.id, feature: 'L3', text: draft, scores: { overall, ...Object.fromEntries(criteria.map((entry) => [entry.key, entry.score])) }, promptKey: exam });
  return { writing: writingView(row), ...receipt(out) };
}

export function writingView(row: RecordRow) {
  return { id: row.id, kind: row.kind, input: row.input, ...row.output, created_at: row.createdAt };
}

const MODEL_SCHEMA = s.object({ text: s.string({ min: 40, max: 6000 }), notes: s.array(s.string({ max: 300 }), { max: 5 }) });
// POST learner/writing-model { id }: a model answer to the same task, labelled as a model.
export async function writingModel(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'writing.model');
  const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'writing');
  if (row.output.model_answer) return { writing: writingView(row), credits: 0 };
  const exam = row.input.exam as WritingExam;
  const out = await ctx.ai.json({
    key: 'writing.model', schema: MODEL_SCHEMA, maxTokens: 1800, temperature: 0.5, reference: `writing-model:${row.id}`,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Writing coach', instructions: [
        `Write one original model answer for this ${exam.replace(/_/g, ' ')} task, at the top of the scale, with a natural length for the task.`,
        'If no task is given, write on the same topic as the learner\'s draft. Do not reuse the learner\'s sentences.',
        'notes: up to 4 short points on what makes it strong, in the explanation language.',
      ] }) },
      { role: 'user', content: learnerInput({ task: row.input.task_prompt || null, learner_draft_topic: String(row.input.draft ?? '').slice(0, 1500) }) },
    ],
  });
  const saved = await saveRecord(ctx, row, { output: { ...row.output, model_answer: { label: 'model', text: out.data.text, notes: out.data.notes } }, credits: row.credits + out.credits });
  return { writing: writingView(saved), ...receipt(out) };
}

const LADDER_LEVELS: Record<string, string[]> = { ielts: ['6.0', '7.0', '8.0'], toefl: ['3', '4', '5'], multilevel: ['B1', 'B2', 'C1'], general: ['B1', 'B2', 'C1'] };
const LADDER_SCHEMA = s.object({
  rungs: s.array(s.object({ level: s.string({ max: 10 }), text: s.string({ min: 20, max: 5000 }), changes: s.array(s.object({ what: s.string({ max: 300 }), why: s.string({ max: 300 }) }), { max: 6 }) }), { min: 3, max: 3 }),
});
// POST learner/essay-ladder { id } or { exam, draft }: the learner's essay at three levels, side by side.
export async function essayLadder(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'writing.ladder');
  let exam: WritingExam, draft: string, source: string | null = null;
  if (body.id !== undefined) {
    const row = await ownRecord(ctx, access, uuid(body.id, 'id'), 'writing');
    exam = row.input.exam as WritingExam; draft = String(row.input.draft ?? ''); source = row.id;
  } else {
    exam = oneOf(body.exam, 'exam', WRITING_EXAMS); draft = text(body.draft, 'draft', { max: 8000 });
  }
  if (countWords(draft) < 40) throw new SchoodAIError('too_short', 'The ladder needs at least 40 words.', 422);
  const family = exam.split('_')[0];
  const levels = LADDER_LEVELS[family] ?? LADDER_LEVELS.general;
  const out = await ctx.ai.json({
    key: 'writing.ladder', schema: LADDER_SCHEMA, maxTokens: 4000, temperature: 0.4, reference: source ? `ladder:${source}:${ctx.idempotencyKey ?? ''}` : undefined,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Essay ladder', instructions: [
        `Rewrite the learner's own essay at three levels: ${levels.join(', ')} (${family === 'ielts' ? 'IELTS bands' : family === 'toefl' ? 'TOEFL writing scores' : 'CEFR levels'}).`,
        'Keep the learner\'s ideas, structure and length; change only the language and organisation needed for each level. Each rung is a full rewrite.',
        'changes: up to 5 points per rung saying what changed from the level below and why it earns that level.',
      ] }) },
      { role: 'user', content: learnerInput({ exam, essay: draft }) },
    ],
  });
  const rungs = out.data.rungs.map((rung, index) => ({ ...rung, level: levels[index] ?? rung.level, label: 'model' }));
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'ladder', credits: out.credits, input: { exam, draft, source }, output: { rungs } });
  track(ctx, access, { feature: 'L11', kind: 'ladder', summary: { exam, levels } });
  return { ladder: { id: row.id, exam, original: draft, rungs }, ...receipt(out) };
}

// --- L8 Application essays -------------------------------------------------------------------
export const ESSAY_KINDS = ['personal_statement', 'motivation_letter', 'scholarship_essay', 'cv', 'cover_letter'] as const;
const ESSAY_SCHEMA = s.object({
  overall: s.string({ max: 800 }),
  structure: s.array(s.object({ part: s.string({ max: 80 }), status: s.enumOf(['strong', 'ok', 'weak', 'missing'] as const), comment: s.string({ max: 400 }) }), { max: 8 }),
  strengths: s.array(s.string({ max: 300 }), { max: 4 }),
  issues: s.array(s.object({ issue: s.string({ max: 300 }), why: s.string({ max: 300 }), fix: s.string({ max: 300 }) }), { max: 6 }),
  line_edits: s.array(s.object({ quote: s.string({ max: 400 }), suggestion: s.string({ max: 400 }), why: s.string({ max: 300 }) }), { max: 10 }),
  questions: s.array(s.string({ max: 300 }), { max: 6 }),
  next_draft: s.array(s.string({ max: 300 }), { max: 5 }),
});
/** Line edits stay edits: each quotes the essay, and together they never rewrite most of it. */
export function limitEdits(edits: { quote: string; suggestion: string; why: string }[], essay: string) {
  const kept: typeof edits = [];
  let size = 0;
  for (const edit of edits) {
    if (!quoted(edit.quote, essay) || edit.suggestion.length > 400) continue;
    if (size + edit.suggestion.length > essay.length * 0.4) break;
    kept.push(edit);
    size += edit.suggestion.length;
  }
  return kept;
}
// POST learner/essay-review { kind, text, target?, prompt?, word_limit? }
export async function essayReview(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await requireLearner(ctx, 'essay.review');
  const kind = oneOf(body.kind, 'kind', ESSAY_KINDS);
  const essay = text(body.text, 'text', { max: 15000 });
  if (countWords(essay) < 50) throw new SchoodAIError('too_short', 'Paste at least 50 words.', 422);
  const target = optionalText(body.target, 'target', { max: 200 }), prompt = optionalText(body.prompt, 'prompt', { max: 2000 });
  const limit = body.word_limit === undefined || body.word_limit === null ? null : integer(body.word_limit, 'word_limit', 50, 5000);
  const out = await ctx.ai.json({
    key: 'essay.review', schema: ESSAY_SCHEMA, maxTokens: 2500, temperature: 0.3,
    messages: [
      { role: 'system', content: systemFor(ctx, access, { name: 'Application essay coach', instructions: [
        `You coach a learner on their own ${kind.replace(/_/g, ' ')}. You give structure, feedback and line edits. You NEVER write the essay, a full paragraph or a version to submit, even if asked: the words must stay the learner's.`,
        'structure: the parts this kind of document needs and how each one is doing in this draft.',
        'issues: the most important problems with a concrete fix the learner can do themselves.',
        'line_edits: up to 8 small edits; quote MUST be copied exactly from the draft, suggestion is at most two sentences.',
        'questions: questions the learner should answer in their own words to make the essay specific and personal.',
        'Never invent achievements, grades or facts about the learner. Never state admission or scholarship requirements; say to check the official site.',
        limit ? `The word limit is ${limit}; the draft has ${countWords(essay)} words.` : '',
      ].filter(Boolean) }) },
      { role: 'user', content: learnerInput({ kind, target, prompt, essay }) },
    ],
  });
  const review = { kind, target, words: countWords(essay), word_limit: limit, ...out.data, line_edits: limitEdits(out.data.line_edits, essay) };
  const row = await store(ctx).createRecord({ userId: ctx.user.id, workspaceId: access.workspace.id, kind: 'essay', credits: out.credits, input: { kind, target, prompt, text: essay, word_limit: limit }, output: { review } });
  track(ctx, access, { feature: 'L8', kind: 'essay', summary: { kind, issues: review.issues.slice(0, 2).map((entry) => entry.issue) } });
  return { essay: { id: row.id, ...review, created_at: row.createdAt }, ...receipt(out) };
}

// GET learner/writing: recent feedback, ladders and essay reviews; ?id= for one.
export async function writingHistory(ctx: RequestContext) {
  const access = await ctx.workspace();
  const id = ctx.query.get('id');
  if (id) {
    const row = await store(ctx).record(uuid(id, 'id'));
    if (!row || row.userId !== ctx.user.id || row.workspaceId !== access.workspace.id || !['writing', 'ladder', 'essay'].includes(row.kind)) throw new SchoodAIError('not_found', 'Not found.', 404);
    return { item: writingView(row) };
  }
  const [writing, ladders, essays] = await Promise.all((['writing', 'ladder', 'essay'] as const).map((kind) => store(ctx).records(ctx.user.id, { kind, workspaceId: access.workspace.id, limit: 15 })));
  const brief = (row: RecordRow) => ({ id: row.id, kind: row.kind, exam: row.input.exam ?? row.input.kind, overall: (row.output.feedback as { overall?: number } | undefined)?.overall ?? null, excerpt: String(row.input.draft ?? row.input.text ?? '').slice(0, 120), created_at: row.createdAt });
  return { items: [...writing, ...ladders, ...essays].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(brief) };
}

export const writingRoutes = {
  'writing-feedback': { POST: writingFeedback },
  'writing-model': { POST: writingModel },
  'essay-ladder': { POST: essayLadder },
  'essay-review': { POST: essayReview },
  writing: { GET: writingHistory },
};
