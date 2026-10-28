// Records a spoken answer and, where the browser supports it, transcribes it
// with the Web Speech API. The transcript is what Schood scores; the audio
// recording stays in this tab (a blob URL) for the learner to replay.

export type SttStatus = 'browser' | 'unsupported' | 'denied' | 'error';
export type CaptureResult = { transcript: string; duration_seconds: number; stt: SttStatus; audioUrl: string | null };

type RecognitionEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canRecognize = (): boolean => recognitionCtor() !== null;

export type Capture = { stop: () => Promise<CaptureResult>; onText: (cb: (text: string) => void) => void };

export const startCapture = async (): Promise<Capture> => {
  const startedAt = Date.now();
  let stream: MediaStream | null = null;
  let micDenied = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const name = (error as { name?: string })?.name ?? '';
    micDenied = name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
  }

  const chunks: Blob[] = [];
  let recorder: MediaRecorder | null = null;
  if (stream && typeof MediaRecorder !== 'undefined') {
    try {
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.start();
    } catch {
      recorder = null;
    }
  }

  const Ctor = recognitionCtor();
  let recognition: Recognition | null = null;
  let finalText = '';
  let interim = '';
  let sttError: string | null = null;
  let ended: Promise<void> = Promise.resolve();
  let listener: ((text: string) => void) | null = null;
  if (Ctor && !micDenied) {
    try {
      recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) finalText = `${finalText} ${text}`.trim();
          else interim += text;
        }
        listener?.(`${finalText} ${interim}`.trim());
      };
      recognition.onerror = (event) => { sttError = event.error; };
      ended = new Promise<void>((resolve) => {
        recognition!.onend = () => resolve();
      });
      recognition.start();
    } catch {
      recognition = null;
      sttError = 'start_failed';
    }
  }

  return {
    onText: (cb) => { listener = cb; },
    stop: async () => {
      const duration = Math.round((Date.now() - startedAt) / 100) / 10;
      const recorded = new Promise<string | null>((resolve) => {
        if (!recorder || recorder.state === 'inactive') return resolve(null);
        recorder.onstop = () => resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: recorder!.mimeType || 'audio/webm' })) : null);
        try { recorder.stop(); } catch { resolve(null); }
      });
      if (recognition) {
        try { recognition.stop(); } catch { /* already stopped */ }
        await Promise.race([ended, new Promise((r) => setTimeout(r, 1500))]);
      }
      const audioUrl = await Promise.race([recorded, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
      stream?.getTracks().forEach((t) => t.stop());
      const transcript = `${finalText} ${interim}`.replace(/\s+/g, ' ').trim();
      const stt: SttStatus = micDenied
        ? 'denied'
        : !Ctor
          ? 'unsupported'
          : sttError && sttError !== 'no-speech' && sttError !== 'aborted' && !transcript
            ? (sttError === 'not-allowed' || sttError === 'service-not-allowed' ? 'denied' : 'error')
            : 'browser';
      return { transcript, duration_seconds: duration, stt, audioUrl };
    },
  };
};
