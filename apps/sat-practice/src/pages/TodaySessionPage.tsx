import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DailyPlanCard } from '../components/DailyPlanCard';
import { PageLoading } from '../components/Skeletons';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { plansRegenerate, plansWeekGet, type PlanWeek } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { usePlanStart } from '../lib/usePlanStart';
import { useAppT, useErrorText } from '../i18n';

export const TodaySessionPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const { accessToken } = useAccess();
  const [week, setWeek] = useState<PlanWeek | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try { setWeek(await plansWeekGet(accessToken)); } catch (err) { setError(err); }
  }, [accessToken]);
  useEffect(() => { void load(); }, [load]);
  const plan = usePlanStart(accessToken, () => void load());
  const regenerate = async () => {
    if (!accessToken || busy) return;
    setBusy(true); setError(null);
    try { setWeek((await plansRegenerate(accessToken)).week); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('today.eyebrow')}</p>
            <h1>{t('today.title')}</h1>
          </div>
          <Link className="btn ghost" to="/plan">{t('nav.plan')}</Link>
        </header>
        {week && week.goals_set === false ? <div className="alert" role="status">{t('dashboard.setGoal.body')} <Link to="/onboarding">{t('dashboard.setGoal.cta')}</Link></div> : null}
        {error || plan.error ? <div role="alert" className="alert error">{errorText(error ?? plan.error)} <button type="button" className="btn" disabled={busy} onClick={() => void load()}>{t('common.retry')}</button></div> : null}
        {plan.notice ? <div className="alert" role="status">{t('plan.nothingDue')}</div> : null}
        {week ? <DailyPlanCard items={week.today_items} busy={busy || plan.busy !== null} onStart={item => void plan.start(item)} onRegenerate={() => void regenerate()} /> : !error ? <PageLoading label={t('plan.loading')} /> : null}
      </main>
    </div>
  );
};
