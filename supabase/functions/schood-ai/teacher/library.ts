import { SchemaError, STAFF_ROLES } from '../../../../packages/ai-core/src/mod.ts';
import { MATERIAL_KIND_DEFINITIONS, MATERIAL_KINDS, parseMaterial, type Material } from '../../../../packages/ai-core/src/materials/mod.ts';
import { oneOf, optionalText, record, uuid } from '../input.ts';
import { isUuid } from '../input.ts';
import { registerMaterialKind, type PageView } from '../library.ts';
import { SchoodAIError, type GenerationRow, type RequestContext, type WorkspaceAccess } from '../types.ts';

// Where teacher materials live:
//   - a draft is a job in core's ai_generations (requested → generating → ready),
//     reviewed and edited on the T2 review card;
//   - approving it saves it as a page of its kind in core's library (T6), which owns
//     folders, search, versions, sharing, print and export. Exports, the Live Quiz
//     and the marketplace read the approved page.
// Every T1 kind is registered with the library here, with its schema, its Markdown
// document and its Telegram text (packages/ai-core materials/library.ts).

export function registerTeacherKinds(): void {
  for (const definition of MATERIAL_KIND_DEFINITIONS) registerMaterialKind({ ...definition, area: 'teacher' });
}

/** Credit keys whose jobs are materials. */
export const MATERIAL_KEYS = new Set<string>(Object.values(MATERIAL_KINDS).map((kind) => kind.creditKey));

export interface MaterialInput {
  brief: Record<string, unknown>;
  plan: { id: string; produce: string; part: number; variant?: string; questions?: number }[];
  /** A group's weak spots read from Academy, when the teacher picked a group. */
  focus_source?: { academy_id: string; classroom_id: string; classroom_name?: string; tags: string[] } | null;
  focus_unavailable?: boolean;
  /** Client request key, so a double click makes one job. */
  request_key?: string;
  /** Textbook to lesson: how many page photos were sent (photos are never stored). */
  images?: number;
}
export interface MaterialRow extends GenerationRow { input: MaterialInput & Record<string, unknown> }

/** The person may read this job: their own, or (in a centre) any staff member may. */
export function canRead(access: WorkspaceAccess, row: GenerationRow, userId: string): boolean {
  if (row.workspaceId !== access.workspace.id) return false;
  if (row.userId === userId) return true;
  return access.workspace.kind === 'centre' && STAFF_ROLES.includes(access.role);
}

/** A material job in the caller's workspace, or not_found (the same for "not yours"). */
export async function materialRow(ctx: RequestContext, id: unknown): Promise<{ row: MaterialRow; access: WorkspaceAccess }> {
  const access = await ctx.workspace();
  const row = isUuid(id) ? await ctx.repo.generation(String(id).toLowerCase()) : null;
  if (!row || !MATERIAL_KEYS.has(row.feature) || !canRead(access, row, ctx.user.id)) throw new SchoodAIError('not_found', 'Material not found.', 404);
  return { row: row as MaterialRow, access };
}

/** The material jobs in the caller's workspace: their own, or the whole centre's for staff. */
export async function listMaterials(ctx: RequestContext): Promise<MaterialRow[]> {
  const access = await ctx.workspace();
  const shared = access.workspace.kind === 'centre' && STAFF_ROLES.includes(access.role);
  const rows = await ctx.repo.generations(access.workspace.id, shared ? null : ctx.user.id, 200);
  return rows.filter((row) => MATERIAL_KEYS.has(row.feature) && canRead(access, row, ctx.user.id)) as MaterialRow[];
}

/** An approved teacher material in the library, read with the library's own rules. */
export async function approvedPage(ctx: RequestContext, id: unknown): Promise<{ page: PageView; access: WorkspaceAccess; material: Material }> {
  const access = await ctx.workspace();
  const page = await ctx.library.get(uuid(id, 'page_id'));
  if (!Object.hasOwn(MATERIAL_KINDS, page.kind)) throw new SchoodAIError('not_a_material', 'This page is not a teaching material.', 409);
  if (page.status !== 'approved') throw new SchoodAIError('not_approved', 'Approve this material first.', 409, { status: page.status });
  let material: Material;
  try { material = parseMaterial(page.material); } catch (cause) {
    throw new SchoodAIError('not_a_material', cause instanceof SchemaError ? `material: ${cause.message}` : 'This page has no material.', 409);
  }
  return { page, access, material };
}

const KIND_FOLDER: Record<string, string> = { general: 'Materials', exam: 'Exam practice', planning: 'Planning', textbook: 'Textbook lessons' };
/** Where an approved material goes in the library: "Exam practice/IELTS reading/B2". */
export function folderFor(material: Material): string {
  const group = MATERIAL_KINDS[material.kind]?.group ?? 'general';
  const kind = material.kind.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase()).replace(/\bielts\b/i, 'IELTS').replace(/\bsat\b/i, 'SAT').replace(/\btoefl\b/i, 'TOEFL');
  return `${KIND_FOLDER[group]}/${kind}/${material.level.replace('band:', 'Band ')}`.slice(0, 200);
}

/**
 * POST teacher/material-decide: Approve & save, or decline, a ready draft. Approving
 * saves it to the library as a page of its kind; nothing reaches students before this.
 */
export async function decideMaterial(ctx: RequestContext) {
  const body = record(await ctx.body());
  const { row, access } = await materialRow(ctx, body.id);
  const mayDecide = access.workspace.kind === 'personal' ? row.userId === ctx.user.id : STAFF_ROLES.includes(access.role);
  if (!mayDecide) throw new SchoodAIError('role_required', 'A teacher must review this.', 403, { roles: STAFF_ROLES });
  const decision = oneOf(body.decision, 'decision', ['approve', 'reject'] as const);
  const progress = row.progress as Record<string, unknown>;
  if (decision === 'reject') {
    if (row.status === 'rejected') return { status: 'rejected', page_id: null };
    const rejected = await ctx.repo.updateGeneration(row.id, { status: 'rejected', decidedBy: ctx.user.id, decidedAt: ctx.now().toISOString() }, ['ready']);
    if (!rejected) throw new SchoodAIError('not_ready', 'This draft is not ready for review.', 409, { status: row.status });
    await ctx.audit('generation.rejected', { feature: row.feature }, { type: 'generation', id: row.id });
    return { status: 'rejected', page_id: null };
  }
  // A second click shows the page the first one made.
  if (row.status === 'approved' && typeof progress.page_id === 'string') return { status: 'approved', page_id: progress.page_id };
  const material = parseMaterial(row.output);
  const claimed = await ctx.repo.updateGeneration(row.id, { status: 'approved', decidedBy: ctx.user.id, decidedAt: ctx.now().toISOString() }, ['ready']);
  if (!claimed) throw new SchoodAIError('not_ready', 'This draft is not ready for review.', 409, { status: row.status });
  let page: PageView;
  try {
    page = await ctx.library.create({
      kind: material.kind, title: material.title, material, status: 'approved', sourceGenerationId: row.id,
      folder: optionalText(body.folder, 'folder', { max: 200 }) ?? folderFor(material),
    });
  } catch (cause) {
    // The page could not be saved: the draft stays ready to approve again.
    await ctx.repo.updateGeneration(row.id, { status: 'ready', decidedBy: null, decidedAt: null }, ['approved']);
    throw cause;
  }
  await ctx.repo.updateGeneration(row.id, { progress: { ...progress, page_id: page.id } });
  await ctx.audit('generation.approved', { feature: row.feature, page: page.id }, { type: 'generation', id: row.id });
  return { status: 'approved', page_id: page.id };
}

/** Saves an approved material into the caller's library without a model call (a marketplace copy). */
export function saveApprovedCopy(ctx: RequestContext, material: Material): Promise<PageView> {
  return ctx.library.create({ kind: material.kind, title: material.title, material, status: 'approved', folder: `Marketplace/${folderFor(material).split('/').slice(1).join('/')}` });
}
