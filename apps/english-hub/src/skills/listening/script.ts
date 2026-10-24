// Turns a listening script into chunks the browser can read aloud.
// Dialogue scripts have one "Name: line" per line; each speaker gets their own
// accent (US for the first speaker, UK for the second) when the browser has both.

import type { Accent } from '../../lib/speech';

export type ScriptLine = { speaker: string | null; text: string };
export type SpeechChunk = { text: string; accent: Accent };

const LABEL = /^([A-Z][A-Za-z .']{0,30}):\s+(.+)$/;

export const parseScript = (transcript: string, dialogue: boolean): ScriptLine[] => {
  const lines = transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labelled = dialogue || (lines.length > 1 && lines.every((line) => LABEL.test(line)));
  return lines.map((line) => {
    const match = labelled ? line.match(LABEL) : null;
    return match ? { speaker: match[1]!.trim(), text: match[2]!.trim() } : { speaker: null, text: line };
  });
};

export const speakersOf = (lines: ScriptLine[]): string[] =>
  Array.from(new Set(lines.map((line) => line.speaker).filter((name): name is string => Boolean(name))));

/** Sentences, so long scripts are spoken in short pieces (some browsers stop long utterances). */
export const sentences = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+(?=["'A-Z0-9])/).map((part) => part.trim()).filter(Boolean);

export const speechChunks = (lines: ScriptLine[]): SpeechChunk[] => {
  const speakers = speakersOf(lines);
  return lines.flatMap((line) => {
    const accent: SpeechChunk['accent'] = line.speaker && speakers.indexOf(line.speaker) % 2 === 1 ? 'gb' : 'us';
    return sentences(line.text).map((text) => ({ text, accent }));
  });
};
