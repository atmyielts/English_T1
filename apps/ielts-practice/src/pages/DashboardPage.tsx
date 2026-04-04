import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  learningProfileV2,
  practiceDiagnosticsGet,
  practiceGeneratePlan,
  practiceGoalsGet,
  practiceTodayPlan,
  type PracticePlanItem,
} from '../lib/api';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import { useAccess } from '../lib/useAccess';

const sectionClass = (section: string): string => {
  if (section === 'reading') return 'chip reading';
  if (section === 'listening') return 'chip listening';
  return 'chip writing';
};

export const DashboardPage = () => {
  const { accessToken, me } = useAccess({ includeEffective: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetBand, setTargetBand] = useState<number | null>(null);
  const [averageBand, setAverageBand] = useState<number | null>(null);
  const [plan, setPlan] = useState<PracticePlanItem[]>([]);
  const [sharedSignals, setSharedSignals] = useState<number | null>(null);

  const displayName = useMemo(() => {
    const raw = String(me?.user.email ?? '').split('@')[0] ?? 'Learner';
    return raw.length > 0 ? raw : 'Learner';
  }, [me?.user.email]);

  const load = async (forceDiagnostics = false): Promise<void> => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [goalsRes, diagnosticsRes, planRes, profileRes] = await Promise.all([
        practiceGoalsGet(accessToken),
        practiceDiagnosticsGet(accessToken, { refresh: forceDiagnostics }),
        practiceTodayPlan(accessToken),
        learningProfileV2(accessToken, { productId: IELTS_PRACTICE_PRODUCT_ID, languageCode: 'en' }).catch(() => null),
      ]);

      setTargetBand(Number(goalsRes.goals.target_overall_band ?? null));

      const diagnostics = diagnosticsRes.diagnostics_snapshot?.diagnostics as Record<string, unknown> | undefined;
      const overall = diagnostics?.overall as Record<string, unknown> | undefined;
      setAverageBand(typeof overall?.average_band === 'number' ? overall.average_band : null);

      setPlan(planRes.items ?? []);

      const profileSignals = Number((profileRes as any)?.language_projection?.signals_count ?? NaN);
      setSharedSignals(Number.isFinite(profileSignals) ? profileSignals : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleGenerate = async (): Promise<void> => {
    if (!accessToken) return;
    try {
      setError(null);
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: true });
      await load(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Plan generation failed';
      setError(message);
    }
  };

  return (
    <div className="practice-root">
      <header className="top-nav glass compact">
        <Link className="brand" to="/">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>Schood IELTS Practice</strong>
            <span>Welcome, {displayName}</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <Link to="/plan" className="btn ghost">Daily plan</Link>
          <button className="btn solid" type="button" onClick={() => void handleGenerate()}>Regenerate plan</button>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass stat-card">
          <h3>Target band</h3>
          <div className="band-row">
            <strong>{targetBand != null ? targetBand.toFixed(1) : '-'}</strong>
            <span>Goal</span>
          </div>
          <div className="band-row secondary">
            <strong>{averageBand != null ? averageBand.toFixed(1) : '-'}</strong>
            <span>Current average</span>
          </div>
        </section>

        <section className="glass stat-card">
          <h3>Shared English profile</h3>
          <div className="band-row">
            <strong>{sharedSignals != null ? sharedSignals : '-'}</strong>
            <span>Signals aggregated</span>
          </div>
          <p className="muted">Practice attempt outcomes are emitting into language-scoped personalization.</p>
        </section>

        <section className="glass stat-card wide">
          <h3>Today’s adaptive tasks</h3>
          {loading ? <p>Loading dashboard...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!loading && !error && plan.length === 0 ? (
            <p>No plan generated for today yet. Click “Regenerate plan”.</p>
          ) : null}
          <ul className="task-list">
            {plan.map((item) => (
              <li key={item.id} className="task-item">
                <div>
                  <span className={sectionClass(item.section_type)}>{item.section_type}</span>
                  <h4>{item.exercise?.title ?? 'Exercise'}</h4>
                  <p>{item.rationale ?? 'Adaptive task selected from your weakness vectors.'}</p>
                </div>
                <Link to={`/exercise/${item.exercise_id}?planItem=${encodeURIComponent(item.id)}`} className="btn ghost">
                  {item.status === 'completed' ? 'View' : 'Start'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};

