import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DailyPlanCard } from '../components/DailyPlanCard';
import { DomainInsights, MasteryMap, ScoreImpactCallout } from '../components/Insights';
import { MistakeNotebookList } from '../components/MistakeNotebookList';
import { PageLoading } from '../components/Skeletons';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { SatEcosystemPanel } from '../components/SatEcosystemPanel';
import { StreakBadge } from '../components/StreakBadge';
import { dashboardGet, notebookPatch, notebookRetry, plansRegenerate, type DashboardResponse, type NotebookItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { usePlanStart } from '../lib/usePlanStart';
import { useAppT, useErrorText } from '../i18n';
import { useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';

export const DashboardPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const { date } = useI18n();
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setDashboard(await dashboardGet(accessToken));
    } catch (err) {
      setError(err);
    }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const plan = usePlanStart(accessToken, () => void load());

  const retryNotebook = async (item: NotebookItem) => {
    if (!accessToken) return;
    try { const res = await notebookRetry(accessToken, item.id); navigate(`/lab/${res.attempt.id}`); } catch (err) { setError(err); }
  };
  const tagNotebook = async (item: NotebookItem, reasonTag: string) => {
    if (!accessToken) return;
    try { await notebookPatch(accessToken, item.id, { reason_tag: reasonTag }); await load(); } catch (err) { setError(err); }
  };
  const regenerate = async () => {
    if (!accessToken) return;
    setBusy(true);
    try { await plansRegenerate(accessToken); await load(); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  if (!dashboard) {
    return (
      <div className="app-shell">
        <PracticeTopNav />
        {error ? <main className="workspace narrow"><div className="alert error" role="alert">{t('dashboard.loadError')} {errorText(error)}
          <button type="button" className="btn ghost" onClick={() => void load()}>{t('common.retry')}</button></div></main> : <PageLoading />}
      </div>
    );
  }
  const goals = dashboard.goals;
  const progress = dashboard.plan_week.progress;
  return (
    <div className="app-shell">
      <PracticeTopNav streakDays={dashboard.activity.streak_days} xp={dashboard.activity.xp_total} />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('dashboard.eyebrow')}</p>
            <h1>{t('dashboard.title')}</h1>
            <p>{goals.test_date
              ? t('dashboard.goalWithDate', { score: goals.target_score, hours: goals.hours_per_week, date: date(`${goals.test_date}T00:00:00Z`, { dateStyle: 'medium', timeZone: 'UTC' }) })
              : t('dashboard.goal', { score: goals.target_score, hours: goals.hours_per_week })} <Link to="/onboarding">{t('plan.changeGoal')}</Link></p>
          </div>
          <StreakBadge days={dashboard.activity.streak_days} />
        </header>
        {error ? <div className="alert error" role="alert">{errorText(error)}</div> : null}
        {plan.error ? <div className="alert error" role="alert">{errorText(plan.error)}</div> : null}
        {plan.notice ? <div className="alert" role="status">{t('plan.nothingDue')}</div> : null}
        {!dashboard.goals_set ? <section className="panel goal-callout">
          <div><h2>{t('dashboard.setGoal.title')}</h2><p>{t('dashboard.setGoal.body')}</p></div>
          <Link className="btn solid" to="/onboarding">{t('dashboard.setGoal.cta')}</Link>
        </section> : null}
        <section className="kpi-grid">
          <article className="kpi-card"><span>{t('dashboard.kpi.mastery')}</span><strong>{dashboard.mastery_percent == null ? t('dashboard.kpi.noData') : `${dashboard.mastery_percent}%`}</strong><small>{t('dashboard.kpi.masteryHint')}</small></article>
          <article className="kpi-card"><span>{t('dashboard.kpi.minutes')}</span><strong>{t('dashboard.kpi.minutesValue', { minutes: dashboard.activity.weekly_minutes, goal: dashboard.activity.weekly_goal_minutes })}</strong><small>{t('dashboard.kpi.minutesHint')}</small></article>
          <article className="kpi-card"><span>{t('dashboard.kpi.plan')}</span><strong>{t('dashboard.kpi.planValue', { done: progress.completed, total: progress.total })}</strong>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%` }} /></div></article>
        </section>
        <ScoreImpactCallout impact={dashboard.score_impact} />
        <section className="two-col">
          <DailyPlanCard items={dashboard.plan_items} busy={busy || plan.busy !== null} onStart={item => void plan.start(item)} onRegenerate={() => void regenerate()} />
          <section className="panel module-callout">
            <div><p className="eyebrow">{t('nav.modules')}</p><h2>{t('dashboard.module.title')}</h2><p>{t('dashboard.module.body')}</p></div>
            <Link className="btn solid" to="/modules">{t('dashboard.module.cta')}</Link>
          </section>
        </section>
        <DomainInsights domains={dashboard.insights.domains} />
        <MasteryMap mastery={dashboard.official_mastery} />
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('dashboard.notebook.eyebrow')}</p>
              <h2>{t('dashboard.notebook.title')}</h2>
            </div>
            <Link className="btn ghost compact" to="/notebook">{t('dashboard.notebook.all')}</Link>
          </div>
          {dashboard.notebook.length === 0 ? <div className="empty-state">{t('dashboard.notebook.empty')}</div> : null}
          <MistakeNotebookList items={dashboard.notebook.slice(0, 5)} onRetry={item => void retryNotebook(item)} onTag={(item, tag) => void tagNotebook(item, tag)} />
        </section>
        <SatEcosystemPanel />
      </main>
    </div>
  );
};
