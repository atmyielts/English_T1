import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getHistory, getProgress, moveUpLevel, type ProgressResponse, type SkillProgress } from '../lib/hub';
import { nextLevel, SKILLS, type SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { CanDoPanel } from './CanDoPanel';
import { LevelJourneyPanel } from './LevelJourneyPanel';
import { GoalPlanPanel } from './goal/GoalPlanPanel';
import { BadgesPanel } from '../components/Badges';
import { SkillRatingsPanel } from './SkillRatingsPanel';
import { TrapsPanel } from './TrapsPanel';
import { ShareCardButton } from '../components/ShareCardButton';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, ProgressBar, SkillDot, Stat, Tag } from '../ui/kit';

const Heatmap = ({ days }: { days: ProgressResponse['days'] }) => {
  const t = useT();
  return (
    <div className="en-heatmap" role="img" aria-label={t('progress.heatmap.label', { weeks: Math.round(days.length / 7) })}>
      {days.map((day) => {
        const level = day.count === 0 ? 0 : day.count < 2 ? 1 : day.count < 4 ? 2 : 3;
        return <span key={day.date} data-level={level} title={`${day.date}: ${day.count}`} />;
      })}
    </div>
  );
};

/** One honest line about where the learner stands in a skill. */
const skillNote = (row: SkillProgress, t: (key: string, params?: Record<string, string | number>) => string): string => {
  if (row.activities === 0) return t('progress.skills.notStarted');
  if (row.level && (row.status === 'ready' || (!row.status && row.attempts_at_level >= 3 && (row.accuracy_at_level ?? 0) >= 85))) {
    return t('progress.skills.readyNext', { level: row.next_level ?? nextLevel(row.level) });
  }
  if (row.status === 'struggling') return t('progress.skills.struggling');
  if (row.accuracy_at_level !== null) {
    return t('progress.skills.atLevel', { score: row.accuracy_at_level, count: row.attempts_at_level });
  }
  return t('progress.skills.activities', { count: row.activities });
};

export const ProgressPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { onboarding, refreshOnboarding } = useEnglish();
  const progress = useResource((signal) => getProgress(signal), []);
  const [moving, setMoving] = useState<SkillKey | null>(null);
  const [moved, setMoved] = useState<{ skill: SkillKey; level: string } | null>(null);
  const [moveError, setMoveError] = useState<unknown>(null);

  const moveUp = async (skill: SkillKey) => {
    setMoving(skill);
    setMoveError(null);
    try {
      const response = await moveUpLevel(skill);
      setMoved({ skill, level: response.level });
      await refreshOnboarding();
      progress.reload();
    } catch (cause) {
      setMoveError(cause);
    } finally {
      setMoving(null);
    }
  };
  const history = useResource((signal) => getHistory(undefined, signal), []);
  const placement = onboarding.value;
  const data = progress.data;

  return (
    <>
      <PageHeader
        eyebrow={t('progress.eyebrow')}
        title={t('progress.title')}
        lead={t('progress.lead')}
        actions={placement?.level ? (
          <span className="en-row">
            <span className="hint">{t('progress.placement')}</span>
            <LevelBadge level={placement.level} />
            {placement.targetLevel ? <><span aria-hidden="true">→</span><LevelBadge level={placement.targetLevel} muted /></> : null}
          </span>
        ) : null}
      />
      {progress.error ? <ErrorState error={progress.error} onRetry={progress.reload} /> : null}

      <section className="en-panel">
        <div className="en-stats">
          <Stat label={t('progress.stat.streak')} value={data ? t('progress.days', { count: data.streak.current }) : '—'} hint={data ? t('progress.stat.best', { count: data.streak.longest }) : undefined} />
          <Stat label={t('progress.stat.week')} value={data ? data.totals.last_7_days : '—'} hint={t('progress.stat.activities')} />
          <Stat label={t('progress.stat.month')} value={data ? data.totals.last_30_days : '—'} hint={t('progress.stat.activities')} />
          <Stat label={t('progress.stat.all')} value={data ? data.totals.all_time : '—'} hint={t('progress.stat.activities')} />
        </div>
        {data ? <Heatmap days={data.days} /> : <Loading lines={2} />}
      </section>

      <GoalPlanPanel />

      <SkillRatingsPanel reloadKey={moved ? `${moved.skill}:${moved.level}` : ''} />

      <div className="en-grid-2">
        <Panel title={t('progress.skills.title')}>
          <p className="hint">{t('progress.skills.lead')}</p>
          {progress.loading && !data ? <Loading lines={6} /> : null}
          {data ? (
            <div className="en-skill-rows">
              {SKILLS.map((skill) => {
                const row = data.skills.find((entry) => entry.skill === skill.key);
                if (!row) return null;
                return (
                  <div key={skill.key} className="en-skill-row">
                    <Link to={skill.path} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontWeight: 700, fontSize: '.9rem' }}>
                      <SkillDot skill={skill.key} />{t(`skill.${skill.key}`)}
                    </Link>
                    <div className="en-stack" style={{ gap: '.25rem' }}>
                      <ProgressBar
                        value={row.recent_accuracy ?? 0}
                        label={t('progress.skills.barLabel', { skill: t(`skill.${skill.key}`) })}
                        skill={skill.key}
                      />
                      <small>{skillNote(row, t)}</small>
                      {row.status === 'ready' && row.next_level ? (
                        <button
                          type="button"
                          className="quiet"
                          style={{ justifySelf: 'start', minHeight: 34 }}
                          disabled={moving !== null}
                          onClick={() => void moveUp(skill.key)}
                        >
                          {moving === skill.key ? t('common.saving') : t('progress.skills.moveUp', { level: row.next_level })}
                        </button>
                      ) : null}
                    </div>
                    {row.level ? <LevelBadge level={row.level} muted={row.activities === 0} /> : <Tag>—</Tag>}
                  </div>
                );
              })}
            </div>
          ) : null}
          {moved ? <p className="en-notice">{t('progress.skills.moved', { skill: t(`skill.${moved.skill}`), level: moved.level })}</p> : null}
          {moved ? <ShareCardButton card={{ kind: 'level_up', label: t('social.card.levelUp.label'), big: moved.level, headline: t('social.card.levelUp.headline', { skill: t(`skill.${moved.skill}`), level: moved.level }), detail: t('social.card.levelUp.detail') }} /> : null}
          {moveError ? <ErrorState error={moveError} /> : null}
          <p className="hint">{t('progress.skills.barExplain')}</p>
        </Panel>

        <Panel title={t('progress.history.title')}>
          {history.loading && !history.data ? <Loading lines={5} /> : null}
          {history.error ? <ErrorState error={history.error} onRetry={history.reload} /> : null}
          {history.data && history.data.attempts.length === 0 ? (
            <EmptyState title={t('progress.history.empty.title')} body={t('progress.history.empty.body')} action={<Link className="en-button" to="/today">{t('progress.history.empty.cta')}</Link>} />
          ) : null}
          {history.data?.attempts.length ? (
            <ul className="en-list">
              {history.data.attempts.slice(0, 20).map((attempt) => (
                <li key={attempt.id}>
                  <Link className="en-item" to={attempt.slug ? `/${attempt.skill}/${encodeURIComponent(attempt.slug)}` : `/${attempt.skill}`}>
                    <SkillDot skill={attempt.skill} />
                    <span className="en-item-main">
                      <strong>{attempt.title ?? t(`skill.${attempt.skill}`)}</strong>
                      <span>{t(`skill.${attempt.skill}`)} · {date(attempt.submitted_at, { dateStyle: 'medium' })}</span>
                    </span>
                    <span className="en-item-meta">
                      {attempt.level ? <LevelBadge level={attempt.level} muted /> : null}
                      {attempt.score !== null ? <Tag>{attempt.score}/100</Tag> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>

      <TrapsPanel />

      <BadgesPanel />

      {history.data ? <CanDoPanel level={placement?.level ?? null} history={history.data.attempts} /> : null}

      {data ? <LevelJourneyPanel history={data.level_history ?? []} check={data.level_check ?? null} /> : null}
    </>
  );
};
