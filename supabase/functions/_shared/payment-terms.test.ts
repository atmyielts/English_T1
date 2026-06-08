import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildEntitlementTerms,
  buildPlanSnapshot,
  extractIncludedProductIds,
  extractPlanLimits,
  parseEntitlementTerms,
} from "./payment-terms.ts";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

Deno.test("extractIncludedProductIds keeps only valid UUIDs", () => {
  assertEquals(
    extractIncludedProductIds({ included_product_ids: [UUID_A, "not-a-uuid", "", UUID_B] }),
    [UUID_A, UUID_B],
  );
  assertEquals(extractIncludedProductIds(null), []);
  assertEquals(extractIncludedProductIds({ included_product_ids: "nope" }), []);
});

Deno.test("extractPlanLimits keeps only positive integers", () => {
  assertEquals(
    extractPlanLimits({ limits: { writing: 5, speaking: 0, listening: -2, reading: 3.9 } }),
    { writing: 5, reading: 3 },
  );
  assertEquals(extractPlanLimits(null), {});
  assertEquals(extractPlanLimits({ limits: "x" }), {});
});

Deno.test("buildEntitlementTerms captures plan duration, included products, limits", () => {
  const terms = buildEntitlementTerms({
    id: "plan-1",
    product_id: "prod-1",
    duration_days: 30,
    metadata: { included_product_ids: [UUID_A], limits: { writing: 4 } },
  });
  assertEquals(terms.source_plan_id, "plan-1");
  assertEquals(terms.duration_days, 30);
  assertEquals(terms.included_product_ids, [UUID_A]);
  assertEquals(terms.limits, { writing: 4 });
  assert(typeof terms.captured_at === "string" && terms.captured_at.length > 0);
});

Deno.test("buildEntitlementTerms normalizes invalid duration to null", () => {
  assertEquals(buildEntitlementTerms({ id: "p", product_id: "x", duration_days: 0 }).duration_days, null);
  assertEquals(buildEntitlementTerms({ id: "p", product_id: "x", duration_days: -5 }).duration_days, null);
  assertEquals(buildEntitlementTerms({ id: "p", product_id: "x" }).duration_days, null);
});

Deno.test("buildPlanSnapshot preserves core fields and object metadata", () => {
  const snap = buildPlanSnapshot({
    id: "plan-9", product_id: "prod-9", name: "Pro", amount: 1000, currency: "UZS",
    duration_days: 90, metadata: { included_product_ids: [UUID_A] },
  });
  assertEquals(snap.id, "plan-9");
  assertEquals(snap.amount, 1000);
  assertEquals(snap.duration_days, 90);
  assertEquals((snap.metadata as Record<string, unknown>).included_product_ids, [UUID_A]);
});

Deno.test("buildPlanSnapshot coerces non-object metadata to {}", () => {
  const snap = buildPlanSnapshot({ id: "p", product_id: "x", metadata: null });
  assertEquals(snap.metadata, {});
});

Deno.test("parseEntitlementTerms round-trips a built terms object", () => {
  const built = buildEntitlementTerms({
    id: "plan-1", product_id: "prod-1", duration_days: 30,
    metadata: { included_product_ids: [UUID_A], limits: { writing: 4 } },
  });
  const parsed = parseEntitlementTerms(built);
  assert(parsed !== null);
  assertEquals(parsed!.source_plan_id, "plan-1");
  assertEquals(parsed!.duration_days, 30);
  assertEquals(parsed!.included_product_ids, [UUID_A]);
  assertEquals(parsed!.limits, { writing: 4 });
});

Deno.test("parseEntitlementTerms returns null for empty/irrelevant payloads", () => {
  assertEquals(parseEntitlementTerms(null), null);
  assertEquals(parseEntitlementTerms({}), null);
  assertEquals(parseEntitlementTerms({ unrelated: true }), null);
});
