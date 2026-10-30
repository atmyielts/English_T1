import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eye, PenLine, RotateCcw, X } from 'lucide-react';
import { MATERIAL_KIND_CATALOG, type MaterialKindId } from '../../../../../packages/ai-core/src/materials/catalog.ts';
import type { MaterialBrief } from '../../../../../packages/ai-core/src/materials/mod.ts';
import { ApiError, ApiErrorState, Badge, Button, Dialog, ErrorState, Eyebrow, LoadingState, PageHeader, SparkMark, Thinking, navigate, useT, useWorkspace } from '../../core/index.ts';
import { decideMaterial, editMaterial, getMaterial, recheckMaterial, stepMaterial, type MaterialJob } from '../api.ts';
import { ChecksPanel } from '../Checks.tsx';
import { MaterialEditor } from '../MaterialEditor.tsx';
import { MaterialView } from '../MaterialView.tsx';
import { pendingImages, setBriefDraft } from '../state.ts';
import { StatusBadge } from './Studio.tsx';

// A material job: while it is being written this screen runs one step at a time
// (each request is one model call), then shows the T2 review card: the checked key,
// what the checker disagreed with, the teacher's edits, and Approve & save, which
// puts it in the library. Nothing reaches students before that.

// Academy mistake tags (`tfng_not_given`) read as words, as the Studio shows them.
const readableTags = (tags: string[]) => tags.map((tag) => tag.replace(/[_-]+/g, ' ')).join(', ');

export default function MaterialJobPage({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace();
  const [job, setJob] = useState<MaterialJob | null>(null), [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<'preview' | 'edit'>('preview');
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [actionError, setActionError] = useState<unknown>(null);
  const running = useRef(false), mounted = useRef(true);
  // A refusal (credits, cap, paywall) pauses the driving until the person retries.
  const [paused, setPaused] = useState(false);
  const id = params.id;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(() => { getMaterial(workspace.workspaceId, id).then((next) => { if (mounted.current) setJob(next); }).catch((cause) => { if (mounted.current) setError(cause); }); }, [id, workspace.workspaceId]);
  useEffect(load, [load]);

  // Drive the job: one step per request until it is ready or something stops it. The
  // result is kept even if the effect re-ran meanwhile (StrictMode runs effects twice).
  useEffect(() => {
    if (!job || paused || !['requested', 'generating'].includes(job.status) || running.current) return;
    running.current = true;
    const tick = async () => {
      try {
        if (job.progress.running) { await new Promise((resolve) => setTimeout(resolve, 3000)); load(); return; }
        const next = await stepMaterial(workspace.workspaceId, job.id, pendingImages.get(job.id));
        if (mounted.current) { setError(null); setJob(next); }
      } catch (cause) {
        if (!mounted.current) return;
        if (cause instanceof ApiError && cause.code === 'timeout') { load(); return; }
        setError(cause);
        setPaused(true);
        load();
      } finally { running.current = false; }
    };
    void tick();
  }, [job, paused, load, workspace.workspaceId]);
  useEffect(() => { if (job?.status === 'ready' || job?.status === 'failed') pendingImages.delete(id); }, [job?.status, id]);

  if (!job) return error ? <ApiErrorState error={error} onRetry={load}/> : <LoadingState/>;
  const title = job.material?.title ?? job.title ?? t(`teacher.kind.${job.kind}`);
  const header = <PageHeader eyebrow={<Eyebrow icon={<SparkMark size={18}/>}>{t(`teacher.kind.${job.kind}`)}{job.level ? ` · ${job.level.replace('band:', '')}` : ''}</Eyebrow>} title={title}
    actions={<StatusBadge status={job.status}/>}/>;

  if (job.status === 'requested' || job.status === 'generating') {
    const total = job.progress.total + job.progress.solve_total, done = job.progress.done + job.progress.solve_done;
    return <>{header}
      <section className="rounded-3xl border border-navy-line bg-white p-6" aria-live="polite">
        <Thinking label={job.progress.phase === 'solve' ? t('teacher.job.solving') : t('teacher.job.writing', { done: job.progress.done + 1, total: job.progress.total })}/>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-cream-deep" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={done} aria-label={t('teacher.job.progress')}>
          <div className="h-full rounded-full bg-gradient-to-r from-lime to-sky-ai transition-all" style={{ width: `${Math.round((done / Math.max(1, total || job.progress.total)) * 100)}%` }}/>
        </div>
        <p className="m-0 mt-3 text-sm text-gray-700">{t('teacher.job.lead')}</p>
        {job.focus && <p className="m-0 mt-2 text-sm text-gray-700">{t('teacher.job.focus', { group: job.focus.classroom_name ?? '', tags: readableTags(job.focus.tags) })}</p>}
        {job.focus_unavailable && <p className="m-0 mt-2 text-sm text-amber-900">{t('teacher.job.focusUnavailable')}</p>}
        {error !== null && <div className="mt-4"><ApiErrorState error={error} onRetry={() => { setError(null); setPaused(false); load(); }}/></div>}
      </section>
    </>;
  }
  if (job.status === 'failed') {
    return <>{header}<ErrorState title={t('teacher.job.failed')} lead={t(`teacher.job.error.${job.error_code ?? 'generation_failed'}`) === `teacher.job.error.${job.error_code}` ? t('teacher.job.failedLead') : t(`teacher.job.error.${job.error_code ?? 'generation_failed'}`)}/>
      <div className="mt-4"><Button variant="spark" icon={<RotateCcw size={16} aria-hidden="true"/>} onClick={() => { setBriefDraft(job.brief as MaterialBrief); navigate('/studio'); }}>{t('teacher.job.again')}</Button></div></>;
  }
  if (job.status === 'rejected') return <>{header}<ErrorState title={t('teacher.job.rejected')} lead={t('teacher.job.rejectedLead')}/>
    <div className="mt-4"><Button variant="secondary" onClick={() => { setBriefDraft(job.brief as MaterialBrief); navigate('/studio'); }}>{t('teacher.job.again')}</Button></div></>;
  if (job.status === 'approved') return <>{header}<p className="text-sm text-gray-700">{t('teacher.job.approvedLead')}</p>{job.page_id && <Button onClick={() => navigate(`/studio/page/${job.page_id}`)}>{t('teacher.job.openPage')}</Button>}</>;

  const material = job.material!;
  const errors = job.verification?.checks.errors ?? 0, disagreements = job.verification?.solver?.disagreements.length ?? 0;
  // The library folder in the teacher's language: "Exam practice/IELTS Reading/B2".
  const group = MATERIAL_KIND_CATALOG[material.kind as MaterialKindId] ?? 'general';
  const folder = [t(`teacher.folder.${group}`), t(`teacher.kind.${material.kind}`), material.level.replace('band:', 'Band ')].map((part) => part.replace(/\//g, '-').trim()).join('/');
  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true); setActionError(null);
    try {
      const result = await decideMaterial(workspace.workspaceId, job.id, decision, decision === 'approve' ? folder : undefined);
      if (decision === 'approve' && result.page_id) navigate(`/studio/page/${result.page_id}`); else load();
    } catch (cause) { setActionError(cause); } finally { setBusy(false); setConfirm(false); }
  };
  return <>
    {header}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 overflow-hidden rounded-3xl border border-navy-line bg-white">
        <div role="tablist" aria-label={t('teacher.job.tabs')} className="flex flex-wrap gap-2 border-b border-navy-line/20 bg-cream-soft px-4 py-3">
          {([['preview', Eye], ['edit', PenLine]] as const).map(([key, Icon]) => <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ${tab === key ? 'bg-navy text-white' : 'text-gray-800 hover:bg-white'}`}><Icon size={14} aria-hidden="true"/>{t(`teacher.job.tab.${key}`)}</button>)}
          <span className="flex-1"/>
          <Badge tone="neutral">{t('teacher.job.draft')}</Badge>
        </div>
        <div className="p-4 md:p-6">
          {tab === 'preview' ? <MaterialView material={material}/> : <MaterialEditor material={material} saving={busy} onSave={async (next) => {
            setBusy(true); setActionError(null);
            try { setJob(await editMaterial(workspace.workspaceId, job.id, next, job.updated_at)); setTab('preview'); } catch (cause) { setActionError(cause); } finally { setBusy(false); }
          }}/>}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        {job.verification && <ChecksPanel checks={job.verification.checks} solver={job.verification.solver} stale={job.verification.stale} clean={job.verification.clean} busy={busy}
          rechecksLeft={job.progress.rechecks_left} onRecheck={async () => { setBusy(true); try { setJob(await recheckMaterial(workspace.workspaceId, job.id)); } catch (cause) { setActionError(cause); } finally { setBusy(false); } }}/>}
        {!job.verification && <p className="m-0 rounded-3xl border border-navy-line bg-white p-4 text-sm text-gray-700">{t('teacher.checks.noQuestions')}</p>}
        {job.focus && <p className="m-0 rounded-3xl border border-navy-line bg-white p-4 text-sm text-gray-700">{t('teacher.job.focus', { group: job.focus.classroom_name ?? '', tags: readableTags(job.focus.tags) })}</p>}
        <section className="rounded-3xl border border-navy-line bg-white p-4">
          <h2 className="m-0 font-display text-lg font-bold">{t('teacher.job.decideTitle')}</h2>
          <p className="m-0 mt-1 text-sm text-gray-700">{t('teacher.job.decideLead')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => (errors || disagreements ? setConfirm(true) : void decide('approve'))} disabled={busy} icon={<Check size={16} aria-hidden="true"/>}>{t('review.approve')}</Button>
            <Button variant="secondary" onClick={() => void decide('reject')} disabled={busy} icon={<X size={16} aria-hidden="true"/>}>{t('review.decline')}</Button>
          </div>
          <p className="m-0 mt-2 text-xs text-gray-600">{t('teacher.job.credits', { count: job.credits })}</p>
          {actionError !== null && <div className="mt-3"><ApiErrorState error={actionError}/></div>}
        </section>
      </aside>
    </div>
    <Dialog open={confirm} title={t('teacher.job.confirmTitle')} onClose={() => setConfirm(false)} closeLabel={t('teacher.common.close')}>
      <p className="m-0 text-sm text-gray-800">{t('teacher.job.confirmLead', { errors, disagreements })}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void decide('approve')} disabled={busy}>{t('teacher.job.approveAnyway')}</Button><Button variant="secondary" onClick={() => { setConfirm(false); setTab('edit'); }}>{t('teacher.job.fixFirst')}</Button></div>
    </Dialog>
  </>;
}
