import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
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
  const artifacts = attempt?.score_artifacts && typeof attempt.score_artifacts === 'object'
    ? attempt.score_artifacts as Record<string, unknown>
    : {};
  const mode = String(artifacts.mode ?? 'practice');
  const questionType = exercise?.question_type?.replace(/^question_/i, '').replace(/_/g, ' ') ?? 'practice';
  const nextStep = attempt?.accuracy_ratio == null
    ? 'Regenerate your plan so the next task comes from transformed simulator coverage.'
    : attempt.accuracy_ratio >= 0.8
      ? 'Move to a mastery check or timed mini-session for this question type.'
      : attempt.accuracy_ratio >= 0.55
        ? 'Use a guided set to repair the pattern before timing yourself.'
        : 'Start with a repair drill and review the evidence or prompt language carefully.';

  return (
    <div className="practice-root">
      <PracticeTopNav
        compact
        title="Attempt Result"
        subtitle={`${exercise?.section_type ?? '-'} / ${exercise?.question_type ?? '-'}`}
        actions={[
          { id: 'plan', label: 'Back to plan', to: '/plan' },
          { id: 'playbook', label: 'Open playbook', href: `${PLAYBOOK_URL}/diagnostic?source=practice&weak_skill=${encodeURIComponent(String(exercise?.section_type ?? 'writing'))}` },
          ...(exercise ? [{ id: 'retry', label: 'Retry', to: `/exercise/${exercise.id}`, variant: 'solid' as const }] : []),
        ]}
      />

      <main className="dashboard-grid">
        <section className="glass stat-card">
          <h3>Band estimate</h3>
          <div className="band-row"><strong>{attempt?.estimated_band != null ? attempt.estimated_band.toFixed(1) : '-'}</strong></div>
          <p>Accuracy: {accuracy}</p>
          <p>Raw score: {attempt?.raw_score ?? '-'} / {attempt?.max_score ?? '-'}</p>
        </section>

        <section className="glass stat-card wide">
          <h3>Mistake pattern</h3>
          {loading ? <p>Loading result...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {!loading && !error ? (
            <div className="result-insight">
              <h4>{exercise?.section_type ?? 'Practice'} / {questionType}</h4>
              <p>
                {mode === 'ai'
                  ? 'Your writing response was scored with AI feedback. Use the rewrite task type next so the same criterion improves without repeating the whole prompt.'
                  : `This legacy item estimated performance from your submitted answer accuracy. ${nextStep}`}
              </p>
              <div className="inline-actions">
                <Link to="/plan" className="btn solid">Open transformed plan</Link>
                <a href={`${PLAYBOOK_URL}/diagnostic?source=practice&weak_skill=${encodeURIComponent(String(exercise?.section_type ?? 'writing'))}`} className="btn ghost">Open playbook</a>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

