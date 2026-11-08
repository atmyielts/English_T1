// Compact authoring for the role-by-role bank files: rows instead of repeated keys, the
// same bank shapes out. Answer keys stay server-side like the rest of the bank.
import type { JobRole } from '../../../../../../packages/company-core/src/mod.ts';
import type { BankLevel, ChoiceItem, ListeningGenre, ListeningScript, ProductionTask, Question, ReadingGenre, ReadingText } from '../types.ts';

/** Everything one job role adds to the bank. */
export interface RoleBank {
  grammar: ChoiceItem[];
  vocabulary: ChoiceItem[];
  reading: ReadingText[];
  listening: ListeningScript[];
  writing: ProductionTask[];
  speaking: ProductionTask[];
}
export const emptyBank = (): RoleBank => ({ grammar: [], vocabulary: [], reading: [], listening: [], writing: [], speaking: [] });

type ChoiceRow = readonly [level: BankLevel, prompt: string, options: string[], answer: number];
type TaskRow = readonly [level: BankLevel, prompt: string, points: string[], target: number];
type QuestionRow = readonly [prompt: string, options: string[], answer: number];

const pad = (index: number) => String(index + 1).padStart(2, '0');

/** Grammar items: ids are g-<prefix>-01, g-<prefix>-02, … so keep rows append-only. */
export const grammar = (role: JobRole, prefix: string, rows: ChoiceRow[]): ChoiceItem[] =>
  rows.map(([level, prompt, options, answer], index) => ({ id: `g-${prefix}-${pad(index)}`, skill: 'grammar', level, job_role: role, prompt, options, answer }));
/** Vocabulary items: `from` continues the numbering when a role already has items. */
export const vocabulary = (role: JobRole, prefix: string, rows: ChoiceRow[], from = 0): ChoiceItem[] =>
  rows.map(([level, prompt, options, answer], index) => ({ id: `v-${prefix}-${pad(index + from)}`, skill: 'vocabulary', level, job_role: role, prompt, options, answer }));

const questions = (id: string, rows: QuestionRow[]): Question[] =>
  rows.map(([prompt, options, answer], index) => ({ id: `${id}-q${index + 1}`, prompt, options, answer }));

export const reading = (id: string, role: JobRole, level: BankLevel, genre: ReadingGenre, title: string, text: string, rows: QuestionRow[]): ReadingText =>
  ({ id, skill: 'reading', level, job_role: role, genre, title, text, questions: questions(id, rows) });

/** `lines`: speaker and text pairs. Text-to-speech reads words, so write numbers out. */
export const listening = (id: string, role: JobRole, level: BankLevel, genre: ListeningGenre, title: string, lines: (readonly [string, string])[], rows: QuestionRow[]): ListeningScript =>
  ({ id, skill: 'listening', level, job_role: role, genre, title, lines: lines.map(([speaker, text]) => ({ speaker, text })), questions: questions(id, rows) });

export const writing = (role: JobRole, prefix: string, rows: TaskRow[]): ProductionTask[] =>
  rows.map(([level, prompt, points, target], index) => ({ id: `w-${prefix}-${index + 1}`, skill: 'writing', level, job_role: role, prompt, points, target }));
export const speaking = (role: JobRole, prefix: string, rows: TaskRow[]): ProductionTask[] =>
  rows.map(([level, prompt, points, target], index) => ({ id: `s-${prefix}-${index + 1}`, skill: 'speaking', level, job_role: role, prompt, points, target }));
