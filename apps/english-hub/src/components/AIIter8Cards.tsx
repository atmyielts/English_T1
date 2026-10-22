import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  sendVoiceConversationTurn,
  type CefrLevel,
  type ChatMessage,
  type VoiceConversationTurnResponse,
} from '../lib/ecosystemInsightsClient';
import { canRecognize, canSpeak, listen, speak, stopSpeaking, type Listener } from '../lib/speech';
import { Segmented } from '../ui/kit';
import { LevelPicker, SHARED_COPY, ToolError, friendlyError, useLearnerLevel } from './aiToolShared';

const COPY = {
  intro: 'Choose a situation and talk with a practice partner. Speak or type.',
  scenarioLabel: 'Situation',
  levelLabel: 'Your level',
  speakAloud: 'Read replies out loud',
  empty: (name: string) => `Say hello to ${name} to start.`,
  you: 'You',
  replying: (name: string) => `${name} is replying…`,
  correctionHeading: 'A small correction',
  suggestHeading: 'You could say',
  useThis: 'Use this',
  messageLabel: 'Your message',
  messagePlaceholder: 'Speak or type your message…',
  record: 'Speak',
  stopRecording: 'Stop',
  send: 'Send',
  sending: 'Sending…',
  restart: 'Start over',
  noMic: "Speaking doesn't work in this browser, but you can type your message.",
  micBlocked: 'Please allow the microphone and try again, or type your message.',
  noSpeech: "We didn't hear anything. Try again a little louder, or type your message.",
};

type Scenario = {
  id: string;
  label: string;
  /** What the learner sees. */
  blurb: string;
  /** What the partner is told (sent to the server). */
  scenario: string;
  persona: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'cafe',
    label: 'At a café',
    blurb: 'You are in a busy café. Chat with the barista and order something.',
    scenario: "Small talk with a friendly barista in a busy café. The barista asks about the customer's day and gives a recommendation.",
    persona: 'Sam',
  },
  {
    id: 'interview',
    label: 'Job interview',
    blurb: 'A friendly first job interview. Talk about yourself and the job you want.',
    scenario: "A relaxed first-round job interview. The interviewer asks the candidate about their background and what role they're looking for.",
    persona: 'Riley',
  },
  {
    id: 'doctor',
    label: "At the doctor's",
    blurb: 'You have a small health problem. Explain how you feel.',
    scenario: 'A non-urgent visit to a friendly doctor about a mild ongoing complaint. The doctor asks open questions to understand the symptoms.',
    persona: 'Dr. Patel',
  },
  {
    id: 'directions',
    label: 'Asking for directions',
    blurb: 'You are in a new city. Ask a local person how to get somewhere.',
    scenario: 'A traveller in an unfamiliar city stops a friendly local to ask how to reach a specific place.',
    persona: 'Jordan',
  },
  {
    id: 'flatmate',
    label: 'Talking with a flatmate',
    blurb: 'Agree with your flatmate about cleaning, noise or shopping.',
    scenario: 'A casual conversation between flatmates about shared chores, noise or shopping. Friendly, but they need to agree on something.',
    persona: 'Ash',
  },
  {
    id: 'project',
    label: 'Group project',
    blurb: 'Plan a group project with a classmate. Decide who does what.',
    scenario: "Two university classmates discussing how to split up a group project that's due next week.",
    persona: 'Quinn',
  },
];

// === Conversation practice ===

export const VoiceConversationCard = ({ accessToken }: { accessToken?: string | null }) => {
  const learnerLevel = useLearnerLevel();
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [last, setLast] = useState<VoiceConversationTurnResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readAloud, setReadAloud] = useState(true);
  const listenerRef = useRef<Listener | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recognitionOk = canRecognize();
  const speechOk = canSpeak();

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;

  useEffect(() => () => {
    listenerRef.current?.stop();
    stopSpeaking();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, busy]);

  const startOver = (nextScenario = scenarioId) => {
    listenerRef.current?.stop();
    stopSpeaking();
    setScenarioId(nextScenario);
    setMessages([]);
    setLast(null);
    setDraft('');
    setError(null);
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    listenerRef.current?.stop();
    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages(history);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const reply = await sendVoiceConversationTurn({
        messages: history.slice(-12),
        scenario: scenario.scenario,
        persona_name: scenario.persona,
        target_level: level,
      });
      if (reply.ai_status !== 'ok' || !reply.partner_reply) {
        setMessages(messages);
        setDraft(text);
        setError(SHARED_COPY.unavailable);
        return;
      }
      setLast(reply);
      setMessages([...history, { role: 'assistant', content: reply.partner_reply }]);
      if (readAloud && speechOk) void speak(reply.partner_reply, { rate: 0.95 });
    } catch (cause) {
      setMessages(messages);
      setDraft(text);
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  };

  const startRecording = () => {
    setError(null);
    stopSpeaking();
    const before = draft.trim();
    const listener = listen({
      onText: (text) => setDraft(before ? `${before} ${text}` : text),
      onEnd: (code) => {
        setRecording(false);
        listenerRef.current = null;
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') setError(COPY.micBlocked);
        else if (code === 'no-speech') setError(COPY.noSpeech);
      },
    });
    if (!listener) {
      setError(COPY.noMic);
      return;
    }
    listenerRef.current = listener;
    setRecording(true);
  };

  const stopRecording = () => {
    listenerRef.current?.stop();
    setRecording(false);
  };

  if (!accessToken) return null;

  return (
    <div className="en-stack">
      <p className="hint">{COPY.intro}</p>
      <div className="en-stack">
        <span className="hint" aria-hidden="true">{COPY.scenarioLabel}</span>
        <Segmented
          label={COPY.scenarioLabel}
          value={scenarioId}
          onChange={(id) => startOver(id)}
          options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
        />
        <p className="en-explain">{scenario.blurb}</p>
      </div>
      <div className="en-row">
        <LevelPicker label={COPY.levelLabel} value={level} onChange={setLevel} />
        {speechOk ? (
          <label className="en-row">
            <input type="checkbox" style={{ width: 'auto' }} checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
            {COPY.speakAloud}
          </label>
        ) : null}
      </div>

      <div className="en-chat" aria-live="polite">
        {messages.length === 0 ? <p className="hint">{COPY.empty(scenario.persona)}</p> : null}
        {messages.map((m, index) => (
          <div key={index} className={`en-bubble ${m.role === 'user' ? 'is-me' : 'is-tutor'}`}>
            <span className="visually-hidden">{m.role === 'user' ? COPY.you : scenario.persona}: </span>
            {m.content}
          </div>
        ))}
        {busy ? <p className="hint">{COPY.replying(scenario.persona)}</p> : null}
        <div ref={endRef} />
      </div>

      {last?.correction ? (
        <div className="en-feedback is-fix">
          <h3>{COPY.correctionHeading}</h3>
          <p className="en-diff">
            <del>{last.correction.original}</del> → <ins>{last.correction.better}</ins>
          </p>
          {last.correction.why ? <p className="hint">{last.correction.why}</p> : null}
        </div>
      ) : null}

      {last?.suggested_user_reply ? (
        <div className="en-explain">
          <strong>{COPY.suggestHeading}:</strong> {last.suggested_user_reply}
          <div className="en-actions">
            <button type="button" className="quiet" onClick={() => setDraft(last.suggested_user_reply)}>{COPY.useThis}</button>
          </div>
        </div>
      ) : null}

      <form className="en-stack" onSubmit={(e) => void send(e)}>
        <label className="en-stack" htmlFor="conversation-draft" style={{ gap: '0.35rem' }}>
          {COPY.messageLabel}
          <textarea
            id="conversation-draft"
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={COPY.messagePlaceholder}
          />
        </label>
        {!recognitionOk ? <p className="hint">{COPY.noMic}</p> : null}
        <ToolError message={error} />
        <div className="en-actions">
          {recognitionOk ? (
            recording ? (
              <button type="button" onClick={stopRecording}>{COPY.stopRecording}</button>
            ) : (
              <button type="button" className="quiet" onClick={startRecording} disabled={busy}>{COPY.record}</button>
            )
          ) : null}
          <button type="submit" disabled={!draft.trim() || busy || recording}>{busy ? COPY.sending : COPY.send}</button>
          {messages.length ? (
            <button type="button" className="is-link" onClick={() => startOver()}>{COPY.restart}</button>
          ) : null}
        </div>
      </form>
    </div>
  );
};
