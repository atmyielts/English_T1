import React from 'react';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import type { LearnerState, Mode } from './api.ts';
import { useAppT } from './i18n/index.ts';
import { useTopicName } from './topics.ts';

const DAY = 86_400_000;

export function Prediction({ state }: { state: LearnerState }) {
  const t = useAppT(), { number } = useI18n(), p = state.prediction;
  if (!p) return null;
  const at = (value: number) => `${Math.max(0, Math.min(100, (value / p.max) * 100))}%`;
  const target = state.goal?.target_points ?? null;
  return <section className="admission-card prediction" aria-labelledby="prediction-title">
    <h2 id="prediction-title">{t('prediction.title')}</h2>
    <p className="prediction-range">{t('prediction.range', { low: number(p.low), high: number(p.high), max: number(p.max) })}</p>
    <div className="prediction-bar" aria-hidden="true">
      <span className="prediction-band" style={{ left: at(p.low), width: `calc(${at(p.high)} - ${at(p.low)})` }}/>
      <span className="prediction-mark" style={{ left: at(p.expected) }}/>
      {target !== null && <span className="prediction-target" style={{ left: at(target) }}/>}
    </div>
    <p>{t('prediction.expected', { expected: number(p.expected) })}{target !== null && <> · {t('prediction.target', { target: number(target) })}</>}</p>
    <p className="hint">{t(`prediction.confidence.${p.confidence}`)} {t('prediction.note')}</p>
  </section>;
}

export function Today({ state, start }: { state: LearnerState; start: (mode: Mode, topic?: string) => void }) {
  const t = useAppT(), { number } = useI18n(), name = useTopicName();
  const plan = state.plan, diagnostic = state.diagnostic;
  const examDate = state.goal?.exam_date;
  const days = examDate ? Math.max(0, Math.ceil((Date.parse(`${examDate}T00:00:00+05:00`) - Date.now()) / DAY)) : null;
  const finished = plan !== null && plan.tasks.length > 0 && plan.tasks.every((task) => task.answered >= task.questions);
  return <>
    <div className="page-heading"><h1>{t('today.title')}</h1>{days !== null && <p className="eyebrow">{t('today.daysLeft', { days: number(days) })}</p>}</div>
    {diagnostic && !diagnostic.done && <section className="admission-card diagnostic-card" aria-labelledby="diagnostic-title">
      <h2 id="diagnostic-title">{t('today.diagnostic.title')}</h2>
      <p>{t('today.diagnostic.lead', { remaining: number(diagnostic.remaining), total: number(diagnostic.total) })}</p>
      <progress max={diagnostic.total} value={diagnostic.total - diagnostic.remaining}/>
      <button onClick={() => start('diagnostic')}>{t('today.diagnostic.start')}</button>
    </section>}
    <Prediction state={state}/>
    <section className="admission-card" aria-labelledby="plan-title">
      <h2 id="plan-title">{t('today.plan.title')}</h2>
      {!plan || !plan.tasks.length ? <p className="hint">{t('today.plan.empty')}</p> : <>
        {finished && <p className="notice" role="status">{t('today.plan.done')}</p>}
        <ol className="plan-tasks">{plan.tasks.map((task) => <li key={task.topic_code} className={task.answered >= task.questions ? 'task-done' : ''}>
          <div>
            <p className="eyebrow">{t(`task.reason.${task.reason}`)}</p>
            <strong>{name(task.topic_code)}</strong>
            <span>{t('task.progress', { answered: number(task.answered), questions: number(task.questions) })}{task.points_recoverable > 0 && <> · {t('task.points', { points: number(task.points_recoverable) })}</>}</span>
            <progress max={task.questions} value={task.answered}/>
          </div>
          <button className={task.answered >= task.questions ? 'quiet' : ''} onClick={() => start(task.reason === 'review' ? 'review' : 'practice', task.topic_code)}>{t('task.start')}</button>
        </li>)}</ol>
      </>}
    </section>
  </>;
}
