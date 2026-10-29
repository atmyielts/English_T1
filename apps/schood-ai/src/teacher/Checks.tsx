import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import type { KeyCheckReport, KeyIssue, SolverComparison } from '../../../../packages/ai-core/src/materials/mod.ts';
import { Badge, Button, useT } from '../core/index.ts';

// T2 on the review card: the deterministic key checks and what the second model
// call (solving without the key) disagreed with. Every message is translated from
// its code; nothing here comes from a model.

export function issueText(t: (key: string, params?: Record<string, string | number>) => string, issue: KeyIssue): string {
  const where = issue.number ? t('teacher.checks.question', { number: issue.number }) : '';
  const version = issue.version === 'core' ? '' : ` (${t(`teacher.variant.${issue.version}`)})`;
  return `${where ? `${where}${version}: ` : version ? `${version.trim()}: ` : ''}${t(`teacher.checks.code.${issue.code}`, issue.params ?? {})}`;
}

export function ChecksPanel({ checks, solver, stale = [], clean, onRecheck, rechecksLeft, busy }: {
  checks: KeyCheckReport; solver: (SolverComparison & { status: string }) | null; stale?: string[]; clean: boolean;
  onRecheck?: () => void; rechecksLeft?: number; busy?: boolean;
}) {
  const t = useT();
  const errors = checks.issues.filter((issue) => issue.level === 'error'), warnings = checks.issues.filter((issue) => issue.level === 'warning');
  return <section aria-labelledby="checks-title" className="rounded-3xl border border-navy-line bg-white p-4 md:p-5">
    <div className="flex flex-wrap items-center gap-2">
      <ShieldCheck size={18} aria-hidden="true"/>
      <h2 id="checks-title" className="m-0 font-display text-lg font-bold">{t('teacher.checks.title')}</h2>
      {clean ? <Badge tone="lime"><CheckCircle2 size={12} aria-hidden="true"/>{t('teacher.checks.clean')}</Badge> : <Badge tone="warn">{t('teacher.checks.review', { count: errors.length + (solver?.disagreements.length ?? 0) })}</Badge>}
    </div>
    <p className="m-0 mt-1 text-sm text-gray-700">{t('teacher.checks.lead', { questions: checks.questions, auto: checks.autoMarkable })}</p>

    <h3 className="m-0 mt-4 text-sm font-semibold">{t('teacher.checks.deterministic')}</h3>
    {checks.issues.length === 0 ? <p className="m-0 mt-1 inline-flex items-center gap-2 text-sm text-gray-800"><CheckCircle2 size={16} className="text-emerald-700" aria-hidden="true"/>{t('teacher.checks.none')}</p>
      : <ul className="m-0 mt-1 space-y-1 pl-0">
        {[...errors, ...warnings].map((issue, index) => <li key={index} className="flex list-none items-start gap-2 text-sm">
          {issue.level === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0 text-red-700" aria-label={t('review.issue.error')}/> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-label={t('review.issue.warning')}/>}
          <span>{issueText(t, issue)}</span>
        </li>)}
      </ul>}

    <h3 className="m-0 mt-4 text-sm font-semibold">{t('teacher.checks.solver')}</h3>
    {!solver ? <p className="m-0 mt-1 text-sm text-gray-700">{t('teacher.checks.solverNone')}</p> : <>
      <p className="m-0 mt-1 text-sm text-gray-700">{t('teacher.checks.solverLead', { agreed: solver.agreed, asked: solver.asked })}{solver.status === 'partial' ? ` ${t('teacher.checks.solverPartial')}` : ''}</p>
      {solver.disagreements.length > 0 && <ul className="m-0 mt-2 space-y-2 pl-0">{solver.disagreements.map((entry) => <li key={`${entry.version}-${entry.question}`} className="list-none rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <p className="m-0 font-semibold">{t('teacher.checks.question', { number: entry.number })}{entry.version !== 'core' ? ` (${t(`teacher.variant.${entry.version}`)})` : ''}</p>
        <p className="m-0">{t('teacher.checks.disagree', { key: entry.key.join(', '), solver: entry.solver.join(', ') })}</p>
        {entry.reason && <p className="m-0 mt-1 text-gray-700">{t('teacher.checks.reason')}: {entry.reason}</p>}
      </li>)}</ul>}
      {solver.unanswered.length > 0 && <p className="m-0 mt-2 text-sm text-gray-700">{t('teacher.checks.unanswered', { numbers: solver.unanswered.map((entry) => entry.number).join(', ') })}</p>}
    </>}
    {stale.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className="m-0 text-sm text-gray-700">{t('teacher.checks.stale', { count: stale.length })}</p>
      {onRecheck && <Button size="sm" variant="secondary" onClick={onRecheck} disabled={busy || !rechecksLeft}>{t('teacher.checks.recheck', { count: rechecksLeft ?? 0 })}</Button>}
    </div>}
    <p className="m-0 mt-4 text-xs text-gray-600">{t('teacher.checks.note')}</p>
  </section>;
}
