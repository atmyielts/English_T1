import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { FormItem } from '../../../packages/assessment-core/src/mod.ts';
import { QuestionResponse } from '../../../packages/assessment-web/src/QuestionResponse';
import { MathText } from '../../../packages/assessment-web/src/MathText';
import { admission, type Feedback, type Mode, type Question } from './api.ts';
import { useAppT, useErrorText } from './i18n/index.ts';
import { useTopicName } from './topics.ts';
import { answerText, hasAnswer as answered } from './answers.ts';

export function Practice({ mode, topic, actor, onExit }: { mode: Mode; topic?: string; actor: string; onExit: () => void }) {
  const t = useAppT(), problem = useErrorText(), name = useTopicName();
  const [question, setQuestion] = useState<Question | null>(null);
  const [value, setValue] = useState<unknown>(undefined);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const started = useRef(Date.now()), clientId = useRef(crypto.randomUUID()), heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    setBusy(true); setError(''); setFeedback(null); setValue(undefined);
    try {
      const params = new URLSearchParams({ mode, ...(topic ? { topic } : {}) });
      setQuestion(await admission<Question>(`question?${params}`, 'GET', undefined, actor));
      started.current = Date.now(); clientId.current = crypto.randomUUID();
    } catch (cause) {
      setQuestion(null); setError(problem(cause));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => heading.current?.focus());
    }
  }, [mode, topic, actor]);
  useEffect(() => { void load(); }, [load]);

  async function check(event: FormEvent) {
    event.preventDefault();
    if (!question || question.done) return;
    if (!answered(value)) { setError(t('practice.answerRequired')); return; }
    setBusy(true); setError('');
    try {
      setFeedback(await admission<Feedback>('answer', 'POST', {
        client_answer_id: clientId.current, item_version_id: question.item_version_id, topic_code: question.topic_code, mode: question.mode === 'mistakes' ? 'review' : question.mode,
        response: value, seconds: Math.min(7200, Math.round((Date.now() - started.current) / 1000)),
      }, actor));
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'diagnostic' ? t('practice.diagnostic') : mode === 'mistakes' ? t('practice.mistakes') : topic ? name(topic) : '';
  if (question?.done) return <section className="admission-card" aria-live="polite">
    <h1 ref={heading} tabIndex={-1}>{mode === 'mistakes' ? t('practice.mistakes') : t('practice.diagnostic')}</h1>
    <p className="notice" role="status">{mode === 'mistakes' ? t('mistakes.done') : t('practice.diagnosticDone')}</p>
    <button onClick={onExit}>{t('practice.back')}</button>
  </section>;
  const entry: FormItem | null = question ? { item_version_id: question.item_version_id, section_id: 'practice', item: question.item } : null;
  return <section className="admission-card practice" aria-busy={busy}>
    <p className="eyebrow">{title}{(mode === 'diagnostic' || mode === 'mistakes') && question && ` · ${name(question.topic_code)}`}{mode === 'mistakes' && question && !question.done && question.remaining ? ` · ${t('practice.mistakesLeft', { count: question.remaining })}` : ''}</p>
    <h1 ref={heading} tabIndex={-1} className="practice-prompt">{entry ? <MathText text={entry.item.prompt}/> : t('practice.loading')}</h1>
    {error && <p role="alert" className="error">{error}</p>}
    {entry && <form onSubmit={check}>
      <fieldset disabled={busy || feedback !== null}>
        <QuestionResponse entry={entry} value={value} onChange={setValue}/>
      </fieldset>
      {!feedback && <button disabled={busy}>{t('practice.check')}</button>}
    </form>}
    {feedback && question && !question.done && <div className={`practice-feedback ${feedback.correct ? 'is-correct' : 'is-wrong'}`} role="status">
      <h2>{feedback.correct ? t('practice.correct') : t('practice.incorrect')}</h2>
      {!feedback.correct && feedback.error_kind && <p>{t(`practice.${feedback.error_kind}`)}</p>}
      {!feedback.correct && feedback.correct_answer !== null && <p>{t('practice.correctAnswer', { answer: '' })}<MathText text={answerText(question.item, feedback.correct_answer)}/></p>}
      {feedback.solution && <div className="practice-solution"><h3>{t('practice.solution')}</h3>{feedback.solution.split(/\n{2,}/).map((part, index) => <p key={index}><MathText text={part}/></p>)}</div>}
      <p className="hint">{t('practice.mastery', { before: Math.round(feedback.mastery.before * 100), after: Math.round(feedback.mastery.after * 100) })}</p>
    </div>}
    <div className="action-row">
      {(feedback || (!entry && !busy && error)) && <button onClick={() => void load()} disabled={busy}>{t('practice.next')}</button>}
      <button className="quiet" onClick={onExit}>{t('practice.back')}</button>
    </div>
  </section>;
}
