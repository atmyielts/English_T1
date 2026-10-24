import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { canRecognize, listen, stopSpeaking, type Listener } from '../lib/speech';
import './practice.css';

export const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

/**
 * An answer box that takes speech (browser recognition) or typing. Speech is
 * added to whatever is already typed. `onSeconds` gets the total time spoken
 * (starting from `spokenSeconds`) each time recording stops; `maxSeconds`
 * caps that total and stops recording automatically.
 */
export const SpeakOrType = ({
  id,
  label,
  value,
  onChange,
  onSeconds,
  spokenSeconds = 0,
  maxSeconds,
  disabled = false,
  rows = 3,
  autoStart = false,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  onSeconds?: (seconds: number) => void;
  /** Time already spoken for this answer (kept when the box is shown again). */
  spokenSeconds?: number;
  maxSeconds?: number;
  disabled?: boolean;
  rows?: number;
  /** Start recording on mount (e.g. when a timed talk begins). */
  autoStart?: boolean;
  children?: ReactNode;
}) => {
  const t = useT();
  const supported = canRecognize();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(spokenSeconds);
  const [error, setError] = useState<string | null>(null);
  const listener = useRef<Listener | null>(null);
  const startedAt = useRef<number | null>(null);
  const total = useRef(spokenSeconds);
  const valueRef = useRef(value);
  valueRef.current = value;

  const stop = () => listener.current?.stop();

  const start = () => {
    if (!supported || recording || disabled) return;
    if (maxSeconds !== undefined && total.current >= maxSeconds) return;
    setError(null);
    stopSpeaking();
    const before = valueRef.current.trim();
    const next = listen({
      onText: (text) => onChange(before ? `${before} ${text}` : text),
      onEnd: (code) => {
        if (startedAt.current !== null) total.current += (Date.now() - startedAt.current) / 1000;
        startedAt.current = null;
        listener.current = null;
        setRecording(false);
        setElapsed(total.current);
        onSeconds?.(Math.round(total.current));
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') setError(t('speak.micBlocked'));
        else if (code === 'no-speech') setError(t('speak.noSpeech'));
      },
    });
    if (!next) {
      setError(t('speak.noMic'));
      return;
    }
    listener.current = next;
    startedAt.current = Date.now();
    setRecording(true);
  };

  // Running clock, and the automatic stop at maxSeconds.
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const now = total.current + (startedAt.current !== null ? (Date.now() - startedAt.current) / 1000 : 0);
      setElapsed(now);
      if (maxSeconds !== undefined && now >= maxSeconds) listener.current?.stop();
    }, 500);
    return () => window.clearInterval(timer);
  }, [recording, maxSeconds]);

  useEffect(() => {
    if (autoStart) start();
    return () => listener.current?.stop();
    // Only on mount: autoStart is a one-time request.
  }, []);

  return (
    <div className="en-stack" style={{ gap: '.5rem' }}>
      <label className="en-stack" htmlFor={id} style={{ gap: '.35rem' }}>
        {label}
        <textarea
          id={id}
          rows={rows}
          maxLength={3500}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('speak.placeholder')}
          lang="en"
        />
      </label>
      {!supported ? <p className="hint" style={{ margin: 0 }}>{t('speak.noMic')}</p> : null}
      {error ? <p className="error" role="alert" style={{ margin: 0 }}>{error}</p> : null}
      <div className="en-actions">
        {supported ? (
          recording
            ? <button type="button" onClick={stop}>{t('speak.stop')}</button>
            : <button type="button" className="quiet" onClick={start} disabled={disabled || (maxSeconds !== undefined && total.current >= maxSeconds)}>{t('speak.record')}</button>
        ) : null}
        {recording ? (
          <span className="en-speak-timer" role="status" aria-live="off">{t('speak.recording', { time: formatClock(elapsed) })}</span>
        ) : null}
        {children}
      </div>
    </div>
  );
};
