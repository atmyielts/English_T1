import { edge } from './api';
import type { ReadingAnswer, ReadingAnswerResult, ReadingQuestion, SavedWordInText } from '../skills/reading/api';

export type DailyStoryRead = { correct: number; total: number; wpm: number | null };

export type DailyStory = {
  id: string;
  date: string;
  level: string;
  title: string;
  body: string;
  word_count: number;
  /** "ai": written today; "library": today's text from the reading library. */
  source: 'ai' | 'library';
  source_ref: string | null;
  questions: ReadingQuestion[];
  read: DailyStoryRead | null;
  saved_words: SavedWordInText[];
};

export type DailyStoryResponse = {
  status: 'ready' | 'generating' | 'failed';
  level: string;
  date: string;
  story: DailyStory | null;
  retry_after_seconds?: number | null;
};

export type DailyStoryArchive = {
  level: string;
  stories: Array<{ id: string; date: string; level: string; title: string; word_count: number; source: string; read: DailyStoryRead | null }>;
};

export type DailyStoryAnswer = {
  score: number;
  correct: number;
  total: number;
  results: ReadingAnswerResult[];
  reading: { words: number; seconds: number | null; wpm: number | null; pace: 'slow' | 'typical' | 'fast' | null };
};

/** Today's story at the learner's level (or `level`). */
export const getDailyStory = (level: string | null, signal?: AbortSignal) =>
  edge<DailyStoryResponse>('hub', '/daily-story', { query: { language_code: 'en', level }, signal });

export const getDailyStoryById = (id: string, signal?: AbortSignal) =>
  edge<DailyStoryResponse>('hub', `/daily-story/${encodeURIComponent(id)}`, { query: { language_code: 'en' }, signal });

export const getDailyStoryArchive = (level: string | null, signal?: AbortSignal) =>
  edge<DailyStoryArchive>('hub', '/daily-story/archive', { query: { language_code: 'en', level }, signal });

export const answerDailyStory = (storyId: string, answers: Array<{ question_id: string } & ReadingAnswer>, readingSeconds: number | null) =>
  edge<DailyStoryAnswer>('hub', '/daily-story/answer', {
    query: { language_code: 'en' },
    body: { story_id: storyId, answers, reading_seconds: readingSeconds },
  });
