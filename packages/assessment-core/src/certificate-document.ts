import { ContractError, object, uuid } from "./mod.ts";
import {
  base64url,
  type CertificateEnvelope,
  certificateEnvelope,
  certificateKey,
  certificatePayloadHash,
  unbase64url,
} from "./certificates.ts";
export const CERTIFICATE_REFERENCE_FORMAT = "schood.certificate.reference.v1";
export interface CertificateReference {
  format: typeof CERTIFICATE_REFERENCE_FORMAT;
  id: string;
  key_id: string;
  payload_hash: string;
  signature: string;
}
export type CertificateLocale = "en" | "uz" | "ru";
export function certificateLocale(value: unknown): CertificateLocale {
  if (!["en", "uz", "ru"].includes(String(value))) {
    throw new ContractError(
      "invalid_certificate_locale",
      "Choose English, Uzbek or Russian.",
    );
  }
  return value as CertificateLocale;
}
export function certificateReference(value: unknown): CertificateReference {
  const d = object(value);
  if (
    d.format !== CERTIFICATE_REFERENCE_FORMAT ||
    Object.keys(d).some((key) =>
      !["format", "id", "key_id", "payload_hash", "signature"].includes(key)
    ) || typeof d.payload_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(d.payload_hash) || typeof d.signature !== "string" ||
    unbase64url(d.signature, 100).length !== 64
  ) {
    throw new ContractError(
      "invalid_certificate_reference",
      "This certificate verification reference is not supported.",
    );
  }
  return {
    format: CERTIFICATE_REFERENCE_FORMAT,
    id: uuid(d.id),
    key_id: certificateKey(d.key_id),
    payload_hash: d.payload_hash,
    signature: d.signature,
  };
}
export async function referenceForCertificate(value: CertificateEnvelope) {
  const envelope = certificateEnvelope(value),
    claims = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        unbase64url(envelope.payload),
      ),
    );
  return certificateReference({
    format: CERTIFICATE_REFERENCE_FORMAT,
    id: claims.certificate_id,
    key_id: envelope.key_id,
    payload_hash: await certificatePayloadHash(
      new TextDecoder("utf-8", { fatal: true }).decode(
        unbase64url(envelope.payload),
      ),
    ),
    signature: envelope.signature,
  });
}
export function encodeCertificateReference(value: CertificateReference) {
  const ref = certificateReference(value);
  return ["r1", ref.id, ref.key_id, ref.payload_hash, ref.signature].join(".");
}
export function decodeCertificateReference(value: string) {
  const parts = value.split(".");
  if (value.length > 512 || parts.length !== 5 || parts[0] !== "r1") {
    throw new ContractError(
      "invalid_certificate_reference",
      "The verification reference is not supported.",
    );
  }
  return certificateReference({
    format: CERTIFICATE_REFERENCE_FORMAT,
    id: parts[1],
    key_id: parts[2],
    payload_hash: parts[3],
    signature: parts[4],
  });
}
export function certificateVerificationUrl(
  base: string,
  reference: CertificateReference,
  allowLocalhost = false,
) {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new ContractError(
      "certificate_verification_unconfigured",
      "The institution verification page is not configured.",
      503,
    );
  }
  const local = allowLocalhost &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username || url.password || url.hash || url.search || base.length > 500
  ) {
    throw new ContractError(
      "certificate_verification_unconfigured",
      "Use a trusted HTTPS Exam page without query, fragment or user information.",
      503,
    );
  }
  url.searchParams.set("verify_certificate", "1");
  url.hash = "certificate=" + encodeCertificateReference(reference);
  return url.toString();
}
