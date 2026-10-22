import {
  ContractError,
  hash,
  object,
  text,
  uuid,
  validateItem,
  validateKey,
} from "./mod.ts";
import {
  ARTIFACT_CHUNK_BYTES,
  artifactHex,
  artifactInteger,
  type ArtifactPart,
} from "./artifacts.ts";
export const QTI_SOURCE_MAX_BYTES = 64 * 1048576;
export const QTI_RESULT_MAX_BYTES = 4 * 1048576;
export interface QtiSourceUpload {
  bank_id: string;
  filename: string;
  source_hash: string;
  byte_length: number;
  parts: ArtifactPart[];
}
export function qtiSourceUpload(value: unknown): QtiSourceUpload {
  const raw = object(value),
    byte_length = artifactInteger(
      raw.byte_length,
      "QTI package size",
      22,
      QTI_SOURCE_MAX_BYTES,
    ),
    count = Math.ceil(byte_length / ARTIFACT_CHUNK_BYTES);
  if (!Array.isArray(raw.parts) || raw.parts.length !== count) {
    throw new ContractError(
      "qti_parts",
      "Provide the exact ordered one-MiB source manifest.",
    );
  }
  return {
    bank_id: uuid(raw.bank_id),
    filename: text(raw.filename, "Package filename", 200),
    source_hash: artifactHex(raw.source_hash),
    byte_length,
    parts: raw.parts.map((value, index) => {
      const part = object(value),
        expected = Math.min(
          ARTIFACT_CHUNK_BYTES,
          byte_length - index * ARTIFACT_CHUNK_BYTES,
        );
      return {
        sha256: artifactHex(part.sha256),
        byte_length: artifactInteger(
          part.byte_length,
          "Source part size",
          expected,
          expected,
        ),
      };
    }),
  };
}
export function qtiPartReceipt(value: unknown) {
  const raw = object(value);
  return {
    job_id: uuid(raw.job_id),
    index: artifactInteger(raw.index, "Part index", 0, 63),
    sha256: artifactHex(raw.sha256),
    byte_length: artifactInteger(
      raw.byte_length,
      "Part size",
      1,
      ARTIFACT_CHUNK_BYTES,
    ),
    cipher_sha256: artifactHex(raw.cipher_sha256),
    iv: artifactHex(raw.iv, "Nonce", 24),
    key_id: text(raw.key_id, "Encryption key ID", 80),
    object_key: text(raw.object_key, "Object key", 400),
    etag: text(raw.etag, "Storage receipt", 200),
  };
}
const path = (value: unknown) => {
  const result = text(value, "Source path", 1024);
  if (
    /^[\\/]|[\\\u0000-\u001f:]/.test(result) ||
    result.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new ContractError(
      "qti_source_path",
      "Use a relative source resource path.",
    );
  }
  return result;
};
const strings = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 50) {
    throw new ContractError(
      "qti_warnings",
      "Expected bounded review warnings.",
    );
  }
  return value.map((entry) => text(entry, "Review warning", 2000));
};
/** Only the authenticated parser port calls this. Reconstruct contracts, retain
 * provenance/blocked resources, and never accept a supplied fingerprint or approval. */
export async function qtiCandidateReport(value: unknown) {
  if (
    new TextEncoder().encode(JSON.stringify(value)).length >
      QTI_RESULT_MAX_BYTES
  ) {
    throw new ContractError(
      "qti_result_limit",
      "Partition this review before accepting its results.",
    );
  }
  const raw = object(value);
  if (
    raw.schema_version !== "assessment.qti-candidates.v1" ||
    raw.publishable !== false || !Array.isArray(raw.draft_candidates) ||
    raw.draft_candidates.length > 2000 || !Array.isArray(raw.blocked) ||
    raw.blocked.length > 2000
  ) {
    throw new ContractError(
      "qti_result",
      "Expected the non-publishable parser proposal protocol.",
    );
  }
  const source_hash = artifactHex(raw.source_hash),
    parser_review_hash = artifactHex(raw.review_hash),
    seen = new Set<string>(),
    fingerprints = new Set<string>();
  const rows: {
    line: number;
    source_path: string;
    identifier: string;
    item: ReturnType<typeof validateItem>;
    key: ReturnType<typeof validateKey>;
    fingerprint: string;
    warnings: string[];
  }[] = [];
  for (const [index, value] of raw.draft_candidates.entries()) {
    const row = object(value),
      item = validateItem(row.item),
      key = validateKey(item, row.key),
      source_path = path(row.path),
      identifier = text(row.identifier, "Source identifier", 200);
    if (
      row.source_hash !== source_hash ||
      row.review_hash !== parser_review_hash || seen.has(source_path)
    ) {
      throw new ContractError(
        "qti_result_provenance",
        "Parser rows must retain one unique hash-bound source resource.",
      );
    }
    seen.add(source_path);
    const fingerprint = await hash({ item, key }),
      warnings = strings(row.warnings);
    if (fingerprints.has(fingerprint)) {
      warnings.push("Identical question and key occur earlier in this file.");
    }
    fingerprints.add(fingerprint);
    rows.push({
      line: index + 1,
      source_path,
      identifier,
      item,
      key,
      fingerprint,
      warnings,
    });
  }
  const blocked = raw.blocked.map((value) => {
    const entry = object(value);
    return {
      path: path(entry.path),
      code: text(entry.code, "Diagnostic code", 100),
      message: text(entry.message, "Diagnostic", 2000),
    };
  });
  if (!rows.length && !blocked.length) {
    throw new ContractError(
      "qti_empty_result",
      "No questions or blocking diagnostics were retained.",
    );
  }
  return {
    schema_version: "assessment.qti-normalized.v1" as const,
    source_hash,
    parser_review_hash,
    rows,
    blocked,
  };
}
export function qtiScanReport(value: unknown) {
  const raw = object(value);
  if (raw.verdict !== "clean" && raw.verdict !== "rejected") {
    throw new ContractError(
      "qti_scan_verdict",
      "A trusted scanner must provide a terminal verdict.",
    );
  }
  if (
    raw.schema_version !== "assessment.qti-scan.v2" ||
    typeof raw.scan_performed !== "boolean" ||
    !["clean", "malware_or_engine_limit", "source_hash_mismatch"].includes(
      String(raw.reason),
    )
  ) {
    throw new ContractError(
      "qti_byte_verification",
      "An explicit exact-byte scanner receipt is required.",
    );
  }
  const source_hash = artifactHex(raw.source_hash),
    observed_source_hash = artifactHex(raw.observed_source_hash);
  if (
    raw.verdict === "clean" &&
      (raw.scan_performed !== true || raw.reason !== "clean" ||
        observed_source_hash !== source_hash) ||
    raw.verdict === "rejected" && raw.reason === "clean" ||
    raw.reason === "source_hash_mismatch" &&
      (raw.scan_performed !== false || observed_source_hash === source_hash) ||
    raw.reason === "malware_or_engine_limit" &&
      (raw.scan_performed !== true || observed_source_hash !== source_hash)
  ) {
    throw new ContractError(
      "qti_byte_verification",
      "Scanner verdict, observed bytes and performed checks do not agree.",
    );
  }
  return {
    schema_version: "assessment.qti-scan.v2",
    source_hash,
    observed_source_hash,
    scan_performed: raw.scan_performed,
    reason: raw.reason,
    byte_length: artifactInteger(
      raw.byte_length,
      "Actual source bytes",
      22,
      QTI_SOURCE_MAX_BYTES,
    ),
    verdict: raw.verdict,
    engine_version: text(raw.engine_version, "Scanner engine", 120),
    signature_version: artifactHex(raw.signature_version),
    report_hash: artifactHex(raw.report_hash),
  };
}
export async function qtiProcessingReport(value: unknown) {
  const raw = object(value);
  if (raw.schema_version !== "assessment.qti-source-failure.v1") {
    return qtiCandidateReport(value);
  }
  const source_hash = artifactHex(raw.source_hash),
    code = text(raw.code, "Source diagnostic code", 100),
    message = text(raw.message, "Source diagnostic", 2000);
  if (
    !/^(zip_|xml_|manifest_|archive_|resource_|dependency_|reference_|graph_|semantic_|diagnostic_)/
      .test(code)
  ) {
    throw new ContractError(
      "qti_failure_kind",
      "Operational failures must not be recorded as rejected source semantics.",
    );
  }
  return {
    schema_version: "assessment.qti-normalized.v1",
    analysis_kind: "source_failure",
    source_hash,
    parser_review_hash: await hash({
      schema_version: raw.schema_version,
      source_hash,
      code,
      message,
    }),
    rows: [],
    blocked: [{ path: "imsmanifest.xml", code, message }],
  };
}
