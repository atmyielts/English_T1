import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blankFills, checkGrammarAnswer } from "./english-grammar.ts";

Deno.test("the missing word alone is accepted for a phrase-authored blank", () => {
  const prompt = "We will meet ___ Monday morning.";
  assertEquals(blankFills(prompt, ["on Monday morning"]), ["on"]);
  assertEquals(checkGrammarAnswer({ prompt, accepted: ["on Monday morning"], response: "on" }).correct, true);
  assertEquals(checkGrammarAnswer({ prompt, accepted: ["on Monday morning"], response: "on Monday morning" }).correct, true);
  assertEquals(checkGrammarAnswer({ prompt, accepted: ["on Monday morning"], response: "at" }).correct, false);
});

Deno.test("partial answers get no credit", () => {
  const prompt = "I bought ___ umbrella before the storm.";
  const result = checkGrammarAnswer({ prompt, accepted: ["an umbrella"], response: "a" });
  assertEquals(result.correct, false);
  assertEquals(result.expected, "an");
});

Deno.test("hints in brackets after the blank are ignored", () => {
  const prompt = "My brother ___ online every evening. (study)";
  assertEquals(checkGrammarAnswer({ prompt, accepted: ["studies"], response: "Studies" }).correct, true);
  assertEquals(checkGrammarAnswer({ prompt, accepted: ["studies"], response: "study" }).correct, false);
});

Deno.test("full-sentence corrections ignore case and punctuation, allow one-letter typos", () => {
  const accepted = ["She opened the door and the cat ran outside.", "She opened the door, and the cat ran outside."];
  const prompt = "She opened door and the cat ran outside.";
  assertEquals(checkGrammarAnswer({ prompt, accepted, response: "she opened the door and the cat ran outside" }).correct, true);
  const typo = checkGrammarAnswer({ prompt, accepted, response: "She opened the door and the cat ran outsde." });
  assertEquals(typo, { correct: true, typo: true, expected: accepted[0] });
  assertEquals(checkGrammarAnswer({ prompt, accepted, response: "She opened door and the cat ran outside." }).correct, false);
});

Deno.test("an empty answer is wrong", () => {
  assertEquals(checkGrammarAnswer({ prompt: "x ___", accepted: ["went"], response: "  " }).correct, false);
});
