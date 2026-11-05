// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai)
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Check, Copy, CopyPlus, Download, FileDown, History, Printer, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { useI18n, useT } from '../i18n/index.ts';
import { Answer } from '../markdown.tsx';
import { Link, navigate } from '../router.tsx';
import { ApiErrorState, EmptyState, LoadingState } from '../states.tsx';
import { Badge, Button, Dialog, TextArea, TextInput } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';
import {
  deletePage, duplicatePage, exportPage, getPage, pageRevision, pageRevisions, restorePage, savePage, uiMaterialKind,
  type PageExport, type PageRevisionSnapshot, type PageRevisionView, type PageStatus, type PageView,
} from './api.ts';
import { PageAutosave, type SaveState } from './autosave.ts';
import { sourceReason } from './source.ts';
import type { PageEditorProps } from './Library.tsx';
import { kindLabel } from './LibraryList.tsx';

// One page: title, folder, status and sharing, the body as a document (or Markdown
// source when the document editor cannot keep it), autosave with conflicts,
// version history with restore, export (Telegram, Markdown, JSON), print,
// duplicate and delete. Read-only for people who may read but not change it.

const RichEditor = lazy(() => import('./RichEditor.tsx'));

function usePageAutosave(page: PageView, workspaceId: string | null, onSaved?: (page: PageView) => void) {
  const [controller] = useState(() => {
    const kind = uiMaterialKind(page.kind);
    const instance = new PageAutosave(async (id, input, signal) => {
      const saved = await savePage(id, input, workspaceId, signal);
      onSaved?.(saved);
      return saved;
    }, { material: kind?.fromMarkdown ? (current, body) => kind.fromMarkdown!(body, current.material) : undefined });
    instance.receive(page);
    return instance;
  });
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => () => controller.dispose(), [controller]);
  return { controller, state };
}

export function PageEditorView({ pageId, onSaved, onDeleted }: PageEditorProps) {
  const workspace = useWorkspace();
  const [page, setPage] = useState<PageView | null>(null), [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    setPage(null);
    getPage(pageId, workspace.workspaceId).then(setPage).catch(setError);
  }, [pageId, workspace.workspaceId]);
  useEffect(load, [load]);
  if (error) return <ApiErrorState error={error} onRetry={load}/>;
  if (!page) return <LoadingState/>;
  return <Editor key={page.id} initial={page} onSaved={onSaved} onDeleted={onDeleted}/>;
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry(): void }) {
  const t = useT();
  const tone = { saved: 'text-gray-600', dirty: 'text-gray-700', saving: 'text-gray-700', error: 'text-red-700', conflict: 'text-amber-800' }[state.status];
  return <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 text-xs font-semibold ${tone}`}>
    {state.status === 'saved' && <Check size={14} aria-hidden="true"/>}
    {t(`library.save.${state.status}`)}
    {state.status === 'error' && <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline underline-offset-2"><RefreshCw size={12} aria-hidden="true"/>{t('library.save.retry')}</button>}
  </span>;
}

function Editor({ initial, onSaved, onDeleted }: { initial: PageView; onSaved?(page: PageView): void; onDeleted?(): void }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const ws = workspace.workspaceId, isCentre = workspace.me?.workspace.kind === 'centre';
  const { controller, state } = usePageAutosave(initial, ws, onSaved);
  const page = state.page ?? initial, draft = state.draft ?? { title: page.title, body: page.body, folder: page.folder, visibility: page.visibility, status: page.status };
  const kind = uiMaterialKind(page.kind);
  const editable = page.can_edit && kind?.editing !== 'readonly';
  const [mode, setMode] = useState<'document' | 'source'>(() => (sourceReason(initial.body) ? 'source' : 'document'));
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState(''), [problem, setProblem] = useState<unknown>(null);
  const [dialog, setDialog] = useState<'history' | 'export' | 'delete' | null>(null);
  const [folderText, setFolderText] = useState(draft.folder);
  useEffect(() => { setFolderText(page.folder); }, [page.folder]);

  // Warn before leaving with unsaved work; Ctrl/Cmd+S saves now.
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (controller.dirty) { event.preventDefault(); event.returnValue = ''; } };
    const keys = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void controller.flush(true); } };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('beforeunload', leave); window.removeEventListener('keydown', keys); };
  }, [controller]);

  /** Runs an action on the saved page (export, duplicate, history restore) after pending edits are saved. */
  const afterSave = async (action: () => Promise<void>) => {
    setProblem(null);
    if (editable && !(await controller.flush(true))) return;
    try { await action(); } catch (cause) { setProblem(cause); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice(t('library.copied')); } catch { /* the text stays on screen */ } };
  const back = `/library${page.folder ? `?folder=${encodeURIComponent(page.folder)}` : ''}`;
  const commitFolder = () => { if (folderText !== draft.folder) controller.edit({ folder: folderText }, { now: true }); };

  return <article className="mx-auto max-w-4xl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link to={back} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 no-underline hover:underline"><ArrowLeft size={16} aria-hidden="true"/>{t('library.back')}</Link>
      {editable && <SaveIndicator state={state} onRetry={() => void controller.flush(true)}/>}
    </div>

    {state.status === 'conflict' && <div role="alert" className="mb-4 rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="m-0 font-semibold">{t('library.conflict.title')}</p>
      <p className="mb-3 mt-1">{t('library.conflict.lead')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => controller.useLatest()}>{t('library.conflict.latest')}</Button>
        <Button size="sm" onClick={() => controller.keepMine()} title={t('library.conflict.mineHint')}>{t('library.conflict.mine')}</Button>
        <Button size="sm" variant="ghost" onClick={() => void copy(draft.body)} icon={<Copy size={14} aria-hidden="true"/>}>{t('library.conflict.copy')}</Button>
      </div>
      <p className="mb-0 mt-2 text-xs">{t('library.conflict.mineHint')}</p>
    </div>}
    {state.status === 'error' && state.error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t(state.error)}</p>}
    {notice && <p role="status" className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {problem ? <div className="mb-4"><ApiErrorState error={problem}/></div> : null}

    {editable
      ? <label className="block"><span className="sr-only">{t('library.field.title')}</span>
        <input value={draft.title} onChange={(event) => controller.edit({ title: event.target.value })} maxLength={200}
          className="w-full rounded-2xl border border-transparent bg-transparent px-1 py-1 font-display text-3xl font-bold leading-tight text-gray-900 hover:border-navy-line/20 focus:border-navy-line focus:bg-white focus:outline-none md:text-4xl"/>
      </label>
      : <h1 className="m-0 font-display text-3xl font-bold leading-tight text-gray-900 md:text-4xl">{page.title}</h1>}

    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-700">
      <Badge>{kindLabel(t, page.kind)}</Badge>
      {page.visibility === 'workspace' && <Badge tone="sky">{t('library.shared')}</Badge>}
      <span>{t('library.updated', { date: date(page.updated_at, { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
    </div>

    {page.can_edit && <div className="mt-4 grid gap-3 rounded-3xl border border-navy-line/25 bg-white/70 p-4 md:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-700">{t('library.field.folder')}
        <TextInput value={folderText} onChange={(event) => setFolderText(event.target.value)} onBlur={commitFolder}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitFolder(); } }} maxLength={200} placeholder="IELTS/Reading" title={t('library.field.folderHint')}/>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-700">{t('library.field.status')}
        <select value={draft.status} onChange={(event) => controller.edit({ status: event.target.value as PageStatus }, { now: true })}
          className="min-h-11 rounded-2xl border border-navy-line bg-white px-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy">
          {(['draft', 'approved', 'archived'] as const).map((value) => <option key={value} value={value}>{t(`library.status.${value}`)}</option>)}
        </select>
      </label>
      {isCentre && <label className="flex items-start gap-2 text-sm text-gray-800">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={draft.visibility === 'workspace'} disabled={!page.owner.is_me && draft.visibility !== 'workspace'}
          onChange={(event) => controller.edit({ visibility: event.target.checked ? 'workspace' : 'private' }, { now: true })}/>
        <span><span className="inline-flex items-center gap-1 font-semibold"><Share2 size={14} aria-hidden="true"/>{t('library.field.share')}</span>
          <span className="mt-0.5 block text-xs text-gray-600">{t('library.field.shareHint')}</span></span>
      </label>}
    </div>}

    <div role="toolbar" aria-label={t('library.actions')} className="mt-4 flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setDialog('history')} icon={<History size={14} aria-hidden="true"/>}>{t('library.history')}</Button>
      <Button variant="secondary" size="sm" onClick={() => void afterSave(async () => setDialog('export'))} icon={<FileDown size={14} aria-hidden="true"/>}>{t('library.export')}</Button>
      <Button variant="secondary" size="sm" onClick={() => void afterSave(async () => navigate(`/library/${page.id}/print`))} icon={<Printer size={14} aria-hidden="true"/>}>{t('library.print')}</Button>
      {workspace.access('T6').allowed && <Button variant="secondary" size="sm" onClick={() => void afterSave(async () => navigate(`/library/${(await duplicatePage(page.id, ws)).id}`))} icon={<CopyPlus size={14} aria-hidden="true"/>}>{t('library.duplicate')}</Button>}
      {page.can_edit && <Button variant="danger" size="sm" onClick={() => setDialog('delete')} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('library.delete')}</Button>}
    </div>

    <div className="mt-5">
      {!editable ? <div className="rounded-3xl border border-navy-line bg-white p-5 md:p-6">
          {kind?.render && page.material != null ? <kind.render material={page.material} print={false}/> : draft.body ? <Answer text={draft.body}/> : <EmptyState/>}
        </div>
        : <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t('library.mode.label')} className="flex gap-1 rounded-full border border-navy-line bg-white/80 p-1">
              {(['document', 'source'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setPreview(false); }}
                className={`min-h-9 rounded-full px-3 text-xs font-semibold ${mode === value ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream'}`}>{t(`library.mode.${value}`)}</button>)}
            </div>
            {mode === 'source' && <Button variant="ghost" size="sm" aria-pressed={preview} onClick={() => setPreview(!preview)}>{t('library.mode.preview')}</Button>}
          </div>
          {mode === 'source' && sourceReason(draft.body) && <p className="mb-2 mt-0 text-xs text-gray-600">{t('library.mode.sourceHint')}</p>}
          {mode === 'document'
            ? <Suspense fallback={<LoadingState label={t('library.editor.loading')}/>}><RichEditor value={draft.body} onChange={(body) => controller.edit({ body })} onNotice={setNotice}/></Suspense>
            : preview ? <div className="rounded-3xl border border-navy-line bg-white p-5 md:p-6"><Answer text={draft.body}/></div>
            : <TextArea aria-label={t('library.editor.label')} value={draft.body} onChange={(event) => controller.edit({ body: event.target.value })} rows={22} className="font-mono text-sm" spellCheck/>}
        </>}
      {kind?.editing === 'readonly' && page.can_edit && <p className="mt-3 text-sm text-gray-700">{t('library.readonlyKind')} {kind.editorPath && <Link to={kind.editorPath(page.id)} className="font-semibold underline underline-offset-2">{t('library.openEditor')}</Link>}</p>}
      {!page.can_edit && <p className="mt-3 text-xs text-gray-600">{t('library.readOnly')}</p>}
    </div>

    <HistoryDialog open={dialog === 'history'} page={page} onClose={() => setDialog(null)} canRestore={editable}
      onRestore={(revision) => afterSave(async () => {
        const restored = await restorePage(page.id, revision, controller.getSnapshot().page!.revision, ws);
        controller.receive(restored);
        setDialog(null);
        setNotice(t('library.history.restored'));
      })}/>
    <ExportDialog open={dialog === 'export'} page={page} onClose={() => setDialog(null)} onCopy={copy}/>
    <Dialog open={dialog === 'delete'} title={t('library.deleteTitle')} onClose={() => setDialog(null)} closeLabel={t('library.close')}>
      <p className="mt-0 text-sm text-gray-700">{t('library.deleteLead')}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setDialog(null)}>{t('library.cancel')}</Button>
        <Button variant="danger" onClick={() => void (async () => {
          try {
            await deletePage(page.id, ws);
            controller.dispose();
            setDialog(null);
            if (onDeleted) onDeleted(); else navigate(back);
          } catch (cause) { setDialog(null); setProblem(cause); }
        })()} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('library.delete')}</Button>
      </div>
    </Dialog>
  </article>;
}

function HistoryDialog({ open, page, canRestore, onClose, onRestore }: { open: boolean; page: PageView; canRestore: boolean; onClose(): void; onRestore(revision: number): Promise<void> }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [revisions, setRevisions] = useState<PageRevisionView[] | null>(null), [error, setError] = useState<unknown>(null);
  const [chosen, setChosen] = useState<PageRevisionSnapshot | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRevisions(null); setChosen(null); setError(null);
    pageRevisions(page.id, workspace.workspaceId).then(setRevisions).catch(setError);
  }, [open, page.id, page.revision, workspace.workspaceId]);
  const pick = (revision: number) => { setBusy(true); pageRevision(page.id, revision, workspace.workspaceId).then(setChosen).catch(setError).finally(() => setBusy(false)); };
  return <Dialog open={open} title={t('library.history')} onClose={onClose} closeLabel={t('library.close')}>
    <p className="mt-0 text-sm text-gray-700">{t('library.history.lead')}</p>
    {error ? <ApiErrorState error={error}/> : !revisions ? <LoadingState/> : !revisions.length ? <EmptyState title={t('library.history.empty')}/> : <>
      <ul className="m-0 grid max-h-56 list-none gap-1 overflow-y-auto p-0">{revisions.map((revision) => <li key={revision.revision}>
        <button type="button" onClick={() => pick(revision.revision)} aria-pressed={chosen?.revision === revision.revision}
          className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm ${chosen?.revision === revision.revision ? 'bg-navy text-white' : 'bg-white hover:bg-cream'}`}>
          <span className="font-semibold">{t('library.history.version', { revision: revision.revision })}</span>
          <span className="text-xs opacity-80">{date(revision.created_at, { dateStyle: 'medium', timeStyle: 'short' })} · {t(revision.author_is_me ? 'library.byYou' : 'library.byColleague')}</span>
        </button>
      </li>)}</ul>
      <div className="mt-4">
        {busy ? <LoadingState/> : !chosen ? <p className="m-0 text-sm text-gray-600">{t('library.history.pick')}</p> : <>
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-navy-line/30 bg-white p-4">
            <p className="mt-0 font-display font-bold">{chosen.title}</p>
            {chosen.body ? <Answer text={chosen.body}/> : <EmptyState/>}
          </div>
          {canRestore && <div className="mt-3 flex justify-end"><Button disabled={busy} onClick={() => { setBusy(true); void onRestore(chosen.revision).finally(() => setBusy(false)); }}>{t('library.history.restore')}</Button></div>}
        </>}
      </div>
    </>}
  </Dialog>;
}

function ExportDialog({ open, page, onClose, onCopy }: { open: boolean; page: PageView; onClose(): void; onCopy(text: string): Promise<void> }) {
  const t = useT(), workspace = useWorkspace();
  const [format, setFormat] = useState<PageExport['format']>('telegram');
  const [result, setResult] = useState<PageExport | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!open) return;
    setResult(null); setError(null);
    exportPage(page.id, format, workspace.workspaceId).then(setResult).catch(setError);
  }, [open, format, page.id, page.revision, workspace.workspaceId]);
  const download = (data: PageExport) => {
    const url = URL.createObjectURL(new Blob([data.parts.join('\n\n')], { type: `${data.mime};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url; link.download = data.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Dialog open={open} title={t('library.export')} onClose={onClose} closeLabel={t('library.close')}>
    <div role="group" aria-label={t('library.export')} className="mb-3 flex flex-wrap gap-1 rounded-full border border-navy-line bg-white/80 p-1">
      {(['telegram', 'markdown', 'json'] as const).map((value) => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)}
        className={`min-h-9 flex-1 rounded-full px-3 text-xs font-semibold ${format === value ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream'}`}>{t(`library.export.${value}`)}</button>)}
    </div>
    {error ? <ApiErrorState error={error}/> : !result ? <LoadingState/> : !result.parts.length ? <EmptyState title={t('library.export.empty')}/> : result.format === 'telegram' ? <>
      <p className="mt-0 text-sm text-gray-700">{t('library.export.lead')}</p>
      <ol className="m-0 grid max-h-[50vh] list-none gap-3 overflow-y-auto p-0">{result.parts.map((part, index) => <li key={index} className="rounded-2xl border border-navy-line/30 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-700">{t('library.export.part', { n: index + 1, total: result.parts.length })}</span>
          <Button size="sm" variant="secondary" onClick={() => void onCopy(part)} icon={<Copy size={12} aria-hidden="true"/>}>{t('library.export.copy')}</Button>
        </div>
        <pre className="m-0 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-gray-900">{part}</pre>
      </li>)}</ol>
    </> : <>
      <pre className="m-0 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-navy-line/30 bg-white p-3 font-mono text-xs text-gray-900">{result.parts[0]}</pre>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => void onCopy(result.parts[0])} icon={<Copy size={14} aria-hidden="true"/>}>{t('library.export.copy')}</Button>
        <Button onClick={() => download(result)} icon={<Download size={14} aria-hidden="true"/>}>{t('library.export.download')}</Button>
      </div>
    </>}
  </Dialog>;
}
