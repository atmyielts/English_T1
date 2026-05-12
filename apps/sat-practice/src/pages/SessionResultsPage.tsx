import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { QuestionCard } from '../components/QuestionCard';
import { attemptGet, type Attempt, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const SessionResultsPage = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { accessToken } = useAccess();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);

  useEffect(() => {
    if (!accessToken || !attemptId) return;
    attemptGet(accessToken, attemptId).then((res) => {
      setAttempt(res.attempt);
      setQuestions(res.questions);
    }).catch(() => null);
  }, [accessToken, attemptId]);

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Results</p>
            <h1>{attempt?.score_raw ?? 0}/{questions.length} correct</h1>
            <p>{attempt?.score_accuracy != null ? `${Math.round(attempt.score_accuracy * 100)}% accuracy` : 'Scored drill'}</p>
          </div>
          <Link className="btn solid" to="/notebook">Open notebook</Link>
        </header>
        <section className="question-stack">
          {questions.map((question, index) => (
            <div key={question.id} className="question-shell">
              <div className="question-number">Question {index + 1}</div>
              <QuestionCard question={question} value={attempt?.answers[question.id]} readOnly />
              <Link className="btn ghost compact" to={`/tutor/${question.id}`}>Open tutor</Link>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};
