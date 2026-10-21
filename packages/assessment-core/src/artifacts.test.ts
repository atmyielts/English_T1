import {
  artifactUpload,
  artifactReceipt,
  artifactScanReport,
  ARTIFACT_CHUNK_BYTES,
} from "./artifacts.ts";
const id = "00000000-0000-4000-8000-000000000001";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error("Artifact contract differs");
}
function rejects(fn: () => unknown) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("Expected artifact rejection");
}
Deno.test(
  "upload manifests pin exact ordered part sizes and digests and strip authority/storage fields",
  () => {
    const raw = {
      filename: " ../../display-only.png ",
      mime: "image/png",
      byte_length: ARTIFACT_CHUNK_BYTES + 3,
      parts: [
        { sha256: "a".repeat(64), byte_length: ARTIFACT_CHUNK_BYTES },
        { sha256: "b".repeat(64), byte_length: 3 },
      ],
      tenant_id: id,
      state: "ready",
      object_key: "forged",
    };
    const upload = artifactUpload(raw);
    equal(upload.filename, "../../display-only.png");
    equal("object_key" in upload, false);
    equal("state" in upload, false);
    equal(upload.parts.length, 2);
    rejects(() =>
      artifactUpload({ ...raw, parts: [raw.parts[1], raw.parts[0]] }),
    );
    rejects(() => artifactUpload({ ...raw, byte_length: 2 }));
    rejects(() => artifactUpload({ ...raw, parts: [] }));
  },
);
Deno.test(
  "artifact uploads reject active/unsupported types, oversized files and malformed digest manifests",
  () => {
    const raw = {
      filename: "file",
      mime: "image/png",
      byte_length: 3,
      parts: [{ sha256: "a".repeat(64), byte_length: 3 }],
    };
    for (const mime of [
      "image/svg+xml",
      "text/html",
      "application/javascript",
      "__proto__",
    ])
      rejects(() => artifactUpload({ ...raw, mime }));
    rejects(() => artifactUpload({ ...raw, byte_length: 2147483649 }));
    rejects(() =>
      artifactUpload({
        ...raw,
        parts: [{ sha256: "A".repeat(64), byte_length: 3 }],
      }),
    );
    rejects(() => artifactUpload({ ...raw, byte_length: 3.5 }));
  },
);
Deno.test(
  "private storage receipts reconstruct only the bounded encryption envelope",
  () => {
    const receipt = artifactReceipt({
      artifact_id: id,
      index: 0,
      sha256: "a".repeat(64),
      byte_length: 3,
      cipher_sha256: "b".repeat(64),
      iv: "c".repeat(24),
      key_id: "k1",
      etag: "etag",
      object_key: "assessment/private",
      actor: id,
      state: "ready",
    });
    equal("actor" in receipt, false);
    rejects(() => artifactReceipt({ ...receipt, iv: "abc" }));
    rejects(() => artifactReceipt({ ...receipt, index: 2048 }));
  },
);
Deno.test(
  "scanner reports allow rejected unknown formats but never accept clean unsupported media",
  () => {
    const raw = {
      job_id: id,
      lease_token: id,
      manifest_hash: "a".repeat(64),
      verdict: "rejected",
      detected_mime: "text/html",
      decoder_checked: false,
      scanner_id: "scanner",
      scanner_version: "1",
      signature_version: "2026",
      report_hash: "b".repeat(64),
    };
    equal(artifactScanReport(raw).detected_mime, "text/html");
    rejects(() => artifactScanReport({ ...raw, verdict: "clean" }));
    rejects(() => artifactScanReport({ ...raw, decoder_checked: "true" }));
  },
);
