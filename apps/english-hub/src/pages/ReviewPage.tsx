import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getProgress } from '../lib/hub';
import { handbookTopicHref } from '../lib/handbookSearch';
import { getReviewItems } from '../lib/review';
import { ReviewQuestions } from './ReviewQuestions';
import { L1Why } from '../components/L1Why';
import { getNotebook, reviewCard, type NotebookCard } from '../lib/notebook';
import { speak, canSpeak } from '../lib/speech';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, ProgressBar, SkillDot, useErrorMessage } from '../ui/kit';

/** One-card-at-a-time recall: see the word, try to recall, then reveal and grade. */
const Flashcards = ({ cards, onFinished }: { cards: NotebookCard[]; onFinished: (remembered: number) => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const card = cards[index];
  if (!card) return null;

  const grade = async (outcome: 'correct' | 'incorrect') => {
    setSaving(true);
    setError(null);
    try {
      await reviewCard(card.id, outcome);
      const nextRemembered = remembered + (outcome === 'correct' ? 1 : 0);
      setRemembered(nextRemembered);
      if (index + 1 >= cards.length) onFinished(nextRemembered);
      else {
        setIndex(index + 1);
        setRevealed(false);
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="en-stack">
      <div className="en-row">
        <span className="hint">{t('review.cardOf', { current: index + 1, total: cards.length })}</span>
        <span className="en-spacer" />
        <div style={{ flex: '0 1 14rem' }}><ProgressBar value={(index / cards.length) * 100} label={t('review.progress')} skill="vocabulary" /></div>
      </div>
      <div className="en-flashcard">
        <p className="eyebrow">{card.source_label ?? t('review.yourWord')}</p>
        <h2 lang="en">{card.word}</h2>
        {canSpeak() ? <button type="button" className="quiet" onClick={() => void speak(card.word)}>▶ {t('review.listen')}</button> : null}
        {!revealed ? (
          <>
            <p>{t('review.recallPrompt')}</p>
            <div className="en-actions"><button type="button" className="is-large" onClick={() => setRevealed(true)}>{t('review.reveal')}</button></div>
          </>
        ) : (
          <>
            {card.definition ? <p><strong>{card.definition}</strong></p> : null}
            {card.example || card.context_text ? <p lang="en"><em>“{card.example ?? card.context_text}”</em></p> : null}
            {!card.definition && !card.example && !card.context_text ? <p>{t('review.noDefinition')}</p> : null}
            <div className="en-actions">
              <button type="button" className="quiet is-large" disabled={saving} onClick={() => void grade('incorrect')}>{t('review.again')}</button>
              <button type="button" className="is-large" disabled={saving} onClick={() => void grade('correct')}>{t('review.gotIt')}</button>
            </div>
          </>
        )}
      </div>
      {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
    </div>
  );
};

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
            <Flashcards key={cards[0]?.id} cards={cards} onFinished={setFinished} />
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
