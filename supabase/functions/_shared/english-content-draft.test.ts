import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanDraft, draftExample, draftUserPayload, repairUserPayload } from "./english-content-draft.ts";
import { normalizeStudioItem } from "./english-content-studio.ts";

const request = { serviceKey: "grammar" as const, topic: "much and many", level: "A2", notes: "" };

Deno.test("the example drops ids, metadata and display settings but keeps the shape", () => {
  const example = draftExample({
    item: { slug: "x", title: "X", level: "A2", status: "published", sort_order: 3, metadata: { a: 1 }, presentation_meta: { b: 2 }, explanation_text: "Rule" },
    children: [{ id: "d1", drill_type: "fill", prompt_text: "A ___ B", accepted_answers: ["c"], metadata: {} }],
  });
  assertEquals(example.item, { slug: "x", title: "X", level: "A2", explanation_text: "Rule" });
  assertEquals(example.children, [{ drill_type: "fill", prompt_text: "A ___ B", accepted_answers: ["c"] }]);
  assert(draftUserPayload(request, example).includes("much and many"));
  assert(repairUserPayload(request, example, [{ field: "slug", message: "bad" }]).includes("\"errors\""));
});

Deno.test("a model reply becomes a safe new draft that the validator can check", () => {
  const draft = cleanDraft({
    item: {
      id: "should-go",
      title: "Much and many",
      slug: "Much & Many!",
      level: "C2",
      status: "published",
      focus_area: "quantifiers",
      explanation_text: "Use many with plural nouns and much with uncountable nouns.",
      contrast_text: "How many apples? How much water?",
      common_error_pattern: "much apples",
      tags: [],
      examples: [{ bad: "How much apples?", good: "How many apples?" }],
    },
    children: [
      { id: "x", drill_type: "fill", title: "", instructions: "", prompt_text: "How ___ apples do you want?", accepted_answers: ["many"] },
      { drill_type: "error_correction", title: "", instructions: "", prompt_text: "There is not much apples.", accepted_answers: ["There are not many apples."] },
    ],
  }, request)!;
  assertEquals(draft.item.level, "A2");
  assertEquals(draft.item.status, "draft");
  assertEquals(draft.item.slug, "much-many");
  assertEquals("id" in draft.item, false);
  assertEquals("id" in draft.children[0]!, false);
  const check = normalizeStudioItem("grammar", draft.item, draft.children);
  assert(check.ok, JSON.stringify(!check.ok && check.errors));
  assertEquals(cleanDraft("not json", request), null);
  assertEquals(cleanDraft({ draft: { item: { title: "Wrapped" }, children: [] } }, request)?.item.slug, "wrapped");
});
