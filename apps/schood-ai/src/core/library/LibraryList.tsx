// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai)
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { FilePlus2, Folder, FolderOpen, Pencil, Search, Users } from 'lucide-react';
import { useI18n, useT } from '../i18n/index.ts';
import { Link, navigate, useLocation } from '../router.tsx';
import { ApiErrorState, EmptyState, LoadingState } from '../states.tsx';
import { Badge, Button, Dialog, Field, PageHeader, TextInput } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';
import { createPage, listFolders, listPages, moveFolder, uiMaterialKind, uiMaterialKinds, type FolderView, type PageStatus, type PageSummary } from './api.ts';
import type { LibraryViewProps } from './Library.tsx';

// The library list: search, "mine / shared / everything" in centres, folders,
// status and kind filters, paging, new pages and folder renames. The list shows
// excerpts only; bodies load when a page opens.

const PAGE_SIZE = 50;
type Scope = 'mine' | 'workspace' | 'all';

export const kindLabel = (t: (key: string) => string, kind: string) => {
  const ui = uiMaterialKind(kind);
  return ui ? t(ui.label) : t(`library.kind.${kind}`);
};

/** An excerpt without Markdown marks, for the list. */
export const plainText = (markdown: string) => markdown
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[( |x|X)\]/g, ' ')
  .replace(/\\[()[\]]/g, ' ')
  .replace(/(^|\s)(#{1,6}|>|[-+*]|\d+\.)(?=\s)/g, ' ')
  .replace(/[*_`|~]+|-{3,}|\${1,2}/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Every folder and its parents, in order, with the pages directly inside. */
function folderTree(folders: FolderView[]) {
  const counts = new Map<string, number>();
  for (const folder of folders) {
    if (!folder.path) continue;
    const parts = folder.path.split('/');
    for (let depth = 1; depth <= parts.length; depth++) {
      const path = parts.slice(0, depth).join('/');
      counts.set(path, (counts.get(path) ?? 0) + (depth === parts.length ? folder.count : 0));
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([path, count]) => ({ path, count, depth: path.split('/').length - 1, name: path.split('/').at(-1)! }));
}

export function LibraryList({ kind, folder: startFolder, onOpen, readOnly }: LibraryViewProps) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n(), { query: params } = useLocation();
  const ws = workspace.workspaceId, isCentre = workspace.me?.workspace.kind === 'centre';
  const canEdit = workspace.access('T6').allowed;
  const [scope, setScope] = useState<Scope>('mine');
  const [folder, setFolder] = useState<string | null>(startFolder ?? params.get('folder'));
  const [status, setStatus] = useState<PageStatus | ''>('');
  const [kindFilter, setKindFilter] = useState(kind ?? '');
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [pages, setPages] = useState<PageSummary[] | null>(null), [more, setMore] = useState(false);
  const [folders, setFolders] = useState<FolderView[]>([]);
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false), [notice, setNotice] = useState('');

  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const filter = useMemo(() => ({ scope, folder: query ? null : folder, status: status || undefined, kind: kind ?? (kindFilter || undefined), query: query || undefined, limit: PAGE_SIZE }), [scope, folder, status, kind, kindFilter, query]);

  const load = useCallback(async () => {
    setError(null);
    setPages(null);
    try {
      const [list, folderList] = await Promise.all([listPages(filter, ws), listFolders(ws)]);
      setPages(list);
      setMore(list.length === PAGE_SIZE);
      setFolders(folderList);
    } catch (cause) { setError(cause); }
  }, [filter, ws]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!pages?.length) return;
    setBusy(true);
    try {
      const next = await listPages({ ...filter, before: pages.at(-1)!.updated_at }, ws);
      setPages([...pages, ...next.filter((page) => !pages.some((seen) => seen.id === page.id))]);
      setMore(next.length === PAGE_SIZE);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true);
    try {
      const page = await createPage({ kind: 'note', title: t('library.untitled'), folder: folder ?? '' }, ws);
      navigate(`/library/${page.id}`);
    } catch (cause) { setError(cause); setBusy(false); }
  };
  const open = (page: PageSummary) => (onOpen ? onOpen(page) : navigate(`/library/${page.id}`));
  const tree = useMemo(() => folderTree(folders), [folders]);
  const kinds = uiMaterialKinds();
  const selectClass = 'min-h-11 rounded-2xl border border-navy-line bg-white px-3 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy';

  return <>
    <PageHeader title={t('library.title')} lead={t('library.lead')} actions={!readOnly && canEdit && <Button className="whitespace-nowrap" onClick={() => void create()} disabled={busy} icon={<FilePlus2 size={16} aria-hidden="true"/>}>{t('library.new')}</Button>}/>
    {!canEdit && !readOnly && <p className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/30 bg-cream-soft p-3 text-sm text-gray-800">
      {t('library.planNote')} <Link to="/plans" className="font-semibold underline underline-offset-2">{t('library.seePlans')}</Link>
    </p>}
    {notice && <p role="status" className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

    <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <label className="relative min-w-0 flex-1 md:min-w-[16rem]">
        <span className="sr-only">{t('library.search')}</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"/>
        <TextInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('library.search')} className="pl-9" maxLength={200}/>
      </label>
      {isCentre && <div role="group" aria-label={t('library.scope.label')} className="flex flex-wrap gap-1 rounded-full border border-navy-line bg-white/80 p-1">
        {(['mine', 'workspace', 'all'] as const).map((value) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}
          className={`min-h-9 rounded-full px-3 text-xs font-semibold ${scope === value ? 'bg-navy text-white' : 'text-gray-800 hover:bg-cream'}`}>{t(`library.scope.${value}`)}</button>)}
      </div>}
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-700">{t('library.filter.status')}
        <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as PageStatus | '')}>
          <option value="">{t('library.filter.allStatuses')}</option>
          {(['draft', 'approved', 'archived'] as const).map((value) => <option key={value} value={value}>{t(`library.status.${value}`)}</option>)}
        </select>
      </label>
      {!kind && kinds.length > 0 && <label className="flex flex-col gap-1 text-xs font-semibold text-gray-700">{t('library.filter.kind')}
        <select className={selectClass} value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
          <option value="">{t('library.filter.allKinds')}</option>
          {['note', ...kinds.map((entry) => entry.kind)].map((value) => <option key={value} value={value}>{kindLabel(t, value)}</option>)}
        </select>
      </label>}
    </div>

    <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label={t('library.folders')} className="min-w-0">
        <label className="md:hidden">
          <span className="mb-1 block text-xs font-semibold text-gray-700">{t('library.folders')}</span>
          <select className={`${selectClass} w-full`} value={folder ?? '\u0000'} onChange={(event) => setFolder(event.target.value === '\u0000' ? null : event.target.value)}>
            <option value={'\u0000'}>{t('library.folder.all')}</option>
            <option value="">{t('library.folder.root')}</option>
            {tree.map((entry) => <option key={entry.path} value={entry.path}>{`${'— '.repeat(entry.depth)}${entry.name}`}</option>)}
          </select>
        </label>
        <ul className="m-0 hidden list-none space-y-0.5 p-0 md:block">
          {[{ path: null as string | null, name: t('library.folder.all'), depth: 0 }, { path: '', name: t('library.folder.root'), depth: 0 }, ...tree].map((entry) => {
            const active = folder === entry.path;
            return <li key={entry.path ?? '*'}>
              <button type="button" onClick={() => setFolder(entry.path)} aria-current={active ? 'true' : undefined} style={{ paddingLeft: `${0.75 + entry.depth * 0.9}rem` }}
                className={`flex min-h-9 w-full items-center gap-2 rounded-xl pr-2 text-left text-sm ${active ? 'bg-navy text-white' : 'text-gray-800 hover:bg-white/80'}`}>
                {active ? <FolderOpen size={15} aria-hidden="true"/> : <Folder size={15} aria-hidden="true"/>}<span className="min-w-0 flex-1 truncate">{entry.name}</span>
              </button>
            </li>;
          })}
        </ul>
        {folder && canEdit && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRenaming(true)} icon={<Pencil size={14} aria-hidden="true"/>}>{t('library.folder.rename')}</Button>}
      </nav>

      <section aria-live="polite" className="min-w-0">
        {error ? <ApiErrorState error={error} onRetry={() => void load()}/> : !pages ? <LoadingState/> : !pages.length ?
          <EmptyState title={query ? t('library.noResults') : t('library.empty')} lead={query ? undefined : t('library.emptyLead')}/> :
          <>
            <ul className="m-0 grid list-none gap-2 p-0">{pages.map((page) => <li key={page.id} className="rounded-2xl border border-navy-line/25 bg-white/85 p-4">
              <div className="flex flex-wrap items-start gap-2">
                {onOpen
                  ? <button type="button" onClick={() => open(page)} className="min-w-0 flex-1 text-left font-display text-base font-bold text-gray-900 hover:underline">{page.title}</button>
                  : <Link to={`/library/${page.id}`} className="min-w-0 flex-1 font-display text-base font-bold text-gray-900 no-underline hover:underline">{page.title}</Link>}
                {page.status !== 'draft' && <Badge tone={page.status === 'approved' ? 'lime' : 'neutral'}>{t(`library.status.${page.status}`)}</Badge>}
                {page.visibility === 'workspace' && <Badge tone="sky"><Users size={12} aria-hidden="true"/>{t('library.shared')}</Badge>}
              </div>
              {page.excerpt && <p className="mb-0 mt-1 line-clamp-2 text-sm leading-6 text-gray-700">{plainText(page.excerpt)}</p>}
              <p className="mb-0 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                <span>{kindLabel(t, page.kind)}</span>
                {page.folder && <span className="inline-flex items-center gap-1"><Folder size={12} aria-hidden="true"/>{page.folder}</span>}
                <span>{t('library.updated', { date: date(page.updated_at, { dateStyle: 'medium' }) })}</span>
                {isCentre && <span>{t(page.owner.is_me ? 'library.byYou' : 'library.byColleague')}</span>}
              </p>
            </li>)}</ul>
            {more && <div className="mt-4"><Button variant="secondary" disabled={busy} onClick={() => void loadMore()}>{t('library.loadMore')}</Button></div>}
          </>}
      </section>
    </div>
    {folder && <RenameFolder open={renaming} from={folder} onClose={() => setRenaming(false)} onMoved={(to, count) => {
      setRenaming(false); setFolder(to); setNotice(t('library.folder.moved', { count })); void load();
    }}/>}
  </>;
}

function RenameFolder({ open, from, onClose, onMoved }: { open: boolean; from: string; onClose(): void; onMoved(to: string, count: number): void }) {
  const t = useT(), workspace = useWorkspace();
  const [to, setTo] = useState(from), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(from); setError(null); } }, [open, from]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { moved } = await moveFolder(from, to, workspace.workspaceId);
      onMoved(to.split('/').map((part) => part.trim()).filter(Boolean).join('/'), moved);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  return <Dialog open={open} title={t('library.folder.rename')} onClose={onClose} closeLabel={t('library.close')}>
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <p className="m-0 text-sm text-gray-700">{t('library.folder.renameLead')}</p>
      <Field label={t('library.folder.to')} hint={t('library.field.folderHint')}>{(id) => <TextInput id={id} value={to} onChange={(event) => setTo(event.target.value)} maxLength={200} required/>}</Field>
      {error ? <ApiErrorState error={error}/> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('library.cancel')}</Button>
        <Button type="submit" disabled={busy || !to.trim() || to.trim() === from}>{t('library.folder.move')}</Button>
      </div>
    </form>
  </Dialog>;
}
