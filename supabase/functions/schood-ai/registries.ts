import type { Area, GenerationRow, Locale, RequestContext, WorkspaceAccess } from './types.ts';

// Two small registries areas add to: what happens when a generation job is
// approved (the teacher area saves the material's library page), and the kinds of
// notification a person can mute in Settings (each area names its own).

// --- Generation approval -------------------------------------------------------------
/**
 * Runs after `core/generations` approves a job of this feature (the job is already
 * `approved`). Return a small JSON result for the screen (`{ page_id }`). If it
 * throws, the job goes back to `ready` and the error is the response.
 */
export type GenerationApproval = (ctx: RequestContext, input: { generation: GenerationRow; access: WorkspaceAccess }) => Promise<Record<string, unknown> | void>;
const approvals = new Map<string, GenerationApproval>();

/** One hook per generation feature (the job's credit key, for example `material.generate`). Register at module load. */
export function registerGenerationApproval(feature: string, approval: GenerationApproval): void {
  if (!/^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,30}$/.test(feature)) throw new Error(`generation feature ${feature} is invalid`);
  if (approvals.has(feature)) throw new Error(`generation approval for ${feature} is already registered`);
  approvals.set(feature, approval);
}
export const generationApproval = (feature: string) => approvals.get(feature) ?? null;

// --- Notification kinds ---------------------------------------------------------------
const kinds = new Map<string, { area: Area; label: Record<Locale, string> }>();
const KIND = /^[a-z][a-z0-9_]{1,30}(\.[a-z][a-z0-9_.-]{1,40})?$/;

/**
 * A kind of message your area sends through ctx.notify (the channel you pass, for
 * example `engage.winback` or `coach.ielts`). Settings lists every registered kind
 * so people can mute it; muting the area prefix (`engage`) mutes all of its kinds.
 */
export function registerNotifyKind(key: string, definition: { area: Area; label: Record<Locale, string> }): void {
  if (!KIND.test(key)) throw new Error(`notification kind ${key} is invalid`);
  if (kinds.has(key)) throw new Error(`notification kind ${key} is already registered`);
  if ((['en', 'uz', 'ru'] as const).some((locale) => !definition.label[locale]?.trim() || definition.label[locale].length > 80)) throw new Error(`notification kind ${key}: label needs uz, ru and en`);
  kinds.set(key, definition);
}
export const notifyKinds = (locale: Locale) => [...kinds].map(([key, entry]) => ({ key, area: entry.area, label: entry.label[locale] })).sort((a, b) => a.key.localeCompare(b.key));
