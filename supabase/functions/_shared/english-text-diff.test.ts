import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { changedPhrase, diffStats, diffTokens, diffWords, MAX_DIFF_TOKENS, sideOps } from "./english-text-diff.ts";

const join = (ops: Array<{ text: string }>) => ops.map((op) => op.text).join("");

Deno.test("tokens keep the text: joining them gives it back", () => {
  const text = "Dear Sir,\n\nI am writing  to ask about the room.";
  assertEquals(diffTokens(text).join(""), text);
});

Deno.test("identical drafts are one 'same' run", () => {
  const ops = diffWords("I like tea.", "I like tea.");
  assertEquals(ops, [{ type: "same", text: "I like tea." }]);
  assertEquals(diffStats(ops), { removed: 0, added: 0, changedRatio: 0 });
});

Deno.test("a fixed word shows as one deletion and one addition, the rest stays the same", () => {
  const ops = diffWords("I am agree with you.", "I agree with you.");
  assertEquals(ops, [
    { type: "same", text: "I " },
    { type: "del", text: "am " },
    { type: "same", text: "agree with you." },
  ]);
  assertEquals(join(sideOps(ops, "after")), "I agree with you.");
  assertEquals(join(sideOps(ops, "before")), "I am agree with you.");
});

Deno.test("added sentence and changed capital letter are both visible", () => {
  const before = "dear sir, i want a room.";
  const after = "Dear Sir, I would like a room. Is breakfast included?";
  const ops = diffWords(before, after);
  assertEquals(join(sideOps(ops, "after")), after);
  assertEquals(join(sideOps(ops, "before")).replace(/\s+/g, " ").trim(), before);
  const stats = diffStats(ops);
  assert(stats.added >= 6, `added ${stats.added}`);
  assert(stats.removed >= 4, `removed ${stats.removed}`);
  assert(stats.changedRatio > 0.5 && stats.changedRatio <= 1);
});

Deno.test("empty sides: everything added or everything removed", () => {
  assertEquals(diffWords("", "New text here"), [{ type: "add", text: "New text here" }]);
  assertEquals(diffWords("Old text", ""), [{ type: "del", text: "Old text" }]);
  assertEquals(diffWords("", ""), []);
});

Deno.test("very long texts fall back to a whole-text replace instead of a slow diff", () => {
  const long = Array.from({ length: MAX_DIFF_TOKENS + 5 }, (_, index) => `w${index}`).join(" ");
  const ops = diffWords(long, `${long} more`);
  assertEquals(ops.map((op) => op.type), ["del", "add"]);
});

Deno.test("changedPhrase: short corrections are kept whole, long ones are cut around the change", () => {
  assertEquals(changedPhrase("I am agree", "I agree."), "I agree");
  const phrase = changedPhrase(
    "Yesterday I go to the market with my sister and we buy many fruits",
    "Yesterday I went to the market with my sister and we bought a lot of fruit",
  );
  assert(phrase.split(" ").length <= 6, phrase);
  assert(phrase.includes("went") || phrase.includes("bought"), phrase);
});
