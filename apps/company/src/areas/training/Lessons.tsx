// Lessons (/w/:org/learn): pick a job-role track and see its lessons by stage.
import React from 'react';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { LevelBadge, Loading, Progress, useLoad, useLocalized, type Localized } from './lib.tsx';

interface TrackSummary { code: string; title: Localized; summary: Localized; lessons: number; foundation: number; professional: number; scenarios: number; templates: number; completed: number; started: number }
interface TrackDetail {
  track: TrackSummary;
  lessons: { code: string; stage: 'foundation' | 'professional'; level: string; title: Localized; goal: Localized; mission: 'roleplay' | 'writing'; status: 'new' | 'started' | 'completed'; score: number | null }[];
}

export function Lessons() {
  const t = useAppT(), pick = useLocalized();
  const { org } = useWorkspace();
  const { query } = useLocation();
  const list = useLoad<{ recommended: string; tracks: TrackSummary[] }>(`orgs/${org.id}/tracks`);
  const chosen = query.get('track') ?? list.data?.recommended ?? null;
  const detail = useLoad<TrackDetail>(chosen ? `orgs/${org.id}/tracks/${chosen}` : null);
  if (!list.data) return <Loading error={list.error}/>;
  const recommended = list.data.recommended;
  const ordered = [...list.data.tracks].sort((a, b) => Number(b.code === recommended) - Number(a.code === recommended));

  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.learn.title')}</h1>
      <p>{t('training.learn.lead')}</p>
    </header>
    <div className="company-toolbar">
      <label>{t('training.learn.track')}
        <select value={chosen ?? ''} onChange={(event) => navigate(`/w/${org.id}/learn?track=${event.target.value}`, { replace: true })}>
          {ordered.map((track) => <option key={track.code} value={track.code}>{pick(track.title)}{track.code === recommended ? ` — ${t('training.learn.yourRole')}` : ''}</option>)}
        </select>
      </label>
    </div>

    {!detail.data ? <Loading error={detail.error}/> : <TrackView org={org.id} detail={detail.data} recommended={detail.data.track.code === recommended}/>}

    <section className="training-card" aria-labelledby="training-all-tracks">
      <h2 id="training-all-tracks">{t('training.learn.allTracks')}</h2>
      <ul className="training-tracks">
        {ordered.map((track) => <li key={track.code} aria-current={track.code === chosen ? 'true' : undefined}>
          <Link to={`/w/${org.id}/learn?track=${track.code}`}>
            <strong>{pick(track.title)}</strong>
            <span>{t('training.learn.trackCount', { lessons: track.lessons, done: track.completed })}</span>
          </Link>
          <Progress value={track.completed} total={track.lessons} label={t('training.learn.trackProgress', { title: pick(track.title) })}/>
        </li>)}
      </ul>
    </section>
  </div>;
}

function TrackView({ org, detail, recommended }: { org: string; detail: TrackDetail; recommended: boolean }) {
  const t = useAppT(), pick = useLocalized();
  const done = detail.lessons.filter((lesson) => lesson.status === 'completed').length;
  return <section className="training-card" aria-labelledby="training-track-title">
    {recommended && <p className="eyebrow">{t('training.learn.yourRole')}</p>}
    <h2 id="training-track-title">{pick(detail.track.title)}</h2>
    <p>{pick(detail.track.summary)}</p>
    <Progress value={done} total={detail.lessons.length} label={t('training.learn.progress', { done, total: detail.lessons.length })}/>
    <p className="hint">{t('training.learn.progress', { done, total: detail.lessons.length })}</p>
    {(['foundation', 'professional'] as const).map((stage) => <div key={stage} className="training-stage">
      <h3>{t(`training.stage.${stage}` as AppKey)} <span className="hint">{t(`training.stage.${stage}Levels` as AppKey)}</span></h3>
      <ol className="training-lessons">
        {detail.lessons.filter((lesson) => lesson.stage === stage).map((lesson) => {
          const number = detail.lessons.indexOf(lesson) + 1;
          return <li key={lesson.code} className={`training-lesson is-${lesson.status}`}>
            <Link to={`/w/${org}/learn/${detail.track.code}/${lesson.code}`}>
              <span className="training-lesson-number" aria-hidden="true">{lesson.status === 'completed' ? '✓' : number}</span>
              <span className="training-lesson-body">
                <strong>{pick(lesson.title)}</strong>
                <span>{pick(lesson.goal)}</span>
                <span className="training-lesson-meta">
                  <LevelBadge level={lesson.level}/>
                  <span className={`company-badge${lesson.status === 'completed' ? ' good' : lesson.status === 'started' ? ' warn' : ''}`}>
                    {lesson.status === 'completed' ? t('training.lesson.statusDone', { score: lesson.score ?? 0 }) : t(`training.lesson.status.${lesson.status}` as AppKey)}
                  </span>
                  <span className="hint">{t(`training.mission.${lesson.mission}` as AppKey)}</span>
                </span>
              </span>
            </Link>
          </li>;
        })}
      </ol>
    </div>)}
  </section>;
}
