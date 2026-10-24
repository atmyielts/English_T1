import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getProgress } from '../lib/hub';
import { handbookTopicHref } from '../lib/handbookSearch';
import { getReviewItems } from '../lib/review';
import { ReviewQuestions } from './ReviewQuestions';
import { L1Why } from '../components/L1Why';
import { getNotebook } from '../lib/notebook';
import { WordReview } from '../components/WordReview';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, SkillDot } from '../ui/kit';

export const ReviewPage = () => {
  const t = useT();
  const due = useResource((signal) => getNotebook('due', 20, signal), []);
  const progress = useResource((signal) => getProgress(signal), []);
  const questions = useResource((signal) => getReviewItems(signal), []);
  const [finished, setFinished] = useState<number | null>(null);
  const [questionsDone, setQuestionsDone] = useState<number | null>(null);
  const cards = due.data?.cards ?? [];
  const reviewItems = questions.data?.items ?? [];
  const mistakes = (progress.data?.mistakes ?? []).slice(0, 8);

  return (
    <>
      <PageHeader eyebrow={t('review.eyebrow')} title={t('review.title')} lead={t('review.lead')} />
      <div className="en-grid-2">
        <div className="en-stack">
        <Panel
          title={t('review.words.title')}
          aside={due.data ? <span>{t('review.words.count', { due: due.data.summary.due_count, total: due.data.summary.total_count })}</span> : null}
        >
          {due.loading && !due.data ? <Loading lines={4} /> : null}
          {due.error ? <ErrorState error={due.error} onRetry={due.reload} /> : null}
          {finished !== null ? (
            <EmptyState
              title={t('review.finished.title')}
              body={t('review.finished.body', { remembered: finished, total: cards.length })}
              action={<>
                <button type="button" onClick={() => { setFinished(null); due.reload(); }}>{t('review.finished.more')}</button>
                <Link className="en-button-quiet" to="/today">{t('review.finished.today')}</Link>
              </>}
            />
          ) : due.data && cards.length === 0 ? (
            <EmptyState
              title={due.data.summary.total_count > 0 ? t('review.none.title') : t('review.empty.title')}
              body={due.data.summary.total_count > 0 ? t('review.none.body') : t('review.empty.body')}
              action={<Link className="en-button-quiet" to="/vocabulary">{t('review.openNotebook')}</Link>}
            />
          ) : cards.length ? (
            <WordReview key={cards[0]?.id} cards={cards} onFinished={(remembered) => setFinished(remembered)} />
          ) : null}
        </Panel>

        <Panel
          title={t('review.questions.title')}
          aside={questions.data ? <span>{t('review.questions.count', { count: questions.data.due })}</span> : null}
        >
          <p className="hint">{t('review.questions.lead')}</p>
          {questions.loading && !questions.data ? <Loading lines={3} /> : null}
          {questions.error ? <ErrorState error={questions.error} onRetry={questions.reload} /> : null}
          {questionsDone !== null ? (
            <EmptyState
              title={t('review.questions.doneTitle')}
              body={t('review.questions.doneBody', { right: questionsDone, total: reviewItems.length })}
              action={<button type="button" onClick={() => { setQuestionsDone(null); questions.reload(); }}>{t('review.finished.more')}</button>}
            />
          ) : questions.data && reviewItems.length === 0 ? (
            <p>{t('review.questions.none')}</p>
          ) : reviewItems.length ? (
            <ReviewQuestions key={reviewItems[0]?.id} items={reviewItems} onFinished={setQuestionsDone} />
          ) : null}
        </Panel>
        </div>

        <Panel title={t('review.mistakes.title')}>
          <p className="hint">{t('review.mistakes.lead')}</p>
          {progress.loading && !progress.data ? <Loading lines={3} /> : null}
          {progress.error ? <ErrorState error={progress.error} onRetry={progress.reload} /> : null}
          {progress.data && mistakes.length === 0 ? <p>{t('review.mistakes.empty')}</p> : null}
          {mistakes.length ? (
            <ul className="en-list">
              {mistakes.map((mistake) => {
                const title = mistake.topic ? t(`topic.${mistake.topic}`) : mistake.examples[0];
                const target = mistake.lesson ? `/grammar/${encodeURIComponent(mistake.lesson.slug)}` : `/${mistake.skill}`;
                return (
                  <li key={mistake.key}>
                    <div className={`en-item ${mistake.status === 'improving' ? 'is-done' : ''}`.trim()}>
                      <SkillDot skill={mistake.skill} />
                      <span className="en-item-main">
                        <strong>{title}</strong>
                        {mistake.topic ? (
                          <span className="en-diff" lang="en">
                            {mistake.examples.map((example) => <span key={example} style={{ display: 'block' }}>{example}</span>)}
                          </span>
                        ) : null}
                        <span>
                          {mistake.status === 'improving' ? t('review.mistakes.practised') : t('review.mistakes.times', { count: mistake.count })}
                        </span>
                        <L1Why mistake={mistake.examples.find((example) => example.includes('→')) ?? null} topic={mistake.topic} />
                      </span>
                      <span className="en-item-meta">
                        {mistake.topic ? (
                          <Link className="en-button-quiet" to={handbookTopicHref(mistake.topic)}>{t('handbook.readRule')}</Link>
                        ) : null}
                        <Link className={mistake.status === 'open' && mistake.lesson ? 'en-button' : 'en-button-quiet'} to={target}>
                          {mistake.lesson ? t('review.mistakes.fix') : t('review.mistakes.practise')}
                        </Link>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Panel>
      </div>
    </>
  );
};
