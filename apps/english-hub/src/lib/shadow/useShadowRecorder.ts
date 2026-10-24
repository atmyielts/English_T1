import { useCallback, useEffect, useRef, useState } from 'react';
import { canRecognize, listen, type Listener } from '../speech';
import { rmsEnvelope } from './envelope';

/**
 * One shadowing take: the learner's voice (MediaRecorder, kept in memory as a
 * blob URL for replay and the loudness envelope) and/or the words the browser's
 * speech recognition heard. Nothing is uploaded. The URL is revoked when the
 * next take starts and when the component unmounts.
 */

export type RecorderProblem = 'denied' | 'no-mic' | 'unsupported' | 'failed';
export type RecorderPhase = 'idle' | 'recording' | 'finishing';
export type CaptureMode = { voice: boolean; words: boolean };

export type Take = {
  audioUrl: string | null;
  /** Loudness per 20 ms frame, or null when there is no recording or it could not be decoded. */
  envelope: number[] | null;
  /** Record → Stop, in ms. */
  durationMs: number;
  transcript: string;
  /** Speech recognition ran for this take. */
  wordsChecked: boolean;
};

const MAX_MS = 60_000;
/** The last recognised words arrive just after Stop; never wait longer than this for them. */
const WORDS_GRACE_MS = 1800;

export const canRecordVoice = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.MediaRecorder !== 'undefined'
  && typeof navigator !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia);

/** Phones often give the microphone to one listener at a time; there the learner picks words or voice. */
export const isPhone = (): boolean => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const defaultCaptureMode = (): CaptureMode => {
  const words = canRecognize();
  const voice = canRecordVoice();
  if (isPhone() && words && voice) return { voice: false, words: true };
  return { voice, words };
};

const decodeEnvelope = async (blob: Blob): Promise<number[] | null> => {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let context: AudioContext | null = null;
  try {
    context = new Ctor();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return rmsEnvelope(buffer.getChannelData(0), buffer.sampleRate);
  } catch {
    return null;
  } finally {
    void context?.close().catch(() => undefined);
  }
};

type Pending = {
  voice: Promise<Blob | null>;
  words: Promise<string>;
  wordsChecked: boolean;
  markStopped: () => void;
};

export const useShadowRecorder = () => {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [take, setTake] = useState<Take | null>(null);
  const [live, setLive] = useState('');
  const [problem, setProblem] = useState<RecorderProblem | null>(null);

  const mounted = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const listener = useRef<Listener | null>(null);
  const urlRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const limit = useRef<number | null>(null);
  const pending = useRef<Pending | null>(null);
  const run = useRef(0);

  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  const clearAudio = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const halt = () => {
    if (limit.current !== null) window.clearTimeout(limit.current);
    limit.current = null;
    const active = recorder.current;
    recorder.current = null;
    try {
      if (active && active.state !== 'inactive') active.stop();
      else stopTracks();
    } catch {
      stopTracks();
    }
    const words = listener.current;
    listener.current = null;
    try { words?.stop(); } catch { /* already stopped */ }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      run.current += 1;
      pending.current?.markStopped();
      pending.current = null;
      halt();
      stopTracks();
      clearAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(async () => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    const id = run.current;
    const durationMs = Date.now() - startedAt.current;
    setPhase('finishing');
    current.markStopped();
    halt();
    const [blob, transcript] = await Promise.all([current.voice, current.words]);
    if (!mounted.current || id !== run.current) return;
    let audioUrl: string | null = null;
    let envelope: number[] | null = null;
    if (blob && blob.size > 0) {
      audioUrl = URL.createObjectURL(blob);
      urlRef.current = audioUrl;
      envelope = await decodeEnvelope(blob);
      if (!mounted.current || id !== run.current) return;
    }
    setTake({ audioUrl, envelope, durationMs, transcript, wordsChecked: current.wordsChecked });
    setPhase('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async (mode: CaptureMode) => {
    if (pending.current) return;
    run.current += 1;
    const id = run.current;
    clearAudio();
    setTake(null);
    setLive('');
    setProblem(null);

    let markStopped: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => { markStopped = resolve; });

    let voice: Promise<Blob | null> = Promise.resolve(null);
    if (mode.voice && canRecordVoice()) {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (!mounted.current || id !== run.current) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(media);
        voice = new Promise<Blob | null>((resolve) => {
          rec.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
          rec.onstop = () => {
            stopTracks();
            resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null);
          };
          rec.onerror = () => {
            stopTracks();
            resolve(null);
          };
        });
        rec.start();
        recorder.current = rec;
      } catch (error) {
        stopTracks();
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') { setProblem('denied'); return; }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') { setProblem('no-mic'); return; }
        // The recording is a bonus when words are checked too; otherwise there is nothing to do.
        if (!mode.words) { setProblem('failed'); return; }
      }
    }

    let words: Promise<string> = Promise.resolve('');
    if (mode.words && canRecognize()) {
      let text = '';
      let settle: () => void = () => undefined;
      words = new Promise<string>((resolve) => {
        let settled = false;
        settle = () => {
          if (settled) return;
          settled = true;
          resolve(text);
        };
      });
      try {
        listener.current = listen({
          onText: (next) => {
            text = next;
            if (mounted.current && id === run.current) setLive(next);
          },
          onEnd: (error) => {
            if ((error === 'not-allowed' || error === 'service-not-allowed') && mounted.current && id === run.current) setProblem('denied');
            settle();
          },
        });
      } catch {
        listener.current = null;
      }
      if (!listener.current) settle();
      void stopped.then(() => window.setTimeout(settle, WORDS_GRACE_MS));
    }

    if (!recorder.current && !listener.current) {
      setProblem((current) => current ?? 'unsupported');
      return;
    }
    pending.current = { voice, words, wordsChecked: Boolean(listener.current), markStopped };
    startedAt.current = Date.now();
    setPhase('recording');
    limit.current = window.setTimeout(() => { void stop(); }, MAX_MS);
  }, [stop]);

  const reset = useCallback(() => {
    run.current += 1;
    pending.current?.markStopped();
    pending.current = null;
    halt();
    clearAudio();
    setTake(null);
    setLive('');
    setProblem(null);
    setPhase('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { phase, take, live, problem, start, stop, reset };
};
