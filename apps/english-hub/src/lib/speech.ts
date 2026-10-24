// Browser speech helpers. Text-to-speech plays listening scripts; speech
// recognition turns a learner's spoken answer into text. Both are free,
// on-device or browser-provided, and degrade to typing when unavailable.

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** English accents the browser may have voices for. */
export type Accent = 'us' | 'gb' | 'au' | 'in';
export const ACCENTS: readonly Accent[] = ['us', 'gb', 'au', 'in'];
const ACCENT_LANG: Record<Accent, string> = { us: 'en-us', gb: 'en-gb', au: 'en-au', in: 'en-in' };
const ACCENT_TAG: Record<Accent, string> = { us: 'en-US', gb: 'en-GB', au: 'en-AU', in: 'en-IN' };

const normaliseLang = (lang: string) => lang.toLowerCase().replace('_', '-');

const pickVoice = (accent: Accent | 'any'): SpeechSynthesisVoice | null => {
  if (!canSpeak()) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => normaliseLang(voice.lang).startsWith('en'));
  const wanted = accent === 'any' ? null : ACCENT_LANG[accent];
  return (wanted ? voices.find((voice) => normaliseLang(voice.lang) === wanted) : undefined)
    ?? voices.find((voice) => voice.localService)
    ?? voices[0]
    ?? null;
};

/**
 * Accents this browser can really speak (it has a voice for them). Voices load
 * lazily in some browsers, so call again after the "voiceschanged" event.
 */
export const availableAccents = (): Accent[] => {
  if (!canSpeak()) return [];
  const langs = new Set(window.speechSynthesis.getVoices().map((voice) => normaliseLang(voice.lang)));
  return ACCENTS.filter((accent) => langs.has(ACCENT_LANG[accent]));
};

/** Speaks text in English. Resolves when speech ends (or immediately if unsupported). */
export const speak = (text: string, options: { rate?: number; accent?: Accent | 'any' } = {}): Promise<void> =>
  new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const accent = options.accent ?? 'any';
    utterance.lang = accent === 'any' ? 'en-US' : ACCENT_TAG[accent];
    const voice = pickVoice(accent);
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
