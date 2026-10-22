import { useCallback, useEffect, useRef, useState } from 'react';
import { canSpeak, speak, stopSpeaking } from '../../lib/speech';
import type { SpeechChunk } from './script';

export type PlayerState = { key: string | null; part: number; parts: number };

/**
 * Plays a list of sentences with browser text-to-speech, one at a time.
 * Starting something new stops whatever is playing. Stops on unmount.
 */
export const usePlayer = () => {
  const [state, setState] = useState<PlayerState>({ key: null, part: 0, parts: 0 });
  const run = useRef(0);

  useEffect(() => {
    // Some browsers load their voices lazily; asking once early helps the first play.
    if (canSpeak()) window.speechSynthesis.getVoices();
    return () => {
      run.current += 1;
      stopSpeaking();
    };
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    stopSpeaking();
    setState({ key: null, part: 0, parts: 0 });
  }, []);

  const play = useCallback(async (key: string, chunks: SpeechChunk[], rate: number) => {
    run.current += 1;
    const id = run.current;
    stopSpeaking();
    for (let index = 0; index < chunks.length; index += 1) {
      if (run.current !== id) return;
      setState({ key, part: index + 1, parts: chunks.length });
      const chunk = chunks[index]!;
      await speak(chunk.text, { rate, accent: chunk.accent });
    }
    if (run.current === id) setState({ key: null, part: 0, parts: 0 });
  }, []);

  return { state, play, stop };
};
