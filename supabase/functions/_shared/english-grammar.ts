// Answer checking for grammar practice.
//
// Fill-in-the-blank items are often authored with the whole phrase as the
// answer ("on Monday morning" for "We will meet ___ Monday morning."). A
// learner who types just the missing word ("on") is right, so the expected
// blank fill is derived by removing the words the prompt already shows around
// the blank. Partial matches are never given credit: "a" for "an umbrella" is wrong.

export const normalizeAnswer = (value: string): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (value: string): string[] => normalizeAnswer(value).split(" ").filter(Boolean);

/** Levenshtein distance, capped for speed on short answers. */
export const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
};

/**
 * For a prompt with a blank (___), returns the words that actually go in the
 * blank for each accepted answer, by trimming words the prompt already shows
 * immediately before and after the blank.
 */
export const blankFills = (prompt: string, accepted: string[]): string[] => {
  const match = /_{2,}/.exec(prompt);
  if (!match) return [];
  const before = words(prompt.slice(0, match.index));
  const after = words(prompt.slice(match.index + match[0].length).replace(/\([^)]*\)/g, " "));
  const fills = new Set<string>();
  for (const answer of accepted) {
    let tokens = words(answer);
    // Trim overlap with the words right after the blank.
    for (let size = Math.min(tokens.length - 1, after.length); size > 0; size -= 1) {
      if (tokens.slice(tokens.length - size).join(" ") === after.slice(0, size).join(" ")) {
        tokens = tokens.slice(0, tokens.length - size);
        break;
      }
    }
    // Trim overlap with the words right before the blank.
    for (let size = Math.min(tokens.length - 1, before.length); size > 0; size -= 1) {
      if (tokens.slice(0, size).join(" ") === before.slice(before.length - size).join(" ")) {
        tokens = tokens.slice(size);
        break;
      }
    }
    if (tokens.length) fills.add(tokens.join(" "));
  }
  return [...fills];
};

export type GrammarCheck = {
  correct: boolean;
  /** Right apart from a small spelling slip (one letter). */
  typo: boolean;
  /** The answer to show the learner. */
  expected: string;
};

export const checkGrammarAnswer = (input: { prompt: string; accepted: string[]; response: string }): GrammarCheck => {
  const accepted = input.accepted.map((answer) => String(answer ?? "").trim()).filter(Boolean);
  const fills = blankFills(input.prompt, accepted);
  const display = fills[0] ?? accepted[0] ?? "";
  const response = normalizeAnswer(input.response);
  if (!response) return { correct: false, typo: false, expected: display };

  const targets = [...new Set([...accepted.map(normalizeAnswer), ...fills.map(normalizeAnswer)])].filter(Boolean);
  if (targets.includes(response)) return { correct: true, typo: false, expected: display };

  // A one-letter slip in a longer answer counts, with a spelling note.
  const typo = targets.some((target) => target.length >= 6 && editDistance(target, response) === 1);
  return { correct: typo, typo, expected: display };
};
