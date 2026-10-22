import { edge } from '../../lib/api';

export type ReadingSkillKey = 'reading.detail' | 'reading.main_idea' | 'reading.inference' | 'reading.vocabulary';

export type ReadingQuestion = {
  id: string;
  type: 'mcq';
  prompt: string;
  options: string[];
  skill: ReadingSkillKey;
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

export type ReadingAnswerResult = {
  question_id: string;
  correct: boolean;
  chosen_index: number | null;
  answer_index: number;
  explanation: string;
  skill: ReadingSkillKey;
};

export type ReadingSubmitResponse = {
  /** 0..100, or null when the text has no questions (finished reading, nothing to score). */
  score: number | null;
  no_questions: boolean;
  correct: number;
  total: number;
  results: ReadingAnswerResult[];
};

export const getArticle = (slug: string, signal?: AbortSignal) =>
  edge<{ article: ReadingArticle }>('reading-articles', `/articles/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitArticle = (slug: string, answers: Array<{ question_id: string; option_index: number }>, timeSpentSeconds: number) =>
  edge<ReadingSubmitResponse>('reading-articles', `/articles/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { answers, time_spent_seconds: timeSpentSeconds },
  });
