import {
  ARTIFACT_CHUNK_BYTES,
  artifactHex,
  artifactInteger,
} from "../../../packages/assessment-core/src/artifacts.ts";
import { object, uuid } from "../../../packages/assessment-core/src/mod.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
export interface SourcePart {
  tenant_id: string;
  job_id: string;
  index: number;
  sha256: string;
  byte_length: number;
}
export interface SourceReceipt extends SourcePart {
  iv: string;
  key_id: string;
  cipher_sha256: string;
  object_key: string;
  etag: string;
}
export interface SourceKeys {
  active: string;
  roots: Record<string, string>;
}
export interface SourceBucket {
  get(
    key: string,
  ): Promise<
    {
      size: number;
      etag: string;
      customMetadata?: Record<string, string>;
      arrayBuffer(): Promise<ArrayBuffer>;
    } | null
  >;
  put(
    key: string,
    bytes: Uint8Array,
    options: {
      onlyIf: { etagDoesNotMatch: string };
      httpMetadata: { contentType: string; cacheControl: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<unknown>;
}
export const sha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const fromHex = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
export const sourceKey = (part: SourcePart) =>
  `assessment-qti/${part.tenant_id}/${part.job_id}/${part.index}/${part.sha256}`;
const bad = () =>
  new ServiceError(
    502,
    "qti_part_integrity",
    "The encrypted QTI source does not match its pinned receipt.",
  );
function root(keys: SourceKeys, id: string) {
  if (
    !Object.hasOwn(keys.roots, id) || !/^[a-f0-9]{64}$/.test(keys.roots[id])
  ) {
    throw new ServiceError(
      503,
      "qti_key_unavailable",
      "The required QTI source key is unavailable.",
    );
  }
  return keys.roots[id];
}
async function partKey(part: SourcePart, material: string) {
  const base = await crypto.subtle.importKey(
    "raw",
    fromHex(material),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(part.job_id),
      info: new TextEncoder().encode(
        `schood.qti.source.key.v1|${part.tenant_id}`,
      ),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const aad = (part: SourcePart) =>
  new TextEncoder().encode(
    `schood.qti.source.part.v1|${part.tenant_id}|${part.job_id}|${part.index}|${part.sha256}|${part.byte_length}`,
  );
export function sourcePart(
  value: unknown,
  tenant: string,
  job: string,
  index: number,
): SourcePart {
  const raw = object(value),
    part = {
      tenant_id: uuid(raw.tenant_id),
      job_id: uuid(raw.job_id),
      index: artifactInteger(raw.index, "Source part index", 0, 63),
      sha256: artifactHex(raw.sha256),
      byte_length: artifactInteger(
        raw.byte_length,
        "Source part bytes",
        1,
        ARTIFACT_CHUNK_BYTES,
      ),
    };
  if (
    part.tenant_id !== tenant || part.job_id !== job || part.index !== index
  ) throw bad();
  return part;
}
export function sourceReceipt(value: unknown, part: SourcePart): SourceReceipt {
  const raw = object(value),
    bound = sourcePart(raw, part.tenant_id, part.job_id, part.index);
  if (
    bound.sha256 !== part.sha256 || bound.byte_length !== part.byte_length ||
    raw.object_key !== sourceKey(part) || typeof raw.etag !== "string" ||
    !raw.etag || raw.etag.length > 200 || typeof raw.key_id !== "string" ||
    !/^[-a-zA-Z0-9_]{1,80}$/.test(raw.key_id)
  ) throw bad();
  return {
    ...bound,
    iv: artifactHex(raw.iv, "Nonce", 24),
    cipher_sha256: artifactHex(raw.cipher_sha256),
    key_id: raw.key_id,
    etag: raw.etag,
    object_key: sourceKey(part),
  };
}
async function storedPart(
  part: SourcePart,
  bucket: SourceBucket,
  keys: SourceKeys,
  expected?: SourceReceipt,
) {
  const stored = await bucket.get(sourceKey(part));
  if (!stored || stored.size !== part.byte_length + 16) throw bad();
  const metadata = stored.customMetadata ?? {},
    receipt = sourceReceipt({
      ...part,
      object_key: sourceKey(part),
      etag: stored.etag,
      iv: metadata.iv,
      key_id: metadata.key_id,
      cipher_sha256: metadata.cipher_sha256,
    }, part);
  if (expected && JSON.stringify(receipt) !== JSON.stringify(expected)) {
    throw bad();
  }
  const cipher = new Uint8Array(await stored.arrayBuffer());
  if (
    cipher.length !== part.byte_length + 16 ||
    await sha256(cipher) !== receipt.cipher_sha256
  ) throw bad();
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromHex(receipt.iv),
          additionalData: aad(part),
          tagLength: 128,
        },
        await partKey(part, root(keys, receipt.key_id)),
        cipher,
      ),
    );
  } catch (cause) {
    if (cause instanceof ServiceError && cause.status === 503) throw cause;
    throw bad();
  }
  if (
    bytes.length !== part.byte_length || await sha256(bytes) !== part.sha256
  ) throw bad();
  return { bytes, receipt };
}
export async function writeSourcePart(
  bytes: Uint8Array,
  part: SourcePart,
  expected: SourceReceipt | null,
  bucket: SourceBucket,
  keys: SourceKeys,
  commit: (receipt: SourceReceipt) => Promise<unknown>,
) {
  if (
    bytes.length !== part.byte_length || bytes.length > ARTIFACT_CHUNK_BYTES ||
    await sha256(bytes) !== part.sha256
  ) {
    throw new ServiceError(
      409,
      "qti_part_conflict",
      "These bytes do not match the admitted QTI source part.",
    );
  }
  if (!expected) {
    const iv = crypto.getRandomValues(new Uint8Array(12)),
      cipher = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad(part), tagLength: 128 },
          await partKey(part, root(keys, keys.active)),
          new Uint8Array(bytes),
        ),
      );
    await bucket.put(sourceKey(part), cipher, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: {
        contentType: "application/octet-stream",
        cacheControl: "no-store",
      },
      customMetadata: {
        iv: hex(iv),
        key_id: keys.active,
        cipher_sha256: await sha256(cipher),
      },
    });
  }
  const stored = await storedPart(part, bucket, keys, expected ?? undefined);
  // Rechecks current source ownership/state even when recovering an existing receipt.
  await commit(stored.receipt);
  return {
    job_id: part.job_id,
    index: part.index,
    sha256: part.sha256,
    byte_length: part.byte_length,
  };
}
export async function readSourcePart(
  receipt: SourceReceipt,
  bucket: SourceBucket,
  keys: SourceKeys,
) {
  return (await storedPart(receipt, bucket, keys, receipt)).bytes;
}
