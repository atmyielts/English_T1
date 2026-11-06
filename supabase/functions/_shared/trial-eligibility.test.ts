import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { IELTS_COMPLETE_PRODUCT_ID, IELTS_SIMULATOR_PRODUCT_ID } from "./product-bundles.ts";
import { isHiddenProduct, withoutBundleTrial, withoutHiddenProductTrial } from "./trial-eligibility.ts";

const on = { trial_enabled: true, trial_days: 15 };

Deno.test("a hidden product is never on trial, and the rest of the config stays", () => {
  const seat = { metadata: { slug: "english-company-seat", kind: "company_seat", hidden: true } };
  assertEquals(withoutHiddenProductTrial(on, seat), { trial_enabled: false, trial_days: 15 });
});

Deno.test("anything but metadata.hidden === true leaves the trial alone", () => {
  for (const product of [{ metadata: { hidden: false } }, { metadata: { hidden: "true" } }, { metadata: {} }, { metadata: null }, { metadata: [] }, {}, null, undefined]) {
    assert(!isHiddenProduct(product), JSON.stringify(product));
    assertEquals(withoutHiddenProductTrial(on, product), on);
  }
  // A disabled trial stays disabled.
  assertEquals(withoutHiddenProductTrial({ trial_enabled: false }, {}), { trial_enabled: false });
});

Deno.test("exam bundles keep their refusal", () => {
  assertEquals(withoutBundleTrial(on, IELTS_COMPLETE_PRODUCT_ID).trial_enabled, false);
  assertEquals(withoutBundleTrial(on, IELTS_SIMULATOR_PRODUCT_ID).trial_enabled, true);
});

Deno.test("trial-claim reads the metadata and applies the refusal in both GET and POST", async () => {
  const source = await Deno.readTextFile(new URL("../trial-claim/index.ts", import.meta.url));
  assertEquals(source.match(/\.select\("id,name,status,metadata"\)/g)?.length, 2, "both product reads carry metadata");
  assertEquals(source.match(/withoutHiddenProductTrial\(/g)?.length, 2, "GET and POST");
  assert(!source.includes('.select("id,name,status")'), "no product read without metadata");
  // POST refuses before any claim row or entitlement is written.
  assert(source.indexOf("withoutHiddenProductTrial(effective, product)") < source.indexOf('.from("trial_claims")\n      .insert(') || source.indexOf("withoutHiddenProductTrial(effective, product)") < source.indexOf('.from("trial_claims")\r\n      .insert('));
});
