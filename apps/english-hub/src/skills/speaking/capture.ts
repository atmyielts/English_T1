import { useCallback, useEffect, useRef, useState } from 'react';
import { canRecognize, listen, type Listener } from '../../lib/speech';
import type { SpeechMark } from '../../../../../supabase/functions/_shared/english-fluency.ts';

/**
 * Captures a spoken answer: live transcript from browser speech recognition,
 * honest speaking time (Record → Stop), a timeline of when words were
 * recognised (for pauses), and, where it is safe, a local audio copy the
 * learner can replay. The audio never leaves the browser.
 */

export type CaptureProblem = 'unsupported' | 'denied' | 'no-mic' | 'network' | 'failed';
export type CapturePhase = 'idle' | 'recording' | 'finishing' | 'done';

const canRecordAudio = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.MediaRecorder !== 'undefined'
  && typeof navigator !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia);

// On phones the microphone is often exclusive: recording audio in parallel can
// stop speech recognition from hearing anything. The transcript matters more.
const isPhone = (): boolean => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const join = (a: string, b: string): string => `${a} ${b}`.replace(/\s+/g, ' ').trim();
const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

export const useSpeakingCapture = (maxSeconds: number) => {
  const supported = canRecognize();
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [problem, setProblem] = useState<CaptureProblem | null>(supported ? null : 'unsupported');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mounted = useRef(true);
  const phaseRef = useRef<CapturePhase>('idle');
  const wanted = useRef(false);
  const listener = useRef<Listener | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const committed = useRef('');
  const session = useRef('');
  const startedAt = useRef<number | null>(null);
  const stoppedAt = useRef<number | null>(null);
  const tick = useRef<number | null>(null);
  const finishTimer = useRef<number | null>(null);
  const restarts = useRef(0);
  const urlRef = useRef<string | null>(null);
  const marks = useRef<SpeechMark[]>([]);
  const beginRef = useRef<() => void>(() => undefined);

  const setPhaseBoth = (next: CapturePhase) => {
    phaseRef.current = next;
    if (mounted.current) setPhase(next);
  };

  const clearTimers = () => {
    if (tick.current !== null) window.clearInterval(tick.current);
    if (finishTimer.current !== null) window.clearTimeout(finishTimer.current);
    tick.current = null;
    finishTimer.current = null;
  };

  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  const stopRecorder = () => {
    const active = recorder.current;
    recorder.current = null;
    if (active && active.state !== 'inactive') {
      try { active.stop(); } catch { stopTracks(); }
    } else {
      stopTracks();
    }
  };

  const stopListener = () => {
    const active = listener.current;
    listener.current = null;
    try { active?.stop(); } catch { /* already stopped */ }
  };

  const revokeAudio = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (mounted.current) setAudioUrl(null);
  };

  const markStopped = () => {
    if (stoppedAt.current === null) stoppedAt.current = Date.now();
    if (startedAt.current !== null && mounted.current) setSeconds(Math.round((stoppedAt.current - startedAt.current) / 1000));
  };

  const finish = () => {
    if (phaseRef.current === 'done' || phaseRef.current === 'idle') return;
    clearTimers();
    wanted.current = false;
    markStopped();
    stopListener();
    stopRecorder();
    const text = join(committed.current, session.current);
    if (mounted.current) setTranscript(text);
    setPhaseBoth('done');
  };

  const fail = (reason: CaptureProblem) => {
    clearTimers();
    wanted.current = false;
    markStopped();
    stopListener();
    stopRecorder();
    const text = join(committed.current, session.current);
    if (mounted.current) {
      setProblem(reason);
      setTranscript(text);
    }
    setPhaseBoth(text ? 'done' : 'idle');
  };

  const begin = () => {
    let next: Listener | null = null;
    session.current = '';
    try {
      next = listen({
        onText: (text) => {
          session.current = text;
          const full = join(committed.current, text);
          // Timeline: when the number of recognised words grows (pauses are gaps in it).
          // Only while recording: words that arrive after Stop would look like a pause.
          const words = countWords(full);
          const last = marks.current[marks.current.length - 1];
          if (phaseRef.current === 'recording' && startedAt.current !== null && words > (last?.words ?? 0) && marks.current.length < 600) {
            marks.current.push({ at: Date.now() - startedAt.current, words });
          }
          if (mounted.current) setTranscript(full);
        },
        onEnd: (error) => {
          committed.current = join(committed.current, session.current);
          session.current = '';
          listener.current = null;
          if (error === 'not-allowed' || error === 'service-not-allowed') return fail('denied');
          if (error === 'audio-capture') return fail('no-mic');
          if (error === 'network') return fail('network');
          // Browsers end recognition after a silence; keep listening until the learner presses Stop.
          if (wanted.current && phaseRef.current === 'recording' && restarts.current < 30) {
            restarts.current += 1;
            beginRef.current();
            return;
          }
          finish();
        },
      });
    } catch {
      next = null;
    }
    if (!next) {
      fail('failed');
      return;
    }
    listener.current = next;
  };
  beginRef.current = begin;

  const start = useCallback(async () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'finishing') return;
    clearTimers();
    stopListener();
    stopRecorder();
    revokeAudio();
    committed.current = '';
    session.current = '';
    marks.current = [];
    restarts.current = 0;
    startedAt.current = null;
    stoppedAt.current = null;
    setTranscript('');
    setSeconds(0);
    if (!canRecognize()) {
      setProblem('unsupported');
      return;
    }
    setProblem(null);

    if (canRecordAudio() && !isPhone()) {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted.current) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(media);
        rec.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
        rec.onstop = () => {
          stopTracks();
          if (!chunks.length) return;
          const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
          if (!mounted.current) {
            URL.revokeObjectURL(url);
            return;
          }
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
          setAudioUrl(url);
        };
        rec.start();
        recorder.current = rec;
      } catch (error) {
        stopTracks();
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') { setProblem('denied'); return; }
        if (name === 'NotFoundError') { setProblem('no-mic'); return; }
        // Any other recorder problem: carry on without the replay copy.
        recorder.current = null;
      }
    }

    wanted.current = true;
    startedAt.current = Date.now();
    setPhaseBoth('recording');
    tick.current = window.setInterval(() => {
      if (startedAt.current === null) return;
      const elapsed = (Date.now() - startedAt.current) / 1000;
      setSeconds(Math.floor(elapsed));
      if (elapsed >= maxSeconds) stopNow();
    }, 250);
    beginRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSeconds]);

  const stopNow = () => {
    if (phaseRef.current !== 'recording') return;
    wanted.current = false;
    if (tick.current !== null) window.clearInterval(tick.current);
    tick.current = null;
    markStopped();
    stopRecorder();
    if (!listener.current) {
      finish();
      return;
    }
    setPhaseBoth('finishing');
    stopListener();
    // The last words arrive just after stopping; never wait forever for them.
    finishTimer.current = window.setTimeout(finish, 2500);
  };
  const stop = useCallback(() => stopNow(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    wanted.current = false;
    clearTimers();
    stopListener();
    stopRecorder();
    revokeAudio();
    committed.current = '';
    session.current = '';
    marks.current = [];
    startedAt.current = null;
    stoppedAt.current = null;
    setTranscript('');
    setSeconds(0);
    setPhaseBoth('idle');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      wanted.current = false;
      clearTimers();
      stopListener();
      stopRecorder();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Seconds from Record to Stop. */
  const speakingSeconds = (): number | null =>
    startedAt.current !== null && stoppedAt.current !== null
      ? Math.max(1, Math.round((stoppedAt.current - startedAt.current) / 1000))
      : null;

  /** When words were recognised, ms since Record. */
  const timeline = (): SpeechMark[] => [...marks.current];

  return { supported, phase, transcript, problem, seconds, audioUrl, start, stop, reset, speakingSeconds, timeline };
};
