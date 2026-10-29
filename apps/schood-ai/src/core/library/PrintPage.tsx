import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { useT } from '../i18n/index.ts';
import { Answer } from '../markdown.tsx';
import { Link } from '../router.tsx';
import { ApiErrorState, LoadingState } from '../states.tsx';
import { BrandMark, Button } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';
import { getPage, uiMaterialKind, type PageView } from './api.ts';

// A page laid out for paper: the workspace's logo, name and colour at the top
// (Schood AI in a personal workspace), the title, the material or document, and
// the version and date at the foot. The browser's print window saves it as PDF.
// App chrome is hidden in print (index.css); this sheet uses no header/footer
// elements so the print rules leave it alone.

export function PrintPage({ pageId }: { pageId: string }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [page, setPage] = useState<PageView | null>(null), [error, setError] = useState<unknown>(null);
  const load = useCallback(() => { setError(null); getPage(pageId, workspace.workspaceId).then(setPage).catch(setError); }, [pageId, workspace.workspaceId]);
  useEffect(load, [load]);
  if (error) return <ApiErrorState error={error} onRetry={load}/>;
  if (!page) return <LoadingState/>;
  const ws = workspace.me?.workspace, branding = ws?.branding;
  const centre = ws?.kind === 'centre';
  const name = centre ? ws.name : 'Schood AI';
  const color = branding?.primary_color ?? '#0f172a';
  const kind = uiMaterialKind(page.kind);
  return <div className="mx-auto max-w-3xl">
    <div className="print-hidden mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link to={`/library/${page.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 no-underline hover:underline"><ArrowLeft size={16} aria-hidden="true"/>{page.title}</Link>
      <div className="flex flex-col items-end gap-1">
        <Button onClick={() => window.print()} icon={<Printer size={16} aria-hidden="true"/>}>{t('library.print.button')}</Button>
        <span className="text-xs text-gray-600">{t('library.print.hint')}</span>
      </div>
    </div>
    <div className="print-sheet rounded-3xl border border-navy-line bg-white p-6 md:p-10">
      <div className="print-brand mb-6 flex items-center gap-3 border-b-2 pb-3" style={{ borderColor: color }}>
        <BrandMark name={name} logo={centre ? branding?.logo_url ?? null : null} color={color} size={40}/>
        <span className="font-display text-lg font-bold" style={{ color }}>{name}</span>
      </div>
      <h1 className="m-0 mb-4 font-display text-3xl font-bold leading-tight text-gray-900">{page.title}</h1>
      {kind?.render && page.material != null ? <kind.render material={page.material} print/> : <Answer text={page.body} className="print-body"/>}
      <div className="print-foot mt-8 border-t border-gray-200 pt-3 text-xs text-gray-600">
        {page.folder && <span>{page.folder} · </span>}{t('library.print.meta', { revision: page.revision, date: date(page.updated_at, { dateStyle: 'long' }) })}
      </div>
    </div>
  </div>;
}
