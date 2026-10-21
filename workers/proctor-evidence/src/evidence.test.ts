import {
  type Authority,
  type Binding,
  complete,
  digest,
  type Envelope,
  type Grant,
  type Keys,
  objectKey,
  read,
  type Storage,
  upload,
} from "./evidence.ts";
import { canonicalJson } from "../../../packages/assessment-core/src/mod.ts";
function equal(a: unknown, b: unknown) {
  if (canonicalJson(a) !== canonicalJson(b)) {
    throw new Error("Evidence differs");
  }
}
async function rejects(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (cause) {
    equal((cause as { code: string }).code, code);
    return;
  }
  throw new Error("Expected rejection");
}
const recording = "00000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  keys: Keys = { active: "k1", roots: { k1: "a".repeat(64) } };
async function fixture() {
  const bytes = new Uint8Array([1, 2, 3]),
    sha256 = await digest(bytes),
    p: Binding = {
      tenant_id: tenant,
      recording_id: recording,
      sequence: 1,
      index: 0,
      byte_length: 3,
      sha256,
    };
  const values = new Map<
    string,
    { bytes: Uint8Array; metadata: Record<string, string>; etag: string }
  >();
  let receipt: Envelope | null = null, committed = false, lose = false;
  const store: Storage = {
    async get(key) {
      const v = values.get(key);
      return v
        ? {
          size: v.bytes.length,
          etag: v.etag,
          metadata: v.metadata,
          bytes: async () => v.bytes,
        }
        : null;
    },
    async put(key, bytes, metadata) {
      if (values.has(key)) return false;
      values.set(key, { bytes, metadata, etag: "first-envelope" });
      return true;
    },
  };
  const api: Authority = {
    async call<T>(action: string, data: Record<string, unknown>) {
      if (action === "part.authorize") {
        return {
          ...p,
          part_count: 1,
          segment_sha256: sha256,
          segment_bytes: 3,
          receipt,
        } as T;
      }
      if (action === "part.receipt") {
        receipt = data as unknown as Envelope;
        if (lose) {
          lose = false;
          throw new Error("Lost committed reply");
        }
        return {} as T;
      }
      if (action === "segment.complete") {
        committed = true;
        return { state: "committed" } as T;
      }
      if (action === "segment.read") {
        if (!committed) throw new Error("not ready");
        return {
          tenant_id: tenant,
          recording_id: recording,
          sequence: 1,
          mime: "video/webm",
          byte_length: 3,
          sha256,
          parts: [receipt],
        } as T;
      }
      throw new Error("Unexpected action");
    },
  };
  return {
    bytes,
    p,
    values,
    store,
    api,
    lose: () => lose = true,
    receipt: () => receipt,
  };
}
Deno.test("encrypted evidence keeps one envelope across concurrent and lost-reply retries", async () => {
  const f = await fixture();
  f.lose();
  const results = await Promise.allSettled(
    Array.from(
      { length: 4 },
      () => upload(f.bytes, recording, 1, 0, f.api, f.store, keys),
    ),
  );
  equal(results.filter((r) => r.status === "fulfilled").length, 3);
  equal(f.values.size, 1);
  await upload(f.bytes, recording, 1, 0, f.api, f.store, keys);
  equal(f.values.get(objectKey(f.p))!.bytes.length, 19);
  equal(
    [...f.values.get(objectKey(f.p))!.bytes].slice(0, 3).join(",") === "1,2,3",
    false,
  );
  await complete(recording, 1, f.api, f.store, keys);
  equal([...((await read(recording, 1, f.api, f.store, keys)).bytes)], [
    1,
    2,
    3,
  ]);
});
Deno.test("evidence bytes and missing canonical parts fail before segment completion", async () => {
  const f = await fixture();
  await rejects(
    () =>
      upload(new Uint8Array([9, 2, 3]), recording, 1, 0, f.api, f.store, keys),
    "evidence_part_conflict",
  );
  await rejects(
    () => complete(recording, 1, f.api, f.store, keys),
    "evidence_parts_missing",
  );
  equal(f.values.size, 0);
});
Deno.test("playback verifies ciphertext and receipt before returning plaintext", async () => {
  const f = await fixture();
  await upload(f.bytes, recording, 1, 0, f.api, f.store, keys);
  await complete(recording, 1, f.api, f.store, keys);
  const value = f.values.get(objectKey(f.p))!;
  value.bytes[0] ^= 1;
  await rejects(
    () => read(recording, 1, f.api, f.store, keys),
    "evidence_integrity_failed",
  );
});
Deno.test("evidence keys rotate without rewrapping receipts; missing old keys fail closed", async () => {
  const f = await fixture();
  await upload(f.bytes, recording, 1, 0, f.api, f.store, keys);
  await complete(recording, 1, f.api, f.store, keys);
  equal([
    ...((await read(recording, 1, f.api, f.store, {
      active: "k2",
      roots: { ...keys.roots, k2: "b".repeat(64) },
    })).bytes),
  ], [1, 2, 3]);
  await rejects(
    () =>
      read(recording, 1, f.api, f.store, {
        active: "k2",
        roots: { k2: "b".repeat(64) },
      }),
    "evidence_key_unavailable",
  );
});
Deno.test("AEAD binds tenant, recording, sequence and canonical envelope", async () => {
  for (
    const patch of [{ tenant_id: "20000000-0000-4000-8000-000000000001" }, {
      sequence: 2,
    }, { recording_id: "00000000-0000-4000-8000-000000000002" }]
  ) {
    const f = await fixture();
    await upload(f.bytes, recording, 1, 0, f.api, f.store, keys);
    await complete(recording, 1, f.api, f.store, keys);
    const changed = { ...f.p, ...patch }, value = f.values.get(objectKey(f.p))!;
    f.values.set(objectKey(changed), value);
    const altered: Authority = {
      call: async <T>() => ({
        tenant_id: changed.tenant_id,
        recording_id: changed.recording_id,
        sequence: changed.sequence,
        mime: "video/webm",
        byte_length: 3,
        sha256: f.p.sha256,
        parts: [{ ...f.receipt(), ...changed, object_key: objectKey(changed) }],
      } as T),
    };
    await rejects(
      () =>
        read(changed.recording_id, changed.sequence, altered, f.store, keys),
      "evidence_integrity_failed",
    );
  }
});
Deno.test("whole recording hash catches individually valid but differently pinned segments", async () => {
  const f = await fixture();
  await upload(f.bytes, recording, 1, 0, f.api, f.store, keys);
  const altered: Authority = {
    async call<T>(action: string, data: Record<string, unknown>) {
      const value = await f.api.call<Grant>(action, data);
      return action === "part.authorize"
        ? { ...value, segment_sha256: "f".repeat(64) } as T
        : value as T;
    },
  };
  await rejects(
    () => complete(recording, 1, altered, f.store, keys),
    "evidence_integrity_failed",
  );
});
