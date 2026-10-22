import { compareReviewMaterial } from "./item-diff.ts";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
const item = {
  schema_version: "assessment.item.v1",
  type: "single_choice",
  locale: "en",
  prompt: "2 + 2?",
  max_score: 1,
  tags: ["arithmetic"],
  options: [{ id: "a", text: "4" }, { id: "b", text: "5" }],
};
Deno.test("identical material has no changes", () => {
  equal(compareReviewMaterial({ item, key: { correct: "a" } }, { item, key: { correct: "a" } }), {
    changes: [],
    areas: [],
    truncated: false,
  });
});
Deno.test("each changed leaf is reported once in the area a reviewer checks", () => {
  const result = compareReviewMaterial(
    { item, key: { correct: "a" } },
    {
      item: {
        ...item,
        prompt: "Two plus two?",
        max_score: 2,
        tags: ["arithmetic", "warm-up"],
        options: [{ id: "a", text: "4" }, { id: "b", text: "Five" }, { id: "c", text: "22" }],
        media: [{ kind: "image", artifact_id: "x" }],
      },
      key: { correct: "b" },
      rubric: { id: "r", criteria: [] },
    },
  );
  equal(result.changes.map((row) => [row.area, row.path, row.kind]), [
    ["prompt", "item.prompt", "changed"],
    ["options", "item.options.1.text", "changed"],
    ["options", "item.options.2", "added"],
    ["key", "key.correct", "changed"],
    ["rubric", "rubric", "added"],
    ["media", "item.media", "added"],
    ["scoring", "item.max_score", "changed"],
    ["metadata", "item.tags.1", "added"],
  ]);
  equal(result.areas, ["prompt", "options", "key", "rubric", "media", "scoring", "metadata"]);
  equal(result.changes[3].before, "a");
  equal(result.changes[3].after, "b");
});
Deno.test("removed fields and rubric criteria are reported", () => {
  const result = compareReviewMaterial(
    { item: { ...item, media: [{ kind: "audio" }] }, key: {}, rubric: { criteria: [{ id: "c", max_score: 3 }] } },
    { item, key: {}, rubric: { criteria: [{ id: "c", max_score: 4 }] } },
  );
  equal(result.changes.map((row) => [row.area, row.path, row.kind]), [
    ["rubric", "rubric.criteria.0.max_score", "changed"],
    ["media", "item.media", "removed"],
  ]);
});
Deno.test("large comparisons are bounded and say so", () => {
  const many = (n: number) => Array.from({ length: 50 }, (_, i) => ({ id: String(i), text: `${i}-${n}` }));
  const result = compareReviewMaterial({ item: { ...item, options: many(1) }, key: {} }, { item: { ...item, options: many(2) }, key: {} }, 10);
  equal([result.changes.length, result.truncated], [10, true]);
});
