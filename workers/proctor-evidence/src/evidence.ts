import { ServiceError } from "../../../packages/assessment-worker/src/error.ts";
import {
  RECORDING_PART_BYTES,
  RECORDING_SEGMENT_BYTES,
} from "../../../packages/assessment-core/src/recordings.ts";
export interface Binding {
  tenant_id: string;
  recording_id: string;
  sequence: number;
  index: number;
  sha256: string;
  byte_length: number;
}
export interface Envelope extends Binding {
  iv: string;
  key_id: string;
  cipher_sha256: string;
  object_key: string;
  etag: string;
}
export interface Grant extends Binding {
  part_count: number;
  segment_sha256: string;
  segment_bytes: number;
  receipt: Envelope | null;
}
export interface Authority {
  call<T>(action: string, data: Record<string, unknown>): Promise<T>;
}
export interface Storage {
  get(
    key: string,
  ): Promise<
    {
      size: number;
      etag: string;
      metadata: Record<string, string>;
      bytes(): Promise<Uint8Array>;
    } | null
  >;
  put(
    key: string,
    bytes: Uint8Array,
    metadata: Record<string, string>,
  ): Promise<boolean>;
}
export interface Keys {
  active: string;
  roots: Record<string, string>;
}
export const hex = (value: Uint8Array | ArrayBuffer) =>
  Array.from(new Uint8Array(value)).map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const digest = async (bytes: Uint8Array) =>
  hex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer));
const fail = (code: string, message: string): never => {
  throw new ServiceError(502, code, message);
};
function unhex(value: string) {
  return Uint8Array.from(value.match(/../g) ?? [], (v) => parseInt(v, 16));
}
function root(keys: Keys, id: string) {
  const value = Object.hasOwn(keys.roots, id) ? keys.roots[id] : "";
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new ServiceError(
      503,
      "evidence_key_unavailable",
      "The required evidence key is unavailable",
    );
  }
  return value;
}
function aad(part: Binding) {
  return new TextEncoder().encode(
    `schood.proctor.part.v1|${part.tenant_id}|${part.recording_id}|${part.sequence}|${part.index}|${part.sha256}|${part.byte_length}`,
  );
}
async function key(part: Binding, secret: string) {
  const base = await crypto.subtle.importKey(
    "raw",
    unhex(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(part.recording_id),
      info: new TextEncoder().encode(
        `schood.proctor.evidence.key.v1|${part.tenant_id}`,
      ),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export const objectKey = (p: Binding) =>
  `proctor/${p.tenant_id}/${p.recording_id}/${p.sequence}/${p.index}/${p.sha256}`;
export async function encrypt(bytes: Uint8Array, p: Binding, keys: Keys) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: aad(p) },
        await key(p, root(keys, keys.active)),
        new Uint8Array(bytes).buffer,
      ),
    );
  return {
    cipher,
    iv: hex(iv),
    key_id: keys.active,
    cipher_sha256: await digest(cipher),
  };
}
async function stored(
  p: Binding,
  store: Storage,
  keys: Keys,
  expected?: Envelope,
) {
  const object_key = objectKey(p), value = await store.get(object_key);
  if (!value || value.size !== p.byte_length + 16) {
    fail(
      "evidence_integrity_failed",
      "Stored evidence is missing or has an invalid size",
    );
  }
  const { iv, key_id, cipher_sha256 } = value!.metadata;
  if (
    !/^[a-f0-9]{24}$/.test(iv ?? "") ||
    !/^[a-f0-9]{64}$/.test(cipher_sha256 ?? "") ||
    (expected &&
      (expected.object_key !== object_key || expected.etag !== value!.etag ||
        expected.iv !== iv || expected.key_id !== key_id ||
        expected.cipher_sha256 !== cipher_sha256))
  ) {
    fail(
      "evidence_integrity_failed",
      "Evidence envelope differs from the canonical receipt",
    );
  }
  const cipher = await value!.bytes();
  if (await digest(cipher) !== cipher_sha256) {
    fail("evidence_integrity_failed", "Evidence ciphertext hash differs");
  }
  let bytes: Uint8Array;
  const derived = await key(p, root(keys, key_id));
  try {
    bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unhex(iv), additionalData: aad(p) },
        derived,
        new Uint8Array(cipher).buffer,
      ),
    );
  } catch {
    fail("evidence_integrity_failed", "Evidence authentication failed");
  }
  if (bytes!.length !== p.byte_length || await digest(bytes!) !== p.sha256) {
    fail("evidence_integrity_failed", "Evidence plaintext hash differs");
  }
  return {
    bytes: bytes!,
    receipt: { ...p, object_key, etag: value!.etag, iv, key_id, cipher_sha256 },
  };
}
function binding(
  grant: Binding,
  recording: string,
  sequence: number,
  index: number,
): Binding {
  if (
    grant.recording_id !== recording || grant.sequence !== sequence ||
    grant.index !== index || !Number.isSafeInteger(grant.byte_length) ||
    grant.byte_length < 1 || grant.byte_length > RECORDING_PART_BYTES ||
    !/^[a-f0-9]{64}$/.test(grant.sha256)
  ) fail("evidence_grant_invalid", "Canonical evidence grant is invalid");
  return {
    tenant_id: grant.tenant_id,
    recording_id: recording,
    sequence,
    index,
    sha256: grant.sha256,
    byte_length: grant.byte_length,
  };
}
export async function upload(
  bytes: Uint8Array,
  recording: string,
  sequence: number,
  index: number,
  api: Authority,
  store: Storage,
  keys: Keys,
) {
  const grant = await api.call<Grant>("part.authorize", {
      recording_id: recording,
      sequence,
      index,
    }),
    p = binding(grant, recording, sequence, index);
  if (bytes.length !== p.byte_length || await digest(bytes) !== p.sha256) {
    throw new ServiceError(
      409,
      "evidence_part_conflict",
      "Upload bytes do not match the pinned recording part",
    );
  }
  if (grant.receipt) {
    await stored(p, store, keys, grant.receipt);
    return { recording_id: recording, sequence, index, sha256: p.sha256 };
  }
  const e = await encrypt(bytes, p, keys);
  await store.put(objectKey(p), e.cipher, {
    iv: e.iv,
    key_id: e.key_id,
    cipher_sha256: e.cipher_sha256,
  });
  const canonical = await stored(p, store, keys);
  await api.call(
    "part.receipt",
    canonical.receipt as unknown as Record<string, unknown>,
  );
  return { recording_id: recording, sequence, index, sha256: p.sha256 };
}
export async function complete(
  recording: string,
  sequence: number,
  api: Authority,
  store: Storage,
  keys: Keys,
) {
  const first = await api.call<Grant>("part.authorize", {
    recording_id: recording,
    sequence,
    index: 0,
  });
  if (
    !Number.isSafeInteger(first.part_count) || first.part_count < 1 ||
    first.part_count > 8 || !Number.isSafeInteger(first.segment_bytes) ||
    first.segment_bytes < 1 || first.segment_bytes > RECORDING_SEGMENT_BYTES
  ) fail("evidence_grant_invalid", "Recording segment manifest is invalid");
  const bytes = new Uint8Array(first.segment_bytes);
  let offset = 0;
  for (let index = 0; index < first.part_count; index++) {
    const grant = index === 0
      ? first
      : await api.call<Grant>("part.authorize", {
        recording_id: recording,
        sequence,
        index,
      });
    if (
      grant.tenant_id !== first.tenant_id ||
      grant.segment_sha256 !== first.segment_sha256 ||
      grant.segment_bytes !== first.segment_bytes ||
      grant.part_count !== first.part_count
    ) fail("evidence_grant_invalid", "Recording segment scope changed");
    const p = binding(grant, recording, sequence, index);
    if (!grant.receipt) {
      throw new ServiceError(
        409,
        "evidence_parts_missing",
        "Every recording part must be acknowledged before completion",
      );
    }
    const value = await stored(p, store, keys, grant.receipt);
    if (offset + value.bytes.length > bytes.length) {
      fail("evidence_grant_invalid", "Recording segment exceeds its manifest");
    }
    bytes.set(value.bytes, offset);
    offset += value.bytes.length;
  }
  if (offset !== bytes.length || await digest(bytes) !== first.segment_sha256) {
    fail(
      "evidence_integrity_failed",
      "Complete recording segment hash differs",
    );
  }
  return api.call("segment.complete", { recording_id: recording, sequence });
}
export async function read(
  recording: string,
  sequence: number,
  api: Authority,
  store: Storage,
  keys: Keys,
) {
  const grant = await api.call<
    {
      tenant_id: string;
      recording_id: string;
      sequence: number;
      mime: string;
      byte_length: number;
      sha256: string;
      parts: Envelope[];
    }
  >("segment.read", { recording_id: recording, sequence });
  if (
    grant.recording_id !== recording || grant.sequence !== sequence ||
    !Number.isSafeInteger(grant.byte_length) || grant.byte_length < 1 ||
    grant.byte_length > RECORDING_SEGMENT_BYTES ||
    !Array.isArray(grant.parts) ||
    grant.parts.length !== Math.ceil(grant.byte_length / RECORDING_PART_BYTES)
  ) fail("evidence_grant_invalid", "Playback manifest is invalid");
  const bytes = new Uint8Array(grant.byte_length);
  let offset = 0;
  for (let index = 0; index < grant.parts.length; index++) {
    const receipt = grant.parts[index],
      p = binding(receipt, recording, sequence, index);
    if (p.tenant_id !== grant.tenant_id) {
      fail("evidence_grant_invalid", "Playback scope is invalid");
    }
    const value = await stored(p, store, keys, receipt);
    if (offset + value.bytes.length > bytes.length) {
      fail("evidence_grant_invalid", "Playback exceeds its manifest");
    }
    bytes.set(value.bytes, offset);
    offset += value.bytes.length;
  }
  if (offset !== bytes.length || await digest(bytes) !== grant.sha256) {
    fail("evidence_integrity_failed", "Playback segment hash differs");
  }
  return { bytes, mime: grant.mime };
}
