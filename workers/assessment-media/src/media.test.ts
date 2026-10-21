import {
  artifactDisposition,
  type ArtifactStorage,
  artifactStream,
  byteRange,
  readPart,
  type Receipt,
  type StoredPart,
  uploadPart,
} from "./media.ts";
import { encryptPart, sha256 } from "./crypto.ts";
import { objectKey } from "./media.ts";
Deno.test("streamed blind PDFs have a server-owned generic filename while native players stay inline", () => {
  if (
    artifactDisposition("file", true) !==
      'attachment; filename="assessment-answer.pdf"'
  ) throw new Error("Blind filename differs");
  if (
    artifactDisposition("file") !==
      'attachment; filename="assessment-document.pdf"'
  ) throw new Error("Document filename differs");
  for (const kind of ["audio", "video", "image"]) {
    if (artifactDisposition(kind, true) !== "inline") {
      throw new Error("Native playback became an attachment");
    }
  }
});
const tenant = "10000000-0000-4000-8000-000000000001",
  artifact = "00000000-0000-4000-8000-000000000001",
  bytes = new TextEncoder().encode("Private image fixture"),
  keys = { active: "k2", roots: { k1: "1".repeat(64), k2: "2".repeat(64) } };
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Media result differs");
  }
}
async function rejects(work: () => unknown) {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error("Expected media rejection");
}
function fixture() {
  const objects = new Map<string, StoredPart>();
  let receipt: Receipt | null = null,
    writes = 0,
    calls = 0;
  const storage: ArtifactStorage = {
    async get(key) {
      return objects.get(key) ?? null;
    },
    async put(key, cipher, metadata) {
      if (objects.has(key)) return false;
      writes++;
      objects.set(key, {
        size: cipher.length,
        etag: "immutable-etag",
        metadata,
        bytes: () => Promise.resolve(cipher.slice()),
      });
      return true;
    },
  };
  return {
    storage,
    objects,
    get writes() {
      return writes;
    },
    get calls() {
      return calls;
    },
    get receipt() {
      return receipt;
    },
    authority: {
      async call<T>(action: string, data: Record<string, unknown>): Promise<T> {
        calls++;
        if (action === "chunk.authorize") {
          return {
            tenant_id: tenant,
            artifact_id: artifact,
            index: 0,
            sha256: await sha256(bytes),
            byte_length: bytes.length,
            receipt,
          } as T;
        }
        if (action === "chunk.receipt") {
          receipt ??= data as unknown as Receipt;
          return receipt as T;
        }
        throw new Error("Unexpected authority action");
      },
    },
  };
}
Deno.test(
  "concurrent media retries keep one conditional envelope and return canonical identity",
  async () => {
    const f = fixture(),
      results = await Promise.all([
        uploadPart(bytes, artifact, 0, f.authority, f.storage, keys),
        uploadPart(bytes, artifact, 0, f.authority, f.storage, keys),
      ]);
    equal(results[0], results[1]);
    equal(f.writes, 1);
    equal(
      new TextDecoder().decode(await readPart(f.receipt!, f.storage, keys)),
      new TextDecoder().decode(bytes),
    );
  },
);
Deno.test(
  "media rejects wrong source bytes before storage and rechecks current authority on receipt replay",
  async () => {
    const f = fixture();
    await rejects(() =>
      uploadPart(
        new Uint8Array([1]),
        artifact,
        0,
        f.authority,
        f.storage,
        keys,
      )
    );
    equal(f.writes, 0);
    await uploadPart(bytes, artifact, 0, f.authority, f.storage, keys);
    const count = f.calls;
    await uploadPart(bytes, artifact, 0, f.authority, f.storage, keys);
    equal(f.calls, count + 1);
    equal(f.writes, 1);
    await rejects(() =>
      uploadPart(
        bytes,
        artifact,
        0,
        { call: () => Promise.reject(new Error("Revoked")) },
        f.storage,
        keys,
      )
    );
  },
);
Deno.test(
  "range parsing supports open and suffix requests but rejects multiple and impossible ranges",
  async () => {
    equal(byteRange("bytes=2-4", 10), { start: 2, end: 4, partial: true });
    equal(byteRange("bytes=-3", 10), { start: 7, end: 9, partial: true });
    equal(byteRange("bytes=3-", 10), { start: 3, end: 9, partial: true });
    for (
      const header of [
        "bytes=1-0",
        "bytes=20-",
        "bytes=-0",
        "bytes=1-2,4-5",
        "bytes=9007199254740992-",
      ]
    ) {
      await rejects(() => byteRange(header, 10));
    }
  },
);
Deno.test(
  "artifact range streaming decrypts authenticated bytes and rejects altered storage receipts",
  async () => {
    const f = fixture();
    await uploadPart(bytes, artifact, 0, f.authority, f.storage, keys);
    const response = new Response(
      artifactStream([f.receipt!], { start: 2, end: 6 }, f.storage, keys),
    );
    equal(
      new TextDecoder().decode(await response.arrayBuffer()),
      new TextDecoder().decode(bytes.slice(2, 7)),
    );
    const object = f.objects.get(f.receipt!.object_key)!;
    object.metadata = { ...object.metadata, iv: "f".repeat(24) };
    await rejects(() => readPart(f.receipt!, f.storage, keys));
  },
);
Deno.test(
  "range streams cross encrypted part boundaries without reading unrelated parts",
  async () => {
    const f = fixture(),
      first = new Uint8Array(1048576).fill(7),
      last = new Uint8Array([8, 9, 10]),
      receipts: Receipt[] = [];
    for (const [index, content] of [first, last].entries()) {
      const part = {
          tenant_id: tenant,
          artifact_id: artifact,
          index,
          sha256: await sha256(content),
          byte_length: content.length,
        },
        encrypted = await encryptPart(content, part, keys.roots.k1),
        key = objectKey(part);
      await f.storage.put(key, encrypted.cipher, {
        iv: encrypted.iv,
        key_id: "k1",
        cipher_sha256: encrypted.cipher_sha256,
      });
      receipts.push({
        ...part,
        iv: encrypted.iv,
        key_id: "k1",
        cipher_sha256: encrypted.cipher_sha256,
        object_key: key,
        etag: "immutable-etag",
      });
    }
    const cross = new Response(
      artifactStream(receipts, { start: 1048574, end: 1048578 }, f.storage, {
        ...keys,
        active: "k2",
      }),
    );
    equal([...new Uint8Array(await cross.arrayBuffer())], [7, 7, 8, 9, 10]);
    const requested: string[] = [];
    const limited = {
      ...f.storage,
      async get(key: string) {
        requested.push(key);
        return f.storage.get(key);
      },
    };
    const suffix = new Response(
      artifactStream(receipts, { start: 1048577, end: 1048578 }, limited, keys),
    );
    equal([...new Uint8Array(await suffix.arrayBuffer())], [9, 10]);
    equal(requested, [receipts[1].object_key]);
  },
);
