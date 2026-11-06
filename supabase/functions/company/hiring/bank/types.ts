// Shapes of the Company English test bank. All content is original Schood
// material written for workplace English in Uzbekistan and Central Asia.
// Answer keys live only on the server; items are served to test takers without them.
import type { JobRole } from '../../../../../packages/company-core/src/mod.ts';

/** CEFR levels the bank is tagged with (no pre-A1 content). */
export type BankLevel = 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2';
export const BANK_LEVELS: readonly BankLevel[] = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

/** One multiple-choice grammar or vocabulary item. `prompt` has one gap written as "___". */
export interface ChoiceItem {
  /** Stable id, e.g. "g-b1-07" or "v-hos-02". Never reuse an id for different content. */
  id: string;
  skill: 'grammar' | 'vocabulary';
  level: BankLevel;
  job_role: JobRole;
  prompt: string;
  /** Three or four distinct options. */
  options: string[];
  /** Index of the correct option. */
  answer: number;
}

export interface Question {
  /** Stable id, e.g. "r-b1-02-q3". */
  id: string;
  prompt: string;
  options: string[];
  answer: number;
}

export type ReadingGenre = 'email' | 'notice' | 'policy' | 'report' | 'chat';
export type ListeningGenre = 'call' | 'meeting' | 'announcement' | 'voicemail';

/** A workplace text with 3–5 questions. */
export interface ReadingText {
  id: string;
  skill: 'reading';
  level: BankLevel;
  job_role: JobRole;
  genre: ReadingGenre;
  title: string;
  /** Plain text; paragraphs separated by a blank line. */
  text: string;
  questions: Question[];
}

/** A listening script played with browser text-to-speech, with 3–4 questions. */
export interface ListeningScript {
  id: string;
  skill: 'listening';
  level: BankLevel;
  job_role: JobRole;
  genre: ListeningGenre;
  title: string;
  /** Who is speaking; the player gives each speaker a different voice pitch. */
  lines: { speaker: string; text: string }[];
  questions: Question[];
}

/** An open writing or speaking task graded by AI against the rubric. */
export interface ProductionTask {
  id: string;
  skill: 'writing' | 'speaking';
  /** The level the task is pitched at; the rubric still scores the full range. */
  level: BankLevel;
  job_role: JobRole;
  /** What the test taker must do, in English. */
  prompt: string;
  /** Points the answer should cover. */
  points: string[];
  /** Writing: suggested minimum words. Speaking: suggested speaking time in seconds. */
  target: number;
}
