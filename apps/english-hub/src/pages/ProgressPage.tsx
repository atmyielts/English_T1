import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getDashboard, getHistory, type DashboardResponse } from '../lib/hub';
import { CEFR_LEVELS, SKILLS } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, ProgressBar, SkillDot, Stat, Tag } from '../ui/kit';

const WEEKS = 18;

const Heatmap = ({ days }: { days: NonNullable<DashboardResponse['activity']>['days'] }) => {
  const t = useT();
  const counts = new Map(days.map((day) => [day.date, day.events]));
  const end = new Date();
  // Align the grid so each column is one week ending today.
  const cells = Array.from({ length: WEEKS * 7 }, (_, index) => {
    const date = new Date(end.getTime() - (WEEKS * 7 - 1 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const count = counts.get(key) ?? 0;
    const level = count === 0 ? 0 : count < 2 ? 1 : count < 5 ? 2 : 3;
    return { key, count, level };
  });
  return (
    <div className="en-heatmap" role="img" aria-label={t('progress.heatmap.label', { weeks: WEEKS })}>
      {cells.map((cell) => <span key={cell.key} data-level={cell.level} title={`${cell.key}: ${cell.count}`} />)}
    </div>
  );
};

export const ProgressPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { onboarding } = useEnglish();
  const dashboard = useResource((signal) => getDashboard(signal), []);
  const history = useResource((signal) => getHistory(undefined, signal), []);
  const placement = onboarding.value;
  const estimates = dashboard.data?.cefr?.estimates ?? [];
  const activity = dashboard.data?.activity;

  return (
    <>
      <PageHeader
        eyebrow={t('progress.eyebrow')}
        title={t('progress.title')}
        lead={t('progress.lead')}
        actions={placement?.level ? <span className="en-row"><span className="hint">{t('progress.placement')}</span><LevelBadge level={placement.level} />{placement.targetLevel ? <><span aria-hidden="true">→</span><LevelBadge level={placement.targetLevel} muted /></> : null}</span> : null}
      />
      {dashboard.error ? <ErrorState error={dashboard.error} onRetry={dashboard.reload} /> : null}

      <section className="en-panel">
        <div className="en-stats">
          <Stat label={t('progress.stat.streak')} value={activity ? t('progress.days', { count: activity.streak.current_days }) : '—'} hint={activity ? t('progress.stat.best', { count: activity.streak.longest_days }) : undefined} />
          <Stat label={t('progress.stat.week')} value={activity ? activity.totals.last_7_days : '—'} hint={t('progress.stat.activities')} />
          <Stat label={t('progress.stat.month')} value={activity ? activity.totals.last_30_days : '—'} hint={t('progress.stat.activities')} />
          <Stat label={t('progress.stat.all')} value={activity ? activity.totals.all_time : '—'} hint={t('progress.stat.activities')} />
        </div>
        {activity ? <Heatmap days={activity.days} /> : <Loading lines={2} />}
      </section>

      <div className="en-grid-2">
        <Panel title={t('progress.skills.title')} aside={<span>{t('progress.skills.scale')}</span>}>
          <p className="hint">{t('progress.skills.lead')}</p>
          {dashboard.loading && !dashboard.data ? <Loading lines={6} /> : null}
          <div className="en-skill-rows">
            {SKILLS.map((skill) => {
              const estimate = estimates.find((entry) => entry.skill === skill.key);
              const measured = Boolean(estimate && estimate.sample_count > 0);
              const baseline = placement?.perSkill[skill.key] ?? placement?.level ?? null;
              const shown = measured ? estimate!.level : baseline;
              const position = shown ? ((CEFR_LEVELS.indexOf(shown) + 1) / CEFR_LEVELS.length) * 100 : 0;
              return (
                <div key={skill.key} className="en-skill-row">
                  <span><SkillDot skill={skill.key} />{t(`skill.${skill.key}`)}</span>
                  <div className="en-stack" style={{ gap: '.25rem' }}>
                    <ProgressBar value={position} label={t('progress.skills.barLabel', { skill: t(`skill.${skill.key}`) })} skill={skill.key} />
                    <small>
                      {measured
                        ? t('progress.skills.measured', { count: estimate!.sample_count, confidence: t(`progress.confidence.${estimate!.confidence}`) })
                        : baseline ? t('progress.skills.fromPlacement') : t('progress.skills.notMeasured')}
                    </small>
                  </div>
                  {shown ? <LevelBadge level={shown} muted={!measured} /> : <Tag>—</Tag>}
                </div>
              );
            })}
          </div>
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
