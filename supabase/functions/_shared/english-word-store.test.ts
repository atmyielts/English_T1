import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseSrsState } from "./english-srs.ts";
import {
  type DrillCardRow,
  drillCardsToImport,
  drillCardToNotebookRow,
  normalizeWord,
  notebookToDrillCard,
  starterRows,
} from "./english-word-store.ts";

const NOW = new Date("2026-10-24T10:00:00Z");
const DECK = "2026-09-01T08:00:00Z";
const card = (overrides: Partial<DrillCardRow>): DrillCardRow => ({
  id: "c1",
  word: "Abandon",
  definition: "to leave behind",
  example: "They abandon the plan.",
  interval: 1,
  ease_factor: 2.5,
  repetitions: 0,
  next_review: "2026-09-01",
  last_review: null,
  created_at: "2026-09-01T08:00:01Z",
  ...overrides,
});

Deno.test("word store: words are normalised like the notebook", () => {
  assertEquals(normalizeWord("  Rush   Hour! "), "rush hour");
  assertEquals(normalizeWord("'cause"), "cause");
  assertEquals(normalizeWord("..."), "");
});

Deno.test("word store: only learners who used the drill get their old cards", () => {
  const seededOnly = [card({ id: "a" }), card({ id: "b", word: "access" })];
  assertEquals(drillCardsToImport(seededOnly, DECK), []);
  const reviewed = [card({ id: "a", last_review: "2026-09-02", repetitions: 1, interval: 1 }), card({ id: "b", word: "access" })];
  assertEquals(drillCardsToImport(reviewed, DECK).map((entry) => entry.id), ["a", "b"]);
  const ownWord = [card({ id: "a" }), card({ id: "z", word: "serendipity", created_at: "2026-09-05T10:00:00Z" })];
  assertEquals(drillCardsToImport(ownWord, DECK).length, 2);
  assertEquals(drillCardsToImport(ownWord, null), [], "without the deck date an unreviewed card is not proof of use");
});

Deno.test("word store: a reviewed drill card keeps its schedule and gets an FSRS state", () => {
  const row = drillCardToNotebookRow(
    card({ repetitions: 3, interval: 15, ease_factor: 2.3, last_review: "2026-10-10", next_review: "2026-10-25" }),
    { userId: "u", languageId: "en", now: NOW, newIndex: 0 },
  )!;
  assertEquals(row.normalized_word, "abandon");
  assertEquals(row.next_review_at, "2026-10-25T00:00:00.000Z");
  assertEquals([row.review_count, row.correct_count, row.incorrect_count], [3, 3, 0]);
  assertEquals(row.leitner_box, 4);
  const meta = row.metadata as Record<string, unknown>;
  assertEquals(meta.definition, "to leave behind");
  assertEquals(meta.imported_from, "vocab_drill");
  const state = parseSrsState(meta.srs)!;
  assertEquals(state.s, 15);
  assertEquals(state.reps, 3);
});

Deno.test("word store: unreviewed imported cards are introduced twenty a day", () => {
  const first = drillCardToNotebookRow(card({}), { userId: "u", languageId: "en", now: NOW, newIndex: 0 })!;
  const later = drillCardToNotebookRow(card({}), { userId: "u", languageId: "en", now: NOW, newIndex: 45 })!;
  assertEquals(first.next_review_at, NOW.toISOString());
  assertEquals(later.next_review_at, new Date(NOW.getTime() + 2 * 86_400_000).toISOString());
  assertEquals(first.review_count, 0);
  assertEquals((first.metadata as Record<string, unknown>).srs, undefined);
  assertEquals(drillCardToNotebookRow(card({ word: "  !!" }), { userId: "u", languageId: "en", now: NOW, newIndex: 0 }), null);
});

Deno.test("word store: starter rows are staggered and labelled", () => {
  const seed = Array.from({ length: 25 }, (_, index) => [`word${index}`, `meaning ${index}`, `example ${index}`] as const);
  const rows = starterRows(seed, { userId: "u", languageId: "en", now: NOW });
  assertEquals(rows.length, 25);
  assertEquals(rows[0]!.next_review_at, NOW.toISOString());
  assertEquals(rows[24]!.next_review_at, new Date(NOW.getTime() + 86_400_000).toISOString());
  assertEquals(rows[0]!.source_type, "ielts-awl");
});

Deno.test("word store: notebook entries look like drill cards to old clients", () => {
  const drill = notebookToDrillCard({
    id: "n1",
    word: "commute",
    context_text: "I commute by metro.",
    last_reviewed_at: "2026-10-20T10:00:00.000Z",
    next_review_at: "2026-10-30T10:00:00.000Z",
    correct_count: 2,
    metadata: { definition: "travel to work", srs: { s: 9, d: 4, reps: 2, lapses: 0, last: "2026-10-20T10:00:00.000Z" } },
  });
  assertEquals(drill, {
    id: "n1",
    word: "commute",
    definition: "travel to work",
    example: "I commute by metro.",
    interval: 10,
    repetitions: 2,
    last_review: "2026-10-20",
  });
  const bare = notebookToDrillCard({ id: "n2", word: "x", metadata: {} }, "from the lexicon");
  assertEquals(bare.definition, "from the lexicon");
  assertEquals(bare.interval, 1);
  assert(bare.last_review === null);
});
