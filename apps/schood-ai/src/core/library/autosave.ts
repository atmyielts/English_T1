// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai)
import { cleanFolder, PAGE_LIMITS } from '../../../../../packages/ai-core/src/mod.ts';
import { ApiError } from '../api.ts';
import { conflictPage, type PageSaveInput, type PageView } from './api.ts';

// Autosave for one page. Edits change a local draft; 800 ms after the last edit
// the fields that differ from the page are sent with the revision the draft
// started from. One save is in flight at a time. A 409 keeps the draft and
// becomes a conflict the person resolves (load the latest, or keep theirs on top
// of it; the other version stays in the history). Nothing typed is ever dropped:
// errors keep the draft and wait for "try again".

export type PageDraft = Pick<PageView, 'title' | 'body' | 'folder' | 'visibility' | 'status'>;
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export interface SaveState {
  page?: PageView;
  draft?: PageDraft;
  /** The newest page the server has told us about (newer than `page` in a conflict). */
  remote?: PageView;
  status: SaveStatus;
  /** An i18n key for the problem. */
  error?: string;
}
export type SavePage = (id: string, input: PageSaveInput, signal: AbortSignal) => Promise<PageView>;
export interface AutosaveOptions {
  delay?: number;
  timeout?: number;
  /** A material rebuilt from the edited body (UiMaterialKind.fromMarkdown), sent with the body. */
  material?(page: PageView, body: string): unknown | null;
}

const FIELDS = ['title', 'body', 'folder', 'visibility', 'status'] as const;
const fields = (page: PageView): PageDraft => ({ title: page.title, body: page.body, folder: page.folder, visibility: page.visibility, status: page.status });
const folderKey = (folder: string) => { try { return cleanFolder(folder); } catch { return folder; } };
/** What the server stores for a draft field, so a trimmed title does not count as a change. */
const stored = (draft: PageDraft, key: (typeof FIELDS)[number]): string =>
  key === 'title' ? draft.title.replace(/\s+/g, ' ').trim() : key === 'body' ? draft.body.replace(/\r\n?/g, '\n') : key === 'folder' ? folderKey(draft.folder) : draft[key];
const changes = (base: PageDraft, draft: PageDraft) => FIELDS.filter((key) => stored(base, key) !== stored(draft, key));

export class PageAutosave {
  private state: SaveState = { status: 'saved' };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private pending?: Promise<boolean>;
  private generation = 0;
  /** Keep the page's current state as a version on the next save ("keep mine" over someone's newer save). */
  private snapshotNext = false;
  constructor(private save: SavePage, private options: AutosaveOptions = {}) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(patch: Partial<SaveState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private get changed() {
    return !!(this.state.page && this.state.draft && changes(fields(this.state.page), this.state.draft).length);
  }
  /** Something is not on the server yet (for leave-page warnings). */
  get dirty() {
    return !!this.pending || this.changed || ['error', 'conflict'].includes(this.state.status);
  }

  /** A page from the server: the first load, or a newer revision seen elsewhere. */
  receive(page: PageView) {
    if (this.state.page?.id !== page.id) {
      this.generation++;
      clearTimeout(this.timer);
      this.controller?.abort();
      this.pending = undefined;
      this.publish({ page, draft: fields(page), remote: page, status: 'saved', error: undefined });
      return;
    }
    if (page.revision <= (this.state.remote?.revision ?? 0)) return;
    if (this.pending) { this.publish({ remote: page }); return; }
    if (this.dirty) {
      clearTimeout(this.timer);
      this.publish({ remote: page, status: 'conflict', error: 'library.conflict.lead' });
    } else {
      this.publish({ page, remote: page, draft: fields(page), status: 'saved', error: undefined });
    }
  }

  edit(patch: Partial<PageDraft>, options: { now?: boolean } = {}) {
    if (!this.state.draft) return;
    this.publish({ draft: { ...this.state.draft, ...patch } });
    if (['error', 'conflict'].includes(this.state.status)) return;
    this.publish({ status: this.pending ? 'saving' : this.changed ? 'dirty' : 'saved', error: undefined });
    this.schedule(options.now ? 0 : undefined);
  }

  private schedule(delay = this.options.delay ?? 800) {
    clearTimeout(this.timer);
    if (this.changed && !this.pending && !['error', 'conflict'].includes(this.state.status)) this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Saves now. With `retry`, also after an error. Resolves true when everything is on the server. */
  async flush(retry = false): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.pending) {
      await this.pending;
      return this.changed ? this.flush(retry) : this.state.status === 'saved';
    }
    if (!this.state.page || !this.state.draft) return false;
    if (this.state.status === 'conflict' || (this.state.status === 'error' && !retry)) return false;
    if (!this.changed) { this.publish({ status: 'saved', error: undefined }); return true; }
    const page = this.state.page, draft = { ...this.state.draft }, generation = this.generation;
    const title = stored(draft, 'title');
    if (!title || title.length > PAGE_LIMITS.title) { this.publish({ status: 'error', error: 'library.error.title' }); return false; }
    if (draft.body.length > PAGE_LIMITS.body) { this.publish({ status: 'error', error: 'library.error.tooLong' }); return false; }
    const input: PageSaveInput = { expected_revision: page.revision, ...(this.snapshotNext ? { snapshot: true } : {}) };
    for (const key of changes(fields(page), draft)) (input as unknown as Record<string, unknown>)[key] = key === 'title' ? title : draft[key];
    if (input.body !== undefined && this.options.material) {
      const material = this.options.material(page, input.body);
      if (material !== null && material !== undefined) input.material = material;
    }
    this.controller = new AbortController();
    const controller = this.controller;
    this.publish({ status: 'saving', error: undefined });
    const pending = (async () => {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          this.save(page.id, input, controller.signal),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => { controller.abort(); reject(new ApiError(0, 'timeout', 'Timed out.')); }, this.options.timeout ?? 15_000);
          }),
        ]);
        if (generation !== this.generation) return false;
        if (input.snapshot) this.snapshotNext = false;
        const remote = this.state.remote && this.state.remote.revision > result.revision ? this.state.remote : result;
        // The draft stays as typed (a trailing space in a title is not lost mid-word); the
        // comparison uses what the server stores, so a cleaned title is not a change.
        this.publish({ page: result, remote });
        const newer = remote.revision > result.revision;
        this.publish({ status: newer ? 'conflict' : this.changed ? 'dirty' : 'saved', error: newer ? 'library.conflict.lead' : undefined });
        return !newer;
      } catch (error) {
        if (generation !== this.generation) return false;
        const current = conflictPage(error);
        if (current) {
          this.publish({ remote: current, status: 'conflict', error: 'library.conflict.lead' });
          return false;
        }
        const code = error instanceof ApiError ? error.code : 'network';
        this.publish({ status: 'error', error: code === 'timeout' ? 'library.error.timeout' : code === 'network' || code === 'internal_error' ? 'library.error.save' : `error.${code}` });
        return false;
      } finally {
        clearTimeout(deadline);
        if (generation === this.generation) {
          this.pending = undefined;
          this.publish({});
          this.schedule();
        }
      }
    })();
    this.pending = pending;
    const success = await pending;
    if (success && generation === this.generation && this.changed) return this.flush(retry);
    return success;
  }

  /** Conflict: drop the draft and show the newest page. */
  useLatest() {
    const page = this.state.remote;
    if (!page) return;
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.pending = undefined;
    this.publish({ page, draft: fields(page), remote: page, status: 'saved', error: undefined });
  }

  /** Conflict: put the draft on top of the newest page and save it (the other version stays in the history). */
  keepMine() {
    const page = this.state.remote;
    if (!page || this.state.status !== 'conflict') return;
    this.generation++;
    this.pending = undefined;
    this.snapshotNext = true;
    this.publish({ page, status: 'dirty', error: undefined });
    void this.flush();
  }

  /** Leaving the page: a last save of what is pending, then stop listening. */
  dispose() {
    clearTimeout(this.timer);
    if (this.changed && !this.pending && !['error', 'conflict'].includes(this.state.status)) void this.flush();
    this.listeners.clear();
  }
}

