// Tap-to-translate: pure parsing and validation for one-word lookups.
//
// The hub route (hub/word-lookup.ts) looks a word up in the shared cache
// (english_word_glosses), then in vocabulary decks and the lexicon, and only
// then asks the AI. Everything here is pure so it can be unit tested.

export const WORD_MAX_LENGTH = 40;
export const CONTEXT_MAX_LENGTH = 240;
/** New AI lookups per learner per learner-day. Cached words are free and unlimited. */
export const WORD_AI_DAILY_LIMIT = 60;

export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "interjection",
  "modal",
  "phrase",
] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

/** Contractions that end in 's but are not possessives ("it's" = "it is"). */
const S_CONTRACTIONS = new Set([
  "it's",
  "that's",
  "he's",
  "she's",
  "what's",
  "there's",
  "here's",
  "let's",
  "who's",
  "where's",
  "how's",
  "when's",
  "why's",
]);

const WORD_SHAPE = /^[a-z]+(?:['-][a-z]+)*$/;

/**
 * Light normalisation of a tapped word: lower case, straight apostrophes, no
 * possessive 's or trailing apostrophe. Returns null for anything that is not
 * a word (numbers, punctuation, non-Latin letters, too long).
 */
export const normalizeLookupWord = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  let word = raw.trim().toLowerCase().replace(/[‘’ʼ`]/g, "'");
  if (!word || word.length > WORD_MAX_LENGTH + 2) return null;
  if (word.endsWith("'s") && !S_CONTRACTIONS.has(word)) word = word.slice(0, -2);
  else if (word.endsWith("'")) word = word.slice(0, -1);
  if (!word || word.length > WORD_MAX_LENGTH || !WORD_SHAPE.test(word)) return null;
  return word;
};

/** The sentence the learner saw the word in: single line, no control characters, capped. */
export const trimContext = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  // deno-lint-ignore no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= CONTEXT_MAX_LENGTH) return clean;
  const cut = clean.slice(0, CONTEXT_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > CONTEXT_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trim();
};

export type Gloss = {
  /** The dictionary form that the meaning describes ("run" for "ran"). */
  lemma: string;
  part_of_speech: PartOfSpeech | null;
  definition: string;
  example: string | null;
  ru: string | null;
  uz: string | null;
};

const clip = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

export const normalizePartOfSpeech = (value: unknown): PartOfSpeech | null => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return null;
  const direct = PARTS_OF_SPEECH.find((pos) => pos === raw);
  if (direct) return direct;
  if (/^(modal|auxiliary)/.test(raw)) return "modal";
  if (/^(phrasal|idiom|phrase|expression)/.test(raw)) return "phrase";
  if (/^(article|determiner|quantifier)/.test(raw)) return "determiner";
  const first = PARTS_OF_SPEECH.find((pos) => raw.startsWith(pos));
  return first ?? null;
};

/** Uzbek Latin uses ʻ for oʻ and gʻ; models often send ' or ‘ instead. */
export const normalizeUzbek = (value: string): string => value.replace(/([oOgG])['‘’`]/g, "$1ʻ");

export type ParsedAiGloss = { known: false } | { known: true; gloss: Gloss };

/**
 * Validates the AI's JSON for one word. Returns null when the answer is not
 * usable (missing fields, wrong scripts); the caller then reports the AI as
 * unavailable instead of caching a bad entry.
 */
export const parseAiGloss = (raw: unknown, word: string): ParsedAiGloss | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.known === false) return { known: false };
  const definition = clip(record.definition, 200);
  const ru = clip(record.ru, 120);
  const uz = normalizeUzbek(clip(record.uz, 120));
  if (!definition || !ru || !uz) return null;
  // Russian must be Cyrillic; Uzbek must be Latin (the app uses Latin Uzbek).
  if (!/[Ѐ-ӿ]/.test(ru)) return null;
  if (/[Ѐ-ӿ]/.test(uz) || !/[a-z]/i.test(uz)) return null;
  const lemma = normalizeLookupWord(record.lemma) ?? word;
  const example = clip(record.example, 200);
  return {
    known: true,
    gloss: {
      lemma,
      part_of_speech: normalizePartOfSpeech(record.part_of_speech),
      definition,
      example: example || null,
      ru,
      uz,
    },
  };
};

export type DeckWordRow = {
  word: string;
  part_of_speech: string | null;
  definition: string | null;
  example: string | null;
  translation_ru: string | null;
  translation_uz: string | null;
};

export type LexiconRow = {
  part_of_speech: string | null;
  definition: string | null;
  example: string | null;
};

/** What existing content already knows about the word. `complete` means no AI call is needed. */
export type ExistingGloss = { gloss: Gloss; complete: boolean; source: "deck" | "lexicon" };

/**
 * Picks the most useful deck entry for the word (both translations first),
 * falling back to a lexicon entry that has at least a definition.
 */
export const existingGloss = (
  word: string,
  deckRows: DeckWordRow[],
  lexicon: LexiconRow | null,
): ExistingGloss | null => {
  const deck = deckRows
    .filter((row) => normalizeLookupWord(row.word) === word && clip(row.definition, 200))
    .map((row) => ({ row, score: (clip(row.translation_ru, 120) ? 1 : 0) + (clip(row.translation_uz, 120) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)[0]?.row;
  if (deck) {
    const ru = clip(deck.translation_ru, 120) || null;
    const uz = clip(deck.translation_uz, 120) || null;
    return {
      source: "deck",
      complete: Boolean(ru && uz),
      gloss: {
        lemma: word,
        part_of_speech: normalizePartOfSpeech(deck.part_of_speech),
        definition: clip(deck.definition, 200),
        example: clip(deck.example, 200) || null,
        ru,
        uz: uz ? normalizeUzbek(uz) : null,
      },
    };
  }
  const definition = clip(lexicon?.definition, 200);
  if (!lexicon || !definition) return null;
  return {
    source: "lexicon",
    complete: false,
    gloss: {
      lemma: word,
      part_of_speech: normalizePartOfSpeech(lexicon.part_of_speech),
      definition,
      example: clip(lexicon.example, 200) || null,
      ru: null,
      uz: null,
    },
  };
};

export type AiCapDecision = { allowed: boolean; used: number; limit: number };

export const decideAiLookup = (usedToday: number, limit = WORD_AI_DAILY_LIMIT): AiCapDecision => {
  const used = Number.isFinite(usedToday) && usedToday > 0 ? Math.floor(usedToday) : 0;
  return { allowed: used < limit, used, limit };
};

export const WORD_LOOKUP_SYSTEM_PROMPT = [
  "You are a learner's dictionary for people in Uzbekistan learning English (levels A1 to B2).",
  "You get one English word and, sometimes, the sentence where the learner saw it.",
  "Use the sentence only to recognise the word's dictionary form and part of speech; describe the word's most common general meaning, not a meaning that only fits that sentence.",
  "Reply with strict JSON only, with these keys:",
  '{"known": boolean, "lemma": string, "part_of_speech": string, "definition": string, "example": string, "ru": string, "uz": string}',
  "Rules:",
  "- known is false if it is not a real English word, a spelling mistake, or a person's first name. Then the other keys may be empty.",
  "- lemma: the dictionary form in lower case (\"ran\" -> \"run\", \"children\" -> \"child\", \"better\" -> \"good\"). Same as the word when it is already the base form.",
  "- part_of_speech: one of noun, verb, adjective, adverb, pronoun, preposition, conjunction, determiner, interjection, modal, phrase.",
  "- definition: simple English for an A2 learner, at most 18 words, without using the word itself. Do not start with the word.",
  "- example: one short natural sentence (at most 14 words) that uses the word in the form given.",
  "- ru: one to three short Russian equivalents, comma separated, in Cyrillic.",
  "- uz: one to three short Uzbek equivalents, comma separated, in Uzbek Latin script with ʻ (oʻ, gʻ).",
  "- Never add notes, transliterations or extra keys.",
].join("\n");

/** The user message for the AI. `hint` is a definition from our own content, when there is one. */
export const buildWordLookupPayload = (word: string, context: string, hint: Gloss | null): string =>
  JSON.stringify({
    word,
    ...(context ? { sentence: context } : {}),
    ...(hint
      ? {
        known_meaning: {
          definition: hint.definition,
          ...(hint.part_of_speech ? { part_of_speech: hint.part_of_speech } : {}),
          ...(hint.example ? { example: hint.example } : {}),
        },
      }
      : {}),
  });

export type WordLookupSource = "cache" | "deck" | "lexicon" | "ai";

/** What the hub returns for a word. `partial` = no translation yet (AI capped or unavailable). */
export const publicGloss = (
  word: string,
  gloss: Gloss,
  source: WordLookupSource,
  saved: boolean,
  notice: "limit" | "unavailable" | null = null,
) => ({
  word,
  headword: gloss.lemma,
  part_of_speech: gloss.part_of_speech,
  definition: gloss.definition,
  example: gloss.example,
  ru: gloss.ru,
  uz: gloss.uz,
  source,
  partial: !gloss.ru || !gloss.uz,
  notice,
  saved,
});
