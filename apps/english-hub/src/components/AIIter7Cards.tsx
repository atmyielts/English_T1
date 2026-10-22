import { useEffect, useRef, useState } from 'react';
import {
  analyzePronunciation,
  type CefrLevel,
  type PronunciationFeedbackResponse,
} from '../lib/ecosystemInsightsClient';
import { canRecognize, listen, type Listener } from '../lib/speech';
import { FeedbackList, Tag } from '../ui/kit';
import { LevelPicker, ToolError, useLearnerLevel, useToolRequest } from './aiToolShared';

const COPY = {
  intro: 'Read a sentence out loud. See which words were heard clearly.',
  levelLabel: 'Level',
  textLabel: 'Sentence to read',
  l1Label: 'Your first language (optional)',
  l1Placeholder: 'For example: Uzbek, Russian',
  record: 'Start recording',
  stop: 'Stop',
  check: 'Check my reading',
  busy: 'Checking…',
  reset: 'Try again',
  heardLabel: 'What we heard',
  heardEmpty: 'Your words will appear here when you speak.',
  noMic: "Speech recognition doesn't work in this browser. Try Chrome or Edge on a computer or an Android phone.",
  micBlocked: 'Please allow the microphone and try again.',
  noSpeech: "We didn't hear anything. Try again a little louder.",
  micOther: 'Recording stopped. Please try again.',
  tooShort: 'Please use a longer sentence (at least 10 characters).',
  score: (matched: number, total: number) => `${matched} of ${total} words heard clearly`,
  missedHeading: 'Words to practise',
  allHeard: 'We heard every word. Well done!',
  honestNote: 'This check uses what your browser heard, so it is not a perfect test of your pronunciation.',
  fallbackNote: "Detailed tips aren't available right now.",
  retryHeading: 'Fix this first',
  perWordHeading: 'Word tips',
  heard: 'We heard:',
  tryThis: 'Try:',
  prosodyHeading: 'Rhythm and stress',
  l1Heading: 'Common for speakers of your language',
};

const SAMPLE_TEXTS: Record<CefrLevel, string> = {
  A1: 'My name is Aziz. I have a small black cat. She likes to sleep on my bed.',
  A2: 'Yesterday I went to the market with my brother. We bought some bread and apples and walked home together.',
  B1: 'Although it was raining, we decided to walk to the new museum because the bus was running late.',
  B2: 'If I had known about the meeting earlier, I would have prepared a more detailed proposal for the team.',
  C1: 'The committee agreed that, despite its complexity, the proposal was surprisingly convincing.',
  C2: 'Had we anticipated the delay, we would have rearranged the schedule well in advance.',
};

const micMessage = (code: string): string => {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return COPY.micBlocked;
  if (code === 'no-speech') return COPY.noSpeech;
  if (code === 'aborted') return '';
  return COPY.micOther;
};

// === Pronunciation check ===

export const PronunciationDrillCard = ({ accessToken }: { accessToken?: string | null }) => {
  const learnerLevel = useLearnerLevel();
  const [level, setLevel] = useState<CefrLevel>(learnerLevel);
  const [target, setTarget] = useState<string>(SAMPLE_TEXTS[learnerLevel]);
  const [heard, setHeard] = useState('');
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [userL1, setUserL1] = useState('');
  const { data, busy, error, run, reset, setError } = useToolRequest<PronunciationFeedbackResponse>();
  const listenerRef = useRef<Listener | null>(null);
  const recognitionOk = canRecognize();

  useEffect(() => () => listenerRef.current?.stop(), []);

  const start = () => {
    reset();
    setHeard('');
    setMicError(null);
    const listener = listen({
      onText: (text) => setHeard(text),
      onEnd: (code) => {
        setRecording(false);
        listenerRef.current = null;
        if (code) {
          const message = micMessage(code);
          if (message) setMicError(message);
        }
      },
    });
    if (!listener) {
      setMicError(COPY.noMic);
      return;
    }
    listenerRef.current = listener;
    setRecording(true);
  };

  const stop = () => {
    listenerRef.current?.stop();
    setRecording(false);
  };

  const changeLevel = (next: CefrLevel) => {
    setLevel(next);
    setTarget(SAMPLE_TEXTS[next]);
    setHeard('');
    reset();
  };

  const check = () => {
    if (target.trim().length < 10) {
      setError(COPY.tooShort);
      return;
    }
    if (!heard.trim()) return;
    void run(() => analyzePronunciation({
      target_text: target.trim(),
      recognized_text: heard.trim(),
      user_l1: userL1.trim() || undefined,
      target_level: level,
    }));
  };

  if (!accessToken) return null;

  return (
    <div className="en-stack">
      <p className="hint">{COPY.intro}</p>
      {!recognitionOk ? <p className="en-explain">{COPY.noMic}</p> : null}
      <LevelPicker label={COPY.levelLabel} value={level} onChange={changeLevel} />
      <label className="en-stack" htmlFor="pron-target" style={{ gap: '0.35rem' }}>
        {COPY.textLabel}
        <textarea id="pron-target" rows={3} maxLength={600} value={target} onChange={(e) => { setTarget(e.target.value); reset(); }} />
      </label>
      <label className="en-stack" htmlFor="pron-l1" style={{ gap: '0.35rem' }}>
        {COPY.l1Label}
        <input id="pron-l1" type="text" maxLength={60} value={userL1} onChange={(e) => setUserL1(e.target.value)} placeholder={COPY.l1Placeholder} />
      </label>

      <div className="en-actions">
        {recording ? (
          <button type="button" onClick={stop}>{COPY.stop}</button>
        ) : (
          <button type="button" onClick={start} disabled={!recognitionOk || busy}>{COPY.record}</button>
        )}
        <button type="button" className="quiet" disabled={!heard.trim() || recording || busy} onClick={check}>
          {busy ? COPY.busy : COPY.check}
        </button>
        {heard && !recording ? (
          <button type="button" className="quiet" onClick={() => { setHeard(''); reset(); }}>{COPY.reset}</button>
        ) : null}
      </div>

      <div className="en-stack">
        <span className="hint">{COPY.heardLabel}</span>
        <p className="en-explain">{heard || COPY.heardEmpty}</p>
      </div>

      <div className="en-stack" aria-live="polite">
        <ToolError message={micError ?? error} />
        {data ? (
          <>
            {data.missed_words.length ? (
              <div className="en-feedback is-fix">
                <h3>{COPY.score(data.words_matched, data.words_total)}</h3>
                <p className="hint">{COPY.missedHeading}:</p>
                <div className="en-row">{data.missed_words.map((w) => <Tag key={w}>{w}</Tag>)}</div>
              </div>
            ) : (
              <p className="en-notice">{COPY.allHeard}</p>
            )}
            <p className="hint">{COPY.honestNote}</p>

            {data.fallback ? <p className="en-explain">{COPY.fallbackNote}</p> : null}
            {!data.fallback && data.retry_priority ? (
              <div className="en-explain">
                <strong>{COPY.retryHeading}</strong>
                <br />
                {data.retry_priority}
              </div>
            ) : null}
            {!data.fallback && data.per_word.length ? (
              <>
                <h3>{COPY.perWordHeading}</h3>
                <ul className="en-list">
                  {data.per_word.map((w, index) => (
                    <li key={index} className="en-explain">
                      <strong>{w.target_word}</strong>
                      {w.what_was_heard ? <> · {COPY.heard} “{w.what_was_heard}”</> : null}
                      <br />
                      {w.likely_issue}
                      {w.fix_tip ? <><br /><strong>{COPY.tryThis}</strong> {w.fix_tip}</> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {!data.fallback ? (
              <>
                <FeedbackList title={COPY.prosodyHeading} items={data.prosody_notes} tone="good" />
                <FeedbackList title={COPY.l1Heading} items={data.l1_interference} tone="fix" />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
