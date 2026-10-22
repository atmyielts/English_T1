import { useState, type FormEvent, type ReactNode } from 'react';
import {
  decodeGrammar,
  generateVocabInContext,
  type GrammarDecodeResponse,
  type VocabInContextResponse,
} from '../lib/ecosystemInsightsClient';
import { Tag } from '../ui/kit';
import { ToolError, useLearnerLevel, useToolRequest } from './aiToolShared';

const COPY = {
  vocab: {
    intro: 'Read your saved words in a short story at your level.',
    topicLabel: 'Topic (optional)',
    topicPlaceholder: 'For example: a trip to the bazaar',
    make: 'Make a story',
    again: 'Make another story',
    busy: 'Writing…',
    storyHeading: 'Your story',
    wordsHeading: 'Words in this story',
    fallbackNote: "Stories aren't available right now. Here are your words with examples instead.",
    fallbackHeading: 'Your words with examples',
    noExample: 'No example saved yet.',
    emptyTitle: 'No saved words yet',
    emptyBody: 'Save new words while you read or listen, then come back here.',
  },
  grammar: {
    intro: 'Paste a sentence you find hard. See how it is built.',
    label: 'Your sentence',
    placeholder: 'For example: Although it was raining, we walked to the market.',
    explain: 'Explain',
    busy: 'Explaining…',
    tooShort: 'Please write a full sentence first.',
    tense: 'Tense',
    voice: 'Voice',
    style: 'Style',
    partsHeading: 'Parts of the sentence',
    notesHeading: 'What to notice',
    rephraseHeading: 'Other ways to say it',
    fallbackNote: "Full explanations aren't available right now. Here are some things to notice in your sentence.",
    noSignals: "We couldn't find common patterns here. Try a longer sentence, or come back later for a full explanation.",
    roles: {
      main: 'Main part',
      subordinate: 'Extra part',
      relative: 'Describes a noun',
      noun: 'Works like a noun',
      adverbial: 'When, why or how',
      participial: '-ing / -ed part',
    } as Record<string, string>,
  },
};

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
      <p className="hint">{COPY.vocab.intro}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="vocab-story-topic" style={{ gap: '0.35rem' }}>
          {COPY.vocab.topicLabel}
          <input
            id="vocab-story-topic"
            type="text"
            value={topic}
            maxLength={120}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={COPY.vocab.topicPlaceholder}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>
            {busy ? COPY.vocab.busy : data ? COPY.vocab.again : COPY.vocab.make}
          </button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data?.empty ? (
          <div className="en-empty">
            <strong>{COPY.vocab.emptyTitle}</strong>
            <p>{COPY.vocab.emptyBody}</p>
          </div>
        ) : null}

        {showStory && data ? (
          <>
            <h3>{COPY.vocab.storyHeading}</h3>
            <HighlightedPassage passage={data.passage} words={data.words} />
            <h3>{COPY.vocab.wordsHeading}</h3>
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
            <p className="en-explain">{COPY.vocab.fallbackNote}</p>
            <h3>{COPY.vocab.fallbackHeading}</h3>
            <ul className="en-list">
              {data.entries.map((entry) => (
                <li key={entry.word} className="en-explain">
                  <strong>{entry.word}</strong>{entry.definition ? ` — ${entry.definition}` : ''}
                  <br />
                  <em>{entry.example || COPY.vocab.noExample}</em>
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
  const [sentence, setSentence] = useState('');
  const { data, busy, error, run, setError } = useToolRequest<GrammarDecodeResponse>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = sentence.trim();
    if (clean.length < 5) {
      setError(COPY.grammar.tooShort);
      return;
    }
    void run(() => decodeGrammar(clean));
  };

  if (!accessToken) return null;

  return (
    <div className="en-stack">
      <p className="hint">{COPY.grammar.intro}</p>
      <form onSubmit={submit}>
        <label className="en-stack" htmlFor="grammar-decode-sentence" style={{ gap: '0.35rem' }}>
          {COPY.grammar.label}
          <textarea
            id="grammar-decode-sentence"
            value={sentence}
            maxLength={600}
            onChange={(e) => setSentence(e.target.value)}
            placeholder={COPY.grammar.placeholder}
            rows={3}
          />
        </label>
        <div className="en-actions">
          <button type="submit" disabled={busy}>{busy ? COPY.grammar.busy : COPY.grammar.explain}</button>
        </div>
      </form>

      <div className="en-stack" aria-live="polite">
        <ToolError message={error} />
        {data && !data.fallback ? (
          <>
            {data.tense || data.voice || data.register ? (
              <div className="en-row">
                {data.tense ? <Tag>{COPY.grammar.tense}: {data.tense}</Tag> : null}
                {data.voice ? <Tag>{COPY.grammar.voice}: {data.voice}</Tag> : null}
                {data.register ? <Tag>{COPY.grammar.style}: {data.register}</Tag> : null}
              </div>
            ) : null}
            {data.clauses.length ? (
              <>
                <h3>{COPY.grammar.partsHeading}</h3>
                <ul className="en-list">
                  {data.clauses.map((clause, index) => (
                    <li key={index} className="en-explain">
                      <span className="eyebrow">{COPY.grammar.roles[clause.role] ?? COPY.grammar.roles.main}</span>
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
                <h3>{COPY.grammar.notesHeading}</h3>
                <ul>{data.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
              </div>
            ) : null}
            {data.rephrasings.length ? (
              <>
                <h3>{COPY.grammar.rephraseHeading}</h3>
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
            <p className="en-explain">{COPY.grammar.fallbackNote}</p>
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
              <p className="hint">{COPY.grammar.noSignals}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
