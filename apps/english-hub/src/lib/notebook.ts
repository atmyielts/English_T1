import { edge } from './api';

export type NotebookCard = {
  id: string;
  word: string;
  definition: string | null;
  example: string | null;
  context_text: string | null;
  source_type: string;
  source_label: string | null;
  leitner_box: number;
  next_review_at: string;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  updated_at: string;
  last_reviewed_at?: string | null;
  /** FSRS memory state (english-srs.ts); null before the first review under FSRS. */
  srs?: Record<string, unknown> | null;
  /** Other sentences where the learner met the word in their own reading and listening. */
  contexts?: Array<{ text: string; source: string | null; at: string | null }>;
  collocations?: string[];
  word_family?: Array<{ word: string; part_of_speech: string | null }>;
  translation_ru?: string | null;
  translation_uz?: string | null;
  part_of_speech?: string | null;
};

export type NotebookSnapshot = { summary: { due_count: number; total_count: number }; cards: NotebookCard[] };

export type CaptureWord = {
  word: string;
  part_of_speech?: string | null;
  definition?: string | null;
  example?: string | null;
  context_text?: string | null;
  source_type?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
  /** Extra details kept with the saved word (e.g. translations). */
  metadata?: Record<string, unknown> | null;
};

/** `due` returns cards whose review time has come; `recent` returns the newest saved words. */
export const getNotebook = (mode: 'due' | 'recent', limit = 20, signal?: AbortSignal) =>
  edge<NotebookSnapshot>('vocabulary-notebook', '', {
    query: { mode: mode === 'due' ? 'daily' : 'recent', limit, language_code: 'en' },
    signal,
  });

export const saveWords = (items: CaptureWord[]) =>
  edge<{ saved: number }>('vocabulary-notebook', '', { body: { action: 'capture', language_code: 'en', items } });

/** 1 again, 2 hard, 3 good, 4 easy (the shared FSRS schedule). */
export type ReviewGrade = 1 | 2 | 3 | 4;

/** Records one review. Pass a grade; 'correct' / 'incorrect' are kept for older callers. */
export const reviewCard = (entryId: string, grade: ReviewGrade | 'correct' | 'incorrect') =>
  edge<{ updated: boolean; card: NotebookCard }>('vocabulary-notebook', '', {
    body: typeof grade === 'number'
      ? { action: 'review', language_code: 'en', entry_id: entryId, grade }
      : { action: 'review', language_code: 'en', entry_id: entryId, outcome: grade },
  });
