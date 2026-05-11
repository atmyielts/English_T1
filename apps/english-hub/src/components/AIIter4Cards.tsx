import { useEffect, useMemo, useRef, useState } from 'react';
import {
  extractCulturalNotes,
  generateDailyChallenge,
  generateDictation,
  type CefrTargetLevel,
  type CulturalNotesResponse,
  type DailyChallengeResponse,
  type DailyChallengeTask,
  type DictationGenerateResponse,
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

const GHOST_BTN: React.CSSProperties = {
  padding: '10px 18px',
  border: '1px solid #c9c0a8',
  borderRadius: 8,
  background: '#ffffff',
  color: '#1a1814',
  fontWeight: 600,
};

const CEFR_LEVELS: CefrTargetLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const SKILL_TONE: Record<string, string> = {
  reading: '#1f3a8a',
  writing: '#8a5a1b',
  listening: '#0f5752',
  speaking: '#7c2d12',
  grammar: '#581c87',
  vocabulary: '#9c2c1a',
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

// === Tier B #13 — Listening dictation drill ===
// Uses the browser's SpeechSynthesis API for audio. AI generates the
// passage; the browser speaks it; the learner types what they hear; we
// score locally (case + terminal-punctuation tolerant) and surface
// per-token diff.

interface VoiceOption {
  name: string;
  lang: string;
}

const usableVoices = (): VoiceOption[] => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .map((v) => ({ name: v.name, lang: v.lang }));
};

const normalizeForCompare = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[.,!?;:"'()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (s: string): string[] => normalizeForCompare(s).split(' ').filter(Boolean);

const scoreDictation = (target: string, typed: string): { matched: number; total: number; tokens: Array<{ word: string; ok: boolean }> } => {
  const targetTokens = tokenize(target);
  const typedTokens = tokenize(typed);
  const typedSet = new Set(typedTokens);
  let matched = 0;
  const tokens = targetTokens.map((w) => {
    const ok = typedSet.has(w);
    if (ok) matched += 1;
    return { word: w, ok };
  });
  return { matched, total: targetTokens.length, tokens };
};

export const DictationDrillCard = ({ accessToken }: Props) => {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<CefrTargetLevel>('B1');
  const [voiceName, setVoiceName] = useState<string>('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [data, setData] = useState<DictationGenerateResponse | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [comprehensionInput, setComprehensionInput] = useState('');
  const [comprehensionResult, setComprehensionResult] = useState<'pending' | 'correct' | 'wrong' | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const sync = () => {
      const v = usableVoices();
      setVoices(v);
      if (!voiceName && v.length > 0) setVoiceName(v[0]!.name);
    };
    sync();
    window.speechSynthesis.onvoiceschanged = sync;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceName]);

  const score = useMemo(
    () => (data ? scoreDictation(data.text, typed) : null),
    [data, typed],
  );

  const generate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setTyped('');
    setShowAnswer(false);
    setComprehensionInput('');
    setComprehensionResult(null);
    setData(null);
    try {
      const res = await generateDictation(accessToken, { topic: topic.trim() || undefined, target_level: level });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate passage');
    } finally {
      setBusy(false);
    }
  };

  const speak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !data?.text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(data.text);
    const voice = voiceName ? window.speechSynthesis.getVoices().find((v) => v.name === voiceName) : null;
    if (voice) utt.voice = voice;
    utt.rate = data.speed === 'slow' ? 0.85 : data.speed === 'fast' ? 1.15 : 1;
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  };

  const stop = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
  };

  const checkComprehension = () => {
    if (!data) return;
    const a = normalizeForCompare(data.comprehension_answer);
    const b = normalizeForCompare(comprehensionInput);
    setComprehensionResult(b.length > 0 && (b === a || b.includes(a) || a.includes(b)) ? 'correct' : 'wrong');
  };

  if (!accessToken) return null;

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>AI · listening dictation</p>
        <h2 style={TITLE}>Type what you hear. Get scored on accuracy.</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          AI generates a short passage at your level. The browser reads it aloud (no audio file
          download). You type what you hear; we score case- and punctuation-tolerantly and surface
          which words you missed.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 6px' }}>Level</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {CEFR_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(lvl)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #e8e2d0',
                  borderRadius: 6,
                  background: level === lvl ? '#9c2c1a' : '#fbfaf6',
                  color: level === lvl ? 'white' : '#1a1814',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
        {voices.length > 0 ? (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 6px' }}>Voice</p>
            <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </div>
        ) : null}
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Optional topic (e.g., booking a flight)"
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="button" onClick={() => void generate()} disabled={busy} style={SOLID_BTN}>
          {busy ? 'Generating…' : data ? 'New passage' : 'Generate'}
        </button>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data?.text ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={speak} style={SOLID_BTN}>▶ Play passage</button>
            <button type="button" onClick={stop} style={GHOST_BTN}>■ Stop</button>
          </div>
          <textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type what you hear (replay as many times as you need)"
            rows={3}
            style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
          />
          {score && typed.trim().length > 0 ? (
            <div>
              <p style={{ margin: 0, fontSize: 13, color: '#7a7263' }}>
                <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, color: score.matched / Math.max(1, score.total) > 0.85 ? '#166534' : '#b08020' }}>
                  {score.matched} / {score.total}
                </strong>
                {' '} words matched
              </p>
              <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', gap: 4, lineHeight: 2 }}>
                {score.tokens.map((tok, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: tok.ok ? 'color-mix(in srgb, #166534 12%, transparent)' : 'color-mix(in srgb, #9b2c2c 12%, transparent)',
                      color: tok.ok ? '#166534' : '#9b2c2c',
                      fontSize: 12.5,
                      textDecoration: tok.ok ? 'none' : 'underline',
                    }}
                  >
                    {tok.word}
                  </span>
                ))}
              </p>
            </div>
          ) : null}

          {data.tricky_tokens.length > 0 && typed.trim().length > 0 ? (
            <div>
              <p style={{ ...EYEBROW, color: '#b08020' }}>Watch for these</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                {data.tricky_tokens.join(' · ')}
              </p>
            </div>
          ) : null}

          {data.comprehension_question ? (
            <div style={{ paddingTop: 12, borderTop: '1px solid #e8e2d0' }}>
              <p style={EYEBROW}>Comprehension check</p>
              <p style={{ margin: '6px 0 8px', fontSize: 14 }}>{data.comprehension_question}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={comprehensionInput}
                  onChange={(e) => setComprehensionInput(e.target.value)}
                  placeholder="Your answer"
                  style={{ flex: 1, minWidth: 200 }}
                />
                <button type="button" onClick={checkComprehension} style={GHOST_BTN}>Check</button>
              </div>
              {comprehensionResult === 'correct' ? (
                <p style={{ color: '#166534', margin: '6px 0 0', fontSize: 13 }}>✓ Correct.</p>
              ) : comprehensionResult === 'wrong' ? (
                <p style={{ color: '#9b2c2c', margin: '6px 0 0', fontSize: 13 }}>
                  Expected: <strong>{data.comprehension_answer}</strong>
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <button type="button" onClick={() => setShowAnswer((s) => !s)} style={GHOST_BTN}>
              {showAnswer ? 'Hide transcript' : 'Show transcript'}
            </button>
            {showAnswer ? (
              <p style={{ marginTop: 10, padding: 12, background: '#fbfaf6', borderRadius: 8, border: '1px solid #e8e2d0', fontSize: 14, lineHeight: 1.65 }}>
                {data.text}
              </p>
            ) : null}
          </div>
          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </>
      ) : null}
    </section>
  );
};

// === Tier D #19 — Daily cross-skill challenge ===

export const DailyChallengeCard = ({ accessToken }: Props) => {
  const [data, setData] = useState<DailyChallengeResponse | null>(null);
  const [budget, setBudget] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const generate = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setDone({});
    try {
      const res = await generateDailyChallenge(accessToken, { minutes_budget: budget });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate challenge');
    } finally {
      setBusy(false);
    }
  };

  const completedCount = Object.values(done).filter(Boolean).length;
  const total = data?.tasks.length ?? 0;

  if (!accessToken) return null;

  return (
    <section style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <p style={EYEBROW}>AI · today's challenge</p>
          <h2 style={TITLE}>One theme. Five tasks. All four skills.</h2>
          <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
            AI picks a single theme and designs five tasks across reading / listening / writing / speaking
            (plus grammar or vocabulary), calibrated to your CEFR level and the time you have today.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7a7263', margin: '0 0 6px' }}>Time today</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={10} max={120} step={5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            <strong style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, minWidth: 60 }}>{budget} min</strong>
          </div>
        </div>
        <button type="button" onClick={() => void generate()} disabled={busy} style={SOLID_BTN}>
          {busy ? 'Designing…' : data ? 'New challenge' : 'Build today’s challenge'}
        </button>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 14, background: 'color-mix(in srgb, #9c2c1a 5%, white)', borderLeft: '3px solid #9c2c1a', borderRadius: 8 }}>
            <p style={{ ...EYEBROW, margin: 0 }}>Theme — {data.cefr_level} · {data.minutes_budget} min</p>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, margin: '4px 0 4px' }}>{data.theme}</h3>
            <p style={{ margin: 0, fontSize: 13.5, color: '#3b352a' }}>{data.why_this_theme}</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={EYEBROW}>Tasks</p>
            <p style={{ margin: 0, fontSize: 13, color: '#7a7263' }}>
              {completedCount} of {total} done
            </p>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {data.tasks.map((task: DailyChallengeTask, i) => {
              const tone = SKILL_TONE[task.skill] ?? '#9c2c1a';
              const isDone = done[i];
              return (
                <li
                  key={i}
                  style={{
                    padding: 14,
                    background: isDone ? 'color-mix(in srgb, #166534 5%, white)' : '#fbfaf6',
                    border: '1px solid #e8e2d0',
                    borderLeft: `3px solid ${isDone ? '#166534' : tone}`,
                    borderRadius: 8,
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: tone }}>
                      {task.skill}
                    </span>
                    <strong style={{ fontSize: 14 }}>{task.label}</strong>
                    <span style={{ fontSize: 11, color: '#7a7263' }}>· ~{task.estimated_minutes} min</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, color: '#3b352a', lineHeight: 1.55 }}>{task.instruction}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <a
                      href={task.route_hint}
                      style={{ fontSize: 12.5, fontWeight: 600, color: tone, textDecoration: 'none' }}
                    >
                      Open {task.skill} app →
                    </a>
                    <button
                      type="button"
                      onClick={() => setDone({ ...done, [i]: !isDone })}
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 10px',
                        border: `1px solid ${isDone ? '#166534' : '#c9c0a8'}`,
                        borderRadius: 6,
                        background: isDone ? '#166534' : 'white',
                        color: isDone ? 'white' : '#1a1814',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isDone ? '✓ Done' : 'Mark done'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier C #18 — Cultural context notes ===

export const CulturalNotesCard = ({ accessToken }: Props) => {
  const [sourceText, setSourceText] = useState('');
  const [data, setData] = useState<CulturalNotesResponse | null>(null);
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
      const res = await extractCulturalNotes(accessToken, { source_text: sourceText.trim() });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extract cultural notes');
    } finally {
      setBusy(false);
    }
  };

  const renderList = (label: string, items: string[], tone: string) => {
    if (items.length === 0) return null;
    return (
      <div>
        <p style={{ ...EYEBROW, color: tone }}>{label}</p>
        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {items.map((s, i) => (
            <li
              key={i}
              style={{
                padding: 10,
                background: '#fbfaf6',
                border: '1px solid #e8e2d0',
                borderLeft: `3px solid ${tone}`,
                borderRadius: 8,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: '#3b352a',
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (!accessToken) return null;

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>AI · cultural & register notes</p>
        <h2 style={TITLE}>Read between the lines of any English passage</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#7a7263' }}>
          Surfaces cultural references, register signals, US/UK/AU usage choices, and tone pitfalls
          — the things that quietly mark a non-native register choice as off, even when the grammar
          is fine.
        </p>
      </div>
      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Paste an English passage (article, dialogue, transcript)…"
        rows={6}
        style={{ width: '100%', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div>
        <button type="button" onClick={() => void extract()} disabled={busy} style={SOLID_BTN}>
          {busy ? 'Reading…' : 'Surface notes'}
        </button>
      </div>
      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}
      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {renderList('Cultural references', data.cultural_references, '#7c2d12')}
          {renderList('Register observations', data.register_observations, '#9c2c1a')}
          {renderList('Regional variants', data.regional_variants, '#1f3a8a')}
          {renderList('Tone pitfalls', data.tone_pitfalls, '#b08020')}
          {data.cultural_references.length === 0 &&
          data.register_observations.length === 0 &&
          data.regional_variants.length === 0 &&
          data.tone_pitfalls.length === 0 ? (
            <p style={{ color: '#7a7263', margin: 0 }}>The passage didn't surface any standout cultural or register notes.</p>
          ) : null}
          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};
