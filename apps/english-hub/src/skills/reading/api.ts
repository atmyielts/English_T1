import { edge } from '../../lib/api';

export type ReadingSkillKey = 'reading.detail' | 'reading.main_idea' | 'reading.inference' | 'reading.vocabulary';

/** As sent before submitting (no answer key). Every type carries `options` for older apps. */
export type ReadingQuestion =
  | { id: string; type: 'mcq'; prompt: string; options: string[]; skill: ReadingSkillKey }
  | { id: string; type: 'tfng'; variant: 'tfng' | 'yes_no'; prompt: string; options: string[]; skill: ReadingSkillKey }
  | { id: string; type: 'headings'; prompt: string; options: string[]; items: Array<{ id: string; paragraph: number }>; skill: ReadingSkillKey }
  | { id: string; type: 'gap'; prompt: string; text: string; gaps: number; word_bank: string[]; options: string[]; skill: ReadingSkillKey };

/** One answer, in the shape its question type needs. */
export type ReadingAnswer = {
  option_index?: number;
  value?: 'true' | 'false' | 'not_given';
  values?: Array<number | null>;
  texts?: string[];
};

export type ReadingArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content_markdown: string;
  level: string | null;
  category: string | null;
  theme: string | null;
  read_time_minutes: number | null;
  questions: ReadingQuestion[];
};

export type ReadingPartResult = { id: string; correct: boolean; given: string; expected: string };

export type ReadingAnswerResult = {
  question_id: string;
  type?: 'mcq' | 'tfng' | 'headings' | 'gap';
  correct: boolean;
  chosen_index: number | null;
  answer_index: number;
  explanation: string;
  skill: ReadingSkillKey;
  points?: number;
  earned?: number;
  parts?: ReadingPartResult[];
};

export type ArticleRef = { slug: string; title: string; level: string; read_time_minutes: number };

export type NextRead = {
  action: 'reread' | 'easier' | 'same' | 'harder';
  level: string | null;
  pace: 'slow' | 'typical' | 'fast' | null;
  article: ArticleRef | null;
  then: ArticleRef | null;
};

export type ReadingSubmitResponse = {
  /** 0..100, or null when the text has no questions (finished reading, nothing to score). */
  score: number | null;
  no_questions: boolean;
  /** Points earned and possible (one per question, heading or gap). */
  correct: number;
  total: number;
  results: ReadingAnswerResult[];
  reading?: { words: number; seconds: number | null; wpm: number | null; pace: 'slow' | 'typical' | 'fast' | null };
  next_read?: NextRead | null;
};

export type SavedWordInText = { word: string; forms: string[] };

export type ReadingSpeed = {
  points: Array<{ at: string; wpm: number; level: string | null; accuracy: number | null; title?: string | null }>;
  latest: number | null;
  recent: number | null;
  previous: number | null;
  change: number | null;
  effective: number | null;
};

export const getArticle = (slug: string, signal?: AbortSignal) =>
  edge<{ article: ReadingArticle; word_count?: number; saved_words?: SavedWordInText[] }>('reading-articles', `/articles/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitArticle = (
  slug: string,
  answers: Array<{ question_id: string } & ReadingAnswer>,
  timeSpentSeconds: number,
  readingSeconds: number | null,
) =>
  edge<ReadingSubmitResponse>('reading-articles', `/articles/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { answers, time_spent_seconds: timeSpentSeconds, reading_seconds: readingSeconds },
  });

export const getReadingSpeed = (signal?: AbortSignal) =>
  edge<ReadingSpeed>('reading-articles', '/speed', { query: { language_code: 'en' }, signal });
