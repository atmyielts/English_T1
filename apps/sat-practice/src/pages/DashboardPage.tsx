import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DailyPlanCard } from '../components/DailyPlanCard';
import { MasteryRadarChart } from '../components/MasteryRadarChart';
import { MistakeNotebookList } from '../components/MistakeNotebookList';
import { PageLoading } from '../components/Skeletons';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { SatEcosystemPanel } from '../components/SatEcosystemPanel';
import { ScoreImpactCallout } from '../components/ScoreImpactCallout';
import { StreakBadge } from '../components/StreakBadge';
import { attemptStart, dashboardGet, notebookPatch, notebookRetry, plansRegenerate, type DashboardResponse, type NotebookItem, type PlanItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setDashboard(await dashboardGet(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dashboard failed to load');
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  const startPlanItem = async (item: PlanItem) => {
    if (!accessToken) return;
    if (item.task_type === 'notebook_review') {
      navigate('/reviews');
      return;
    }
    setBusy(true);
    try {
      const started = await attemptStart(accessToken, {
        section_type: item.payload.section_type as never,
        domain: item.payload.domain as never,
        difficulty: item.payload.difficulty as never,
        question_count: 8,
      });
      navigate(`/lab/${started.attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start plan item');
    } finally {
      setBusy(false);
    }
  };

  const retryNotebook = async (item: NotebookItem) => {
    if (!accessToken) return;
    const res = await notebookRetry(accessToken, item.id);
    navigate(`/lab/${res.attempt.id}`);
  };

  const tagNotebook = async (item: NotebookItem, reasonTag: string) => {
    if (!accessToken) return;
    await notebookPatch(accessToken, item.id, { reason_tag: reasonTag });
    await load();
  };

  const regenerate = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      await plansRegenerate(accessToken);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!dashboard) {
    return (
      <div className="app-shell">
        <PracticeTopNav />
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <PracticeTopNav streakDays={dashboard.activity.streak_days} xp={dashboard.activity.xp_total} />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>What should I do today to improve?</h1>
            <p>Target {dashboard.goals.target_score}, {dashboard.goals.hours_per_week} hours/week.</p>
          </div>
          <StreakBadge days={dashboard.activity.streak_days} />
        </header>
        {error ? <div className="alert error">{error}</div> : null}
        <section className="kpi-grid">
          <article className="kpi-card"><span>Mastery</span><strong>{dashboard.mastery_percent}%</strong></article>
          <article className="kpi-card"><span>Weekly minutes</span><strong>{dashboard.activity.weekly_minutes}/{dashboard.activity.weekly_goal_minutes}</strong></article>
          <article className="kpi-card"><span>XP this week</span><strong>{dashboard.activity.xp_week}</strong></article>
        </section>
        <ScoreImpactCallout {...dashboard.score_impact} />
        <section className="two-col">
          <DailyPlanCard items={dashboard.plan_items} busy={busy} onStart={startPlanItem} onRegenerate={regenerate} />
          <MasteryRadarChart mastery={dashboard.mastery} />
        </section>
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Mistakes</p>
              <h2>Notebook preview</h2>
            </div>
          </div>
          <MistakeNotebookList items={dashboard.notebook.slice(0, 5)} onRetry={retryNotebook} onTag={tagNotebook} />
        </section>
        <SatEcosystemPanel />
      </main>
    </div>
  );
};
