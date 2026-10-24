// Word-level diff between two versions of a learner's text (draft 1 vs 2,
// spoken attempt 1 vs 2). Pure module with no imports, so the English app
// bundles it too (apps/english-hub imports it directly).
//
// Tokens are words with their trailing spaces, so joining the tokens of one
// side gives back that side's text. Words are compared exactly (spacing
// aside), so a capital letter or a comma the learner fixed shows as a change
// of that one word, not of the sentence.

export type DiffOp = { type: "same" | "del" | "add"; text: string };

/** Above this many tokens per side the diff falls back to "everything changed". */
export const MAX_DIFF_TOKENS = 1500;

/** Splits text into word tokens that keep their trailing whitespace. */
export const diffTokens = (text: string): string[] => String(text ?? "").match(/\S+\s*|\s+/g) ?? [];

const key = (token: string): string =>
  token.trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

const exact = (token: string): string => token.trim();

const pushOp = (ops: DiffOp[], type: DiffOp["type"], text: string) => {
  if (!text) return;
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.text += text;
  else ops.push({ type, text });
};

/** Word diff: "same" text appears in both, "del" only in `before`, "add" only in `after`. */
export const diffWords = (before: string, after: string): DiffOp[] => {
  const a = diffTokens(before);
  const b = diffTokens(after);
  const ops: DiffOp[] = [];
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    pushOp(ops, "del", a.join(""));
    pushOp(ops, "add", b.join(""));
    return ops;
  }
  // Longest common subsequence on exact words (ignoring trailing spaces).
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = exact(a[i]!) === exact(b[j]!)
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (exact(a[i]!) === exact(b[j]!)) {
      // Keep the after-side spacing for shared words.
      pushOp(ops, "same", b[j]!);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      pushOp(ops, "del", a[i]!);
      i += 1;
    } else {
      pushOp(ops, "add", b[j]!);
      j += 1;
    }
  }
  while (i < n) pushOp(ops, "del", a[i++]!);
  while (j < m) pushOp(ops, "add", b[j++]!);
  return ops;
};

/** Ops for one side of a side-by-side view: the before side has same + del, the after side same + add. */
export const sideOps = (ops: DiffOp[], side: "before" | "after"): DiffOp[] =>
  ops.filter((op) => op.type === "same" || op.type === (side === "before" ? "del" : "add"));

const wordsIn = (text: string): number => diffTokens(text).filter((token) => key(token)).length;

/** How much changed: words removed, words added, and the share of the new text that is new (0..1). */
export const diffStats = (ops: DiffOp[]): { removed: number; added: number; changedRatio: number } => {
  let removed = 0;
  let added = 0;
  let same = 0;
  for (const op of ops) {
    const words = wordsIn(op.text);
    if (op.type === "del") removed += words;
    else if (op.type === "add") added += words;
    else same += words;
  }
  const total = added + same;
  return { removed, added, changedRatio: total ? Math.round((added / total) * 100) / 100 : 0 };
};

/**
 * The short phrase worth saving from a correction ("I am agree with you" →
 * "I agree with you" gives "I agree with you"; a long corrected sentence gives
 * the changed words with up to two words of context, at most `maxWords`).
 */
export const changedPhrase = (before: string, after: string, maxWords = 6): string => {
  const clean = String(after ?? "").replace(/\s+/g, " ").trim();
  const afterWords = clean.split(" ").filter(Boolean);
  if (afterWords.length <= maxWords) return clean.replace(/[.!?,;:]+$/, "");
  const ops = diffWords(String(before ?? ""), clean);
  // Positions (in after-words) of added words.
  let index = 0;
  let first = -1;
  let last = -1;
  for (const op of ops) {
    if (op.type === "del") continue;
    const count = op.text.split(/\s+/).filter(Boolean).length;
    if (op.type === "add" && count) {
      if (first < 0) first = index;
      last = index + count - 1;
    }
    index += count;
  }
  if (first < 0) return afterWords.slice(0, maxWords).join(" ").replace(/[.!?,;:]+$/, "");
  let from = Math.max(0, first - 2);
  let to = Math.min(afterWords.length - 1, last + 2);
  while (to - from + 1 > maxWords) {
    if (to > last) to -= 1;
    else if (from < first) from += 1;
    else to -= 1;
  }
  return afterWords.slice(from, to + 1).join(" ").replace(/^[.!?,;:]+|[.!?,;:]+$/g, "");
};
