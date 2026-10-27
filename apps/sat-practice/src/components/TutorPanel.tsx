import { useEffect, useRef, useState } from 'react';
import { Bot, Lightbulb } from 'lucide-react';
import { ApiError, tutorGenerate, tutorQuota, tutorResult, type TutorFeedback, type TutorMode, type TutorQuota, type TutorResponse } from '../lib/api';
import { acknowledgeTutorReceipt, prepareTutorReceipt, readTutorReceipt, tutorStorageKey, isTutorFeedback, isTutorQuota, type TutorReceipt } from '../lib/tutor-requests';
import { useAppT, useErrorText, type AppKey } from '../i18n';
import { RichText } from './RichText';

const MODES: TutorMode[] = ['explain', 'simpler', 'similar', 'why-wrong'];
class LocalError extends Error { constructor(readonly key: AppKey) { super(key); } }

export function TutorPanel(props: { questionId: string; attemptId: string; accessToken: string; userId: string }) {
  const t = useAppT();
  const errorText = useErrorText();
  const message = (failure: unknown, fallback: AppKey) => failure instanceof LocalError ? t(failure.key) : errorText(failure, fallback);
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
      if (!isTutorQuota(value)) throw new LocalError('tutor.updating');
      if (mounted.current) { setQuota(value); setQuotaError(null); }
    } catch (failure) {
      if (mounted.current) { setQuota(null); setQuotaError(message(failure, 'tutor.allowanceError')); }
    }
  };
  useEffect(() => {
    try { const saved = readTutorReceipt(sessionStorage, key); setPending(saved); if (saved) setMode(saved.mode); }
    catch { setError(t('tutor.storage')); }
    void refreshQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, props.accessToken, props.userId]);
  const accept = (value: TutorResponse<TutorFeedback>, receipt: TutorReceipt) => {
    if (!value.ok || value.ai_status !== 'ok' || value.request_id !== receipt.requestId || value.attempt_id !== props.attemptId || value.question_id !== props.questionId || value.mode !== receipt.mode || !isTutorFeedback(value.data)) throw new LocalError('tutor.confirmError');
    if (!mounted.current) return;
    setResult(value.data); setMode(receipt.mode); setResultMode(receipt.mode); setError(null); setNotice(null); setTerminal(false);
    try { acknowledgeTutorReceipt(sessionStorage, key, receipt.requestId); setPending(null); }
    catch { setNotice(t('tutor.savedStorage')); }
    void refreshQuota();
  };
  const exhausted = !!quota && (quota.remaining <= 0 || quota.attempts_remaining <= 0);
  const generate = async (next: TutorMode) => {
    if (guard.current || pending || !quota?.enabled || exhausted) return;
    guard.current = true; setBusy(true); setMode(next); setError(null); setNotice(null);
    try {
      const receipt = prepareTutorReceipt(sessionStorage, key, next);
      if (receipt.mode !== next) { setPending(receipt); setMode(receipt.mode); throw new LocalError('tutor.checkFirst'); }
      setPending(receipt);
      const value = await tutorGenerate(props.accessToken, props.userId, next, { question_id: props.questionId, attempt_id: props.attemptId, request_id: receipt.requestId });
      accept(value, receipt);
    } catch (failure) {
      if (mounted.current) {
        setError(message(failure, 'tutor.genericError'));
        if (failure instanceof ApiError && ['quota_exceeded', 'service_limit'].includes(failure.code ?? '')) void refreshQuota();
      }
    } finally { guard.current = false; if (mounted.current) setBusy(false); }
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
        setNotice(t(value.status === 'uncertain' ? 'tutor.uncertain' : 'tutor.noFeedbackYet'));
      }
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 404 && failure.code === 'request_not_found') {
        try { acknowledgeTutorReceipt(sessionStorage, key, pending.requestId); setPending(null); setTerminal(false); setNotice(t('tutor.noRequest')); void refreshQuota(); }
        catch { setError(t('tutor.storageUpdate')); }
      } else setError(message(failure, 'tutor.checkError'));
    } finally { guard.current = false; if (mounted.current) setBusy(false); }
  };
  const releaseTerminal = () => {
    if (!pending || !terminal || busy) return;
    try { acknowledgeTutorReceipt(sessionStorage, key, pending.requestId); setPending(null); setTerminal(false); setNotice(t('tutor.newUses')); void refreshQuota(); }
    catch { setError(t('tutor.storageUpdate')); }
  };
  const disabled = busy || Boolean(pending) || !quota?.enabled || exhausted;
  const quotaText = !quota ? null : !quota.enabled ? t('tutor.off')
    : quota.remaining <= 0 ? t('tutor.quotaUsed', { limit: quota.limit })
      : quota.attempts_remaining <= 0 ? t('tutor.retriesUsed')
        : t('tutor.quota', { remaining: quota.remaining, limit: quota.limit });
  return <section className="panel tutor-panel" aria-busy={busy}>
    <div className="section-head"><div><p className="eyebrow">{t('tutor.panel.eyebrow')}</p><h2>{t('tutor.panel.title')}</h2></div><Bot size={22} aria-hidden="true" /></div>
    <p>{t('tutor.panel.intro')}</p>
    <div className="tutor-actions" aria-label={t('tutor.options')}>{MODES.map(entry => <button key={entry} type="button" className={`btn ${mode === entry ? 'solid' : 'ghost'}`} disabled={disabled} aria-pressed={mode === entry} onClick={() => void generate(entry)}>{t(`tutor.mode.${entry}` as AppKey)}</button>)}</div>
    {quotaText ? <p role="status" className="tutor-quota">{quotaText}</p> : null}
    {quotaError ? <div className="alert error" role="alert"><p>{quotaError}</p><button type="button" className="btn ghost" disabled={busy} onClick={() => void refreshQuota()}>{t('tutor.retryAllowance')}</button></div> : null}
    {busy ? <p role="status">{t('tutor.checking')}</p> : null}
    {error ? <p className="alert error" role="alert">{error}</p> : null}
    {notice ? <p className="alert" role="status">{notice}</p> : null}
    {pending ? <div className="tutor-recovery"><button type="button" className="btn solid" disabled={busy} onClick={() => void recover()}>{t('tutor.checkSaved')}</button>{terminal ? <button type="button" className="btn ghost" disabled={busy} onClick={releaseTerminal}>{t('tutor.newRequest')}</button> : null}</div> : null}
    {!result && !pending && !busy ? <div className="empty-state"><Lightbulb size={20} aria-hidden="true" /><p>{t('tutor.choose')}</p></div> : null}
    {result ? <article className="tutor-feedback"><p className="eyebrow">{t(`tutor.mode.${resultMode}` as AppKey)}</p><h3><RichText text={result.key_concept} /></h3><ol>{result.steps.map((step, index) => <li key={index}><RichText text={step} /></li>)}</ol>
      {Object.keys(result.why_distractors_wrong).length ? <section><h3>{t('tutor.whyOthers')}</h3><dl>{Object.entries(result.why_distractors_wrong).map(([choice, explanation]) => <div key={choice}><dt>{t('tutor.choice', { id: choice })}</dt><dd><RichText text={explanation} /></dd></div>)}</dl></section> : null}
      {result.similar_question ? <section><h3>{t('tutor.similarTitle')}</h3><p className="muted">{t('tutor.similarNote')}</p><RichText as="p" text={result.similar_question.prompt} /><ol className="tutor-choices">{result.similar_question.choices.map(choice => <li key={choice.id}><strong>{choice.id}.</strong> <RichText text={choice.text} /></li>)}</ol><details><summary>{t('tutor.showAnswer')}</summary><p><strong>{t('tutor.answerLine', { id: result.similar_question.correct_choice })}</strong> <RichText text={result.similar_question.explanation} /></p></details></section> : null}
    </article> : null}
  </section>;
}
