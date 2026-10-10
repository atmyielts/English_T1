import { useEffect, useRef, useState } from "react";
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((
      event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      },
    ) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function useTranscriptDictation(
  transcript: string,
  onTranscript: (text: string) => void,
) {
  const [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported = Boolean(
    (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition,
  );
  const clearTimers = () => {
    if (timer.current) clearInterval(timer.current);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    timer.current = null;
    stopTimer.current = null;
  };
  const detach = (instance: Recognition) => {
    instance.onresult = null;
    instance.onerror = null;
    instance.onend = null;
  };
  const finish = (instance: Recognition) => {
    if (rec.current !== instance) return;
    clearTimers();
    detach(instance);
    rec.current = null;
    setRecording(false);
  };
  const stop = () => {
    const instance = rec.current;
    if (!instance) return;
    if (stopTimer.current) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try {
      instance.stop();
    } catch {
      finish(instance);
      return;
    }
    // Some engines never send onend after an error. Bound the stopping state.
    if (rec.current === instance) {
      stopTimer.current = setTimeout(() => {
        finish(instance);
        try {
          instance.abort();
        } catch { /* Already stopped. */ }
      }, 1500);
    }
  };
  const start = () => {
    if (rec.current) return;
    const Constructor = (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) {
      setError(
        "Dictation is unavailable in this browser. Type or paste a transcript instead.",
      );
      return;
    }
    if (transcript.length >= 20000) {
      setError("The transcript has reached its 20,000-character limit.");
      return;
    }
    let instance: Recognition;
    try {
      instance = new Constructor();
    } catch {
      setError("Dictation could not start. Your text is unchanged.");
      return;
    }
    const prefix = transcript.trim() ? transcript.trim() + " " : "";
    const started = Date.now();
    rec.current = instance;
    setError(null);
    setElapsed(0);
    setRecording(true);
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      if (rec.current !== instance) return;
      // Rebuild from this recognition session's full result list; append to the pre-existing draft.
      const text = prefix +
        Array.from(event.results).map((value) => value[0].transcript).join(" ");
      onTranscript(text.slice(0, 20000));
      if (text.length >= 20000) {
        setError("Dictation stopped at the 20,000-character limit.");
        stop();
      }
    };
    instance.onerror = (event) => {
      if (rec.current !== instance) return;
      setError(
        event.error === "not-allowed"
          ? "Microphone permission was denied. Your text is unchanged; type or paste a transcript instead."
          : "Dictation stopped. The text received so far is preserved. You can continue typing.",
      );
      finish(instance);
      try {
        instance.abort();
      } catch { /* Engine already stopped. */ }
    };
    instance.onend = () => finish(instance);
    try {
      instance.start();
      if (rec.current === instance) {
        timer.current = setInterval(() => {
          const seconds = Math.min(
            900,
            Math.floor((Date.now() - started) / 1000),
          );
          setElapsed(seconds);
          if (seconds >= 900) {
            setError(
              "Dictation stopped after 15 minutes. Your text is preserved.",
            );
            stop();
          }
        }, 1000);
      }
    } catch {
      finish(instance);
      setError("The microphone could not start. Your text is unchanged.");
    }
  };
  useEffect(() => () => {
    const instance = rec.current;
    rec.current = null;
    clearTimers();
    if (instance) {
      detach(instance);
      try {
        instance.abort();
      } catch { /* Engine already stopped. */ }
    }
  }, []);
  const cancel = () => {
    const instance = rec.current;
    if (instance) {
      finish(instance);
      try {
        instance.abort();
      } catch { /* Already stopped. */ }
    }
    setElapsed(0);
  };
  return { supported, recording, elapsed, error, start, stop, cancel };
}
