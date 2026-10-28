import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHash } from "node:crypto";
import {
  bundlesGranting,
  EXAM_BUNDLES,
  examBundleMembers,
  expandExamBundleProductIds,
  IELTS_COMPLETE_PRODUCT_ID,
  IELTS_PLAYBOOK_PRODUCT_ID,
  IELTS_PRACTICE_PRODUCT_ID,
  IELTS_SIMULATOR_PRODUCT_ID,
  isExamBundleProductId,
  productIdsGrantingAccess,
  SAT_COMPLETE_PRODUCT_ID,
  SAT_PLAYBOOK_PRODUCT_ID,
  SAT_PRACTICE_PRODUCT_ID,
  SAT_SIMULATOR_PRODUCT_ID,
  TOEFL_COMPLETE_PRODUCT_ID,
  TOEFL_PLAYBOOK_PRODUCT_ID,
  TOEFL_SIMULATOR_PRODUCT_ID,
  withExamBundleMemberEntitlements,
} from "./product-bundles.ts";

const md5Uuid = (input: string) => {
  const h = createHash("md5").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

// IELTS/SAT shipped first; TOEFL has its own migration.
const migrations = [
  await Deno.readTextFile(new URL("../../migrations/20261026100900_exam_plans_and_complete_bundles.sql", import.meta.url)),
  await Deno.readTextFile(new URL("../../migrations/20261028110000_toefl_plans_and_complete_bundle.sql", import.meta.url)),
];
const migration = migrations.join(String.fromCharCode(10));
const toeflMigration = migrations[1];

Deno.test("bundle ids are md5('schood-product:<slug>') like the migration", () => {
  assertEquals(EXAM_BUNDLES.map((bundle) => bundle.slug), ["ielts-complete", "sat-complete", "toefl-complete"]);
  assert(!/toefl/i.test(migrations[0].replace(/^--.*$/gm, "")), "the IELTS/SAT migration has no TOEFL rows");
  assert(!/ielts|sat-/i.test(toeflMigration.replace(/^--.*$/gm, "")), "the TOEFL migration touches only TOEFL rows");
  // The inactive hand-made "test" plan is never touched.
  assert(!toeflMigration.replace(/^--.*$/gm, "").includes("5f49a588"));
  for (const bundle of EXAM_BUNDLES) {
    assertEquals(bundle.productId, md5Uuid(`schood-product:${bundle.slug}`));
    assert(migration.includes(`md5('schood-product:${bundle.slug}')::uuid`), bundle.slug);
  }
});

Deno.test("migration plan metadata lists exactly the members this module expands", () => {
  for (const bundle of EXAM_BUNDLES) {
    const planStart = migration.indexOf(`md5('schood-plan:${bundle.slug}-30')::uuid`);
    assert(planStart > 0, `missing plan for ${bundle.slug}`);
    const block = migration.slice(planStart, migration.indexOf("'seeded_by'", planStart));
    const included = block.slice(block.indexOf("'included_product_ids'"));
    const ids = [...included.matchAll(/'([0-9a-f-]{36})'/g)].map((m) => m[1]);
    assertEquals(ids, [...bundle.members]);
  }
});

Deno.test("expansion adds every member of a held bundle and nothing else", () => {
  assertEquals(expandExamBundleProductIds([IELTS_COMPLETE_PRODUCT_ID]), [
    IELTS_COMPLETE_PRODUCT_ID,
    IELTS_SIMULATOR_PRODUCT_ID,
    IELTS_PRACTICE_PRODUCT_ID,
    IELTS_PLAYBOOK_PRODUCT_ID,
  ]);
  assertEquals(expandExamBundleProductIds([SAT_COMPLETE_PRODUCT_ID, SAT_PLAYBOOK_PRODUCT_ID]), [
    SAT_COMPLETE_PRODUCT_ID,
    SAT_SIMULATOR_PRODUCT_ID,
    SAT_PRACTICE_PRODUCT_ID,
    SAT_PLAYBOOK_PRODUCT_ID,
  ]);
  assertEquals(expandExamBundleProductIds([TOEFL_COMPLETE_PRODUCT_ID]), [
    TOEFL_COMPLETE_PRODUCT_ID,
    TOEFL_SIMULATOR_PRODUCT_ID,
    TOEFL_PLAYBOOK_PRODUCT_ID,
  ]);
  assertEquals(productIdsGrantingAccess(TOEFL_SIMULATOR_PRODUCT_ID), [TOEFL_SIMULATOR_PRODUCT_ID, TOEFL_COMPLETE_PRODUCT_ID]);
  assertEquals(expandExamBundleProductIds([SAT_PRACTICE_PRODUCT_ID, ""]), [SAT_PRACTICE_PRODUCT_ID]);
  assertEquals(expandExamBundleProductIds([]), []);
});

Deno.test("a member is granted by itself and by its bundle only", () => {
  assertEquals(productIdsGrantingAccess(SAT_PRACTICE_PRODUCT_ID), [SAT_PRACTICE_PRODUCT_ID, SAT_COMPLETE_PRODUCT_ID]);
  assertEquals(bundlesGranting(IELTS_PLAYBOOK_PRODUCT_ID), [IELTS_COMPLETE_PRODUCT_ID]);
  assertEquals(bundlesGranting("3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa"), []);
  assertEquals(examBundleMembers(SAT_PRACTICE_PRODUCT_ID), []);
  assert(isExamBundleProductId(SAT_COMPLETE_PRODUCT_ID));
  assert(!isExamBundleProductId(SAT_PRACTICE_PRODUCT_ID));
  assert(!isExamBundleProductId(null));
});

Deno.test("derived member rows for /me keep the bundle window and never shadow direct grants", () => {
  const rows = [
    { id: "b1", resource_type: "product", resource_id: IELTS_COMPLETE_PRODUCT_ID, starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z", value: { plan_id: "p" } },
    { id: "d1", resource_type: "product", resource_id: IELTS_PRACTICE_PRODUCT_ID, starts_at: null, ends_at: "2026-12-01T00:00:00Z", value: null },
    { id: "f1", resource_type: "feature", resource_id: null, starts_at: null, ends_at: null, value: null },
  ];
  const out = withExamBundleMemberEntitlements(rows);
  assertEquals(out.slice(0, 3), rows);
  const derived = out.slice(3);
  assertEquals(derived.map((row) => row.resource_id), [IELTS_SIMULATOR_PRODUCT_ID, IELTS_PLAYBOOK_PRODUCT_ID]);
  for (const row of derived) {
    assertEquals(row.ends_at, "2026-11-01T00:00:00Z");
    assertEquals(row.value, { via_bundle_product_id: IELTS_COMPLETE_PRODUCT_ID });
    assert(String(row.id).startsWith("b1:bundle:"));
  }
  assertEquals(withExamBundleMemberEntitlements([rows[1]]), [rows[1]]);
});
