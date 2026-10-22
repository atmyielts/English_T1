import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getProgress } from '../lib/hub';
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
  const [finished, setFinished] = useState<number | null>(null);
  const cards = due.data?.cards ?? [];
  const mistakes = (progress.data?.mistakes ?? []).filter((mistake) => mistake.pattern).slice(0, 8);

  return (
    <>
      <PageHeader eyebrow={t('review.eyebrow')} title={t('review.title')} lead={t('review.lead')} />
      <div className="en-grid-2">
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

        <Panel title={t('review.mistakes.title')}>
          <p className="hint">{t('review.mistakes.lead')}</p>
          {progress.loading && !progress.data ? <Loading lines={3} /> : null}
          {progress.error ? <ErrorState error={progress.error} onRetry={progress.reload} /> : null}
          {progress.data && mistakes.length === 0 ? <p>{t('review.mistakes.empty')}</p> : null}
          {mistakes.length ? (
            <ul className="en-list">
              {mistakes.map((mistake) => (
                <li key={`${mistake.skill}-${mistake.pattern}`}>
                  <Link className="en-item" to={mistake.skill === 'writing' ? '/grammar' : `/${mistake.skill}`}>
                    <SkillDot skill={mistake.skill} />
                    <span className="en-item-main">
                      <strong>{mistake.pattern}</strong>
                      <span>{t(`skill.${mistake.skill}`)} · {t('review.mistakes.times', { count: mistake.count })}</span>
                    </span>
                    <span className="en-item-meta"><span className="en-button-quiet">{t('review.mistakes.practise')}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>
    </>
  );
};
