import { MATERIAL_KINDS, STAFF_ROLES, type Material } from '../../../../packages/ai-core/src/mod.ts';
import { isUuid } from '../input.ts';
import { SchoodAIError, type GenerationRow, type RequestContext, type WorkspaceAccess } from '../types.ts';

// Materials live in core's ai_generations until the shared library ships (core
// milestone 2). This adapter is the only place that knows that: when the library
// contract lands, approved materials are saved as library pages here, the material
// kinds are registered with their renderer and editor conversion, and this file
// shrinks to that registration. Nothing else in the teacher area reads
// ai_generations for materials directly.

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
  /** Copies from the marketplace carry their listing. */
  source?: 'generated' | 'marketplace';
  listing_id?: string;
  /** Textbook to lesson: the page was sent as images (hashes only; images are never stored). */
  images?: number;
}

export interface MaterialRow extends GenerationRow { input: MaterialInput & Record<string, unknown> }

/** The person may read this material: their own, or (in a centre) any staff member may. */
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

/** An approved material, for exports, the Live Quiz and the marketplace. */
export async function approvedMaterial(ctx: RequestContext, id: unknown): Promise<{ row: MaterialRow; access: WorkspaceAccess; material: Material }> {
  const found = await materialRow(ctx, id);
  if (found.row.status !== 'approved') throw new SchoodAIError('not_approved', 'Approve this material first.', 409, { status: found.row.status });
  const material = found.row.output as Material | null;
  if (!material || typeof material !== 'object' || (material as { schema?: string }).schema !== 'schood.material.v1') throw new SchoodAIError('not_approved', 'Approve this material first.', 409);
  return { ...found, material };
}

/** The materials in the caller's library: their own, or the whole centre's for staff. */
export async function listMaterials(ctx: RequestContext): Promise<MaterialRow[]> {
  const access = await ctx.workspace();
  const shared = access.workspace.kind === 'centre' && STAFF_ROLES.includes(access.role);
  const rows = await ctx.repo.generations(access.workspace.id, shared ? null : ctx.user.id, 200);
  return rows.filter((row) => MATERIAL_KEYS.has(row.feature) && canRead(access, row, ctx.user.id)) as MaterialRow[];
}

/** Saves an approved material into a workspace's library without a model call (a marketplace copy). */
export async function saveApprovedCopy(ctx: RequestContext, access: WorkspaceAccess, input: { feature: string; material: Material; listingId: string }): Promise<MaterialRow> {
  const row = await ctx.repo.createGeneration({
    workspaceId: access.workspace.id, userId: ctx.user.id, feature: input.feature, status: 'approved', output: input.material,
    input: { brief: { kind: input.material.kind, level: input.material.level, topic: input.material.topic }, plan: [], source: 'marketplace', listing_id: input.listingId },
    progress: { phase: 'done' }, credits: 0, decidedBy: ctx.user.id, decidedAt: ctx.now().toISOString(),
  });
  return row as MaterialRow;
}
