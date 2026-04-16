import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { practiceAttemptGet, type PracticeAttempt, type PracticeExercise } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

export const ResultsPage = () => {
  const { attempt_id } = useParams();
  const { accessToken } = useAccess();
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [exercise, setExercise] = useState<PracticeExercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!accessToken || !attempt_id) return;
      setLoading(true);
      setError(null);
      try {
        const response = await practiceAttemptGet(accessToken, attempt_id);
        setAttempt(response.attempt);
        setExercise(response.exercise);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load attempt result');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [accessToken, attempt_id]);

  const accuracy = attempt?.accuracy_ratio != null ? `${(attempt.accuracy_ratio * 100).toFixed(1)}%` : '-';

  return (
    <div className="practice-root">
      <header className="top-nav glass compact">
        <Link className="brand" to="/dashboard">
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>Attempt Result</strong>
            <span>{exercise?.section_type ?? '-'} / {exercise?.question_type ?? '-'}</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <Link to="/plan" className="btn ghost">Back to plan</Link>
          <a href={`${PLAYBOOK_URL}/diagnostic?source=practice&weak_skill=${encodeURIComponent(String(exercise?.section_type ?? 'writing'))}`} className="btn ghost">Open playbook</a>
          {exercise ? <Link to={`/exercise/${exercise.id}`} className="btn solid">Retry</Link> : null}
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass stat-card">
          <h3>Band estimate</h3>
          <div className="band-row"><strong>{attempt?.estimated_band != null ? attempt.estimated_band.toFixed(1) : '-'}</strong></div>
          <p>Accuracy: {accuracy}</p>
          <p>Raw score: {attempt?.raw_score ?? '-'} / {attempt?.max_score ?? '-'}</p>
        </section>

        <section className="glass stat-card wide">
          <h3>Scoring artifacts</h3>
          {loading ? <p>Loading result...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!loading && !error ? (
            <pre className="json-box">{JSON.stringify(attempt?.score_artifacts ?? {}, null, 2)}</pre>
          ) : null}
        </section>
      </main>
    </div>
  );
};

