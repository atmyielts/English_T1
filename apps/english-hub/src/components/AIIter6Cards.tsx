import { useEffect, useMemo, useRef, useState } from 'react';
import {
  prepareShadowing,
  recommendContent,
  stepPlacementTest,
  type CefrTargetLevel,
  type ContentRecommendResponse,
  type PlacementHistoryEntry,
  type PlacementTestFinalResponse,
  type PlacementTestRoundResponse,
  type ShadowingChunk,
  type ShadowingPrepResponse,
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

const CONTENT_TYPE_TONE: Record<string, string> = {
  book: '#7c2d12',
  article: '#1f3a8a',
  podcast: '#0f5752',
  youtube: '#9b1c1c',
  film: '#581c87',
  newsletter: '#8a5a1b',
  tv_show: '#9c2c1a',
};

const CONTENT_TYPE_LABEL: Record<string, string> = {
  book: 'Book',
  article: 'Article',
  podcast: 'Podcast',
  youtube: 'YouTube',
  film: 'Film',
  newsletter: 'Newsletter',
  tv_show: 'TV show',
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

// === Tier C #15 — Real content recommendation ===

const FORMAT_OPTIONS = ['book', 'article', 'podcast', 'youtube', 'film', 'newsletter', 'tv_show'] as const;

export const ContentRecommendCard = ({ accessToken }: Props) => {
  const [interestsInput, setInterestsInput] = useState('');
  const [sessionMinutes, setSessionMinutes] = useState(20);
  const [formats, setFormats] = useState<string[]>([]);
  const [data, setData] = useState<ContentRecommendResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFormat = (f: string) =>
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const run = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const interests = interestsInput
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
      const res = await recommendContent(accessToken, {
        interests,
        session_minutes: sessionMinutes,
        formats: formats.length ? formats : undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to recommend content');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Real content · AI</p>
        <h3 style={TITLE}>Authentic English picked for you</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Tell us what you're curious about; AI surfaces real books, podcasts, channels, and newsletters
          calibrated to your level — plus a 5-minute first step for each.
        </p>
      </div>

      <textarea
        rows={2}
        placeholder="Interests, comma- or newline-separated (e.g. urban planning, Formula 1, climate adaptation)"
        value={interestsInput}
        onChange={(e) => setInterestsInput(e.target.value)}
        style={{ padding: 12, border: '1px solid #d6cfb8', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
      />

      <div>
        <p style={{ ...EYEBROW, marginBottom: 6 }}>Restrict formats (optional)</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFormat(f)}
              style={{
                padding: '6px 12px',
                border: formats.includes(f) ? '2px solid #9c2c1a' : '1px solid #d6cfb8',
                borderRadius: 999,
                background: formats.includes(f) ? '#9c2c1a' : '#fff',
                color: formats.includes(f) ? '#fff' : '#1a1814',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {CONTENT_TYPE_LABEL[f] ?? f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Session length (min)
          <input
            type="number"
            min={5}
            max={180}
            value={sessionMinutes}
            onChange={(e) => setSessionMinutes(Math.max(5, Math.min(180, Number(e.target.value) || 20)))}
            style={{ width: 100, padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
          />
        </label>
        <button type="button" disabled={!accessToken || busy} onClick={run} style={SOLID_BTN}>
          {busy ? 'Curating…' : 'Recommend content'}
        </button>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.items.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.items.map((item, idx) => (
                <div key={idx} style={{ border: '1px solid #e6dfca', borderRadius: 10, padding: 14, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        color: CONTENT_TYPE_TONE[item.type] ?? '#9c2c1a',
                      }}
                    >
                      {CONTENT_TYPE_LABEL[item.type] ?? item.type}
                    </span>
                    <strong style={{ fontSize: 16 }}>{item.title}</strong>
                    {item.creator ? <span style={{ color: '#6f685a', fontSize: 13 }}>· {item.creator}</span> : null}
                  </div>
                  <p style={{ margin: 0, color: '#3d3a32' }}>{item.why_for_you}</p>
                  {item.where_to_find ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#5b5547' }}>
                      <strong>Find:</strong> {item.where_to_find}
                    </p>
                  ) : null}
                  {item.difficulty_note ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#5b5547' }}>
                      <strong>Why this fits:</strong> {item.difficulty_note}
                    </p>
                  ) : null}
                  {item.first_step ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#9c2c1a' }}>
                      <strong>5-min first step:</strong> {item.first_step}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {data.immersion_tip ? (
            <div style={{ background: '#faf7ee', border: '1px solid #e6dfca', borderRadius: 10, padding: 12 }}>
              <p style={{ ...EYEBROW, marginBottom: 4 }}>Immersion tip</p>
              <p style={{ margin: 0, color: '#3d3a32' }}>{data.immersion_tip}</p>
            </div>
          ) : null}

          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier C #16 — Live caption shadowing ===

interface VoiceOption {
  name: string;
  lang: string;
}

const usableEnglishVoices = (): VoiceOption[] => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .map((v) => ({ name: v.name, lang: v.lang }));
};

export const ShadowingPracticeCard = ({ accessToken }: Props) => {
  const [sourceText, setSourceText] = useState('');
  const [level, setLevel] = useState<CefrTargetLevel>('B1');
  const [data, setData] = useState<ShadowingPrepResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [completed, setCompleted] = useState<Record<number, boolean>>({});
  const [voiceName, setVoiceName] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [rate, setRate] = useState(0.95);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const sync = () => {
      const v = usableEnglishVoices();
      setVoices(v);
      if (!voiceName && v.length > 0) setVoiceName(v[0]!.name);
    };
    sync();
    window.speechSynthesis.onvoiceschanged = sync;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [voiceName]);

  const speakChunk = (chunk: ShadowingChunk) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(chunk.text);
    u.rate = rate;
    const matched = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
    if (matched) u.voice = matched;
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const run = async () => {
    if (!accessToken || sourceText.trim().length < 30) return;
    setBusy(true);
    setError(null);
    try {
      const res = await prepareShadowing(accessToken, {
        source_text: sourceText.trim(),
        target_level: level,
      });
      setData(res);
      setActiveIdx(0);
      setCompleted({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to prepare shadowing');
    } finally {
      setBusy(false);
    }
  };

  const activeChunk = data?.chunks[activeIdx];
  const completedCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Shadowing · AI + browser TTS</p>
        <h3 style={TITLE}>Caption shadowing — chunk by chunk</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Paste a transcript or any English passage. AI splits it into short shadowing chunks with a
          single pronunciation focus each. Press play, repeat aloud, mark done.
        </p>
      </div>

      <textarea
        rows={5}
        placeholder="Paste a YouTube transcript, podcast excerpt, news paragraph, or any English passage (≥30 chars)"
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        style={{ padding: 12, border: '1px solid #d6cfb8', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Target level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as CefrTargetLevel)}
            style={{ padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
          >
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        {voices.length ? (
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
            Voice
            <select
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8, maxWidth: 220 }}
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </label>
        ) : null}
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Speed: {rate.toFixed(2)}x
          <input
            type="range"
            min={0.6}
            max={1.2}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            style={{ width: 140 }}
          />
        </label>
        <button type="button" disabled={!accessToken || busy || sourceText.trim().length < 30} onClick={run} style={SOLID_BTN}>
          {busy ? 'Splitting…' : 'Prepare shadowing'}
        </button>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {data.warm_up ? (
            <div style={{ background: '#faf7ee', border: '1px solid #e6dfca', borderRadius: 10, padding: 12 }}>
              <p style={{ ...EYEBROW, marginBottom: 4 }}>Warm-up</p>
              <p style={{ margin: 0, color: '#3d3a32' }}>{data.warm_up}</p>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.chunks.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                style={{
                  padding: '6px 10px',
                  border: idx === activeIdx ? '2px solid #9c2c1a' : '1px solid #d6cfb8',
                  borderRadius: 6,
                  background: completed[idx] ? '#9c2c1a' : idx === activeIdx ? '#fff' : '#faf7ee',
                  color: completed[idx] ? '#fff' : '#1a1814',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 36,
                }}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          {activeChunk ? (
            <div style={{ border: '1px solid #d6cfb8', borderRadius: 12, padding: 16, display: 'grid', gap: 10, background: '#fff' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#9c2c1a',
                    background: '#e2eef0',
                    padding: '3px 8px',
                    borderRadius: 999,
                  }}
                >
                  Focus: {activeChunk.focus_label}
                </span>
                <span style={{ fontSize: 12, color: '#6f685a' }}>
                  Chunk {activeIdx + 1} of {data.chunks.length}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: '#1a1814' }}>{activeChunk.text}</p>
              {activeChunk.focus_explanation ? (
                <p style={{ margin: 0, color: '#3d3a32', fontSize: 14 }}>{activeChunk.focus_explanation}</p>
              ) : null}
              {activeChunk.watch_for.length ? (
                <p style={{ margin: 0, fontSize: 13, color: '#5b5547' }}>
                  <strong>Watch for:</strong> {activeChunk.watch_for.join(' · ')}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => speakChunk(activeChunk)} style={SOLID_BTN}>
                  ▶ Play
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompleted((prev) => ({ ...prev, [activeIdx]: !prev[activeIdx] }));
                  }}
                  style={{
                    ...GHOST_BTN,
                    background: completed[activeIdx] ? '#9c2c1a' : '#fff',
                    color: completed[activeIdx] ? '#fff' : '#1a1814',
                  }}
                >
                  {completed[activeIdx] ? 'Done ✓' : 'Mark done'}
                </button>
                <button
                  type="button"
                  disabled={activeIdx >= data.chunks.length - 1}
                  onClick={() => setActiveIdx((i) => Math.min(data.chunks.length - 1, i + 1))}
                  style={GHOST_BTN}
                >
                  Next →
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ fontSize: 13, color: '#5b5547' }}>
            Progress: {completedCount} / {data.chunks.length} chunks shadowed
          </div>

          {data.global_tips.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Session reminders</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.global_tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ) : null}

          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};

// === Tier A #7 — Adaptive CEFR placement test ===

export const PlacementTestCard = ({ accessToken }: Props) => {
  const [round, setRound] = useState(0);
  const [history, setHistory] = useState<PlacementHistoryEntry[]>([]);
  const [current, setCurrent] = useState<PlacementTestRoundResponse | null>(null);
  const [final, setFinal] = useState<PlacementTestFinalResponse | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    const englishVoice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('en'));
    if (englishVoice) u.voice = englishVoice;
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const start = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setFinal(null);
    setHistory([]);
    setRound(0);
    try {
      const res = await stepPlacementTest(accessToken, { round: 0, history: [] });
      if (res.finalized) {
        setFinal(res as PlacementTestFinalResponse);
        setCurrent(null);
      } else {
        const round0 = res as PlacementTestRoundResponse;
        setCurrent(round0);
        setAnswers(new Array(round0.questions.length).fill(''));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start placement test');
    } finally {
      setBusy(false);
    }
  };

  const submitRound = async (finalize: boolean) => {
    if (!accessToken || !current) return;
    setBusy(true);
    setError(null);
    try {
      const newHistory: PlacementHistoryEntry[] = [
        ...history,
        ...current.questions.map((q, idx) => ({ question: q, answer: answers[idx] ?? '' })),
      ];
      setHistory(newHistory);
      const nextRound = round + 1;
      const res = await stepPlacementTest(accessToken, {
        round: nextRound,
        history: newHistory,
        finalize,
      });
      if (res.finalized) {
        setFinal(res as PlacementTestFinalResponse);
        setCurrent(null);
      } else {
        const r = res as PlacementTestRoundResponse;
        setCurrent(r);
        setAnswers(new Array(r.questions.length).fill(''));
        setRound(nextRound);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to advance placement test');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setRound(0);
    setHistory([]);
    setCurrent(null);
    setFinal(null);
    setAnswers([]);
    setError(null);
  };

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Placement test · adaptive AI</p>
        <h3 style={TITLE}>Find your real CEFR level in 10 minutes</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Up to three short rounds covering reading, writing, listening, and grammar. AI adapts the next
          round to what you got right and ends with a per-skill estimate + next-step plan.
        </p>
      </div>

      {!current && !final ? (
        <div>
          <button type="button" disabled={!accessToken || busy} onClick={start} style={SOLID_BTN}>
            {busy ? 'Starting…' : 'Start placement test'}
          </button>
        </div>
      ) : null}

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {current ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#5b5547' }}>
            Round {round + 1} of 3 · target band guess: <strong>{current.target_level_guess}</strong>
            {current.rationale ? <span> — {current.rationale}</span> : null}
          </div>

          {current.questions.map((q, idx) => (
            <div key={idx} style={{ border: '1px solid #e6dfca', borderRadius: 10, padding: 14, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ ...EYEBROW, margin: 0 }}>{q.skill}</span>
                <span style={{ fontSize: 12, color: '#6f685a' }}>Q{idx + 1}</span>
                {q.skill === 'listening' && q.passage ? (
                  <button type="button" onClick={() => speak(q.passage)} style={{ ...GHOST_BTN, padding: '4px 10px', fontSize: 12 }}>
                    ▶ Play audio
                  </button>
                ) : null}
              </div>
              {q.passage && q.skill !== 'listening' ? (
                <div
                  style={{
                    background: '#faf7ee',
                    border: '1px solid #e6dfca',
                    borderRadius: 8,
                    padding: 10,
                    fontStyle: 'italic',
                    color: '#3d3a32',
                  }}
                >
                  {q.passage}
                </div>
              ) : null}
              <p style={{ margin: 0, fontWeight: 600, color: '#1a1814' }}>{q.prompt}</p>
              {q.choices.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {q.choices.map((choice, ci) => (
                    <label
                      key={ci}
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: '6px 10px',
                        border: '1px solid #d6cfb8',
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: answers[idx] === choice ? '#f3f1ea' : '#fff',
                      }}
                    >
                      <input
                        type="radio"
                        name={`q-${round}-${idx}`}
                        checked={answers[idx] === choice}
                        onChange={() => setAnswers((prev) => prev.map((a, i) => (i === idx ? choice : a)))}
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={3}
                  value={answers[idx] ?? ''}
                  onChange={(e) => setAnswers((prev) => prev.map((a, i) => (i === idx ? e.target.value : a)))}
                  placeholder="Type your answer here…"
                  style={{ padding: 10, border: '1px solid #d6cfb8', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy || answers.some((a) => !a.trim())}
              onClick={() => submitRound(false)}
              style={SOLID_BTN}
            >
              {busy ? 'Submitting…' : round >= 2 ? 'Submit & finalize' : 'Submit round'}
            </button>
            {round >= 1 ? (
              <button type="button" disabled={busy} onClick={() => submitRound(true)} style={GHOST_BTN}>
                Finalize now
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={reset} style={GHOST_BTN}>
              Cancel
            </button>
          </div>

          {aiNote(current.ai_status, current.ai_provider, current.ai_error)}
        </div>
      ) : null}

      {final ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              background: '#9c2c1a',
              color: '#fff',
              padding: 18,
              borderRadius: 12,
              display: 'grid',
              gap: 6,
            }}
          >
            <p style={{ ...EYEBROW, color: '#fae0db', margin: 0 }}>Your CEFR level</p>
            <h4 style={{ margin: 0, fontSize: 36, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{final.overall_level}</h4>
            {final.narrative ? <p style={{ margin: 0, opacity: 0.9 }}>{final.narrative}</p> : null}
          </div>

          {Object.keys(final.per_skill).length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Per-skill estimates</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {Object.entries(final.per_skill).map(([skill, row]) => (
                  <div key={skill} style={{ border: '1px solid #e6dfca', borderRadius: 10, padding: 10, background: '#faf7ee' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c2c1a' }}>
                      {skill}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{row.level}</div>
                    {row.evidence ? (
                      <div style={{ fontSize: 12, color: '#5b5547', marginTop: 4 }}>{row.evidence}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {final.next_steps.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Next steps</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {final.next_steps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}

          <div>
            <button type="button" onClick={reset} style={GHOST_BTN}>Take it again</button>
          </div>

          {aiNote(final.ai_status, final.ai_provider, final.ai_error)}
        </div>
      ) : null}
    </section>
  );
};
