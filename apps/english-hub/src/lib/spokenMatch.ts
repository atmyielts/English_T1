// Compares what speech recognition heard with the sentence the learner tried to say.

const words = (text: string): string[] =>
  text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s-]+/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Which words of the sentence were heard, in order (longest common subsequence),
 * so an extra or missing word doesn't mark everything after it as wrong.
 */
export const matchSpoken = (target: string, heard: string): { word: string; heard: boolean }[] => {
  const display = target.split(/\s+/).filter(Boolean);
  const a = display.map((token) => words(token).join(''));
  const b = words(heard);
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] && a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: { word: string; heard: boolean }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] && a[i] === b[j]) {
      out.push({ word: display[i]!, heard: true });
      i += 1;
      j += 1;
    } else if (j < b.length && table[i]![j + 1]! >= table[i + 1]![j]!) {
      j += 1;
    } else {
      out.push({ word: display[i]!, heard: !a[i] });
      i += 1;
    }
  }
  return out;
};
