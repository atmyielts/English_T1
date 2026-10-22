// Browser speech helpers. Text-to-speech plays listening scripts; speech
// recognition turns a learner's spoken answer into text. Both are free,
// on-device or browser-provided, and degrade to typing when unavailable.

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

const pickVoice = (accent: 'us' | 'gb' | 'any'): SpeechSynthesisVoice | null => {
  if (!canSpeak()) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const wanted = accent === 'gb' ? 'en-gb' : accent === 'us' ? 'en-us' : null;
  return (wanted && voices.find((voice) => voice.lang.toLowerCase() === wanted))
    ?? voices.find((voice) => voice.localService)
    ?? voices[0]
    ?? null;
};

/** Speaks text in English. Resolves when speech ends (or immediately if unsupported). */
export const speak = (text: string, options: { rate?: number; accent?: 'us' | 'gb' | 'any' } = {}): Promise<void> =>
  new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.accent === 'gb' ? 'en-GB' : 'en-US';
    const voice = pickVoice(options.accent ?? 'any');
    if (voice) utterance.voice = voice;
    utterance.rate = options.rate ?? 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
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
 * Starts English speech recognition. `onText` receives the full transcript so
 * far (final + interim) on every update. `onEnd` fires once recognition stops.
 */
export const listen = (handlers: {
  onText: (text: string, isFinal: boolean) => void;
  onEnd: (error: string | null) => void;
}): Listener | null => {
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
  recognition.start();
  return { stop: () => recognition.stop() };
};
