// Pure helpers for tap-to-translate: which parts of a text are tappable words,
// and the sentence around a tapped word. The server does the real lookup;
// this only normalises lightly so the same word hits the same cache entry.

export type TapToken = { text: string; word: string | null };

/** Letters with inner apostrophes or hyphens ("don't", "well-known"). Accented letters are matched so they are not split. */
const TOKEN_PATTERN = /[A-Za-zÀ-ÿ]+(?:['’-][A-Za-zÀ-ÿ]+)*['’]?/g;
const WORD_SHAPE = /^[a-z]+(?:['-][a-z]+)*$/;
const MAX_WORD = 40;
const MAX_CONTEXT = 240;

/** Contractions ending in 's that are not possessives. Mirrors the server list. */
const S_CONTRACTIONS = new Set(["it's", "that's", "he's", "she's", "what's", "there's", "here's", "let's", "who's", "where's", "how's", "when's", "why's"]);

/** Lower case, straight apostrophes, no possessive 's. Null when it is not a word we can look up. */
export const normaliseTappedWord = (raw: string): string | null => {
  let word = raw.trim().toLowerCase().replace(/[‘’ʼ`]/g, "'");
  if (word.endsWith("'s") && !S_CONTRACTIONS.has(word)) word = word.slice(0, -2);
  else if (word.endsWith("'")) word = word.slice(0, -1);
  if (!word || word.length > MAX_WORD || !WORD_SHAPE.test(word)) return null;
  return word;
};

/** Splits text into runs; `word` is the lookup form for tappable words, null for everything else. */
export const tapTokens = (text: string): TapToken[] => {
  const tokens: TapToken[] = [];
  let cursor = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last && last.word === null) last.text += value;
    else tokens.push({ text: value, word: null });
  };
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    pushText(text.slice(cursor, index));
    let raw = match[0];
    // A closing quote after a word ("the 'bus'") is punctuation, not part of it; keep "students'".
    if (/['’]$/.test(raw) && !/s['’]$/i.test(raw)) {
      raw = raw.slice(0, -1);
    }
    const word = normaliseTappedWord(raw);
    if (word) tokens.push({ text: raw, word });
    else pushText(raw);
    pushText(match[0].slice(raw.length));
    cursor = index + match[0].length;
  }
  pushText(text.slice(cursor));
  return tokens;
};

/** The sentence around `offset` in `text`, trimmed to a size the server accepts. */
export const sentenceAround = (text: string, offset: number): string => {
  const at = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, at);
  const startMatch = /[.!?…]["'”’)\]]*\s+(?=[^.!?…]*$)/.exec(before);
  const start = startMatch ? startMatch.index + startMatch[0].length : 0;
  const endMatch = /[.!?…]+["'”’)\]]*/.exec(text.slice(at));
  const end = endMatch ? at + endMatch.index + endMatch[0].length : text.length;
  let from = start;
  let to = end;
  if (to - from > MAX_CONTEXT) {
    // Keep the part around the word.
    from = Math.max(start, Math.min(at - MAX_CONTEXT / 2, end - MAX_CONTEXT));
    to = from + MAX_CONTEXT;
  }
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
};
