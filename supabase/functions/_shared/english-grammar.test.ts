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
  const typo = checkGrammarAnswer({ prompt, accepted, response: "She opened the door and the cat ran otside." });
  assertEquals(typo, { correct: true, typo: true, expected: accepted[0] });
  assertEquals(checkGrammarAnswer({ prompt, accepted, response: "She opened door and the cat ran outside." }).correct, false);
});

Deno.test("an empty answer is wrong", () => {
  assertEquals(checkGrammarAnswer({ prompt: "x ___", accepted: ["went"], response: "  " }).correct, false);
});

Deno.test("one-letter grammar errors are never forgiven as spelling", () => {
  const cases: Array<{ prompt: string; accepted: string[]; response: string }> = [
    { prompt: "He work in a hospital.", accepted: ["He works in a hospital."], response: "He work in a hospital." },
    { prompt: "These plans needs more detail before Friday.", accepted: ["These plans need more detail before Friday."], response: "These plans needs more detail before Friday." },
    { prompt: "She didn't used to get up early.", accepted: ["She didn't use to get up early."], response: "She didn't used to get up early." },
    { prompt: "By the time we arrived, the train ___ already left.", accepted: ["had"], response: "has" },
    { prompt: "The bridge was ___ in 1990. (build)", accepted: ["built"], response: "build" },
  ];
  for (const entry of cases) {
    assertEquals(checkGrammarAnswer(entry).correct, false, entry.response);
  }
});
