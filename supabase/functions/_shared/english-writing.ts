import { GRAMMAR_TOPICS, grammarTopicFor, isGrammarTopic, topicSubskill } from "./english-mistakes.ts";
// Writing feedback for the English writing skill.
//
// One submission = one piece of feedback. The AI path asks for a CEFR-aligned
// rubric (task, organisation, vocabulary, grammar) and every field it returns
// is validated and clamped here. When AI is not available, a rule-based check
// gives basic feedback: length, task points, common learner mistakes,
// repetition and very long sentences. Corrections always quote text that
// really appears in the learner's draft.
//
// Pure module: no database or network access, so it is fully unit-tested.

export type WritingCategory = "grammar" | "vocabulary" | "spelling" | "punctuation" | "style";
export const WRITING_CATEGORIES: readonly WritingCategory[] = ["grammar", "vocabulary", "spelling", "punctuation", "style"];

export type WritingCriterionKey = "task" | "organisation" | "vocabulary" | "grammar";
export const WRITING_CRITERIA: readonly WritingCriterionKey[] = ["task", "organisation", "vocabulary", "grammar"];

export type WritingPromptSpec = {
  title: string;
  prompt_text: string;
  guidance_text?: string | null;
  level?: string | null;
  genre?: string | null;
  target_grammar?: string | null;
  target_vocabulary?: string[] | null;
  target_structure?: string | null;
  expected_length_min: number;
  expected_length_max: number;
  /** Optional keyword hints, one list per checklist point (same order as guidance_text). */
  checklist_keywords?: string[][] | null;
};

export type WritingCorrection = {
  original: string;
  corrected: string;
  explanation: string;
  category: WritingCategory;
  /** Grammar topic suggested by the model (validated later against the lesson list). */
  topic?: string | null;
};

export type WritingCriterion = { key: WritingCriterionKey; score: number; comment: string };

export type WritingChecklistItem = { point: string; covered: boolean | null };

export type WritingFeedback = {
  /** "ai" = full rubric feedback; "basic" = rule-based checks only. */
  source: "ai" | "basic";
  /** 0..100 */
  overall: number;
  criteria: WritingCriterion[];
  strengths: string[];
  improvements: string[];
  corrections: WritingCorrection[];
  next_step: string;
  model_sentences: Array<{ original: string; improved: string }>;
  checklist: WritingChecklistItem[];
  word_count: number;
  target: { min: number; max: number };
  used_words: string[];
};

const MAX_CORRECTIONS = 6;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const clampInt = (value: number, min: number, max: number): number => Math.round(Math.max(min, Math.min(max, value)));

const cleanString = (value: unknown, maxLen: number): string => {
  if (typeof value !== "string") return "";
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLen);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words = whitespace-separated tokens that contain a letter or digit. */
export const countWords = (text: string): number =>
  String(text ?? "").split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

/** Checklist points from guidance text: one per line, "- " bullets. */
export const parseChecklist = (guidance: string | null | undefined): string[] =>
  String(guidance ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

/** The fewest words we accept before giving feedback. */
export const minimumWordsToSubmit = (expectedMin: number): number => Math.max(5, Math.round(expectedMin * 0.3));

export const splitSentences = (text: string): string[] =>
  String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));

const normalizeForMatch = (text: string): string => text.toLowerCase().replace(/[’‘`]/g, "'");

/**
 * Returns the exact text from the draft that matches `quote`, or null.
 * Tolerates differences in spacing, curly apostrophes and letter case, so the
 * returned string is always a real substring of the draft.
 */
export const findInDraft = (draft: string, quote: string): string | null => {
  const needle = String(quote ?? "").trim();
  if (!needle || needle.length > 400) return null;
  if (draft.includes(needle)) return needle;
  const pattern = needle
    .split(/\s+/)
    .map((part) => escapeRegExp(part).replace(/['’‘`]/g, "['’‘`]").replace(/["“”]/g, "[\"“”]"))
    .join("\\s+");
  try {
    const match = new RegExp(pattern, "iu").exec(draft);
    return match ? match[0] : null;
  } catch {
    return null;
  }
};

const matchCase = (original: string, replacement: string): string => {
  if (!original || !replacement) return replacement;
  const first = original.charAt(0);
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
};

/** Expands a short match to whole neighbouring words so the quote is readable. */
const withContext = (text: string, start: number, end: number): { start: number; end: number } => {
  let from = start;
  let to = end;
  // one word to the left
  while (from > 0 && /\s/.test(text.charAt(from - 1))) from -= 1;
  while (from > 0 && !/\s/.test(text.charAt(from - 1))) from -= 1;
  // one word to the right
  while (to < text.length && /\s/.test(text.charAt(to)) && text.charAt(to) !== "\n") to += 1;
  while (to < text.length && !/\s/.test(text.charAt(to))) to += 1;
  return { start: from, end: to };
};

// ---------------------------------------------------------------------------
// Rule-based checks (reliable patterns only)
// ---------------------------------------------------------------------------

type RuleHit = { start: number; end: number; edits: Array<{ start: number; end: number; replacement: string }>; explanation: string; category: WritingCategory };

type Rule = {
  id: string;
  category: WritingCategory;
  pattern: RegExp;
  explain: (match: RegExpExecArray) => string;
  fix: (match: RegExpExecArray) => string;
  /** Quote neighbouring words too (for very short matches like "i"). */
  context?: boolean;
};

const BE_FOR_SUBJECT: Record<string, string> = { i: "agree", we: "agree", they: "agree", you: "agree", he: "agrees", she: "agrees" };

const COMPARATIVES = [
  "better", "worse", "easier", "bigger", "smaller", "faster", "cheaper", "happier", "older", "younger", "longer", "shorter",
  "higher", "lower", "larger", "stronger", "healthier", "busier", "nicer", "warmer", "colder", "quicker", "simpler", "safer",
];

const UNCOUNTABLE: Record<string, string> = {
  informations: "information",
  advices: "advice",
  furnitures: "furniture",
  homeworks: "homework",
  knowledges: "knowledge",
  equipments: "equipment",
  luggages: "luggage",
  feedbacks: "feedback",
  evidences: "evidence",
  researchs: "research",
};

const PAST_TO_BASE: Record<string, string> = {
  went: "go", saw: "see", came: "come", took: "take", gave: "give", made: "make", had: "have", did: "do", got: "get",
  bought: "buy", ate: "eat", wrote: "write", said: "say", told: "tell", knew: "know", thought: "think", found: "find",
  left: "leave", felt: "feel", met: "meet", ran: "run", spoke: "speak", understood: "understand", brought: "bring",
  began: "begin", forgot: "forget", sent: "send", spent: "spend",
};

const MISSPELLINGS: Record<string, string> = {
  alot: "a lot",
  untill: "until",
  becouse: "because",
  becuase: "because",
  becose: "because",
  wich: "which",
  recieve: "receive",
  recieved: "received",
  definately: "definitely",
  beleive: "believe",
  tommorow: "tomorrow",
  tomorow: "tomorrow",
  tommorrow: "tomorrow",
  realy: "really",
  thier: "their",
  freind: "friend",
  freinds: "friends",
  studing: "studying",
  goverment: "government",
  enviroment: "environment",
  wierd: "weird",
  begining: "beginning",
  writting: "writing",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  cant: "can't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
};

const INFORMAL: Record<string, string> = {
  gonna: "going to",
  wanna: "want to",
  gotta: "have to",
  pls: "please",
  plz: "please",
  u: "you",
};

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "a.m", "p.m", "vs", "mr", "mrs", "ms", "dr", "st", "no"]);

const RULES: Rule[] = [
  {
    id: "be-agree",
    category: "grammar",
    pattern: /\b(I|we|they|you|he|she)(?:\s+(?:am|are|is)|['’](?:m|re|s))\s+(agree|disagree)\b/giu,
    explain: () => "‘Agree’ is a verb, so you do not need ‘am’, ‘are’ or ‘is’ before it.",
    fix: (m) => {
      const subject = m[1] === "i" ? "I" : m[1] ?? "I";
      const verb = (m[2] ?? "agree").toLowerCase();
      const third = BE_FOR_SUBJECT[subject.toLowerCase()] === "agrees";
      return `${subject} ${third ? `${verb}s` : verb}`;
    },
  },
  {
    id: "double-comparative",
    category: "grammar",
    pattern: new RegExp(`\\bmore\\s+(${COMPARATIVES.join("|")})\\b`, "giu"),
    explain: (m) => `‘${(m[1] ?? "").toLowerCase()}’ is already a comparative, so you do not need ‘more’.`,
    fix: (m) => matchCase(m[0], m[1] ?? ""),
  },
  {
    id: "double-superlative",
    category: "grammar",
    pattern: /\bmost\s+(best|worst)\b/giu,
    explain: (m) => `‘${(m[1] ?? "").toLowerCase()}’ is already a superlative, so you do not need ‘most’.`,
    fix: (m) => matchCase(m[0], m[1] ?? ""),
  },
  {
    id: "uncountable",
    category: "grammar",
    pattern: new RegExp(`\\b(${Object.keys(UNCOUNTABLE).join("|")})\\b`, "giu"),
    explain: (m) => {
      const word = UNCOUNTABLE[(m[1] ?? "").toLowerCase()] ?? "";
      return `‘${word}’ is uncountable in English, so it has no plural form.`;
    },
    fix: (m) => matchCase(m[0], UNCOUNTABLE[(m[1] ?? "").toLowerCase()] ?? m[0]),
  },
  {
    id: "very-like",
    category: "grammar",
    pattern: /(?<=\b(?:I|we|they|you)\s+)very(?=\s+(?:like|love|enjoy|want)\b)/giu,
    explain: () => "Say ‘I really like…’ or ‘I like… very much’, not ‘I very like’.",
    fix: () => "really",
    context: true,
  },
  {
    // "explain me the rule." → "explain the rule to me." (short object before punctuation)
    id: "explain-me-object",
    category: "grammar",
    pattern: /\b(explain(?:s|ed)?)\s+(me|us)\s+((?:[\p{L}'’-]+\s+){0,4}[\p{L}'’-]+)(?=\s*[.,!?;]|\s*$)/giu,
    explain: () => "We say ‘explain something to me’, not ‘explain me something’.",
    fix: (m) => `${m[1]} ${m[3]} to ${m[2]}`,
  },
  {
    id: "explain-me",
    category: "grammar",
    pattern: /\b(explain(?:s|ed)?)\s+(me|us)\b/giu,
    explain: () => "We say ‘explain something to me’, not ‘explain me something’.",
    fix: (m) => `${m[1]} to ${m[2]}`,
  },
  {
    id: "discuss-about",
    category: "grammar",
    pattern: /\b(discuss(?:es|ed|ing)?)\s+about\b/giu,
    explain: () => "‘Discuss’ does not need ‘about’: we discuss something.",
    fix: (m) => m[1] ?? "discuss",
  },
  {
    id: "depend-on",
    category: "grammar",
    pattern: /\b(depend(?:s|ed|ing)?)\s+(?:from|of)\b/giu,
    explain: () => "We say ‘depend on’.",
    fix: (m) => `${m[1]} on`,
  },
  {
    id: "listen-to",
    category: "grammar",
    pattern: /\b(listen(?:s|ed|ing)?)\s+(music|me|him|her|them|us|my|his|our|their|the|a|an)\b/giu,
    explain: () => "Use ‘listen to’ before the thing or person you listen to.",
    fix: (m) => `${m[1]} to ${m[2]}`,
  },
  {
    id: "people-are",
    category: "grammar",
    pattern: /\b(people)\s+(is|was|has)\b/giu,
    explain: () => "‘People’ is plural, so use ‘are’, ‘were’ or ‘have’.",
    fix: (m) => {
      const verb = (m[2] ?? "").toLowerCase();
      return `${m[1]} ${verb === "is" ? "are" : verb === "was" ? "were" : "have"}`;
    },
  },
  {
    id: "everyone-is",
    category: "grammar",
    pattern: /\b(everyone|everybody|someone|somebody|nobody|no one)\s+(are|were)\b/giu,
    explain: (m) => `‘${(m[1] ?? "").toLowerCase()}’ takes a singular verb: ‘is’ or ‘was’.`,
    fix: (m) => `${m[1]} ${(m[2] ?? "").toLowerCase() === "are" ? "is" : "was"}`,
  },
  {
    id: "since-for",
    category: "grammar",
    pattern: /\bsince\s+((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|many|several|a few)\s+(?:years?|months?|weeks?|days?|hours?|minutes?))\b/giu,
    explain: () => "Use ‘for’ with a length of time (for two years) and ‘since’ with a starting point (since 2020).",
    fix: (m) => matchCase(m[0], `for ${m[1]}`),
  },
  {
    id: "do-homework",
    category: "vocabulary",
    pattern: /\b(make|makes|making|made)\s+((?:my|your|his|her|our|their|the)\s+)?homework\b/giu,
    explain: () => "We say ‘do homework’, not ‘make homework’.",
    fix: (m) => {
      const verb = (m[1] ?? "").toLowerCase();
      const fixed = verb === "make" ? "do" : verb === "makes" ? "does" : verb === "making" ? "doing" : "did";
      return matchCase(m[0], `${fixed} ${m[2] ?? ""}homework`);
    },
  },
  {
    id: "modal-to",
    category: "grammar",
    pattern: /\b(can|could|must|should|might)\s+to\s+([a-z]+)\b/giu,
    explain: (m) => `After ‘${(m[1] ?? "").toLowerCase()}’, use the verb without ‘to’.`,
    fix: (m) => `${m[1]} ${m[2]}`,
  },
  {
    id: "aux-past",
    category: "grammar",
    pattern: new RegExp(
      `\\b(didn['’]t|did not|doesn['’]t|does not|don['’]t|do not)\\s+(${Object.keys(PAST_TO_BASE).join("|")})\\b`,
      "giu",
    ),
    explain: (m) => `After ‘${(m[1] ?? "").toLowerCase()}’, use the base form of the verb: ‘${PAST_TO_BASE[(m[2] ?? "").toLowerCase()] ?? ""}’.`,
    fix: (m) => `${m[1]} ${PAST_TO_BASE[(m[2] ?? "").toLowerCase()] ?? m[2]}`,
  },
  {
    id: "he-dont",
    category: "grammar",
    pattern: /\b(he|she|it)\s+(don['’]t|do not)\b/giu,
    explain: () => "With he, she and it, use ‘doesn’t’ (does not).",
    fix: (m) => `${m[1]} ${(m[2] ?? "").toLowerCase() === "do not" ? "does not" : "doesn't"}`,
  },
  {
    id: "a-an-vowel",
    category: "grammar",
    pattern: /\b(a)\s+((?!one\b|once\b|euro)[aeio][\p{L}]+)/gu,
    explain: () => "Use ‘an’ before a word that starts with a vowel sound.",
    fix: (m) => `${m[1] === "A" ? "An" : "an"} ${m[2]}`,
  },
  {
    id: "an-consonant",
    category: "grammar",
    pattern: /\b(an)\s+([bcdfgjklmnpqrstvwxyz][\p{L}]+)/gu,
    explain: () => "Use ‘a’ before a word that starts with a consonant sound.",
    fix: (m) => `a ${m[2]}`,
  },
  {
    id: "spelling",
    category: "spelling",
    pattern: new RegExp(`\\b(${Object.keys(MISSPELLINGS).join("|")})\\b`, "giu"),
    explain: (m) => `Spelling: ‘${MISSPELLINGS[(m[1] ?? "").toLowerCase()] ?? ""}’.`,
    fix: (m) => matchCase(m[0], MISSPELLINGS[(m[1] ?? "").toLowerCase()] ?? m[0]),
  },
  {
    id: "informal",
    category: "style",
    pattern: new RegExp(`(?<![\\p{L}'’])(${Object.keys(INFORMAL).join("|")})(?![\\p{L}'’])`, "giu"),
    explain: (m) => `‘${m[1]}’ is too informal for writing. Use ‘${INFORMAL[(m[1] ?? "").toLowerCase()] ?? ""}’.`,
    fix: (m) => matchCase(m[0], INFORMAL[(m[1] ?? "").toLowerCase()] ?? m[0]),
    context: true,
  },
  {
    id: "doubled-word",
    category: "spelling",
    pattern: /\b((?!that\b|had\b)[\p{L}]+)\s+\1\b/giu,
    explain: (m) => `You wrote ‘${m[1]}’ twice.`,
    fix: (m) => m[1] ?? "",
    context: true,
  },
  {
    id: "lowercase-i",
    category: "spelling",
    pattern: /(?<![\p{L}\p{N}'’\-])i(?=['’](?:m|ve|ll|d)\b|[\s,!?;:)]|\.(?!\p{L})|$)/gu,
    explain: () => "Always write ‘I’ with a capital letter.",
    fix: () => "I",
    context: true,
  },
  {
    id: "double-space",
    category: "punctuation",
    pattern: /(?<=\S)[ \t]{2,}(?=\S)/gu,
    explain: () => "Use one space between words.",
    fix: () => " ",
    context: true,
  },
  {
    id: "space-before-punctuation",
    category: "punctuation",
    pattern: /(?<=[\p{L}\p{N}])[ \t]+([,.;:!?])(?=\s|$)/gu,
    explain: (m) => `Do not put a space before ‘${m[1]}’.`,
    fix: (m) => m[1] ?? "",
    context: true,
  },
  {
    id: "space-after-comma",
    category: "punctuation",
    pattern: /(?<=\p{Ll}),(?=\p{L})/gu,
    explain: () => "Put a space after a comma.",
    fix: () => ", ",
    context: true,
  },
];

type Edit = { start: number; end: number; replacement: string };

const makeHit = (text: string, edit: Edit, explanation: string, category: WritingCategory, context: boolean): RuleHit | null => {
  if (text.slice(edit.start, edit.end) === edit.replacement) return null;
  const span = context ? withContext(text, edit.start, edit.end) : { start: edit.start, end: edit.end };
  if (!text.slice(span.start, span.end).trim()) return null;
  return { start: span.start, end: span.end, edits: [edit], explanation, category };
};

const applyRule = (text: string, rule: Rule): RuleHit[] => {
  const hits: RuleHit[] = [];
  const pattern = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    const edit = { start: match.index, end: match.index + match[0].length, replacement: rule.fix(match) };
    const hit = makeHit(text, edit, rule.explain(match), rule.category, Boolean(rule.context));
    if (hit) hits.push(hit);
  }
  return hits;
};

const CATEGORY_RANK: Record<WritingCategory, number> = { grammar: 4, vocabulary: 3, spelling: 2, style: 1, punctuation: 0 };

const CAPITAL_START ="Start a sentence with a capital letter.";

const sentenceStartHits = (text: string): RuleHit[] => {
  const hits: RuleHit[] = [];
  const firstLetter = /^\s*(\p{Ll})/u.exec(text);
  if (firstLetter && !/^\s*i\b/u.test(text)) {
    const index = firstLetter[0].length - 1;
    const hit = makeHit(text, { start: index, end: index + 1, replacement: (firstLetter[1] ?? "").toUpperCase() }, CAPITAL_START, "punctuation", true);
    if (hit) hits.push(hit);
  }
  const pattern = /([\p{L}.]+)([.!?])(\s+)(\p{Ll})/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = `${match[1] ?? ""}`.toLowerCase().replace(/\.$/, "");
    const letterIndex = match.index + match[0].length - 1;
    pattern.lastIndex = letterIndex;
    if (match[2] === "." && (ABBREVIATIONS.has(before) || before.includes("."))) continue;
    // A lowercase "i" at the start is reported by the lowercase-i rule.
    if ((match[4] ?? "") === "i" && /^i(?![\p{L}])/u.test(text.slice(letterIndex))) continue;
    const hit = makeHit(text, { start: letterIndex, end: letterIndex + 1, replacement: (match[4] ?? "").toUpperCase() }, CAPITAL_START, "punctuation", true);
    if (hit) hits.push(hit);
  }
  return hits;
};

const finalPunctuationHit = (text: string): RuleHit | null => {
  const trimmed = text.replace(/\s+$/u, "");
  if (!trimmed || /[.!?)"”'’:]$/u.test(trimmed)) return null;
  // Messages, notes and letters may end with a sign-off ("Thanks, Aziz" or a name on its own line).
  const lastChunk = (trimmed.split(/[.!?]\s+/u).pop() ?? "").trim();
  if (/^(thanks|thank you|best wishes|best regards|kind regards|regards|love|see you|bye|yours|cheers|take care|all the best)\b/iu.test(lastChunk)) return null;
  const lines = trimmed.split(/\n/u);
  if (lines.length > 1 && countWords(lines[lines.length - 1] ?? "") <= 3) return null;
  const hit = makeHit(text, { start: trimmed.length, end: trimmed.length, replacement: "." }, "End your text with a full stop.", "punctuation", true);
  // Quote the last two words so the place is easy to find.
  if (hit) hit.start = withContext(text, hit.start, hit.start).start;
  return hit;
};

/** Rewrites a span of the text with all its edits applied. */
const renderHit = (text: string, hit: RuleHit): { original: string; corrected: string } => {
  let corrected = "";
  let cursor = hit.start;
  for (const edit of [...hit.edits].sort((a, b) => a.start - b.start)) {
    corrected += text.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  corrected += text.slice(cursor, hit.end);
  return { original: text.slice(hit.start, hit.end), corrected };
};

/** All reliable rule-based corrections, in text order. Overlapping fixes are merged into one quote. */
export const detectCommonMistakes = (text: string): {
  corrections: WritingCorrection[];
  /** Mistakes per category; each kind counts at most twice, so one habit does not dominate. */
  counts: Record<WritingCategory, number>;
  /** The whole text with every detected fix applied. */
  correctedText: string;
} => {
  const hits: RuleHit[] = [];
  for (const rule of RULES) hits.push(...applyRule(text, rule));
  hits.push(...sentenceStartHits(text));
  const final = finalPunctuationHit(text);
  if (final) hits.push(final);
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const counts: Record<WritingCategory, number> = { grammar: 0, vocabulary: 0, spelling: 0, punctuation: 0, style: 0 };
  const merged: RuleHit[] = [];
  const perKind = new Map<string, number>();
  const count = (hit: RuleHit) => {
    const seen = perKind.get(hit.explanation) ?? 0;
    perKind.set(hit.explanation, seen + 1);
    if (seen < 2) counts[hit.category] += 1;
  };
  for (const hit of hits) {
    const last = merged[merged.length - 1];
    if (last && hit.start < last.end) {
      // Two rules changed the same characters: keep the first fix only.
      const clash = hit.edits.some((edit) => last.edits.some((other) => (edit.start < other.end && other.start < edit.end) || edit.start === other.start));
      if (clash) continue;
      const firstEdit = Math.min(...hit.edits.map((edit) => edit.start));
      if (firstEdit >= last.end) {
        // Only the surrounding words overlap: keep two separate, shorter quotes.
        let start = last.end;
        while (start < firstEdit && /[\s.,!?;:]/u.test(text.charAt(start))) start += 1;
        count(hit);
        merged.push({ ...hit, start, edits: [...hit.edits] });
        continue;
      }
      count(hit);
      last.end = Math.max(last.end, hit.end);
      last.edits.push(...hit.edits);
      // A merged quote is labelled with its most important kind of mistake.
      if (CATEGORY_RANK[hit.category] > CATEGORY_RANK[last.category]) last.category = hit.category;
      if (!last.explanation.includes(hit.explanation)) last.explanation = `${last.explanation} ${hit.explanation}`;
      continue;
    }
    count(hit);
    merged.push({ ...hit, edits: [...hit.edits] });
  }
  const allEdits = merged.flatMap((hit) => hit.edits);
  const correctedText = renderHit(text, { start: 0, end: text.length, edits: allEdits, explanation: "", category: "grammar" }).corrected;

  // Show each kind of mistake at most twice so one habit does not fill the list.
  const perExplanation = new Map<string, number>();
  const seenOriginal = new Set<string>();
  const corrections: WritingCorrection[] = [];
  for (const hit of merged) {
    const { original, corrected } = renderHit(text, hit);
    const seen = perExplanation.get(hit.explanation) ?? 0;
    const key = original.toLowerCase();
    if (seen >= 2 || seenOriginal.has(key) || original === corrected) continue;
    perExplanation.set(hit.explanation, seen + 1);
    seenOriginal.add(key);
    corrections.push({ original, corrected, explanation: hit.explanation, category: hit.category });
  }
  return { corrections, counts, correctedText };
};

// ---------------------------------------------------------------------------
// Checklist, vocabulary and organisation signals
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "with", "from", "by", "about", "as", "into",
  "is", "are", "was", "were", "be", "been", "am", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "should", "may", "might", "must", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your",
  "his", "its", "our", "their", "this", "that", "these", "those", "there", "here", "what", "which", "who", "when", "where", "why",
  "how", "not", "no", "yes", "if", "then", "than", "also", "too", "just", "one", "some", "any", "all", "more", "most", "very",
  "say", "said", "give", "write", "tell", "ask", "what", "it's", "i'm", "don't", "i'll", "can't", "let", "get", "got",
]);

const contentWords = (text: string): string[] =>
  normalizeForMatch(text)
    .replace(/[^\p{L}\p{N}'\s-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));

const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|noon|midnight)\b/;

const keywordPresent = (normalizedText: string, keyword: string): boolean => {
  const key = normalizeForMatch(keyword.trim());
  if (!key) return false;
  if (key === "#number") return /\d/.test(normalizedText) || NUMBER_WORDS.test(normalizedText);
  if (!/^[\p{L}\p{N}' -]+$/u.test(key)) return normalizedText.includes(key);
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(key).replace(/\s+/g, "\\s+")}`, "u").test(normalizedText);
};

/** Keywords guessed from the checklist point itself, used when no hints are stored. */
const keywordsFromPoint = (point: string): string[] =>
  contentWords(point)
    .filter((word) => word.length >= 4 && !["include", "mention", "explain", "describe", "finish", "begin", "start", "something", "thing", "things", "least", "example", "clear", "clearly", "short"].includes(word))
    .map((word) => (word.length > 6 ? word.slice(0, 6) : word));

export const checkChecklist = (text: string, prompt: WritingPromptSpec): WritingChecklistItem[] => {
  const points = parseChecklist(prompt.guidance_text);
  const normalized = normalizeForMatch(text);
  return points.map((point, index) => {
    // Stored hints win; an empty stored list means "this point cannot be checked automatically".
    const hints = Array.isArray(prompt.checklist_keywords?.[index]) ? (prompt.checklist_keywords?.[index] ?? []) : null;
    const keywords = (hints ?? keywordsFromPoint(point)).filter((entry) => typeof entry === "string" && entry.trim());
    if (!keywords.length) return { point, covered: null };
    return { point, covered: keywords.some((keyword) => keywordPresent(normalized, keyword)) };
  });
};

export const usedTargetWords = (text: string, targets: string[] | null | undefined): string[] => {
  const normalized = normalizeForMatch(text);
  return (targets ?? []).filter((word) => {
    const base = normalizeForMatch(String(word ?? "").trim());
    if (!base) return false;
    // Accept simple inflections: realise → realised, plan → plans.
    const stem = base.length > 4 && base.endsWith("e") ? base.slice(0, -1) : base;
    return keywordPresent(normalized, stem);
  });
};

const CONNECTORS_BASIC = ["and", "but", "because", "so", "then", "also", "or", "after", "before", "when", "first"];
const CONNECTORS_LINKING = [
  "however", "although", "though", "therefore", "moreover", "furthermore", "in addition", "on the other hand", "as a result",
  "for example", "for instance", "while", "whereas", "despite", "in contrast", "nevertheless", "consequently", "finally",
  "firstly", "secondly", "in conclusion", "overall", "unless", "even though", "as well as", "instead", "such as", "since",
];

const levelBand = (level: string | null | undefined): "A" | "B" | "C" => {
  const key = String(level ?? "").toUpperCase();
  if (key.startsWith("A")) return "A";
  if (key.startsWith("C")) return "C";
  return "B";
};

type TextSignals = {
  wordCount: number;
  sentences: string[];
  longSentences: Array<{ words: number }>;
  paragraphs: number;
  connectorsBasic: string[];
  connectorsLinking: string[];
  overused: Array<{ word: string; count: number }>;
  variety: number;
};

const analyseText = (text: string, prompt: WritingPromptSpec): TextSignals => {
  const wordCount = countWords(text);
  const sentences = splitSentences(text);
  const band = levelBand(prompt.level);
  const longLimit = band === "A" ? 25 : band === "B" ? 32 : 42;
  const longSentences = sentences.map((sentence) => ({ words: countWords(sentence) })).filter((entry) => entry.words > longLimit);
  const paragraphs = text.split(/\n\s*\n|\n/).filter((part) => countWords(part) > 0).length;
  const normalized = normalizeForMatch(text);
  const connectorsBasic = CONNECTORS_BASIC.filter((word) => keywordPresent(normalized, `${word} `) || keywordPresent(normalized, word));
  const connectorsLinking = CONNECTORS_LINKING.filter((word) => new RegExp(`(?<![\\p{L}])${escapeRegExp(word)}(?![\\p{L}])`, "u").test(normalized));
  const words = contentWords(text);
  const frequency = new Map<string, number>();
  for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const limit = Math.max(3, Math.ceil(wordCount / 25));
  const targetWords = new Set((prompt.target_vocabulary ?? []).map((word) => normalizeForMatch(word)));
  const overused = [...frequency.entries()]
    .filter(([word, count]) => count > limit && !targetWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word, count]) => ({ word, count }));
  const unique = new Set(words).size;
  const variety = words.length ? unique / words.length : 0;
  return { wordCount, sentences, longSentences, paragraphs, connectorsBasic, connectorsLinking, overused, variety };
};

// ---------------------------------------------------------------------------
// Rule-based (basic) feedback
// ---------------------------------------------------------------------------

const quoteList = (words: string[]): string => words.slice(0, 3).map((word) => `‘${word}’`).join(", ");


export const ruleBasedFeedback = (text: string, prompt: WritingPromptSpec): WritingFeedback => {
  const min = Math.max(1, Math.floor(prompt.expected_length_min));
  const max = Math.max(min, Math.floor(prompt.expected_length_max));
  const band = levelBand(prompt.level);
  const signals = analyseText(text, prompt);
  const { corrections, counts, correctedText } = detectCommonMistakes(text);
  const checklist = checkChecklist(text, prompt);
  const used = usedTargetWords(text, prompt.target_vocabulary);
  const wc = signals.wordCount;

  // Task: length against the target range, plus the task points we can see.
  const lengthScore = wc < min ? (100 * wc) / min : wc > max ? Math.max(60, 100 - ((wc - max) / max) * 150) : 100;
  const checkable = checklist.filter((item) => item.covered !== null);
  const coveredCount = checkable.filter((item) => item.covered).length;
  const coverage = checkable.length ? coveredCount / checkable.length : 1;
  let task = 0.55 * lengthScore + 0.45 * coverage * 100;
  if (wc < min * 0.5) task = Math.min(task, 50);
  task = clampInt(task, 5, 90);

  // Organisation: enough sentences, linking words, paragraphs, sentence length.
  const expectedSentences = Math.max(2, Math.round(min / 15));
  const linkingNeeded = band === "A" ? 0 : band === "B" ? 1 : 2;
  let organisation = 90;
  if (signals.sentences.length < expectedSentences) organisation -= Math.min(40, (expectedSentences - signals.sentences.length) * 8);
  if (band === "A" && wc >= 20 && signals.connectorsBasic.length === 0 && signals.connectorsLinking.length === 0) organisation -= 10;
  if (signals.connectorsLinking.length < linkingNeeded) organisation -= (linkingNeeded - signals.connectorsLinking.length) * 10;
  if (min >= 150 && signals.paragraphs < 2) organisation -= 10;
  organisation -= Math.min(24, signals.longSentences.length * 8);
  if (finalPunctuationHit(text)) organisation -= 5;
  organisation = clampInt(organisation, 20, 90);

  // Vocabulary: variety of words, useful words from the task, repetition.
  let vocabulary = 40 + ((signals.variety - 0.4) / 0.35) * 50;
  vocabulary += Math.min(10, used.length * 5);
  vocabulary -= Math.min(18, signals.overused.length * 6);
  vocabulary -= Math.min(12, (counts.vocabulary + counts.style) * 4);
  vocabulary = clampInt(vocabulary, 25, 90);

  // Grammar: only common mistakes can be found without AI, so the top score is capped.
  const errorWeight = counts.grammar + counts.spelling + counts.punctuation * 0.5;
  // Mistakes per 100 words; short texts count as 50 words so one slip is not a disaster.
  const rate = (errorWeight / Math.max(50, wc)) * 100;
  const grammar = clampInt(85 - rate * 5, 25, 85);

  const criteria: WritingCriterion[] = [
    {
      key: "task",
      score: task,
      comment: wc < min
        ? `Your text is ${wc} words. The task asks for ${min}–${max}.`
        : checkable.length && coveredCount < checkable.length
        ? "Some points from the task may be missing."
        : "You wrote enough and seem to cover the task points.",
    },
    {
      key: "organisation",
      score: organisation,
      comment: signals.connectorsLinking.length < linkingNeeded
        ? "Use more linking words to connect your ideas."
        : signals.longSentences.length
        ? "Some sentences are very long. Split them up."
        : "Your ideas are in clear sentences.",
    },
    {
      key: "vocabulary",
      score: vocabulary,
      comment: signals.overused.length
        ? `You repeat some words, for example ‘${signals.overused[0]?.word}’.`
        : used.length
        ? `Good use of task words: ${quoteList(used)}.`
        : "Try to use some of the useful words from the task.",
    },
    {
      key: "grammar",
      score: grammar,
      comment: errorWeight === 0
        ? "We found none of the common mistakes we check for."
        : "We found some common mistakes. See the corrections below.",
    },
  ];

  const strengths: string[] = [];
  if (wc >= min && wc <= max) strengths.push(`Your text is the right length (${wc} words).`);
  if (checkable.length && coveredCount === checkable.length) strengths.push("You seem to cover every point in the task.");
  else if (checkable.length && coveredCount >= Math.ceil(checkable.length / 2)) strengths.push("You cover most of the points in the task.");
  if (used.length >= 2) strengths.push(`You used useful words from the task: ${quoteList(used)}.`);
  if (signals.connectorsLinking.length >= Math.max(1, linkingNeeded)) {
    strengths.push(`You link your ideas with words like ${quoteList(signals.connectorsLinking)}.`);
  }
  if (errorWeight === 0 && wc >= min * 0.5) strengths.push("We found none of the common mistakes we check for.");
  if (!strengths.length) strengths.push("You wrote a first draft. Now you can improve it.");

  const improvements: string[] = [];
  if (wc < min) improvements.push(`Write about ${min - wc} more ${min - wc === 1 ? "word" : "words"} to reach at least ${min}.`);
  if (wc > max) improvements.push(`Cut about ${wc - max} ${wc - max === 1 ? "word" : "words"} to stay within ${max}.`);
  for (const item of checklist.filter((entry) => entry.covered === false).slice(0, 2)) {
    improvements.push(`Check that you included this point: ${item.point.replace(/\.$/, "")}.`);
  }
  if (signals.connectorsLinking.length < linkingNeeded) {
    improvements.push(band === "B"
      ? "Link your ideas with words like ‘however’, ‘although’ or ‘for example’."
      : "Link your ideas with words like ‘however’, ‘therefore’, ‘as a result’ or ‘on the other hand’.");
  } else if (band === "A" && wc >= 20 && signals.connectorsBasic.length === 0) {
    improvements.push("Join short sentences with ‘and’, ‘but’ or ‘because’.");
  }
  if (signals.longSentences[0]) improvements.push(`One sentence has ${signals.longSentences[0].words} words. Split it into two.`);
  if (signals.overused[0]) {
    improvements.push(`You used ‘${signals.overused[0].word}’ ${signals.overused[0].count} times. Try a different word sometimes.`);
  }
  if (min >= 150 && signals.paragraphs < 2) improvements.push("Use paragraphs: an opening, the main part and an ending.");
  if (corrections.length && improvements.length < 4) improvements.push("Fix the mistakes in the corrections list, then check your text again.");
  if (used.length === 0 && (prompt.target_vocabulary ?? []).length) {
    improvements.push(`Try to use some useful words from the task, like ${quoteList(prompt.target_vocabulary ?? [])}.`);
  }

  const shownCorrections = corrections.slice(0, MAX_CORRECTIONS);
  const modelSentences: Array<{ original: string; improved: string }> = [];
  // Corrected versions of the first sentences that had mistakes.
  const fixedSentences = splitSentences(correctedText);
  if (fixedSentences.length === signals.sentences.length) {
    signals.sentences.forEach((sentence, index) => {
      const improved = fixedSentences[index] ?? sentence;
      if (modelSentences.length < 2 && improved !== sentence) modelSentences.push({ original: sentence, improved });
    });
  }

  // Accuracy weighs a little more: it is what the basic checks measure most directly.
  const overall = clampInt(task * 0.25 + organisation * 0.2 + vocabulary * 0.2 + grammar * 0.35, 0, 100);
  return {
    source: "basic",
    overall,
    criteria,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 4),
    corrections: shownCorrections,
    next_step: improvements[0] ?? (shownCorrections.length
      ? "Fix the corrections below, then check your text again."
      : "Read your text aloud once and check that every sentence is clear."),
    model_sentences: modelSentences,
    checklist,
    word_count: wc,
    target: { min, max },
    used_words: used,
  };
};

// ---------------------------------------------------------------------------
// AI feedback
// ---------------------------------------------------------------------------

export const WRITING_SYSTEM_PROMPT = [
  "You are a kind, precise English writing teacher. You mark a learner's text against the CEFR level of the task.",
  "Score four criteria from 0 to 100 (whole numbers): task (does the text do everything the task asks, for the right reader, at the right length?),",
  "organisation (logical order, paragraphs where needed, linking words), vocabulary (range and accuracy of words for this level),",
  "grammar (accuracy and range of grammar, spelling and punctuation).",
  "Scale: 85-100 = fully meets the target level, 65-84 = mostly meets it, 40-64 = partly meets it, below 40 = not yet at this level.",
  "overall is your overall judgement on the same scale and should be close to the average of the four criteria.",
  "Rules for corrections: list up to 6 of the most important real mistakes. 'original' MUST be copied exactly, character for character,",
  "from the learner's text and be short (one phrase, at most 12 words). 'corrected' is the fixed version of that same phrase.",
  "Do not correct text that is already correct. British and American spelling are both fine.",
  "category is one of grammar, vocabulary, spelling, punctuation, style.",
  `For grammar corrections, topic is the grammar point it practises, one of: ${GRAMMAR_TOPICS.join(", ")}; otherwise topic is null.`,
  "Write every comment for a learner at about B1 level: short, plain, friendly, concrete, and speak to the learner as 'you'.",
  "Each comment is one sentence of at most 20 words. Do not mention AI, scores or the rubric in comments.",
  "model_sentences: rewrite 1 or 2 key sentences from the text so they show the target level. 'original' must be copied exactly from the text.",
  "checklist_covered: one true/false per task point, in the same order, true only if the text clearly covers that point.",
  "Return strict JSON only, with this shape:",
  '{"overall":0,"criteria":{"task":{"score":0,"comment":""},"organisation":{"score":0,"comment":""},"vocabulary":{"score":0,"comment":""},"grammar":{"score":0,"comment":""}},',
  '"strengths":["",""],"improvements":["",""],"corrections":[{"original":"","corrected":"","explanation":"","category":"grammar","topic":null}],',
  '"next_step":"","model_sentences":[{"original":"","improved":""}],"checklist_covered":[true]}',
].join(" ");

export const buildWritingAIRequest = (text: string, prompt: WritingPromptSpec): { systemPrompt: string; userPayload: string; temperature: number } => ({
  systemPrompt: WRITING_SYSTEM_PROMPT,
  userPayload: JSON.stringify({
    target_level: String(prompt.level ?? "B1").toUpperCase(),
    text_type: prompt.genre ?? null,
    task_title: prompt.title,
    task: prompt.prompt_text,
    task_points: parseChecklist(prompt.guidance_text),
    target_length_words: { min: prompt.expected_length_min, max: prompt.expected_length_max },
    useful_words: prompt.target_vocabulary ?? [],
    grammar_focus: prompt.target_grammar ?? null,
    structure_tip: prompt.target_structure ?? null,
    word_count: countWords(text),
    learner_text: text.slice(0, 12000),
  }),
  temperature: 0.2,
});

const CRITERION_ALIASES: Record<string, WritingCriterionKey> = {
  task: "task",
  task_achievement: "task",
  task_response: "task",
  content: "task",
  organisation: "organisation",
  organization: "organisation",
  coherence: "organisation",
  coherence_cohesion: "organisation",
  vocabulary: "vocabulary",
  lexis: "vocabulary",
  lexical_resource: "vocabulary",
  range: "vocabulary",
  grammar: "grammar",
  accuracy: "grammar",
  grammar_accuracy: "grammar",
  grammatical_range_accuracy: "grammar",
};

const toScore = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const stringList = (value: unknown, max: number, maxLen: number): string[] =>
  (Array.isArray(value) ? value : [])
    .map((entry) => cleanString(entry, maxLen))
    .filter(Boolean)
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .slice(0, max);

const normalizeCategory = (value: unknown): WritingCategory => {
  const key = cleanString(value, 40).toLowerCase();
  if ((WRITING_CATEGORIES as readonly string[]).includes(key)) return key as WritingCategory;
  if (key.includes("spell")) return "spelling";
  if (key.includes("punct") || key.includes("capital")) return "punctuation";
  if (key.includes("vocab") || key.includes("word") || key.includes("lex")) return "vocabulary";
  if (key.includes("style") || key.includes("register") || key.includes("tone")) return "style";
  return "grammar";
};

/** Keeps only corrections whose original text really appears in the draft. */
export const validateCorrections = (raw: unknown, draft: string, max = MAX_CORRECTIONS): WritingCorrection[] => {
  const out: WritingCorrection[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const item = asObject(entry);
    if (!item) continue;
    const quoted = cleanString(item.original, 300);
    const corrected = cleanString(item.corrected, 300);
    if (!quoted || !corrected) continue;
    const original = findInDraft(draft, quoted);
    if (!original) continue;
    if (corrected === original.replace(/\s+/g, " ").trim()) continue;
    const key = original.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      original,
      corrected,
      explanation: cleanString(item.explanation, 240) || "Check this part.",
      category: normalizeCategory(item.category),
      topic: isGrammarTopic(item.topic) ? item.topic : null,
    });
    if (out.length >= max) break;
  }
  return out;
};

const overlaps = (a: string, b: string): boolean => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
};

/**
 * Turns the model's JSON into safe feedback. Returns null when the payload is
 * unusable (fewer than three scored criteria), so the caller falls back.
 */
export const normalizeAIFeedback = (raw: unknown, text: string, prompt: WritingPromptSpec): WritingFeedback | null => {
  const root = asObject(raw);
  if (!root) return null;
  const data = asObject(root.feedback) ?? asObject(root.result) ?? root;

  const scores = new Map<WritingCriterionKey, { score: number; comment: string }>();
  const readCriterion = (keyRaw: string, value: unknown) => {
    const key = CRITERION_ALIASES[keyRaw.toLowerCase().replace(/[\s&-]+/g, "_")];
    if (!key || scores.has(key)) return;
    const obj = asObject(value);
    const score = toScore(obj ? obj.score ?? obj.band ?? obj.value : value);
    if (score === null) return;
    scores.set(key, { score, comment: cleanString(obj?.comment ?? obj?.feedback, 220) });
  };
  const criteriaRaw = data.criteria;
  if (Array.isArray(criteriaRaw)) {
    for (const entry of criteriaRaw) {
      const obj = asObject(entry);
      if (obj) readCriterion(String(obj.key ?? obj.name ?? obj.criterion ?? ""), obj);
    }
  } else if (asObject(criteriaRaw)) {
    for (const [key, value] of Object.entries(criteriaRaw as Record<string, unknown>)) readCriterion(key, value);
  }
  if (scores.size < 3) return null;

  let overallRaw = toScore(data.overall ?? data.overall_score ?? data.score);
  // Some models answer on a 0-10 scale despite the instructions.
  const allSmall = [...scores.values()].every((entry) => entry.score <= 10) && (overallRaw === null || overallRaw <= 10);
  if (allSmall) {
    for (const entry of scores.values()) entry.score *= 10;
    if (overallRaw !== null) overallRaw *= 10;
  }
  const known = [...scores.values()].map((entry) => clampInt(entry.score, 0, 100));
  const mean = known.reduce((sum, value) => sum + value, 0) / known.length;
  const criteria: WritingCriterion[] = WRITING_CRITERIA.map((key) => {
    const entry = scores.get(key);
    return { key, score: entry ? clampInt(entry.score, 0, 100) : clampInt(mean, 0, 100), comment: entry?.comment ?? "" };
  });
  const criteriaMean = criteria.reduce((sum, entry) => sum + entry.score, 0) / criteria.length;
  let overall = overallRaw === null ? criteriaMean : clampInt(overallRaw, 0, 100);
  if (Math.abs(overall - criteriaMean) > 15) overall = criteriaMean;

  // Guardrail: a text far below the target length cannot fully achieve the task.
  const wc = countWords(text);
  const min = Math.max(1, Math.floor(prompt.expected_length_min));
  const max = Math.max(min, Math.floor(prompt.expected_length_max));
  if (wc < min * 0.5) {
    const task = criteria.find((entry) => entry.key === "task");
    if (task) task.score = Math.min(task.score, 50);
    overall = Math.min(overall, 60);
  }
  overall = clampInt(overall, 0, 100);

  // Corrections from the model, topped up with reliable rule-based ones it missed.
  const corrections = validateCorrections(data.corrections, text);
  if (corrections.length < MAX_CORRECTIONS) {
    for (const rule of detectCommonMistakes(text).corrections) {
      if (corrections.length >= MAX_CORRECTIONS) break;
      if (corrections.some((entry) => overlaps(entry.original, rule.original))) continue;
      corrections.push(rule);
    }
  }

  const modelSentences: Array<{ original: string; improved: string }> = [];
  for (const entry of Array.isArray(data.model_sentences) ? data.model_sentences : []) {
    const obj = asObject(entry);
    if (!obj) continue;
    const original = findInDraft(text, cleanString(obj.original, 600));
    const improved = cleanString(obj.improved ?? obj.rewrite, 600);
    if (!original || !improved || improved === original) continue;
    modelSentences.push({ original, improved });
    if (modelSentences.length >= 2) break;
  }

  const points = parseChecklist(prompt.guidance_text);
  const covered = Array.isArray(data.checklist_covered) ? data.checklist_covered : null;
  const checklist: WritingChecklistItem[] = covered && covered.length === points.length && covered.every((value) => typeof value === "boolean")
    ? points.map((point, index) => ({ point, covered: covered[index] as boolean }))
    : checkChecklist(text, prompt);

  const strengths = stringList(data.strengths, 3, 220);
  const improvements = stringList(data.improvements, 3, 220);
  const nextStep = cleanString(data.next_step ?? data.actionable_next_step, 300)
    || improvements[0]
    || "Fix the corrections below, then check your text again.";

  return {
    source: "ai",
    overall,
    criteria,
    strengths: strengths.length ? strengths : ["You completed a full draft for this task."],
    improvements,
    corrections,
    next_step: nextStep,
    model_sentences: modelSentences,
    checklist,
    word_count: wc,
    target: { min, max },
    used_words: usedTargetWords(text, prompt.target_vocabulary),
  };
};

/** AI feedback when the model answered usefully, otherwise the basic rule-based feedback. */
export const buildWritingFeedback = (
  text: string,
  prompt: WritingPromptSpec,
  ai: { status: string; data: unknown } | null,
): WritingFeedback => {
  if (ai && ai.status === "ok") {
    const normalized = normalizeAIFeedback(ai.data, text, prompt);
    if (normalized) return normalized;
  }
  return ruleBasedFeedback(text, prompt);
};

// ---------------------------------------------------------------------------
// Learner-record issues (for the Review page and recommendations)
// ---------------------------------------------------------------------------

const SEVERITY: Record<WritingCategory, number> = { grammar: 0.6, vocabulary: 0.5, spelling: 0.4, punctuation: 0.35, style: 0.3 };

export const issuesFromFeedback = (feedback: WritingFeedback, slug: string): Array<Record<string, unknown>> => {
  const issues: Array<Record<string, unknown>> = feedback.corrections.map((correction) => {
    const topic = correction.category === "grammar"
      ? grammarTopicFor({ original: correction.original, corrected: correction.corrected, explanation: correction.explanation, suggested: correction.topic })
      : null;
    return {
    category: correction.category === "grammar" ? "grammar" : correction.category === "vocabulary" ? "vocabulary" : "writing",
    // A grammar topic links the mistake to the lesson that fixes it.
    subskill_key: topic ? topicSubskill(topic) : `writing.${correction.category}`,
    location_ref: slug,
    explanation: `${correction.original} → ${correction.corrected}`.slice(0, 240),
    correction_hint: correction.explanation,
    severity: SEVERITY[correction.category],
    };
  });
  const task = feedback.criteria.find((entry) => entry.key === "task");
  if (task && task.score < 50) {
    issues.push({
      category: "writing",
      subskill_key: "writing.task_completion",
      location_ref: slug,
      explanation: "Answer every point in the task, at the right length.",
      correction_hint: task.comment || "Read the task points again before you write.",
      severity: 0.6,
    });
  }
  const organisation = feedback.criteria.find((entry) => entry.key === "organisation");
  if (organisation && organisation.score < 50) {
    issues.push({
      category: "writing",
      subskill_key: "writing.organisation",
      location_ref: slug,
      explanation: "Organise your ideas with clear sentences and linking words.",
      correction_hint: organisation.comment || "Use one idea per sentence and link them.",
      severity: 0.5,
    });
  }
  return issues.slice(0, 8);
};
