import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FormItem } from '../../../packages/assessment-core/src/mod.ts';
import { QuestionResponse } from '../../../packages/assessment-web/src/QuestionResponse';
import { MathText } from '../../../packages/assessment-web/src/MathText';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import { admission, type MockResult, type MockSitting } from './api.ts';
import { answerText, hasAnswer } from './answers.ts';
import { useAppT, useErrorText } from './i18n/index.ts';
import { useTopicName } from './topics.ts';

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
};

function Result({ result, onExit }: { result: MockResult; onExit: () => void }) {
  const t = useAppT(), { number } = useI18n(), name = useTopicName();
  return <>
    <section className="admission-card mock-result" aria-labelledby="mock-result-title">
      <p className="eyebrow">{t('mock.title')}</p>
      <h1 id="mock-result-title" tabIndex={-1}>{t('mock.result', { points: number(result.points), max: number(result.max_points) })}</h1>
      <p>{t('mock.correctCount', { count: number(result.correct), total: number(result.total) })}</p>
      <p className="mock-rank">{result.percentile === null ? t('mock.firstThisWeek') : t('mock.rank', { percentile: number(result.percentile), participants: number(result.participants) })}</p>
      <p className="hint">{t('mock.nextWeek')}</p>
    </section>
    <section className="admission-card" aria-labelledby="mock-topics">
      <h2 id="mock-topics">{t('mock.byTopic')}</h2>
      <ul className="topic-list">{result.topics.map((row) => <li key={row.topic_code}>
        <div className="topic-name"><strong>{name(row.topic_code)}</strong></div>
        <div className="topic-meter" aria-hidden="true"><span style={{ width: `${(row.correct / row.total) * 100}%` }} className={row.correct === row.total ? 'strong' : row.correct ? 'middle' : 'weak'}/></div>
        <span className="topic-percent" aria-label={t('mock.topicScore', { correct: number(row.correct), total: number(row.total) })}>{number(row.correct)}/{number(row.total)}</span>
      </li>)}</ul>
    </section>
    <section className="admission-card" aria-labelledby="mock-review">
      <h2 id="mock-review">{t('mock.reviewTitle')}</h2>
      <ol className="mock-review">{result.review.map((row) => row.item && <li key={row.item_version_id} className={row.correct ? 'is-correct' : 'is-wrong'}>
        <p className="eyebrow">{name(row.topic_code)} · {row.correct ? t('practice.correct') : t('practice.incorrect')}</p>
        <p className="mock-prompt"><MathText text={row.item.prompt}/></p>
        <p>{t('mock.yourAnswer', { answer: '' })}{hasAnswer(row.response) ? <MathText text={answerText(row.item, row.response)}/> : t('mock.noAnswer')}</p>
        {!row.correct && row.correct_answer !== null && <p>{t('practice.correctAnswer', { answer: '' })}<MathText text={answerText(row.item, row.correct_answer)}/></p>}
        {row.solution && <details><summary>{t('practice.solution')}</summary>{row.solution.split(/\n{2,}/).map((part, index) => <p key={index}><MathText text={part}/></p>)}</details>}
      </li>)}</ol>
      <button onClick={onExit}>{t('practice.back')}</button>
    </section>
  </>;
}

export function Mock({ actor, onExit }: { actor: string; onExit: () => void }) {
  const t = useAppT(), problem = useErrorText(), { number } = useI18n(), name = useTopicName();
  const [sitting, setSitting] = useState<MockSitting | null>(null), [result, setResult] = useState<MockResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({}), [index, setIndex] = useState(0);
  const [left, setLeft] = useState(0), [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [saveError, setSaveError] = useState(false);
  const timers = useRef(new Map<string, number>()), heading = useRef<HTMLHeadingElement>(null), submitting = useRef(false);

  useEffect(() => {
    let live = true;
    admission<MockSitting | MockResult>('mock', 'POST', {}, actor).then((value) => {
      if (!live) return;
      if (value.submitted) setResult(value); else { setSitting(value); setAnswers(value.answers ?? {}); }
    }).catch((cause) => live && setError(problem(cause))).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [actor]);

  const submit = useCallback(async () => {
    if (!sitting || submitting.current) return;
    submitting.current = true; setBusy(true); setConfirming(false); setError('');
    try {
      // Flush answers still waiting to be saved before grading.
      for (const [id, timer] of timers.current) { clearTimeout(timer); await admission('mock/answer', 'PUT', { mock_id: sitting.id, item_version_id: id, response: answers[id] ?? null }, actor).catch(() => undefined); }
      timers.current.clear();
      setResult(await admission<MockResult>('mock/submit', 'POST', { mock_id: sitting.id }, actor));
      scrollTo(0, 0);
    } catch (cause) {
      setError(problem(cause)); submitting.current = false;
    } finally {
      setBusy(false);
    }
  }, [sitting, answers, actor]);

  useEffect(() => {
    if (!sitting) return;
    const tick = () => {
      const remaining = Date.parse(sitting.deadline_at) - Date.now();
      setLeft(remaining);
      if (remaining <= 0) void submit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sitting, submit]);

  useEffect(() => { heading.current?.focus(); }, [index, result]);

  function change(id: string, value: unknown) {
    if (!sitting) return;
    setAnswers((current) => ({ ...current, [id]: value }));
    // Typed answers save after a short pause; choices save at once.
    clearTimeout(timers.current.get(id));
    const delay = typeof value === 'string' && !sitting.items.find((row) => row.item_version_id === id)?.item.options?.length ? 700 : 0;
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      admission('mock/answer', 'PUT', { mock_id: sitting.id, item_version_id: id, response: value }, actor).then(() => setSaveError(false)).catch(() => setSaveError(true));
    }, delay));
  }

  if (result) return <Result result={result} onExit={onExit}/>;
  if (!sitting) return <section className="admission-card" aria-busy={busy}>
    <h1>{t('mock.title')}</h1>
    {busy ? <p role="status">{t('practice.loading')}</p> : error && <p role="alert" className="error">{error}</p>}
    <button className="quiet" onClick={onExit}>{t('practice.back')}</button>
  </section>;
  const entry = sitting.items[index], total = sitting.items.length;
  const answered = sitting.items.filter((row) => hasAnswer(answers[row.item_version_id])).length;
  const form: FormItem = { item_version_id: entry.item_version_id, section_id: 'mock', item: entry.item };
  return <section className="admission-card mock" aria-busy={busy}>
    <div className="mock-bar">
      <p className="eyebrow">{t('mock.title')}</p>
      <p className={`mock-clock${left < 5 * 60_000 ? ' is-low' : ''}`} role="timer" aria-live={left < 60_000 ? 'polite' : 'off'}>{t('mock.timeLeft', { time: clock(left) })}</p>
    </div>
    <p className="hint">{t('mock.question', { n: number(index + 1), total: number(total) })} · {name(entry.topic_code)}</p>
    <h1 ref={heading} tabIndex={-1} className="practice-prompt"><MathText text={entry.item.prompt}/></h1>
    {error && <p role="alert" className="error">{error}</p>}
    {saveError && <p role="alert" className="error">{t('mock.saveFailed')}</p>}
    <fieldset disabled={busy} className="mock-answer">
      <QuestionResponse key={entry.item_version_id} entry={form} value={answers[entry.item_version_id]} onChange={(value) => change(entry.item_version_id, value)}/>
    </fieldset>
    <div className="action-row">
      <button className="quiet" disabled={index === 0} onClick={() => setIndex(index - 1)}>{t('mock.prev')}</button>
      {index < total - 1 ? <button onClick={() => setIndex(index + 1)}>{t('mock.next')}</button> : <button disabled={busy} onClick={() => setConfirming(true)}>{t('mock.submit')}</button>}
    </div>
    <nav className="mock-nav" aria-label={t('mock.navigator')}>
      <p className="hint">{t('mock.answered', { count: number(answered), total: number(total) })}</p>
      <ol>{sitting.items.map((row, position) => <li key={row.item_version_id}><button type="button" aria-label={t('mock.goTo', { n: position + 1 })} aria-current={position === index ? 'step' : undefined} className={hasAnswer(answers[row.item_version_id]) ? 'is-answered' : ''} onClick={() => setIndex(position)}>{position + 1}</button></li>)}</ol>
    </nav>
    {confirming ? <div className="mock-confirm" role="alertdialog" aria-labelledby="mock-confirm-text">
      <p id="mock-confirm-text">{t('mock.confirm', { unanswered: number(total - answered) })}</p>
      <div className="action-row"><button disabled={busy} onClick={() => void submit()}>{t('mock.confirmYes')}</button><button className="quiet" onClick={() => setConfirming(false)}>{t('mock.keepGoing')}</button></div>
    </div> : index < total - 1 && <button className="quiet mock-finish" disabled={busy} onClick={() => setConfirming(true)}>{t('mock.submit')}</button>}
  </section>;
}
