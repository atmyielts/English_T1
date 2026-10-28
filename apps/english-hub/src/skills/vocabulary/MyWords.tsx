import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, useT } from '../../i18n';
import { getNotebook, saveWords, type NotebookCard } from '../../lib/notebook';
import { useResource } from '../../lib/useResource';
import { EmptyState, ErrorState, Loading, Panel, Stat, Tag, useErrorMessage } from '../../ui/kit';
import { archiveWord } from './api';

const AddWordForm = ({ onAdded }: { onAdded: () => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const [word, setWord] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [added, setAdded] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = word.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      await saveWords([{ word: clean, definition: definition.trim() || null, example: example.trim() || null, source_type: 'manual' }]);
      setAdded(clean);
      setWord('');
      setDefinition('');
      setExample('');
      onAdded();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="vocab-add">
      <summary>{t('vocabulary.words.add.title')}</summary>
      <form className="en-stack vocab-add-form" onSubmit={(event) => void submit(event)}>
        <label className="vocab-field">
          <span>{t('vocabulary.words.add.word')}</span>
          <input type="text" lang="en" autoComplete="off" autoCapitalize="off" maxLength={80} required value={word} onChange={(event) => setWord(event.target.value)} />
        </label>
        <label className="vocab-field">
          <span>{t('vocabulary.words.add.definition')}</span>
          <input type="text" autoComplete="off" maxLength={240} value={definition} onChange={(event) => setDefinition(event.target.value)} />
        </label>
        <label className="vocab-field">
          <span>{t('vocabulary.words.add.example')}</span>
          <input type="text" lang="en" autoComplete="off" maxLength={240} value={example} onChange={(event) => setExample(event.target.value)} />
        </label>
        {error ? <div className="error" role="alert">{errorText(error)}</div> : null}
        {added ? <p className="en-notice" role="status" style={{ margin: 0 }}>{t('vocabulary.words.add.done', { word: added })}</p> : null}
        <div className="en-actions">
          <button type="submit" disabled={busy || !word.trim()}>{busy ? t('vocabulary.words.add.saving') : t('vocabulary.words.add.submit')}</button>
        </div>
      </form>
    </details>
  );
};

/** How well the word is known, from its FSRS stability, and when it comes back. */
const WordStrength = ({ card }: { card: NotebookCard }) => {
  const t = useT();
  const { date } = useI18n();
  const stability = Number((card.srs as { s?: unknown } | null | undefined)?.s ?? Number.NaN);
  const level = !card.review_count ? 'new' : Number.isFinite(stability) ? (stability >= 21 ? 'strong' : stability >= 4 ? 'growing' : 'weak') : 'growing';
  return (
    <small className="hint">
      {t(`depth.strength.${level}`)} · {t('depth.strength.next', { date: date(card.next_review_at, { day: 'numeric', month: 'short' }) })}
    </small>
  );
};

const WordRow = ({ card, onRemoved }: { card: NotebookCard; onRemoved: (id: string) => void }) => {
  const t = useT();
  const errorText = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const source = card.source_label ?? (card.source_type === 'manual' ? t('vocabulary.words.addedByYou') : null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await archiveWord(card.id);
      onRemoved(card.id);
    } catch (cause) {
      setError(cause);
      setBusy(false);
    }
  };

  return (
    <li>
      <div className="en-item">
        <span className="en-item-main">
          <strong lang="en">{card.word}</strong>
          {card.definition ? <span lang="en">{card.definition}</span> : null}
          <WordStrength card={card} />
          {error ? <span className="error" role="alert">{errorText(error)}</span> : null}
        </span>
        <span className="en-item-meta">
          {source ? <Tag>{source}</Tag> : null}
          <button
            type="button"
            className="is-link"
            disabled={busy}
            aria-label={t('vocabulary.words.removeLabel', { word: card.word })}
            onClick={() => void remove()}
          >
            {t('vocabulary.words.remove')}
          </button>
        </span>
      </div>
    </li>
  );
};

/** The learner's own word list: what is due, a quick add, and the newest words. */
export const MyWordsPanel = () => {
  const t = useT();
  const notebook = useResource((signal) => getNotebook('recent', 20, signal), []);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const summary = notebook.data?.summary;
  const cards = (notebook.data?.cards ?? []).filter((card) => !removed.has(card.id));
  const removedCount = (notebook.data?.cards ?? []).length - cards.length;

  const onRemoved = (id: string) => {
    setRemoved((current) => new Set(current).add(id));
    notebook.reload();
  };

  return (
    <Panel title={t('vocabulary.words.title')}>
      <p className="hint">{t('vocabulary.words.lead')}</p>
      {notebook.loading && !notebook.data ? <Loading lines={3} /> : null}
      {notebook.error ? <ErrorState error={notebook.error} onRetry={notebook.reload} /> : null}
      {summary ? (
        <div className="en-row vocab-summary">
          <div className="en-stats" style={{ flex: '1 1 16rem' }}>
            <Stat label={t('vocabulary.words.due')} value={summary.due_count} />
            <Stat label={t('vocabulary.words.total')} value={Math.max(0, summary.total_count - removedCount)} />
          </div>
          <div className="en-actions">
            {summary.due_count > 0
              ? <Link className="en-button" to="/review">{t('vocabulary.words.reviewNow')}</Link>
              : <span className="hint">{t('vocabulary.words.nothingDue')}</span>}
            {summary.total_count > 0 ? <Link className="en-button-quiet" to="/vocabulary/practice?mode=typed">{t('depth.practice.typeCta')}</Link> : null}
            {summary.total_count > 0 ? <Link className="en-button-quiet" to="/vocabulary/practice?mode=listen">{t('depth.practice.listenCta')}</Link> : null}
          </div>
        </div>
      ) : null}

      <AddWordForm onAdded={notebook.reload} />

      {notebook.data && cards.length === 0 ? (
        <EmptyState title={t('vocabulary.words.empty.title')} body={t('vocabulary.words.empty.body')} />
      ) : null}
      {cards.length ? (
        <div className="en-stack" style={{ gap: '.5rem' }}>
          <h3 className="vocab-subhead">{t('vocabulary.words.recent')}</h3>
          <ul className="en-list">
            {cards.map((card) => <WordRow key={card.id} card={card} onRemoved={onRemoved} />)}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
};
