import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { PracticeTopNav } from "../components/PracticeTopNav";
import { QuestionCard } from "../components/QuestionCard";
import { type Attempt, attemptGet, type SatQuestion } from "../lib/api";
import { useAccess } from "../lib/useAccess";
import { savedAnswerText, savedFeedback } from '../lib/saved-feedback';

export const SessionResultsPage = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { accessToken, userId } = useAccess();
  if (!accessToken || !userId || !attemptId) {
    return (
      <div className="app-shell">
        <PracticeTopNav />
        <main className="workspace narrow">
          <p role="status">Sign in to load your results.</p>
        </main>
      </div>
    );
  }
  return (
    <ResultsWorkspace
      key={userId + ":" + attemptId}
      accessToken={accessToken}
      attemptId={attemptId}
    />
  );
};
const ResultsWorkspace = (
  { accessToken, attemptId }: { accessToken: string; attemptId: string },
) => {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [immutableResult, setImmutableResult] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const token = useRef(accessToken);
  token.current = accessToken;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAttempt(null);
    setQuestions([]);
    setImmutableResult(false);
    attemptGet(token.current, attemptId).then((res) => {
      if (!cancelled) {
        setAttempt(res.attempt);
        setQuestions(res.questions);
        setImmutableResult(res.legacy_result === false);
      }
    })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Results could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, reload]);
  const scored = attempt?.status === "scored";
  const total = attempt?.question_ids?.length ?? questions.length;
  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Results</p>
            <h1>
              {scored
                ? (attempt.score_raw ?? 0) + "/" + total + " correct"
                : "Drill results"}
            </h1>
            {scored && attempt.score_accuracy != null
              ? <p>{Math.round(attempt.score_accuracy * 100)}% accuracy</p>
              : null}
          </div>
          <Link className="btn solid" to="/notebook">Open notebook</Link>
        </header>
        {loading
          ? <p role="status">Loading saved results…</p>
          : error
          ? (
            <div className="alert error" role="alert">
              {error}
              <button
                type="button"
                className="btn ghost"
                onClick={() => setReload((v) => v + 1)}
              >
                Retry loading results
              </button>
            </div>
          )
          : !scored
          ? (
            <div className="alert" role="status">
              This drill has no confirmed score yet.{" "}
              <Link to={"/lab/" + attemptId}>Return to your drill</Link>{" "}
              to submit or retry.
            </div>
          )
          : null}
        {scored && !immutableResult ? <div className="alert" role="status">Your saved score is preserved. The original question snapshot could not be confirmed, so original answer explanations are unavailable for this result.</div> : null}
        {scored && !immutableResult ? <section className="panel" aria-label="Saved answers">
          <h2>Saved answers</h2>
          <ol>{attempt.question_ids.map(id => <li key={id}>{savedAnswerText(attempt.answers[id])}</li>)}</ol>
        </section> : null}
        {scored && immutableResult
          ? (
            <section className="question-stack">
              {questions.map((question, index) => {
                const feedback = savedFeedback(attempt, question, immutableResult);
                return (
                <div key={question.id} className="question-shell">
                  <div className="question-number">Question {index + 1}</div>
                  <QuestionCard
                    question={question}
                    value={attempt.answers[question.id]}
                    readOnly
                    answerCorrect={feedback?.correct ?? null}
                  />
                  {feedback ? <div className="panel">
                    <strong>{feedback.correct ? 'Correct' : 'Incorrect'}</strong>
                    {feedback.expected ? <p><strong>Correct answer:</strong> {feedback.expected}</p> : <p>The original expected answer is unavailable.</p>}
                    {feedback.explanation ? <p>{feedback.explanation}</p> : <p>An explanation was not saved for this question.</p>}
                  </div> : null}
                  <Link
                    className="btn ghost compact"
                    to={"/tutor/" + question.id + "?attempt=" + encodeURIComponent(attempt.id)}
                  >
                    Open tutor
                  </Link>
                </div>
              );})}
            </section>
          )
          : null}
      </main>
    </div>
  );
};
