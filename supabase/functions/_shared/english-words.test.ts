import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { choosePracticeWords, type NotebookWord, usedWordIds, usesWord } from "./english-words.ts";

const word = (id: string, text: string, box: number, due: string, correct = 0): NotebookWord => ({
  id,
  word: text,
  definition: null,
  leitner_box: box,
  next_review_at: due,
  correct_count: correct,
});

Deno.test("due and least secure words are suggested first; long phrases are skipped", () => {
  const now = "2026-10-22T12:00:00.000Z";
  const picked = choosePracticeWords([
    word("a", "refund", 3, "2026-10-25T00:00:00.000Z"),
    word("b", "delivery", 1, "2026-10-21T00:00:00.000Z"),
    word("c", "disappointed", 2, "2026-10-20T00:00:00.000Z"),
    word("d", "it turned out that in the end", 1, "2026-10-20T00:00:00.000Z"),
    word("e", "faulty", 4, "2026-10-28T00:00:00.000Z"),
  ], now, 3);
  assertEquals(picked.map((entry) => entry.id), ["b", "c", "a"]);
});

Deno.test("common word forms count as using the word", () => {
  assert(usesWord("I decided to stay at home.", "decide"));
  assert(usesWord("She is studying medicine.", "study"));
  assert(usesWord("She studies medicine and studied law.", "study"));
  assert(usesWord("We stopped at the station.", "stop"));
  assert(usesWord("Prices are rising.", "rise"));
  assert(usesWord("I'd like a REFUND, please.", "refund"));
  assert(usesWord("The delivery was late.", "delivery"));
  assert(usesWord("Unfortunately, it turned out badly.", "turn out"));
  assert(usesWord("It turned out well.", "it turned out"));
});

Deno.test("parts of other words do not count", () => {
  assert(!usesWord("The car was carefully parked.", "care"));
  assert(!usesWord("A refundable ticket.", "refund"));
  assert(!usesWord("Nothing here.", "refund"));
});

Deno.test("only suggested words that appear are reported", () => {
  const ids = usedWordIds("My order was faulty, so I asked for a refund.", [
    { id: "1", word: "refund" },
    { id: "2", word: "faulty" },
    { id: "3", word: "replacement" },
  ]);
  assertEquals(ids, ["1", "2"]);
});
