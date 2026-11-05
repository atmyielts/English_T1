import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CORE_PAGE_KINDS, MATERIAL_KIND_PATTERN } from '../../../../../packages/ai-core/src/mod.ts';
import { api, ApiError } from '../api.ts';

// The library from the app: page shapes, the material-kind registry for screens,
// and the calls to the core/page routes. Teacher and centre save generated
// materials with createPage; PageEditor saves edits with savePage, which names
// the revision it started from and fails with 409 revision_conflict otherwise.

export type PageVisibility = 'private' | 'workspace';
export type PageStatus = 'draft' | 'approved' | 'archived';
export interface PageView {
  id: string; workspace_id: string; kind: string; title: string; folder: string; body: string; material: unknown;
  revision: number; visibility: PageVisibility; status: PageStatus; owner: { id: string | null; is_me: boolean };
  can_edit: boolean; source_generation_id: string | null; created_at: string; updated_at: string;
}
export type PageSummary = Omit<PageView, 'body' | 'material'> & { excerpt: string };
export interface PageRevisionView { revision: number; title: string; author_is_me: boolean; created_at: string }
export interface PageRevisionSnapshot { revision: number; title: string; body: string; material: unknown; created_at: string }
export interface FolderView { path: string; count: number }
export interface PageExport { format: 'markdown' | 'telegram' | 'json'; filename: string; mime: string; parts: string[] }
export interface PageListFilter { folder?: string | null; kind?: string; status?: PageStatus; query?: string; scope?: 'mine' | 'workspace' | 'all'; limit?: number; before?: string }
export interface PageCreateInput { kind?: string; title: string; folder?: string; body?: string; material?: unknown; visibility?: PageVisibility; status?: 'draft' | 'approved'; source_generation_id?: string | null }
export interface PageSaveInput { expected_revision: number; title?: string; body?: string; material?: unknown; folder?: string; visibility?: PageVisibility; status?: PageStatus; snapshot?: boolean }

// --- Material kinds on screen ------------------------------------------------------------
export interface UiMaterialKind<T = unknown> {
  kind: string;
  /** i18n key for the kind's name ("Worksheet"). */
  label: string;
  icon?: LucideIcon;
  /** The same conversion the function uses (define it once in packages/ai-core and reuse it). */
  toMarkdown(material: T): string;
  /** Read-only rendering for the page and for print; defaults to the Markdown body. */
  render?: ComponentType<{ material: T; print: boolean }>;
  /** After the document is edited: the material rebuilt from it, or null to keep the material and treat the document as the source. */
  fromMarkdown?(markdown: string, material: T): T | null;
  /** `document` (default): edited as a document. `readonly`: shown, printed and exported, edited only in the area's own screen. */
  editing?: 'document' | 'readonly';
  /** A link to the area's own editor for this material, if it has one. */
  editorPath?(pageId: string): string;
}
const kinds = new Map<string, UiMaterialKind<unknown>>();
/** Registers how screens show, edit, print and export a kind of material. Call at module load (in your routes.tsx). */
export function registerMaterialKind<T>(definition: UiMaterialKind<T>): void {
  if (!MATERIAL_KIND_PATTERN.test(definition.kind)) throw new Error(`material kind ${definition.kind} is invalid`);
  if ((CORE_PAGE_KINDS as readonly string[]).includes(definition.kind) || kinds.has(definition.kind)) throw new Error(`material kind ${definition.kind} is already registered`);
  kinds.set(definition.kind, definition as UiMaterialKind<unknown>);
}
export const uiMaterialKind = (kind: string) => kinds.get(kind) ?? null;
export const uiMaterialKinds = () => [...kinds.values()];
export type MaterialRender = (page: PageView, print: boolean) => ReactNode;

// --- Calls -------------------------------------------------------------------------------
const ws = (workspaceId: string | null | undefined) => ({ workspaceId: workspaceId ?? null });

export const listPages = (filter: PageListFilter = {}, workspaceId?: string | null) =>
  api<{ pages: PageSummary[] }>('core/pages', { ...ws(workspaceId), query: {
    folder: filter.folder ?? undefined, kind: filter.kind, status: filter.status, q: filter.query, scope: filter.scope,
    limit: filter.limit ? String(filter.limit) : undefined, before: filter.before,
  } }).then((result) => result.pages);
export const getPage = (id: string, workspaceId?: string | null) => api<{ page: PageView }>('core/page', { ...ws(workspaceId), query: { id } }).then((result) => result.page);
export const createPage = (input: PageCreateInput, workspaceId?: string | null) => api<{ page: PageView }>('core/pages', { ...ws(workspaceId), method: 'POST', body: input }).then((result) => result.page);
/** Saves an edit. On 409 the error's details.page is the current page: keep the draft and let the person choose. */
export const savePage = (id: string, input: PageSaveInput, workspaceId?: string | null, signal?: AbortSignal) =>
  api<{ page: PageView }>('core/page', { ...ws(workspaceId), method: 'PATCH', body: { id, ...input }, signal }).then((result) => result.page);
export const deletePage = (id: string, workspaceId?: string | null) => api<{ deleted: boolean }>('core/page', { ...ws(workspaceId), method: 'DELETE', body: { id } });
export const duplicatePage = (id: string, workspaceId?: string | null) => api<{ page: PageView }>('core/page-duplicate', { ...ws(workspaceId), method: 'POST', body: { id } }).then((result) => result.page);
export const pageRevisions = (id: string, workspaceId?: string | null) => api<{ revisions: PageRevisionView[] }>('core/page-revisions', { ...ws(workspaceId), query: { id } }).then((result) => result.revisions);
export const pageRevision = (id: string, revision: number, workspaceId?: string | null) => api<{ revision: PageRevisionSnapshot }>('core/page-revision', { ...ws(workspaceId), query: { id, revision: String(revision) } }).then((result) => result.revision);
export const restorePage = (id: string, revision: number, expectedRevision: number, workspaceId?: string | null) =>
  api<{ page: PageView }>('core/page-restore', { ...ws(workspaceId), method: 'POST', body: { id, revision, expected_revision: expectedRevision } }).then((result) => result.page);
export const exportPage = (id: string, format: PageExport['format'], workspaceId?: string | null) => api<{ export: PageExport }>('core/page-export', { ...ws(workspaceId), query: { id, format } }).then((result) => result.export);
export const listFolders = (workspaceId?: string | null) => api<{ folders: FolderView[] }>('core/folders', ws(workspaceId)).then((result) => result.folders);
export const moveFolder = (from: string, to: string, workspaceId?: string | null) => api<{ moved: number }>('core/folders', { ...ws(workspaceId), method: 'POST', body: { from, to } });

/** The current page when a save hit a newer revision, or null. */
export const conflictPage = (error: unknown): PageView | null =>
  error instanceof ApiError && error.code === 'revision_conflict' && error.details.page ? error.details.page as PageView : null;
