import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { QuestionCard } from '../components/QuestionCard';
import { attemptGet, attemptSubmit, type Attempt, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const LabPage = () => {
  const navigate = useNavigate();
  const { attemptId } = useParams<{ attemptId: string }>();
  const { accessToken } = useAccess();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const isDone = attempt?.status === 'scored';

  useEffect(() => {
    if (!accessToken || !attemptId) return;
    attemptGet(accessToken, attemptId)
      .then((res) => {
        setAttempt(res.attempt);
        setQuestions(res.questions);
        setAnswers(res.attempt.answers);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Attempt failed to load'));
  }, [accessToken, attemptId]);

  const answered = useMemo(() => questions.filter((q) => answers[q.id] != null).length, [answers, questions]);

  const submit = async () => {
    if (!accessToken || !attemptId) return;
    try {
      const res = await attemptSubmit(accessToken, { attempt_id: attemptId, answers });
      setAttempt(res.attempt);
      setQuestions(res.questions);
      navigate(`/results/${res.attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Practice Lab</p>
            <h1>{isDone ? 'Scored drill' : 'Focused drill'}</h1>
            <p>{answered}/{questions.length} answered</p>
          </div>
          <Link className="btn ghost" to="/bank">Back to bank</Link>
        </header>
        {error ? <div className="alert error">{error}</div> : null}
        <section className="question-stack">
          {questions.map((question, index) => (
            <div key={question.id} className="question-shell">
              <div className="question-number">Question {index + 1}</div>
              <QuestionCard
                question={question}
                value={answers[question.id]}
                readOnly={isDone}
                onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
              />
            </div>
          ))}
        </section>
        {!isDone ? (
          <div className="sticky-actions">
            <button type="button" className="btn solid" onClick={() => void submit()} disabled={questions.length === 0}>
              Submit drill
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
};
