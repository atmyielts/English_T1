// Browser speech for the test page (same approach as the Schood English apps):
// text-to-speech plays listening scripts, speech recognition turns spoken answers
// into a transcript. Both are free and run in the browser; when either is missing
// the page falls back to text (script shown, answer typed).

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

const englishVoices = (): SpeechSynthesisVoice[] =>
  canSpeak() ? window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith('en')) : [];

/** Speaks one utterance in English. Resolves when it ends (or at once if unsupported). */
export const speak = (text: string, options: { rate?: number; pitch?: number; voice?: SpeechSynthesisVoice | null } = {}): Promise<void> =>
  new Promise((resolve) => {
    if (!canSpeak() || !text.trim()) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.voice?.lang ?? 'en-GB';
    if (options.voice) utterance.voice = options.voice;
    utterance.rate = options.rate ?? 0.95;
    utterance.pitch = options.pitch ?? 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });

export const stopSpeaking = (): void => {
  if (canSpeak()) window.speechSynthesis.cancel();
};

/**
 * Plays a script line by line, giving each speaker their own voice (or pitch when
 * the browser has one English voice). Resolves when done or stopped.
 */
export async function speakLines(lines: { speaker: string; text: string }[], isStopped: () => boolean): Promise<void> {
  stopSpeaking();
  const voices = englishVoices();
  const speakers = [...new Set(lines.map((line) => line.speaker))];
  const pitches = [1, 0.8, 1.2, 0.9];
  for (const line of lines) {
    if (isStopped()) return;
    const index = speakers.indexOf(line.speaker);
    const voice = voices.length > 1 ? voices[index % voices.length] : voices[0] ?? null;
    await speak(line.text, { voice, pitch: voices.length > 1 ? 1 : pitches[index % pitches.length] });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

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
 * Starts English speech recognition. `onText` gets the whole transcript so far on
 * every update; `onEnd` fires once when recognition stops (with the last error).
 * `initial` is kept in front, so "continue speaking" appends.
 */
export function listen(handlers: { onText: (text: string) => void; onEnd: (error: string | null) => void }, initial = ''): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  let finalText = initial.trim();
  let lastError: string | null = null;
  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]!;
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) finalText = `${finalText} ${transcript}`.trim();
      else interim += transcript;
    }
    handlers.onText(`${finalText} ${interim}`.trim());
  };
  recognition.onerror = (event) => { lastError = event.error; };
  recognition.onend = () => handlers.onEnd(lastError);
  try {
    recognition.start();
  } catch {
    return null;
  }
  return { stop: () => recognition.stop() };
}
