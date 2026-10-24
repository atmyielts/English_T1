import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  blankWord,
  checkTypedRecall,
  parseCollocations,
  parseContexts,
  parseWordFamily,
  withContext,
  wordExtras,
} from "./english-vocabulary.ts";

Deno.test("typed recall: exact, close and wrong answers map to grades", () => {
  assertEquals(checkTypedRecall("commute", "Commute"), { verdict: "exact", grade: 3, distance: 0 });
  assertEquals(checkTypedRecall("rush hour", "rush-hour"), { verdict: "exact", grade: 3, distance: 0 });
  assertEquals(checkTypedRecall("e-mail", "email").verdict, "exact");
  assertEquals(checkTypedRecall("café", "cafe").verdict, "exact");
  assertEquals(checkTypedRecall("commute", "comute"), { verdict: "close", grade: 2, distance: 1 });
  assertEquals(checkTypedRecall("receive", "recieve").verdict, "close", "a swapped pair is one slip");
  assertEquals(checkTypedRecall("accommodation", "acomodation").verdict, "close", "two slips in a long word");
  assertEquals(checkTypedRecall("from", "form").verdict, "close");
  assertEquals(checkTypedRecall("cat", "cut").verdict, "wrong", "short words must be exact");
  assertEquals(checkTypedRecall("commute", "travel").grade, 1);
  assertEquals(checkTypedRecall("commute", "   ").verdict, "wrong");
});

Deno.test("typed recall cue: the word and its forms are blanked", () => {
  assertEquals(blankWord("I commute to work by metro.", "commute"), "I _____ to work by metro.");
  assertEquals(blankWord("She commuted for years.", "commute"), "She _____ for years.");
  assertEquals(blankWord("He studies every night.", "study"), "He _____ every night.");
  assertEquals(blankWord("We were stuck in a traffic jam.", "traffic jam"), "We were stuck in a _____.");
  assertEquals(blankWord("Commuting is tiring.", "commute"), "_____ is tiring.");
  assertEquals(blankWord("A completely different sentence.", "commute"), null);
  assertEquals(blankWord("", "commute"), null);
});

Deno.test("collocations and word family are cleaned and capped", () => {
  assertEquals(parseCollocations([" make a decision ", "Make a decision", "", 4, "reach a decision"]), ["make a decision", "reach a decision"]);
  assertEquals(parseCollocations("nope"), []);
  assertEquals(parseCollocations(Array.from({ length: 12 }, (_, i) => `p${i}`)).length, 8);
  assertEquals(parseWordFamily([{ word: "decision", part_of_speech: "noun" }, "decisive", { word: "" }, { word: "Decision" }]), [
    { word: "decision", part_of_speech: "noun" },
    { word: "decisive", part_of_speech: null },
  ]);
});

Deno.test("new encounters are kept newest first, without repeats", () => {
  const at = "2026-10-24T10:00:00Z";
  const first = withContext({ definition: "x" }, { sentence: "I commute by metro every day.", source: "My week", at })!;
  assertEquals(first.definition, "x");
  assertEquals(parseContexts(first.contexts).length, 1);
  assertEquals(withContext(first, { sentence: "i commute by metro every day.", source: "Other", at }), null);
  assertEquals(withContext({}, { sentence: "Too short.", source: null, at }), null);
  assertEquals(withContext({}, { sentence: "Saved from this very sentence.", source: null, at, savedFrom: "Saved from this very sentence." }), null);
  let meta: Record<string, unknown> = first;
  for (let i = 0; i < 7; i += 1) meta = withContext(meta, { sentence: `Another sentence number ${i} here.`, source: null, at })!;
  const contexts = parseContexts(meta.contexts);
  assertEquals(contexts.length, 5);
  assertEquals(contexts[0]!.text, "Another sentence number 6 here.");
});

Deno.test("card extras read from metadata", () => {
  const extras = wordExtras({ collocations: ["daily commute"], translation_ru: "ездить", srs: { s: 3 }, contexts: [{ text: "A sentence with the word." }] });
  assertEquals(extras.collocations, ["daily commute"]);
  assertEquals(extras.translation_ru, "ездить");
  assertEquals(extras.translation_uz, null);
  assertEquals(extras.srs, { s: 3 });
  assertEquals(extras.contexts[0]?.text, "A sentence with the word.");
  assertEquals(wordExtras({}).word_family, []);
});
