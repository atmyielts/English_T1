import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliseTappedWord, sentenceAround, tapTokens } from "../src/lib/tapWords.ts";

Deno.test("only words are tappable; punctuation and numbers stay plain text", () => {
  const tokens = tapTokens("Aziz’s bus left at 7:30, didn't it? A well-known 'road'.");
  assertEquals(tokens.filter((token) => token.word).map((token) => [token.text, token.word]), [
    ["Aziz’s", "aziz"],
    ["bus", "bus"],
    ["left", "left"],
    ["at", "at"],
    ["didn't", "didn't"],
    ["it", "it"],
    ["A", "a"],
    ["well-known", "well-known"],
    ["road", "road"],
  ]);
  // Nothing is lost: the tokens rebuild the original text.
  assertEquals(tokens.map((token) => token.text).join(""), "Aziz’s bus left at 7:30, didn't it? A well-known 'road'.");
  // Plain runs are merged, so "7:30, " is one piece of text.
  assert(tokens.some((token) => token.word === null && token.text === " 7:30, "));
});

Deno.test("words the server cannot look up are not tappable", () => {
  assertEquals(tapTokens("café").filter((token) => token.word), []);
  assertEquals(tapTokens("Привет").filter((token) => token.word), []);
  assertEquals(tapTokens("x".repeat(41)).filter((token) => token.word), []);
});

Deno.test("tapped words are normalised like on the server", () => {
  assertEquals(normaliseTappedWord("The"), "the");
  assertEquals(normaliseTappedWord("teachers'"), "teachers");
  assertEquals(normaliseTappedWord("It’s"), "it's");
  assertEquals(normaliseTappedWord("Mum's"), "mum");
  assertEquals(normaliseTappedWord("42"), null);
});

Deno.test("the sentence around a tapped word is sent as context", () => {
  const text = "The bus was late. Aziz waited for ten minutes!  Then he\nwalked.";
  assertEquals(sentenceAround(text, text.indexOf("waited")), "Aziz waited for ten minutes!");
  assertEquals(sentenceAround(text, text.indexOf("walked")), "Then he walked.");
  assertEquals(sentenceAround(text, 0), "The bus was late.");
  assertEquals(sentenceAround("No full stop here", 3), "No full stop here");
  const long = `${"word ".repeat(80)}target ${"word ".repeat(80)}.`;
  const around = sentenceAround(long, long.indexOf("target"));
  assert(around.length <= 240);
  assert(around.includes("target"));
});
