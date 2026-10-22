import { ContractError, object, text, uuid } from "./mod.ts";
export const CERTIFICATE_FORMAT = "schood.certificate.v1";
/** SHA-256 of the exact database-held UTF-8 bytes, not canonical JSON of a string. */
export async function certificatePayloadHash(payload: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
export interface CertificateEnvelope {
  format: typeof CERTIFICATE_FORMAT;
  key_id: string;
  payload: string;
  signature: string;
}
export interface CertificateClaims {
  schema_version: typeof CERTIFICATE_FORMAT;
  certificate_id: string;
  program_id: string;
  issuer: string;
  recipient: string;
  achievement: string;
  criteria: string;
  minimum_percent: number;
  exam: string;
  grading_generation: number;
  score_revision_id: string;
  score: number;
  maximum_score: number;
  issued_at: string;
  expires_at: string | null;
  replaces_certificate_id?: string;
}
const invalid = (): never => {
  throw new ContractError(
    "invalid_certificate",
    "This is not a supported signed Schood certificate.",
  );
};
export function certificateKey(value: unknown) {
  const id = text(value, "Signing key", 64);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) invalid();
  return id;
}
export function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}
export function unbase64url(value: unknown, max = 30000) {
  if (
    typeof value !== "string" || !value.length || value.length > max ||
    !/^[a-zA-Z0-9_-]+$/.test(value) || value.length % 4 === 1
  ) return invalid();
  try {
    const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/")),
      bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    if (base64url(bytes) !== value) invalid();
    return bytes;
  } catch {
    return invalid();
  }
}
export function certificateEnvelope(value: unknown): CertificateEnvelope {
  const data = object(value);
  if (
    data.format !== CERTIFICATE_FORMAT ||
    Object.keys(data).some((key) =>
      !["format", "key_id", "payload", "signature"].includes(key)
    )
  ) invalid();
  const payload = String(data.payload ?? ""),
    signature = String(data.signature ?? "");
  unbase64url(payload);
  if (unbase64url(signature, 100).length !== 64) invalid();
  return {
    format: CERTIFICATE_FORMAT,
    key_id: certificateKey(data.key_id),
    payload,
    signature,
  };
}
export function certificateClaims(payload: string): CertificateClaims {
  let value: Record<string, unknown>;
  try {
    value = object(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(unbase64url(payload)),
      ),
    );
  } catch {
    return invalid();
  }
  if (value.schema_version !== CERTIFICATE_FORMAT) invalid();
  if (
    !["score", "maximum_score", "minimum_percent", "grading_generation"].every(
      (key) => typeof value[key] === "number",
    )
  ) return invalid();
  const score = Number(value.score),
    maximum = Number(value.maximum_score),
    threshold = Number(value.minimum_percent),
    generation = Number(value.grading_generation);
  if (
    ![score, maximum, threshold].every(Number.isFinite) || score < 0 ||
    maximum <= 0 || score > maximum || threshold < 0 || threshold > 100 ||
    !Number.isSafeInteger(generation) || generation < 1
  ) invalid();
  const issued = text(value.issued_at, "Issue time", 80),
    expires = value.expires_at === null
      ? null
      : text(value.expires_at, "Expiry", 80);
  if (
    !Number.isFinite(Date.parse(issued)) ||
    (expires &&
      (!Number.isFinite(Date.parse(expires)) ||
        Date.parse(expires) <= Date.parse(issued)))
  ) invalid();
  const predecessor = value.replaces_certificate_id === undefined
    ? undefined
    : uuid(value.replaces_certificate_id);
  if (predecessor === value.certificate_id) invalid();
  return {
    schema_version: CERTIFICATE_FORMAT,
    certificate_id: uuid(value.certificate_id),
    program_id: uuid(value.program_id),
    score_revision_id: uuid(value.score_revision_id),
    issuer: text(value.issuer, "Issuer", 200),
    recipient: text(value.recipient, "Recipient", 200),
    achievement: text(value.achievement, "Achievement", 200),
    criteria: text(value.criteria, "Criteria", 2000),
    exam: text(value.exam, "Exam", 200),
    minimum_percent: threshold,
    grading_generation: generation,
    score,
    maximum_score: maximum,
    issued_at: issued,
    expires_at: expires,
    ...(predecessor ? { replaces_certificate_id: predecessor } : {}),
  };
}
export const certificateMessage = (
  value: Pick<CertificateEnvelope, "key_id" | "payload">,
) =>
  new TextEncoder().encode(
    `${CERTIFICATE_FORMAT}.${value.key_id}.${value.payload}`,
  );
export function certificateProgram(value: unknown) {
  const data = object(value),
    percent = data.minimum_percent,
    days = data.valid_days ?? null;
  if (
    typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 ||
    percent > 100 || Math.round(percent * 1e6) / 1e6 !== percent
  ) {
    throw new ContractError(
      "invalid_certificate_program",
      "Use a threshold from 0 to 100 with at most six decimal places.",
    );
  }
  if (
    days !== null &&
    (typeof days !== "number" || !Number.isInteger(days) || days < 1 ||
      days > 36500)
  ) {
    throw new ContractError(
      "invalid_certificate_program",
      "Use an expiry from 1 to 36,500 days, or no expiry.",
    );
  }
  return {
    title: text(data.title, "Achievement title", 200),
    description: text(data.description, "Award criteria", 2000),
    minimum_percent: percent,
    valid_days: days,
  };
}
