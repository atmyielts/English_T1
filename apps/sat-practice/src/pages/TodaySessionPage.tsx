import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DailyPlanCard } from '../components/DailyPlanCard';
import { PageLoading } from '../components/Skeletons';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { attemptStart, plansRegenerate, plansTodayGet, type PlanItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const TodaySessionPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0);
  const sending = useRef(false), actor = useRef(accessToken);
  actor.current = accessToken;

  useEffect(() => {
    let active = true;setItems(null);setError(null);
    if (!accessToken) return () => { active = false; };
    plansTodayGet(accessToken).then(res => { if (active) setItems(res.items); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Today’s plan could not be loaded. Please retry.'); });
    return () => { active = false; };
  }, [accessToken, reload]);

  const start = async (item: PlanItem) => {
    if (!accessToken || sending.current) return;
    if (item.task_type === 'notebook_review') {
      navigate('/reviews');
      return;
    }
    sending.current = true;setBusy(true);setError(null);
    try {
      const res = await attemptStart(accessToken, {
        section_type: item.payload.section_type as never,
        domain: item.payload.domain as never,
        difficulty: item.payload.difficulty as never,
        question_count: 8,
      });
      if (actor.current === accessToken) navigate(`/lab/${res.attempt.id}`);
    } catch (err) {
      if (actor.current === accessToken) setError(err instanceof Error ? err.message : 'The drill start could not be confirmed. Retry this task.');
    } finally { sending.current = false;setBusy(false); }
  };

  const regenerate = async () => {
    if (!accessToken || sending.current) return;
    sending.current = true;setError(null);
    setBusy(true);
    try {
      const res = await plansRegenerate(accessToken);
      if (actor.current === accessToken) setItems(res.items);
    } catch (err) {
      if (actor.current === accessToken) setError(err instanceof Error ? err.message : 'The plan could not be updated. Please retry.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Today</p>
            <h1>Focused session</h1>
          </div>
        </header>
        {error ? <div role="alert" className="alert error">{error} <button type="button" className="btn" disabled={busy} onClick={() => setReload(value => value + 1)}>Retry loading plan</button></div> : null}
        {items ? <DailyPlanCard items={items} busy={busy} onStart={start} onRegenerate={regenerate} /> : !error ? <PageLoading /> : null}
      </main>
    </div>
  );
};
