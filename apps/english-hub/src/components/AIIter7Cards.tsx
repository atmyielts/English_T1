import { useEffect, useRef, useState } from 'react';
import {
  analyzePronunciation,
  type CefrLevel,
  type PronunciationFeedbackResponse,
} from '../lib/ecosystemInsightsClient';
import { canRecognize, listen, type Listener } from '../lib/speech';
import { useT } from '../i18n';
import { FeedbackList, Tag } from '../ui/kit';
import { LevelPicker, ToolError, useLearnerLevel, useToolRequest } from './aiToolShared';

const SAMPLE_TEXTS: Record<CefrLevel, string> = {
  A1: 'My name is Aziz. I have a small black cat. She likes to sleep on my bed.',
  A2: 'Yesterday I went to the market with my brother. We bought some bread and apples and walked home together.',
  B1: 'Although it was raining, we decided to walk to the new museum because the bus was running late.',
  B2: 'If I had known about the meeting earlier, I would have prepared a more detailed proposal for the team.',
  C1: 'The committee agreed that, despite its complexity, the proposal was surprisingly convincing.',
  C2: 'Had we anticipated the delay, we would have rearranged the schedule well in advance.',
};

/** i18n key for a microphone problem, or null when there is nothing to show. */
const micMessageKey = (code: string): string | null => {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'ai.pronunciation.micBlocked';
  if (code === 'no-speech') return 'ai.pronunciation.noSpeech';
  if (code === 'aborted') return null;
  return 'ai.pronunciation.micOther';
};

// === Pronunciation check ===

export const PronunciationDrillCard = ({ accessToken }: { accessToken?: string | null }) => {
  const t = useT();
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
          const key = micMessageKey(code);
          if (key) setMicError(t(key));
        }
      },
    });
    if (!listener) {
      setMicError(t('ai.pronunciation.noMic'));
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
      setError(t('ai.pronunciation.tooShort'));
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
      <p className="hint">{t('ai.pronunciation.intro')}</p>
      {!recognitionOk ? <p className="en-explain">{t('ai.pronunciation.noMic')}</p> : null}
      <LevelPicker label={t('ai.pronunciation.levelLabel')} value={level} onChange={changeLevel} />
      <label className="en-stack" htmlFor="pron-target" style={{ gap: '0.35rem' }}>
        {t('ai.pronunciation.textLabel')}
        <textarea id="pron-target" rows={3} maxLength={600} value={target} onChange={(e) => { setTarget(e.target.value); reset(); }} />
      </label>
      <label className="en-stack" htmlFor="pron-l1" style={{ gap: '0.35rem' }}>
        {t('ai.pronunciation.l1Label')}
        <input id="pron-l1" type="text" maxLength={60} value={userL1} onChange={(e) => setUserL1(e.target.value)} placeholder={t('ai.pronunciation.l1Placeholder')} />
      </label>

      <div className="en-actions">
        {recording ? (
          <button type="button" onClick={stop}>{t('ai.pronunciation.stop')}</button>
        ) : (
          <button type="button" onClick={start} disabled={!recognitionOk || busy}>{t('ai.pronunciation.record')}</button>
        )}
        <button type="button" className="quiet" disabled={!heard.trim() || recording || busy} onClick={check}>
          {busy ? t('ai.pronunciation.busy') : t('ai.pronunciation.check')}
        </button>
        {heard && !recording ? (
          <button type="button" className="quiet" onClick={() => { setHeard(''); reset(); }}>{t('ai.pronunciation.reset')}</button>
        ) : null}
      </div>

      <div className="en-stack">
        <span className="hint">{t('ai.pronunciation.heardLabel')}</span>
        <p className="en-explain">{heard || t('ai.pronunciation.heardEmpty')}</p>
      </div>

      <div className="en-stack" aria-live="polite">
        <ToolError message={micError ?? error} />
        {data ? (
          <>
            {data.missed_words.length ? (
              <div className="en-feedback is-fix">
                <h3>{t('ai.pronunciation.score', { matched: data.words_matched, total: data.words_total })}</h3>
                <p className="hint">{t('ai.pronunciation.missedHeading')}:</p>
                <div className="en-row">{data.missed_words.map((w) => <Tag key={w}>{w}</Tag>)}</div>
              </div>
            ) : (
              <p className="en-notice">{t('ai.pronunciation.allHeard')}</p>
            )}
            <p className="hint">{t('ai.pronunciation.honestNote')}</p>

            {data.fallback ? <p className="en-explain">{t('ai.pronunciation.fallbackNote')}</p> : null}
            {!data.fallback && data.retry_priority ? (
              <div className="en-explain">
                <strong>{t('ai.pronunciation.retryHeading')}</strong>
                <br />
                {data.retry_priority}
              </div>
            ) : null}
            {!data.fallback && data.per_word.length ? (
              <>
                <h3>{t('ai.pronunciation.perWordHeading')}</h3>
                <ul className="en-list">
                  {data.per_word.map((w, index) => (
                    <li key={index} className="en-explain">
                      <strong>{w.target_word}</strong>
                      {w.what_was_heard ? <> · {t('ai.pronunciation.heard')} “{w.what_was_heard}”</> : null}
                      <br />
                      {w.likely_issue}
                      {w.fix_tip ? <><br /><strong>{t('ai.pronunciation.tryThis')}</strong> {w.fix_tip}</> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {!data.fallback ? (
              <>
                <FeedbackList title={t('ai.pronunciation.prosodyHeading')} items={data.prosody_notes} tone="good" />
                <FeedbackList title={t('ai.pronunciation.l1Heading')} items={data.l1_interference} tone="fix" />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
