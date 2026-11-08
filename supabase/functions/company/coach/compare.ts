// Comparing what someone said or typed with the phrase they were practising. This
// works on the words only: a browser's transcript says nothing certain about how a
// sound was made, and the app says so wherever it shows these results.

const CONTRACTIONS: Record<string, string> = {
  "can't": 'can not', cannot: 'can not', "won't": 'will not', "shan't": 'shall not', "let's": 'let us',
};
const NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30',
};

/** The words of a sentence, lower case, with contractions opened and small numbers as digits. */
export function words(value: string): string[] {
  const out: string[] = [];
  const cleaned = value.toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/-/g, ' ');
  for (const raw of cleaned.split(/\s+/)) {
    const token = raw.replace(/^'+|'+$/g, '');
    if (!token) continue;
    const opened = CONTRACTIONS[token] ?? token
      .replace(/n't$/, ' not')
      .replace(/'re$/, ' are')
      .replace(/'ve$/, ' have')
      .replace(/'ll$/, ' will')
      .replace(/'d$/, ' would')
      .replace(/'m$/, ' am')
      .replace(/^(it|that|there|here|what|who|how|where|he|she)'s$/, '$1 is');
    for (const word of opened.split(' ')) out.push(NUMBERS[word] ?? word);
  }
  return out;
}

export interface WordResult { word: string; ok: boolean }
export interface Comparison { score: number; words: WordResult[]; extra: string[] }

/** Lines the expected words up with the spoken ones (longest common subsequence). */
export function compareSpoken(expected: string, said: string): Comparison {
  const want = words(expected).slice(0, 120), got = words(said).slice(0, 240);
  const table = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--) {
    for (let j = got.length - 1; j >= 0; j--) {
      table[i][j] = want[i] === got[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const result: WordResult[] = [], extra: string[] = [];
  let i = 0, j = 0;
  while (i < want.length && j < got.length) {
    if (want[i] === got[j]) {
      result.push({ word: want[i], ok: true });
      i++; j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ word: want[i], ok: false });
      i++;
    } else {
      extra.push(got[j]);
      j++;
    }
  }
  for (; i < want.length; i++) result.push({ word: want[i], ok: false });
  for (; j < got.length; j++) extra.push(got[j]);
  const matched = result.filter((word) => word.ok).length;
  return { score: want.length ? Math.round(matched / want.length * 100) : 0, words: result, extra: extra.slice(0, 20) };
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[b.length];
}

/** A typed answer against the card: exact, a slip or two (about one per eight letters), or wrong. */
export function typedMatch(expected: string, typed: string): 'exact' | 'close' | 'wrong' {
  const want = words(expected).join(' '), got = words(typed).join(' ');
  if (!got) return 'wrong';
  if (want === got) return 'exact';
  return distance(want, got) <= Math.max(1, Math.floor(want.length / 8)) ? 'close' : 'wrong';
}

/** One spelling of a phrase for the unique index: case, spacing and closing punctuation do not make a new card. */
export function frontKey(value: string): string {
  return value.toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/\s+/g, ' ').replace(/[\s.,!?;:…]+$/u, '').trim().slice(0, 300);
}
