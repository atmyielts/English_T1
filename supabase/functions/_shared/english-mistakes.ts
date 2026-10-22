// Links a learner's grammar mistakes to the grammar lesson that fixes them.
//
// Writing, speaking and real-life tasks record corrections like
// "more better → better". To turn repeated mistakes into targeted practice,
// each correction is tagged with a grammar topic that matches a lesson's
// `focus_area` (see grammar_units). The model may suggest a topic; otherwise
// a conservative classifier looks at what changed and at the explanation.
// Unknown stays unknown: no topic is better than a wrong lesson.

export const GRAMMAR_TOPICS = [
  "to-be",
  "present-simple",
  "there-is",
  "modal-can",
  "plurals-demonstratives",
  "possessives",
  "articles",
  "past-simple",
  "present-continuous",
  "comparatives",
  "future",
  "quantifiers",
  "tense",
  "prepositions",
  "agreement",
  "present-perfect",
  "conditionals",
  "used-to",
  "modals-obligation",
  "relative-clauses",
  "verb-patterns",
  "past-perfect",
  "passive",
  "reported-speech",
  "conditionals-past",
  "modals-deduction",
  "linkers",
  "inversion",
  "cleft-sentences",
  "participle-clauses",
  "modals-past",
  "wish",
  "subjunctive",
  "hedging",
] as const;
export type GrammarTopic = (typeof GRAMMAR_TOPICS)[number];

export const isGrammarTopic = (value: unknown): value is GrammarTopic =>
  typeof value === "string" && (GRAMMAR_TOPICS as readonly string[]).includes(value);

/** Mistake subskill key for a topic, e.g. `grammar.articles`. */
export const topicSubskill = (topic: GrammarTopic): string => `grammar.${topic}`;

/** Reads a topic back from a subskill key, or null. */
export const topicFromSubskill = (subskill: string | null | undefined): GrammarTopic | null => {
  const value = String(subskill ?? "");
  if (!value.startsWith("grammar.")) return null;
  const topic = value.slice("grammar.".length);
  return isGrammarTopic(topic) ? topic : null;
};

const words = (text: string): string[] =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Words only in `a` (multiset difference). */
const minus = (a: string[], b: string[]): string[] => {
  const rest = [...b];
  const out: string[] = [];
  for (const word of a) {
    const index = rest.indexOf(word);
    if (index >= 0) rest.splice(index, 1);
    else out.push(word);
  }
  return out;
};

const ARTICLES = new Set(["a", "an", "the"]);
const PREPOSITIONS = new Set(["in", "on", "at", "to", "for", "with", "about", "from", "of", "by", "into", "onto", "since", "during", "until", "till", "under", "over"]);
const QUANTIFIERS = new Set(["much", "many", "few", "little", "some", "any", "less", "fewer", "lot", "lots"]);
const BE = new Set(["am", "is", "are", "was", "were", "be", "'m", "'s", "'re", "i'm", "he's", "she's", "it's", "we're", "they're", "you're"]);
const UNCOUNTABLE_PLURALS = new Set(["informations", "advices", "furnitures", "homeworks", "knowledges", "equipments", "luggages", "feedbacks", "evidences", "researches", "news's"]);
const AGREEMENT_PAIRS: Array<[string, string]> = [
  ["is", "are"], ["was", "were"], ["has", "have"], ["does", "do"], ["doesn't", "don't"], ["isn't", "aren't"], ["wasn't", "weren't"], ["hasn't", "haven't"],
];

const EXPLANATION_KEYWORDS: Array<[RegExp, GrammarTopic]> = [
  [/\barticles?\b|\b(?:‘|')?(?:a|an|the)(?:’|')? before\b/, "articles"],
  [/\bprepositions?\b/, "prepositions"],
  [/\bpresent perfect\b/, "present-perfect"],
  [/\bpast perfect\b/, "past-perfect"],
  [/\bpast simple\b|\bsimple past\b|\bpast tense\b|\bpast form\b/, "past-simple"],
  [/\bpresent continuous\b|\bpresent progressive\b/, "present-continuous"],
  [/\bcomparative|\bsuperlative/, "comparatives"],
  [/\buncountable|\bcountable\b/, "quantifiers"],
  [/\bsubject[- ]verb agreement\b|\bthird[- ]person\b|\bagree with the subject\b/, "agreement"],
  [/\bgerund\b|\binfinitive\b|\b-ing form\b|\bverb pattern/, "verb-patterns"],
  [/\bpassive\b/, "passive"],
  [/\bthird conditional\b|\bmixed conditional\b/, "conditionals-past"],
  [/\bconditional\b/, "conditionals"],
  [/\breported speech\b|\bindirect speech\b/, "reported-speech"],
  [/\brelative (?:clause|pronoun)\b/, "relative-clauses"],
  [/\bpossessive\b/, "possessives"],
  [/\bplural\b/, "plurals-demonstratives"],
  [/\bused to\b/, "used-to"],
  [/\bfuture\b|\bgoing to\b/, "future"],
];

/**
 * The grammar topic behind one correction, or null when it isn't clearly a
 * grammar point (spelling, punctuation, word choice, style).
 */
export const grammarTopicFor = (input: {
  original: string;
  corrected: string;
  explanation?: string | null;
  /** A topic suggested by the model; used only if it is a known topic. */
  suggested?: string | null;
}): GrammarTopic | null => {
  if (isGrammarTopic(input.suggested)) return input.suggested;

  const explanation = String(input.explanation ?? "").toLowerCase();
  for (const [pattern, topic] of EXPLANATION_KEYWORDS) {
    if (pattern.test(explanation)) return topic;
  }

  const before = words(input.original);
  const after = words(input.corrected);
  if (!before.length || !after.length) return null;
  const removed = minus(before, after);
  const added = minus(after, before);
  const changed = [...removed, ...added];
  if (!changed.length) return null;

  if (changed.every((word) => ARTICLES.has(word))) return "articles";
  // "explain me" → "explain to me", "discuss about" → "discuss": the verb decides the pattern.
  if ((added.length === 1 && added[0] === "to" && removed.length === 0) || (removed.length === 1 && removed[0] === "about" && added.length === 0)) {
    return "verb-patterns";
  }
  if (changed.every((word) => PREPOSITIONS.has(word))) return "prepositions";
  if (removed.includes("more") && !added.includes("more") && added.length === 0) return "comparatives";
  if (removed.includes("most") && added.length === 0) return "comparatives";
  if (removed.some((word) => UNCOUNTABLE_PLURALS.has(word)) || changed.every((word) => QUANTIFIERS.has(word))) return "quantifiers";
  if (before.includes("used") && after.includes("use") || before.includes("use") && after.includes("used")) {
    if (before.includes("to") && after.includes("to")) return "used-to";
  }
  // "I am agree" → "I agree": a needless form of be before a verb.
  if (removed.length === 1 && BE.has(removed[0]!) && added.length === 0) return "verb-patterns";
  if (removed.length === 1 && added.length === 1) {
    const [from, to] = [removed[0]!, added[0]!];
    if (AGREEMENT_PAIRS.some(([x, y]) => (from === x && to === y) || (from === y && to === x))) return "agreement";
    // work → works, needs → need (same stem, -s/-es only).
    const strip = (word: string) => word.replace(/(?:es|s)$/, "");
    if (from !== to && strip(from) === strip(to) && /s$/.test(from) !== /s$/.test(to)) return "agreement";
    // go → went, study → studied, buyed → bought.
    if (/ed$/.test(to) && !/ed$/.test(from)) return "past-simple";
    if (/ed$/.test(from) && !/ed$/.test(to) && after.includes("did")) return "past-simple";
    if (to === "did" || to === "didn't" || from === "did" || from === "didn't") return "past-simple";
    // -ing ↔ to + verb handled above; bare verb ↔ -ing.
    if (/ing$/.test(to) !== /ing$/.test(from) && to.replace(/ing$/, "").startsWith(from.slice(0, 3))) return "verb-patterns";
    if ((from === "will" || to === "will") || (from === "going" || to === "going")) return "future";
  }
  if (added.includes("have") || added.includes("has") || removed.includes("have") || removed.includes("has")) {
    if (after.some((word) => /ed$|en$/.test(word))) return "present-perfect";
  }
  return null;
};
