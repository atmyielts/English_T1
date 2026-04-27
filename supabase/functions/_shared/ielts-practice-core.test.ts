import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dailyCountFromPracticeMinutes,
  deriveTargetDate,
  hasActiveProductEntitlement,
  hasActiveSponsoredProductAccess,
  isReplaceablePlanStatus,
  isWithinEntitlementWindow,
  normalizeDailyPracticeMinutes,
  normalizeProgramDurationDays,
  parsePlanDate,
  scoreObjectiveQuestion,
} from "./ielts-practice-core.ts";

Deno.test("goal duration helpers normalize and derive target date", () => {
  assertEquals(normalizeProgramDurationDays(45), 45);
  assertEquals(normalizeProgramDurationDays(999), 365);
  assertEquals(normalizeDailyPracticeMinutes(75), 75);
  assertEquals(normalizeDailyPracticeMinutes(3), 10);
  assertEquals(deriveTargetDate("2026-04-27", 30), "2026-05-26");
});

Deno.test("daily minutes controls generated practice size before legacy daily count", () => {
  assertEquals(dailyCountFromPracticeMinutes(60, 9, true), 3);
  assertEquals(dailyCountFromPracticeMinutes(90, 3, true), 5);
  assertEquals(dailyCountFromPracticeMinutes(undefined, 7, false), 7);
});

Deno.test("plan date falls back to learner timezone date", () => {
  const now = new Date("2026-04-27T22:30:00.000Z");
  assertEquals(parsePlanDate(undefined, "Asia/Tashkent", now), "2026-04-28");
  assertEquals(parsePlanDate("2026-05-01", "Asia/Tashkent", now), "2026-05-01");
});

Deno.test("entitlement windows reject future and expired grants", () => {
  const now = Date.parse("2026-04-27T10:00:00.000Z");
  assertEquals(isWithinEntitlementWindow(null, null, now), true);
  assertEquals(isWithinEntitlementWindow("2026-04-28T00:00:00.000Z", null, now), false);
  assertEquals(isWithinEntitlementWindow(null, "2026-04-26T00:00:00.000Z", now), false);
});

Deno.test("product access helpers distinguish missing, direct, and sponsored access", () => {
  const productId = "practice-product";
  const now = Date.parse("2026-04-27T10:00:00.000Z");
  assertEquals(hasActiveProductEntitlement([], productId, now), false);
  assertEquals(hasActiveSponsoredProductAccess([], productId, now), false);
  assertEquals(hasActiveProductEntitlement([
    { resource_type: "product", resource_id: productId, is_active: true, starts_at: null, ends_at: null },
  ], productId, now), true);
  assertEquals(hasActiveSponsoredProductAccess([
    {
      grant_type: "product_access",
      resource_type: "product",
      resource_id: productId,
      status: "active",
      starts_at: "2026-04-01T00:00:00.000Z",
      expires_at: "2026-05-01T00:00:00.000Z",
    },
  ], productId, now), true);
});

Deno.test("plan regeneration preserves active and completed work", () => {
  assertEquals(isReplaceablePlanStatus("planned"), true);
  assertEquals(isReplaceablePlanStatus("expired"), true);
  assertEquals(isReplaceablePlanStatus("in_progress"), false);
  assertEquals(isReplaceablePlanStatus("completed"), false);
});

Deno.test("TFNG scoring accepts short and long answer variants", () => {
  const answerKey = { matches: { q1: "TRUE", q2: "FALSE", q3: "NOT GIVEN" } };
  assertEquals(
    scoreObjectiveQuestion("question_true_false_not_given", answerKey, { matches: { q1: "T", q2: "false", q3: "NG" } }),
    { score: 3, max: 3 },
  );
});

Deno.test("YNNG scoring accepts short and long answer variants", () => {
  const answerKey = { matches: { q1: "YES", q2: "NO", q3: "NOT GIVEN" } };
  assertEquals(
    scoreObjectiveQuestion("question_yes_no_not_given", answerKey, { matches: { q1: "Y", q2: "no", q3: "not given" } }),
    { score: 3, max: 3 },
  );
});
