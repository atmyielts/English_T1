import type { DeckWord } from './api';

export type QuizQuestion = { word: DeckWord; options: string[] };

const shuffle = <T,>(items: T[], random: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

/**
 * One question per word: show the meaning, choose the word. The three wrong
 * options come from the same deck, preferring the same part of speech so the
 * grammar of the option does not give the answer away.
 */
export const buildQuiz = (words: DeckWord[], random: () => number = Math.random, optionCount = 4): QuizQuestion[] =>
  shuffle(words, random).map((word) => {
    const others = words.filter((other) => other.id !== word.id && other.word.toLowerCase() !== word.word.toLowerCase());
    const samePos = shuffle(others.filter((other) => other.part_of_speech === word.part_of_speech), random);
    const rest = shuffle(others.filter((other) => other.part_of_speech !== word.part_of_speech), random);
    const distractors = [...samePos, ...rest].slice(0, Math.max(0, optionCount - 1)).map((other) => other.word);
    return { word, options: shuffle([word.word, ...distractors], random) };
  });
