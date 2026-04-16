import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { practiceGeneratePlan, practiceGoalsGet, practiceGoalsPatch, practiceTodayPlan, type PracticePlanItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

export const PlanPage = () => {
  const { accessToken } = useAccess();
  const [targetBand, setTargetBand] = useState('6.5');
  const [readingBand, setReadingBand] = useState('6.5');
  const [listeningBand, setListeningBand] = useState('6.5');
  const [writingBand, setWritingBand] = useState('6.5');
  const [planItems, setPlanItems] = useState<PracticePlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [goalsRes, planRes] = await Promise.all([practiceGoalsGet(accessToken), practiceTodayPlan(accessToken)]);
      const goals = goalsRes.goals;
      setTargetBand(String(goals.target_overall_band ?? 6.5));
      setReadingBand(String((goals.target_section_bands as any)?.reading ?? goals.target_overall_band ?? 6.5));
      setListeningBand(String((goals.target_section_bands as any)?.listening ?? goals.target_overall_band ?? 6.5));
      setWritingBand(String((goals.target_section_bands as any)?.writing ?? goals.target_overall_band ?? 6.5));
      setPlanItems(planRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan page');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const saveGoals = async (): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await practiceGoalsPatch(accessToken, {
        target_overall_band: Number(targetBand),
        target_section_bands: {
          reading: Number(readingBand),
          listening: Number(listeningBand),
          writing: Number(writingBand),
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save goals');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (): Promise<void> => {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="practice-root">
      <header className="top-nav glass compact">
        <Link className="brand" to="/dashboard">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>Daily Plan Builder</strong>
            <span>Configure goals and generate today’s plan</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <Link to="/dashboard" className="btn ghost">Back</Link>
          <a href={`${PLAYBOOK_URL}/study-plans?source=practice`} className="btn ghost">Playbook</a>
          <button className="btn solid" type="button" onClick={() => void regenerate()} disabled={saving}>Regenerate</button>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass stat-card">
          <h3>Goal bands</h3>
          <label>Overall target band<input value={targetBand} onChange={(event) => setTargetBand(event.target.value)} /></label>
          <label>Reading target<input value={readingBand} onChange={(event) => setReadingBand(event.target.value)} /></label>
          <label>Listening target<input value={listeningBand} onChange={(event) => setListeningBand(event.target.value)} /></label>
          <label>Writing target<input value={writingBand} onChange={(event) => setWritingBand(event.target.value)} /></label>
          <button className="btn ghost" type="button" onClick={() => void saveGoals()} disabled={saving}>Save goals</button>
        </section>

        <section className="glass stat-card wide">
          <h3>Today’s generated plan</h3>
          {loading ? <p>Loading...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!loading && planItems.length === 0 ? <p>No plan items generated for today yet.</p> : null}
          <ul className="task-list">
            {planItems.map((item) => (
              <li className="task-item" key={item.id}>
                <div>
                  <span className={`chip ${item.section_type}`}>{item.section_type}</span>
                  <h4>{item.exercise?.title ?? 'Exercise'}</h4>
                  <p>{item.rationale ?? 'Adaptive selection'}</p>
                </div>
                <Link to={`/exercise/${item.exercise_id}?planItem=${encodeURIComponent(item.id)}`} className="btn ghost">Open</Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};

