import { Link, useSearchParams } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import { getJourney, type JourneyEvent, type JourneySummary } from '../lib/glue';
import { SKILLS, type SkillKey } from '../lib/skills';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Segmented, SkillDot, Stat, Tag } from '../ui/kit';
import '../components/glue.css';

type T = ReturnType<typeof useT>;

const isSkill = (value: string | null): value is SkillKey => SKILLS.some((skill) => skill.key === value);

/** One line saying what happened. */
const eventTitle = (event: JourneyEvent, t: T): string => {
  const skillName = event.skill ? t(`skill.${event.skill}`) : '';
  switch (event.kind) {
    case 'activity':
      return event.title ?? skillName;
    case 'roleplay':
      return t('glue.journey.roleplay', { title: event.title ?? '' });
    case 'mock':
      return t('glue.journey.mock');
    case 'review':
      return t('glue.journey.review', { count: event.count ?? 0 });
    case 'telegram_quiz':
      return t('glue.journey.quiz', { count: event.count ?? 0 });
    case 'words':
      return t('glue.journey.words', { count: event.count ?? 0 });
    case 'placement':
      return t('glue.journey.placement', { level: event.levels?.to ?? '—' });
    case 'check':
      return t('glue.journey.check', { from: event.levels?.from ?? '—', to: event.levels?.to ?? '—' });
    case 'level_up': {
      const skill = event.skill ?? event.levels?.skills[0] ?? null;
      const level = skill ? event.levels?.per_skill[skill] ?? event.levels?.to : event.levels?.to;
      return skill ? t('glue.journey.levelUpSkill', { skill: t(`skill.${skill}`), level: level ?? '—' }) : t('glue.journey.levelUp', { level: level ?? '—' });
    }
    case 'badge':
      return t('glue.journey.badge', { badge: event.badge ? t(`xp.badge.${event.badge}.title`) : '' });
    case 'certificate':
      return t('glue.journey.certificate', { level: event.level ?? '—' });
    default:
      return skillName;
  }
};

/** The small facts after the title: skill, goals, right answers. */
const eventDetail = (event: JourneyEvent, t: T): string[] => {
  const parts: string[] = [];
  if (event.kind === 'activity' && event.skill) parts.push(t(`skill.${event.skill}`));
  if (event.kind === 'roleplay' && event.goals) parts.push(t('glue.journey.goals', { met: event.goals.met, total: event.goals.total }));
  if ((event.kind === 'review' || event.kind === 'telegram_quiz') && event.count) parts.push(t('glue.journey.right', { correct: event.correct ?? 0, total: event.count }));
  if (event.minutes) parts.push(t('common.minutesShort', { count: event.minutes }));
  return parts;
};

const DaySummaryLine = ({ summary }: { summary: JourneySummary }) => {
  const t = useT();
  const parts = [
    summary.activities ? t('glue.journey.sum.activities', { count: summary.activities }) : null,
    summary.minutes ? t('common.minutesShort', { count: summary.minutes }) : null,
    summary.reviews ? t('glue.journey.sum.reviews', { count: summary.reviews }) : null,
    summary.words ? t('glue.journey.sum.words', { count: summary.words }) : null,
    summary.average_score !== null ? t('glue.journey.sum.average', { score: summary.average_score }) : null,
  ].filter(Boolean);
  return (
    <p className="en-journey-daysum">
      <span>{parts.join(' · ')}</span>
      {summary.skills.length ? (
        <span className="en-journey-dots" aria-label={summary.skills.map((skill) => t(`skill.${skill}`)).join(', ')}>
          {summary.skills.map((skill) => <SkillDot key={skill} skill={skill} />)}
        </span>
      ) : null}
    </p>
  );
};

const EventRow = ({ event }: { event: JourneyEvent }) => {
  const t = useT();
  const { date } = useI18n();
  const detail = eventDetail(event, t);
  const body = (
    <>
      {event.skill ? <SkillDot skill={event.skill} /> : <span className={`en-journey-mark is-${event.kind}`} aria-hidden="true" />}
      <span className="en-item-main">
        <strong>{eventTitle(event, t)}</strong>
        <span>
          {date(event.at, { hour: '2-digit', minute: '2-digit' })}
          {detail.length ? ` · ${detail.join(' · ')}` : ''}
        </span>
      </span>
      <span className="en-item-meta">
        {event.channel === 'telegram' ? <Tag>{t('glue.journey.telegram')}</Tag> : null}
        {event.level && event.kind === 'activity' ? <LevelBadge level={event.level} muted /> : null}
        {event.kind === 'mock' && event.band !== null && event.band !== undefined ? <Tag>{t('glue.journey.band', { band: event.band.toFixed(1) })}</Tag> : null}
        {event.kind !== 'mock' && event.score !== null ? <Tag>{event.score}/100</Tag> : null}
      </span>
    </>
  );
  return <li>{event.href ? <Link className="en-item" to={event.href}>{body}</Link> : <div className="en-item">{body}</div>}</li>;
};

/** /journey: one timeline of everything the learner did, across skills and devices, a week at a time. */
export const JourneyPage = () => {
  const t = useT();
  const { locale, date } = useI18n();
  const [params, setParams] = useSearchParams();
  const week = params.get('week');
  const skillParam = params.get('skill');
  const skill = isSkill(skillParam) ? skillParam : null;
  const journey = useResource((signal) => getJourney({ week, skill, locale }, signal), [week, skill, locale]);
  const data = journey.data;

  const go = (patch: { week?: string | null; skill?: SkillKey | null }) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: false });
  };

  const range = data
    ? `${date(`${data.start_date}T12:00:00`, { day: 'numeric', month: 'short' })} – ${date(`${data.end_date}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '…';

  return (
    <>
      <PageHeader
        back={{ to: '/progress', label: t('nav.progress') }}
        eyebrow={t('glue.journey.eyebrow')}
        title={t('glue.journey.title')}
        lead={t('glue.journey.lead')}
      />

      <Panel>
        <div className="en-journey-controls">
          <nav className="en-journey-weeks" aria-label={t('glue.journey.weeks')}>
            <button type="button" className="quiet" disabled={!data?.prev_start} onClick={() => go({ week: data?.prev_start })}>
              ← <span>{t('glue.journey.prev')}</span>
            </button>
            <strong aria-live="polite">{range}</strong>
            <button type="button" className="quiet" disabled={!data?.next_start} onClick={() => go({ week: data?.next_start })}>
              <span>{t('glue.journey.next')}</span> →
            </button>
          </nav>
          <Segmented<'all' | SkillKey>
            label={t('glue.journey.filter')}
            value={skill ?? 'all'}
            options={[{ value: 'all', label: t('glue.journey.all') }, ...SKILLS.map((entry) => ({ value: entry.key, label: t(`skill.${entry.key}`) }))]}
            onChange={(value) => go({ skill: value === 'all' ? null : value })}
          />
        </div>

        {journey.loading && !data ? <Loading lines={5} /> : null}
        {journey.error && !data ? <ErrorState error={journey.error} onRetry={journey.reload} /> : null}

        {data ? (
          <div className="en-stats en-journey-totals">
            <Stat label={t('glue.journey.total.activities')} value={data.totals.activities} />
            <Stat label={t('glue.journey.total.minutes')} value={data.totals.minutes} />
            <Stat label={t('glue.journey.total.reviews')} value={data.totals.reviews} />
            <Stat label={t('glue.journey.total.words')} value={data.totals.words} />
            <Stat label={t('glue.journey.total.days')} value={`${data.totals.days_active}/7`} />
          </div>
        ) : null}
      </Panel>

      {data && !data.days.length ? (
        <Panel>
          <EmptyState
            title={data.first_at ? t('glue.journey.empty.title') : t('glue.journey.start.title')}
            body={data.first_at ? (skill ? t('glue.journey.empty.skill', { skill: t(`skill.${skill}`) }) : t('glue.journey.empty.body')) : t('glue.journey.start.body')}
            action={<Link className="en-button" to="/today">{t('glue.journey.empty.cta')}</Link>}
          />
        </Panel>
      ) : null}

      {data?.days.map((day) => (
        <Panel key={day.date} title={date(`${day.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <DaySummaryLine summary={day.summary} />
          <ul className="en-list en-journey-events">
            {day.events.map((event) => <EventRow key={event.id} event={event} />)}
          </ul>
        </Panel>
      ))}
    </>
  );
};
