import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getDailyStory, type DailyStoryResponse } from '../lib/dailyStory';
import { useResource, type Resource } from '../lib/useResource';
import { LevelBadge, Loading, Panel } from '../ui/kit';

const MAX_POLLS = 6;

/** While today's story is being written, ask again a few seconds later (a few times at most). */
export const useStoryPolling = (story: Resource<DailyStoryResponse>) => {
  const polls = useRef(0);
  const status = story.data?.status;
  const retryAfter = story.data?.retry_after_seconds ?? 4;
  const { reload } = story;
  useEffect(() => {
    if (status !== 'generating' || polls.current >= MAX_POLLS) return undefined;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      reload();
    }, Math.max(2, retryAfter) * 1000);
    return () => window.clearTimeout(timer);
  }, [status, retryAfter, reload]);
  return polls.current >= MAX_POLLS;
};

/** Minutes to read, at an easy pace. */
export const readMinutes = (words: number) => Math.max(1, Math.round(words / 110));

/**
 * Today: a short new story at the learner's level, with listening, tap to
 * translate and three questions on its own page. Self-contained: it loads its
 * own data and hides itself if the story is unavailable (e.g. Reading paused).
 */
export const DailyStoryCard = () => {
  const t = useT();
  const story = useResource((signal) => getDailyStory(null, signal), []);
  const gaveUp = useStoryPolling(story);
  const data = story.data;
  if (story.error || data?.status === 'failed' || (data?.status === 'generating' && gaveUp)) return null;
  const today = data?.story ?? null;
  return (
    <Panel title={t('depth.story.cardTitle')} aside={data ? <LevelBadge level={data.level} /> : null}>
      {!data ? <Loading lines={2} /> : null}
      {data?.status === 'generating' ? <p className="hint" style={{ margin: 0 }} role="status">{t('depth.story.writing')}</p> : null}
      {today ? (
        <>
          <p style={{ margin: 0 }}><strong lang="en">{today.title}</strong></p>
          <p className="hint" style={{ margin: 0 }}>
            {today.read
              ? t('depth.story.readResult', { correct: today.read.correct, total: today.read.total })
              : t('depth.story.cardBody', { minutes: readMinutes(today.word_count) })}
          </p>
          <div className="en-actions">
            <Link className={today.read ? 'en-button-quiet' : 'en-button'} to={`/stories/${encodeURIComponent(today.id)}`}>
              {today.read ? t('depth.story.readAgain') : t('depth.story.read')}
            </Link>
            <Link className="en-button-quiet" to="/stories">{t('depth.story.archive')}</Link>
          </div>
        </>
      ) : null}
    </Panel>
  );
};
