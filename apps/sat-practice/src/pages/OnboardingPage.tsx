import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { goalsGet, goalsPatch, type SatGoals } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [goals, setGoals] = useState<SatGoals | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    goalsGet(accessToken).then((res) => setGoals(res.goals)).catch(() => null);
  }, [accessToken]);

  const save = async () => {
    if (!accessToken || !goals) return;
    setSaving(true);
    try {
      await goalsPatch(accessToken, goals);
      navigate('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Setup</p>
            <h1>Your SAT goal</h1>
          </div>
        </header>
        <section className="panel form-panel">
          <label>
            Target score
            <input
              type="number"
              min={400}
              max={1600}
              step={10}
              value={goals?.target_score ?? 1400}
              onChange={(event) => setGoals((prev) => ({ ...(prev ?? { user_id: '', test_date: null, hours_per_week: 3, metadata: {}, updated_at: '' }), target_score: Number(event.target.value) }))}
            />
          </label>
          <label>
            Test date
            <input
              type="date"
              value={goals?.test_date ?? ''}
              onChange={(event) => setGoals((prev) => ({ ...(prev ?? { user_id: '', target_score: 1400, hours_per_week: 3, metadata: {}, updated_at: '' }), test_date: event.target.value || null }))}
            />
          </label>
          <label>
            Hours per week
            <input
              type="number"
              min={1}
              max={40}
              value={goals?.hours_per_week ?? 3}
              onChange={(event) => setGoals((prev) => ({ ...(prev ?? { user_id: '', target_score: 1400, test_date: null, metadata: {}, updated_at: '' }), hours_per_week: Number(event.target.value) }))}
            />
          </label>
          <button type="button" className="btn solid" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : 'Save goal'}
          </button>
        </section>
      </main>
    </div>
  );
};
