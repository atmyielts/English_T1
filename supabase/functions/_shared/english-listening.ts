// Pure scoring for English listening activities: comprehension questions and
// word-level dictation. No I/O, so it is easy to test and reuse.

// ---------------------------------------------------------------------------
// Comprehension questions
// ---------------------------------------------------------------------------

export type ListeningQuestion = {
  id: string;
  type: "mcq";
  prompt: string;
  options: string[];
  answer_index: number;
  explanation: string;
  /** "gist" questions are about the whole recording and are asked after the first listen. */
  focus?: "gist" | "detail";
};

export type PublicListeningQuestion = Pick<ListeningQuestion, "id" | "type" | "prompt" | "options" | "focus">;

export type QuestionResult = {
  question_id: string;
  prompt: string;
  options: string[];
  chosen_index: number | null;
  answer_index: number;
  correct: boolean;
  explanation: string;
};

const text = (value: unknown, max = 2000): string => String(value ?? "").trim().slice(0, max);

/** Reads the `questions` jsonb column, dropping anything malformed. */
export const parseQuestions = (raw: unknown): ListeningQuestion[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ListeningQuestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id = text(rec.id, 80);
    const prompt = text(rec.prompt, 600);
    const options = Array.isArray(rec.options) ? rec.options.map((option) => text(option, 300)).filter(Boolean) : [];
    const answerIndex = Number(rec.answer_index);
    if (!id || seen.has(id) || !prompt || options.length < 2) continue;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) continue;
    seen.add(id);
    const focus = text(rec.focus, 10).toLowerCase();
    out.push({
      id,
      type: "mcq",
      prompt,
      options,
      answer_index: answerIndex,
      explanation: text(rec.explanation, 900),
      ...(focus === "gist" || focus === "detail" ? { focus } : {}),
    });
  }
  return out;
};

/** Questions as sent to the browser before submission: no key, no explanation. */
export const publicQuestions = (questions: ListeningQuestion[]): PublicListeningQuestion[] =>
  questions.map(({ id, type, prompt, options, focus }) => ({ id, type, prompt, options, ...(focus ? { focus } : {}) }));

/**
 * Ids of the questions to ask after the first listen, for the main idea:
 * those marked "gist", or else the first question.
 */
export const gistQuestionIds = (questions: Array<Pick<ListeningQuestion, "id" | "focus">>): string[] => {
  const marked = questions.filter((question) => question.focus === "gist").map((question) => question.id);
  return marked.length ? marked : questions.slice(0, 1).map((question) => question.id);
};

export const gradeQuestions = (
  questions: ListeningQuestion[],
  answers: Array<{ question_id?: unknown; option_index?: unknown }>,
): { correct: number; total: number; results: QuestionResult[] } => {
  const chosen = new Map<string, number>();
  for (const answer of answers) {
    const id = text(answer?.question_id, 80);
    const index = Number(answer?.option_index);
    if (id && Number.isInteger(index) && !chosen.has(id)) chosen.set(id, index);
  }
  const results = questions.map((question) => {
    const pick = chosen.get(question.id);
    const valid = pick !== undefined && pick >= 0 && pick < question.options.length ? pick : null;
    return {
      question_id: question.id,
      prompt: question.prompt,
      options: question.options,
      chosen_index: valid,
      answer_index: question.answer_index,
      correct: valid === question.answer_index,
      explanation: question.explanation,
    };
  });
  return { correct: results.filter((result) => result.correct).length, total: results.length, results };
};

// ---------------------------------------------------------------------------
// Dictation: normalisation
// ---------------------------------------------------------------------------

/** One comparable token. `alts` are the forms it may match (e.g. "'s" = is/has). */
type Token = { canon: string; alts: string[]; units: number[]; numeric: boolean; stop?: boolean };
type Unit = { display: string };

const NOT_CONTRACTIONS: Record<string, string[]> = {
  "can't": ["can", "not"],
  "cannot": ["can", "not"],
  "won't": ["will", "not"],
  "shan't": ["shall", "not"],
  "ain't": ["is", "not"],
};

const S_IS_HAS = new Set([
  "it", "he", "she", "that", "there", "here", "what", "where", "who", "how", "when", "why",
  "everyone", "everybody", "everything", "nothing", "someone", "somebody", "something", "nobody",
]);

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40,
  fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90, hundredth: 100,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1_000_000 };

const isNumberWord = (word: string): boolean =>
  word in UNITS || word in TEENS || word in TENS || word in SCALES || word in ORDINALS;

/** Splits one written word into lower-case pieces with contractions expanded. */
const expandWord = (raw: string): Array<{ word: string; alts?: string[] }> => {
  const lower = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // café = cafe
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/%/g, " percent ")
    .replace(/&/g, " and ");
  const pieces: Array<{ word: string; alts?: string[] }> = [];
  // Hyphens, dashes, slashes, colons and dots between digits separate pieces ("7:30", "twenty-four").
  for (const part of lower.split(/[-–—/:]+|(?<=\d)\.(?=\d)|\s+/)) {
    const core = part.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").replace(/,(?=\d{3}\b)/g, "");
    if (!core) continue;
    if (core in NOT_CONTRACTIONS) {
      for (const word of NOT_CONTRACTIONS[core]!) pieces.push({ word });
      continue;
    }
    if (core === "let's") {
      pieces.push({ word: "let" }, { word: "us" });
      continue;
    }
    const match = core.match(/^([a-z]+)'(s|m|re|ve|ll|d)$/) ?? core.match(/^([a-z]+)(n't)$/);
    if (match) {
      const [, base, suffix] = match as unknown as [string, string, string];
      if (suffix === "n't") { pieces.push({ word: base }, { word: "not" }); continue; }
      if (suffix === "m") { pieces.push({ word: base }, { word: "am" }); continue; }
      if (suffix === "re") { pieces.push({ word: base }, { word: "are" }); continue; }
      if (suffix === "ve") { pieces.push({ word: base }, { word: "have" }); continue; }
      if (suffix === "ll") { pieces.push({ word: base }, { word: "will" }); continue; }
      if (suffix === "d") { pieces.push({ word: base }, { word: "would", alts: ["would", "had"] }); continue; }
      if (suffix === "s" && S_IS_HAS.has(base)) { pieces.push({ word: base }, { word: "is", alts: ["is", "has"] }); continue; }
    }
    // Possessives and other apostrophes: "Anna's" -> "annas", "o'clock" -> "oclock".
    const plain = core.replace(/'/g, "");
    const ordinal = plain.match(/^(\d+)(st|nd|rd|th)$/);
    if (ordinal) { pieces.push({ word: `${Number(ordinal[1])}th` }); continue; }
    if (/^\d+$/.test(plain)) { pieces.push({ word: String(Number(plain)) }); continue; }
    if (plain) pieces.push({ word: plain });
  }
  return pieces;
};

/** Turns runs of number words into digits so "four" = "4" and "twenty four" = "24". */
const mergeNumbers = (tokens: Token[]): Token[] => {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const first = tokens[i]!;
    if (!isNumberWord(first.canon) || first.canon in SCALES) {
      out.push(first);
      i += 1;
      continue;
    }
    let total = 0;
    let current = 0;
    let last: "none" | "unit" | "teen" | "tens" | "hundred" | "big" = "none";
    let ordinal = false;
    const units: number[] = [];
    let j = i;
    while (j < tokens.length && !ordinal) {
      const word = tokens[j]!.canon;
      let ok = false;
      if (word === "and" && last === "hundred" && j + 1 < tokens.length && isNumberWord(tokens[j + 1]!.canon) && !(tokens[j + 1]!.canon in SCALES)) {
        units.push(...tokens[j]!.units);
        j += 1;
        continue;
      }
      if (word in UNITS && (last === "none" || last === "tens" || last === "hundred" || last === "big")) {
        if (word === "zero" && last !== "none") break;
        current += UNITS[word]!; last = "unit"; ok = true;
      } else if (word in TEENS && (last === "none" || last === "hundred" || last === "big")) {
        current += TEENS[word]!; last = "teen"; ok = true;
      } else if (word in TENS && (last === "none" || last === "hundred" || last === "big")) {
        current += TENS[word]!; last = "tens"; ok = true;
      } else if (word === "hundred" && (last === "unit" || last === "teen") && current < 100) {
        current *= 100; last = "hundred"; ok = true;
      } else if ((word === "thousand" || word === "million") && last !== "none" && last !== "big") {
        total += current * SCALES[word]!; current = 0; last = "big"; ok = true;
      } else if (word in ORDINALS) {
        const value = ORDINALS[word]!;
        if (value === 100 && (last === "unit" || last === "teen")) { current *= 100; ok = true; ordinal = true; }
        else if (value < 10 && (last === "none" || last === "tens" || last === "hundred" || last === "big")) { current += value; ok = true; ordinal = true; }
        else if (value >= 10 && value < 100 && (last === "none" || last === "hundred" || last === "big")) { current += value; ok = true; ordinal = true; }
      }
      if (!ok) break;
      units.push(...tokens[j]!.units);
      j += 1;
      // A comma or full stop after a number ends it: "twenty. Four" is two numbers.
      if (tokens[j - 1]!.stop) break;
    }
    if (j === i) {
      out.push(first);
      i += 1;
      continue;
    }
    const value = total + current;
    const canon = ordinal ? `${value}th` : String(value);
    out.push({ canon, alts: [canon], units: Array.from(new Set(units)), numeric: true });
    i = j;
  }
  return out;
};

const analyse = (input: string): { units: Unit[]; tokens: Token[] } => {
  const units: Unit[] = [];
  const raw: Token[] = [];
  for (const display of String(input ?? "").split(/\s+/).filter(Boolean)) {
    const pieces = expandWord(display);
    if (!pieces.length) continue;
    const index = units.length;
    units.push({ display });
    for (const piece of pieces) {
      raw.push({ canon: piece.word, alts: piece.alts ?? [piece.word], units: [index], numeric: /^\d+(th)?$/.test(piece.word) });
    }
    if (/[.,;:!?]["')\]]*$/.test(display)) raw[raw.length - 1]!.stop = true;
  }
  return { units, tokens: mergeNumbers(raw) };
};

/** Canonical comparable words of a text (exported for tests and callers that only need tokens). */
export const normalizeWords = (input: string): string[] => analyse(input).tokens.map((token) => token.canon);

// ---------------------------------------------------------------------------
// Dictation: alignment
// ---------------------------------------------------------------------------

/** Optimal string alignment distance (Levenshtein with adjacent swaps). */
export const spellingDistance = (a: string, b: string): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
};

const same = (a: Token, b: Token): boolean => a.alts.some((alt) => b.alts.includes(alt));

/** Close enough to be the same word typed with a small spelling slip. Numbers must be exact. */
const nearMiss = (a: Token, b: Token): boolean => {
  if (a.numeric || b.numeric) return false;
  const longest = Math.max(a.canon.length, b.canon.length);
  if (longest < 4) return false;
  const distance = spellingDistance(a.canon, b.canon);
  return distance <= 1 || (longest >= 8 && distance <= 2);
};

type Op =
  | { kind: "ok"; e: number; a: number }
  | { kind: "misspelled"; e: number; a: number }
  | { kind: "missed"; e: number }
  | { kind: "extra"; a: number };

const align = (expected: Token[], actual: Token[]): Op[] => {
  const MISS = 1;
  const EXTRA = 1;
  const SLIP = 0.6;
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const cost: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let i = 1; i < rows; i += 1) cost[i]![0] = i * MISS;
  for (let j = 1; j < cols; j += 1) cost[0]![j] = j * EXTRA;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const e = expected[i - 1]!;
      const a = actual[j - 1]!;
      const diagonal = same(e, a) ? 0 : nearMiss(e, a) ? SLIP : Number.POSITIVE_INFINITY;
      cost[i]![j] = Math.min(cost[i - 1]![j - 1]! + diagonal, cost[i - 1]![j]! + MISS, cost[i]![j - 1]! + EXTRA);
    }
  }
  const ops: Op[] = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const e = expected[i - 1]!;
      const a = actual[j - 1]!;
      const isSame = same(e, a);
      const diagonal = isSame ? 0 : nearMiss(e, a) ? SLIP : Number.POSITIVE_INFINITY;
      if (cost[i]![j] === cost[i - 1]![j - 1]! + diagonal) {
        ops.push({ kind: isSame ? "ok" : "misspelled", e: i - 1, a: j - 1 });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    // Walking backwards: taking the extra word first puts "missed" before "extra" in reading order.
    if (j > 0 && cost[i]![j] === cost[i]![j - 1]! + EXTRA) {
      ops.push({ kind: "extra", a: j - 1 });
      j -= 1;
      continue;
    }
    ops.push({ kind: "missed", e: i - 1 });
    i -= 1;
  }
  return ops.reverse();
};

// ---------------------------------------------------------------------------
// Dictation: result
// ---------------------------------------------------------------------------

export type DiffToken = {
  kind: "ok" | "missed" | "misspelled" | "extra";
  /** The word as written in the script (or as typed, for extra words). */
  text: string;
  /** What the learner typed for a misspelled word. */
  typed?: string;
};

export type DictationResult = {
  /** 0..1 word accuracy. Half credit for a small spelling slip; extra words lower it a little. */
  accuracy: number;
  expected_words: number;
  correct_words: number;
  misspelled_words: number;
  missed_words: number;
  extra_words: number;
  tokens: DiffToken[];
  /** Script words the learner missed or misspelled (punctuation removed), for review. */
  review_words: string[];
};

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "to", "of", "for", "at", "on", "in", "is", "are", "was", "were", "am", "be", "been",
  "do", "does", "did", "has", "have", "had", "will", "would", "can", "could", "should", "from", "with",
  "and", "but", "or", "so", "if", "this", "that", "it", "its", "i", "you", "he", "she", "we", "they",
  "me", "my", "your", "his", "her", "our", "their", "them", "us", "not", "no", "yes", "by", "as",
  "up", "out", "there", "here", "then", "than", "very", "too", "just",
]);

const bareWord = (display: string): string =>
  display.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

export const scoreDictation = (expectedText: string, typedText: string): DictationResult => {
  const expected = analyse(expectedText);
  const actual = analyse(typedText);
  const ops = align(expected.tokens, actual.tokens);

  let correct = 0;
  let misspelled = 0;
  let missed = 0;
  let extra = 0;
  // Per script word: how each of its tokens fared, and what the learner typed for it.
  const unitOps = expected.units.map(() => ({ ok: 0, slip: 0, miss: 0, typed: new Set<number>() }));
  const actualUnitExtra = actual.units.map(() => ({ extra: 0, used: 0 }));

  for (const op of ops) {
    if (op.kind === "extra") {
      extra += 1;
      for (const unit of actual.tokens[op.a]!.units) actualUnitExtra[unit]!.extra += 1;
      continue;
    }
    const target = expected.tokens[op.e]!;
    if (op.kind === "ok") correct += 1;
    else if (op.kind === "misspelled") misspelled += 1;
    else missed += 1;
    for (const unit of target.units) {
      const state = unitOps[unit]!;
      if (op.kind === "ok") state.ok += 1;
      else if (op.kind === "misspelled") state.slip += 1;
      else state.miss += 1;
      if (op.kind !== "missed") for (const typedUnit of actual.tokens[op.a]!.units) state.typed.add(typedUnit);
    }
    if (op.kind !== "missed") for (const typedUnit of actual.tokens[op.a]!.units) actualUnitExtra[typedUnit]!.used += 1;
  }

  const tokens: DiffToken[] = [];
  const emittedExpected = new Set<number>();
  const emittedActual = new Set<number>();
  const kindOf = (unit: number): DiffToken["kind"] => {
    const state = unitOps[unit]!;
    if (state.slip === 0 && state.miss === 0) return "ok";
    if (state.ok === 0 && state.slip === 0) return "missed";
    return "misspelled";
  };
  for (const op of ops) {
    if (op.kind === "extra") {
      for (const unit of actual.tokens[op.a]!.units) {
        if (emittedActual.has(unit) || actualUnitExtra[unit]!.used > 0) continue;
        emittedActual.add(unit);
        tokens.push({ kind: "extra", text: actual.units[unit]!.display });
      }
      continue;
    }
    for (const unit of expected.tokens[op.e]!.units) {
      if (emittedExpected.has(unit)) continue;
      emittedExpected.add(unit);
      const kind = kindOf(unit);
      const display = expected.units[unit]!.display;
      if (kind === "misspelled") {
        const typed = Array.from(unitOps[unit]!.typed).sort((x, y) => x - y).map((index) => actual.units[index]!.display).join(" ");
        tokens.push({ kind, text: display, typed });
      } else {
        tokens.push({ kind, text: display });
      }
    }
  }

  const reviewSeen = new Set<string>();
  const review_words: string[] = [];
  expected.units.forEach((unit, index) => {
    if (kindOf(index) === "ok") return;
    const word = bareWord(unit.display);
    const key = word.toLowerCase();
    if (word.length < 3 || /\d/.test(word) || FUNCTION_WORDS.has(key) || reviewSeen.has(key)) return;
    reviewSeen.add(key);
    review_words.push(word);
  });

  const total = expected.tokens.length;
  const accuracy = total === 0 ? 0 : Math.max(0, Math.min(1, (correct + 0.5 * misspelled) / (total + 0.5 * extra)));
  return {
    accuracy: Math.round(accuracy * 10000) / 10000,
    expected_words: total,
    correct_words: correct,
    misspelled_words: misspelled,
    missed_words: missed,
    extra_words: extra,
    tokens,
    review_words,
  };
};

/** Word-weighted accuracy across several dictation sentences (0..1), or null if there were none. */
export const combineDictation = (results: DictationResult[]): number | null => {
  if (!results.length) return null;
  let earned = 0;
  let possible = 0;
  for (const result of results) {
    earned += result.correct_words + 0.5 * result.misspelled_words;
    possible += result.expected_words + 0.5 * result.extra_words;
  }
  return possible > 0 ? Math.round(Math.max(0, Math.min(1, earned / possible)) * 10000) / 10000 : 0;
};

/**
 * Learner-facing accuracy for one listening activity (0..1):
 * 60% comprehension questions + 40% dictation; whichever part exists if only one does.
 */
export const listeningCorrectness = (input: {
  questionCorrect: number;
  questionTotal: number;
  dictationAccuracy: number | null;
}): number => {
  const hasQuestions = input.questionTotal > 0;
  const questionRatio = hasQuestions ? Math.max(0, Math.min(1, input.questionCorrect / input.questionTotal)) : 0;
  const dictation = input.dictationAccuracy === null ? null : Math.max(0, Math.min(1, input.dictationAccuracy));
  const value = hasQuestions && dictation !== null
    ? 0.6 * questionRatio + 0.4 * dictation
    : hasQuestions
      ? questionRatio
      : dictation ?? 0;
  return Math.round(value * 10000) / 10000;
};

// ---------------------------------------------------------------------------
// Dictation: what kind of thing was missed
// ---------------------------------------------------------------------------

export type DictationIssueKind = "small_words" | "endings" | "contractions" | "numbers" | "spelling" | "missed_words" | "extra_words";

export type DictationIssue = {
  kind: DictationIssueKind;
  count: number;
  /** Up to three examples: "the", "walk → walked", "4 (four)". */
  examples: string[];
};

const SMALL_WORDS = new Set([
  "a", "an", "the", "to", "of", "for", "at", "on", "in", "by", "with", "from", "into", "up", "out", "off",
  "is", "are", "was", "were", "am", "be", "been", "do", "does", "did", "has", "have", "had", "will", "would",
  "can", "could", "and", "but", "or", "so", "if", "that", "it", "its", "there", "some", "any",
]);
const NUMBER_WORDS = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|first|second|third|fourth|fifth)$/;

const bare = (word: string): string => word.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");

const stem = (word: string): string =>
  word.replace(/'s$/, "").replace(/(?:ing|ed|es|s|d)$/, "").replace(/([bdgmnprt])\1$/, "$1").replace(/e$/, "");

/** True when two words differ only by a grammatical ending (walk / walked / walks / walking / stop / stopped). */
export const differsByEnding = (expected: string, typed: string): boolean => {
  const a = bare(expected);
  const b = bare(typed);
  if (!a || !b || a === b) return false;
  const base = stem(a);
  return base.length >= 2 && base === stem(b);
};

type Slip = { expected: string | null; typed: string | null; misspelled: boolean };

/**
 * Non-matching tokens as slips. A missed script word next to an extra typed
 * word is one substitution ("walk" written for "walked"), paired in order.
 */
const slipsOf = (tokens: DiffToken[]): Slip[] => {
  const slips: Slip[] = [];
  let missed: string[] = [];
  let extra: string[] = [];
  const flush = () => {
    const pairs = Math.min(missed.length, extra.length);
    for (let i = 0; i < pairs; i += 1) slips.push({ expected: missed[i]!, typed: extra[i]!, misspelled: false });
    for (const word of missed.slice(pairs)) slips.push({ expected: word, typed: null, misspelled: false });
    for (const word of extra.slice(pairs)) slips.push({ expected: null, typed: word, misspelled: false });
    missed = [];
    extra = [];
  };
  for (const token of tokens) {
    if (token.kind === "missed") missed.push(token.text);
    else if (token.kind === "extra") extra.push(token.text);
    else {
      flush();
      if (token.kind === "misspelled") slips.push({ expected: token.text, typed: token.typed ?? "", misspelled: true });
    }
  }
  flush();
  return slips;
};

const isNumberish = (word: string): boolean => /\d/.test(word) || NUMBER_WORDS.test(word);

/**
 * Turns word-level dictation results into specific advice: which kinds of
 * words were lost (small words, word endings, contractions, numbers, spelling,
 * whole words, extra words), most frequent first.
 */
export const dictationFeedback = (results: Array<Pick<DictationResult, "tokens">>): DictationIssue[] => {
  const issues = new Map<DictationIssueKind, DictationIssue>();
  const add = (kind: DictationIssueKind, example: string) => {
    const issue = issues.get(kind) ?? { kind, count: 0, examples: [] };
    issue.count += 1;
    if (example && issue.examples.length < 3 && !issue.examples.includes(example)) issue.examples.push(example);
    issues.set(kind, issue);
  };
  for (const result of results) {
    for (const slip of slipsOf(result.tokens)) {
      const expected = slip.expected === null ? "" : bare(slip.expected);
      const typed = slip.typed === null ? "" : bare(slip.typed);
      if (!expected) {
        if (typed) add("extra_words", typed);
        continue;
      }
      const example = typed ? `${typed} → ${expected}` : expected;
      if (isNumberish(expected) || (typed && isNumberish(typed))) add("numbers", example);
      else if (expected.includes("'")) add("contractions", example);
      else if (typed && differsByEnding(expected, typed)) add("endings", example);
      else if (!typed && SMALL_WORDS.has(expected)) add("small_words", expected);
      else if (slip.misspelled) add("spelling", example);
      else add("missed_words", example);
    }
  }
  return [...issues.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
};
