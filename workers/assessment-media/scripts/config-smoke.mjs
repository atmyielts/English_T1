import { unstable_readConfig } from "wrangler";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const config = fileURLToPath(new URL("../wrangler.toml", import.meta.url)),
  names = [],
  buckets = [],
  keyIds = [];
for (const env of [undefined, "staging", "production"]) {
  const value = unstable_readConfig({ config, ...(env ? { env } : {}) });
  assert.equal(value.workers_dev, false);
  assert.equal(value.routes?.length ?? 0, 0);
  assert.equal(value.r2_buckets.length, 1);
  assert.equal(value.r2_buckets[0].binding, "ARTIFACTS");
  assert.equal(value.vars.ARTIFACT_KEYRING, undefined);
  assert.equal(value.vars.ASSESSMENT_MEDIA_SECRET, undefined);
  assert.equal(value.vars.ASSESSMENT_SCANNER_SECRET, undefined);
  names.push(value.name);
  buckets.push(value.r2_buckets[0].bucket_name);
  keyIds.push(value.vars.ARTIFACT_ACTIVE_KEY_ID);
}
assert.equal(new Set(names).size, 3);
assert.equal(new Set(buckets).size, 3);
assert.equal(new Set(keyIds).size, 3);
process.stdout.write(
  "Passed isolated media Worker/private R2/key-version configuration, with no public worker.dev route, secret values, provider resource creation or deployment.\n",
);
