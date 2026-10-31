import type { MaterialBrief } from '../../../../packages/ai-core/src/materials/mod.ts';

// In-memory hand-offs between teacher screens. Nothing here goes into a URL or
// browser storage: a brief to make again, and page photos a job may still need.

let briefDraft: MaterialBrief | null = null;
/** Opens the Studio with this brief filled in ("Make again"). */
export function setBriefDraft(brief: MaterialBrief): void { briefDraft = brief; }
export function takeBriefDraft(): MaterialBrief | null { const brief = briefDraft; briefDraft = null; return brief; }

/** Page photos of a textbook job, kept only for this tab while the job runs. */
export const pendingImages = new Map<string, string[]>();
