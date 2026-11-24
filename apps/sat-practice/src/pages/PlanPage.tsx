import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlanItemRow } from '../components/DailyPlanCard';
import { PageLoading } from '../components/Skeletons';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { plansRegenerate, plansWeekGet, type PlanItem, type PlanWeek } from '../lib/api';
import { planTaskLabel } from '../lib/labels';
import { useAccess } from '../lib/useAccess';
import { usePlanStart } from '../lib/usePlanStart';
import { useAppT, useErrorText } from '../i18n';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { practiceSessionState } from '../../../../packages/exam-playbook-web/src/practiceCalendar';
import { PracticeSessionDisclosure, usePracticeSessionLabels } from '../../../../packages/exam-playbook-web/src/PracticeSessionDisclosure';

const utcDate = (iso: string) => `${iso}T00:00:00Z`;
const finished = (item: PlanItem) => item.status === 'completed' || item.status === 'skipped';
const started = (item: PlanItem) => item.status === 'completed' || item.status === 'in_progress';

export const PlanPage = () => {
  const t = useAppT();
  const labels = usePracticeSessionLabels();
  const errorText = useErrorText();
  const { date } = useI18n();
  const { accessToken } = useAccess();
  const [week, setWeek] = useState<PlanWeek | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [rebuilt, setRebuilt] = useState(false);
  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try { setWeek(await plansWeekGet(accessToken)); } catch (err) { setError(err); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const plan = usePlanStart(accessToken, () => void load());
  const regenerate = async () => {
    if (!accessToken) return;
    setBusy(true); setRebuilt(false); setError(null);
    try { setWeek((await plansRegenerate(accessToken)).week); setRebuilt(true); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const byDay = new Map<string, PlanItem[]>();
  for (const item of week?.items ?? []) {
    const items = byDay.get(item.scheduled_for);
    if (items) items.push(item);
    else byDay.set(item.scheduled_for, [item]);
  }
  const days = [...byDay].sort(([a], [b]) => a.localeCompare(b));
  const next = days.find(([, items]) => items.some(item => !finished(item)))?.[0];
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => date(utcDate(iso), { ...opts, timeZone: 'UTC' });
  const pct = week && week.progress.total ? Math.round((week.progress.completed / week.progress.total) * 100) : 0;
  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('plan.eyebrow')}</p>
            <h1>{t('plan.title')}</h1>
            {week?.goals ? <p>{t('plan.subtitle', { start: fmt(week.week_start, { dateStyle: 'medium' }), end: fmt(week.week_end, { dateStyle: 'medium' }), score: week.goals.target_score, hours: week.goals.hours_per_week })} <Link to="/onboarding">{t('plan.changeGoal')}</Link></p> : null}
          </div>
          <button className="btn solid" type="button" onClick={() => void regenerate()} disabled={busy || !week}>
            {busy ? t('plan.rebuilding') : t('plan.rebuild')}
          </button>
        </header>
        {error || plan.error ? <div className="alert error" role="alert">{errorText(error ?? plan.error)} <button type="button" className="btn" onClick={() => void load()}>{t('common.retry')}</button></div> : null}
        {rebuilt ? <div className="alert" role="status">{t('plan.rebuilt')}</div> : null}
        {plan.notice ? <div className="alert" role="status">{t('plan.nothingDue')}</div> : null}
        {week?.goals_set === false ? <div className="alert" role="status">{t('dashboard.setGoal.body')} <Link to="/onboarding">{t('dashboard.setGoal.cta')}</Link></div> : null}
        {!week && !error ? <PageLoading label={t('plan.loading')} /> : null}
        <details className="panel">
          <summary className="plan-guide-summary">{t('plan.eightWeeksTitle')}</summary>
          <p>{t('plan.eightWeeksPace')}</p>
          <ol>
            <li>{t('plan.eightWeeksStart')}</li>
            <li>{t('plan.eightWeeksDrill')}</li>
            <li>{t('plan.eightWeeksTime')}</li>
            <li>{t('plan.eightWeeksReview')}</li>
          </ol>
          <div className="row-actions">
            <Link className="btn ghost compact" to="/onboarding">{t('plan.changeGoal')}</Link>
            <Link className="btn ghost compact" to="/bank?status=unseen">{t('plan.eightWeeksUnseen')}</Link>
            <Link className="btn ghost compact" to="/modules">{t('plan.eightWeeksModules')}</Link>
          </div>
        </details>
        {week ? <section className="panel">
          <p>{t('plan.progress', { done: week.progress.completed, total: week.progress.total, minutes: week.progress.minutes_completed, planned: week.progress.minutes_planned })}</p>
          <div className="progress-track" role="progressbar" aria-label={t('plan.title')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          {next ? <p>{labels.hint}</p> : null}
        </section> : null}
        {week && days.length === 0 ? <div className="empty-state">{t('plan.empty')}</div> : null}
        {days.map(([day, items]) => {
          const allDone = items.every(i => i.status === 'completed');
          const state = practiceSessionState(items, finished, day === next, started);
          const title = fmt(day, { weekday: 'long', day: 'numeric', month: 'long' });
          const isToday = day === week?.today;
          return <section key={day} className={`panel plan-day${isToday ? ' today' : ''}`} aria-label={title}>
            <div className="section-head">
              <h2>{fmt(day, { weekday: 'long', day: 'numeric', month: 'short' })}{isToday ? <span className="chip neutral">{t('plan.today')}</span> : null}</h2>
              {allDone ? <span className="chip math">{t('plan.dayDone')}</span> : null}
              {state === 'next' || state === 'started' ? <span className="chip math">{labels[state]}</span> : null}
            </div>
            <PracticeSessionDisclosure state={state} title={title} buttonClassName="btn ghost compact"
              preview={<p>{[...new Set(items.map(item => planTaskLabel(t, item)))].join(' · ')}</p>}>
              <ul className="plan-list">{items.map(item => <PlanItemRow key={item.id} item={item} busy={busy || plan.busy !== null} onStart={i => void plan.start(i)} />)}</ul>
            </PracticeSessionDisclosure>
          </section>;
        })}
      </main>
    </div>
  );
};
