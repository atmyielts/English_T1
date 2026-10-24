import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { SKILLS } from '../lib/skills';
import { getPublicProgress, parentBotUrl } from '../lib/social';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, Panel, Stat } from '../ui/kit';
import '../components/social.css';

/**
 * /p/:token — a learner's read-only progress for a parent or teacher, signed in
 * or not. First name, levels, streak, this week, badges and kinds of mistake
 * only; never an email or anything the learner wrote.
 */
export const PublicProgressPage = () => {
  const t = useT();
  const { date } = useI18n();
  const { session } = useEnglish();
  const { token = '' } = useParams();
  const resource = useResource((signal) => getPublicProgress(token, signal), [token]);
  const progress = resource.error ? null : resource.data?.progress ?? null;
  const notFound = resource.error instanceof ApiError && resource.error.status === 404;

  useEffect(() => {
    // Keep this page out of search results and link previews' indexes.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const title = progress?.first_name ? t('social.public.title', { name: progress.first_name }) : t('social.public.titleAnon');
  useEffect(() => {
    if (!progress) return;
    const previous = document.title;
    document.title = `${title} · Schood English`;
    return () => { document.title = previous; };
  }, [progress, title]);

  if (resource.loading && !progress) return <Panel><Loading lines={5} label={t('social.public.loading')} /></Panel>;
  if (notFound) {
    return (
      <Panel>
        <EmptyState
          title={t('social.public.notFound.title')}
          body={t('social.public.notFound.body')}
          action={<Link className="en-button" to={session ? '/today' : '/'}>{t('social.public.cta')}</Link>}
        />
      </Panel>
    );
  }
  if (resource.error || !progress) return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const levels = SKILLS.filter((skill) => progress.level.per_skill[skill.key]);
  const practised = SKILLS.filter((skill) => progress.week.by_skill[skill.key]);

  return (
    <div className="en-stack" style={{ width: '100%' }}>
      <section className="en-panel en-tone-lime">
        <p className="eyebrow">{t('social.public.eyebrow')}</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2.2rem)' }}>{title}</h1>
        <p style={{ marginBottom: 0 }}>{t('social.public.lead')}</p>
        <p className="hint" style={{ marginBottom: 0 }}>{t('social.public.updated', { date: date(progress.updated_at) })}</p>
      </section>

      <div className="en-grid-2">
        <Panel title={t('social.public.week')}>
          <div className="en-stats">
            <Stat label={t('social.public.minutes')} value={t('social.public.minutesValue', { count: progress.week.minutes })} />
            <Stat label={t('social.public.activities')} value={progress.week.activities} />
            <Stat label={t('social.public.activeDays')} value={t('social.public.activeDaysValue', { count: progress.week.active_days })} />
            <Stat label={t('social.public.streak')} value={t('social.public.days', { count: progress.streak })} />
          </div>
          {practised.length ? (
            <div className="en-pp-skills">
              {practised.map((skill) => <span key={skill.key} className="en-tag">{t(`skill.${skill.key}`)} · {progress.week.by_skill[skill.key]}</span>)}
            </div>
          ) : null}
        </Panel>

        <Panel title={t('social.public.levels')} aside={progress.level.overall ? <span className="en-row"><small>{t('social.public.overall')}</small><LevelBadge level={progress.level.overall} /></span> : null}>
          {levels.length ? (
            <ul className="en-pp-levels">
              {levels.map((skill) => (
                <li key={skill.key}><span>{t(`skill.${skill.key}`)}</span><LevelBadge level={progress.level.per_skill[skill.key]} /></li>
              ))}
            </ul>
          ) : <p className="hint">{t('social.public.noLevel')}</p>}
        </Panel>

        <Panel title={t('social.public.mistakes')}>
          {progress.mistakes.length ? (
            <ul className="en-pp-list">
              {progress.mistakes.map((mistake) => (
                <li key={mistake.kind === 'topic' ? mistake.topic : mistake.skill}>
                  {mistake.kind === 'topic' ? t(`topic.${mistake.topic}`) : t('social.public.mistakeSkill', { skill: t(`skill.${mistake.skill}`) })}
                  {' '}<small className="hint">({t('social.public.times', { count: mistake.count })})</small>
                </li>
              ))}
            </ul>
          ) : <p className="hint">{t('social.public.noMistakes')}</p>}
        </Panel>

        <Panel title={t('social.public.achievements')}>
          {progress.achievements.length ? (
            <ul className="en-pp-list">
              {progress.achievements.map((badge) => (
                <li key={badge.key}>{t(`xp.badge.${badge.key}.title`)} <small className="hint">· {date(badge.earned_at, { dateStyle: 'medium' })}</small></li>
              ))}
            </ul>
          ) : <p className="hint">{t('social.public.noAchievements')}</p>}
        </Panel>
      </div>

      <Panel>
        <div className="en-actions">
          <a className="en-button" href={parentBotUrl(token)} target="_blank" rel="noopener noreferrer">{t('social.public.telegram')}</a>
          {session ? null : <Link className="en-button-quiet" to="/">{t('social.public.cta')}</Link>}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>{t('social.public.telegramHint')}</p>
      </Panel>
    </div>
  );
};
