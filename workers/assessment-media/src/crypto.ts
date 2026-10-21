import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
export interface PartBinding {
  tenant_id: string;
  artifact_id: string;
  index: number;
  sha256: string;
  byte_length: number;
}
export const hex = (value: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(value)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export const sha256 = async (value: Uint8Array) =>
  hex(await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer));
export function fromHex(value: string): Uint8Array<ArrayBuffer> {
  if (value.length % 2 || !/^[a-f0-9]+$/.test(value))
    throw new ServiceError(
      503,
      "invalid_encryption_config",
      "Artifact encryption is not configured correctly",
    );
  return Uint8Array.from(value.match(/../g)!, (v) => parseInt(v, 16));
}
const aad = (part: PartBinding) =>
  new TextEncoder().encode(
    `schood.artifact.part.v1|${part.tenant_id}|${part.artifact_id}|${part.index}|${part.sha256}|${part.byte_length}`,
  );
async function key(root: string, part: PartBinding) {
  if (!/^[a-f0-9]{64}$/.test(root))
    throw new ServiceError(
      503,
      "invalid_encryption_config",
      "Artifact encryption is not configured correctly",
    );
  const base = await crypto.subtle.importKey(
    "raw",
    fromHex(root),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(part.artifact_id),
      info: new TextEncoder().encode(
        `schood.artifact.key.v1|${part.tenant_id}`,
      ),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptPart(
  bytes: Uint8Array,
  part: PartBinding,
  root: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad(part), tagLength: 128 },
        await key(root, part),
        new Uint8Array(bytes).buffer,
      ),
    );
  return { cipher, iv: hex(iv), cipher_sha256: await sha256(cipher) };
}
export async function decryptPart(
  cipher: Uint8Array,
  part: PartBinding,
  root: string,
  iv: string,
  cipherHash: string,
) {
  try {
    if (
      cipher.length !== part.byte_length + 16 ||
      (await sha256(cipher)) !== cipherHash ||
      !/^[a-f0-9]{24}$/.test(iv)
    )
      throw new Error("Invalid envelope");
    const bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromHex(iv),
          additionalData: aad(part),
          tagLength: 128,
        },
        await key(root, part),
        new Uint8Array(cipher).buffer,
      ),
    );
    if (
      bytes.length !== part.byte_length ||
      (await sha256(bytes)) !== part.sha256
    )
      throw new Error("Invalid plaintext");
    return bytes;
  } catch (cause) {
    if (cause instanceof ServiceError && cause.status === 503) throw cause;
    throw new ServiceError(
      502,
      "artifact_integrity_failed",
      "Stored artifact integrity could not be verified",
    );
  }
}
