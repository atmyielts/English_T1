import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { getCatalog } from '../lib/hub';
import type { SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { ErrorState, FeedbackList, LevelBadge, Loading, LockedPanel, PageHeader, ScoreBadge, SkillDot, Tag } from '../ui/kit';
import { NewBadges } from '../components/Badges';
import { XpEarned } from '../components/XpWidgets';
import { pickNext } from './SkillHome';

/** Frame for one activity: back link, title, level and time, then the exercise. */
export const ActivityFrame = ({
  skill,
  title,
  level,
  minutes,
  lead,
  loading,
  error,
  onRetry,
  children,
}: {
  skill: SkillKey;
  title?: ReactNode;
  level?: string | null;
  minutes?: number | null;
  lead?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  children?: ReactNode;
}) => {
  const t = useT();
  const { access, canPractise, pricingHref } = useEnglish();
  // The activity's slug is the last part of /<skill>/<slug>.
  const { pathname } = useLocation();
  const slug = decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '') || null;
  const locked = !canPractise(skill, slug);
  const usingFree = access.status === 'ready' && !access.unlocked.has(skill) && access.freeLeft > 0;
  return (
    <>
      <PageHeader
        back={{ to: `/${skill}`, label: t(`skill.${skill}`) }}
        eyebrow={<span className="en-row" style={{ gap: '.4rem' }}><SkillDot skill={skill} />{t(`skill.${skill}`)}</span>}
        title={title ?? (loading ? '…' : t('activity.untitled'))}
        lead={lead}
        actions={(
          <span className="en-row">
            {level ? <LevelBadge level={level} /> : null}
            {minutes ? <Tag>{t('common.minutesShort', { count: minutes })}</Tag> : null}
          </span>
        )}
      />
      {locked ? <LockedPanel skillName={t(`skill.${skill}`)} pricingHref={pricingHref(skill)} freeUsed={access.freePerDay > 0} /> : null}
      {usingFree && !loading ? (
        <p className="en-notice">{t('free.usingToday', { count: access.freeLeft })} <a href={pricingHref(skill)}>{t('free.seePlans')}</a></p>
      ) : null}
      {!locked && loading ? <section className="en-panel"><Loading lines={6} /></section> : null}
      {!locked && error ? <ErrorState error={error} onRetry={onRetry} /> : null}
      {!locked && !loading && !error ? <div className="en-activity">{children}</div> : null}
    </>
  );
};

/** Finds the learner's next item in this skill, excluding the one just finished. */
const NextLink = ({ skill, currentSlug }: { skill: SkillKey; currentSlug?: string | null }) => {
  const t = useT();
  const { onboarding } = useEnglish();
  const catalog = useResource((signal) => getCatalog(skill, signal), [skill]);
  if (!catalog.data) return null;
  const level = onboarding.value?.perSkill[skill] ?? onboarding.value?.level ?? null;
  const next = pickNext(catalog.data.items.filter((item) => item.slug !== currentSlug), catalog.data.best_scores, level);
  if (!next) return null;
  return <Link className="en-button-quiet" to={`/${skill}/${encodeURIComponent(next.slug)}`}>{t('activity.next', { title: next.title })}</Link>;
};

/**
 * Result after submitting. `score` is 0..100. `good` and `fix` are short
 * learner-facing points; `children` holds skill-specific detail (answers, corrections).
 */
export const ResultPanel = ({
  skill,
  slug,
  score,
  summary,
  good = [],
  fix = [],
  onRetry,
  children,
  savedWords,
}: {
  skill: SkillKey;
  slug?: string | null;
  score: number | null;
  summary?: ReactNode;
  good?: ReactNode[];
  fix?: ReactNode[];
  onRetry?: () => void;
  children?: ReactNode;
  savedWords?: number;
}) => {
  const t = useT();
  const { refreshAccess } = useEnglish();
  // A free learner's allowance changes once an activity is submitted.
  useEffect(() => { void refreshAccess(); }, [refreshAccess]);
  return (
    <section className="en-panel" aria-live="polite">
      <div className="en-result">
        {score !== null ? <ScoreBadge score={score} /> : null}
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h2 style={{ margin: 0 }}>{t('activity.result.title')}</h2>
          {summary ? <p style={{ margin: 0 }}>{summary}</p> : null}
          <XpEarned skill={skill} slug={slug} />
          {savedWords ? <p className="en-notice">{t('activity.result.savedWords', { count: savedWords })}</p> : null}
        </div>
      </div>
      <div className="en-grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <FeedbackList title={t('activity.result.good')} items={good} tone="good" />
        <FeedbackList title={t('activity.result.fix')} items={fix} tone="fix" />
      </div>
      <NewBadges showLink />
      {children}
      <div className="en-actions">
        <Link className="en-button" to="/today">{t('activity.result.today')}</Link>
        <NextLink skill={skill} currentSlug={slug} />
        {onRetry ? <button type="button" className="quiet" onClick={onRetry}>{t('activity.result.retry')}</button> : null}
      </div>
    </section>
  );
};

