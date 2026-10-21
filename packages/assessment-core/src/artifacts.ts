import { ContractError, object, text, uuid } from "./mod.ts";
export const ARTIFACT_CHUNK_BYTES = 1048576;
export const ARTIFACT_MAX_BYTES = 2147483648;
export const ARTIFACT_MIMES = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "audio/mp4": "audio",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "file",
} as const;
export type ArtifactMime = keyof typeof ARTIFACT_MIMES;
export interface ArtifactPart {
  sha256: string;
  byte_length: number;
}
export interface ArtifactUpload {
  filename: string;
  mime: ArtifactMime;
  byte_length: number;
  parts: ArtifactPart[];
}
export const artifactInteger = (
  value: unknown,
  label: string,
  min: number,
  max: number,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new ContractError(
      "invalid_artifact_number",
      `${label} must be an integer from ${min} to ${max}`,
    );
  return value;
};
export function artifactHex(value: unknown, label = "SHA-256", length = 64) {
  const result = text(value, label, length);
  if (result.length !== length || !/^[a-f0-9]+$/.test(result))
    throw new ContractError(
      "invalid_artifact_digest",
      `${label} must use ${length} lowercase hexadecimal characters`,
    );
  return result;
}
export function artifactMime(value: unknown): ArtifactMime {
  if (typeof value !== "string" || !Object.hasOwn(ARTIFACT_MIMES, value))
    throw new ContractError(
      "invalid_artifact_mime",
      "Use an allowed image, audio, video or PDF format",
    );
  return value as ArtifactMime;
}
/** Whole-file identity is an ordered, pinned SHA-256 part manifest, not a claimed file extension. */
export function artifactUpload(value: unknown): ArtifactUpload {
  const raw = object(value),
    byte_length = artifactInteger(
      raw.byte_length,
      "Artifact size",
      1,
      ARTIFACT_MAX_BYTES,
    ),
    count = Math.ceil(byte_length / ARTIFACT_CHUNK_BYTES);
  if (!Array.isArray(raw.parts) || raw.parts.length !== count)
    throw new ContractError(
      "invalid_artifact_parts",
      "Provide a SHA-256 manifest for every one-MiB part",
    );
  const parts = raw.parts.map((value, index) => {
    const part = object(value),
      length =
        index === count - 1
          ? byte_length - index * ARTIFACT_CHUNK_BYTES
          : ARTIFACT_CHUNK_BYTES;
    return {
      sha256: artifactHex(part.sha256),
      byte_length: artifactInteger(
        part.byte_length,
        "Part size",
        length,
        length,
      ),
    };
  });
  return {
    filename: text(raw.filename, "Filename", 240),
    mime: artifactMime(raw.mime),
    byte_length,
    parts,
  };
}
export function artifactReceipt(value: unknown) {
  const raw = object(value);
  return {
    artifact_id: uuid(raw.artifact_id),
    index: artifactInteger(raw.index, "Part index", 0, 2047),
    sha256: artifactHex(raw.sha256),
    byte_length: artifactInteger(
      raw.byte_length,
      "Part size",
      1,
      ARTIFACT_CHUNK_BYTES,
    ),
    cipher_sha256: artifactHex(raw.cipher_sha256),
    iv: artifactHex(raw.iv, "Encryption nonce", 24),
    key_id: text(raw.key_id, "Encryption key version", 80),
    etag: text(raw.etag, "Storage receipt", 200),
    object_key: text(raw.object_key, "Storage object", 400),
  };
}
export function artifactScanReport(value: unknown) {
  const raw = object(value);
  if (
    !["clean", "rejected"].includes(String(raw.verdict)) ||
    typeof raw.decoder_checked !== "boolean"
  )
    throw new ContractError(
      "invalid_scan_report",
      "A trusted scanner must provide its verdict and decoder check",
    );
  return {
    job_id: uuid(raw.job_id),
    lease_token: uuid(raw.lease_token),
    manifest_hash: artifactHex(raw.manifest_hash),
    verdict: raw.verdict as "clean" | "rejected",
    detected_mime:
      raw.verdict === "clean"
        ? artifactMime(raw.detected_mime)
        : text(raw.detected_mime, "Detected MIME", 120),
    decoder_checked: raw.decoder_checked,
    scanner_id: text(raw.scanner_id, "Scanner identity", 120),
    scanner_version: text(raw.scanner_version, "Scanner version", 120),
    signature_version: text(raw.signature_version, "Malware signatures", 120),
    report_hash: artifactHex(raw.report_hash),
  };
}
