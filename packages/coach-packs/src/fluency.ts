import { wordsOf } from './text.ts';
import type { FluencyConfig } from './types.ts';

// Fluency numbers from what the learner said. With word timestamps from
// speech-to-text we measure pace, pauses and runs between pauses; fillers and
// repetitions come from the words themselves. Typed answers get word counts and
// fillers only: timing is never invented. These are measurements, not a grade;
// the assessor receives them as data next to the transcript.

export interface TimedWord { word: string; start: number; end: number }

export interface FluencyMetrics {
  /** Words, fillers excluded. */
  words: number;
  /** Seconds from the first word to the last (or the recording length without timestamps). */
  seconds: number | null;
  /** Words per minute over the whole answer, pauses included. */
  wpm: number | null;
  /** Words per minute while actually speaking (long pauses removed). */
  articulationWpm: number | null;
  longPauses: number;
  longestPause: number | null;
  pausesPerMinute: number | null;
  /** Mean words between long pauses: longer runs sound more fluent. */
  meanRunWords: number | null;
  fillers: number;
  fillersPerMinute: number | null;
  /** Fillers per 100 words, comparable for typed and spoken answers. */
  fillersPer100: number;
  fillerWords: string[];
  /** Immediate repeats such as "I I think" or "the the". */
  repetitions: number;
  /** True when word timestamps were used. */
  timed: boolean;
  /** The comfortable pace for this level and how this answer compares. */
  pace: { min: number; max: number; verdict: 'slow' | 'comfortable' | 'fast' } | null;
}

const collapse = (token: string) => token.replace(/(.)\1+/gu, '$1');

/** Fillers in every language the pack lists, as single tokens and phrases. */
export function fillerMatcher(config: FluencyConfig) {
  const all = Object.values(config.fillers).flat().map((filler) => wordsOf(filler).join(' ')).filter(Boolean);
  const single = new Set(all.filter((filler) => !filler.includes(' ')).map(collapse));
  const phrases = all.filter((filler) => filler.includes(' ')).sort((a, b) => b.length - a.length);
  return {
    /** Whether one token is a filler ("umm", "eee", "нуу"); single letters such as "a" never are. */
    isFiller: (token: string) => token.length >= 2 && single.has(collapse(token)),
    /** Indexes of tokens that belong to a filler phrase ("you know"). */
    phraseIndexes(tokens: string[]): Set<number> {
      const hit = new Set<number>();
      for (const phrase of phrases) {
        const parts = phrase.split(' ');
        for (let i = 0; i + parts.length <= tokens.length; i++) {
          if (parts.every((part, j) => tokens[i + j] === part && !hit.has(i + j))) for (let j = 0; j < parts.length; j++) hit.add(i + j);
        }
      }
      return hit;
    },
    phrases,
  };
}

/** The comfortable pace band for a level: the last band whose level is at or below it. */
export function paceFor(config: FluencyConfig, level: number | null): { min: number; max: number } | null {
  if (!config.pace.length) return null;
  let band = config.pace[0];
  for (const entry of config.pace) if (level !== null && entry[0] <= level) band = entry;
  return { min: band[1], max: band[2] };
}

const per = (count: number, seconds: number | null) => (seconds && seconds >= 5 ? Math.round((count / seconds) * 600) / 10 : null);

export function analyseFluency(input: { text: string; words?: TimedWord[]; durationSec?: number | null }, config: FluencyConfig, level: number | null = null): FluencyMetrics {
  const matcher = fillerMatcher(config);
  const timedWords = (input.words ?? []).filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start && wordsOf(word.word).length > 0);
  const timed = timedWords.length >= 3;
  const tokens = timed ? timedWords.flatMap((word) => wordsOf(word.word)) : wordsOf(input.text);
  const inPhrase = matcher.phraseIndexes(tokens);
  const fillerTokens: string[] = [];
  let content = 0, repetitions = 0, previous = '';
  tokens.forEach((token, index) => {
    if (inPhrase.has(index)) { if (!inPhrase.has(index - 1)) fillerTokens.push(matcher.phrases.find((phrase) => phrase.startsWith(token)) ?? token); return; }
    if (matcher.isFiller(token)) { fillerTokens.push(token); return; }
    content += 1;
    if (token === previous && token.length > 0) repetitions += 1;
    previous = token;
  });

  let seconds: number | null = null, longPauses = 0, longestPause: number | null = null, pauseTime = 0, meanRunWords: number | null = null;
  if (timed) {
    const sorted = [...timedWords].sort((a, b) => a.start - b.start);
    seconds = Math.max(0, sorted.at(-1)!.end - sorted[0].start);
    let run = 0;
    const runs: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      run += 1;
      const next = sorted[i + 1];
      if (!next) break;
      const gap = next.start - sorted[i].end;
      if (gap > config.longPauseSeconds) {
        longPauses += 1;
        pauseTime += gap;
        longestPause = Math.max(longestPause ?? 0, gap);
        runs.push(run);
        run = 0;
      }
    }
    runs.push(run);
    meanRunWords = runs.length ? Math.round((runs.reduce((a, b) => a + b, 0) / runs.length) * 10) / 10 : null;
  } else if (input.durationSec && input.durationSec > 0) {
    seconds = input.durationSec;
  }
  const minutes = seconds && seconds >= 5 ? seconds / 60 : null;
  const wpm = minutes ? Math.round(content / minutes) : null;
  const speakingMinutes = timed && seconds && seconds - pauseTime >= 5 ? (seconds - pauseTime) / 60 : null;
  const band = paceFor(config, level);
  return {
    words: content,
    seconds: seconds === null ? null : Math.round(seconds * 10) / 10,
    wpm,
    articulationWpm: speakingMinutes ? Math.round(content / speakingMinutes) : null,
    longPauses,
    longestPause: longestPause === null ? null : Math.round(longestPause * 10) / 10,
    pausesPerMinute: timed ? per(longPauses, seconds) : null,
    meanRunWords,
    fillers: fillerTokens.length,
    fillersPerMinute: timed || input.durationSec ? per(fillerTokens.length, seconds) : null,
    fillersPer100: content + fillerTokens.length ? Math.round((fillerTokens.length / (content + fillerTokens.length)) * 1000) / 10 : 0,
    fillerWords: [...new Set(fillerTokens)],
    repetitions,
    timed,
    pace: band && wpm !== null ? { ...band, verdict: wpm < band.min ? 'slow' : wpm > band.max ? 'fast' : 'comfortable' } : null,
  };
}

// --- Vocabulary range ---------------------------------------------------------------------------

export interface LexicalMetrics {
  words: number;
  distinct: number;
  /** Moving-average type–token ratio over 40-word windows (stable across answer lengths), ×100. */
  range: number | null;
  /** Share of words with seven or more letters, as a percentage. */
  longWords: number;
  /** Pack words and phrases the learner used. */
  packTerms: string[];
}

/** Vocabulary range of a text, fillers excluded. `terms` are the pack's own words and phrases. */
export function analyseLexis(text: string, config: FluencyConfig, terms: readonly string[] = []): LexicalMetrics {
  const matcher = fillerMatcher(config);
  const all = wordsOf(text);
  const inPhrase = matcher.phraseIndexes(all);
  const tokens = all.filter((token, index) => !inPhrase.has(index) && !matcher.isFiller(token));
  const window = 40;
  let range: number | null = null;
  if (tokens.length >= 15) {
    if (tokens.length <= window) range = Math.round((new Set(tokens).size / tokens.length) * 100);
    else {
      let sum = 0, count = 0;
      for (let i = 0; i + window <= tokens.length; i++) { sum += new Set(tokens.slice(i, i + window)).size / window; count += 1; }
      range = Math.round((sum / count) * 100);
    }
  }
  const joined = ` ${tokens.join(' ')} `;
  const used = terms.filter((term) => { const words = wordsOf(term); return words.length > 0 && joined.includes(` ${words.join(' ')} `); });
  return {
    words: tokens.length,
    distinct: new Set(tokens).size,
    range,
    longWords: tokens.length ? Math.round((tokens.filter((token) => token.replace(/[^\p{L}]/gu, '').length >= 7).length / tokens.length) * 100) : 0,
    packTerms: [...new Set(used)],
  };
}

/** How closely a learner's attempt matched a sentence they shadowed: share of the target words recognised, in order. */
export function shadowMatch(target: string, heard: string): { score: number; missed: string[] } {
  const want = wordsOf(target), got = wordsOf(heard);
  if (!want.length) return { score: 0, missed: [] };
  // Longest common subsequence: the words they said in the right order.
  const table = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--) for (let j = got.length - 1; j >= 0; j--) {
    table[i][j] = want[i] === got[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const matched = new Set<number>();
  for (let i = 0, j = 0; i < want.length && j < got.length;) {
    if (want[i] === got[j]) { matched.add(i); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++;
  }
  return { score: Math.round((table[0][0] / want.length) * 100), missed: want.filter((_, index) => !matched.has(index)) };
}
