import { CORE_PAGE_KINDS, MATERIAL_KIND_PATTERN, type MaterialKindDefinition } from '../../../packages/ai-core/src/mod.ts';
import { SchoodAIError, type Area, type RequestContext, type RouteHandler } from './types.ts';

// The library (T6): every saved material is a page in a person's or a centre's
// library, with folders, search, version history, revision-checked autosave,
// sharing within the workspace, export and print. Teacher and centre save
// generated materials here through ctx.library; the app edits them with the
// PageEditor. Patterns from CopilotKit/OpenDots (MIT): pages with a revision
// number, saves that must name the revision they started from.
//
// Who may do what (staff only: owner, admin, teacher):
//   - read and export: your own pages, pages shared with the workspace, and every
//     page for owners and admins. Your library stays readable without a plan.
//   - create, edit, restore, duplicate: needs the library feature (T6) in the plan;
//     edit is for the page's owner, or owners and admins on a shared page.

export type PageVisibility = 'private' | 'workspace';
export type PageStatus = 'draft' | 'approved' | 'archived';

/** A page as the API returns it. */
export interface PageView {
  id: string;
  workspace_id: string;
  kind: string;
  title: string;
  folder: string;
  body: string;
  material: unknown;
  revision: number;
  visibility: PageVisibility;
  status: PageStatus;
  owner: { id: string | null; is_me: boolean };
  can_edit: boolean;
  source_generation_id: string | null;
  created_at: string;
  updated_at: string;
}
export type PageSummary = Omit<PageView, 'body' | 'material'> & { excerpt: string };
export interface PageRevisionView { revision: number; title: string; author_is_me: boolean; created_at: string }

export interface PageCreateInput {
  kind?: string;
  title: string;
  folder?: string;
  /** Markdown. Left out, it is made from the material with the kind's toMarkdown. */
  body?: string;
  material?: unknown;
  visibility?: PageVisibility;
  status?: Exclude<PageStatus, 'archived'>;
  /** The generation job this page came from (ai_generations). */
  sourceGenerationId?: string | null;
}
export interface PageSaveInput {
  /** The revision the edit started from; a different current revision is a conflict (409 revision_conflict with the current page). */
  expectedRevision: number;
  title?: string;
  body?: string;
  material?: unknown;
  folder?: string;
  visibility?: PageVisibility;
  status?: PageStatus;
  /** Keep the previous state as a version now (otherwise at most one version every 10 minutes per author). */
  snapshot?: boolean;
}
export interface PageListFilter {
  folder?: string | null;
  kind?: string;
  status?: PageStatus;
  /** Full-text search over title and body. */
  query?: string;
  /** `mine` (default), `workspace` (shared with the workspace) or `all` you can see. */
  scope?: 'mine' | 'workspace' | 'all';
  limit?: number;
  /** Paging: pages updated before this time. */
  before?: string;
}
/** ctx.library: the same rules as the routes, for areas saving materials server-side. */
export interface LibraryService {
  create(input: PageCreateInput): Promise<PageView>;
  get(id: string): Promise<PageView>;
  save(id: string, input: PageSaveInput): Promise<PageView>;
  list(filter?: PageListFilter): Promise<PageSummary[]>;
}

// --- Material kinds ----------------------------------------------------------------
const kinds = new Map<string, MaterialKindDefinition<unknown> & { area: Area }>();

/** Registers how a kind of material is validated and turned into a document and Telegram text. Register at module load. */
export function registerMaterialKind<T>(definition: MaterialKindDefinition<T> & { area: Area }): void {
  if (!MATERIAL_KIND_PATTERN.test(definition.kind)) throw new Error(`material kind ${definition.kind} is invalid`);
  if ((CORE_PAGE_KINDS as readonly string[]).includes(definition.kind) || kinds.has(definition.kind)) throw new Error(`material kind ${definition.kind} is already registered`);
  kinds.set(definition.kind, definition as MaterialKindDefinition<unknown> & { area: Area });
}
export const materialKind = (kind: string) => kinds.get(kind) ?? null;
export const isKnownKind = (kind: string) => (CORE_PAGE_KINDS as readonly string[]).includes(kind) || kinds.has(kind);

// --- Service and routes (contract first; implemented in the next commit) ---------------
const notReady = (): never => { throw new SchoodAIError('not_ready', 'The library is being built. Try again soon.', 501); };

export function createLibraryService(_ctx: RequestContext): LibraryService {
  return { create: () => Promise.resolve(notReady()), get: () => Promise.resolve(notReady()), save: () => Promise.resolve(notReady()), list: () => Promise.resolve(notReady()) };
}

const stub = { GET: () => Promise.resolve(notReady()), POST: () => Promise.resolve(notReady()), PATCH: () => Promise.resolve(notReady()), DELETE: () => Promise.resolve(notReady()) };
/** core/pages, core/page, core/page-revisions, core/page-revision, core/page-restore, core/page-duplicate, core/page-export, core/folders. */
export const libraryRoutes: Record<string, RouteHandler> = {
  pages: { GET: stub.GET, POST: stub.POST, maxBody: 512 * 1024 },
  page: { GET: stub.GET, PATCH: stub.PATCH, DELETE: stub.DELETE, maxBody: 1024 * 1024 },
  'page-revisions': { GET: stub.GET },
  'page-revision': { GET: stub.GET },
  'page-restore': { POST: stub.POST },
  'page-duplicate': { POST: stub.POST },
  'page-export': { GET: stub.GET },
  folders: { GET: stub.GET, POST: stub.POST },
};
