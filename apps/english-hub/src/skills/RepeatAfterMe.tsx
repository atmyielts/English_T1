import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { canRecognize, canSpeak, listen, speak, stopSpeaking, type Listener } from '../lib/speech';
import { matchSpoken } from '../lib/spokenMatch';

const SentenceDrill = ({ sentence, index }: { sentence: string; index: number }) => {
  const t = useT();
  const [heard, setHeard] = useState('');
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const listener = useRef<Listener | null>(null);

  useEffect(() => () => listener.current?.stop(), []);

  const record = () => {
    stopSpeaking();
    setHeard('');
    setProblem(null);
    listener.current = listen({
      onText: (text) => setHeard(text),
      onEnd: (error) => {
        setRecording(false);
        if (error === 'not-allowed' || error === 'service-not-allowed') setProblem(t('repeat.micBlocked'));
        else if (error && error !== 'no-speech' && error !== 'aborted') setProblem(t('repeat.failed'));
      },
    });
    setRecording(Boolean(listener.current));
  };

  const matched = heard ? matchSpoken(sentence, heard) : [];
  const score = matched.length ? Math.round((matched.filter((entry) => entry.heard).length / matched.length) * 100) : null;

  return (
    <div className="en-question">
      <p className="eyebrow" style={{ margin: 0 }}>{t('repeat.sentence', { number: index + 1 })}</p>
      <p className="en-question-prompt" lang="en">{sentence}</p>
      <div className="en-actions">
        <button type="button" className="quiet" disabled={!canSpeak() || recording} onClick={() => void speak(sentence)}>▶ {t('repeat.listen')}</button>
        {recording
          ? <button type="button" onClick={() => listener.current?.stop()}>■ {t('repeat.stop')}</button>
          : <button type="button" onClick={record}>● {heard ? t('repeat.again') : t('repeat.say')}</button>}
      </div>
      {heard ? (
        <p className="en-diff" lang="en" aria-live="polite" style={{ margin: 0 }}>
          {matched.map((entry, position) => (
            <span key={position}>{entry.heard ? <ins>{entry.word}</ins> : <del>{entry.word}</del>} </span>
          ))}
        </p>
      ) : null}
      {score !== null && !recording ? (
        <p className={score >= 85 ? 'en-notice' : 'hint'} style={{ margin: 0 }}>
          {score >= 85 ? t('repeat.great', { score }) : t('repeat.tryAgain', { score })}
        </p>
      ) : null}
      {problem ? <p className="error" style={{ margin: 0 }}>{problem}</p> : null}
    </div>
  );
};

/** Say each sentence back; the browser's speech recognition shows which words came through. */
export const RepeatAfterMe = ({ title, lead, sentences }: { title: string; lead: string; sentences: string[] }) => {
  const t = useT();
  const usable = sentences.map((sentence) => sentence.trim()).filter(Boolean).slice(0, 6);
  if (!usable.length) return null;
  return (
    <div className="en-stack" style={{ gap: '.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
      <p className="hint" style={{ margin: 0 }}>{lead}</p>
      {canRecognize()
        ? usable.map((sentence, index) => <SentenceDrill key={sentence} sentence={sentence} index={index} />)
        : <p className="hint">{t('repeat.unsupported')}</p>}
      <p className="hint" style={{ margin: 0 }}>{t('repeat.privacy')}</p>
    </div>
  );
};
