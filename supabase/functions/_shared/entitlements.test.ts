import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildEntitlementValue,
  computeEntitlementEndsAt,
  getEntitlementTargets,
} from "./entitlements.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-08T00:00:00.000Z");

Deno.test("buildEntitlementValue includes plan_id and limits only when present", () => {
  assertEquals(buildEntitlementValue("plan-1", { writing: 5 }), { plan_id: "plan-1", limits: { writing: 5 } });
  assertEquals(buildEntitlementValue("plan-1", {}), { plan_id: "plan-1" });
  assertEquals(buildEntitlementValue(null, { writing: 5 }), { limits: { writing: 5 } });
  assertEquals(buildEntitlementValue(undefined, {}), {});
});

Deno.test("getEntitlementTargets dedupes product + bundle", () => {
  assertEquals(getEntitlementTargets("p1", ["p2", "p3"]), ["p1", "p2", "p3"]);
  assertEquals(getEntitlementTargets("p1", ["p1", "p2"]), ["p1", "p2"]); // product already in bundle
  assertEquals(getEntitlementTargets("p1", []), ["p1"]);
});

Deno.test("computeEntitlementEndsAt returns null for lifetime (no/zero duration)", () => {
  assertEquals(computeEntitlementEndsAt(null, null, NOW), null);
  assertEquals(computeEntitlementEndsAt(0, null, NOW), null);
  assertEquals(computeEntitlementEndsAt(undefined, "2027-01-01T00:00:00.000Z", NOW), null);
});

Deno.test("computeEntitlementEndsAt: fresh purchase counts from now", () => {
  assertEquals(computeEntitlementEndsAt(30, null, NOW), new Date(NOW + 30 * DAY).toISOString());
});

Deno.test("computeEntitlementEndsAt: early renewal extends from current expiry (stacking)", () => {
  const existing = new Date(NOW + 10 * DAY).toISOString(); // still 10 days left
  // Should add 30 days on top of the remaining 10, not from now.
  assertEquals(computeEntitlementEndsAt(30, existing, NOW), new Date(NOW + 40 * DAY).toISOString());
});

Deno.test("computeEntitlementEndsAt: expired entitlement restarts from now", () => {
  const expired = new Date(NOW - 5 * DAY).toISOString();
  assertEquals(computeEntitlementEndsAt(30, expired, NOW), new Date(NOW + 30 * DAY).toISOString());
});

Deno.test("computeEntitlementEndsAt: unparseable existing date falls back to now (no Invalid Date)", () => {
  assertEquals(computeEntitlementEndsAt(30, "not-a-date", NOW), new Date(NOW + 30 * DAY).toISOString());
});
