import { edge } from '../../lib/api';

export type WritingPrompt = {
  id: string;
  slug: string;
  title: string;
  prompt_text: string;
  guidance_text: string | null;
  checklist: string[];
  level: string | null;
  genre: string | null;
  audience: string | null;
  target_grammar: string | null;
  target_vocabulary: string[];
  target_structure: string | null;
  expected_length_min: number;
  expected_length_max: number;
  minutes: number;
  min_words_to_submit: number;
};

export type WritingCategory = 'grammar' | 'vocabulary' | 'spelling' | 'punctuation' | 'style';
export type WritingCriterionKey = 'task' | 'organisation' | 'vocabulary' | 'grammar';

export type WritingCorrection = { original: string; corrected: string; explanation: string; category: WritingCategory };

export type WritingFeedback = {
  source: 'ai' | 'basic';
  overall: number;
  criteria: Array<{ key: WritingCriterionKey; score: number; comment: string }>;
  strengths: string[];
  improvements: string[];
  corrections: WritingCorrection[];
  next_step: string;
  model_sentences: Array<{ original: string; improved: string }>;
  checklist: Array<{ point: string; covered: boolean | null }>;
  word_count: number;
  target: { min: number; max: number };
  used_words: string[];
};

export type WritingTaskResponse = {
  prompt: WritingPrompt;
  best_score: number | null;
  draft: { text: string; revision_count: number; updated_at: string | null } | null;
};

export type WritingSubmitResponse = {
  ok: boolean;
  attempt_id: string;
  score: number;
  previous_best: number | null;
  revision: number;
  feedback: WritingFeedback;
};

export const getWritingTask = (slug: string, signal?: AbortSignal) =>
  edge<WritingTaskResponse>('writing-workbench', `/prompts/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitWriting = (slug: string, text: string, timeSpentSeconds: number) =>
  edge<WritingSubmitResponse>('writing-workbench', `/prompts/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { text, time_spent_seconds: timeSpentSeconds },
  });

/** Same rule as the server: tokens that contain a letter or a digit. */
export const countWords = (text: string): number =>
  text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Useful words from the task that appear in the text (simple endings allowed). */
export const usedWords = (text: string, words: string[]): string[] => {
  const haystack = text.toLowerCase().replace(/[’‘]/g, "'");
  return words.filter((word) => {
    const base = word.toLowerCase().trim();
    if (!base) return false;
    const stem = base.length > 4 && base.endsWith('e') ? base.slice(0, -1) : base;
    return new RegExp(`(^|[^\\p{L}])${escapeRegExp(stem).replace(/\s+/g, '\\s+')}`, 'u').test(haystack);
  });
};
