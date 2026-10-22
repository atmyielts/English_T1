import { edge } from '../../lib/api';

export type ListeningQuestion = { id: string; type: 'mcq'; prompt: string; options: string[] };

export type ListeningItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  transcript_text: string;
  level: string | null;
  category: string | null;
  speed_wpm: number | null;
  duration_seconds: number | null;
  audio_url: string | null;
  tags: string[] | null;
  metadata: { format?: string; speakers?: string[] } | null;
  questions: ListeningQuestion[];
  estimated_minutes: number;
};

export type DictationTarget = { segment_index: number; segment_text: string; focus_phrase: string | null };

export type DiffToken = { kind: 'ok' | 'missed' | 'misspelled' | 'extra'; text: string; typed?: string };

export type QuestionResult = {
  question_id: string;
  prompt: string;
  options: string[];
  chosen_index: number | null;
  answer_index: number;
  correct: boolean;
  explanation: string;
};

export type DictationResult = {
  segment_index: number;
  text: string;
  typed: string;
  /** 0..100 */
  accuracy: number;
  expected_words: number;
  correct_words: number;
  misspelled_words: number;
  missed_words: number;
  extra_words: number;
  tokens: DiffToken[];
  review_words: string[];
};

export type ListeningSubmitResponse = {
  ok: boolean;
  mode: 'listening' | 'reading';
  recorded: boolean;
  attempt_id: string | null;
  /** 0..100 */
  score: number;
  questions: { correct: number; total: number; results: QuestionResult[] };
  dictation: { score: number | null; results: DictationResult[] };
  review_words: Array<{ word: string; context: string }>;
  transcript: string;
  plays: number;
};

export type ListeningSubmitBody = {
  mode: 'listening' | 'reading';
  answers: Array<{ question_id: string; option_index: number }>;
  dictation: Array<{ segment_index: number; text: string }>;
  plays: number;
  time_spent_seconds: number;
};

export const getItem = (slug: string, signal?: AbortSignal) =>
  edge<{ item: ListeningItem; dictation: DictationTarget[] }>('listening-content', `/items/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitItem = (slug: string, body: ListeningSubmitBody) =>
  edge<ListeningSubmitResponse>('listening-content', `/items/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body,
  });
