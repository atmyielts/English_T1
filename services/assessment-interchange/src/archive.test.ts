import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, Zip, ZipDeflate, zipSync } from "fflate";
import { crc32, unpackArchive } from "./archive.ts";
import {
  archivePath,
  InterchangeError,
  LIMITS,
  packageReference,
  sha256,
} from "./policy.ts";

const bytes = (value: string) => new Uint8Array(strToU8(value));
const zip = (files: Record<string, string>, level: 0 | 6 = 6) =>
  new Uint8Array(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, value]) => [path, bytes(value)]),
      ),
      { level },
    ),
  );
const view = (data: Uint8Array) =>
  new DataView(data.buffer, data.byteOffset, data.byteLength);
const central = (data: Uint8Array) =>
  view(data).getUint32(data.length - 6, true);
function reject(code: string | string[]) {
  return (cause: unknown) =>
    cause instanceof InterchangeError &&
    (Array.isArray(code) ? code.includes(cause.code) : cause.code === code);
}

test("stored and deflated packages retain exact bytes, CRC and source/file digests", async () => {
  for (const level of [0, 6] as const) {
    const source = zip({
        "imsmanifest.xml": "<manifest/>",
        "questions/é.xml": "Ўзбек Русский English",
      }, level),
      archive = await unpackArchive(source);
    assert.equal(archive.files.size, 2);
    assert.equal(archive.source_hash, await sha256(source));
    for (const entry of archive.entries) {
      assert.equal(entry.sha256, await sha256(archive.files.get(entry.path)!));
      assert.equal(entry.crc32, crc32(archive.files.get(entry.path)!));
    }
    assert.equal(
      new TextDecoder().decode(archive.files.get("questions/é.xml")),
      "Ўзбек Русский English",
    );
  }
  assert.equal(crc32(bytes("123456789")), 0xcbf43926);
  assert.equal(crc32(bytes("56789"), crc32(bytes("1234"))), 0xcbf43926);
});
test("valid deflated directory records are checked but never exposed as files", async () => {
  const archive = await unpackArchive(
    zip({ "questions/": "", "questions/item.xml": "<item/>" }),
  );
  assert.deepEqual([...archive.files.keys()], ["questions/item.xml"]);
});
test("streaming ZIP data descriptors are validated and decoded", async () => {
  const chunks: Uint8Array[] = [];
  const writer = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  const entry = new ZipDeflate("item.xml");
  writer.add(entry);
  entry.push(bytes("<item>"), false);
  entry.push(bytes("text</item>"), true);
  writer.end();
  const source = new Uint8Array(Buffer.concat(chunks));
  const archive = await unpackArchive(source);
  assert.equal(
    new TextDecoder().decode(archive.files.get("item.xml")),
    "<item>text</item>",
  );
  const changed = source.slice(),
    cd = central(changed),
    dataEnd = view(changed).getUint32(cd + 42, true) + 30 +
      view(changed).getUint16(26, true) + view(changed).getUint16(28, true) +
      view(changed).getUint32(cd + 20, true);
  changed[dataEnd + 4] ^= 1;
  await assert.rejects(unpackArchive(changed), reject("zip_descriptor"));
});
test("portable paths and URI resolution do not allow filesystem or network escape", () => {
  for (
    const path of [
      "../a",
      "a/../b",
      "/a",
      "a\\b",
      "C:a",
      "a//b",
      "a/.",
      "a.",
      "a ",
      "a\0b",
    ]
  ) assert.throws(() => archivePath(path), reject("archive_path"));
  assert.equal(archivePath("e\u0301.xml"), "é.xml");
  assert.equal(
    packageReference("items/a.xml", "../media/photo%20one.png#target"),
    "media/photo one.png",
  );
  assert.equal(packageReference("items/a.xml", "#target"), "items/a.xml");
  for (
    const href of [
      "../../escape",
      "%2e%2e/%2e%2e/escape",
      "https://example.com/a",
      "//example.com/a",
      "%2fetc/passwd",
      "a?b",
      "file%3afoo",
      "%zz",
      "a%5cb",
    ]
  ) assert.throws(() => packageReference("items/a.xml", href));
  assert.throws(() => packageReference("../invalid.xml", "a"));
});
test("duplicate case and normalized Unicode names cannot alias", async () => {
  for (const paths of [["A.xml", "a.xml"], ["é.xml", "e\u0301.xml"]]) {
    await assert.rejects(
      unpackArchive(zip(Object.fromEntries(paths.map((path) => [path, "x"])))),
      reject("zip_duplicate"),
    );
  }
});
test("unsafe package entry names are rejected before decoding", async () => {
  for (const path of ["../escape", "/absolute", "a\\b", "a//b", "C:file"]) {
    await assert.rejects(
      unpackArchive(zip({ [path]: "x" })),
      reject("archive_path"),
    );
  }
});
test("encryption, symlinks, ZIP64 and unsupported compression are rejected", async () => {
  for (
    const [offset, value, width, code] of [
      [8, 1, 2, "zip_compression"],
      [38, 0xa0000000, 4, "zip_link"],
      [20, 0xffffffff, 4, "zip_entry"],
      [10, 99, 2, "zip_compression"],
    ] as const
  ) {
    const data = zip({ "item.xml": "x" }),
      at = central(data) + offset,
      v = view(data);
    if (width === 2) v.setUint16(at, value, true);
    else v.setUint32(at, value, true);
    await assert.rejects(unpackArchive(data), reject(code));
  }
});
test("local/central disagreement, CRC mismatch, trailing bytes and truncation reject", async () => {
  const source = zip({ "item.xml": "safe" }, 0), header = source.slice();
  header[30] ^= 1;
  await assert.rejects(unpackArchive(header), reject("zip_local_metadata"));
  const corrupt = source.slice();
  corrupt[30 + "item.xml".length] ^= 1;
  await assert.rejects(unpackArchive(corrupt), reject("zip_integrity"));
  await assert.rejects(
    unpackArchive(new Uint8Array([...source, 0])),
    reject("zip_directory"),
  );
  await assert.rejects(
    unpackArchive(source.slice(0, -1)),
    reject("zip_directory"),
  );
  await assert.rejects(unpackArchive(new Uint8Array(22)), reject("zip_format"));
});
test("declared and actual expansion limits are both enforced", async () => {
  const declared = zip({ "item.xml": "short" }), cd = central(declared);
  view(declared).setUint32(cd + 24, LIMITS.fileBytes + 1, true);
  await assert.rejects(unpackArchive(declared), reject("zip_expansion_limit"));
  const actual = zip({ "item.xml": "a".repeat(100000) }),
    actualCd = central(actual);
  view(actual).setUint32(22, 1, true);
  view(actual).setUint32(actualCd + 24, 1, true);
  await assert.rejects(unpackArchive(actual), reject("zip_expansion_limit"));
});
