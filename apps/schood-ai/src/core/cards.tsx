// Portions adapted from CopilotKit/OpenDots (MIT License, Copyright (c) Atai Barkai):
// the review card (src/client/PageReviewCard.tsx) and the approve-and-run card
// (src/client/ConnectionActionCard.tsx). Same rules: nothing is saved or run until a
// person decides; the card shows the server's record of what will happen, not the
// model's description; a second click never runs twice; a running action is polled.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, FileText, PlayCircle, RotateCcw, X } from 'lucide-react';
import { api } from './api.ts';
import { useT } from './i18n/index.ts';
import { ApiErrorState, ErrorState, LoadingState } from './states.tsx';
import type { ActionView, GenerationView } from './types.ts';
import { Badge, Button, Thinking } from './ui.tsx';
import { useWorkspace } from './workspace.tsx';

export interface ReviewIssue { level: 'warning' | 'error'; text: string }
export type ReviewStatus = 'ready' | 'generating' | 'approved' | 'rejected' | 'failed';

/** Approve & save / Decline for a generated draft. The parent owns the status. */
export function ReviewCard({ title, status, issues = [], children, onApprove, onDecline }: {
  title: ReactNode; status: ReviewStatus; issues?: ReviewIssue[]; children: ReactNode;
  onApprove(): Promise<void>; onDecline(): Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const pending = useRef(false);
  const decide = async (approve: boolean) => {
    if (pending.current || status !== 'ready') return;
    pending.current = true; setBusy(true); setError(null);
    try { await (approve ? onApprove() : onDecline()); } catch (cause) { setError(cause); } finally { pending.current = false; setBusy(false); }
  };
  const label = { ready: 'review.ready', generating: 'review.generating', approved: 'review.approved', rejected: 'review.rejected', failed: 'review.failed' }[status];
  return <section aria-label={t(label)} className="overflow-hidden rounded-3xl border border-navy-line bg-white">
    <header className="flex flex-wrap items-center gap-2 border-b border-navy-line/20 bg-cream-soft px-4 py-3 md:px-5">
      <FileText size={17} aria-hidden="true"/>
      <strong className="text-sm">{t(label)}</strong>
      {status === 'approved' && <Badge tone="lime"><Check size={12} aria-hidden="true"/>{t('review.approved')}</Badge>}
    </header>
    <div className="px-4 py-4 md:px-5">
      <h3 className="m-0 mb-3 font-display text-lg font-bold">{title}</h3>
      {status === 'generating' ? <Thinking label={t('review.generating')}/> : children}
      {issues.length > 0 && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3">
        <p className="m-0 mb-2 inline-flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} aria-hidden="true"/>{t('review.issues')}</p>
        <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-amber-950">{issues.map((issue, index) => <li key={index}><strong>{t(issue.level === 'error' ? 'review.issue.error' : 'review.issue.warning')}:</strong> {issue.text}</li>)}</ul>
      </div>}
    </div>
    {error !== null && <div className="px-4 pb-4 md:px-5"><ApiErrorState error={error}/></div>}
    <footer className="flex flex-wrap items-center gap-2 border-t border-navy-line/20 px-4 py-3 md:px-5">
      {status === 'ready' && <>
        <Button onClick={() => void decide(true)} disabled={busy} icon={<Check size={16} aria-hidden="true"/>}>{busy ? t('review.saving') : t('review.approve')}</Button>
        <Button variant="secondary" onClick={() => void decide(false)} disabled={busy} icon={<X size={16} aria-hidden="true"/>}>{t('review.decline')}</Button>
      </>}
      {status !== 'approved' && <small className="text-xs text-gray-600">{t('review.nothingSaved')}</small>}
    </footer>
  </section>;
}

/** Polls a generation job while it is being prepared. */
export function useGeneration(id: string | null) {
  const workspace = useWorkspace();
  const [generation, setGeneration] = useState<GenerationView | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!id) return;
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const result = await api<{ generation: GenerationView }>('core/generations', { workspaceId: workspace.workspaceId, query: { id } });
        if (!live) return;
        setGeneration(result.generation); setError(null);
        if (['requested', 'generating'].includes(result.generation.status)) timer = setTimeout(load, 2000);
      } catch (cause) { if (live) setError(cause); }
    };
    void load();
    return () => { live = false; clearTimeout(timer); };
  }, [id, workspace.workspaceId]);
  const decide = async (decision: 'approve' | 'reject') => {
    if (!id) return;
    const result = await api<{ generation: GenerationView }>('core/generations', { workspaceId: workspace.workspaceId, body: { id, decision } });
    setGeneration(result.generation);
  };
  return { generation, error, decide };
}

/** A generation job as a review card; `render` draws its output. */
export function GenerationReviewCard({ id, title, render, issues }: { id: string; title: ReactNode; render(output: unknown): ReactNode; issues?(generation: GenerationView): ReviewIssue[] }) {
  const { generation, error, decide } = useGeneration(id);
  if (error) return <ApiErrorState error={error}/>;
  if (!generation) return <LoadingState/>;
  const status: ReviewStatus = generation.status === 'requested' ? 'generating' : generation.status;
  return <ReviewCard title={title} status={status} issues={issues?.(generation) ?? []} onApprove={() => decide('approve')} onDecline={() => decide('reject')}>
    {generation.status === 'failed' ? <ErrorState lead={generation.error_code ?? undefined}/> : render(generation.output)}
  </ReviewCard>;
}

/** Approve & run for a queued action, showing exactly what will run. */
export function ApproveRunCard({ action: initial, onChange }: { action: ActionView; onChange?(action: ActionView): void }) {
  const t = useT(), workspace = useWorkspace();
  const [action, setAction] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const pending = useRef(false);
  useEffect(() => setAction(initial), [initial]);
  // A running action is checked until the server finishes it.
  useEffect(() => {
    if (action.status !== 'running') return;
    const timer = setInterval(() => {
      void api<{ action: ActionView }>('core/actions', { workspaceId: workspace.workspaceId, query: { id: action.id } }).then((result) => { setAction(result.action); onChange?.(result.action); }).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [action.status, action.id, workspace.workspaceId, onChange]);
  const decide = async (decision: 'approve' | 'decline' | 'retry') => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await api<{ action: ActionView }>('core/actions', { workspaceId: workspace.workspaceId, body: { id: action.id, decision } });
      setAction(result.action); onChange?.(result.action);
    } catch (cause) { setError(cause); } finally { pending.current = false; setBusy(false); }
  };
  const tone = action.status === 'done' ? 'lime' : action.status === 'failed' || action.status === 'interrupted' ? 'warn' : action.status === 'pending' ? 'sky' : 'neutral';
  const entries = Object.entries(action.display);
  return <section aria-label={action.summary} className="overflow-hidden rounded-3xl border border-navy-line bg-white">
    <header className="flex flex-wrap items-center gap-2 border-b border-navy-line/20 bg-cream-soft px-4 py-3 md:px-5">
      <PlayCircle size={17} aria-hidden="true"/>
      <strong className="min-w-0 flex-1 text-sm">{action.summary}</strong>
      <Badge tone={tone}>{t(`approvals.status.${action.status}`)}</Badge>
    </header>
    <div className="px-4 py-4 md:px-5">
      {entries.length > 0 && <dl className="m-0 grid gap-2">
        {entries.map(([key, value]) => <div key={key} className="grid gap-1 rounded-2xl bg-cream-soft px-3 py-2 sm:grid-cols-[10rem_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-600">{key.replace(/_/g, ' ')}</dt>
          <dd className="m-0 whitespace-pre-wrap break-words text-sm text-gray-900">{value}</dd>
        </div>)}
      </dl>}
      {action.status === 'interrupted' && <p className="mb-0 mt-3 text-sm text-amber-900">{t('approvals.interruptedLead')}</p>}
      {action.status === 'done' && action.result && <p className="mb-0 mt-3 text-sm text-gray-700"><strong>{t('approvals.result')}:</strong> {Object.entries(action.result).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ')}</p>}
      {action.status === 'running' && <div className="mt-3"><Thinking label={t('approvals.working')}/></div>}
    </div>
    {error !== null && <div className="px-4 pb-4 md:px-5"><ApiErrorState error={error}/></div>}
    <footer className="flex flex-wrap items-center gap-2 border-t border-navy-line/20 px-4 py-3 md:px-5">
      {action.can_approve && action.status === 'pending' && <>
        <Button onClick={() => void decide('approve')} disabled={busy} icon={<Check size={16} aria-hidden="true"/>}>{busy ? t('approvals.working') : t('approvals.approve')}</Button>
        <Button variant="secondary" onClick={() => void decide('decline')} disabled={busy} icon={<X size={16} aria-hidden="true"/>}>{t('approvals.decline')}</Button>
      </>}
      {action.can_approve && (action.status === 'failed' || action.status === 'interrupted') && action.retry_safe &&
        <Button variant="secondary" onClick={() => void decide('retry')} disabled={busy} icon={<RotateCcw size={16} aria-hidden="true"/>}>{t('approvals.retry')}</Button>}
      {action.status === 'pending' && <small className="text-xs text-gray-600">{action.can_approve ? t('approvals.exact') : t('approvals.waitingOther')}</small>}
    </footer>
  </section>;
}
