import { useEffect, useMemo, useRef, useState } from 'react';
import { sendTutorMessage, type TutorMemory, type TutorMessage } from '../lib/ecosystemInsightsClient';

interface Props {
  accessToken: string | null;
}

const STORAGE_KEY_ENABLED = 'english-hub:voice-first-enabled:v1';
const STORAGE_KEY_MEMORIES = 'english-hub:tutor-memories:v1';

const loadEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_ENABLED) === '1';
  } catch {
    return false;
  }
};

const saveEnabled = (v: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_ENABLED, v ? '1' : '0');
  } catch {
    // ignore
  }
};

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

const speak = (text: string) => {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.97;
  const v = window.speechSynthesis.getVoices().find((vc) => vc.lang.toLowerCase().startsWith('en'));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
};

interface VoiceTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const VoiceFirstFab = ({ accessToken }: Props) => {
  const [enabled, setEnabled] = useState<boolean>(() => loadEnabled());
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [unsupported, setUnsupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => saveEnabled(enabled), [enabled]);
  useEffect(() => {
    if (!getSpeechRecognition()) setUnsupported(true);
  }, []);

  // Listen for the global toggle event so the header switch can flip this
  // without prop drilling.
  useEffect(() => {
    const handler = () => setEnabled((prev) => !prev);
    window.addEventListener('schood:toggle-voice-first', handler);
    return () => window.removeEventListener('schood:toggle-voice-first', handler);
  }, []);

  const startRec = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
    setError(null);
    setInterim('');
    setPending('');
    const r = new Ctor();
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = true;
    let finalAccum = '';
    r.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        if (result.isFinal) finalAccum += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
      if (finalAccum) {
        setPending(finalAccum.trim());
      }
    };
    r.onerror = (e) => {
      setError(`Speech recognition error: ${e.error}`);
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      setInterim('');
      const text = (finalAccum || pending).trim();
      if (text) sendTurn(text);
    };
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };

  const stopRec = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const sendTurn = async (text: string) => {
    if (!accessToken || !text) return;
    setBusy(true);
    setError(null);
    const next: TutorMessage[] = [...turns, { role: 'user', content: text }];
    setTurns(next as VoiceTurn[]);
    setPending('');
    try {
      const memories = loadMemories();
      const res = await sendTutorMessage(accessToken, {
        messages: next.slice(-12),
        memories: memories.map((m) => ({ id: m.id, kind: m.kind, text: m.text })),
      });
      if (res.reply) {
        setTurns((prev) => [...prev, { role: 'assistant', content: res.reply }]);
        speak(res.reply);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice tutor failed');
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const lastReply = useMemo(
    () => [...turns].reverse().find((t) => t.role === 'assistant')?.content ?? '',
    [turns],
  );

  if (!enabled) {
    return (
      <button
        type="button"
        title="Enable voice-first mode"
        onClick={() => setEnabled(true)}
        style={{
          position: 'fixed',
          bottom: 18,
          right: 18,
          zIndex: 7000,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#ffffff',
          border: '1px solid #d6cfb8',
          color: '#0e4955',
          fontSize: 20,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
        }}
      >
        🎙
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Talk to your tutor"
        style={{
          position: 'fixed',
          bottom: 18,
          right: 18,
          zIndex: 7000,
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: recording ? '#9b1c1c' : '#0e4955',
          border: 'none',
          color: 'white',
          fontSize: 28,
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(14,73,85,0.30)',
        }}
      >
        🎙
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Voice-first tutor"
      style={{
        position: 'fixed',
        bottom: 18,
        right: 18,
        zIndex: 7100,
        width: 'min(380px, calc(100vw - 36px))',
        background: '#ffffff',
        border: '1px solid #d6cfb8',
        borderRadius: 16,
        boxShadow: '0 14px 40px rgba(0,0,0,0.18)',
        display: 'grid',
        gap: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontFamily: 'Fraunces, Outfit, serif', fontSize: 17 }}>Voice tutor</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            title="Turn off voice-first mode"
            style={{ background: 'transparent', border: 'none', color: '#6f685a', cursor: 'pointer', fontSize: 13 }}
          >
            Disable
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Minimise"
            style={{ background: 'transparent', border: 'none', color: '#6f685a', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      {unsupported ? (
        <p style={{ margin: 0, color: '#9b2c2c', fontSize: 13 }}>
          Your browser doesn't support speech recognition. Try Chrome or Edge.
        </p>
      ) : null}

      <div
        style={{
          background: '#faf7ee',
          border: '1px solid #e6dfca',
          borderRadius: 10,
          padding: 10,
          minHeight: 80,
          maxHeight: 200,
          overflowY: 'auto',
          display: 'grid',
          gap: 8,
        }}
      >
        {turns.length === 0 ? (
          <p style={{ margin: 0, color: '#6f685a', fontStyle: 'italic', fontSize: 13 }}>
            Hold the mic and ask anything. The tutor uses your saved memories from the chat card.
          </p>
        ) : null}
        {turns.slice(-6).map((t, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
              background: t.role === 'user' ? '#0e4955' : '#fff',
              color: t.role === 'user' ? '#fff' : '#1a1814',
              border: t.role === 'user' ? 'none' : '1px solid #e6dfca',
              padding: '8px 10px',
              borderRadius: 10,
              maxWidth: '92%',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
            }}
          >
            {t.content}
          </div>
        ))}
        {busy ? (
          <div style={{ alignSelf: 'flex-start', color: '#6f685a', fontSize: 12, fontStyle: 'italic' }}>
            Tutor is replying…
          </div>
        ) : null}
      </div>

      {interim ? (
        <p style={{ margin: 0, fontSize: 12, color: '#6f685a', fontStyle: 'italic' }}>
          {interim}…
        </p>
      ) : null}

      {error ? <p style={{ margin: 0, fontSize: 12, color: '#9b2c2c' }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {!recording ? (
          <button
            type="button"
            disabled={unsupported || busy || !accessToken}
            onClick={startRec}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRadius: 8,
              background: '#0e4955',
              color: '#fff',
              fontWeight: 600,
              cursor: unsupported || busy || !accessToken ? 'not-allowed' : 'pointer',
            }}
          >
            🎙 Hold to talk
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRec}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRadius: 8,
              background: '#9b1c1c',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            ■ Stop & send
          </button>
        )}
        {lastReply ? (
          <button
            type="button"
            onClick={() => speak(lastReply)}
            title="Replay last reply"
            style={{
              padding: '10px 14px',
              border: '1px solid #c9c0a8',
              borderRadius: 8,
              background: '#fff',
              color: '#1a1814',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ▶
          </button>
        ) : null}
      </div>
    </div>
  );
};
