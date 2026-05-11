import { useState } from 'react';
import {
  compareTranslations,
  extractIdioms,
  gradeEssay,
  type CefrTargetLevel,
  type EssayGradeResponse,
  type IdiomExtractResponse,
  type TranslationCompareResponse,
} from '../lib/ecosystemInsightsClient';

interface Props {
  accessToken: string | null;
}

const CARD: React.CSSProperties = {
  margin: '24px 0',
  padding: 28,
  borderRadius: 24,
  background: 'rgba(253, 248, 241, 0.92)',
  border: '1px solid rgba(52, 38, 27, 0.2)',
  display: 'grid',
  gap: 16,
};

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#9c2c1a',
  margin: 0,
};

const TITLE: React.CSSProperties = {
  fontFamily: 'Outfit, sans-serif',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  margin: '4px 0 6px',
};

const SOLID_BTN: React.CSSProperties = {
  padding: '10px 18px',
  border: 'none',
  borderRadius: 8,
  background: '#9c2c1a',
  color: 'white',
  fontWeight: 600,
};

const CEFR_LEVELS: CefrTargetLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const CEFR_TONE: Record<string, string> = {
  A1: '#94a3b8',
  A2: '#64748b',
  B1: '#9c2c1a',
  B2: '#166534',
  C1: '#b08020',
  C2: '#7c2d12',
};

const REGISTER_TONE: Record<string, string> = {
  formal: '#1f3a8a',
  academic: '#1f3a8a',
  literary: '#7c2d12',
  neutral: '#9c2c1a',
  conversational: '#0f5752',
  informal: '#b08020',
};

const aiNote = (status: string, provider?: string, error?: string | null) => {
  if (status === 'ok') return null;
  return (
    <p style={{ marginTop: 8, fontSize: 12, color: '#9b2c2c' }}>
      {status === 'unconfigured'
        ? `${provider ?? 'AI'} provider not configured.`
        : `AI call failed (${provider ?? 'AI'}): ${error ?? 'unknown'}`}
    </p>
  );
};

// === Tier B #11 — AI essay grader (CEFR-aligned, general English) ===

export const EssayGraderCard = ({ accessToken }: Props) => {
  const [text, setText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetLevel, setTargetLevel] = useState<CefrTargetLevel>('B2');
  const [data, setData] = useState<EssayGradeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grade = async () => {
    if (!accessToken) return;
    if (text.trim().length < 40) {
      setError('Paste a real response (at least 40 characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await gradeEssay(accessToken, { text: text.trim(), target_level: targetLevel, prompt: prompt.trim() || undefined });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grade essay');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>AI · essay grader (CEFR)</p>
        <h2 style={TITLE}>Get your writing scored against your target level</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          Per-criterion CEFR levels (Task / Coherence / Range / Accuracy), strengths, improvements,
          one concrete next step, and a short rewrite of the most pivotal sentences at your target level.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 6px' }}>Target level</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {CEFR_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setTargetLevel(lvl)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--card-border, #e8e2d0)',
                  borderRadius: 6,
                  background: targetLevel === lvl ? CEFR_TONE[lvl] : '#fbfaf6',
                  color: targetLevel === lvl ? 'white' : '#1a1814',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Optional prompt the response is answering"
        style={{ width: '100%' }}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the response to grade (at least 40 characters)"
        rows={8}
        style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div>
        <button type="button" onClick={() => void grade()} disabled={busy} style={SOLID_BTN}>
          {busy ? 'Grading…' : 'Grade response'}
        </button>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
            <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, color: CEFR_TONE[String(data.overall_level)] ?? '#9c2c1a' }}>
              {data.overall_level}
            </strong>
            <span style={{ color: '#7a7263', fontSize: 14 }}>
              overall · target {data.target_level} · {data.word_count} words
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {(['task', 'coherence', 'range', 'accuracy'] as const).map((key) => {
              const c = data.criteria[key];
              const tone = CEFR_TONE[c?.level ?? ''] ?? '#9c2c1a';
              return (
                <article key={key} style={{ padding: 12, background: '#fbfaf6', border: '1px solid #e8e2d0', borderLeft: `3px solid ${tone}`, borderRadius: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tone, margin: 0 }}>
                    {key} · {c?.level ?? '—'}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#3b352a', lineHeight: 1.55 }}>{c?.comment ?? ''}</p>
                </article>
              );
            })}
          </div>
          {data.strengths.length > 0 ? (
            <div>
              <p style={EYEBROW}>Strengths</p>
              <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px' }}>
                {data.strengths.map((s, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 3 }}>{s}</li>)}
              </ul>
            </div>
          ) : null}
          {data.improvements.length > 0 ? (
            <div>
              <p style={EYEBROW}>Improvements</p>
              <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px' }}>
                {data.improvements.map((s, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 3 }}>{s}</li>)}
              </ul>
            </div>
          ) : null}
          {data.actionable_next_step ? (
            <div style={{ padding: 12, background: 'color-mix(in srgb, #9c2c1a 6%, white)', borderLeft: '3px solid #9c2c1a', borderRadius: 8 }}>
              <p style={EYEBROW}>Next step</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.55 }}>{data.actionable_next_step}</p>
            </div>
          ) : null}
          {data.rewrite_sample ? (
            <div>
              <p style={EYEBROW}>Pivotal sentence rewritten at your target</p>
              <p style={{ margin: '6px 0 0', fontSize: 14, fontStyle: 'italic', padding: 12, background: '#fbfaf6', borderRadius: 8, border: '1px solid #e8e2d0' }}>
                "{data.rewrite_sample}"
              </p>
            </div>
          ) : null}
          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier D #22 — Translation comparison ===

export const TranslationCompareCard = ({ accessToken }: Props) => {
  const [sourceText, setSourceText] = useState('');
  const [data, setData] = useState<TranslationCompareResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = async () => {
    if (!accessToken) return;
    if (sourceText.trim().length < 3) {
      setError('Type a sentence in any language.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await compareTranslations(accessToken, { source_text: sourceText.trim() });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare translations');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>AI · translation comparison</p>
        <h2 style={TITLE}>One sentence → three English versions</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          Type a sentence in your native language. AI returns three distinct English translations
          across registers, with notes on what each version chooses to emphasise — useful for
          advanced learners refining nuance.
        </p>
      </div>
      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="e.g., Я бы предпочёл, чтобы ты сначала прочитал инструкцию."
        rows={3}
        style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div>
        <button type="button" onClick={() => void compare()} disabled={busy} style={SOLID_BTN}>
          {busy ? 'Translating…' : 'Compare translations'}
        </button>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: 12, color: '#7a7263', margin: 0 }}>
            Detected source: <strong>{data.detected_language}</strong>
          </p>
          {data.translations.map((t, i) => {
            const tone = REGISTER_TONE[t.register.toLowerCase()] ?? '#9c2c1a';
            return (
              <article key={i} style={{ padding: 14, background: '#fbfaf6', border: '1px solid #e8e2d0', borderLeft: `3px solid ${tone}`, borderRadius: 8 }}>
                <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: tone, margin: 0, fontWeight: 700 }}>
                  {t.register}
                </p>
                <p style={{ margin: '6px 0 6px', fontSize: 15.5, fontStyle: 'italic' }}>"{t.text}"</p>
                <p style={{ margin: 0, fontSize: 13, color: '#3b352a' }}>{t.style_note}</p>
              </article>
            );
          })}
          {data.nuance_summary ? (
            <p style={{ fontSize: 13.5, color: '#3b352a', lineHeight: 1.55, fontStyle: 'italic', borderTop: '1px solid #e8e2d0', paddingTop: 12, margin: 0 }}>
              {data.nuance_summary}
            </p>
          ) : null}
          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier C #17 — Idiom & collocation explorer ===

export const IdiomExplorerCard = ({ accessToken }: Props) => {
  const [sourceText, setSourceText] = useState('');
  const [targetLevel, setTargetLevel] = useState<CefrTargetLevel>('B2');
  const [data, setData] = useState<IdiomExtractResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = async () => {
    if (!accessToken) return;
    if (sourceText.trim().length < 30) {
      setError('Paste at least a paragraph (30+ characters).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await extractIdioms(accessToken, { source_text: sourceText.trim(), target_level: targetLevel });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extract idioms');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>AI · idioms & collocations</p>
        <h2 style={TITLE}>Pull the natural phrasing out of any English text</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          Paste an article, podcast transcript, or dialogue. AI extracts the most teaching-worthy
          idioms (fixed expressions) and collocations (strong word pairings), each with meaning,
          register, and a fresh example sentence.
        </p>
      </div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 6px' }}>Reader level</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {CEFR_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setTargetLevel(lvl)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--card-border, #e8e2d0)',
                borderRadius: 6,
                background: targetLevel === lvl ? CEFR_TONE[lvl] : '#fbfaf6',
                color: targetLevel === lvl ? 'white' : '#1a1814',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Paste an English passage of any length (article, transcript, dialogue)…"
        rows={6}
        style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div>
        <button type="button" onClick={() => void extract()} disabled={busy} style={SOLID_BTN}>
          {busy ? 'Extracting…' : 'Extract phrases'}
        </button>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {data.idioms.length > 0 ? (
            <div>
              <p style={EYEBROW}>Idioms</p>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                {data.idioms.map((it, i) => {
                  const tone = REGISTER_TONE[it.register.toLowerCase()] ?? '#9c2c1a';
                  return (
                    <li key={i} style={{ padding: 12, background: '#fbfaf6', border: '1px solid #e8e2d0', borderLeft: `3px solid ${tone}`, borderRadius: 8 }}>
                      <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16 }}>{it.phrase}</strong>
                      <p style={{ margin: '4px 0 4px', fontSize: 13.5 }}>{it.meaning}</p>
                      <p style={{ margin: 0, fontSize: 12.5, color: '#7a7263', fontStyle: 'italic' }}>
                        <span style={{ color: tone, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 6 }}>
                          {it.register}
                        </span>
                        e.g. "{it.example}"
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {data.collocations.length > 0 ? (
            <div>
              <p style={EYEBROW}>Collocations</p>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {data.collocations.map((c, i) => (
                  <li key={i} style={{ padding: 10, background: '#fbfaf6', border: '1px solid #e8e2d0', borderRadius: 8 }}>
                    <strong style={{ fontSize: 14 }}>{c.phrase}</strong>
                    <span style={{ color: '#7a7263', fontSize: 11, marginLeft: 6 }}>{c.type.replace(/_/g, '+')}</span>
                    <p style={{ margin: '4px 0 4px', fontSize: 13 }}>{c.meaning}</p>
                    {c.example ? (
                      <p style={{ margin: 0, fontSize: 12.5, color: '#7a7263', fontStyle: 'italic' }}>"{c.example}"</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.cultural_notes.length > 0 ? (
            <div>
              <p style={EYEBROW}>Cultural notes</p>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {data.cultural_notes.map((n, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#3b352a', lineHeight: 1.5 }}>· {n}</li>
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
