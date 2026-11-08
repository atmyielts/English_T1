// The Company English test bank, indexed for the engine. Server-only: answer keys
// never leave the function before an attempt is submitted (and HR sees totals, not keys).
import { GRAMMAR as CORE_GRAMMAR } from './grammar.ts';
import { LISTENING as CORE_LISTENING } from './listening.ts';
import { READING as CORE_READING } from './reading.ts';
import { ROLE_BANKS } from './roles/index.ts';
import { SPEAKING as CORE_SPEAKING } from './speaking.ts';
import type { ChoiceItem, ListeningScript, ProductionTask, Question, ReadingText } from './types.ts';
import { VOCABULARY as CORE_VOCABULARY } from './vocabulary.ts';
import { WRITING as CORE_WRITING } from './writing.ts';

export * from './types.ts';

export const GRAMMAR: ChoiceItem[] = [...CORE_GRAMMAR, ...ROLE_BANKS.flatMap((bank) => bank.grammar)];
export const VOCABULARY: ChoiceItem[] = [...CORE_VOCABULARY, ...ROLE_BANKS.flatMap((bank) => bank.vocabulary)];
export const READING: ReadingText[] = [...CORE_READING, ...ROLE_BANKS.flatMap((bank) => bank.reading)];
export const LISTENING: ListeningScript[] = [...CORE_LISTENING, ...ROLE_BANKS.flatMap((bank) => bank.listening)];
export const WRITING: ProductionTask[] = [...CORE_WRITING, ...ROLE_BANKS.flatMap((bank) => bank.writing)];
export const SPEAKING: ProductionTask[] = [...CORE_SPEAKING, ...ROLE_BANKS.flatMap((bank) => bank.speaking)];

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
