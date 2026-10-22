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
};

export type NotebookSnapshot = { summary: { due_count: number; total_count: number }; cards: NotebookCard[] };

export type CaptureWord = {
  word: string;
  definition?: string | null;
  example?: string | null;
  context_text?: string | null;
  source_type?: string | null;
  source_label?: string | null;
  source_ref?: string | null;
};

/** `due` returns cards whose review time has come; `recent` returns the newest saved words. */
export const getNotebook = (mode: 'due' | 'recent', limit = 20, signal?: AbortSignal) =>
  edge<NotebookSnapshot>('vocabulary-notebook', '', {
    query: { mode: mode === 'due' ? 'daily' : 'recent', limit, language_code: 'en' },
    signal,
  });

export const saveWords = (items: CaptureWord[]) =>
  edge<{ saved: number }>('vocabulary-notebook', '', { body: { action: 'capture', language_code: 'en', items } });

export const reviewCard = (entryId: string, outcome: 'correct' | 'incorrect') =>
  edge<{ updated: boolean; card: NotebookCard }>('vocabulary-notebook', '', {
    body: { action: 'review', language_code: 'en', entry_id: entryId, outcome },
  });
