import React from 'react';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import type { LearnerState, Mode } from './api.ts';
import { useAppT, type AppKey } from './i18n/index.ts';
import { useDay } from './dates.ts';
import { useTopicName } from './topics.ts';
import { Trend } from './Trend';

export type Go = (view: 'journey' | 'mock') => void;

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
    <Trend trend={state.trend} max={p.max}/>
  </section>;
}

function Habit({ state }: { state: LearnerState }) {
  const t = useAppT(), { number } = useI18n(), habit = state.habit;
  const share = Math.min(1, habit.today.minutes / Math.max(1, habit.daily_minutes));
  return <div className="habit" role="group" aria-label={t('today.title')}>
    <p className={`habit-streak${habit.active_today ? ' is-active' : ''}`}>
      <strong>{habit.current ? t('habit.streak', { count: number(habit.current) }) : t('habit.streakNone')}</strong>
      {habit.best > habit.current && <span>{t('habit.best', { count: number(habit.best) })}</span>}
    </p>
    <div className="habit-minutes">
      <span>{t('habit.minutes', { done: number(habit.today.minutes), target: number(habit.daily_minutes) })}</span>
      <progress max={1} value={share}/>
    </div>
  </div>;
}

function NextExam({ state, go }: { state: LearnerState; go: Go }) {
  const t = useAppT(), { number } = useI18n(), journey = state.journey;
  const awaiting = journey.milestones.find((row) => journey.awaiting_result.includes(row.id));
  const fullDay = useDay(), day = (value: string) => fullDay(value, false);
  return <section className="admission-card next-exam" aria-labelledby="next-exam-title">
    <h2 id="next-exam-title">{t('next.title')}</h2>
    {awaiting && <p className="notice" role="status">{t('next.awaiting', { exam: t(`exam.${awaiting.exam_code}` as AppKey), date: day(awaiting.sitting_date) })}</p>}
    {journey.next ? <div className="next-exam-row">
      <div>
        <strong>{t(`exam.${journey.next.exam_code}` as AppKey)}</strong>
        <span>{day(journey.next.sitting_date)}{journey.next.target_grade ? ` · ${t('journey.target', { target: journey.next.target_grade })}` : journey.next.target_points !== null ? ` · ${t('journey.target', { target: number(journey.next.target_points) })}` : ''}</span>
      </div>
      <p className="next-exam-days">{journey.days_to_next === 0 ? t('next.today') : t('next.days', { days: number(journey.days_to_next ?? 0) })}</p>
    </div> : <p className="hint">{t('next.none')}</p>}
    <button className="quiet" onClick={() => go('journey')}>{t('next.open')}</button>
  </section>;
}

function WeeklyMock({ state, go }: { state: LearnerState; go: Go }) {
  const t = useAppT(), { number } = useI18n(), mock = state.mock;
  if (!mock || !mock.questions) return null;
  return <section className="admission-card weekly-mock" aria-labelledby="weekly-mock-title">
    <h2 id="weekly-mock-title">{t('mock.title')}</h2>
    {mock.status === 'submitted' ? <>
      <p className="prediction-range">{t('mock.result', { points: number(mock.points), max: number(mock.max_points) })}</p>
      <p>{mock.percentile === null ? t('mock.firstThisWeek') : t('mock.rank', { percentile: number(mock.percentile), participants: number(mock.participants) })}</p>
      <div className="action-row"><button className="quiet" onClick={() => go('mock')}>{t('mock.review')}</button></div>
      <p className="hint">{t('mock.nextWeek')}</p>
    </> : <>
      <p>{t('mock.lead', { questions: number(mock.questions), minutes: number(mock.minutes) })}</p>
      {mock.locked ? <p className="hint">{t('mock.locked')}</p>
        : <button onClick={() => go('mock')}>{mock.status === 'none' ? t('mock.start') : mock.status === 'expired' ? t('mock.review') : t('mock.continue')}</button>}
      {mock.status === 'expired' && <p className="hint">{t('mock.expired')}</p>}
    </>}
  </section>;
}

export function Today({ state, start, go }: { state: LearnerState; start: (mode: Mode, topic?: string) => void; go: Go }) {
  const t = useAppT(), { number } = useI18n(), name = useTopicName();
  const plan = state.plan, diagnostic = state.diagnostic, access = state.access;
  const finished = plan !== null && plan.tasks.length > 0 && plan.tasks.every((task) => task.answered >= task.questions);
  return <>
    <div className="page-heading"><h1>{t('today.title')}</h1></div>
    <Habit state={state}/>
    {access.plan === 'free' && access.remaining_today !== null && <p className={access.remaining_today ? 'hint' : 'notice'} role="status">{access.remaining_today ? t('access.remaining', { remaining: number(access.remaining_today), limit: number(access.daily_limit ?? 0) }) : t('error.daily_limit')}</p>}
    {diagnostic && !diagnostic.done && <section className="admission-card diagnostic-card" aria-labelledby="diagnostic-title">
      <h2 id="diagnostic-title">{t('today.diagnostic.title')}</h2>
      <p>{t('today.diagnostic.lead', { remaining: number(diagnostic.remaining), total: number(diagnostic.total) })}</p>
      <progress max={diagnostic.total} value={diagnostic.total - diagnostic.remaining}/>
      <button onClick={() => start('diagnostic')}>{t('today.diagnostic.start')}</button>
    </section>}
    <NextExam state={state} go={go}/>
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
    {state.mistakes > 0 && <section className="admission-card mistakes-card" aria-labelledby="mistakes-title">
      <h2 id="mistakes-title">{t('mistakes.title')}</h2>
      <p>{t('mistakes.lead', { count: number(state.mistakes) })}</p>
      <button className="quiet" onClick={() => start('mistakes')}>{t('mistakes.start')}</button>
    </section>}
    <WeeklyMock state={state} go={go}/>
    <Prediction state={state}/>
  </>;
}
