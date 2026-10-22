import { edge } from './api';

/** A missed question or dictation sentence, due for review. No answer key. */
export type ReviewItem =
  | { id: string; kind: string; step: number; type: 'grammar'; prompt: string; instructions: string; source_title: string; source_slug: string }
  | { id: string; kind: string; step: number; type: 'choice'; prompt: string; options: string[]; source_title: string; source_slug: string }
  | { id: string; kind: string; step: number; type: 'dictation'; speak: string; source_title: string; source_slug: string };

export type ReviewAnswer = {
  correct: boolean;
  expected: string;
  explanation: string | null;
  accuracy?: number;
  retired: boolean;
  next_due_at: string;
};

export const getReviewItems = (signal?: AbortSignal) =>
  edge<{ due: number; items: ReviewItem[] }>('hub', '/review/items', { query: { language_code: 'en', limit: 10 }, signal });

export const answerReviewItem = (id: string, answer: string | number) =>
  edge<ReviewAnswer>('hub', '/review/answer', { query: { language_code: 'en' }, body: { id, answer } });
