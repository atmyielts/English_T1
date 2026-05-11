import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzePronunciation,
  sendTutorMessage,
  type CefrTargetLevel,
  type PronunciationFeedbackResponse,
  type TutorChatResponse,
  type TutorMemory,
  type TutorMessage,
} from '../lib/ecosystemInsightsClient';

interface Props {
  accessToken: string | null;
}

const CARD: React.CSSProperties = {
  margin: '24px 0',
  padding: 28,
  borderRadius: 16,
  background: '#ffffff',
  border: '1px solid #e8e2d0',
  display: 'grid',
  gap: 16,
};

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#0e4955',
  margin: 0,
};

const TITLE: React.CSSProperties = {
  fontFamily: 'Fraunces, Outfit, serif',
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  margin: '4px 0 6px',
};

const SOLID_BTN: React.CSSProperties = {
  padding: '10px 18px',
  border: 'none',
  borderRadius: 8,
  background: '#0e4955',
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

const KIND_TONE: Record<string, string> = {
  goal: '#0f5752',
  preference: '#0e4955',
  struggle: '#9b1c1c',
  win: '#7c2d12',
  context: '#1f3a8a',
  deadline: '#581c87',
};

const KIND_LABEL: Record<string, string> = {
  goal: 'Goal',
  preference: 'Preference',
  struggle: 'Struggle',
  win: 'Win',
  context: 'Context',
  deadline: 'Deadline',
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

// === Tier A #8 — Personal AI tutor with cross-session memory ===
//
// Memory is intentionally browser-side (localStorage) — gives genuine
// continuity without a new RLS-gated table. Per-device for now; if the
// learner clears storage or switches devices, memories reset.

const STORAGE_KEY_MEMORIES = 'english-hub:tutor-memories:v1';
const STORAGE_KEY_HISTORY = 'english-hub:tutor-history:v1';

const loadMemories = (): TutorMemory[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MEMORIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m === 'object' && m.text) : [];
  } catch {
    return [];
  }
};

const saveMemories = (mems: TutorMemory[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_MEMORIES, JSON.stringify(mems));
  } catch {
    // quota exceeded etc. — silent
  }
};

const loadHistory = (): TutorMessage[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m === 'object' && m.content && m.role) : [];
  } catch {
    return [];
  }
};

const saveHistory = (msgs: TutorMessage[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(msgs.slice(-30)));
  } catch {
    // ignore
  }
};

const newMemoryId = () => `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const TutorCard = ({ accessToken }: Props) => {
  const [memories, setMemories] = useState<TutorMemory[]>(() => loadMemories());
  const [history, setHistory] = useState<TutorMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<TutorChatResponse | null>(null);
  const [showMemories, setShowMemories] = useState(true);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => saveMemories(memories), [memories]);
  useEffect(() => saveHistory(history), [history]);
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [history.length, lastResponse]);

  const send = async () => {
    if (!accessToken || !input.trim() || busy) return;
    const userMsg: TutorMessage = { role: 'user', content: input.trim() };
    const next = [...history, userMsg];
    setHistory(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const res = await sendTutorMessage(accessToken, {
        messages: next.slice(-12),
        memories: memories.map((m) => ({ id: m.id, kind: m.kind, text: m.text })),
      });
      setLastResponse(res);
      if (res.reply) {
        setHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tutor failed to respond');
      setHistory((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const acceptMemory = (suggestion: { kind: string; text: string }) => {
    const mem: TutorMemory = {
      id: newMemoryId(),
      kind: suggestion.kind,
      text: suggestion.text,
      added_at: new Date().toISOString(),
    };
    setMemories((prev) => [mem, ...prev].slice(0, 60));
    setLastResponse((prev) =>
      prev ? { ...prev, suggested_memories: prev.suggested_memories.filter((s) => s.text !== suggestion.text) } : prev,
    );
  };

  const dismissMemory = (text: string) => {
    setLastResponse((prev) =>
      prev ? { ...prev, suggested_memories: prev.suggested_memories.filter((s) => s.text !== text) } : prev,
    );
  };

  const removeMemory = (id: string) => setMemories((prev) => prev.filter((m) => m.id !== id));

  const editMemory = (id: string, text: string) =>
    setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));

  const clearChat = () => {
    setHistory([]);
    setLastResponse(null);
  };

  const memoriesByKind = useMemo(() => {
    const grouped: Record<string, TutorMemory[]> = {};
    for (const m of memories) {
      const k = String(m.kind);
      if (!grouped[k]) grouped[k] = [];
      grouped[k]!.push(m);
    }
    return grouped;
  }, [memories]);

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Personal tutor · AI + cross-session memory</p>
        <h3 style={TITLE}>A tutor that actually remembers you</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Chat with an English study tutor that builds a memory of your goals, preferences, and recurring
          struggles. Memories live in this browser — review and edit them anytime in the side panel.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showMemories ? '1fr 280px' : '1fr', gap: 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div
            ref={transcriptRef}
            style={{
              border: '1px solid #e6dfca',
              borderRadius: 12,
              padding: 14,
              minHeight: 220,
              maxHeight: 360,
              overflowY: 'auto',
              background: '#faf7ee',
              display: 'grid',
              gap: 10,
            }}
          >
            {history.length === 0 ? (
              <p style={{ margin: 0, color: '#6f685a', fontStyle: 'italic' }}>
                Say hi, share a goal, or ask the tutor to plan your week. The more you tell it, the more it
                remembers.
              </p>
            ) : null}
            {history.map((m, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? '#0e4955' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#1a1814',
                  border: m.role === 'user' ? 'none' : '1px solid #e6dfca',
                  padding: '10px 14px',
                  borderRadius: 12,
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  fontSize: 14,
                }}
              >
                {m.content}
              </div>
            ))}
            {busy ? (
              <div style={{ alignSelf: 'flex-start', color: '#6f685a', fontSize: 13, fontStyle: 'italic' }}>
                Tutor is thinking…
              </div>
            ) : null}
          </div>

          {lastResponse?.suggested_memories.length ? (
            <div style={{ background: '#fff', border: '1px solid #d6cfb8', borderRadius: 10, padding: 12 }}>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Remember this?</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {lastResponse.suggested_memories.map((s, idx) => (
                  <div
                    key={idx}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}
                  >
                    <div style={{ flex: 1 }}>
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          color: KIND_TONE[s.kind] ?? '#0e4955',
                          marginRight: 8,
                        }}
                      >
                        {KIND_LABEL[s.kind] ?? s.kind}
                      </span>
                      <span style={{ color: '#1a1814' }}>{s.text}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => acceptMemory(s)} style={{ ...SOLID_BTN, padding: '4px 10px', fontSize: 12 }}>
                        Save
                      </button>
                      <button type="button" onClick={() => dismissMemory(s.text)} style={{ ...GHOST_BTN, padding: '4px 10px', fontSize: 12 }}>
                        Skip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {lastResponse?.suggested_actions.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lastResponse.suggested_actions.map((a, idx) => (
                <a
                  key={idx}
                  href={a.route}
                  title={a.why}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #0e4955',
                    borderRadius: 999,
                    color: '#0e4955',
                    fontSize: 13,
                    textDecoration: 'none',
                    background: '#fff',
                  }}
                >
                  → {a.label}
                </a>
              ))}
            </div>
          ) : null}

          {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Tell your tutor anything (Ctrl/Cmd+Enter to send)…"
              style={{ flex: 1, padding: 10, border: '1px solid #d6cfb8', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
            />
            <div style={{ display: 'grid', gap: 6 }}>
              <button type="button" disabled={!accessToken || busy || !input.trim()} onClick={send} style={SOLID_BTN}>
                {busy ? '…' : 'Send'}
              </button>
              <button type="button" onClick={() => setShowMemories((s) => !s)} style={{ ...GHOST_BTN, padding: '6px 10px', fontSize: 12 }}>
                {showMemories ? 'Hide memory' : 'Memory'}
              </button>
            </div>
          </div>

          {history.length ? (
            <button type="button" onClick={clearChat} style={{ ...GHOST_BTN, justifySelf: 'start', padding: '6px 12px', fontSize: 12 }}>
              Clear chat (memories kept)
            </button>
          ) : null}

          {lastResponse ? aiNote(lastResponse.ai_status, lastResponse.ai_provider, lastResponse.ai_error) : null}
        </div>

        {showMemories ? (
          <aside
            style={{
              border: '1px solid #e6dfca',
              borderRadius: 12,
              padding: 12,
              background: '#fff',
              maxHeight: 480,
              overflowY: 'auto',
              display: 'grid',
              gap: 10,
              alignContent: 'start',
            }}
          >
            <div>
              <p style={{ ...EYEBROW, margin: 0 }}>Memories ({memories.length})</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6f685a' }}>
                Stored on this device only.
              </p>
            </div>
            {memories.length === 0 ? (
              <p style={{ margin: 0, color: '#6f685a', fontSize: 13, fontStyle: 'italic' }}>
                Nothing remembered yet. Save the tutor's suggestions above to start building.
              </p>
            ) : null}
            {Object.entries(memoriesByKind).map(([kind, mems]) => (
              <div key={kind} style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: KIND_TONE[kind] ?? '#0e4955' }}>
                  {KIND_LABEL[kind] ?? kind}
                </div>
                {mems.map((m) => (
                  <MemoryRow key={m.id} memory={m} onEdit={(t) => editMemory(m.id, t)} onRemove={() => removeMemory(m.id)} />
                ))}
              </div>
            ))}
          </aside>
        ) : null}
      </div>
    </section>
  );
};

const MemoryRow = ({
  memory,
  onEdit,
  onRemove,
}: {
  memory: TutorMemory;
  onEdit: (text: string) => void;
  onRemove: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.text);
  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ padding: 6, border: '1px solid #d6cfb8', borderRadius: 6, fontFamily: 'inherit', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              if (draft.trim()) onEdit(draft.trim());
              setEditing(false);
            }}
            style={{ ...SOLID_BTN, padding: '4px 10px', fontSize: 11 }}
          >
            Save
          </button>
          <button type="button" onClick={() => { setDraft(memory.text); setEditing(false); }} style={{ ...GHOST_BTN, padding: '4px 10px', fontSize: 11 }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#3d3a32', flex: 1 }}>{memory.text}</p>
      <button type="button" onClick={() => setEditing(true)} title="Edit" style={{ background: 'transparent', border: 'none', color: '#6f685a', cursor: 'pointer', padding: 2 }}>
        ✎
      </button>
      <button type="button" onClick={onRemove} title="Remove" style={{ background: 'transparent', border: 'none', color: '#9b2c2c', cursor: 'pointer', padding: 2 }}>
        ✕
      </button>
    </div>
  );
};

// === Tier B #9 — Pronunciation analysis (browser-mediated) ===
//
// Uses the Web Speech Recognition API (Chromium browsers only) to capture
// the learner reading a target text aloud. Sends BOTH the target and the
// recognizer's transcript to the AI for diff-based diagnosis.

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const getSpeechRecognition = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const SAMPLE_TEXTS: Record<CefrTargetLevel, string> = {
  A1: 'My name is Sam. I have a small black cat. She likes to sleep on my bed in the afternoon.',
  A2: 'Yesterday I went to the market with my brother. We bought some bread and apples and walked home together.',
  B1: 'Although it was raining, we decided to walk to the new museum because the bus was running late.',
  B2: "If I had known about the meeting earlier, I would have prepared a more detailed proposal for the team.",
  C1: 'The committee acknowledged that, despite the unprecedented complexity of the proposal, its underlying logic remained surprisingly compelling.',
  C2: 'Notwithstanding the ostensibly inconsequential implications, the legislation will, in due course, irrevocably reshape the regulatory landscape.',
};

export const PronunciationDrillCard = ({ accessToken }: Props) => {
  const [level, setLevel] = useState<CefrTargetLevel>('B1');
  const [target, setTarget] = useState<string>(SAMPLE_TEXTS.B1);
  const [recognized, setRecognized] = useState('');
  const [interim, setInterim] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [userL1, setUserL1] = useState('');
  const [data, setData] = useState<PronunciationFeedbackResponse | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
  }, []);

  const start = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
    setRecognized('');
    setInterim('');
    setError(null);
    setData(null);
    const r = new Ctor();
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) setRecognized((prev) => `${prev} ${finalText}`.trim());
      setInterim(interimText);
    };
    r.onerror = (e) => {
      setError(`Speech recognition error: ${e.error}`);
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      setInterim('');
    };
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const swapLevel = (lv: CefrTargetLevel) => {
    setLevel(lv);
    setTarget(SAMPLE_TEXTS[lv]);
    setRecognized('');
    setData(null);
  };

  const grade = async () => {
    if (!accessToken || !recognized.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await analyzePronunciation(accessToken, {
        target_text: target.trim(),
        recognized_text: recognized.trim(),
        user_l1: userL1.trim() || undefined,
        target_level: level,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pronunciation analysis failed');
    } finally {
      setBusy(false);
    }
  };

  if (unsupported) {
    return (
      <section style={CARD}>
        <div>
          <p style={EYEBROW}>Pronunciation drill · browser AI</p>
          <h3 style={TITLE}>Pronunciation analysis</h3>
        </div>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Your browser doesn't support the Web Speech Recognition API. Try this in Chrome or Edge.
        </p>
      </section>
    );
  }

  const scoreColor = data
    ? data.accuracy_score >= 80
      ? '#0f5752'
      : data.accuracy_score >= 60
        ? '#8a5a1b'
        : '#9b1c1c'
    : '#0e4955';

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Pronunciation drill · browser AI</p>
        <h3 style={TITLE}>Read aloud, get pronunciation feedback</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Pick a sample (or paste your own), record yourself reading it, then let AI compare what the
          recognizer heard to the target — per-word issues + the single thing to fix on your retry.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Sample level
          <select value={level} onChange={(e) => swapLevel(e.target.value as CefrTargetLevel)} style={{ padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547', flex: 1, minWidth: 200 }}>
          Your first language (optional, helps diagnose interference)
          <input
            value={userL1}
            onChange={(e) => setUserL1(e.target.value)}
            placeholder="e.g. Russian, Uzbek, Spanish, Korean"
            style={{ padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}
          />
        </label>
      </div>

      <textarea
        rows={3}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{ padding: 12, border: '1px solid #d6cfb8', borderRadius: 10, fontFamily: 'inherit', fontSize: 16, lineHeight: 1.5, resize: 'vertical', background: '#faf7ee' }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!recording ? (
          <button type="button" onClick={start} style={SOLID_BTN}>● Start recording</button>
        ) : (
          <button type="button" onClick={stop} style={{ ...SOLID_BTN, background: '#9b1c1c' }}>■ Stop</button>
        )}
        <button type="button" disabled={!recognized.trim() || busy || !accessToken} onClick={grade} style={GHOST_BTN}>
          {busy ? 'Analysing…' : 'Analyse pronunciation'}
        </button>
        {recognized || interim ? (
          <button type="button" onClick={() => { setRecognized(''); setInterim(''); setData(null); }} style={GHOST_BTN}>
            Reset transcript
          </button>
        ) : null}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e6dfca', borderRadius: 10, padding: 12, minHeight: 60 }}>
        <p style={{ ...EYEBROW, marginBottom: 6 }}>What the recognizer heard</p>
        <p style={{ margin: 0, color: '#1a1814', whiteSpace: 'pre-wrap' }}>
          {recognized}
          {interim ? <em style={{ color: '#6f685a' }}>{recognized ? ' ' : ''}{interim}</em> : null}
          {!recognized && !interim ? <span style={{ color: '#6f685a', fontStyle: 'italic' }}>Recording will appear here…</span> : null}
        </p>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                background: scoreColor,
                color: '#fff',
                padding: '14px 22px',
                borderRadius: 12,
                fontSize: 28,
                fontWeight: 700,
                fontFamily: 'Fraunces, Outfit, serif',
              }}
            >
              {data.accuracy_score}
            </div>
            <div>
              <p style={{ ...EYEBROW, margin: 0 }}>Accuracy estimate</p>
              <p style={{ margin: 0, color: '#5b5547', fontSize: 13 }}>
                Rough recognizer-vs-target match. Doesn't capture intonation — see notes below.
              </p>
            </div>
          </div>

          {data.retry_priority ? (
            <div style={{ background: '#0e4955', color: '#fff', borderRadius: 10, padding: 12 }}>
              <p style={{ ...EYEBROW, color: '#cfe7ec', margin: 0 }}>Fix this on your next retry</p>
              <p style={{ margin: '4px 0 0' }}>{data.retry_priority}</p>
            </div>
          ) : null}

          {data.per_word.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Per-word issues</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.per_word.map((w, idx) => (
                  <div key={idx} style={{ border: '1px solid #e6dfca', borderRadius: 8, padding: 10, display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#1a1814' }}>{w.target_word}</strong>
                      {w.what_was_heard ? (
                        <span style={{ color: '#9b2c2c', fontSize: 13 }}>heard: "{w.what_was_heard}"</span>
                      ) : null}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#3d3a32' }}>{w.likely_issue}</p>
                    {w.fix_tip ? <p style={{ margin: 0, fontSize: 13, color: '#0e4955' }}><strong>Try:</strong> {w.fix_tip}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.prosody_notes.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6 }}>Prosody notes</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.prosody_notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          ) : null}

          {data.l1_interference.length ? (
            <div>
              <p style={{ ...EYEBROW, marginBottom: 6, color: '#7c2d12' }}>Likely L1 interference</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#3d3a32', display: 'grid', gap: 4 }}>
                {data.l1_interference.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          ) : null}

          {aiNote(data.ai_status, data.ai_provider, data.ai_error)}
        </div>
      ) : null}
    </section>
  );
};
