import React from 'react';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import type { LearnerState, Mode } from './api.ts';
import { useAppT, type AppKey } from './i18n/index.ts';
import { topicStrand, useTopicName } from './topics.ts';

/** Mastery heat-map: every topic with its level, grouped by strand in programme order. */
export function Progress({ state, start }: { state: LearnerState; start: (mode: Mode, topic?: string) => void }) {
  const t = useAppT(), { number } = useI18n(), name = useTopicName();
  const strands: string[] = [];
  for (const topic of state.topics) if (!strands.includes(topicStrand(topic.code))) strands.push(topicStrand(topic.code));
  return <>
    <div className="page-heading"><h1>{t('progress.title')}</h1></div>
    <p className="hint">{t('progress.lead')}</p>
    {strands.map((strand) => <section className="admission-card" key={strand} aria-labelledby={`strand-${strand}`}>
      <h2 id={`strand-${strand}`}>{t(`strand.${strand}` as AppKey)}</h2>
      <ul className="topic-list">{state.topics.filter((topic) => topicStrand(topic.code) === strand).map((topic) => {
        const percent = Math.round(topic.level * 100);
        return <li key={topic.code}>
          <div className="topic-name"><strong>{name(topic.code)}</strong><span>{topic.attempts ? t('progress.attempts', { count: number(topic.attempts) }) : t('progress.notStarted')}{topic.due && <> · <em>{t('progress.due')}</em></>}</span></div>
          <div className="topic-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={name(topic.code)}>
            <span style={{ width: `${percent}%` }} className={topic.attempts === 0 ? 'unknown' : percent >= 70 ? 'strong' : percent >= 45 ? 'middle' : 'weak'}/>
          </div>
          <span className="topic-percent">{topic.attempts ? `${percent}%` : '–'}</span>
          {topic.has_questions
            ? <button className="quiet" onClick={() => start(topic.due ? 'review' : 'practice', topic.code)}>{t('progress.practise')}</button>
            : <span className="topic-soon">{t('progress.soon')}</span>}
        </li>;
      })}</ul>
    </section>)}
  </>;
}
