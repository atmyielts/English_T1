import { ARTIFACT_CHUNK_BYTES } from "../../../packages/assessment-core/src/artifacts.ts";
import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
// Cross-origin download attributes cannot supply the server's filename. Keep
// blind academic PDFs generic at the streaming response, with no user filename.
export function artifactDisposition(kind: string, marking = false) {
  return kind === "file"
    ? `attachment; filename="${
      marking ? "assessment-answer" : "assessment-document"
    }.pdf"`
    : "inline";
}
import {
  decryptPart,
  encryptPart,
  type PartBinding,
  sha256,
} from "./crypto.ts";
export interface Receipt extends PartBinding {
  iv: string;
  key_id: string;
  cipher_sha256: string;
  object_key: string;
  etag: string;
}
export interface StoredPart {
  size: number;
  etag: string;
  metadata: Record<string, string>;
  bytes(): Promise<Uint8Array>;
}
export interface ArtifactStorage {
  get(key: string): Promise<StoredPart | null>;
  put(
    key: string,
    cipher: Uint8Array,
    metadata: Record<string, string>,
  ): Promise<boolean>;
}
export interface ArtifactAuthority {
  call<T>(action: string, data: Record<string, unknown>): Promise<T>;
}
export interface MediaKeys {
  active: string;
  roots: Record<string, string>;
}
const root = (keys: MediaKeys, id: string) => {
  const value = keys.roots[id];
  if (!Object.hasOwn(keys.roots, id) || !value) {
    throw new ServiceError(
      503,
      "encryption_key_unavailable",
      "The required artifact encryption key is unavailable",
    );
  }
  return value;
};
export function objectKey(part: PartBinding) {
  return `assessment/${part.tenant_id}/${part.artifact_id}/${part.index}/${part.sha256}`;
}
async function existing(
  storage: ArtifactStorage,
  keys: MediaKeys,
  part: PartBinding,
  expected?: Receipt,
): Promise<Receipt> {
  const key = objectKey(part),
    stored = await storage.get(key);
  if (!stored) {
    throw new ServiceError(
      503,
      "stored_part_missing",
      "The stored artifact part is missing",
    );
  }
  if (stored.size !== part.byte_length + 16) {
    throw new ServiceError(
      502,
      "artifact_integrity_failed",
      "Stored artifact size is invalid",
    );
  }
  const { iv, key_id, cipher_sha256 } = stored.metadata;
  if (
    expected &&
    (expected.iv !== iv ||
      expected.key_id !== key_id ||
      expected.cipher_sha256 !== cipher_sha256 ||
      expected.etag !== stored.etag ||
      expected.object_key !== key)
  ) {
    throw new ServiceError(
      502,
      "artifact_integrity_failed",
      "Stored artifact envelope differs from its canonical receipt",
    );
  }
  await decryptPart(
    await stored.bytes(),
    part,
    root(keys, key_id),
    iv,
    cipher_sha256,
  );
  return {
    ...part,
    iv,
    key_id,
    cipher_sha256,
    object_key: key,
    etag: stored.etag,
  };
}
export async function uploadPart(
  bytes: Uint8Array,
  artifact: string,
  index: number,
  authority: ArtifactAuthority,
  storage: ArtifactStorage,
  keys: MediaKeys,
) {
  const grant = await authority.call<PartBinding & { receipt: Receipt | null }>(
    "chunk.authorize",
    { artifact_id: artifact, index },
  );
  if (
    bytes.length !== grant.byte_length ||
    bytes.length > ARTIFACT_CHUNK_BYTES ||
    (await sha256(bytes)) !== grant.sha256
  ) {
    throw new ServiceError(
      409,
      "part_manifest_conflict",
      "These bytes do not match the pinned upload manifest",
    );
  }
  const part: PartBinding = {
    tenant_id: grant.tenant_id,
    artifact_id: grant.artifact_id,
    index: grant.index,
    sha256: grant.sha256,
    byte_length: grant.byte_length,
  };
  if (grant.receipt) {
    await existing(storage, keys, part, grant.receipt);
    return {
      artifact_id: artifact,
      index,
      sha256: part.sha256,
      byte_length: part.byte_length,
    };
  }
  const encrypted = await encryptPart(bytes, part, root(keys, keys.active));
  await storage.put(objectKey(part), encrypted.cipher, {
    iv: encrypted.iv,
    key_id: keys.active,
    cipher_sha256: encrypted.cipher_sha256,
  });
  // Conditional writes ensure concurrent retries cannot replace the first envelope.
  const receipt = await existing(storage, keys, part);
  await authority.call(
    "chunk.receipt",
    receipt as unknown as Record<string, unknown>,
  );
  return {
    artifact_id: artifact,
    index,
    sha256: part.sha256,
    byte_length: part.byte_length,
  };
}
export function byteRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) {
    throw new ServiceError(416, "invalid_range", "Use one valid byte range");
  }
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) {
      throw new ServiceError(416, "invalid_range", "Invalid suffix range");
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    throw new ServiceError(
      416,
      "invalid_range",
      "Range is outside this artifact",
    );
  }
  return { start, end, partial: true };
}
export async function readPart(
  part: Receipt,
  storage: ArtifactStorage,
  keys: MediaKeys,
) {
  const stored = await storage.get(part.object_key);
  if (
    !stored ||
    part.object_key !== objectKey(part) ||
    stored.size !== part.byte_length + 16 ||
    stored.etag !== part.etag ||
    stored.metadata.iv !== part.iv ||
    stored.metadata.key_id !== part.key_id ||
    stored.metadata.cipher_sha256 !== part.cipher_sha256
  ) {
    throw new ServiceError(
      502,
      "artifact_integrity_failed",
      "Stored artifact differs from its canonical receipt",
    );
  }
  return decryptPart(
    await stored.bytes(),
    part,
    root(keys, part.key_id),
    part.iv,
    part.cipher_sha256,
  );
}
export function artifactStream(
  parts: Receipt[],
  range: { start: number; end: number },
  storage: ArtifactStorage,
  keys: MediaKeys,
  prefetched?: { index: number; bytes: Uint8Array },
) {
  let index = Math.floor(range.start / ARTIFACT_CHUNK_BYTES),
    cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (cancelled) return;
        const part = parts[index];
        if (!part || part.index !== index) {
          throw new ServiceError(
            502,
            "artifact_manifest_invalid",
            "The artifact manifest is incomplete",
          );
        }
        const bytes = prefetched?.index === index
          ? prefetched.bytes
          : await readPart(part, storage, keys);
        prefetched = undefined;
        if (cancelled) return;
        const base = index * ARTIFACT_CHUNK_BYTES,
          start = Math.max(0, range.start - base),
          end = Math.min(bytes.length, range.end - base + 1);
        controller.enqueue(bytes.slice(start, end));
        index++;
        if (index * ARTIFACT_CHUNK_BYTES > range.end) controller.close();
      } catch (cause) {
        controller.error(cause);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}
/** Fail a corrupt first part before any HTTP success headers or plaintext. */
export async function verifiedArtifactStream(
  parts: Receipt[],
  range: { start: number; end: number },
  storage: ArtifactStorage,
  keys: MediaKeys,
) {
  const index = Math.floor(range.start / ARTIFACT_CHUNK_BYTES),
    part = parts[index];
  if (!part || part.index !== index) {
    throw new ServiceError(
      502,
      "artifact_manifest_invalid",
      "The artifact manifest is incomplete",
    );
  }
  const bytes = await readPart(part, storage, keys);
  return artifactStream(parts, range, storage, keys, { index, bytes });
}
