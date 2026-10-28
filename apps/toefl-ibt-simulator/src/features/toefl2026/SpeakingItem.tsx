import React, { useEffect, useRef, useState } from 'react';
import { useAppT } from '../../i18n';
import { PlayOnceAudio } from './renderers';
import { startCapture, type Capture } from './speech';
import { isRecord } from './tasks';

type Json = Record<string, unknown>;
type Phase = 'ready' | 'listen' | 'prep' | 'record' | 'saving' | 'saved';

export type SpeakingAnswer = { transcript: string; duration_seconds: number; stt: string; recorded: boolean };

export const SpeakingItem: React.FC<{
  unitId: string;
  type: string;
  data: Json;
  value: unknown;
  readOnly?: boolean;
  /** First item of the section waits for a tap so audio and the microphone may start. */
  needsGesture: boolean;
  volume?: number;
  onAnswer: (answer: SpeakingAnswer) => void;
  onRecording: (url: string | null) => void;
  onDone: () => void;
  onAudioEvent?: (event: 'start' | 'end', duration: number | null) => void;
}> = ({ unitId, type, data, value, readOnly, needsGesture, volume, onAnswer, onRecording, onDone, onAudioEvent }) => {
  const t = useAppT();
  const answered = isRecord(value) && typeof value.transcript === 'string';
  const [phase, setPhase] = useState<Phase>(answered || readOnly ? 'saved' : needsGesture ? 'ready' : 'listen');
  const [left, setLeft] = useState<number>(Number(data.response_seconds) || 10);
  const [live, setLive] = useState('');
  const captureRef = useRef<Capture | null>(null);
  const stoppedRef = useRef(false);
  const audio = isRecord(data.audio) ? data.audio : {};
  const isRepeat = type === 'question_speaking_repeat';
  const seconds = Math.max(3, Number(data.response_seconds) || (isRepeat ? 10 : 45));

  const stop = async () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    setPhase('saving');
    const capture = captureRef.current;
    const result = capture ? await capture.stop() : { transcript: '', duration_seconds: 0, stt: 'error' as const, audioUrl: null };
    onRecording(result.audioUrl);
    onAnswer({ transcript: result.transcript, duration_seconds: result.duration_seconds, stt: result.stt, recorded: Boolean(result.audioUrl) });
    setLive(result.transcript);
    setPhase('saved');
    window.setTimeout(onDone, 900);
  };

  useEffect(() => {
    if (phase !== 'prep') return;
    const timer = window.setTimeout(async () => {
      try {
        captureRef.current = await startCapture();
        captureRef.current.onText(setLive);
      } catch {
        captureRef.current = null;
      }
      setLeft(seconds);
      setPhase('record');
    }, isRepeat ? 400 : 1000);
    return () => window.clearTimeout(timer);
  }, [phase, isRepeat, seconds]);

  useEffect(() => {
    if (phase !== 'record') return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        void stop();
      }
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  return (
    <div className="t26-speaking" data-testid={isRepeat ? 'listen-repeat' : 'take-interview'} data-phase={phase}>
      <p className="t26-instructions">{isRepeat ? t('speak.repeat_prompt') : t('speak.interview_prompt')}</p>
      <p className="t26-scenario">{String(data.scenario ?? '')}</p>
      <p className="t26-muted">{t('speak.item_of', { current: Number(data.index) || 1, total: Number(data.of) || 1 })}</p>
      {phase === 'ready' ? (
        <div className="t26-card">
          <p>{t('speak.mic_needed')}</p>
          <p className="t26-muted">{t('speak.privacy')}</p>
          <button type="button" className="t26-button" onClick={() => setPhase('listen')}>{t('speak.start')}</button>
        </div>
      ) : null}
      {phase === 'listen' ? (
        <PlayOnceAudio
          key={`${unitId}-audio`}
          url={typeof audio.url === 'string' ? audio.url : null}
          autoStart
          volume={volume}
          onStart={(d) => onAudioEvent?.('start', d)}
          onEnded={() => { onAudioEvent?.('end', null); setPhase('prep'); }}
        />
      ) : null}
      {phase === 'prep' ? <div className="t26-card t26-center">{t('speak.get_ready')}</div> : null}
      {phase === 'record' ? (
        <div className="t26-card t26-record" role="status">
          <span className="t26-rec-dot" aria-hidden="true" /> {t('speak.recording')}
          <div className="t26-rec-time">{t('speak.seconds_left', { count: left })}</div>
          <div className="t26-rec-bar"><span style={{ width: `${Math.round((left / seconds) * 100)}%` }} /></div>
          {live ? <p className="t26-muted t26-break">{live}</p> : null}
          <button type="button" className="t26-button-secondary" onClick={() => void stop()}>{t('speak.stop_early')}</button>
        </div>
      ) : null}
      {phase === 'saving' ? <div className="t26-card t26-center">{t('runner.saving')}</div> : null}
      {phase === 'saved' ? (
        <div className="t26-card">
          <p className="t26-strong">{t('speak.recorded')}</p>
          <p className="t26-muted">{t('speak.transcript')}:</p>
          <p className="t26-break">{live || (isRecord(value) ? String(value.transcript ?? '') : '') || t('speak.transcript_empty')}</p>
        </div>
      ) : null}
    </div>
  );
};
