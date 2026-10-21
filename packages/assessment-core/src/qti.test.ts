import {
  qtiCandidateReport,
  qtiPartReceipt,
  qtiProcessingReport,
  qtiScanReport,
  qtiSourceUpload,
} from "./qti.ts";
import { hash } from "./mod.ts";
const id = "10000000-0000-4000-8000-000000000001", digest = "a".repeat(64);
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(JSON.stringify({ a, b }));
  }
};
function rejects(fn: () => unknown) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
async function rejected(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
const item = {
  schema_version: "assessment.item.v1",
  type: "single_choice",
  locale: "en",
  prompt: "Choose",
  max_score: 1,
  tags: [],
  options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }],
};
export const proposal = () => ({
  schema_version: "assessment.qti-candidates.v1",
  source_hash: digest,
  review_hash: "b".repeat(64),
  draft_candidates: [{
    path: "items/a.xml",
    identifier: "Q1",
    source_hash: digest,
    review_hash: "b".repeat(64),
    item,
    key: { correct: "A" },
    warnings: ["Review licensing and content."],
  }],
  blocked: [],
  publishable: false,
});
Deno.test("QTI source admission pins bounded exact one-MiB parts and strips supplied processing authority", () => {
  const upload = {
    bank_id: id,
    filename: "bank.zip",
    source_hash: digest,
    byte_length: 1048580,
    parts: [{ sha256: digest, byte_length: 1048576 }, {
      sha256: digest,
      byte_length: 4,
    }],
    processor_id: "forged",
    approved: true,
  };
  equal(qtiSourceUpload(upload), {
    bank_id: id,
    filename: "bank.zip",
    source_hash: digest,
    byte_length: 1048580,
    parts: upload.parts,
  });
  for (
    const change of [
      { byte_length: 67108865 },
      { parts: upload.parts.slice(0, 1) },
      { byte_length: 21 },
      { parts: [{ sha256: digest, byte_length: 100 }, upload.parts[1]] },
      { source_hash: "A".repeat(64) },
    ]
  ) rejects(() => qtiSourceUpload({ ...upload, ...change }));
});
Deno.test("QTI byte receipts and malware reports reconstruct separate trusted protocols", () => {
  const value = {
    job_id: id,
    index: 0,
    sha256: digest,
    byte_length: 22,
    cipher_sha256: digest,
    iv: "c".repeat(24),
    key_id: "key1",
    object_key: "assessment-qti/object",
    etag: "etag",
    approved: true,
  };
  const receipt = qtiPartReceipt(value);
  equal("approved" in receipt, false);
  rejects(() => qtiPartReceipt({ ...value, index: 64 }));
  const scan = {
    schema_version: "assessment.qti-scan.v2",
    observed_source_hash: digest,
    scan_performed: true,
    reason: "clean",
    source_hash: digest,
    byte_length: 22,
    verdict: "clean",
    engine_version: "test",
    signature_version: digest,
    report_hash: digest,
    approved_by: id,
  };
  equal("approved_by" in qtiScanReport(scan), false);
  rejects(() => qtiScanReport({ ...scan, verdict: "probably_clean" }));
});
Deno.test("parser proposals retain private keys and source identity but cannot supply fingerprints or approvals", async () => {
  const raw = proposal();
  Object.assign(raw.draft_candidates[0], {
    approved_by: id,
    fingerprint: "forged",
  });
  Object.assign(raw.draft_candidates[0].item, { approved: true });
  const normalized = await qtiCandidateReport(raw), row = normalized.rows[0];
  equal(row.fingerprint, await hash({ item: row.item, key: row.key }));
  equal("approved" in row.item, false);
  equal("approved_by" in row, false);
  equal(row.source_path, "items/a.xml");
  equal(row.key.correct, "A");
  equal(normalized.parser_review_hash, raw.review_hash);
});
Deno.test("unsupported resources cannot be dropped from a parser result or become a publishable import", async () => {
  const raw = proposal();
  const blocked = {
    path: "items/custom.xml",
    code: "custom_processing",
    message: "Mapping required.",
  };
  const normalized = await qtiCandidateReport({ ...raw, blocked: [blocked] });
  equal(normalized.blocked, [blocked]);
  await rejected(() => qtiCandidateReport({ ...raw, publishable: true }));
  await rejected(() =>
    qtiCandidateReport({ ...raw, draft_candidates: [], blocked: [] })
  );
  await rejected(() =>
    qtiCandidateReport({
      ...raw,
      draft_candidates: [raw.draft_candidates[0], raw.draft_candidates[0]],
    })
  );
  await rejected(() =>
    qtiCandidateReport({
      ...raw,
      draft_candidates: [{
        ...raw.draft_candidates[0],
        source_hash: "d".repeat(64),
      }],
    })
  );
  await rejected(() =>
    qtiCandidateReport({
      ...raw,
      draft_candidates: [{ ...raw.draft_candidates[0], path: "../escape" }],
    })
  );
});
Deno.test("QTI duplicate warnings and fingerprints are deterministic in source row order", async () => {
  const raw = proposal();
  raw.draft_candidates.push({
    ...raw.draft_candidates[0],
    path: "items/b.xml",
    identifier: "Q2",
  });
  const result = await qtiCandidateReport(raw);
  equal(result.rows[0].warnings, ["Review licensing and content."]);
  equal(result.rows[1].warnings, [
    "Review licensing and content.",
    "Identical question and key occur earlier in this file.",
  ]);
  equal(result.rows[0].fingerprint, result.rows[1].fingerprint);
  equal(await qtiCandidateReport(raw), result);
});
Deno.test("QTI clean scans require performed exact-byte verification; mismatches are explicit unscanned rejection", () => {
  const clean = {
    schema_version: "assessment.qti-scan.v2",
    source_hash: digest,
    observed_source_hash: digest,
    scan_performed: true,
    reason: "clean",
    byte_length: 22,
    verdict: "clean",
    engine_version: "Unit fixture, not AV",
    signature_version: "b".repeat(64),
    report_hash: "c".repeat(64),
  };
  equal(qtiScanReport(clean).scan_performed, true);
  for (
    const change of [
      { schema_version: "assessment.qti-scan.v1" },
      { scan_performed: false },
      { observed_source_hash: "d".repeat(64) },
      { reason: "malware_or_engine_limit" },
    ]
  ) rejects(() => qtiScanReport({ ...clean, ...change }));
  const mismatch = {
    ...clean,
    verdict: "rejected",
    reason: "source_hash_mismatch",
    observed_source_hash: "d".repeat(64),
    scan_performed: false,
  };
  equal(qtiScanReport(mismatch).scan_performed, false);
  rejects(() => qtiScanReport({ ...mismatch, scan_performed: true }));
  rejects(() => qtiScanReport({ ...mismatch, observed_source_hash: digest }));
});
Deno.test("QTI source-policy failure retains diagnostics without inventing rows or classifying operational outages", async () => {
  const raw = {
    schema_version: "assessment.qti-source-failure.v1",
    source_hash: digest,
    code: "xml_dtd",
    message: "DTD is forbidden.",
  };
  const value = await qtiProcessingReport(raw);
  equal(value.rows, []);
  equal(value.blocked[0].code, "xml_dtd");
  equal(await qtiProcessingReport(raw), value);
  for (
    const code of [
      "transport_timeout",
      "scanner_unavailable",
      "runtime_failure",
    ]
  ) await rejected(() => qtiProcessingReport({ ...raw, code }));
});
