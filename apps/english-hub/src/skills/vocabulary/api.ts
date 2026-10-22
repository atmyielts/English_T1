import { edge } from '../../lib/api';

export type VocabularyDeck = {
  id: string;
  slug: string;
  title: string;
  level: string | null;
  topic: string | null;
  description: string | null;
  minutes: number;
};

export type DeckWord = {
  id: string;
  word: string;
  part_of_speech: string | null;
  definition: string;
  example: string | null;
  translation_ru: string | null;
  translation_uz: string | null;
  sort_order: number;
};

export type DeckResult = {
  word_id: string;
  word: string;
  chosen: string;
  correct: boolean;
  definition: string | null;
};

export type DeckSubmitResponse = {
  score: number;
  correct: number;
  total: number;
  results: DeckResult[];
  save_requested: boolean;
  /** null when saving was not asked for, or when it failed. */
  saved: { added: number; already_saved: number } | null;
};

export const getDeck = (slug: string, signal?: AbortSignal) =>
  edge<{ deck: VocabularyDeck; words: DeckWord[] }>('vocabulary-notebook', `/decks/${encodeURIComponent(slug)}`, {
    query: { language_code: 'en' },
    signal,
  });

export const submitDeck = (
  slug: string,
  answers: Array<{ word_id: string; option: string }>,
  timeSpentSeconds: number,
  saveWords: boolean,
) =>
  edge<DeckSubmitResponse>('vocabulary-notebook', `/decks/${encodeURIComponent(slug)}/submit`, {
    query: { language_code: 'en' },
    body: { answers, time_spent_seconds: timeSpentSeconds, save_words: saveWords },
  });

/** Moves a saved word out of the learner's list (the notebook's archive action). */
export const archiveWord = (entryId: string) =>
  edge<{ archived: boolean }>('vocabulary-notebook', '', {
    body: { action: 'archive', language_code: 'en', entry_id: entryId },
  });
