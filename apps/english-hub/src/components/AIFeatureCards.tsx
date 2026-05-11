import { useState } from 'react';
import {
  decodeGrammar,
  generateVocabInContext,
  type GrammarDecodeResponse,
  type VocabInContextResponse,
} from '../lib/ecosystemInsightsClient';

interface Props {
  accessToken: string | null;
}

const cardShell: React.CSSProperties = {
  margin: '24px 0',
  padding: 28,
  borderRadius: 24,
  background: 'rgba(253, 248, 241, 0.92)',
  border: '1px solid rgba(52, 38, 27, 0.2)',
  display: 'grid',
  gap: 16,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#9c2c1a',
  margin: 0,
};

const title: React.CSSProperties = {
  fontFamily: 'Outfit, sans-serif',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  margin: '4px 0 6px',
};

const aiNote = (status: string, provider?: string, error?: string | null) => {
  if (status === 'ok') return null;
  return (
    <p style={{ marginTop: 8, fontSize: 12, color: '#9b2c2c' }}>
      {status === 'unconfigured'
        ? `${provider ?? 'AI'} provider not configured — set ENGLISH_AI_PROVIDER + the matching API key on Supabase.`
        : `AI call failed (${provider ?? 'AI'}): ${error ?? 'unknown'}`}
    </p>
  );
};

// === Tier B #12 — Vocabulary in context ===

export const VocabInContextCard = ({ accessToken }: Props) => {
  const [topic, setTopic] = useState('');
  const [data, setData] = useState<VocabInContextResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateVocabInContext(accessToken, { topic: topic.trim() || undefined });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate passage');
    } finally {
      setBusy(false);
    }
  };

  const renderHighlightedPassage = () => {
    if (!data || !data.passage) return null;
    if (data.words.length === 0) return <p style={{ margin: 0 }}>{data.passage}</p>;
    // Highlight each word (case-insensitive). Build a regex from escaped words.
    const escaped = data.words
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
    const parts = data.passage.split(regex);
    return (
      <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.75, color: '#1a1814' }}>
        {parts.map((part, i) => {
          const isWord = data.words.some((w) => w.toLowerCase() === part.toLowerCase());
          if (!isWord) return <span key={i}>{part}</span>;
          return (
            <strong
              key={i}
              title={data.translations[part.toLowerCase()] ?? ''}
              style={{
                background: 'color-mix(in srgb, #9c2c1a 12%, transparent)',
                borderBottom: '2px solid #9c2c1a',
                padding: '0 2px',
                borderRadius: 2,
                cursor: 'help',
              }}
            >
              {part}
            </strong>
          );
        })}
      </p>
    );
  };

  if (!accessToken) return null;

  return (
    <section style={cardShell}>
      <div>
        <p style={eyebrow}>AI · vocab in context</p>
        <h2 style={title}>Read your weak words inside a real passage</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          Pulls your lowest-Leitner-box vocabulary and asks AI to weave them into a natural B2-level passage.
          Hover any highlighted word for its definition.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Optional topic (e.g., urban planning, trail running)"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderRadius: 8,
            background: '#9c2c1a',
            color: 'white',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Writing…' : data ? 'Regenerate' : 'Generate passage'}
        </button>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data?.message && !data.passage ? (
        <p style={{ color: '#7a7263', margin: 0 }}>{data.message}</p>
      ) : null}
      {data?.passage ? (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 8px' }}>
            Featured words: <span style={{ fontWeight: 500 }}>{data.words.join(' · ')}</span>
          </p>
          {renderHighlightedPassage()}
        </div>
      ) : null}
      {data ? aiNote(data.ai_status, data.ai_provider, data.ai_error) : null}
    </section>
  );
};

// === Tier B #14 — Grammar pattern decoder ===

const ROLE_TONES: Record<string, string> = {
  main: '#9c2c1a',
  subordinate: '#8a5a1b',
  relative: '#7c2d12',
  noun: '#1f3a8a',
  adverbial: '#581c87',
  participial: '#0f5752',
};

export const GrammarDecoderCard = ({ accessToken }: Props) => {
  const [sentence, setSentence] = useState('');
  const [data, setData] = useState<GrammarDecodeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decode = async () => {
    if (!accessToken) return;
    if (sentence.trim().length < 5) {
      setError('Paste a real sentence (at least 5 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await decodeGrammar(accessToken, sentence.trim());
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decode sentence');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <section style={cardShell}>
      <div>
        <p style={eyebrow}>AI · grammar pattern decoder</p>
        <h2 style={title}>Paste any sentence. See its grammar parsed.</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          Useful when you hit a sentence in reading or listening and can't quite see how it's
          built. AI returns the clause structure, tense, voice, register, and 2 alternate phrasings.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="e.g., Having spent the morning preparing for the meeting, she felt confident about the presentation she would deliver later."
          rows={3}
          style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
        />
        <div>
          <button
            type="button"
            onClick={() => void decode()}
            disabled={busy}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: 8,
              background: '#9c2c1a',
              color: 'white',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Decoding…' : 'Decode sentence'}
          </button>
        </div>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.tense ? (
              <span style={{ padding: '4px 10px', borderRadius: 999, background: '#fbfaf6', border: '1px solid #e8e2d0', fontSize: 12.5 }}>
                <strong>Tense:</strong> {data.tense}
              </span>
            ) : null}
            {data.voice ? (
              <span style={{ padding: '4px 10px', borderRadius: 999, background: '#fbfaf6', border: '1px solid #e8e2d0', fontSize: 12.5 }}>
                <strong>Voice:</strong> {data.voice}
              </span>
            ) : null}
            {data.register ? (
              <span style={{ padding: '4px 10px', borderRadius: 999, background: '#fbfaf6', border: '1px solid #e8e2d0', fontSize: 12.5 }}>
                <strong>Register:</strong> {data.register}
              </span>
            ) : null}
          </div>
          {data.clauses.length > 0 ? (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 8px' }}>
                Clause structure
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {data.clauses.map((c, i) => {
                  const tone = ROLE_TONES[c.role] ?? '#9c2c1a';
                  return (
                    <li
                      key={i}
                      style={{
                        padding: 12,
                        background: '#fbfaf6',
                        borderRadius: 8,
                        borderLeft: `3px solid ${tone}`,
                      }}
                    >
                      <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: tone, margin: '0 0 4px', fontWeight: 700 }}>
                        {c.role}
                      </p>
                      <p style={{ margin: '0 0 6px', fontStyle: 'italic', fontSize: 14 }}>"{c.text}"</p>
                      <p style={{ margin: 0, fontSize: 13, color: '#3b352a', lineHeight: 1.5 }}>{c.function}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {data.notes.length > 0 ? (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 6px' }}>
                What to notice
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {data.notes.map((n, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#3b352a', lineHeight: 1.5 }}>· {n}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.rephrasings.length > 0 ? (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 8px' }}>
                Alternate phrasings
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {data.rephrasings.map((r, i) => (
                  <li key={i} style={{ padding: 10, background: '#fbfaf6', borderRadius: 8, border: '1px solid #e8e2d0' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 14 }}>"{r.text}"</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#7a7263' }}>{r.why_different}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};
