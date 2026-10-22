import { useState, type FormEvent, type ReactNode } from 'react';
import {
  decodeGrammar,
  generateVocabInContext,
  type GrammarDecodeResponse,
  type VocabInContextResponse,
} from '../lib/ecosystemInsightsClient';
import { useT } from '../i18n';
import { Tag } from '../ui/kit';
import { ToolError, optionalLabel, useLearnerLevel, useToolRequest } from './aiToolShared';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Shows the passage with the practised words in bold. */
const HighlightedPassage = ({ passage, words }: { passage: string; words: string[] }) => {
  if (!words.length) return <p className="en-passage">{passage}</p>;
  const pattern = new RegExp(`\\b(${words.map(escapeRegExp).join('|')})\\b`, 'gi');
  const wanted = new Set(words.map((w) => w.toLowerCase()));
  const parts: ReactNode[] = passage.split(pattern).map((part, index) =>
    wanted.has(part.toLowerCase()) ? <strong key={index}>{part}</strong> : <span key={index}>{part}</span>,
  );
  return <p className="en-passage">{parts}</p>;
};

// === Vocabulary in context ===

export const VocabInContextCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const level = useLearnerLevel();
  const [topic, setTopic] = useState('');
  const { data, busy, error, run } = useToolRequest<VocabInContextResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => generateVocabInContext({ topic: topic.trim() || undefined, target_level: level }));
  };

  if (!accessToken) return null;

  const showStory = Boolean(data && !data.empty && !data.fallback && data.passage);
  const showFallback = Boolean(data && !data.empty && (data.fallback || !data.passage));

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.vocab.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="vocab-story-topic" style={{ gap: '0.35rem' }}>
          {t('ai.vocab.topicLabel')}
          <input
            id="vocab-story-topic"
            type="text"
            value={topic}
            maxLength={120}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('ai.vocab.topicPlaceholder')}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>
            {busy ? t('ai.vocab.busy') : data ? t('ai.vocab.again') : t('ai.vocab.make')}
          </button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data?.empty ? (
          <div className="en-empty">
            <strong>{t('ai.vocab.emptyTitle')}</strong>
            <p>{t('ai.vocab.emptyBody')}</p>
          </div>
        ) : null}

        {showStory && data ? (
          <>
            <h3>{t('ai.vocab.storyHeading')}</h3>
            <HighlightedPassage passage={data.passage} words={data.words} />
            <h3>{t('ai.vocab.wordsHeading')}</h3>
            <ul className="en-list">
              {data.words.map((word) => {
                const meaning = data.translations[word.toLowerCase()]
                  ?? data.entries.find((e) => e.word.toLowerCase() === word.toLowerCase())?.definition
                  ?? '';
                return (
                  <li key={word} className="en-explain">
                    <strong>{word}</strong>{meaning ? ` — ${meaning}` : ''}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {showFallback && data ? (
          <>
            <p className="en-explain">{t('ai.vocab.fallbackNote')}</p>
            <h3>{t('ai.vocab.fallbackHeading')}</h3>
            <ul className="en-list">
              {data.entries.map((entry) => (
                <li key={entry.word} className="en-explain">
                  <strong>{entry.word}</strong>{entry.definition ? ` — ${entry.definition}` : ''}
                  <br />
                  <em>{entry.example || t('ai.vocab.noExample')}</em>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
};

// === Grammar decoder ===

export const GrammarDecoderCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
  const [sentence, setSentence] = useState('');
  const { data, busy, error, run, setError } = useToolRequest<GrammarDecodeResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = sentence.trim();
    if (clean.length < 5) {
      setError(t('ai.grammar.tooShort'));
      return;
    }
    void run(() => decodeGrammar(clean));
  };

  if (!accessToken) return null;

  return (
    <div className="en-stack">
      <p className="hint">{t('ai.grammar.intro')}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="grammar-decode-sentence" style={{ gap: '0.35rem' }}>
          {t('ai.grammar.label')}
          <textarea
            id="grammar-decode-sentence"
            value={sentence}
            maxLength={600}
            onChange={(e) => setSentence(e.target.value)}
            placeholder={t('ai.grammar.placeholder')}
            rows={3}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? t('ai.grammar.busy') : t('ai.grammar.explain')}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data && !data.fallback ? (
          <>
            {data.tense || data.voice || data.register ? (
              <div className="en-row">
                {data.tense ? <Tag>{t('ai.grammar.tense')}: {data.tense}</Tag> : null}
                {data.voice ? <Tag>{t('ai.grammar.voice')}: {data.voice}</Tag> : null}
                {data.register ? <Tag>{t('ai.grammar.style')}: {data.register}</Tag> : null}
              </div>
            ) : null}
            {data.clauses.length ? (
              <>
                <h3>{t('ai.grammar.partsHeading')}</h3>
                <ul className="en-list">
                  {data.clauses.map((clause, index) => (
                    <li key={index} className="en-explain">
                      <span className="eyebrow">{optionalLabel(t, `ai.grammar.role.${clause.role}`) || t('ai.grammar.role.main')}</span>
                      <br />
                      <strong>“{clause.text}”</strong>
                      {clause.function ? <><br />{clause.function}</> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {data.notes.length ? (
              <div className="en-feedback is-good">
                <h3>{t('ai.grammar.notesHeading')}</h3>
                <ul>{data.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
              </div>
            ) : null}
            {data.rephrasings.length ? (
              <>
                <h3>{t('ai.grammar.rephraseHeading')}</h3>
                <ul className="en-list">
                  {data.rephrasings.map((r, index) => (
                    <li key={index} className="en-explain">
                      <strong>“{r.text}”</strong>
                      {r.why_different ? <><br />{r.why_different}</> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}

        {data?.fallback ? (
          <>
            <p className="en-explain">{t('ai.grammar.fallbackNote')}</p>
            {data.signals.length ? (
              <ul className="en-list">
                {data.signals.map((signal, index) => (
                  <li key={index} className="en-explain">
                    <strong>{signal.label}</strong>: “{signal.match}”
                    <br />
                    {signal.tip}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{t('ai.grammar.noSignals')}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
