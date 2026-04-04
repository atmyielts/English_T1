import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { practiceAttemptStart, practiceAttemptSubmit, type PracticeAttempt, type PracticeExercise } from '../lib/api';
import { useAccess } from '../lib/useAccess';

const extractOptions = (exercise: PracticeExercise | null): Array<{ id: string; label: string }> => {
  const source = (exercise?.payload_json as any)?.source_unit_data;
  if (!source || !Array.isArray(source.options)) return [];
  return source.options
    .map((entry: any) => ({
      id: String(entry.id ?? entry.option_id ?? entry.value ?? ''),
      label: String(entry.label ?? entry.text ?? entry.value ?? entry.id ?? ''),
    }))
    .filter((entry: { id: string; label: string }) => entry.id.length > 0);
};

export const ExercisePage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { accessToken } = useAccess();

  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [exercise, setExercise] = useState<PracticeExercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [textAnswer, setTextAnswer] = useState('');
  const [choiceAnswer, setChoiceAnswer] = useState('');
  const [writingSessionId, setWritingSessionId] = useState('');

  useEffect(() => {
    const start = async (): Promise<void> => {
      if (!accessToken || !id) return;
      setLoading(true);
      setError(null);
      try {
        const response = await practiceAttemptStart(accessToken, {
          exercise_id: id,
          plan_item_id: params.get('planItem') ?? undefined,
        });
        setAttempt(response.attempt);
        setExercise(response.exercise);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start attempt');
      } finally {
        setLoading(false);
      }
    };

    void start();
  }, [accessToken, id, params]);

  const options = useMemo(() => extractOptions(exercise), [exercise]);

  const submit = async (): Promise<void> => {
    if (!accessToken || !attempt || !exercise) return;
    setSaving(true);
    setError(null);
    try {
      let answers: unknown;
      if (exercise.section_type === 'writing') {
        answers = {
          text: textAnswer,
          session_id: writingSessionId.trim() || undefined,
        };
      } else if (options.length > 0) {
        answers = {
          selected_option: choiceAnswer,
        };
      } else {
        answers = {
          answer: textAnswer,
          text: textAnswer,
        };
      }

      const response = await practiceAttemptSubmit(accessToken, {
        attempt_id: attempt.id,
        answers,
      });
      navigate(`/results/${encodeURIComponent(response.attempt.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit attempt');
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
            <strong>Practice Exercise</strong>
            <span>{exercise?.section_type ?? 'Section'} / {exercise?.question_type ?? 'Question type'}</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <Link to="/plan" className="btn ghost">Back to plan</Link>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="glass stat-card wide">
          <h3>{exercise?.title ?? 'Exercise'}</h3>
          {loading ? <p>Preparing exercise...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          {!loading && exercise ? (
            <>
              {exercise.section_type === 'writing' ? (
                <div className="field-stack">
                  <label>
                    Writing response
                    <textarea
                      rows={12}
                      value={textAnswer}
                      onChange={(event) => setTextAnswer(event.target.value)}
                      placeholder="Write your response here..."
                    />
                  </label>
                  <label>
                    Optional linked IELTS session id (for AI grading via grade-writing-v2)
                    <input
                      value={writingSessionId}
                      onChange={(event) => setWritingSessionId(event.target.value)}
                      placeholder="session uuid"
                    />
                  </label>
                </div>
              ) : options.length > 0 ? (
                <div className="field-stack">
                  <p>Select one option:</p>
                  {options.map((option) => (
                    <label key={option.id} className="option-row">
                      <input
                        type="radio"
                        name="choice"
                        value={option.id}
                        checked={choiceAnswer === option.id}
                        onChange={(event) => setChoiceAnswer(event.target.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <label className="field-stack">
                  Answer
                  <textarea
                    rows={10}
                    value={textAnswer}
                    onChange={(event) => setTextAnswer(event.target.value)}
                    placeholder="Enter your answer"
                  />
                </label>
              )}

              <div className="hero-actions">
                <button className="btn solid" type="button" disabled={saving} onClick={() => void submit()}>
                  Submit attempt
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
};

