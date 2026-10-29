import {
  cleanFolder, CORE_PAGE_KINDS, MANAGER_ROLES, MATERIAL_KIND_PATTERN, PAGE_LIMITS, SchemaError, STAFF_ROLES, toTelegramText, type MaterialKindDefinition,
} from '../../../packages/ai-core/src/mod.ts';
import { bool, integer, isUuid, oneOf, optionalUuid, record, text, uuid } from './input.ts';
import {
  SchoodAIError, type Area, type Locale, type PagePatch, type PageRow, type RequestContext, type RouteHandler, type WorkspaceAccess,
} from './types.ts';

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
//   - create, edit, restore, duplicate, move: needs the library feature (T6) in
//     the plan; edit is for the page's owner, or owners and admins on a shared page.
//   - delete: the page's owner, or owners and admins on a shared page (no plan needed).
//   - sharing with the workspace exists only in centre workspaces.

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

// --- Rules -------------------------------------------------------------------------
const STATUSES = ['draft', 'approved', 'archived'] as const;
const VISIBILITIES = ['private', 'workspace'] as const;
const LIBRARY_FEATURE = 'T6';
const notFound = (): never => { throw new SchoodAIError('not_found', 'Page not found.', 404); };
const invalid = (field: string, message: string): never => { throw new SchoodAIError('invalid_request', message, 400, { field }); };

const isManager = (access: WorkspaceAccess) => MANAGER_ROLES.includes(access.role);
const canRead = (row: PageRow, access: WorkspaceAccess, userId: string) =>
  row.workspaceId === access.workspace.id && (row.ownerId === userId || row.visibility === 'workspace' || isManager(access));
const canChange = (row: PageRow, access: WorkspaceAccess, userId: string) =>
  row.workspaceId === access.workspace.id && (row.ownerId === userId || (row.visibility === 'workspace' && isManager(access)));

function folderOf(value: unknown, field = 'folder'): string {
  if (typeof value !== 'string') return invalid(field, `${field} must be text.`);
  try {
    return cleanFolder(value);
  } catch (cause) {
    return invalid(field, cause instanceof Error && cause.message === 'folder_too_deep' ? `Folders go at most ${PAGE_LIMITS.folderDepth} levels deep.` : `${field} is too long.`);
  }
}
function bodyOf(value: unknown): string {
  if (typeof value !== 'string') return invalid('body', 'body must be text.');
  if (value.length > PAGE_LIMITS.body) return invalid('body', `A page holds at most ${PAGE_LIMITS.body} characters.`);
  return value.replace(/\r\n?/g, '\n');
}
const titleOf = (value: unknown) => text(value, 'title', { max: PAGE_LIMITS.title }).replace(/\s+/g, ' ');
function kindOf(value: unknown): string {
  const kind = value === undefined || value === null ? 'note' : text(value, 'kind', { max: 61 });
  if (!isKnownKind(kind)) return invalid('kind', 'Unknown kind of page.');
  return kind;
}
/** A material checked with its kind's schema (null clears it). */
function materialOf(kind: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const definition = materialKind(kind);
  if (!definition?.schema) return invalid('material', 'This kind of page has no material.');
  let parsed: unknown;
  try {
    parsed = definition.schema.parse(value, 'material');
  } catch (cause) {
    if (cause instanceof SchemaError) return invalid('material', `The material is not valid: ${cause.message}`);
    throw cause;
  }
  if (JSON.stringify(parsed).length > PAGE_LIMITS.material) return invalid('material', 'The material is too large.');
  return parsed;
}
function visibilityOf(value: unknown, access: WorkspaceAccess): PageVisibility {
  const visibility = oneOf(value, 'visibility', VISIBILITIES);
  if (visibility === 'workspace' && access.workspace.kind !== 'centre') throw new SchoodAIError('invalid_request', 'Pages are shared only in a centre workspace.', 400, { field: 'visibility' });
  return visibility;
}

function pageView(row: PageRow, access: WorkspaceAccess, userId: string, mayEdit: boolean): PageView {
  return {
    id: row.id, workspace_id: row.workspaceId, kind: row.kind, title: row.title, folder: row.folder, body: row.body, material: row.material,
    revision: row.revision, visibility: row.visibility, status: row.status, owner: { id: row.ownerId, is_me: row.ownerId === userId },
    can_edit: mayEdit && canChange(row, access, userId), source_generation_id: row.sourceGenerationId, created_at: row.createdAt, updated_at: row.updatedAt,
  };
}
function summaryView(row: PageRow, access: WorkspaceAccess, userId: string, mayEdit: boolean): PageSummary {
  const { body: _body, material: _material, ...rest } = pageView(row, access, userId, mayEdit);
  return { ...rest, excerpt: row.body };
}

// --- The service (routes and ctx.library share it) ----------------------------------
export function createLibraryService(ctx: RequestContext) {
  const staff = () => ctx.workspace({ roles: STAFF_ROLES });
  /** Whether the plan here includes the library (edits); reading never needs it. */
  const mayEdit = async () => (await ctx.access(LIBRARY_FEATURE)).allowed;
  const requireEdit = async () => { await staff(); return ctx.requireFeature(LIBRARY_FEATURE); };

  async function readable(id: string) {
    const access = await staff();
    const row = isUuid(id) ? await ctx.repo.page(id) : null;
    if (!row || !canRead(row, access, ctx.user.id)) return notFound();
    return { access, row };
  }
  async function changeable(id: string) {
    const access = await requireEdit();
    const { row } = await readable(id);
    if (!canChange(row, access, ctx.user.id)) throw new SchoodAIError('role_required', 'Only the page owner, or a centre owner or admin on a shared page, can change it.', 403);
    return { access, row };
  }
  const view = async (row: PageRow, access: WorkspaceAccess) => pageView(row, access, ctx.user.id, await mayEdit());

  async function create(input: PageCreateInput): Promise<PageView> {
    const access = await requireEdit();
    const kind = kindOf(input.kind);
    const material = materialOf(kind, input.material);
    const definition = materialKind(kind);
    const body = input.body !== undefined ? bodyOf(input.body) : material !== null && definition ? bodyOf(definition.toMarkdown(material)) : '';
    let sourceGenerationId: string | null = null;
    if (input.sourceGenerationId) {
      const generation = await ctx.repo.generation(uuid(input.sourceGenerationId, 'source_generation_id'));
      // Only a generation from this workspace, and your own unless you manage it.
      if (!generation || generation.workspaceId !== access.workspace.id || (generation.userId !== ctx.user.id && !isManager(access))) return invalid('source_generation_id', 'That generation is not yours.');
      sourceGenerationId = generation.id;
    }
    const row = await ctx.repo.createPage({
      workspaceId: access.workspace.id, ownerId: ctx.user.id, kind, title: titleOf(input.title), folder: input.folder === undefined ? '' : folderOf(input.folder),
      body, material, visibility: input.visibility === undefined ? 'private' : visibilityOf(input.visibility, access),
      status: input.status === undefined ? 'draft' : oneOf(input.status, 'status', ['draft', 'approved'] as const), sourceGenerationId,
    });
    return pageView(row, access, ctx.user.id, true);
  }

  async function save(id: string, input: PageSaveInput): Promise<PageView> {
    const { access, row } = await changeable(id);
    const expected = integer(input.expectedRevision, 'expected_revision', 1, 2_147_483_647);
    const patch: PagePatch = {};
    if (input.title !== undefined) patch.title = titleOf(input.title);
    if (input.body !== undefined) patch.body = bodyOf(input.body);
    if (input.material !== undefined) {
      patch.material = materialOf(row.kind, input.material);
      const definition = materialKind(row.kind);
      if (patch.body === undefined && patch.material !== null && definition) patch.body = bodyOf(definition.toMarkdown(patch.material));
    }
    if (input.folder !== undefined) patch.folder = folderOf(input.folder);
    if (input.visibility !== undefined) patch.visibility = visibilityOf(input.visibility, access);
    if (input.status !== undefined) patch.status = oneOf(input.status, 'status', STATUSES);
    if (!Object.keys(patch).length) return invalid('body', 'Nothing to save.');
    const snapshot = input.snapshot === undefined ? false : bool(input.snapshot, 'snapshot');
    const result = await ctx.repo.savePage(row.id, expected, patch, ctx.user.id, snapshot);
    if (!result.ok) {
      if (result.code === 'not_found' || !result.current) return notFound();
      throw new SchoodAIError('revision_conflict', 'This page changed since you opened it.', 409, { page: pageView(result.current, access, ctx.user.id, true) });
    }
    if (patch.visibility && patch.visibility !== row.visibility) await ctx.audit('library.page_visibility', { visibility: patch.visibility, kind: row.kind }, { type: 'ai_page', id: row.id });
    return pageView(result.page, access, ctx.user.id, true);
  }

  async function list(filter: PageListFilter = {}): Promise<PageSummary[]> {
    const access = await staff();
    const scope = filter.scope === undefined ? 'mine' : oneOf(filter.scope, 'scope', ['mine', 'workspace', 'all'] as const);
    if (filter.before !== undefined && Number.isNaN(Date.parse(filter.before))) return invalid('before', 'before must be a time.');
    const rows = await ctx.repo.pages({
      workspaceId: access.workspace.id, viewerId: ctx.user.id, manager: isManager(access), scope,
      folder: filter.folder === undefined || filter.folder === null ? undefined : folderOf(filter.folder),
      kind: filter.kind === undefined ? undefined : text(filter.kind, 'kind', { max: 61 }),
      status: filter.status === undefined ? undefined : oneOf(filter.status, 'status', STATUSES),
      query: filter.query === undefined ? undefined : text(filter.query, 'q', { max: 200 }).replace(/\s+/g, ' '),
      limit: filter.limit === undefined ? 50 : integer(filter.limit, 'limit', 1, 100),
      before: filter.before === undefined ? undefined : new Date(filter.before).toISOString(),
    });
    const edit = await mayEdit();
    return rows.filter((row) => canRead(row, access, ctx.user.id)).map((row) => summaryView(row, access, ctx.user.id, edit));
  }

  async function get(id: string): Promise<PageView> {
    const { access, row } = await readable(id);
    return view(row, access);
  }

  return {
    create, get, save, list, readable, changeable, requireEdit, staff,
    async remove(id: string) {
      const { access, row } = await readable(id);
      if (!canChange(row, access, ctx.user.id)) throw new SchoodAIError('role_required', 'Only the page owner, or a centre owner or admin on a shared page, can delete it.', 403);
      const deleted = await ctx.repo.deletePage(row.id);
      if (deleted && access.workspace.kind === 'centre') await ctx.audit('library.page_deleted', { kind: row.kind, visibility: row.visibility }, { type: 'ai_page', id: row.id });
      return deleted;
    },
    async revisions(id: string): Promise<PageRevisionView[]> {
      const { row } = await readable(id);
      return (await ctx.repo.pageRevisions(row.id, 200)).map((revision) => ({ revision: revision.revision, title: revision.title, author_is_me: revision.authorId === ctx.user.id, created_at: revision.createdAt }));
    },
    async revision(id: string, number: number) {
      const { row } = await readable(id);
      const revision = await ctx.repo.pageRevision(row.id, number);
      if (!revision) return notFound();
      return { revision: revision.revision, title: revision.title, body: revision.body, material: revision.material, created_at: revision.createdAt };
    },
    /** Puts a version back as the newest revision; what was there is kept as a version first. */
    async restore(id: string, number: number, expectedRevision: number) {
      const { row } = await changeable(id);
      const revision = await ctx.repo.pageRevision(row.id, number);
      if (!revision) return notFound();
      return save(id, { expectedRevision, title: revision.title, body: revision.body, material: revision.material, snapshot: true });
    },
    async duplicate(id: string, locale: Locale) {
      const { row } = await readable(id);
      const suffix = { en: ' (copy)', uz: ' (nusxa)', ru: ' (копия)' }[locale];
      return create({
        kind: row.kind, title: `${row.title.slice(0, PAGE_LIMITS.title - suffix.length)}${suffix}`, folder: row.folder, body: row.body,
        material: row.material ?? undefined, visibility: 'private', status: 'draft',
      });
    },
    async export(id: string, format: 'markdown' | 'telegram' | 'json') {
      const { row } = await readable(id);
      const name = row.title.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80).toLowerCase() || 'page';
      if (format === 'json') {
        const document = { title: row.title, kind: row.kind, folder: row.folder, status: row.status, revision: row.revision, updated_at: row.updatedAt, body: row.body, material: row.material };
        return { format, filename: `${name}.json`, mime: 'application/json', parts: [JSON.stringify(document, null, 2)] };
      }
      const markdown = `# ${row.title}\n\n${row.body}`.trimEnd() + '\n';
      if (format === 'markdown') return { format, filename: `${name}.md`, mime: 'text/markdown', parts: [markdown] };
      const definition = materialKind(row.kind);
      const custom = row.material !== null && definition?.toTelegram ? definition.toTelegram(row.material) : null;
      return { format, filename: `${name}.txt`, mime: 'text/plain', parts: toTelegramText(custom ?? markdown) };
    },
    async folders() {
      const access = await staff();
      return ctx.repo.folders({ workspaceId: access.workspace.id, viewerId: ctx.user.id, manager: isManager(access) });
    },
    /** Renames a folder (and its sub-folders) on the pages you may change. */
    async moveFolder(fromValue: unknown, toValue: unknown) {
      const access = await requireEdit();
      const from = folderOf(fromValue, 'from'), to = folderOf(toValue, 'to');
      if (!from) return invalid('from', 'Choose a folder to move.');
      if (to === from || to.startsWith(`${from}/`)) return invalid('to', 'A folder cannot move into itself.');
      const scope = { workspaceId: access.workspace.id, viewerId: ctx.user.id, manager: isManager(access) };
      // Every moved path must still be a valid folder.
      for (const folder of await ctx.repo.folders(scope)) {
        if (folder.path === from || folder.path.startsWith(`${from}/`)) folderOf(`${to}${folder.path.slice(from.length)}`, 'to');
      }
      return ctx.repo.moveFolder(scope, from, to);
    },
  };
}

// --- Routes: /schood-ai/core/<action> -------------------------------------------------
const service = (ctx: RequestContext) => createLibraryService(ctx);
const idFrom = (ctx: RequestContext) => uuid(ctx.query.get('id'), 'id');
const optional = (value: string | null) => (value === null || value === '' ? undefined : value);

/** core/pages, core/page, core/page-revisions, core/page-revision, core/page-restore, core/page-duplicate, core/page-export, core/folders. */
export const libraryRoutes: Record<string, RouteHandler> = {
  pages: {
    maxBody: 512 * 1024,
    async GET(ctx) {
      const limit = optional(ctx.query.get('limit'));
      return {
        pages: await service(ctx).list({
          folder: ctx.query.has('folder') ? ctx.query.get('folder') : undefined, kind: optional(ctx.query.get('kind')),
          status: optional(ctx.query.get('status')) as PageStatus | undefined, query: optional(ctx.query.get('q')),
          scope: optional(ctx.query.get('scope')) as PageListFilter['scope'], limit: limit === undefined ? undefined : Number(limit), before: optional(ctx.query.get('before')),
        }),
      };
    },
    async POST(ctx) {
      const body = record(await ctx.body());
      return {
        page: await service(ctx).create({
          kind: body.kind as string | undefined, title: body.title as string, folder: body.folder as string | undefined, body: body.body as string | undefined,
          material: body.material, visibility: body.visibility as PageVisibility | undefined, status: body.status as PageCreateInput['status'],
          sourceGenerationId: optionalUuid(body.source_generation_id, 'source_generation_id'),
        }),
      };
    },
  },
  page: {
    maxBody: 1024 * 1024,
    async GET(ctx) { return { page: await service(ctx).get(idFrom(ctx)) }; },
    async PATCH(ctx) {
      const body = record(await ctx.body());
      return {
        page: await service(ctx).save(uuid(body.id, 'id'), {
          expectedRevision: body.expected_revision as number, title: body.title as string | undefined, body: body.body as string | undefined, material: body.material,
          folder: body.folder as string | undefined, visibility: body.visibility as PageVisibility | undefined, status: body.status as PageStatus | undefined,
          snapshot: body.snapshot as boolean | undefined,
        }),
      };
    },
    async DELETE(ctx) {
      const body = record(await ctx.body());
      return { deleted: await service(ctx).remove(uuid(body.id, 'id')) };
    },
  },
  'page-revisions': { async GET(ctx) { return { revisions: await service(ctx).revisions(idFrom(ctx)) }; } },
  'page-revision': {
    async GET(ctx) { return { revision: await service(ctx).revision(idFrom(ctx), integer(Number(ctx.query.get('revision')), 'revision', 1, 2_147_483_647)) }; },
  },
  'page-restore': {
    async POST(ctx) {
      const body = record(await ctx.body());
      return { page: await service(ctx).restore(uuid(body.id, 'id'), integer(body.revision, 'revision', 1, 2_147_483_647), integer(body.expected_revision, 'expected_revision', 1, 2_147_483_647)) };
    },
  },
  'page-duplicate': {
    maxBody: 4 * 1024,
    async POST(ctx) { return { page: await service(ctx).duplicate(uuid(record(await ctx.body()).id, 'id'), ctx.locale) }; },
  },
  'page-export': {
    async GET(ctx) { return { export: await service(ctx).export(idFrom(ctx), oneOf(ctx.query.get('format') ?? 'markdown', 'format', ['markdown', 'telegram', 'json'] as const)) }; },
  },
  folders: {
    maxBody: 4 * 1024,
    async GET(ctx) { return { folders: await service(ctx).folders() }; },
    async POST(ctx) {
      const body = record(await ctx.body());
      return { moved: await service(ctx).moveFolder(body.from, body.to) };
    },
  },
};
