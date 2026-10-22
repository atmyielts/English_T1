import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  findSentenceWithWord,
  parseInline,
  parsePassage,
  savedForm,
  sentenceAt,
  sentenceRanges,
} from "../src/skills/reading/markdown.ts";

Deno.test("passage blocks: headings, wrapped paragraphs, quotes and lists", () => {
  const blocks = parsePassage(
    "# A day in Tashkent\nThe bus is **late** again.\nAziz waits.\n\n> Plan *ahead*.\n\n- buy bread\n- call Mum\n\n1. first\n2. second",
  );
  assertEquals(blocks, [
    { type: "heading", level: 2, runs: [{ text: "A day in Tashkent" }] },
    { type: "paragraph", runs: [{ text: "The bus is " }, { text: "late", strong: true }, { text: " again. Aziz waits." }] },
    { type: "quote", runs: [{ text: "Plan " }, { text: "ahead", em: true }, { text: "." }] },
    { type: "list", ordered: false, items: [[{ text: "buy bread" }], [{ text: "call Mum" }]] },
    { type: "list", ordered: true, items: [[{ text: "first" }], [{ text: "second" }]] },
  ]);
});

Deno.test("inline markup never becomes HTML; links keep only their text", () => {
  assertEquals(parseInline("<b>hi</b> [site](https://x.test)"), [{ text: "<b>hi</b> site" }]);
  assertEquals(parseInline("snake_case_word and 2 * 3 * 4"), [{ text: "snake_case_word and 2 * 3 * 4" }]);
  assertEquals(parseInline("***both***"), [{ text: "both", strong: true, em: true }]);
});

Deno.test("sentences are found around a word", () => {
  const text = "The bus was late. Aziz waited for ten minutes! Then he walked.";
  assertEquals(sentenceRanges(text).length, 3);
  assertEquals(sentenceAt(text, text.indexOf("waited")), "Aziz waited for ten minutes!");
  const found = findSentenceWithWord(parsePassage(text), "WALKED");
  assertEquals(found, { word: "walked", sentence: "Then he walked." });
  assertEquals(findSentenceWithWord(parsePassage(text), "walk"), null);
});

Deno.test("saved form lowercases sentence-initial words and keeps names", () => {
  assertEquals(savedForm("Then", "Then he walked."), "then");
  assertEquals(savedForm("Aziz's", "Yesterday Aziz's bus was late."), "Aziz");
  assertEquals(savedForm("Commute", "My Commute is long."), "Commute");
  assertEquals(savedForm("UN", "The UN met."), "UN");
  assertEquals(savedForm("bus", "The bus was late."), "bus");
});

Deno.test("hard line breaks (two trailing spaces) start a new line", () => {
  const blocks = parsePassage("First, stop.  \r\nSecond, look.\r\nStill second.");
  assertEquals(blocks, [
    { type: "paragraph", runs: [{ text: "First, stop." }] },
    { type: "paragraph", runs: [{ text: "Second, look. Still second." }] },
  ]);
});
