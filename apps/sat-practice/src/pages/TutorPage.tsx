import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { TutorPanel } from '../components/TutorPanel';
import { QuestionCard } from '../components/QuestionCard';
import { attemptGet, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { savedFeedback, type SavedFeedback } from '../lib/saved-feedback';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function TutorPage() {
  const { questionId } = useParams<{ questionId: string }>(), [params] = useSearchParams();
  const attemptId = params.get('attempt') ?? '', { accessToken, userId, status } = useAccess();
  return <div className="app-shell"><PracticeTopNav /><main className="workspace narrow"><header className="page-header"><div><p className="eyebrow">Tutor</p><h1>Review your SAT question</h1></div></header>
    {status === 'loading' ? <p role="status">Loading your account…</p> : !accessToken || !userId ? <p role="status">Sign in to review your completed drill.</p> : questionId && uuid.test(questionId) && uuid.test(attemptId)
      ? <TutorWorkspace key={`${userId}:${attemptId}:${questionId}`} accessToken={accessToken} userId={userId} attemptId={attemptId} questionId={questionId} />
      : <div className="alert"><p>Open the tutor from a completed drill to use its original question and saved answer.</p><Link className="btn ghost" to="/today">Open your practice</Link></div>}
  </main></div>;
}
function TutorWorkspace(props: { accessToken: string; userId: string; attemptId: string; questionId: string }) {
  const [snapshot, setSnapshot] = useState<{ question: SatQuestion; answer: unknown; feedback: SavedFeedback | null } | null>(null), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false; setError(null); setSnapshot(null);
    void attemptGet(props.accessToken, props.attemptId).then(value => {
      if (cancelled) return;
      const question = value.questions.find(row => row.id === props.questionId);
      if (value.attempt.status !== 'scored') throw new Error('Submit this drill before reviewing its explanations.');
      if (value.legacy_result !== false || !question) throw new Error('The original question is unavailable for this result. Your saved score is preserved.');
      setSnapshot({ question, answer: value.attempt.answers[props.questionId], feedback: savedFeedback(value.attempt, question, true) });
    }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'The saved question could not be loaded.'); });
    return () => { cancelled = true; };
  }, [props.accessToken, props.attemptId, props.questionId, retry]);
  return <><Link className="btn ghost compact" to={`/results/${props.attemptId}`}>Back to saved results</Link>
    {error ? <div className="alert error" role="alert"><p>{error}</p><button type="button" className="btn ghost" onClick={() => setRetry(value => value + 1)}>Retry saved question</button></div> : snapshot ? <><QuestionCard question={snapshot.question} value={snapshot.answer} readOnly answerCorrect={snapshot.feedback?.correct ?? null} />
      <section className="panel"><h2>Saved solution</h2>{snapshot.feedback ? <><p>Your answer was {snapshot.feedback.correct ? 'correct' : 'incorrect'}.</p>{snapshot.feedback.expected ? <p><strong>Correct answer:</strong> {snapshot.feedback.expected}</p> : null}{snapshot.feedback.explanation ? <p>{snapshot.feedback.explanation}</p> : null}</> : <p>Your saved answer remains available; its original outcome could not be confirmed.</p>}</section>
      <TutorPanel {...props} /></> : <p role="status">Loading the original question…</p>}
  </>;
}
