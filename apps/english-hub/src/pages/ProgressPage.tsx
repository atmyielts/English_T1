import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getHistory, getProgress, type ProgressResponse, type SkillProgress } from '../lib/hub';
import { nextLevel, SKILLS } from '../lib/skills';
import { useResource } from '../lib/useResource';
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
  if (row.level && row.attempts_at_level >= 3 && (row.accuracy_at_level ?? 0) >= 85) {
    return t('progress.skills.readyNext', { level: nextLevel(row.level) });
  }
  if (row.accuracy_at_level !== null) {
    return t('progress.skills.atLevel', { score: row.accuracy_at_level, count: row.attempts_at_level });
  }
  return t('progress.skills.activities', { count: row.activities });
};

export const ProgressPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { onboarding } = useEnglish();
  const progress = useResource((signal) => getProgress(signal), []);
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
                  <Link key={skill.key} to={skill.path} className="en-skill-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span><SkillDot skill={skill.key} />{t(`skill.${skill.key}`)}</span>
                    <div className="en-stack" style={{ gap: '.25rem' }}>
                      <ProgressBar
                        value={row.recent_accuracy ?? 0}
                        label={t('progress.skills.barLabel', { skill: t(`skill.${skill.key}`) })}
                        skill={skill.key}
                      />
                      <small>{skillNote(row, t)}</small>
                    </div>
                    {row.level ? <LevelBadge level={row.level} muted={row.activities === 0} /> : <Tag>—</Tag>}
                  </Link>
                );
              })}
            </div>
          ) : null}
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

      <Panel title={t('progress.retake.title')}>
        <p>{t('progress.retake.body')}</p>
        <div className="en-actions"><Link className="en-button-quiet" to="/settings">{t('progress.retake.cta')}</Link></div>
      </Panel>
    </>
  );
};
