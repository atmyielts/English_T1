import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useT } from '../../i18n';
import { getNotebook } from '../../lib/notebook';
import { useResource } from '../../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, SkillDot } from '../../ui/kit';
import { WordReview, type WordReviewMode } from '../../components/WordReview';

const MODES: WordReviewMode[] = ['cards', 'typed', 'listen'];

/**
 * Practise saved words: due words first; when nothing is due, the newest
 * words (an early review still counts, it just moves the word on less).
 */
export const VocabularyPractice = () => {
  const t = useT();
  const [params] = useSearchParams();
  const requested = params.get('mode') as WordReviewMode | null;
  const initialMode = requested && MODES.includes(requested) ? requested : 'typed';
  const [source, setSource] = useState<'due' | 'recent'>('due');
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState<{ remembered: number; total: number } | null>(null);
  const words = useResource((signal) => getNotebook(source, 20, signal), [source, round]);
  const cards = words.data?.cards ?? [];

  const again = () => {
    setFinished(null);
    setRound((value) => value + 1);
  };

  return (
    <>
      <PageHeader
        back={{ to: '/vocabulary', label: t('skill.vocabulary') }}
        eyebrow={<span className="en-row" style={{ gap: '.4rem' }}><SkillDot skill="vocabulary" />{t('skill.vocabulary')}</span>}
        title={t('depth.practice.title')}
        lead={t('depth.practice.lead')}
      />
      <Panel
        title={source === 'due' ? t('depth.practice.due') : t('depth.practice.recent')}
        aside={words.data ? <span>{t('review.words.count', { due: words.data.summary.due_count, total: words.data.summary.total_count })}</span> : null}
      >
        {words.loading && !words.data ? <Loading lines={4} /> : null}
        {words.error ? <ErrorState error={words.error} onRetry={words.reload} /> : null}
        {finished ? (
          <EmptyState
            title={t('review.finished.title')}
            body={t('review.finished.body', { remembered: finished.remembered, total: finished.total })}
            action={<>
              <button type="button" onClick={again}>{t('review.finished.more')}</button>
              <Link className="en-button-quiet" to="/today">{t('review.finished.today')}</Link>
            </>}
          />
        ) : words.data && cards.length === 0 ? (
          words.data.summary.total_count > 0 && source === 'due' ? (
            <EmptyState
              title={t('review.none.title')}
              body={t('depth.practice.noneDue')}
              action={<button type="button" onClick={() => setSource('recent')}>{t('depth.practice.practiseRecent')}</button>}
            />
          ) : (
            <EmptyState
              title={t('review.empty.title')}
              body={t('review.empty.body')}
              action={<Link className="en-button-quiet" to="/vocabulary">{t('review.openNotebook')}</Link>}
            />
          )
        ) : cards.length ? (
          <WordReview
            key={`${source}:${round}:${cards[0]?.id}`}
            cards={cards}
            initialMode={initialMode}
            onFinished={(remembered, total) => setFinished({ remembered, total })}
          />
        ) : null}
      </Panel>
    </>
  );
};
