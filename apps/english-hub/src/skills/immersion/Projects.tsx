import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useI18n, useT } from '../../i18n';
import { L1Why } from '../../components/L1Why';
import { SavePhrase } from '../../components/SavePhrase';
import { useElapsedSeconds, useResource } from '../../lib/useResource';
import { LevelBadge, Panel, ScoreBadge, Tag, useErrorMessage } from '../../ui/kit';
import { changedPhrase } from '../../../../../supabase/functions/_shared/english-text-diff.ts';
import { ActivityFrame } from '../ActivityKit';
import { SpeakInput, type Draft } from './Mission';
import { PersonalSummary, PersonalTargetsPanel, WordsInText } from './Personal';
import {
  abandonProject,
  getProject,
  getProjects,
  startProject,
  submitProjectDay,
  type ProjectDayPublic,
  type ProjectDaySubmitResponse,
  type ProjectDetail,
  type ProjectState,
  type ProjectSummary,
} from './api';
import '../../depth.css';

const formatDate = (date: string, locale: string): string => {
  try {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale === 'uz' ? 'uz-Latn' : locale, { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return date;
  }
};

/** On the Real-life home: the multi-day projects and where the learner is in each. */
export const ProjectsPanel = () => {
  const t = useT();
  const projects = useResource((signal) => getProjects(signal), []);
  if (projects.error || (!projects.loading && !projects.data?.projects.length)) return null;
  return (
    <Panel title={t('depth.projects.title')}>
      <p className="hint" style={{ margin: 0 }}>{t('depth.projects.lead')}</p>
      {projects.loading && !projects.data ? <p className="hint">{t('depth.loading')}</p> : null}
      <ul className="dp-projects">
        {(projects.data?.projects ?? []).map((project) => (
          <li key={project.key}>
            <Link to={`/immersion/projects/${project.key}`} className="dp-project-card">
              <span className="en-row" style={{ justifyContent: 'space-between' }}>
                <strong>{project.title}</strong>
                <LevelBadge level={project.level} />
              </span>
              <span className="hint" lang="en">{project.summary}</span>
              <span className="dp-project-status">
                {project.status === 'completed'
                  ? t('depth.projects.completed')
                  : project.status === 'active'
                    ? project.current ? t('depth.projects.dayReady', { day: project.current, days: project.days }) : t('depth.projects.waiting', { done: project.done_days, days: project.days })
                    : t('depth.projects.days', { count: project.days })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

const DayTracker = ({ days, state }: { days: ProjectDayPublic[]; state: ProjectState }) => {
  const t = useT();
  return (
    <ol className="en-steps dp-day-steps" aria-label={t('depth.project.daysLabel')}>
      {days.map((day) => {
        const entry = state.days.find((item) => item.day === day.day);
        const status = entry?.status ?? 'locked';
        return (
          <li key={day.day} className={status === 'open' ? 'is-current' : status === 'done' ? 'is-done' : ''} aria-current={status === 'open' ? 'step' : undefined}>
            <span>{status === 'done' ? '✓' : day.day}</span>
            {day.title}
            <span className="visually-hidden"> ({t(`depth.project.status.${status}`)})</span>
          </li>
        );
      })}
    </ol>
  );
};

const SummaryPanel = ({ summary, onRestart, busy }: { summary: ProjectSummary; onRestart: () => void; busy: boolean }) => {
  const t = useT();
  return (
    <section className="en-panel" aria-live="polite">
      <div className="en-result">
        <ScoreBadge score={summary.score} />
        <div className="en-stack" style={{ gap: '.4rem' }}>
          <h2 style={{ margin: 0 }}>{t('depth.project.doneTitle')}</h2>
          <p className="en-notice" style={{ margin: 0 }} lang="en">{summary.can_do}</p>
        </div>
      </div>
      <ul className="dp-step-scores">
        {summary.days.map((day) => (
          <li key={day.day}>
            <span>{t('depth.project.dayN', { day: day.day })} · <span lang="en">{day.title}</span></span>
            <span className="dp-step-bar" aria-hidden="true"><span style={{ width: `${day.score}%` }} /></span>
            <strong>{day.score}%</strong>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0 }}>
        {t('depth.project.pointsMet', { met: summary.points_met, total: summary.points_total })}
        {summary.words_used.length ? <> · {t('depth.project.wordsUsed', { words: summary.words_used.join(', ') })}</> : null}
        {summary.corrections ? <> · {t('depth.project.corrections', { count: summary.corrections })}</> : null}
      </p>
      <div className="en-actions">
        <Link className="en-button-quiet" to="/immersion">{t('depth.project.more')}</Link>
        <button type="button" className="quiet" disabled={busy} onClick={onRestart}>{t('depth.project.again')}</button>
      </div>
    </section>
  );
};

const DayResult = ({ result, projectTitle }: { result: ProjectDaySubmitResponse; projectTitle: string }) => {
  const t = useT();
  const { day } = result;
  return (
    <section className="en-panel" aria-live="polite">
      <div className="en-result">
        <ScoreBadge score={day.score} />
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <h2 style={{ margin: 0 }}>{t('depth.project.dayDone', { day: day.day })}</h2>
          {day.summary ? <p style={{ margin: 0 }}>{day.summary}</p> : null}
          {day.feedback_mode === 'basic' ? <p className="hint" style={{ margin: 0 }}>{t('immersion.result.basic')}</p> : null}
        </div>
      </div>
      {day.points.length ? (
        <ul className="im-checklist">
          {day.points.map((point) => (
            <li key={point.label} className={point.met ? 'is-met' : 'is-missed'}>
              <span className="im-mark" aria-hidden="true">{point.met ? '✓' : '✗'}</span>
              <span>
                <span className="visually-hidden">{point.met ? t('immersion.result.met') : t('immersion.result.missed')}: </span>
                <span lang="en">{point.label.charAt(0).toUpperCase() + point.label.slice(1)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {day.too_short ? <p className="en-explain" style={{ margin: 0 }}>{t('depth.project.tooShort', { count: day.min_words })}</p> : null}
      {day.tone_note ? <p className="en-explain" style={{ margin: 0 }}><strong>{t('immersion.result.tone')}:</strong> {day.tone_note}</p> : null}
      {day.corrections.length ? (
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <strong style={{ fontSize: '.9rem' }}>{t('immersion.result.corrections')}</strong>
          <ul className="en-list">
            {day.corrections.map((correction, index) => (
              <li key={index} className="en-stack" style={{ gap: '.2rem' }}>
                <span className="en-diff" lang="en"><del>{correction.original}</del> → <ins>{correction.better}</ins></span>
                {correction.explanation ? <span className="hint">{correction.explanation}</span> : null}
                <span><SavePhrase phrase={changedPhrase(correction.original, correction.better)} context={correction.better} source="immersion-feedback" label={projectTitle} /></span>
                <L1Why original={correction.original} corrected={correction.better} explanation={correction.explanation} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <PersonalSummary personal={result.personal} />
      <details>
        <summary>{t('immersion.result.example')}</summary>
        <p className="en-passage" lang="en" style={{ whiteSpace: 'pre-line', fontSize: '.95rem' }}>{day.model_answer}</p>
      </details>
    </section>
  );
};

export const ProjectPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const errorText = useErrorMessage();
  const { refreshAccess } = useEnglish();
  const { key = '' } = useParams();
  const resource = useResource((signal) => getProject(key, signal), [key]);
  const elapsed = useElapsedSeconds();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [draft, setDraft] = useState<Draft>({ answers: {}, text: '', mode: 'typed' });
  const [result, setResult] = useState<ProjectDaySubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  const data = detail ?? resource.data;
  const project = data?.project;
  const run = data?.run ?? null;
  const state = result?.run.state ?? run?.state ?? null;
  const currentDay = state?.current ? project?.days.find((day) => day.day === state.current) ?? null : null;
  const redoDay = !currentDay && state ? state.days.find((entry) => entry.can_redo) ?? null : null;
  const [redoing, setRedoing] = useState(false);
  const activeDay = currentDay ?? (redoing && redoDay ? project?.days.find((day) => day.day === redoDay.day) ?? null : null);
  const summary = result?.summary ?? data?.summary ?? null;
  const completed = (result?.run.status ?? run?.status) === 'completed';

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const start = () => act(async () => {
    setResult(null);
    setDetail(await startProject(key));
    setDraft({ answers: {}, text: '', mode: 'typed' });
  });

  const stop = () => act(async () => {
    await abandonProject(key);
    setConfirmStop(false);
    setResult(null);
    setDetail(null);
    resource.reload();
  });

  const submit = () => act(async () => {
    if (!activeDay) return;
    const response = await submitProjectDay(key, activeDay.day, {
      text: draft.text,
      mode: activeDay.kind === 'speak' ? draft.mode : 'typed',
      yourWordIds: (data?.personal?.words ?? []).map((word) => word.id),
      timeSpentSeconds: elapsed(),
    });
    setResult(response);
    setRedoing(false);
    setDraft({ answers: {}, text: '', mode: 'typed' });
    void refreshAccess();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const words = draft.text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <ActivityFrame
      skill="immersion"
      title={project?.title}
      level={project?.level}
      minutes={8}
      lead={project?.summary}
      loading={resource.loading && !resource.data}
      error={resource.error}
      onRetry={resource.reload}
    >
      {project ? (
        <>
          {result ? <DayResult result={result} projectTitle={project.title} /> : null}

          {completed && summary ? <SummaryPanel summary={summary} onRestart={() => void start()} busy={busy} /> : null}

          {!run && !result ? (
            <Panel title={t('depth.project.aboutTitle')}>
              <ol className="dp-plan" lang="en">
                {project.days.map((day) => (
                  <li key={day.day}><strong>{t('depth.project.dayN', { day: day.day })}:</strong> {day.title}</li>
                ))}
              </ol>
              <p className="hint" style={{ margin: 0 }}>{t('depth.project.howItWorks')}</p>
              <div className="en-actions">
                <button type="button" className="is-large" disabled={busy} onClick={() => void start()}>{t('depth.project.start')}</button>
              </div>
            </Panel>
          ) : null}

          {state && !completed ? <DayTracker days={project.days} state={state} /> : null}

          {state && !completed && !activeDay ? (
            <Panel title={t('depth.project.waitTitle')}>
              <p style={{ margin: 0 }}>
                {state.opens_on ? t('depth.project.opensOn', { date: formatDate(state.opens_on, locale) }) : t('depth.project.waitBody')}
              </p>
              {redoDay ? (
                <div className="en-actions">
                  <button type="button" className="quiet" onClick={() => { setRedoing(true); setResult(null); }}>{t('depth.project.redo', { day: redoDay.day })}</button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {activeDay && !completed ? (
            <>
              <Panel title={t('depth.project.dayTitle', { day: activeDay.day, title: activeDay.title })} aside={<Tag>{t(activeDay.kind === 'speak' ? 'depth.project.kindSpeak' : 'depth.project.kindReply')}</Tag>}>
                <p className="en-passage" lang="en" style={{ margin: 0, fontSize: '1rem' }}>{activeDay.situation}</p>
                {data?.previous_excerpt && activeDay.day > 1 ? (
                  <p className="en-explain" style={{ margin: 0 }}>
                    <strong>{t('depth.project.yesterday')}</strong> <span lang="en">“{data.previous_excerpt}”</span>
                  </p>
                ) : null}
                <p style={{ margin: 0 }} lang="en"><strong>{activeDay.task}</strong></p>
                <ul className="wr-checklist" lang="en">
                  {activeDay.points.map((point) => (
                    <li key={point}><span className="wr-mark" aria-hidden="true">•</span><span>{point.charAt(0).toUpperCase() + point.slice(1)}</span></li>
                  ))}
                </ul>
              </Panel>

              <PersonalTargetsPanel personal={data?.personal} />

              <Panel title={t('depth.project.answerTitle')}>
                {activeDay.kind === 'speak' ? (
                  <SpeakInput stepId={`day-${activeDay.day}`} draft={draft} disabled={busy} onChange={(text, mode) => setDraft((current) => ({ ...current, text, mode }))} />
                ) : (
                  <>
                    <label htmlFor={`day-${activeDay.day}`} className="visually-hidden">{t('depth.project.answerTitle')}</label>
                    <textarea
                      id={`day-${activeDay.day}`}
                      className="en-writing"
                      lang="en"
                      value={draft.text}
                      disabled={busy}
                      placeholder={t('immersion.reply.placeholder')}
                      onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value, mode: 'typed' }))}
                      style={{ minHeight: '10rem' }}
                    />
                  </>
                )}
                <p className="en-meter" aria-live="polite" style={{ margin: 0 }}>
                  <span><strong>{t('immersion.reply.words', { count: words })}</strong></span>
                  <span>{t('immersion.reply.aim', { count: activeDay.min_words })}</span>
                </p>
                <WordsInText words={data?.personal?.words ?? []} text={draft.text} />
                {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
                <div className="en-actions">
                  <button type="button" className="is-large" disabled={busy || words < 3} onClick={() => void submit()}>
                    {busy ? t('immersion.submit.checking') : t('depth.project.check')}
                  </button>
                </div>
              </Panel>
            </>
          ) : null}

          {error && !activeDay ? <div className="error" role="alert">{errorText(error)}</div> : null}

          {run && !completed ? (
            <div className="en-actions">
              {confirmStop ? (
                <>
                  <span className="hint">{t('depth.project.stopConfirm')}</span>
                  <button type="button" className="quiet" disabled={busy} onClick={() => void stop()}>{t('depth.project.stopYes')}</button>
                  <button type="button" className="is-link" onClick={() => setConfirmStop(false)}>{t('depth.project.stopNo')}</button>
                </>
              ) : (
                <button type="button" className="is-link" onClick={() => setConfirmStop(true)}>{t('depth.project.stop')}</button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </ActivityFrame>
  );
};
