import { Link, useLocation } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getNext, invalidateNext, nextHref, type NextStep } from '../lib/engine';
import type { SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { LevelBadge, SkillDot, Tag } from '../ui/kit';
import '../engine.css';

type T = ReturnType<typeof useT>;

const stepTitle = (step: NextStep, t: T) =>
  step.kind === 'review' ? t('engine.next.reviewTitle', { count: step.due ?? 1 })
    : step.kind === 'practice' && step.href === '/speaking-mock' ? t('ws.mock')
      : step.reason === 'continue' && step.detail === 'mock' ? t('glue.resume.mock')
        : step.title;

/** One honest line: why this is the best next step. */
export const stepReason = (step: NextStep, t: T): string => {
  const skill = step.skill ? t(`skill.${step.skill}`) : '';
  switch (step.reason) {
    case 'continue':
      return step.detail === 'roleplay' ? t('glue.next.continueRoleplay')
        : step.detail === 'mock' ? t('glue.next.continueMock')
          : step.detail && /^\d+$/.test(step.detail) ? t('glue.next.continueProgress', { progress: step.detail })
            : t('glue.next.continue');
    case 'review_due':
      return t('engine.next.reason.review_due');
    case 'fix_mistake':
      return step.detail ? t('engine.next.reason.fix_mistake', { example: step.detail }) : t('engine.next.reason.fix_mistake.plain');
    case 'weakest_skill': {
      const rating = step.rating;
      if (!rating?.level || rating.progress === null) return t('engine.next.reason.weakest_skill.plain', { skill });
      return step.target_level
        ? t('engine.next.reason.weakest_skill', { skill, level: rating.level, progress: rating.progress, target: step.target_level })
        : t('engine.next.reason.weakest_skill.noGoal', { skill, level: rating.level, progress: rating.progress });
    }
    case 'today_plan':
      return t('engine.next.reason.today_plan');
    case 'class_assignment':
      return step.assignment
        ? t('classes.next.reason', { className: step.assignment.class_name, done: step.assignment.done, required: step.assignment.required })
        : t('classes.next.reasonPlain');
    default:
      return t('engine.next.reason.keep_going', { skill });
  }
};

/** A suggestion in a skill the learner has not unlocked, shown as optional. */
const LockedHint = ({ step }: { step: NextStep }) => {
  const t = useT();
  const { pricingHref } = useEnglish();
  if (!step.skill) return null;
  const skill = t(`skill.${step.skill}`);
  return (
    <p className="en-upnext-locked">
      {t('engine.next.locked', { title: step.title, skill })}{' '}
      <a href={pricingHref(step.skill)}>{t('engine.next.lockedCta', { skill })}</a>
    </p>
  );
};

/**
 * "Up next" on an activity result: the best step across all skills (with the
 * reason), next to the same-skill link. Asks fresh, since the activity just
 * finished changes the answer.
 */
export const UpNextCard = ({ skill, slug }: { skill: SkillKey; slug?: string | null }) => {
  const t = useT();
  const { locale } = useI18n();
  const next = useResource(
    (signal) => {
      invalidateNext();
      return getNext({ from: skill, after: slug ? { skill, slug } : null, locale }, signal);
    },
    [skill, slug, locale],
  );
  if (next.loading && !next.data) return <p className="hint" aria-live="polite">{t('engine.next.loading')}</p>;
  // The result screen still works without it; the same-skill link stays.
  if (!next.data) return null;
  const { step, locked } = next.data;
  if (!step) {
    return (
      <div className="en-upnext">
        <p className="en-upnext-label">{t('engine.next.label')}</p>
        <p style={{ margin: 0 }}>{t('engine.next.none')}</p>
        {locked ? <LockedHint step={locked} /> : null}
      </div>
    );
  }
  const href = nextHref(step);
  return (
    <div className="en-upnext">
      <p className="en-upnext-label">{t('engine.next.label')}</p>
      <div className="en-upnext-row">
        <Link className="en-upnext-main" to={href}>
          <span className="en-row" style={{ gap: '.4rem' }}>
            {step.skill ? <SkillDot skill={step.skill} /> : null}
            <small>{step.skill ? t(`skill.${step.skill}`) : t('nav.review')}</small>
            {step.level ? <LevelBadge level={step.level} muted /> : null}
            <Tag>{t('common.minutesShort', { count: step.minutes })}</Tag>
          </span>
          <strong>{stepTitle(step, t)}</strong>
          <span>{stepReason(step, t)}{step.uses_free ? ` ${t('engine.next.usesFree')}` : ''}</span>
        </Link>
        <Link className="en-button" to={href}>{t('engine.next.start')}</Link>
      </div>
      {locked ? <LockedHint step={locked} /> : null}
    </div>
  );
};

/** A slim "Up next" line at the top of every skill page, so the next step is one tap away in any skill. */
export const UpNextStrip = ({ skill }: { skill: SkillKey }) => {
  const t = useT();
  const location = useLocation();
  const { onboarding } = useEnglish();
  const { locale } = useI18n();
  const placed = onboarding.value?.placementDone ?? false;
  const next = useResource((signal) => getNext({ from: skill, locale }, signal), [skill, location.pathname, locale], placed);
  const step = next.data?.step;
  if (!placed || !step) return null;
  const href = nextHref(step);
  // Already on that page: nothing to point to.
  if (decodeURIComponent(location.pathname) === decodeURIComponent(href)) return null;
  return (
    <nav className="en-upnext-strip" aria-label={t('engine.next.label')}>
      <span className="en-upnext-label">{t('engine.next.label')}</span>
      {step.skill ? <SkillDot skill={step.skill} /> : null}
      <span className="en-upnext-strip-copy">
        <strong>{stepTitle(step, t)}</strong>
        <small>{stepReason(step, t)}</small>
      </span>
      <Link className="en-button-quiet" to={href}>{t('engine.next.go')}</Link>
    </nav>
  );
};
