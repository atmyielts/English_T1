import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { parseMaterial, versions, type Material } from '../../../../../packages/ai-core/src/materials/mod.ts';
import { api, ApiErrorState, BrandMark, Button, Field, getPage, Link, LoadingState, TextInput, useI18n, useT, useWorkspace, type Branding, type PageView } from '../../core/index.ts';
import { notePrint } from '../api.ts';
import { MaterialView } from '../MaterialView.tsx';

// Print and PDF for a teaching material with the workspace's own logo and colour:
// a centre's (set in Settings), or an independent teacher's own, set right here
// (core Settings shows branding to centres only; core/settings takes it for any
// workspace owner). The student copy
// has name and date lines and no key; the teacher copy has the key, inline or on
// its own page. The browser's print window saves PDF; app chrome is hidden in
// print by core's print rules (print-hidden).

type Copy = 'student' | 'teacher' | 'key_end';

export default function PrintMaterial({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [page, setPage] = useState<PageView | null>(null), [error, setError] = useState<unknown>(null);
  const [copy, setCopy] = useState<Copy>('student'), [version, setVersion] = useState<'core' | 'support' | 'stretch'>('core');
  const [template, setTemplate] = useState<string | null>(null);
  const noted = useRef(false);
  const load = useCallback(() => { setError(null); getPage(params.id, workspace.workspaceId).then(setPage).catch(setError); }, [params.id, workspace.workspaceId]);
  useEffect(load, [load]);
  // The centre's worksheet template (house style), when it has one.
  useEffect(() => {
    api<{ workspace: { house_style?: { worksheet_template?: string | null } } }>('core/settings', { workspaceId: workspace.workspaceId })
      .then((result) => setTemplate(result.workspace.house_style?.worksheet_template ?? null)).catch(() => setTemplate(null));
  }, [workspace.workspaceId]);
  useEffect(() => {
    if (!page) return;
    const before = () => { if (noted.current) return; noted.current = true; void notePrint(workspace.workspaceId, page.id).catch(() => undefined); };
    addEventListener('beforeprint', before);
    return () => removeEventListener('beforeprint', before);
  }, [page, workspace.workspaceId]);
  if (error) return <ApiErrorState error={error} onRetry={load}/>;
  if (!page || !workspace.me) return <LoadingState/>;
  let material: Material | null = null;
  try { material = parseMaterial(page.material); } catch { material = null; }
  if (!material) return <ApiErrorState error={null}/>;
  const ws = workspace.me.workspace, branding = ws.branding;
  const name = ws.kind === 'centre' ? ws.name : workspace.me.user.name ?? 'Schood AI';
  const color = branding.primary_color ?? '#0f172a';
  const compact = template === 'compact';
  return <div className="mx-auto max-w-3xl">
    <div className="print-hidden mb-4 grid gap-3 rounded-3xl border border-navy-line bg-white p-4">
      <Link to={`/studio/page/${page.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 no-underline hover:underline"><ArrowLeft size={16} aria-hidden="true"/>{page.title}</Link>
      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0"><legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('teacher.print.copy')}</legend>
          {(['student', 'teacher', 'key_end'] as const).map((entry) => <label key={entry} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${copy === entry ? 'border-navy bg-navy text-white' : 'border-navy-line/40'}`}>
            <input type="radio" name="copy" className="sr-only" checked={copy === entry} onChange={() => setCopy(entry)}/>{t(`teacher.print.${entry}`)}</label>)}
        </fieldset>
        {material.variants?.length ? <label className="grid gap-1 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('teacher.print.version')}
          <select className="min-h-9 rounded-full border border-navy-line/40 bg-white px-3 text-sm normal-case tracking-normal text-gray-900" value={version} onChange={(event) => setVersion(event.target.value as typeof version)}>
            {versions(material).map((entry) => <option key={entry.label} value={entry.label}>{t(`teacher.variant.${entry.label}`)} · {entry.level}</option>)}
          </select></label> : null}
        <span className="flex-1"/>
        <Button onClick={() => print()} icon={<Printer size={16} aria-hidden="true"/>}>{t('teacher.print.button')}</Button>
      </div>
      <p className="m-0 text-xs text-gray-600">{t('teacher.print.hint')}{!branding.logo_url ? ` ${t(ws.kind === 'centre' ? 'teacher.print.noLogoCentre' : 'teacher.print.noLogo')}` : ''}</p>
      {ws.kind !== 'centre' && ws.role === 'owner' && <PersonalLogo branding={branding}/>}
    </div>
    <article className={`print-sheet rounded-3xl border border-navy-line bg-white p-6 md:p-10 print:rounded-none print:border-0 print:p-0 ${compact ? 'text-[13px]' : ''}`}>
      <header className="mb-5 flex items-center gap-3 border-b-2 pb-3" style={{ borderColor: color }}>
        <BrandMark name={name} logo={branding.logo_url} color={color} size={44}/>
        <span className="min-w-0 flex-1 font-display text-lg font-bold" style={{ color }}>{name}</span>
        <span className="text-right text-xs text-gray-600">{t(`teacher.kind.${material.kind}`)}<br/>{material.level.replace('band:', '')}</span>
      </header>
      <h1 className="m-0 mb-3 font-display text-2xl font-bold leading-tight text-gray-900">{page.title}</h1>
      {copy === 'student' && template !== 'none' && <div className="mb-5 grid grid-cols-[1fr_auto] gap-6 text-sm text-gray-800" aria-hidden="true">
        <span className="border-b border-gray-400 pb-1">{t('teacher.print.name')}</span><span className="w-40 border-b border-gray-400 pb-1">{t('teacher.print.date')}</span>
      </div>}
      <MaterialView material={material} mode={copy === 'student' ? 'student' : 'teacher'} version={version} keyAtEnd={copy === 'key_end'}/>
      <footer className="mt-8 border-t border-gray-200 pt-2 text-xs text-gray-600">{t('teacher.print.foot', { revision: page.revision, date: date(page.updated_at, { dateStyle: 'long' }) })}</footer>
    </article>
  </div>;
}

// An independent teacher's own logo for printouts, saved to their personal workspace.
function PersonalLogo({ branding }: { branding: Branding }) {
  const t = useT(), workspace = useWorkspace();
  const [value, setValue] = useState(branding.logo_url ?? '');
  const [state, setState] = useState<{ busy: boolean; error: unknown; saved: boolean }>({ busy: false, error: null, saved: false });
  const save = async (logo: string | null) => {
    setState({ busy: true, error: null, saved: false });
    try {
      await api('core/settings', { method: 'PATCH', workspaceId: workspace.workspaceId, body: { branding: { ...branding, logo_url: logo } } });
      await workspace.refresh();
      setState({ busy: false, error: null, saved: true });
    } catch (error) { setState({ busy: false, error, saved: false }); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void save(value.trim() || null); };
  return <form onSubmit={submit} className="grid gap-2 border-t border-navy-line/20 pt-3">
    <Field label={t('teacher.print.logo')} hint={t('teacher.print.logoHint')}>{(id) => <TextInput id={id} type="url" inputMode="url" pattern="https://.*" maxLength={500} value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://"/>}</Field>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" variant="secondary" disabled={state.busy || !value.trim() || value.trim() === branding.logo_url}>{t('teacher.print.logoSave')}</Button>
      {branding.logo_url && <Button size="sm" variant="ghost" disabled={state.busy} onClick={() => { setValue(''); void save(null); }}>{t('teacher.print.logoRemove')}</Button>}
      {state.saved && <span role="status" className="text-xs text-green-800">{t('teacher.print.logoSaved')}</span>}
    </div>
    {state.error !== null && <ApiErrorState error={state.error}/>}
  </form>;
}
