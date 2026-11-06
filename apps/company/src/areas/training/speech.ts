// Browser speech for training (same approach as apps/english-hub/src/lib/speech.ts):
// text-to-speech reads phrases, dialogues and role-play replies; speech
// recognition turns a spoken reply into text. Both are free and browser-provided,
// and every caller falls back to reading and typing when they are missing.

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

const englishVoices = (): SpeechSynthesisVoice[] => {
  if (!canSpeak()) return [];
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith('en'));
  // Prefer on-device voices, then the rest, so the first voices start quickly.
  return [...voices.filter((voice) => voice.localService), ...voices.filter((voice) => !voice.localService)];
};

/**
 * Speaks English text. `voice` picks the n-th English voice (so two speakers in a
 * dialogue sound different when the browser has more than one). Resolves when
 * speech ends, fails, or immediately when speech is unavailable.
 */
export const speak = (text: string, options: { rate?: number; voice?: number } = {}): Promise<void> =>
  new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    const voices = englishVoices();
    if (voices.length) utterance.voice = voices[(options.voice ?? 0) % voices.length];
    utterance.rate = options.rate ?? 1;
    // Some browsers never fire onend for long text; a generous timer keeps the player moving.
    const timer = setTimeout(resolve, 2000 + text.length * 120);
    const done = () => { clearTimeout(timer); resolve(); };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
  });

export const stopSpeaking = (): void => {
  if (canSpeak()) window.speechSynthesis.cancel();
};

type RecognitionResultEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canRecognize = (): boolean => recognitionCtor() !== null;

export type Listener = { stop: () => void };

/**
 * Starts English speech recognition. `onText` receives the whole transcript so
 * far (final and interim) on every update; `onEnd` fires once when it stops.
 */
export const listen = (handlers: { onText: (text: string, isFinal: boolean) => void; onEnd: (error: string | null) => void }): Listener | null => {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = '';
  let lastError: string | null = null;
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]!;
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) finalText = `${finalText} ${transcript}`.trim();
      else interim += transcript;
    }
    handlers.onText(`${finalText} ${interim}`.trim(), interim === '');
  };
  recognition.onerror = (event) => { lastError = event.error; };
  recognition.onend = () => handlers.onEnd(lastError);
  try {
    recognition.start();
  } catch {
    return null;
  }
  return { stop: () => recognition.stop() };
};
