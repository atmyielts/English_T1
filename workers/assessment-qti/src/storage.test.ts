import {
  readSourcePart,
  sha256,
  type SourceBucket,
  sourceKey,
  type SourcePart,
  type SourceReceipt,
  writeSourcePart,
} from "./storage.ts";
const tenant = "10000000-0000-4000-8000-000000000001",
  job = "20000000-0000-4000-8000-000000000001",
  keys = { active: "k1", roots: { k1: "a".repeat(64), k2: "b".repeat(64) } };
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Values differ");
};
async function rejected(fn: () => Promise<unknown>, status?: number) {
  try {
    await fn();
  } catch (cause) {
    if (status && (cause as { status?: number }).status !== status) throw cause;
    return;
  }
  throw new Error("Expected denial");
}
function memory() {
  const rows = new Map<
    string,
    { data: Uint8Array; etag: string; metadata: Record<string, string> }
  >();
  let puts = 0;
  const bucket: SourceBucket = {
    async get(key) {
      const row = rows.get(key);
      return row
        ? {
          size: row.data.length,
          etag: row.etag,
          customMetadata: row.metadata,
          arrayBuffer: async () => new Uint8Array(row.data).buffer,
        }
        : null;
    },
    async put(key, data, options) {
      puts++;
      if (rows.has(key)) return null;
      rows.set(key, {
        data: new Uint8Array(data),
        etag: "etag-" + puts,
        metadata: options.customMetadata,
      });
      return true;
    },
  };
  return { bucket, rows, puts: () => puts };
}
const source = async () => {
  const bytes = new TextEncoder().encode("Exact QTI opaque source part");
  const part: SourcePart = {
    tenant_id: tenant,
    job_id: job,
    index: 0,
    sha256: await sha256(bytes),
    byte_length: bytes.length,
  };
  return { bytes, part };
};
Deno.test("QTI source is encrypted and exact committed receipt recovery preserves the first envelope", async () => {
  const { bytes, part } = await source(), store = memory();
  let receipt: SourceReceipt | null = null;
  await rejected(() =>
    writeSourcePart(bytes, part, null, store.bucket, keys, (value) => {
      receipt = value;
      return Promise.reject(new Error("Committed reply lost"));
    })
  );
  const original = store.rows.get(sourceKey(part))!;
  equal(original.data.length, bytes.length + 16);
  equal(await sha256(original.data) === part.sha256, false);
  await writeSourcePart(
    bytes,
    part,
    receipt,
    store.bucket,
    keys,
    () => Promise.resolve(),
  );
  equal(store.puts(), 1);
  equal(
    new TextDecoder().decode(
      await readSourcePart(receipt!, store.bucket, keys),
    ),
    new TextDecoder().decode(bytes),
  );
});
Deno.test("orphaned stored bytes recover without overwrite and rotated keyrings read the original version", async () => {
  const { bytes, part } = await source(), store = memory();
  let receipt: SourceReceipt | null = null;
  await rejected(() =>
    writeSourcePart(
      bytes,
      part,
      null,
      store.bucket,
      keys,
      () => Promise.reject(new Error("No canonical commit")),
    )
  );
  const first = store.rows.get(sourceKey(part))!;
  await writeSourcePart(bytes, part, null, store.bucket, {
    ...keys,
    active: "k2",
  }, (value) => {
    receipt = value;
    return Promise.resolve();
  });
  equal(store.rows.get(sourceKey(part))!.etag, first.etag);
  equal(receipt!.key_id, "k1");
  equal(
    await sha256(await readSourcePart(receipt!, store.bucket, keys)),
    part.sha256,
  );
  await rejected(
    () =>
      readSourcePart(receipt!, store.bucket, {
        active: "k2",
        roots: { k2: keys.roots.k2 },
      }),
    503,
  );
});
Deno.test("wrong bytes, changed ciphertext and forged metadata cannot become canonical source receipts", async () => {
  const { bytes, part } = await source(), store = memory();
  let receipt!: SourceReceipt;
  await rejected(
    () =>
      writeSourcePart(
        new Uint8Array(bytes.length),
        part,
        null,
        store.bucket,
        keys,
        () => Promise.resolve(),
      ),
    409,
  );
  equal(store.puts(), 0);
  await writeSourcePart(bytes, part, null, store.bucket, keys, (value) => {
    receipt = value;
    return Promise.resolve();
  });
  const stored = store.rows.get(sourceKey(part))!;
  stored.etag = "changed";
  stored.metadata.etag = receipt.etag;
  await rejected(() => readSourcePart(receipt, store.bucket, keys), 502);
  stored.etag = receipt.etag;
  stored.data[0] ^= 1;
  await rejected(() => readSourcePart(receipt, store.bucket, keys), 502);
});
Deno.test("cryptographic binding fences source reuse and a revoked final receipt never acknowledges success", async () => {
  const { bytes, part } = await source(), store = memory();
  let receipt!: SourceReceipt;
  await writeSourcePart(bytes, part, null, store.bucket, keys, (value) => {
    receipt = value;
    return Promise.resolve();
  });
  const other = { ...receipt, job_id: "20000000-0000-4000-8000-000000000002" };
  other.object_key = sourceKey(other);
  store.rows.set(other.object_key, store.rows.get(sourceKey(part))!);
  await rejected(() => readSourcePart(other, store.bucket, keys), 502);
  await rejected(
    () =>
      writeSourcePart(
        bytes,
        part,
        receipt,
        store.bucket,
        keys,
        () =>
          Promise.reject(Object.assign(new Error("Revoked"), { status: 403 })),
      ),
    403,
  );
});
