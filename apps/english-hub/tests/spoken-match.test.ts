import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchSpoken } from "../src/lib/spokenMatch.ts";

const heard = (target: string, said: string) =>
  matchSpoken(target, said).map((entry) => (entry.heard ? entry.word : `-${entry.word}`)).join(" ");

Deno.test("every word heard in order is marked heard", () => {
  assertEquals(heard("The next train leaves at seven.", "the next train leaves at seven"), "The next train leaves at seven.");
});

Deno.test("a missed word does not mark the rest of the sentence wrong", () => {
  assertEquals(heard("The next train leaves at seven.", "the train leaves at seven"), "The -next train leaves at seven.");
});

Deno.test("extra words and punctuation are ignored", () => {
  assertEquals(heard("I'd like a refund, please.", "um I'd like a refund please"), "I'd like a refund, please.");
  assertEquals(heard("Hello there", ""), "-Hello -there");
});
