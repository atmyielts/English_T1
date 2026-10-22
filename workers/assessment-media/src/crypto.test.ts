import {
  decryptPart,
  encryptPart,
  sha256,
  type PartBinding,
} from "./crypto.ts";
const root = "a".repeat(64),
  bytes = new TextEncoder().encode("Private institution artifact"),
  part: PartBinding = {
    tenant_id: "tenant-a",
    artifact_id: "artifact-a",
    index: 0,
    sha256: await sha256(bytes),
    byte_length: bytes.length,
  };
async function rejects(work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error("Expected integrity rejection");
}
Deno.test(
  "artifact AEAD roundtrips with randomized nonces and no plaintext storage",
  async () => {
    const a = await encryptPart(bytes, part, root),
      b = await encryptPart(bytes, part, root);
    if (
      a.iv === b.iv ||
      new TextDecoder().decode(a.cipher).includes("Private institution")
    )
      throw new Error("Encryption did not isolate plaintext");
    const result = await decryptPart(
      a.cipher,
      part,
      root,
      a.iv,
      a.cipher_sha256,
    );
    if (new TextDecoder().decode(result) !== new TextDecoder().decode(bytes))
      throw new Error("Decryption differs");
  },
);
Deno.test(
  "artifact encryption binds tenant, artifact, index, digest, size and key",
  async () => {
    const encrypted = await encryptPart(bytes, part, root);
    for (const changed of [
      { tenant_id: "foreign" },
      { artifact_id: "foreign" },
      { index: 1 },
      { sha256: "b".repeat(64) },
      { byte_length: 1 },
    ])
      await rejects(() =>
        decryptPart(
          encrypted.cipher,
          { ...part, ...changed },
          root,
          encrypted.iv,
          encrypted.cipher_sha256,
        ),
      );
    await rejects(() =>
      decryptPart(
        encrypted.cipher,
        part,
        "b".repeat(64),
        encrypted.iv,
        encrypted.cipher_sha256,
      ),
    );
  },
);
Deno.test(
  "cipher tampering fails both checksum verification and AEAD authentication",
  async () => {
    const encrypted = await encryptPart(bytes, part, root);
    encrypted.cipher[0] ^= 1;
    await rejects(() =>
      decryptPart(
        encrypted.cipher,
        part,
        root,
        encrypted.iv,
        encrypted.cipher_sha256,
      ),
    );
    await rejects(async () =>
      decryptPart(
        encrypted.cipher,
        part,
        root,
        encrypted.iv,
        await sha256(encrypted.cipher),
      ),
    );
  },
);
