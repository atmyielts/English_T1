// The Company English test bank, indexed for the engine. Server-only: answer keys
// never leave the function before an attempt is submitted (and HR sees totals, not keys).
import { GRAMMAR } from './grammar.ts';
import { LISTENING } from './listening.ts';
import { READING } from './reading.ts';
import { SPEAKING } from './speaking.ts';
import type { ChoiceItem, ListeningScript, ProductionTask, Question, ReadingText } from './types.ts';
import { VOCABULARY } from './vocabulary.ts';
import { WRITING } from './writing.ts';

export * from './types.ts';
export { GRAMMAR, LISTENING, READING, SPEAKING, VOCABULARY, WRITING };

export type Passage = ReadingText | ListeningScript;

export const CHOICES = new Map<string, ChoiceItem>([...GRAMMAR, ...VOCABULARY].map((item) => [item.id, item]));
export const PASSAGES = new Map<string, Passage>([...READING, ...LISTENING].map((passage) => [passage.id, passage]));
export const TASKS = new Map<string, ProductionTask>([...WRITING, ...SPEAKING].map((task) => [task.id, task]));
export const QUESTIONS = new Map<string, { question: Question; passage: Passage }>(
  [...READING, ...LISTENING].flatMap((passage) => passage.questions.map((question) => [question.id, { question, passage }] as const)),
);

/** How many items of each kind the bank holds (for the HR "about this test" panel). */
export function bankCounts() {
  return {
    grammar: GRAMMAR.length,
    vocabulary: VOCABULARY.length,
    reading: READING.length,
    listening: LISTENING.length,
    writing: WRITING.length,
    speaking: SPEAKING.length,
  };
}
