import { useEffect, useRef, useState } from 'react';
import {
  sendVoiceConversationTurn,
  type CefrTargetLevel,
  type TutorMessage,
  type VoiceConversationTurnResponse,
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

interface ScenarioPreset {
  id: string;
  label: string;
  scenario: string;
  persona_name: string;
}

const SCENARIOS: ScenarioPreset[] = [
  {
    id: 'cafe',
    label: 'Café small talk',
    scenario: 'Small talk with a friendly barista in a busy café. The barista asks about the customer\'s day and gives a recommendation.',
    persona_name: 'Sam',
  },
  {
    id: 'job_interview',
    label: 'Job interview warm-up',
    scenario: 'A relaxed first-round job interview. The interviewer asks the candidate about their background and what role they\'re looking for.',
    persona_name: 'Riley',
  },
  {
    id: 'doctor',
    label: 'Doctor visit',
    scenario: 'A non-urgent visit to a friendly doctor about a mild ongoing complaint. The doctor asks open questions to understand the symptoms.',
    persona_name: 'Dr. Patel',
  },
  {
    id: 'travel',
    label: 'Asking for directions',
    scenario: 'A traveller in an unfamiliar city stops a friendly local to ask how to reach a specific place.',
    persona_name: 'Jordan',
  },
  {
    id: 'flatmate',
    label: 'Flatmate negotiation',
    scenario: 'A casual conversation between flatmates about shared chores, noise, or rent. Friendly but they need to actually agree on something.',
    persona_name: 'Ash',
  },
  {
    id: 'classmate',
    label: 'Group project chat',
    scenario: 'Two university classmates discussing how to split up a group project that\'s due next week.',
    persona_name: 'Quinn',
  },
];

export const VoiceConversationCard = ({ accessToken }: Props) => {
  const [scenarioId, setScenarioId] = useState<string>('cafe');
  const [level, setLevel] = useState<CefrTargetLevel>('B1');
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [last, setLast] = useState<VoiceConversationTurnResponse | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const preset = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;

  useEffect(() => {
    if (!getSpeechRecognition()) setUnsupported(true);
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages.length, last]);

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.97;
    const englishVoice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('en'));
    if (englishVoice) u.voice = englishVoice;
    window.speechSynthesis.speak(u);
  };

  const sendTurn = async (userText: string) => {
    if (!accessToken || !userText.trim()) return;
    const next = [...messages, { role: 'user' as const, content: userText.trim() }];
    setMessages(next);
    setPending('');
    setBusy(true);
    setError(null);
    try {
      const res = await sendVoiceConversationTurn(accessToken, {
        messages: next.slice(-12),
        scenario: preset.scenario,
        persona_name: preset.persona_name,
        target_level: level,
      });
      setLast(res);
      if (res.partner_reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.partner_reply }]);
        if (autoSpeak) speak(res.partner_reply);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversation turn failed');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const startRecording = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
    setError(null);
    setInterim('');
    const r = new Ctor();
    r.lang = 'en-US';
    r.continuous = true;
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
      if (finalAccum) setPending((prev) => `${prev} ${finalAccum}`.trim());
      finalAccum = '';
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

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const stopAndSend = () => {
    recognitionRef.current?.stop();
    setRecording(false);
    setTimeout(() => {
      const text = pending.trim();
      if (text) sendTurn(text);
    }, 120);
  };

  const reset = () => {
    setMessages([]);
    setLast(null);
    setPending('');
    setError(null);
  };

  const swapScenario = (id: string) => {
    setScenarioId(id);
    setMessages([]);
    setLast(null);
  };

  const acceptSuggestion = () => {
    if (last?.suggested_user_reply) setPending(last.suggested_user_reply);
  };

  return (
    <section style={CARD}>
      <div>
        <p style={EYEBROW}>Voice conversation · AI partner</p>
        <h3 style={TITLE}>Practice English by talking out loud</h3>
        <p style={{ margin: 0, color: '#5b5547' }}>
          Pick a scenario, hit record, and have a real back-and-forth with an AI partner calibrated to
          your level. Each turn comes with a gentle correction (only if needed) and a suggestion for what
          to say next so you never get stuck.
        </p>
      </div>

      {unsupported ? (
        <p style={{ margin: 0, color: '#9b2c2c' }}>
          Your browser doesn't support the Web Speech Recognition API. Try Chrome or Edge to use this feature.
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => swapScenario(s.id)}
            style={{
              padding: '6px 12px',
              border: scenarioId === s.id ? '2px solid #0e4955' : '1px solid #d6cfb8',
              borderRadius: 999,
              background: scenarioId === s.id ? '#0e4955' : '#fff',
              color: scenarioId === s.id ? '#fff' : '#1a1814',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#5b5547' }}>
          Calibrate to level
          <select value={level} onChange={(e) => setLevel(e.target.value as CefrTargetLevel)} style={{ padding: '8px 10px', border: '1px solid #d6cfb8', borderRadius: 8 }}>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#3d3a32' }}>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          Speak partner's reply aloud
        </label>
        <div style={{ fontSize: 12, color: '#6f685a', flex: 1, minWidth: 200 }}>
          <strong>Scenario:</strong> {preset.scenario}
        </div>
      </div>

      <div
        ref={transcriptRef}
        style={{
          border: '1px solid #e6dfca',
          borderRadius: 12,
          padding: 14,
          minHeight: 200,
          maxHeight: 360,
          overflowY: 'auto',
          background: '#faf7ee',
          display: 'grid',
          gap: 10,
        }}
      >
        {messages.length === 0 ? (
          <p style={{ margin: 0, color: '#6f685a', fontStyle: 'italic' }}>
            Start the conversation. Hit record and say hello to {preset.persona_name}.
          </p>
        ) : null}
        {messages.map((m, idx) => (
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
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
              {m.role === 'user' ? 'You' : preset.persona_name}
            </div>
            {m.content}
          </div>
        ))}
        {busy ? (
          <div style={{ alignSelf: 'flex-start', color: '#6f685a', fontSize: 13, fontStyle: 'italic' }}>
            {preset.persona_name} is replying…
          </div>
        ) : null}
      </div>

      {last?.correction ? (
        <div style={{ background: '#fff7ed', border: '1px solid #f4d8a8', borderRadius: 10, padding: 12 }}>
          <p style={{ ...EYEBROW, color: '#7c2d12', marginBottom: 4 }}>Gentle correction</p>
          <p style={{ margin: '0 0 4px', fontSize: 14 }}>
            <span style={{ textDecoration: 'line-through', color: '#9b2c2c' }}>{last.correction.original}</span>
            {' → '}
            <strong style={{ color: '#0f5752' }}>{last.correction.better}</strong>
          </p>
          {last.correction.why ? <p style={{ margin: 0, fontSize: 13, color: '#5b5547' }}>{last.correction.why}</p> : null}
        </div>
      ) : null}

      {last?.suggested_user_reply ? (
        <div style={{ background: '#f0f4f8', border: '1px solid #cad6e0', borderRadius: 10, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <p style={{ ...EYEBROW, marginBottom: 4 }}>You could say…</p>
            <p style={{ margin: 0, color: '#1a1814', fontSize: 14 }}>{last.suggested_user_reply}</p>
          </div>
          <button type="button" onClick={acceptSuggestion} style={{ ...GHOST_BTN, padding: '6px 12px', fontSize: 12 }}>
            Use this
          </button>
        </div>
      ) : null}

      <div
        style={{
          background: '#fff',
          border: '1px solid #e6dfca',
          borderRadius: 10,
          padding: 12,
          minHeight: 60,
        }}
      >
        <p style={{ ...EYEBROW, marginBottom: 6 }}>What you'll send</p>
        <textarea
          rows={2}
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          placeholder="Recording captures here, or type directly…"
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #d6cfb8', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
        />
        {interim ? (
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6f685a', fontStyle: 'italic' }}>
            {interim}…
          </p>
        ) : null}
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: 0 }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!recording ? (
          <button type="button" disabled={unsupported || busy || !accessToken} onClick={startRecording} style={SOLID_BTN}>
            ● Record
          </button>
        ) : (
          <>
            <button type="button" onClick={stopRecording} style={{ ...GHOST_BTN }}>
              ■ Stop (keep)
            </button>
            <button type="button" onClick={stopAndSend} style={{ ...SOLID_BTN, background: '#0f5752' }}>
              ■ Stop & send
            </button>
          </>
        )}
        <button type="button" disabled={!pending.trim() || busy || !accessToken} onClick={() => sendTurn(pending)} style={GHOST_BTN}>
          {busy ? 'Sending…' : 'Send turn'}
        </button>
        {messages.length ? (
          <button type="button" onClick={reset} style={GHOST_BTN}>
            Reset conversation
          </button>
        ) : null}
      </div>

      {last?.scenario_progress ? (
        <p style={{ margin: 0, fontSize: 12, color: '#6f685a', fontStyle: 'italic' }}>
          {last.scenario_progress}
        </p>
      ) : null}

      {last ? aiNote(last.ai_status, last.ai_provider, last.ai_error) : null}
    </section>
  );
};
