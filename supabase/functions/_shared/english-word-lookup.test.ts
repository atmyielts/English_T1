import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildWordLookupPayload,
  CONTEXT_MAX_LENGTH,
  decideAiLookup,
  existingGloss,
  normalizeLookupWord,
  normalizePartOfSpeech,
  parseAiGloss,
  publicGloss,
  trimContext,
  WORD_AI_DAILY_LIMIT,
} from "./english-word-lookup.ts";

Deno.test("tapped words are normalised lightly and anything else is refused", () => {
  assertEquals(normalizeLookupWord("  Bus "), "bus");
  assertEquals(normalizeLookupWord("Aziz’s"), "aziz");
  assertEquals(normalizeLookupWord("students'"), "students");
  assertEquals(normalizeLookupWord("it's"), "it's");
  assertEquals(normalizeLookupWord("Don’t"), "don't");
  assertEquals(normalizeLookupWord("well-known"), "well-known");
  assertEquals(normalizeLookupWord("a"), "a");
  for (const bad of ["", "  ", "42", "bus.", "two words", "-bus", "bus--stop", "привет", "café", "x".repeat(41), null, 7]) {
    assertEquals(normalizeLookupWord(bad), null, String(bad));
  }
  assertEquals(normalizeLookupWord("x".repeat(40)), "x".repeat(40));
});

Deno.test("context is one trimmed line, capped at a word boundary", () => {
  assertEquals(trimContext("  The bus\n\twas  late. "), "The bus was late.");
  assertEquals(trimContext(undefined), "");
  const long = trimContext("word ".repeat(100));
  assert(long.length <= CONTEXT_MAX_LENGTH);
  assert(!long.endsWith(" "));
});

Deno.test("AI answers are validated before they are cached", () => {
  const good = parseAiGloss({
    known: true,
    lemma: "Run",
    part_of_speech: "Verb (irregular)",
    definition: "  to move fast on your feet ",
    example: "She ran to the bus.",
    ru: "бежать",
    uz: "yugurmoq, chopmoq",
  }, "ran");
  assertEquals(good, {
    known: true,
    gloss: {
      lemma: "run",
      part_of_speech: "verb",
      definition: "to move fast on your feet",
      example: "She ran to the bus.",
      ru: "бежать",
      uz: "yugurmoq, chopmoq",
    },
  });
  assertEquals(parseAiGloss({ known: false }, "asdf"), { known: false });
  // Missing translation, wrong scripts, or not an object: not usable.
  assertEquals(parseAiGloss({ known: true, definition: "x", ru: "бежать" }, "run"), null);
  assertEquals(parseAiGloss({ known: true, definition: "x", ru: "run", uz: "yugurmoq" }, "run"), null);
  assertEquals(parseAiGloss({ known: true, definition: "x", ru: "бежать", uz: "югурмоқ" }, "run"), null);
  assertEquals(parseAiGloss("nope", "run"), null);
  assertEquals(parseAiGloss([], "run"), null);
  // A bad lemma falls back to the word; Uzbek apostrophes become ʻ.
  const fixed = parseAiGloss({ known: true, lemma: "2 runs", definition: "big", ru: "большой", uz: "katta, ulug'" }, "big");
  assert(fixed && fixed.known);
  assertEquals(fixed.gloss.lemma, "big");
  assertEquals(fixed.gloss.uz, "katta, ulugʻ");
  assertEquals(fixed.gloss.part_of_speech, null);
});

Deno.test("parts of speech map onto the short list", () => {
  assertEquals(normalizePartOfSpeech("NOUN"), "noun");
  assertEquals(normalizePartOfSpeech("modal verb"), "modal");
  assertEquals(normalizePartOfSpeech("auxiliary verb"), "modal");
  assertEquals(normalizePartOfSpeech("phrasal verb"), "phrase");
  assertEquals(normalizePartOfSpeech("article"), "determiner");
  assertEquals(normalizePartOfSpeech("adjective, comparative"), "adjective");
  assertEquals(normalizePartOfSpeech("symbol"), null);
  assertEquals(normalizePartOfSpeech(null), null);
});

Deno.test("deck words with both translations need no AI; lexicon entries are only hints", () => {
  const deckRows = [
    { word: "Abroad", part_of_speech: "adverb", definition: "in another country", example: null, translation_ru: "за границей", translation_uz: null },
    { word: "abroad", part_of_speech: "adverb", definition: "in another country", example: "He lives abroad.", translation_ru: "за границей", translation_uz: "chet elda" },
  ];
  const deck = existingGloss("abroad", deckRows, null);
  assertEquals(deck?.source, "deck");
  assertEquals(deck?.complete, true);
  assertEquals(deck?.gloss.uz, "chet elda");

  const half = existingGloss("abroad", [deckRows[0]!], null);
  assertEquals(half?.complete, false);

  const lexicon = existingGloss("commute", [], { part_of_speech: "noun", definition: "a trip to work", example: null });
  assertEquals(lexicon, {
    source: "lexicon",
    complete: false,
    gloss: { lemma: "commute", part_of_speech: "noun", definition: "a trip to work", example: null, ru: null, uz: null },
  });
  assertEquals(existingGloss("commute", [], { part_of_speech: null, definition: "  ", example: null }), null);
  // A deck row for a different word never matches.
  assertEquals(existingGloss("road", deckRows, null), null);
});

Deno.test("new AI lookups are capped per learner-day", () => {
  assertEquals(decideAiLookup(0).allowed, true);
  assertEquals(decideAiLookup(WORD_AI_DAILY_LIMIT - 1).allowed, true);
  assertEquals(decideAiLookup(WORD_AI_DAILY_LIMIT).allowed, false);
  assertEquals(decideAiLookup(Number.NaN), { allowed: true, used: 0, limit: WORD_AI_DAILY_LIMIT });
  assertEquals(decideAiLookup(3, 3).allowed, false);
});

Deno.test("the AI payload carries the word, the sentence and our own meaning", () => {
  const payload = JSON.parse(buildWordLookupPayload("ran", "She ran home.", null));
  assertEquals(payload, { word: "ran", sentence: "She ran home." });
  const hinted = JSON.parse(buildWordLookupPayload("commute", "", {
    lemma: "commute",
    part_of_speech: "noun",
    definition: "a trip to work",
    example: null,
    ru: null,
    uz: null,
  }));
  assertEquals(hinted, { word: "commute", known_meaning: { definition: "a trip to work", part_of_speech: "noun" } });
});

Deno.test("the public answer flags missing translations", () => {
  const gloss = { lemma: "run", part_of_speech: "verb" as const, definition: "move fast", example: null, ru: "бежать", uz: null };
  const body = publicGloss("ran", gloss, "lexicon", true, "limit");
  assertEquals(body.headword, "run");
  assertEquals(body.partial, true);
  assertEquals(body.notice, "limit");
  assertEquals(body.saved, true);
  assertStringIncludes(JSON.stringify(publicGloss("run", { ...gloss, uz: "yugurmoq" }, "ai", false)), '"partial":false');
});
