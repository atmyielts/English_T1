import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  sendVoiceConversationTurn,
  type CefrLevel,
  type ChatMessage,
  type VoiceConversationTurnResponse,
} from '../lib/ecosystemInsightsClient';
import { canRecognize, canSpeak, listen, speak, stopSpeaking, type Listener } from '../lib/speech';
import { useT } from '../i18n';
import { Segmented } from '../ui/kit';
import { LevelPicker, ToolError, friendlyError, useLearnerLevel } from './aiToolShared';

type Scenario = {
  /** Learner-facing label and blurb live under ai.conversation.scenario.<id>.*. */
  id: string;
  /** What the partner is told (sent to the server). */
  scenario: string;
  persona: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'cafe',
    scenario: "Small talk with a friendly barista in a busy café. The barista asks about the customer's day and gives a recommendation.",
    persona: 'Sam',
  },
  {
    id: 'interview',
    scenario: "A relaxed first-round job interview. The interviewer asks the candidate about their background and what role they're looking for.",
    persona: 'Riley',
  },
  {
    id: 'doctor',
    scenario: 'A non-urgent visit to a friendly doctor about a mild ongoing complaint. The doctor asks open questions to understand the symptoms.',
    persona: 'Dr. Patel',
  },
  {
    id: 'directions',
    scenario: 'A traveller in an unfamiliar city stops a friendly local to ask how to reach a specific place.',
    persona: 'Jordan',
  },
  {
    id: 'flatmate',
    scenario: 'A casual conversation between flatmates about shared chores, noise or shopping. Friendly, but they need to agree on something.',
    persona: 'Ash',
  },
  {
    id: 'project',
    scenario: "Two university classmates discussing how to split up a group project that's due next week.",
    persona: 'Quinn',
  },
];

// === Conversation practice ===

export const VoiceConversationCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
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
        setError(t('ai.shared.unavailable'));
        return;
      }
      setLast(reply);
      setMessages([...history, { role: 'assistant', content: reply.partner_reply }]);
      if (readAloud && speechOk) void speak(reply.partner_reply, { rate: 0.95 });
    } catch (cause) {
      setMessages(messages);
      setDraft(text);
      setError(friendlyError(cause, t));
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
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') setError(t('ai.conversation.micBlocked'));
        else if (code === 'no-speech') setError(t('ai.conversation.noSpeech'));
      },
    });
    if (!listener) {
      setError(t('ai.conversation.noMic'));
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
      <p className="hint">{t('ai.conversation.intro')}</p>
      <div className="en-stack">
        <span className="hint" aria-hidden="true">{t('ai.conversation.scenarioLabel')}</span>
        <Segmented
          label={t('ai.conversation.scenarioLabel')}
          value={scenarioId}
          onChange={(id) => startOver(id)}
          options={SCENARIOS.map((s) => ({ value: s.id, label: t(`ai.conversation.scenario.${s.id}.label`) }))}
        />
        <p className="en-explain">{t(`ai.conversation.scenario.${scenario.id}.blurb`)}</p>
      </div>
      <div className="en-row">
        <LevelPicker label={t('ai.conversation.levelLabel')} value={level} onChange={setLevel} />
        {speechOk ? (
          <label className="en-row">
            <input type="checkbox" style={{ width: 'auto' }} checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
            {t('ai.conversation.speakAloud')}
          </label>
        ) : null}
      </div>

      <div className="en-chat" aria-live="polite">
        {messages.length === 0 ? <p className="hint">{t('ai.conversation.empty', { name: scenario.persona })}</p> : null}
        {messages.map((m, index) => (
          <div key={index} className={`en-bubble ${m.role === 'user' ? 'is-me' : 'is-tutor'}`}>
            <span className="visually-hidden">{m.role === 'user' ? t('ai.conversation.you') : scenario.persona}: </span>
            {m.content}
          </div>
        ))}
        {busy ? <p className="hint">{t('ai.conversation.replying', { name: scenario.persona })}</p> : null}
        <div ref={endRef} />
      </div>

      {last?.correction ? (
        <div className="en-feedback is-fix">
          <h3>{t('ai.conversation.correctionHeading')}</h3>
          <p className="en-diff">
            <del>{last.correction.original}</del> → <ins>{last.correction.better}</ins>
          </p>
          {last.correction.why ? <p className="hint">{last.correction.why}</p> : null}
        </div>
      ) : null}

      {last?.suggested_user_reply ? (
        <div className="en-explain">
          <strong>{t('ai.conversation.suggestHeading')}:</strong> {last.suggested_user_reply}
          <div className="en-actions">
            <button type="button" className="quiet" onClick={() => setDraft(last.suggested_user_reply)}>{t('ai.conversation.useThis')}</button>
          </div>
        </div>
      ) : null}

      <form className="en-stack" onSubmit={(e) => void send(e)}>
        <label className="en-stack" htmlFor="conversation-draft" style={{ gap: '0.35rem' }}>
          {t('ai.conversation.messageLabel')}
          <textarea
            id="conversation-draft"
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('ai.conversation.messagePlaceholder')}
          />
        </label>
        {!recognitionOk ? <p className="hint">{t('ai.conversation.noMic')}</p> : null}
        <ToolError message={error} />
        <div className="en-actions">
          {recognitionOk ? (
            recording ? (
              <button type="button" onClick={stopRecording}>{t('ai.conversation.stopRecording')}</button>
            ) : (
              <button type="button" className="quiet" onClick={startRecording} disabled={busy}>{t('ai.conversation.record')}</button>
            )
          ) : null}
          <button type="submit" disabled={!draft.trim() || busy || recording}>{busy ? t('ai.conversation.sending') : t('ai.conversation.send')}</button>
          {messages.length ? (
            <button type="button" className="is-link" onClick={() => startOver()}>{t('ai.conversation.restart')}</button>
          ) : null}
        </div>
      </form>
    </div>
  );
};
