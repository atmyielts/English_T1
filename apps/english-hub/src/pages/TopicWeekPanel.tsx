import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getTopicWeek } from '../lib/hub';
import { useResource } from '../lib/useResource';
import { LevelBadge, Panel, ProgressBar, SkillDot, Tag } from '../ui/kit';

/** This week's theme: one activity per skill on the same topic, in a sensible order. */
export const TopicWeekPanel = () => {
  const t = useT();
  const week = useResource((signal) => getTopicWeek(signal), []);
  const data = week.data?.week;
  if (!data) return null;
  const done = data.steps.filter((step) => step.done).length;
  return (
    <Panel
      title={t('week.title', { topic: t(`week.topic.${data.topic}`) })}
      aside={<span>{t('week.progress', { done, total: data.steps.length })}</span>}
    >
      <p className="hint">{t('week.lead')}</p>
      <ProgressBar value={(done / data.steps.length) * 100} label={t('week.progressLabel')} />
      <ol className="en-list">
        {data.steps.map((step, index) => (
          <li key={step.content_item_id}>
            <Link className={`en-item ${step.done ? 'is-done' : ''}`.trim()} to={`/${step.skill}/${encodeURIComponent(step.slug)}`}>
              <span className={`en-check ${step.done ? 'is-done' : ''}`.trim()} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
              <span className="en-item-main">
                <span className="en-row" style={{ gap: '.4rem' }}>
                  <SkillDot skill={step.skill} />
                  <small style={{ fontWeight: 700, color: 'var(--muted)', fontSize: '.75rem' }}>{t(`skill.${step.skill}`)}</small>
                </span>
                <strong>{step.title}</strong>
              </span>
              <span className="en-item-meta">
                {step.level ? <LevelBadge level={step.level} muted /> : null}
                <Tag>{t('common.minutesShort', { count: step.minutes })}</Tag>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
};
