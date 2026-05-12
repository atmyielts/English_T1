import { useEffect, useState } from 'react';
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

  const load = async () => {
    if (!accessToken) return;
    setItems((await plansTodayGet(accessToken)).items);
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  const start = async (item: PlanItem) => {
    if (!accessToken) return;
    if (item.task_type === 'notebook_review') {
      navigate('/reviews');
      return;
    }
    const res = await attemptStart(accessToken, {
      section_type: item.payload.section_type as never,
      domain: item.payload.domain as never,
      difficulty: item.payload.difficulty as never,
      question_count: 8,
    });
    navigate(`/lab/${res.attempt.id}`);
  };

  const regenerate = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      setItems((await plansRegenerate(accessToken)).items);
    } finally {
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
        {items ? <DailyPlanCard items={items} busy={busy} onStart={start} onRegenerate={regenerate} /> : <PageLoading />}
      </main>
    </div>
  );
};
