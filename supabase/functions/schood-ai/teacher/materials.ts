import { quoteCredits, s, SchemaError } from '../../../../packages/ai-core/src/mod.ts';
import { answerKey, assessmentItems, briefProblems, briefSchema, checkMaterial, compareSolver, draftContentSchema, draftQuestionsSchema, draftSourceSchema, generationPlan, materialCredit, materialKind, neighbourLevels, parseMaterial, plannedCount, quizQuestions, renumber, solverAnswersSchema, solverTasks, verification as buildVerification, type Block, type GenerationStep, type Material, type MaterialBrief, type SolverAnswer, type Verification } from '../../../../packages/ai-core/src/materials/mod.ts';
import { isUuid, record, text, uuid } from '../input.ts';
import { SchoodAIError, type GenerationRow, type RequestContext } from '../types.ts';
import { weakSpots } from './academy.ts';
import { listMaterials, materialRow, type MaterialInput, type MaterialRow } from './library.ts';
import { materialSystem, pageMessages, solveMessages, stepMessages } from './prompts.ts';

// T1 Materials Studio and T2 checked answer keys, as a job in core's ai_generations:
//   requested → generating → ready → approved / rejected (core/generations), or failed.
// Each request runs one step, so every model call stays well under the edge limit:
// the app calls material-step until the job is ready. All calls of a job run under
// one charge (reference `material:<id>`): the first charges the exact ai-core price,
// later ones replay it, and a job that fails is refunded in full. After generation,
// the deterministic key checks run, then a second model call per chunk solves the
// questions without the key; disagreements go on the review card. Nothing reaches
// students until a teacher approves.

const HEARTBEAT_MS = 75_000;
const MAX_RECHECKS = 3;
const MAX_IMAGE_CHARS = 4_500_000;

interface Progress {
  phase: 'generate' | 'solve' | 'done';
  done: number;
  total: number;
  solve_done: number;
  solve_total: number;
  running: { step: string; at: string } | null;
  kind: string;
  title: string | null;
  revision: number;
  rechecks: number;
  error?: string | null;
}
interface Draft {
  draft: true;
  title?: string;
  aims?: string[];
  parts: Record<string, Block[]>;
  variants: { support: Record<string, Block[]>; stretch: Record<string, Block[]> };
  page?: { text: string; topic?: string; vocabulary?: string[]; grammar?: string } | null;
}
type StoredVerification = Verification & { solver_answers: SolverAnswer[]; fingerprints: Record<string, string>; stale: string[]; edited: boolean };

const progressOf = (row: GenerationRow): Progress => ({ phase: 'generate', done: 0, total: 0, solve_done: 0, solve_total: 0, running: null, kind: '', title: null, revision: 0, rechecks: 0, ...(row.progress as Partial<Progress>) });
const reference = (id: string) => `material:${id}`;
const isDraft = (value: unknown): value is Draft => !!value && typeof value === 'object' && (value as Draft).draft === true;
const fingerprint = (question: { prompt: string; options?: { id: string; text: string }[]; type: string }) => {
  let hash = 0;
  for (const char of `${question.type}|${question.prompt}|${JSON.stringify(question.options ?? [])}`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return (hash >>> 0).toString(36);
};

function briefOf(row: MaterialRow): MaterialBrief {
  return briefSchema.parse(row.input.brief);
}

/** The JSON the app gets for a material job. */
export function materialJson(row: MaterialRow) {
  const progress = progressOf(row);
  const brief = row.input.brief as Partial<MaterialBrief>;
  const material = isDraft(row.output) ? null : row.output as Material | null;
  const stored = row.verification as StoredVerification | null;
  return {
    id: row.id, feature: row.feature, status: row.status, kind: brief.kind ?? progress.kind, level: brief.level ?? null, topic: brief.topic ?? null,
    title: material?.title ?? progress.title ?? brief.topic ?? null, brief, credits: row.credits, error_code: row.errorCode,
    progress: { phase: progress.phase, done: progress.done, total: progress.total, solve_done: progress.solve_done, solve_total: progress.solve_total, running: !!progress.running && Date.now() - Date.parse(progress.running.at) < HEARTBEAT_MS, revision: progress.revision, rechecks_left: Math.max(0, MAX_RECHECKS - progress.rechecks) },
    material, verification: stored ? { checks: stored.checks, solver: stored.solver, clean: stored.clean, stale: stored.stale ?? [], edited: !!stored.edited } : null,
    focus: row.input.focus_source ? { classroom_name: row.input.focus_source.classroom_name ?? null, tags: row.input.focus_source.tags } : null,
    focus_unavailable: !!row.input.focus_unavailable, page_id: typeof (row.progress as { page_id?: unknown }).page_id === 'string' ? (row.progress as { page_id: string }).page_id : null,
    derived: material ? { key: answerKey(material), playable: quizQuestions(material).length, assessment_items: assessmentItems(material).length } : null,
    created_at: row.createdAt, updated_at: row.updatedAt, decided_at: row.decidedAt,
  };
}

const academySchema = s.optional(s.object({ academy_id: s.string({ min: 36, max: 36 }), classroom_id: s.string({ min: 1, max: 64 }), classroom_name: s.optional(s.string({ max: 200 })) }));

/** POST teacher/materials: a brief becomes a job; the first step runs at once. */
export async function createMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  let brief: MaterialBrief, academy: { academy_id: string; classroom_id: string; classroom_name?: string } | undefined;
  try {
    brief = briefSchema.parse(body.brief);
    academy = academySchema.parse(body.academy);
  } catch (cause) {
    throw new SchoodAIError('invalid_request', cause instanceof SchemaError ? `brief: ${cause.message}` : 'The brief is not valid.', 400, { field: cause instanceof SchemaError ? `brief.${cause.path}` : 'brief' });
  }
  const kind = materialKind(brief.kind);
  const problems = briefProblems(brief);
  if (!kind || problems.length) throw new SchoodAIError('invalid_brief', 'This brief cannot be made as asked.', 400, { problems });
  if (academy && !isUuid(academy.academy_id)) throw new SchoodAIError('invalid_request', 'academy_id must be an id.', 400, { field: 'academy.academy_id' });
  const images = Array.isArray(body.images) ? body.images : [];
  if (kind.vision) {
    if (!images.length && typeof body.page_text !== 'string') throw new SchoodAIError('invalid_request', 'Add a photo of the page or paste its text.', 400, { field: 'images' });
    if (images.length > 2 || images.some((image) => typeof image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE_CHARS)) throw new SchoodAIError('invalid_request', 'Up to two page photos (PNG, JPEG or WebP, under 3 MB each).', 400, { field: 'images' });
  } else if (images.length) throw new SchoodAIError('invalid_request', 'Photos are only for textbook lessons.', 400, { field: 'images' });

  const credit = materialCredit(brief);
  const quote = quoteCredits(credit.key, credit.addOns);
  const access = await ctx.requireFeature(quote.feature);
  // A double click or a retried request makes one job.
  const requestKey = ctx.idempotencyKey ?? undefined;
  if (requestKey) {
    const existing = (await ctx.repo.generations(access.workspace.id, ctx.user.id, 30)).find((row) => (row.input as unknown as MaterialInput).request_key === requestKey);
    if (existing) return { material: materialJson(existing as MaterialRow) };
  }

  let focus = brief.focus ?? [];
  let focusSource: MaterialInput['focus_source'] = null, focusUnavailable = false;
  if (academy) {
    try {
      const spots = await weakSpots(ctx, academy.academy_id, academy.classroom_id);
      focusSource = { academy_id: academy.academy_id, classroom_id: academy.classroom_id, classroom_name: academy.classroom_name, tags: spots.map((spot) => spot.tag) };
      focus = [...new Set([...focus, ...spots.map((spot) => spot.label)])].slice(0, 10);
    } catch {
      // Academy unreachable or no access: the material is still made, without the group's data.
      focusUnavailable = true;
    }
  }
  const finalBrief: MaterialBrief = { ...brief, ...(focus.length ? { focus } : {}) };
  const plan = generationPlan(finalBrief);
  const steps = kind.vision && images.length ? [{ id: 'page-0', produce: 'page', part: 0 }, ...plan] : plan;
  const row = await ctx.repo.createGeneration({
    workspaceId: access.workspace.id, userId: ctx.user.id, feature: quote.key, credits: quote.credits,
    input: { brief: finalBrief, plan: steps, focus_source: focusSource, focus_unavailable: focusUnavailable, ...(requestKey ? { request_key: requestKey } : {}), ...(images.length ? { images: images.length } : {}) },
    output: { draft: true, parts: {}, variants: { support: {}, stretch: {} }, ...(typeof body.page_text === 'string' && body.page_text.trim() ? { page: { text: text(body.page_text, 'page_text', { max: 12_000 }) } } : {}) } satisfies Draft,
    progress: { phase: 'generate', done: 0, total: steps.length, solve_done: 0, solve_total: 0, running: null, kind: brief.kind, title: null, revision: 0, rechecks: 0 } satisfies Progress,
  });
  await ctx.audit('material.requested', { kind: brief.kind, credits: quote.credits, variants: !!brief.variants }, { type: 'generation', id: row.id });
  const advanced = await advance(ctx, row as MaterialRow, images as string[]);
  return { material: materialJson(advanced) };
}

/** POST teacher/material-step: runs the next step of a job (the app calls it until the job is ready). */
export async function stepMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { row } = await materialRow(ctx, body.id);
  if (row.userId !== ctx.user.id) throw new SchoodAIError('not_found', 'Material not found.', 404);
  const images = Array.isArray(body.images) ? body.images.filter((image): image is string => typeof image === 'string' && image.length <= MAX_IMAGE_CHARS).slice(0, 2) : [];
  return { material: materialJson(await advance(ctx, row, images)) };
}

/** Runs at most one model call for the job and saves where it got to. */
async function advance(ctx: RequestContext, row: MaterialRow, images: string[]): Promise<MaterialRow> {
  if (!['requested', 'generating'].includes(row.status)) return row;
  const progress = progressOf(row);
  // Another tab is running this step right now.
  if (progress.running && ctx.now().getTime() - Date.parse(progress.running.at) < HEARTBEAT_MS) return row;
  const brief = briefOf(row);
  const kind = materialKind(brief.kind)!;
  const plan = row.input.plan as (GenerationStep | { id: string; produce: 'page'; part: number })[];
  const draft: Draft = isDraft(row.output) ? row.output : { draft: true, parts: {}, variants: { support: {}, stretch: {} } };
  const workspace = (await ctx.workspace()).workspace;
  const system = materialSystem({ workspaceName: workspace.name, centre: workspace.kind === 'centre', tone: typeof workspace.houseStyle.tone === 'string' ? workspace.houseStyle.tone : undefined });
  const credit = materialCredit(brief);
  const charge = { key: credit.key, addOns: credit.addOns, reference: reference(row.id), mode: 'json' as const, ...(kind.vision ? { requires: { capabilities: ['vision' as const] } } : {}) };

  const stepId = progress.phase === 'solve' ? `solve-${progress.solve_done}` : plan[progress.done]?.id ?? 'finish';
  const started = await ctx.repo.updateGeneration(row.id, { status: 'generating', heartbeatAt: ctx.now().toISOString(), progress: { ...progress, running: { step: stepId, at: ctx.now().toISOString() } } }, ['requested', 'generating']);
  if (!started) return (await ctx.repo.generation(row.id)) as MaterialRow;

  try {
    if (progress.phase === 'generate' && progress.done < plan.length) {
      const step = plan[progress.done];
      const receipt = await ctx.ai.charged(charge, async (session) => {
        if (step.produce === 'page') {
          if (!images.length) throw new SchoodAIError('images_required', 'Send the page photos again to continue.', 409);
          const page = await session.json({ messages: pageMessages({ system, images, pageText: draft.page?.text ?? null }), schema: pageSchema, maxTokens: 3000, temperature: 0.2 });
          draft.page = page;
          return;
        }
        await runGenerationStep(session, { system, brief, kind, step: step as GenerationStep, total: new Set(plan.filter((entry) => entry.produce !== 'page' && entry.produce !== 'variant').map((entry) => entry.part)).size, draft });
      });
      const done = progress.done + 1;
      const next: Partial<GenerationRow> = { output: draft, chargeId: receipt.chargeId, progress: { ...progress, done, running: null, title: draft.title ?? progress.title } satisfies Progress };
      if (done < plan.length) return (await ctx.repo.updateGeneration(row.id, next, ['generating'])) as MaterialRow ?? row;
      // All parts written: assemble, check the keys, then solve without the key.
      const material = assemble(brief, draft);
      const checks = checkMaterial(material, { expectedQuestions: kind.questionTypes.length ? plannedCount(brief) : undefined });
      const tasks = solverTasks(material);
      const stored: StoredVerification = { ...buildVerification(checks, tasks.length ? { asked: 0, agreed: 0, disagreements: [], unanswered: [], status: 'partial' } : null), solver_answers: [], fingerprints: {}, stale: [], edited: false };
      const phase = tasks.length ? 'solve' : 'done';
      return (await ctx.repo.updateGeneration(row.id, {
        ...next, output: material, verification: stored, ...(phase === 'done' ? { status: 'ready' } : {}),
        progress: { ...(next.progress as unknown as Progress), phase, solve_total: tasks.length, solve_done: 0, title: material.title },
      }, ['generating'])) as MaterialRow ?? row;
    }

    if (progress.phase === 'solve') {
      const material = row.output as Material;
      const tasks = solverTasks(material);
      const task = tasks[progress.solve_done];
      const stored = row.verification as StoredVerification;
      if (task) {
        const reply = await ctx.ai.charged(charge, (session) => session.json({ messages: solveMessages({ system, task, locale: ctx.locale }), schema: solverAnswersSchema, maxTokens: 2500, temperature: 0 }));
        const wanted = new Set(task.questions.map((question) => question.id));
        stored.solver_answers = [...stored.solver_answers.filter((entry) => !wanted.has(entry.id)), ...reply.result.answers.filter((entry) => wanted.has(entry.id))];
        for (const question of task.questions) stored.fingerprints[question.id] = fingerprint(question);
      }
      const solveDone = progress.solve_done + 1;
      const finished = solveDone >= tasks.length;
      const comparison = compareSolver(material, stored.solver_answers);
      const verificationNow: StoredVerification = { ...stored, ...buildVerification(stored.checks, { ...comparison, status: finished ? 'done' : 'partial' }) };
      const updated = await ctx.repo.updateGeneration(row.id, {
        verification: verificationNow, ...(finished ? { status: 'ready' } : {}),
        progress: { ...progress, phase: finished ? 'done' : 'solve', solve_done: solveDone, running: null } satisfies Progress,
      }, ['generating']);
      if (finished && updated) await ctx.audit('material.ready', { kind: brief.kind, errors: verificationNow.checks.errors, disagreements: comparison.disagreements.length }, { type: 'generation', id: row.id });
      return (updated as MaterialRow) ?? row;
    }
    return (await ctx.repo.updateGeneration(row.id, { status: 'ready', progress: { ...progress, phase: 'done', running: null } }, ['generating'])) as MaterialRow ?? row;
  } catch (cause) {
    return fail(ctx, row, progress, cause);
  }
}

/** A failed step fails the job and returns its credits; a refusal before any charge leaves it to retry. */
async function fail(ctx: RequestContext, row: MaterialRow, progress: Progress, cause: unknown): Promise<never> {
  const code = cause instanceof SchoodAIError ? cause.code : cause instanceof SchemaError ? 'invalid_material' : 'generation_failed';
  const current = (await ctx.repo.generation(row.id)) ?? row;
  const charged = !!current.chargeId;
  const beforeCharge = ['plan_required', 'role_required', 'ai_disabled', 'ai_unavailable', 'capped', 'insufficient_credits', 'budget_exhausted', 'images_required'].includes(code);
  if (!charged && beforeCharge) {
    // Nothing was charged: the job waits, and the person sees why (a paywall, the cap…).
    await ctx.repo.updateGeneration(row.id, { status: progress.done || progress.phase !== 'generate' ? 'generating' : 'requested', progress: { ...progress, running: null, error: code } }, ['requested', 'generating']);
  } else if (code === 'images_required') {
    await ctx.repo.updateGeneration(row.id, { progress: { ...progress, running: null, error: code } }, ['generating']);
  } else {
    if (current.chargeId) {
      try { await ctx.repo.refund(current.chargeId); } catch (refundError) { console.error(JSON.stringify({ event: 'schood_ai_material_refund_failed', generation: row.id, error: String(refundError).slice(0, 200) })); }
    }
    await ctx.repo.updateGeneration(row.id, { status: 'failed', errorCode: code.slice(0, 64), progress: { ...progress, running: null, error: code } }, ['requested', 'generating']);
    await ctx.audit('material.failed', { code }, { type: 'generation', id: row.id });
  }
  if (cause instanceof SchoodAIError) throw cause;
  if (!(cause instanceof SchemaError)) console.error(JSON.stringify({ event: 'schood_ai_material_failed', generation: row.id, error: String(cause).slice(0, 300) }));
  throw new SchoodAIError(code, 'This material could not be made. Your credits were returned.', 502);
}

const pageSchema = {
  parse(value: unknown) {
    const row = record(value, 'page');
    const vocabulary = Array.isArray(row.vocabulary) ? row.vocabulary.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.slice(0, 80)).slice(0, 40) : [];
    return {
      text: text(row.text, 'text', { max: 12_000 }),
      ...(typeof row.topic === 'string' ? { topic: row.topic.slice(0, 200) } : {}),
      vocabulary,
      ...(typeof row.grammar === 'string' ? { grammar: row.grammar.slice(0, 300) } : {}),
    };
  },
  json: { type: 'object', properties: { text: { type: 'string' }, topic: { type: 'string' }, vocabulary: { type: 'array', items: { type: 'string' } }, grammar: { type: 'string' } }, required: ['text'] },
};

type Session = Parameters<Parameters<RequestContext['ai']['charged']>[1]>[0];
async function runGenerationStep(session: Session, input: { system: string; brief: MaterialBrief; kind: NonNullable<ReturnType<typeof materialKind>>; step: GenerationStep; total: number; draft: Draft }) {
  const { brief, kind, step, draft } = input;
  const key = String(step.part);
  const page = draft.page ? JSON.stringify(draft.page).slice(0, 12_000) : null;
  const messages = (extra: { source?: Block | null; core?: Block[] } = {}) => stepMessages({ system: input.system, brief, kind, step, total: input.total, page, ...extra });
  const fallbackType = step.questionTypes?.length === 1 ? step.questionTypes[0] : undefined;
  if (step.produce === 'source') {
    const scripted = kind.sourced === 'script' || brief.exam?.section === 'listening';
    const out = await session.json({ messages: messages(), schema: draftSourceSchema(scripted ? 'script' : 'passage'), maxTokens: 2600, temperature: 0.7 });
    draft.parts[key] = [out.block];
    draft.title ??= out.title;
    return;
  }
  if (step.produce === 'questions') {
    const source = latestSource(draft, step.part);
    const sets = await session.json({ messages: messages({ source }), schema: draftQuestionsSchema(fallbackType), maxTokens: 3500, temperature: 0.4 });
    draft.parts[key] = [...(draft.parts[key] ?? []), ...sets];
    return;
  }
  if (step.produce === 'content') {
    const out = await session.json({ messages: messages(), schema: draftContentSchema(fallbackType), maxTokens: 3800, temperature: 0.6 });
    draft.parts[key] = [...(draft.parts[key] ?? []), ...out.blocks];
    draft.title ??= out.title;
    draft.aims ??= out.aims;
    return;
  }
  // A variant covers a source and every question part that follows it until the next source.
  const parts = Object.keys(draft.parts).map(Number).sort((a, b) => a - b);
  if (!draft.parts[key]?.some(isSource) && parts.some((part) => part < step.part && draft.parts[String(part)].some(isSource))) return;
  const core: Block[] = [...(draft.parts[key] ?? [])];
  for (const part of parts.filter((entry) => entry > step.part)) {
    if (draft.parts[String(part)].some(isSource)) break;
    core.push(...draft.parts[String(part)]);
  }
  const out = await session.json({ messages: messages({ core }), schema: draftContentSchema(fallbackType), maxTokens: 3800, temperature: 0.5 });
  draft.variants[step.variant ?? 'support'][key] = out.blocks;
}
const isSource = (block: Block) => (block.type === 'text' && block.role === 'passage') || block.type === 'script';
function latestSource(draft: Draft, part: number): Block | null {
  for (let index = part; index >= 0; index--) {
    const found = draft.parts[String(index)]?.find(isSource);
    if (found) return found;
  }
  return null;
}

/** The finished material: parts in order, final ids, strict schema. */
function assemble(brief: MaterialBrief, draft: Draft): Material {
  const ordered = (parts: Record<string, Block[]>) => Object.keys(parts).map(Number).sort((a, b) => a - b).flatMap((part) => parts[String(part)]);
  const blocks = renumber(ordered(draft.parts));
  if (!blocks.length) throw new SchemaError('blocks', 'the model wrote nothing');
  const levels = neighbourLevels(brief.level);
  const variants = brief.variants && Object.keys(draft.variants.support).length && Object.keys(draft.variants.stretch).length
    ? [{ label: 'support' as const, level: levels.support, blocks: renumber(ordered(draft.variants.support), 's') }, { label: 'stretch' as const, level: levels.stretch, blocks: renumber(ordered(draft.variants.stretch), 'x') }]
    : undefined;
  const kind = materialKind(brief.kind)!;
  return parseMaterial({
    schema: 'schood.material.v1', kind: brief.kind, title: (draft.title ?? brief.topic).slice(0, 200), level: brief.level, topic: brief.topic, instruction_language: brief.instruction_language,
    ...(kind.exam ? { exam: { format: kind.exam, ...(brief.exam ?? {}), ...(defaultSection(brief.kind) ? { section: brief.exam?.section ?? defaultSection(brief.kind) } : {}) } } : {}),
    ...(draft.aims?.length ? { aims: draft.aims } : {}),
    blocks, ...(variants ? { variants } : {}),
  });
}
const defaultSection = (kind: string) => ({ ielts_reading: 'reading', ielts_listening: 'listening', ielts_writing: 'writing', ielts_speaking: 'speaking', sat_reading_writing: 'reading_writing', sat_math: 'math', admission_math: 'math' } as Record<string, string>)[kind];

/** GET teacher/materials: the teacher's material jobs (drafts and their status); approved ones are core library pages. */
export async function listMaterialsRoute(ctx: RequestContext) {
  const query = (ctx.query.get('q') ?? '').trim().toLowerCase().slice(0, 100);
  const kind = ctx.query.get('kind'), status = ctx.query.get('status');
  const rows = (await listMaterials(ctx)).filter((row) => {
    const json = materialJson(row);
    return (!kind || json.kind === kind) && (!status || row.status === status) && (!query || `${json.title ?? ''} ${json.topic ?? ''}`.toLowerCase().includes(query));
  });
  return { materials: rows.map((row) => { const { material: _m, derived: _d, verification, ...rest } = materialJson(row); return { ...rest, issues: verification ? verification.checks.errors + (verification.solver?.disagreements.length ?? 0) : null }; }) };
}

/** GET teacher/material?id= */
export async function getMaterial(ctx: RequestContext) {
  const { row } = await materialRow(ctx, ctx.query.get('id'));
  return { material: materialJson(row) };
}

/** PATCH teacher/material: the teacher's edits; checks run again and solver answers still apply to unchanged questions. */
export async function editMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { row } = await materialRow(ctx, body.id);
  // An approved material is a library page: it is edited there.
  if (row.status !== 'ready') throw new SchoodAIError('not_editable', row.status === 'approved' ? 'This material is in your library now: edit it there.' : 'This material cannot be edited now.', 409, { status: row.status });
  if (typeof body.updated_at === 'string' && body.updated_at !== row.updatedAt) throw new SchoodAIError('edit_conflict', 'Someone saved a newer version. Reload to see it.', 409, { updated_at: row.updatedAt });
  let material: Material;
  try { material = parseMaterial(body.material); } catch (cause) {
    throw new SchoodAIError('invalid_request', cause instanceof SchemaError ? `material: ${cause.message}` : 'The material is not valid.', 400, { field: cause instanceof SchemaError ? `material.${cause.path}` : 'material' });
  }
  const previous = row.output as Material;
  if (material.kind !== previous.kind) throw new SchoodAIError('invalid_request', 'The kind of a material cannot change.', 400, { field: 'material.kind' });
  const stored = (row.verification as StoredVerification | null) ?? { ...buildVerification(checkMaterial(material), null), solver_answers: [], fingerprints: {}, stale: [], edited: true };
  const verificationNow = revalidate(material, stored);
  const progress = progressOf(row);
  const updated = await ctx.repo.updateGeneration(row.id, { output: material, verification: verificationNow, progress: { ...progress, revision: progress.revision + 1, title: material.title } }, ['ready']);
  if (!updated) throw new SchoodAIError('edit_conflict', 'This material changed. Reload to see it.', 409);
  await ctx.audit('material.edited', { revision: progress.revision + 1 }, { type: 'generation', id: row.id });
  return { material: materialJson(updated as MaterialRow) };
}

/** Keys checked again after an edit: solver answers count only for questions unchanged since they were solved. */
function revalidate(material: Material, stored: StoredVerification): StoredVerification {
  const checks = checkMaterial(material);
  const current = new Map<string, string>();
  for (const task of solverTasks(material, 200)) for (const question of task.questions) current.set(question.id, fingerprint(question));
  const fresh = stored.solver_answers.filter((entry) => current.get(entry.id) === stored.fingerprints[entry.id]);
  const stale = [...current.keys()].filter((id) => !fresh.some((entry) => entry.id === id));
  const comparison = compareSolver(material, fresh);
  const solver = stored.solver ? { ...comparison, unanswered: comparison.unanswered.filter((entry) => !stale.includes(entry.question)), status: stale.length ? 'partial' as const : stored.solver.status } : null;
  const base = buildVerification(checks, solver);
  return { ...stored, ...base, clean: base.clean && stale.length === 0, stale, edited: true, solver_answers: fresh };
}

/** POST teacher/material-recheck: solve the edited questions again without the key (included, up to three times). */
export async function recheckMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { row } = await materialRow(ctx, body.id);
  if (row.status !== 'ready') throw new SchoodAIError('not_editable', 'This material cannot be checked now.', 409);
  const progress = progressOf(row);
  if (progress.rechecks >= MAX_RECHECKS) throw new SchoodAIError('recheck_limit', 'This material was checked again three times already.', 409);
  const stored = row.verification as StoredVerification | null;
  const material = row.output as Material;
  if (!stored?.stale?.length) return { material: materialJson(row) };
  const brief = briefOf(row);
  const credit = materialCredit(brief);
  const workspace = (await ctx.workspace()).workspace;
  const system = materialSystem({ workspaceName: workspace.name, centre: workspace.kind === 'centre' });
  const stale = new Set(stored.stale);
  const tasks = solverTasks(material, 200).map((task) => ({ ...task, questions: task.questions.filter((question) => stale.has(question.id)) })).filter((task) => task.questions.length).slice(0, 1);
  if (!tasks.length) return { material: materialJson(row) };
  const reply = await ctx.ai.charged({ key: credit.key, addOns: credit.addOns, reference: reference(row.id), mode: 'json' }, (session) => session.json({ messages: solveMessages({ system, task: tasks[0], locale: ctx.locale }), schema: solverAnswersSchema, maxTokens: 2500, temperature: 0 }));
  const ids = new Set(tasks[0].questions.map((question) => question.id));
  const fingerprints = { ...stored.fingerprints };
  for (const question of tasks[0].questions) fingerprints[question.id] = fingerprint(question);
  const answers = [...stored.solver_answers.filter((entry) => !ids.has(entry.id)), ...reply.result.answers.filter((entry) => ids.has(entry.id))];
  const next = revalidate(material, { ...stored, solver_answers: answers, fingerprints, solver: stored.solver ?? { asked: 0, agreed: 0, disagreements: [], unanswered: [], status: 'done' } });
  const updated = await ctx.repo.updateGeneration(row.id, { verification: next, progress: { ...progress, rechecks: progress.rechecks + 1 } }, ['ready']);
  return { material: materialJson((updated ?? row) as MaterialRow) };
}

/** POST teacher/material-title: rename without touching the content. */
export async function renameMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { row } = await materialRow(ctx, uuid(body.id, 'id'));
  const title = text(body.title, 'title', { max: 200 });
  if (row.status !== 'ready') throw new SchoodAIError('not_editable', 'This material cannot be renamed now.', 409);
  const material = { ...(row.output as Material), title };
  const progress = progressOf(row);
  const updated = await ctx.repo.updateGeneration(row.id, { output: material, progress: { ...progress, title, revision: progress.revision + 1 } }, ['ready']);
  return { material: materialJson((updated ?? row) as MaterialRow) };
}
