import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlanItemRow } from '../components/DailyPlanCard';
import { PageLoading } from '../components/Skeletons';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { plansRegenerate, plansWeekGet, type PlanWeek } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { usePlanStart } from '../lib/usePlanStart';
import { useAppT, useErrorText } from '../i18n';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';

const utcDate = (iso: string) => `${iso}T00:00:00Z`;

export const PlanPage = () => {
  const t = useAppT();
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
  const days = week ? [...new Set(week.items.map(i => i.scheduled_for))].sort() : [];
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
        {week ? <section className="panel">
          <p>{t('plan.progress', { done: week.progress.completed, total: week.progress.total, minutes: week.progress.minutes_completed, planned: week.progress.minutes_planned })}</p>
          <div className="progress-track" role="progressbar" aria-label={t('plan.title')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        </section> : null}
        {week && days.length === 0 ? <div className="empty-state">{t('plan.empty')}</div> : null}
        {days.map(day => {
          const items = week!.items.filter(i => i.scheduled_for === day);
          const allDone = items.every(i => i.status === 'completed');
          return <section key={day} className={`panel plan-day${day === week!.today ? ' today' : ''}`} aria-label={fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}>
            <div className="section-head">
              <h2>{fmt(day, { weekday: 'long', day: 'numeric', month: 'short' })}{day === week!.today ? <span className="chip neutral">{t('plan.today')}</span> : null}</h2>
              {allDone ? <span className="chip math">{t('plan.dayDone')}</span> : null}
            </div>
            <ul className="plan-list">{items.map(item => <PlanItemRow key={item.id} item={item} busy={busy || plan.busy !== null} onStart={i => void plan.start(i)} />)}</ul>
          </section>;
        })}
      </main>
    </div>
  );
};
