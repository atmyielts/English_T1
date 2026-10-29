import { Link, useParams } from "react-router-dom";
import { AskSchoodAI } from "../../../../packages/schood-ai-link/src/index.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { PracticeTopNav } from "../components/PracticeTopNav";
import { QuestionCard } from "../components/QuestionCard";
import { RichText } from "../components/RichText";
import { type Attempt, attemptGet, type SatQuestion, type Timing } from "../lib/api";
import { useAccess } from "../lib/useAccess";
import { savedAnswerText, savedFeedback } from '../lib/saved-feedback';
import { domainLabel, questionTaxonomy, skillLabel } from '../lib/labels';
import { answerFormatOf, type OfficialDomain } from '../lib/content';
import { useAppT, useErrorText } from '../i18n';

export const SessionResultsPage = () => {
  const t = useAppT();
  const { attemptId } = useParams<{ attemptId: string }>();
  const { accessToken, userId } = useAccess();
  if (!accessToken || !userId || !attemptId) {
    return (
      <div className="app-shell">
        <PracticeTopNav />
        <main className="workspace narrow"><p role="status">{t('results.signIn')}</p></main>
      </div>
    );
  }
  return <ResultsWorkspace key={userId + ":" + attemptId} accessToken={accessToken} attemptId={attemptId} />;
};

const ResultsWorkspace = ({ accessToken, attemptId }: { accessToken: string; attemptId: string }) => {
  const t = useAppT();
  const errorText = useErrorText();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<SatQuestion[]>([]);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [immutableResult, setImmutableResult] = useState(false);
  const [error, setError] = useState<unknown>(null), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const token = useRef(accessToken);
  token.current = accessToken;
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setAttempt(null); setQuestions([]); setImmutableResult(false);
    attemptGet(token.current, attemptId).then((res) => {
      if (!cancelled) {
        setAttempt(res.attempt); setQuestions(res.questions); setTiming(res.timing ?? null);
        setImmutableResult(res.legacy_result === false);
      }
    }).catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attemptId, reload]);
  const scored = attempt?.status === "scored";
  const total = attempt?.question_ids?.length ?? questions.length;
  const filters = (attempt?.filters_used ?? {}) as Record<string, unknown>;
  const isModule = filters.mode === 'module';
  const byDomain = useMemo(() => {
    if (!attempt || !immutableResult) return [];
    const map = new Map<OfficialDomain, { correct: number; total: number }>();
    for (const q of questions) {
      const domain = questionTaxonomy(q).official_domain;
      const fb = savedFeedback(attempt, q, true);
      const row = map.get(domain) ?? { correct: 0, total: 0 };
      row.total += 1; if (fb?.correct) row.correct += 1;
      map.set(domain, row);
    }
    return [...map.entries()];
  }, [attempt, questions, immutableResult]);
  const used = timing ? timing.elapsed_seconds : null;
  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('results.eyebrow')}</p>
            <h1>{scored ? t('results.score', { correct: attempt!.score_raw ?? 0, total }) : t('results.pendingTitle')}</h1>
            {scored && attempt!.score_accuracy != null ? <p>{t('results.accuracy', { pct: Math.round(attempt!.score_accuracy * 100) })}</p> : null}
            {used != null ? <p>{timing?.time_limit_seconds
              ? t('results.timeLimit', { minutes: Math.floor(used / 60), seconds: used % 60, limit: Math.round(timing.time_limit_seconds / 60) })
              : t('results.time', { minutes: Math.floor(used / 60), seconds: used % 60 })} · {t('results.minutesRecorded', { minutes: timing!.study_minutes })}</p> : null}
          </div>
          <div className="row-actions">
            <Link className="btn solid" to="/notebook">{t('results.openNotebook')}</Link>
            <Link className="btn ghost" to="/plan">{t('results.toPlan')}</Link>
            <AskSchoodAI source="sat-practice" session={attemptId}/>
          </div>
        </header>
        {loading ? <p role="status">{t('results.loading')}</p> : error ? (
          <div className="alert error" role="alert">{errorText(error)}
            <button type="button" className="btn ghost" onClick={() => setReload((v) => v + 1)}>{t('results.retryLoad')}</button>
          </div>
        ) : !scored ? (
          <div className="alert" role="status">{t('results.notScored')} <Link to={"/lab/" + attemptId}>{t('results.returnToDrill')}</Link> {t('results.toSubmit')}</div>
        ) : null}
        {scored && isModule ? <p className="alert" role="note">{t('results.moduleNote')}</p> : null}
        {byDomain.length ? <section className="panel" aria-labelledby="by-domain">
          <h2 id="by-domain">{t('results.byDomain')}</h2>
          <ul className="domain-results">{byDomain.map(([domain, row]) => <li key={domain}><span>{domainLabel(t, domain)}</span><strong>{t('results.domainLine', { correct: row.correct, total: row.total })}</strong>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((row.correct / row.total) * 100)}%` }} /></div></li>)}</ul>
        </section> : null}
        {scored && !immutableResult ? <div className="alert" role="status">{t('results.legacy')}</div> : null}
        {scored && !immutableResult ? <section className="panel" aria-label={t('results.savedAnswers')}>
          <h2>{t('results.savedAnswers')}</h2>
          <ol>{attempt!.question_ids.map(id => <li key={id}>{savedAnswerText(attempt!.answers[id])}</li>)}</ol>
        </section> : null}
        {scored && immutableResult ? (
          <section className="question-stack" aria-label={t('results.review')}>
            {questions.map((question, index) => {
              const feedback = savedFeedback(attempt!, question, immutableResult);
              const tax = questionTaxonomy(question);
              const spr = answerFormatOf(question.type, question.metadata) === 'spr';
              return (
                <div key={question.id} className="question-shell">
                  <div className="module-question-bar">
                    <span className="question-number">{t('lab.question', { n: index + 1 })}</span>
                    <span className="chip-row"><span className={`chip ${question.section_type}`}>{domainLabel(t, tax.official_domain)}</span>{tax.skill ? <span className="chip neutral">{skillLabel(t, tax.skill)}</span> : null}</span>
                  </div>
                  <QuestionCard question={question} value={attempt!.answers[question.id]} readOnly answerCorrect={feedback?.correct ?? null} />
                  {feedback ? <div className={`panel feedback-panel ${feedback.correct ? 'is-correct' : 'is-incorrect'}`}>
                    <strong>{feedback.correct ? t('question.correct') : t('question.incorrect')}</strong>
                    {feedback.expected ? <p><strong>{spr ? t('question.acceptedAnswers') : t('question.correctAnswer')}:</strong> <RichText text={feedback.expected} /></p> : <p>{t('question.expectedUnavailable')}</p>}
                    {feedback.explanation ? <div><strong>{t('question.explanation')}:</strong> <RichText as="div" className="explanation" text={feedback.explanation} /></div> : <p>{t('question.noExplanation')}</p>}
                  </div> : null}
                  <Link className="btn ghost compact" to={"/tutor/" + question.id + "?attempt=" + encodeURIComponent(attempt!.id)}>{t('results.openTutor')}</Link>
                </div>
              );
            })}
          </section>
        ) : null}
        {scored ? <Link className="btn ghost" to="/bank">{t('results.toBank')}</Link> : null}
      </main>
    </div>
  );
};
