import { useEffect, useRef, useState } from 'react';
import { Bot, Lightbulb } from 'lucide-react';
import { ApiError, tutorGenerate, tutorQuota, tutorResult, type TutorFeedback, type TutorMode, type TutorQuota, type TutorResponse } from '../lib/api';
import { acknowledgeTutorReceipt, prepareTutorReceipt, readTutorReceipt, tutorStorageKey, isTutorFeedback, isTutorQuota, type TutorReceipt } from '../lib/tutor-requests';

const labels: Record<TutorMode, string> = { explain: 'Explain', simpler: 'Simpler', similar: 'Similar example', 'why-wrong': 'Review my answer' };
export function TutorPanel(props: { questionId: string; attemptId: string; accessToken: string; userId: string }) {
  const [mode, setMode] = useState<TutorMode>('explain'), [result, setResult] = useState<TutorFeedback | null>(null);
  const [resultMode, setResultMode] = useState<TutorMode>('explain');
  const [quota, setQuota] = useState<TutorQuota | null>(null), [quotaError, setQuotaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<TutorReceipt | null>(null), [terminal, setTerminal] = useState(false), [busy, setBusy] = useState(false);
  const guard = useRef(false), mounted = useRef(true);
  const key = tutorStorageKey(props.userId, props.attemptId, props.questionId);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refreshQuota = async () => {
    try {
      const value = await tutorQuota(props.accessToken, props.userId);
      if (!isTutorQuota(value)) throw new Error('SAT Tutor is being updated. Your saved drill remains available.');
      if (mounted.current) { setQuota(value); setQuotaError(null); }
    } catch (failure) {
      if (mounted.current) { setQuota(null); setQuotaError(failure instanceof Error ? failure.message : 'The allowance could not be loaded. Please retry.'); }
    }
  };
  useEffect(() => {
    let cancelled = false;
    try { const saved = readTutorReceipt(sessionStorage, key); setPending(saved); if (saved) setMode(saved.mode); }
    catch { setError('Enable browser storage to recover and submit tutor requests safely.'); }
    void tutorQuota(props.accessToken, props.userId).then(value => {
      if (cancelled) return;
      if (!isTutorQuota(value)) throw new Error('SAT Tutor is being updated. Your saved drill remains available.');
      setQuota(value); setQuotaError(null);
    }).catch(failure => { if (!cancelled) { setQuota(null); setQuotaError(failure instanceof Error ? failure.message : 'The allowance could not be loaded.'); } });
    return () => { cancelled = true; };
  }, [key, props.accessToken, props.userId]);
  const accept = (value: TutorResponse<TutorFeedback>, receipt: TutorReceipt) => {
    if (!value.ok || value.ai_status !== 'ok' || value.request_id !== receipt.requestId || value.attempt_id !== props.attemptId || value.question_id !== props.questionId || value.mode !== receipt.mode || !isTutorFeedback(value.data)) throw new Error('The saved feedback could not be confirmed. Check this request again.');
    if (!mounted.current) return;
    setResult(value.data); setMode(receipt.mode); setResultMode(receipt.mode); setError(null); setNotice(null); setTerminal(false);
    try { acknowledgeTutorReceipt(sessionStorage, key, receipt.requestId); setPending(null); }
    catch { setNotice('Your feedback is saved. Browser storage could not be updated; checking this request again is safe.'); }
    void refreshQuota();
  };
  const generate = async (next: TutorMode) => {
    if (guard.current || pending || !quota?.enabled || quota.remaining <= 0 || quota.attempts_remaining <= 0) return;
    guard.current = true; setBusy(true); setMode(next); setError(null); setNotice(null);
    try {
      const receipt = prepareTutorReceipt(sessionStorage, key, next);
      if (receipt.mode !== next) { setPending(receipt); setMode(receipt.mode); throw new Error('Check the saved tutor request before starting another.'); }
      setPending(receipt);
      const value = await tutorGenerate(props.accessToken, props.userId, next, { question_id: props.questionId, attempt_id: props.attemptId, request_id: receipt.requestId });
      accept(value, receipt);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Feedback could not be confirmed. Check the saved request.'); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  };
  const recover = async () => {
    if (!pending || guard.current) return;
    guard.current = true; setBusy(true); setError(null);
    try {
      const value = await tutorResult(props.accessToken, props.userId, pending.mode, pending.requestId);
      if (!mounted.current) return;
      if (value.ai_status === 'ok') accept(value, pending);
      else {
        setTerminal(['uncertain', 'failed', 'cancelled'].includes(value.status ?? ''));
        setNotice(value.status === 'uncertain' ? 'This request may have reached the provider and remains counted. No feedback was confirmed.' : 'The request has no confirmed feedback yet. Checking again does not submit another request.');
      }
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 404 && failure.code === 'request_not_found') {
        try { acknowledgeTutorReceipt(sessionStorage, key, pending.requestId); setPending(null); setTerminal(false); setNotice('No request was saved. You can safely try again.'); void refreshQuota(); }
        catch { setError('Browser storage could not be updated. Retry checking this request.'); }
      } else setError(failure instanceof Error ? failure.message : 'The saved request could not be checked.');
    } finally { guard.current = false; if (mounted.current) setBusy(false); }
  };
  const releaseTerminal = () => {
    if (!pending || !terminal || busy) return;
    try { acknowledgeTutorReceipt(sessionStorage, key, pending.requestId); setPending(null); setTerminal(false); setNotice('A new explanation uses another request from your allowance.'); void refreshQuota(); }
    catch { setError('Browser storage could not be updated. Retry checking this request.'); }
  };
  const disabled = busy || Boolean(pending) || !quota?.enabled || quota.remaining <= 0 || quota.attempts_remaining <= 0;
  return <section className="panel tutor-panel" aria-busy={busy}>
    <div className="section-head"><div><p className="eyebrow">SAT Tutor</p><h2>Learn from this question</h2></div><Bot size={22} aria-hidden="true" /></div>
    <p>Explanations use the original question and your saved answer. AI feedback can make mistakes; check it against the saved solution.</p>
    <div className="tutor-actions" aria-label="Explanation options">{(Object.keys(labels) as TutorMode[]).map(entry => <button key={entry} type="button" className={`btn ${mode === entry ? 'solid' : 'ghost'}`} disabled={disabled} aria-pressed={mode === entry} onClick={() => void generate(entry)}>{labels[entry]}</button>)}</div>
    {quota ? <p role="status">{quota.enabled ? `${quota.remaining} of ${quota.limit} requests remaining today. Resets at midnight UTC.` : 'AI explanations are temporarily unavailable. Your completed drill and saved solution remain available.'}</p> : null}
    {quotaError ? <div className="alert error" role="alert"><p>{quotaError}</p><button type="button" className="btn ghost" disabled={busy} onClick={() => void refreshQuota()}>Retry allowance</button></div> : null}
    {busy ? <p role="status">Checking your tutor request…</p> : null}
    {error ? <p className="alert error" role="alert">{error}</p> : null}
    {notice ? <p className="alert" role="status">{notice}</p> : null}
    {pending ? <div className="tutor-recovery"><button type="button" className="btn solid" disabled={busy} onClick={() => void recover()}>Check saved explanation</button>{terminal ? <button type="button" className="btn ghost" disabled={busy} onClick={releaseTerminal}>Prepare a new request</button> : null}</div> : null}
    {!result && !pending && !busy ? <div className="empty-state"><Lightbulb size={20} aria-hidden="true" /><p>Choose an explanation above to review the concept, your answer or a similar example.</p></div> : null}
    {result ? <article className="tutor-feedback"><p className="eyebrow">{labels[resultMode]}</p><h3>{result.key_concept}</h3><ol>{result.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      {Object.keys(result.why_distractors_wrong).length ? <section><h3>Why other choices do not work</h3><dl>{Object.entries(result.why_distractors_wrong).map(([choice, explanation]) => <div key={choice}><dt>Choice {choice}</dt><dd>{explanation}</dd></div>)}</dl></section> : null}
      {result.similar_question ? <section><h3>Similar practice example</h3><p className="muted">AI-generated example; its answer has not been independently verified.</p><p>{result.similar_question.prompt}</p><ol className="tutor-choices">{result.similar_question.choices.map(choice => <li key={choice.id}><strong>{choice.id}.</strong> {choice.text}</li>)}</ol><details><summary>Show example answer</summary><p><strong>Answer {result.similar_question.correct_choice}.</strong> {result.similar_question.explanation}</p></details></section> : null}
    </article> : null}
  </section>;
}
