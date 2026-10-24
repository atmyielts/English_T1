import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  explanationFor,
  handbookTopicHref,
  normalizeForSearch,
  ruleSlugForTopic,
  searchHandbook,
  type HandbookEntry,
} from "../src/lib/handbookSearch.ts";

const entry = (slug: string, level: HandbookEntry["level"], focus: string, overrides: Partial<HandbookEntry> = {}): HandbookEntry => ({
  slug,
  title: slug.replace(/-/g, " "),
  level,
  focus_area: focus,
  explanation: { en: `About ${focus}.`, ru: null, uz: null },
  contrast_text: null,
  common_error_pattern: null,
  examples: [],
  ...overrides,
});

const entries: HandbookEntry[] = [
  entry("articles-basic-control", "A2", "articles", {
    title: "Articles: a, an, the",
    explanation: { en: "Use a or an with one thing.", ru: "В русском языке артиклей нет, а в английском они нужны.", uz: "Oʻzbek tilida artikl yoʻq." },
  }),
  entry("a1-prepositions-of-place", "A1", "prepositions", { title: "In, on, under, next to: where things are" }),
  entry("a2-prepositions-of-time", "A2", "prepositions", { title: "In, on, at for time" }),
  entry("prepositions-common-use", "B1", "prepositions", { title: "Common prepositions in context" }),
  entry("cafe-rule", "B2", "linkers", { title: "Café talk", explanation: { en: "Résumé and naïve words.", ru: "Ещё ёлка", uz: null } }),
];

Deno.test("normalisation ignores case, accents, apostrophes and punctuation", () => {
  assertEquals(normalizeForSearch("  Café — RÉSUMÉ!  "), "cafe resume");
  assertEquals(normalizeForSearch("Ёлка, ещё"), "елка еще");
  assertEquals(normalizeForSearch("Toʻgʻri"), normalizeForSearch("To'g'ri"));
  assertEquals(normalizeForSearch("To‘g’ri"), "togri");
  assertEquals(normalizeForSearch("can't"), "cant");
  assertEquals(normalizeForSearch("present-simple"), "present simple");
});

Deno.test("search matches titles, topics and explanations in any language", () => {
  const slugs = (query: string, level?: "all" | "A2") => searchHandbook(entries, query, { level }).map((item) => item.slug);
  assertEquals(slugs("ARTICLES"), ["articles-basic-control"]);
  assertEquals(slugs("артиклей"), ["articles-basic-control"]);
  assertEquals(slugs("ozbek tilida"), ["articles-basic-control"]);
  assertEquals(slugs("cafe"), ["cafe-rule"]);
  assertEquals(slugs("елка"), ["cafe-rule"]);
  assertEquals(slugs("resume naive"), ["cafe-rule"]);
  assertEquals(slugs("nothing like this"), []);
  assertEquals(slugs("", "A2"), ["articles-basic-control", "a2-prepositions-of-time"]);
  assertEquals(slugs("prepositions", "A2"), ["a2-prepositions-of-time"]);
});

Deno.test("title matches rank above body matches, otherwise the order is kept", () => {
  const list = [
    entry("body-only", "A1", "x", { title: "Something", explanation: { en: "time words", ru: null, uz: null } }),
    entry("title-hit", "A1", "y", { title: "Time words" }),
  ];
  assertEquals(searchHandbook(list, "time").map((item) => item.slug), ["title-hit", "body-only"]);
});

Deno.test("topic labels from the app make translated topic names searchable", () => {
  const labels = (focus: string) => (focus === "prepositions" ? ["Предлоги", "Predloglar"] : []);
  assertEquals(searchHandbook(entries, "предлоги", { topicLabels: labels }).length, 3);
});

Deno.test("the rule for a mistake is the hardest unit at or below the learner's level", () => {
  assertEquals(ruleSlugForTopic(entries, "prepositions", "B2"), "prepositions-common-use");
  assertEquals(ruleSlugForTopic(entries, "prepositions", "A2"), "a2-prepositions-of-time");
  assertEquals(ruleSlugForTopic(entries, "prepositions", "a1"), "a1-prepositions-of-place");
  // Below every unit, or no level known: the easiest unit.
  assertEquals(ruleSlugForTopic(entries, "linkers", "A1"), "cafe-rule");
  assertEquals(ruleSlugForTopic(entries, "prepositions", null), "a1-prepositions-of-place");
  assertEquals(ruleSlugForTopic(entries, "wish", "C2"), null);
});

Deno.test("explanations fall back to English when a translation is missing", () => {
  const [articles, place] = entries;
  assertEquals(explanationFor(articles!, "ru"), { text: "В русском языке артиклей нет, а в английском они нужны.", fallback: false });
  assertEquals(explanationFor(place!, "uz"), { text: "About prepositions.", fallback: true });
  assertEquals(explanationFor(place!, "en").fallback, false);
  assertEquals(handbookTopicHref("modals-past"), "/grammar/handbook?topic=modals-past");
});
