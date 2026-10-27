import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { TutorPanel } from '../components/TutorPanel';
import { QuestionCard } from '../components/QuestionCard';
import { RichText } from '../components/RichText';
import { attemptGet, type SatQuestion } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { savedFeedback, type SavedFeedback } from '../lib/saved-feedback';
import { useAppT, useErrorText, type AppKey } from '../i18n';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class LocalError extends Error { constructor(readonly key: AppKey) { super(key); } }

export function TutorPage() {
  const t = useAppT();
  const { questionId } = useParams<{ questionId: string }>(), [params] = useSearchParams();
  const attemptId = params.get('attempt') ?? '', { accessToken, userId, status } = useAccess();
  return <div className="app-shell"><PracticeTopNav /><main className="workspace narrow"><header className="page-header"><div><p className="eyebrow">{t('tutor.eyebrow')}</p><h1>{t('tutor.title')}</h1></div></header>
    {status === 'loading' ? <p role="status">{t('tutor.loadingAccount')}</p> : !accessToken || !userId ? <p role="status">{t('tutor.signIn')}</p> : questionId && uuid.test(questionId) && uuid.test(attemptId)
      ? <TutorWorkspace key={`${userId}:${attemptId}:${questionId}`} accessToken={accessToken} userId={userId} attemptId={attemptId} questionId={questionId} />
      : <div className="alert"><p>{t('tutor.openFromResults')}</p><Link className="btn ghost" to="/today">{t('tutor.openPractice')}</Link></div>}
  </main></div>;
}

function TutorWorkspace(props: { accessToken: string; userId: string; attemptId: string; questionId: string }) {
  const t = useAppT();
  const errorText = useErrorText();
  const [snapshot, setSnapshot] = useState<{ question: SatQuestion; answer: unknown; feedback: SavedFeedback | null } | null>(null), [error, setError] = useState<unknown>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false; setError(null); setSnapshot(null);
    void attemptGet(props.accessToken, props.attemptId).then(value => {
      if (cancelled) return;
      const question = value.questions.find(row => row.id === props.questionId);
      if (value.attempt.status !== 'scored') throw new LocalError('tutor.submitFirst');
      if (value.legacy_result !== false || !question) throw new LocalError('tutor.originalUnavailable');
      setSnapshot({ question, answer: value.attempt.answers[props.questionId], feedback: savedFeedback(value.attempt, question, true) });
    }).catch(failure => { if (!cancelled) setError(failure); });
    return () => { cancelled = true; };
  }, [props.accessToken, props.attemptId, props.questionId, retry]);
  return <><Link className="btn ghost compact" to={`/results/${props.attemptId}`}>{t('tutor.back')}</Link>
    {error ? <div className="alert error" role="alert"><p>{error instanceof LocalError ? t(error.key) : errorText(error)}</p><button type="button" className="btn ghost" onClick={() => setRetry(value => value + 1)}>{t('tutor.retryQuestion')}</button></div> : snapshot ? <><QuestionCard question={snapshot.question} value={snapshot.answer} readOnly answerCorrect={snapshot.feedback?.correct ?? null} />
      <section className="panel"><h2>{t('tutor.savedSolution')}</h2>{snapshot.feedback ? <><p>{t(snapshot.feedback.correct ? 'tutor.wasCorrect' : 'tutor.wasIncorrect')}</p>{snapshot.feedback.expected ? <p><strong>{t('question.correctAnswer')}:</strong> <RichText text={snapshot.feedback.expected} /></p> : null}{snapshot.feedback.explanation ? <RichText as="div" className="explanation" text={snapshot.feedback.explanation} /> : null}</> : <p>{t('tutor.outcomeUnknown')}</p>}</section>
      <TutorPanel {...props} /></> : <p role="status">{t('tutor.loadingQuestion')}</p>}
  </>;
}
