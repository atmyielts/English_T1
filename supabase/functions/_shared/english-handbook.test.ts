import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildHandbook, handbookEntry } from "./english-handbook.ts";

const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  slug: "articles-basic-control",
  title: "Articles: a, an, the",
  level: "A2",
  focus_area: "articles",
  explanation_text: "Use a or an with one thing.",
  contrast_text: null,
  common_error_pattern: "Leaving out a, an or the.",
  examples_json: [{ bad: "I saw cat.", good: "I saw a cat." }, { good: "The cat was black." }, { bad: "only bad" }],
  sort_order: 210,
  metadata: { explanation_ru: "Артикль a или an…", explanation_uz: "  ", seeded_by: "x" },
  ...overrides,
});

Deno.test("an entry carries every language and falls back to null for a missing translation", () => {
  const entry = handbookEntry(row());
  assertEquals(entry?.explanation, { en: "Use a or an with one thing.", ru: "Артикль a или an…", uz: null });
  assertEquals(entry?.examples, [{ bad: "I saw cat.", good: "I saw a cat." }, { bad: null, good: "The cat was black." }]);
  assertEquals(entry?.level, "A2");
});

Deno.test("rows without a slug, title, explanation or valid level are left out", () => {
  assertEquals(handbookEntry(row({ slug: "" })), null);
  assertEquals(handbookEntry(row({ explanation_text: null })), null);
  assertEquals(handbookEntry(row({ level: "D1" })), null);
  assertEquals(handbookEntry(row({ level: "b1" }))?.level, "B1");
  assertEquals(handbookEntry(row({ metadata: null }))?.explanation.ru, null);
});

Deno.test("the handbook is ordered by level then library order, one entry per slug", () => {
  const list = buildHandbook([
    row({ slug: "c", level: "B1", sort_order: 1 }),
    row({ slug: "b", level: "A1", sort_order: 20 }),
    row({ slug: "a", level: "A1", sort_order: 10 }),
    row({ slug: "a", level: "A1", sort_order: 30 }),
    row({ slug: "bad", level: null }),
  ]);
  assertEquals(list.map((entry) => entry.slug), ["a", "b", "c"]);
});
