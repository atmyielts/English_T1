import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeEffectiveAccess } from "./logic.ts";
import {
  SAT_COMPLETE_PRODUCT_ID,
  SAT_PLAYBOOK_PRODUCT_ID,
  SAT_PRACTICE_PRODUCT_ID,
  SAT_SIMULATOR_PRODUCT_ID,
  IELTS_COMPLETE_PRODUCT_ID,
  IELTS_PLAYBOOK_PRODUCT_ID,
  IELTS_PRACTICE_PRODUCT_ID,
  IELTS_SIMULATOR_PRODUCT_ID,
  TOEFL_COMPLETE_PRODUCT_ID,
  TOEFL_PLAYBOOK_PRODUCT_ID,
  TOEFL_SIMULATOR_PRODUCT_ID,
} from "../_shared/product-bundles.ts";

const now = Date.parse("2026-10-26T12:00:00Z");
const personal = (resource_id: string, ends_at: string | null = null, starts_at: string | null = null) => ({
  resource_type: "product", resource_id, starts_at, ends_at,
});

Deno.test("a personal Complete bundle unlocks every member product", () => {
  const access = computeEffectiveAccess([personal(SAT_COMPLETE_PRODUCT_ID, "2026-11-20T00:00:00Z")], [], SAT_PLAYBOOK_PRODUCT_ID, now);
  assertEquals(access.personal_product_ids, [SAT_COMPLETE_PRODUCT_ID]);
  assertEquals(access.effective_product_ids, [SAT_COMPLETE_PRODUCT_ID, SAT_SIMULATOR_PRODUCT_ID, SAT_PRACTICE_PRODUCT_ID, SAT_PLAYBOOK_PRODUCT_ID]);
  assertEquals(access.bundle_product_ids, [SAT_COMPLETE_PRODUCT_ID]);
  assertEquals(access.has_access, true);
});

Deno.test("an expired or future bundle unlocks nothing", () => {
  const expired = computeEffectiveAccess([personal(SAT_COMPLETE_PRODUCT_ID, "2026-10-01T00:00:00Z")], [], SAT_PRACTICE_PRODUCT_ID, now);
  assertEquals(expired.effective_product_ids, []);
  assertEquals(expired.has_access, false);
  const future = computeEffectiveAccess([personal(SAT_COMPLETE_PRODUCT_ID, null, "2026-12-01T00:00:00Z")], [], null, now);
  assertEquals(future.effective_product_ids, []);
  assertEquals(future.has_access, null);
});

Deno.test("a sponsored academy grant of a bundle is expanded too", () => {
  const access = computeEffectiveAccess([], [{
    grant_type: "product_access", resource_type: "product", resource_id: IELTS_COMPLETE_PRODUCT_ID,
    starts_at: "2026-10-01T00:00:00Z", expires_at: null, status: "active",
  }], IELTS_PRACTICE_PRODUCT_ID, now);
  assertEquals(access.sponsored_product_ids, [IELTS_COMPLETE_PRODUCT_ID]);
  assertEquals(access.effective_product_ids, [IELTS_COMPLETE_PRODUCT_ID, IELTS_SIMULATOR_PRODUCT_ID, IELTS_PRACTICE_PRODUCT_ID, IELTS_PLAYBOOK_PRODUCT_ID]);
  assertEquals(access.has_access, true);
});

Deno.test("plain product grants behave exactly as before", () => {
  const access = computeEffectiveAccess(
    [personal(SAT_PRACTICE_PRODUCT_ID), { resource_type: "feature", resource_id: null, starts_at: null, ends_at: null }],
    [{ grant_type: "classroom", resource_type: "product", resource_id: SAT_PLAYBOOK_PRODUCT_ID, starts_at: "2026-01-01T00:00:00Z", expires_at: null, status: "active" }],
    SAT_PLAYBOOK_PRODUCT_ID,
    now,
  );
  assertEquals(access.effective_product_ids, [SAT_PRACTICE_PRODUCT_ID]);
  assertEquals(access.bundle_product_ids, []);
  assertEquals(access.has_access, false);
});

Deno.test("TOEFL Complete unlocks the TOEFL simulator and playbook", () => {
  const access = computeEffectiveAccess([personal(TOEFL_COMPLETE_PRODUCT_ID, "2026-11-20T00:00:00Z")], [], TOEFL_PLAYBOOK_PRODUCT_ID, now);
  assertEquals(access.effective_product_ids, [TOEFL_COMPLETE_PRODUCT_ID, TOEFL_SIMULATOR_PRODUCT_ID, TOEFL_PLAYBOOK_PRODUCT_ID]);
  assertEquals(access.bundle_product_ids, [TOEFL_COMPLETE_PRODUCT_ID]);
  assertEquals(access.has_access, true);
});
