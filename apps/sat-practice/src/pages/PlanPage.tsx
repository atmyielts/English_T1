import { useEffect, useState } from 'react';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { plansRegenerate, plansTodayGet, type PlanItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const PlanPage = () => {
  const { accessToken } = useAccess();
  const [items, setItems] = useState<PlanItem[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setItems((await plansTodayGet(accessToken)).items);
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

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
            <p className="eyebrow">Plan</p>
            <h1>Daily SAT study plan</h1>
          </div>
          <button className="btn solid" type="button" onClick={() => void regenerate()} disabled={busy}>
            {busy ? 'Regenerating...' : 'Regenerate'}
          </button>
        </header>
        <section className="panel">
          <ul className="plan-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.task_type.replace(/_/g, ' ')}</strong>
                  <span>{item.estimated_minutes} min · {String(item.payload.domain ?? 'mixed').replace(/_/g, ' ')}</span>
                </div>
                <span className="chip neutral">{item.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};
