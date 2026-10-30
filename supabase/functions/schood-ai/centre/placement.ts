import {
  CEFR_LEVELS, DEFAULT_CRITERIA, itemsFromQuestions, LEVEL_LABEL, materialLevel, placementKind, placementMaterial, placementProblems, placementTestSchema, publicTest, scoreObjective,
  type CefrLevel, type PlacementTest,
} from '../../../../packages/ai-core/src/centre/placement.ts';
import { compareSolver, draftQuestionsSchema, SOLVER_INSTRUCTIONS, SOLVER_SYSTEM, solverAnswersSchema, solverPayload, solverTasks } from '../../../../packages/ai-core/src/materials/mod.ts';
import { s, SchemaError } from '../../../../packages/ai-core/src/mod.ts';
import { registerMaterialKind } from '../library.ts';
import { dataBlock, wrapUserMessage } from '../prompt.ts';
import { integer, jsonObject, oneOf, optionalText, record, text, uuid } from '../input.ts';
import { SchoodAIError, type ChargedSession, type RequestContext, type SchoodAIRepository } from '../types.ts';
import { centrePrompt, clean, isStaff, pick, requireCentre } from './shared.ts';
import type { AttemptRow, CentreStore } from './store.ts';

// C5 placement tests. A test is a library page of kind centre.placement_test (the
// shared centre library); only tests a teacher approved can be taken. Objective
// items are scored by the function from the key, which never leaves it. Writing and
// speaking answers get AI marks with quoted evidence, which stay suggestions until a
// teacher confirms the level; the report is built from the confirmed result.
// Tests are written in the builder or drafted with AI (generate, below); either way
// the keys are checked with the teacher area's material model.

export function registerPlacementKind(): void {
  registerMaterialKind({ ...placementKind, area: 'centre' });
}

const KIND = 'centre.placement_test';

export async function loadTest(repo: SchoodAIRepository, workspaceId: string, pageId: string, options: { approvedOnly: boolean }) {
  const page = await repo.page(pageId);
  if (!page || page.workspaceId !== workspaceId || page.kind !== KIND || page.status === 'archived' || (options.approvedOnly && page.status !== 'approved')) {
    throw new SchoodAIError('test_not_found', 'This placement test is not available.', 404);
  }
  try {
    return { page, test: placementTestSchema.parse(page.material) as PlacementTest };
  } catch {
    throw new SchoodAIError('test_not_found', 'This placement test is not available.', 404);
  }
}

/** Answers kept to what the test asks: item ids and section ids, text within limits. */
export function cleanAnswers(test: PlacementTest, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const sec of test.sections) {
    if (sec.kind === 'objective') {
      for (const entry of sec.items ?? []) {
        const value = input[entry.id];
        if (value === undefined || value === null || value === '') continue;
        if (entry.type === 'mcq') { const n = typeof value === 'number' ? value : Number(value); if (Number.isInteger(n) && n >= 0 && n < (entry.options?.length ?? 0)) out[entry.id] = n; }
        else if (typeof value === 'string') out[entry.id] = value.slice(0, 120);
      }
    } else {
      const value = clean(input[sec.id], 6000);
      if (value) out[sec.id] = value;
    }
  }
  return out;
}

export async function submitAttempt(store: CentreStore, attempt: AttemptRow, test: PlacementTest, now: Date) {
  const objective = scoreObjective(test, attempt.answers);
  const [row] = await store.table('attempts').update({ id: attempt.id, status: 'in_progress' }, { status: 'submitted', objective: objective as unknown as Record<string, unknown>, level: objective.level, submitted_at: now.toISOString() });
  return row ?? (await store.table('attempts').get({ id: attempt.id }))!;
}

const markSchema = s.object({
  sections: s.array(s.object({
    id: s.string({ min: 1, max: 20 }),
    level: s.enumOf(CEFR_LEVELS),
    criteria: s.array(s.object({ name: s.string({ min: 2, max: 60 }), score: s.number({ min: 1, max: 5, integer: true }), note: s.string({ max: 300 }) }), { min: 1, max: 6 }),
    evidence: s.array(s.string({ min: 3, max: 300 }), { max: 6 }),
    comment: s.string({ min: 10, max: 900 }),
    top_fixes: s.array(s.string({ min: 3, max: 200 }), { max: 3 }),
  }), { min: 1, max: 4 }),
});
const squash = (value: string) => value.toLowerCase().replace(/[“”"«»„]/g, '').replace(/\s+/g, ' ').trim();

/** AI marks for the writing and speaking answers, with evidence quoted from the answer itself. Charged once per attempt. */
export async function aiMark(ctx: RequestContext, store: CentreStore, attempt: AttemptRow, test: PlacementTest) {
  const productive = test.sections.filter((sec) => sec.kind !== 'objective' && typeof attempt.answers[sec.id] === 'string' && String(attempt.answers[sec.id]).trim().length >= 10);
  if (!productive.length) throw new SchoodAIError('nothing_to_mark', 'There is no writing or speaking answer to mark.', 409);
  const access = await ctx.workspace();
  const scripts = productive.map((sec) => ({ id: sec.id, kind: sec.kind, task: sec.prompt ?? '', criteria: sec.criteria?.length ? sec.criteria : [...DEFAULT_CRITERIA[sec.kind as 'writing' | 'speaking']], min_words: sec.min_words ?? null }));
  const { result, credits } = await ctx.ai.charged({ key: 'placement.mark', mode: 'json', reference: `placement-mark:${attempt.id}` }, (session) => session.json({
    schema: markSchema, maxTokens: 1800, temperature: 0.2,
    messages: [
      { role: 'system', content: centrePrompt({
        workspace: access.workspace, locale: ctx.locale,
        task: 'Mark placement-test answers of a learner of English. For each script give a CEFR level, a 1-5 score per listed criterion with a short note, up to six short quotes copied exactly from the learner’s answer as evidence, a comment for the teacher and the three most useful fixes. Speaking answers are transcripts: judge fluency and pronunciation only as far as a transcript shows and say so. The teacher confirms the final level.',
        blocks: [{ kind: 'tasks', title: 'Tasks and criteria', data: { from: test.from_level, to: test.to_level, scripts } }],
      }) },
      { role: 'user', content: productive.map((sec) => `Script ${sec.id} (${sec.kind}):\n${wrapUserMessage(String(attempt.answers[sec.id]))}`).join('\n\n') },
    ],
  }));
  const marks: Record<string, unknown> = {};
  for (const sec of productive) {
    const mark = result.sections.find((entry) => entry.id === sec.id);
    if (!mark) continue;
    const answer = squash(String(attempt.answers[sec.id]));
    const evidence = mark.evidence.filter((quote) => answer.includes(squash(quote)));
    marks[sec.id] = { level: mark.level, criteria: mark.criteria, evidence, evidence_checked: evidence.length === mark.evidence.length, comment: mark.comment, top_fixes: mark.top_fixes, kind: sec.kind };
  }
  const [row] = await store.table('attempts').update({ id: attempt.id }, { ai_marks: { ...marks, marked_at: ctx.now().toISOString() }, status: attempt.status === 'submitted' ? 'marked' : attempt.status });
  return { attempt: row, credits };
}

export function buildReport(test: PlacementTest, attempt: AttemptRow, final: { level: CefrLevel; note: string | null; by: string; at: string }) {
  const objective = attempt.objective as Record<string, unknown> | null;
  const marks = (attempt.ai_marks ?? {}) as Record<string, Record<string, unknown>>;
  return {
    test: test.title, level: final.level, level_label: LEVEL_LABEL[final.level], reviewed_at: final.at, teacher_note: final.note,
    objective: objective ? { percent: objective.percent, correct: objective.correct, total: objective.total, suggested: objective.level, ceiling: objective.ceiling, by_level: objective.by_level } : null,
    productive: test.sections.filter((sec) => sec.kind !== 'objective').map((sec) => ({ id: sec.id, title: sec.title, kind: sec.kind, answered: typeof attempt.answers[sec.id] === 'string', mark: marks[sec.id] ?? null })),
  };
}

const attemptJson = (row: AttemptRow, staff: boolean) => ({
  id: row.id, test_page_id: row.test_page_id, channel: row.channel, status: row.status, prospect: staff ? row.prospect : undefined, taker_user_id: staff ? row.taker_user_id : undefined,
  answers: row.answers, objective: staff || row.status === 'reviewed' ? row.objective : null, ai_marks: staff ? row.ai_marks : null, level: staff || row.status === 'reviewed' ? row.level : null,
  report: row.status === 'reviewed' ? row.report : null, submitted_at: row.submitted_at, reviewed_at: row.reviewed_at, created_at: row.created_at,
});

async function ownAttempt(ctx: RequestContext, id: string) {
  const centre = await requireCentre(ctx);
  const row = await centre.deps.store.table('attempts').get({ id, workspace_id: centre.access.workspace.id });
  const staff = isStaff(centre.access.role);
  if (!row || (!staff && row.taker_user_id !== ctx.user.id)) throw new SchoodAIError('not_found', 'Attempt not found.', 404);
  return { centre, row, staff };
}

function parseTest(value: unknown): PlacementTest {
  try { return placementTestSchema.parse(jsonObject(value, 'material', 200_000)) as PlacementTest; } catch (cause) {
    if (cause instanceof SchemaError) throw new SchoodAIError('invalid_request', `The test is not complete: ${cause.message}`, 400, { field: `material.${cause.path}` });
    throw cause;
  }
}

export const tests = {
  /** Staff: the centre's placement tests in the library, with attempt counts. */
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const pages = await ctx.library.list({ kind: KIND, scope: 'all', limit: 100 });
    const attempts = await centre.deps.store.table('attempts').list({ workspace_id: centre.access.workspace.id }, { limit: 5000 });
    return { tests: pages.map((page) => ({ id: page.id, title: page.title, status: page.status, revision: page.revision, updated_at: page.updated_at, attempts: attempts.filter((row) => row.test_page_id === page.id).length })) };
  },
  /** { material }: a new test in the library as a draft; refused while the key has problems. */
  async POST(ctx: RequestContext) {
    await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const test = parseTest(record(await ctx.body()).material);
    const problems = placementProblems(test);
    if (problems.length) throw new SchoodAIError('test_problems', 'Fix the test before saving it.', 422, { problems });
    const page = await ctx.library.create({ kind: KIND, title: test.title, material: test, folder: 'Placement tests', visibility: 'workspace', status: 'draft' });
    return { page_id: page.id, revision: page.revision, status: page.status };
  },
  /** { id, expected_revision, material?, status? }: edit, or approve for students (`status: approved`). */
  async PATCH(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const body = record(await ctx.body());
    const id = uuid(body.id, 'id');
    const { test: current } = await loadTest(ctx.repo, centre.access.workspace.id, id, { approvedOnly: false });
    const test = body.material === undefined ? current : parseTest(body.material);
    const status = body.status === undefined ? undefined : oneOf(body.status, 'status', ['draft', 'approved', 'archived'] as const);
    const problems = placementProblems(test);
    if (problems.length && status !== 'archived') throw new SchoodAIError('test_problems', 'Fix the test before saving it.', 422, { problems });
    const page = await ctx.library.save(id, { expectedRevision: integer(body.expected_revision, 'expected_revision', 1, 1_000_000), ...(body.material !== undefined ? { material: test, title: test.title } : {}), ...(status ? { status } : {}), snapshot: status === 'approved' });
    if (status) await ctx.audit(`centre.placement_${status}`, {}, { type: 'page', id });
    return { page_id: page.id, revision: page.revision, status: page.status };
  },
};

/** GET centre/placement-test?id=: an approved test without its key, for the person taking it. */
export async function takerTest(ctx: RequestContext) {
  const centre = await requireCentre(ctx);
  const { page, test } = await loadTest(ctx.repo, centre.access.workspace.id, uuid(ctx.query.get('id'), 'id'), { approvedOnly: true });
  return { id: page.id, test: publicTest(test) };
}

/** POST centre/placement-start { page_id, prospect? }: a student starts a test, or staff start one for a walk-in prospect. */
export async function start(ctx: RequestContext) {
  const centre = await requireCentre(ctx);
  const body = record(await ctx.body());
  const { page } = await loadTest(ctx.repo, centre.access.workspace.id, uuid(body.page_id, 'page_id'), { approvedOnly: true });
  const staff = isStaff(centre.access.role);
  const prospect = body.prospect === undefined ? null : record(body.prospect, 'prospect');
  if (prospect && !staff) throw new SchoodAIError('role_required', 'Only staff start a test for someone else.', 403);
  if (!prospect && !['student', 'owner', 'admin', 'teacher'].includes(centre.access.role)) throw new SchoodAIError('role_required', 'Placement tests are for students of this centre.', 403);
  const row = await centre.deps.store.table('attempts').insert({
    workspace_id: centre.access.workspace.id, test_page_id: page.id, test_revision: page.revision, channel: prospect ? 'staff' : 'web',
    taker_user_id: prospect ? null : ctx.user.id,
    prospect: prospect ? { name: text(prospect.name, 'prospect.name', { max: 120 }), phone: optionalText(prospect.phone, 'prospect.phone', { max: 20 }), note: optionalText(prospect.note, 'prospect.note', { max: 300 }) } : {},
  });
  return { attempt: attemptJson(row, staff) };
}

/** POST centre/placement-answer { attempt_id, answers }: saves answers while the attempt is open. */
export async function answer(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { centre, row, staff } = await ownAttempt(ctx, uuid(body.attempt_id, 'attempt_id'));
  if (row.status !== 'in_progress') throw new SchoodAIError('attempt_closed', 'This attempt was already handed in.', 409);
  const { test } = await loadTest(ctx.repo, centre.access.workspace.id, row.test_page_id ?? '', { approvedOnly: false });
  const answers = cleanAnswers(test, { ...row.answers, ...jsonObject(body.answers, 'answers', 60_000) });
  const [updated] = await centre.deps.store.table('attempts').update({ id: row.id, status: 'in_progress' }, { answers });
  return { attempt: attemptJson(updated ?? row, staff) };
}

/** POST centre/placement-submit { attempt_id }: hands the test in; the objective part is scored at once. */
export async function submit(ctx: RequestContext) {
  const { centre, row, staff } = await ownAttempt(ctx, uuid(record(await ctx.body()).attempt_id, 'attempt_id'));
  if (row.status !== 'in_progress') return { attempt: attemptJson(row, staff) };
  const { test } = await loadTest(ctx.repo, centre.access.workspace.id, row.test_page_id ?? '', { approvedOnly: false });
  const updated = await submitAttempt(centre.deps.store, row, test, ctx.now());
  const objective = updated.objective as Record<string, unknown> | null;
  if (row.taker_user_id === ctx.user.id && objective) {
    ctx.events.emit({ kind: 'mock_finished', area: 'centre', feature: 'C5', skill: 'placement', score: Number(objective.percent), outcome: updated.level ? `level_${updated.level}` : undefined, verified_minutes: Math.min(60, Number(objective.total ?? 0)), ref: row.id });
  }
  return { attempt: attemptJson(updated, staff) };
}

/** POST centre/placement-mark { attempt_id }: AI marks for the writing and speaking answers (staff). */
export async function mark(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { centre, row, staff } = await ownAttempt(ctx, uuid(body.attempt_id, 'attempt_id'));
  if (!staff) throw new SchoodAIError('role_required', 'A teacher marks the test.', 403);
  if (row.status === 'in_progress') throw new SchoodAIError('attempt_open', 'The test has not been handed in yet.', 409);
  const { test } = await loadTest(ctx.repo, centre.access.workspace.id, row.test_page_id ?? '', { approvedOnly: false });
  const { attempt, credits } = await aiMark(ctx, centre.deps.store, row, test);
  return { attempt: attemptJson(attempt, true), credits };
}

/** POST centre/placement-review { attempt_id, level, note? }: the teacher confirms the level; the report is built. */
export async function review(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  const body = record(await ctx.body());
  const row = await centre.deps.store.table('attempts').get({ id: uuid(body.attempt_id, 'attempt_id'), workspace_id: centre.access.workspace.id });
  if (!row) throw new SchoodAIError('not_found', 'Attempt not found.', 404);
  if (row.status === 'in_progress') throw new SchoodAIError('attempt_open', 'The test has not been handed in yet.', 409);
  const { test } = await loadTest(ctx.repo, centre.access.workspace.id, row.test_page_id ?? '', { approvedOnly: false });
  const level = oneOf(body.level, 'level', CEFR_LEVELS);
  const at = ctx.now().toISOString();
  const report = buildReport(test, row, { level, note: optionalText(body.note, 'note', { max: 1000 }), by: ctx.user.id, at });
  const [updated] = await centre.deps.store.table('attempts').update({ id: row.id }, { status: 'reviewed', level, report: report as unknown as Record<string, unknown>, reviewed_by: ctx.user.id, reviewed_at: at });
  await ctx.audit('centre.placement_reviewed', { level }, { type: 'attempt', id: row.id });
  return { attempt: attemptJson(updated, true) };
}

export async function attempts(ctx: RequestContext) {
  const id = ctx.query.get('id');
  if (id) {
    const { centre, row, staff } = await ownAttempt(ctx, uuid(id, 'id'));
    const { test } = await loadTest(ctx.repo, centre.access.workspace.id, row.test_page_id ?? '', { approvedOnly: false }).catch(() => ({ test: null }));
    return { attempt: attemptJson(row, staff), test: test ? publicTest(test) : null, key: staff && test ? keyView(test) : null };
  }
  const centre = await requireCentre(ctx);
  const staff = isStaff(centre.access.role);
  const rows = await centre.deps.store.table('attempts').list({ workspace_id: centre.access.workspace.id, ...(staff ? {} : { taker_user_id: ctx.user.id }) }, { order: 'created_at', desc: true, limit: 200 });
  return { attempts: rows.map((row) => attemptJson(row, staff)) };
}

/** Staff see which objective answers were right, never the key itself in the taker's view. */
function keyView(test: PlacementTest) {
  return Object.fromEntries(test.sections.flatMap((sec) => (sec.items ?? []).map((entry) => [entry.id, entry.type === 'mcq' ? { answer: entry.answer } : { accept: entry.accept }])));
}

/** GET centre/placement-available: approved tests any member may take (titles only), and the caller's own attempts. */
export async function available(ctx: RequestContext) {
  const centre = await requireCentre(ctx);
  const ws = centre.access.workspace;
  const pages = await ctx.repo.pages({ workspaceId: ws.id, viewerId: ctx.user.id, manager: true, scope: 'all', kind: KIND, status: 'approved', limit: 50 });
  const mine = await centre.deps.store.table('attempts').list({ workspace_id: ws.id, taker_user_id: ctx.user.id }, { order: 'created_at', desc: true, limit: 20 });
  return { tests: pages.map((page) => ({ id: page.id, title: page.title })), attempts: mine.map((row) => attemptJson(row, false)) };
}

// --- AI drafts (C5) -------------------------------------------------------------------------
// A draft for a level range, written and checked with the teacher area's material
// model (T2 checked keys): one question set per level from the model, read with the
// teacher's lenient reader; items whose key fails the deterministic checks are left
// out; a second model call answers the rest without the key, and every disagreement
// goes on the review list. The draft is saved as a draft page; nobody can take it
// until a teacher has looked at it and approved it. One charge covers the whole draft.

const tasksSchema = s.object({
  writing: s.optional(s.object({ prompt: s.string({ min: 20, max: 1200 }), min_words: s.number({ min: 20, max: 400, integer: true }) })),
  speaking: s.optional(s.object({ prompt: s.string({ min: 20, max: 1200 }) })),
});
type DraftTasks = { writing?: { prompt: string; min_words: number }; speaking?: { prompt: string } };
export const GENERATE_LIMITS = { perLevel: { min: 3, max: 10, default: 6 } } as const;

/** Cut scores spread evenly over the range (A1 0%, A2 25%, B1 50%, B2 75%), for the teacher to adjust. */
export const evenBands = (levels: readonly CefrLevel[]) => levels.map((level, index) => ({ level, min_percent: Math.round((index * 100) / levels.length) }));

/** POST centre/placement-generate { from_level, to_level, per_level?, writing?, speaking?, focus?, title? } (staff). */
export async function generate(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  await ctx.requireFeature('C5');
  const body = record(await ctx.body());
  const from = oneOf(body.from_level, 'from_level', CEFR_LEVELS), to = oneOf(body.to_level, 'to_level', CEFR_LEVELS);
  if (CEFR_LEVELS.indexOf(from) > CEFR_LEVELS.indexOf(to)) throw new SchoodAIError('invalid_request', 'The level range is reversed.', 400, { field: 'to_level' });
  const levels = CEFR_LEVELS.slice(CEFR_LEVELS.indexOf(from), CEFR_LEVELS.indexOf(to) + 1);
  const perLevel = body.per_level === undefined ? GENERATE_LIMITS.perLevel.default : integer(body.per_level, 'per_level', GENERATE_LIMITS.perLevel.min, GENERATE_LIMITS.perLevel.max);
  const writing = body.writing === true, speaking = body.speaking === true;
  const focus = optionalText(body.focus, 'focus', { max: 300 });
  const title = optionalText(body.title, 'title', { max: 160 }) ?? `Placement test ${LEVEL_LABEL[from]}–${LEVEL_LABEL[to]}`;
  const workspace = centre.access.workspace;
  const job = await ctx.repo.createGeneration({
    workspaceId: workspace.id, userId: ctx.user.id, feature: 'placement.generate', status: 'generating', heartbeatAt: ctx.now().toISOString(),
    input: { kind: 'placement_test', from_level: from, to_level: to, per_level: perLevel, writing, speaking, focus },
  });
  const prompt = (task: string) => centrePrompt({ workspace, locale: ctx.locale, task, blocks: focus ? [{ kind: 'focus', title: 'What the centre wants the test to check', data: { focus } }] : [] });
  const writeLevel = async (session: ChargedSession, level: CefrLevel) => {
    const drafted = await session.json({
      messages: [
        { role: 'system', content: prompt([
          `Write ${perLevel} placement-test items in English at CEFR ${LEVEL_LABEL[level]}, for sorting new learners into groups: grammar and vocabulary in context and a few reading-in-a-sentence items, nothing above or below that level.`,
          'Mix single_choice items (exactly 4 options with ids A-D and exactly one correct; the answer is the option id) and gap items (one gap written ____, every accepted answer listed).',
          `Reply with {"sets":[{"instructions","level":"${materialLevel(level)}","questions":[{"type","level","prompt","options":[{"id","text"}],"answer":[...]}]}]}. Original items only.`,
        ].join(' ')) },
        { role: 'user', content: `Write the ${LEVEL_LABEL[level]} items.` },
      ],
      schema: draftQuestionsSchema('single_choice'), maxTokens: 2500, temperature: 0.5,
    });
    return { level, items: drafted.flatMap((set, index) => itemsFromQuestions(set, level, `${level.replace('_', '')}-${index ? `${index + 1}-` : ''}`)).slice(0, perLevel) };
  };
  const writeTasks = (session: ChargedSession): Promise<DraftTasks> => (writing || speaking ? session.json({
    messages: [
      { role: 'system', content: prompt(`Write ${[writing ? 'one short writing task with a minimum word count' : '', speaking ? 'one speaking task (a prompt a teacher reads out)' : ''].filter(Boolean).join(' and ')} that a learner between ${LEVEL_LABEL[from]} and ${LEVEL_LABEL[to]} can attempt, so a teacher can see their level. Reply with {"writing":{"prompt","min_words"},"speaking":{"prompt"}} and leave out what was not asked.`) },
      { role: 'user', content: 'Write the tasks.' },
    ],
    schema: tasksSchema, maxTokens: 800, temperature: 0.5,
  }) : Promise.resolve({}));
  try {
    const { result, credits, chargeId } = await ctx.ai.charged({ key: 'placement.generate', mode: 'json', reference: `placement-generate:${job.id}` }, async (session) => {
      const [sets, tasks] = await Promise.all([Promise.all(levels.map((level) => writeLevel(session, level))), writeTasks(session)]);
      let test: PlacementTest = {
        title, from_level: from, to_level: to, minutes: Math.min(180, Math.max(10, Math.round(levels.length * perLevel * 0.75) + (tasks.writing ? 15 : 0) + (tasks.speaking ? 5 : 0))),
        sections: [
          ...sets.map(({ level, items }) => ({ id: `level-${level.replace('_', '')}`, title: `${pick(ctx.locale, { en: 'Level', uz: 'Daraja', ru: 'Уровень' })} ${LEVEL_LABEL[level]}`, kind: 'objective' as const, items })),
          ...(writing && tasks.writing ? [{ id: 'writing', title: pick(ctx.locale, { en: 'Writing', uz: 'Yozish', ru: 'Письмо' }), kind: 'writing' as const, prompt: tasks.writing.prompt, min_words: tasks.writing.min_words, criteria: [...DEFAULT_CRITERIA.writing] }] : []),
          ...(speaking && tasks.speaking ? [{ id: 'speaking', title: pick(ctx.locale, { en: 'Speaking', uz: 'Gapirish', ru: 'Устная речь' }), kind: 'speaking' as const, prompt: tasks.speaking.prompt, criteria: [...DEFAULT_CRITERIA.speaking] }] : []),
        ],
        bands: evenBands(levels),
      };
      // Leave out items whose key fails the teacher checks.
      const broken = new Set(placementProblems(test).map((line) => /^Item ([^:]+):/.exec(line)?.[1]).filter((id): id is string => !!id));
      test = { ...test, sections: test.sections.map((sec) => (sec.kind === 'objective' ? { ...sec, items: (sec.items ?? []).filter((entry) => !broken.has(entry.id)) } : sec)).filter((sec) => sec.kind !== 'objective' || (sec.items ?? []).length > 0) };
      if (!test.sections.some((sec) => sec.kind === 'objective') || placementProblems(test).length) throw new SchoodAIError('ai_failed', 'The draft did not pass the key checks. Try again.', 502);
      // Solve without the key: every disagreement goes on the review list.
      const { material, itemOf } = placementMaterial(test);
      const solved = await Promise.all(solverTasks(material, 20).map((task) => session.json({
        // The teacher area's shared solver prompt, so placement keys are checked like Studio keys (T2).
        messages: [{ role: 'system', content: SOLVER_SYSTEM }, { role: 'user', content: `${SOLVER_INSTRUCTIONS}\n\n${dataBlock({ kind: 'questions', title: 'Questions to answer', data: solverPayload(task) }, 0)}` }],
        schema: solverAnswersSchema, maxTokens: 1500, temperature: 0,
      })));
      const comparison = compareSolver(material, solved.flatMap((reply) => reply.answers));
      const review: PlacementReview = {
        dropped: broken.size, asked: comparison.asked, agreed: comparison.agreed,
        disagreements: comparison.disagreements.map((entry) => ({ item: itemOf.get(entry.question) ?? entry.question, key: entry.key.join(' / '), solver: entry.solver.join(' / '), reason: entry.reason ?? null })),
        unanswered: comparison.unanswered.map((entry) => itemOf.get(entry.question) ?? entry.question),
      };
      return { test, review };
    });
    const page = await ctx.library.create({ kind: KIND, title: result.test.title, material: result.test, folder: 'Placement tests', visibility: 'workspace', status: 'draft', sourceGenerationId: job.id });
    await ctx.repo.updateGeneration(job.id, { status: 'ready', output: { page_id: page.id }, verification: result.review, credits, chargeId, heartbeatAt: ctx.now().toISOString() }, ['generating']);
    await ctx.audit('centre.placement_generated', { levels: levels.length, items: result.test.sections.reduce((n, sec) => n + (sec.items?.length ?? 0), 0), disagreements: result.review.disagreements.length }, { type: 'page', id: page.id });
    return { page_id: page.id, revision: page.revision, test: result.test, review: result.review, credits };
  } catch (cause) {
    await ctx.repo.updateGeneration(job.id, { status: 'failed', errorCode: cause instanceof SchoodAIError ? cause.code.slice(0, 64) : 'internal_error' }, ['generating']);
    throw cause;
  }
}
export interface PlacementReview {
  /** Items left out because their key failed the checks. */
  dropped: number;
  asked: number;
  agreed: number;
  /** Items where a second model call, without the key, chose another answer. */
  disagreements: { item: string; key: string; solver: string; reason: string | null }[];
  unanswered: string[];
}

/** GET centre/placement-draft-review?id=: the review list of an AI draft (left-out items, solver disagreements); null for tests written by hand. */
export async function draftReview(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  const { page } = await loadTest(ctx.repo, centre.access.workspace.id, uuid(ctx.query.get('id'), 'id'), { approvedOnly: false });
  const job = page.sourceGenerationId ? await ctx.repo.generation(page.sourceGenerationId) : null;
  return { review: job && job.workspaceId === centre.access.workspace.id && job.status !== 'failed' ? (job.verification as PlacementReview | null) ?? null : null };
}
