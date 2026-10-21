import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sandbox } from "./run.mjs";
// Download, do not redistribute, immutable examples linked by the official guide.
const COMMIT = "0a92fbbb6d2e620a1f7fad19977be4c418246bc0";
const CASES = [
  [
    "sharedMedia/sharedMedia",
    "7fae0d031008c2d7cb5be92dab1c48dcd0f46d15dc450966c59101245f0c89a0",
    2,
    3,
    ["processing_template_unsupported"],
  ],
  [
    "maxfiles/maxfiles",
    "b58be4b52494f8d641cb7a55b23343470e422bcd26cfaa64c724934905e15e5a",
    6,
    6,
    [
      "adaptive_mapping_required",
      "processing_template_unsupported",
      "template_entry_from_file",
    ],
  ],
  [
    "ccPackage/ccPackage",
    "f0509247c4507a7fde9da2925fb7c16ddcbcea5a6c9f63f4ecfd7bdd23345c6c",
    15,
    15,
    ["processing_template_unsupported"],
  ],
];
for (const [name, digest, documents, resources, diagnostics] of CASES) {
  const response = await fetch(
    `https://raw.githubusercontent.com/1EdTech/qti-examples/${COMMIT}/qtiv3-examples/packaging/${name}.zip`,
    { signal: AbortSignal.timeout(20000) },
  );
  assert.equal(response.status, 200);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    assert.ok(total <= 64 * 1048576);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
  const review = await sandbox(bytes, "review");
  assert.equal(review.runnable, false);
  assert.equal(review.requires_human_review, true);
  assert.equal(review.documents.length, documents);
  assert.equal(review.inspection.resources.length, resources);
  assert.deepEqual(
    [...new Set(review.diagnostics.map((row) => row.code))].sort(),
    diagnostics,
  );
  console.log(JSON.stringify({
    name,
    source_hash: digest,
    status: "reviewed",
    documents: review.documents.length,
    resources: review.inspection.resources.length,
    diagnostics: [...new Set(review.diagnostics.map((row) => row.code))]
      .sort(),
  }));
}
