import { Inflate } from "fflate";
import { archivePath, fail, LIMITS, sha256 } from "./policy.ts";
export interface ArchiveEntry {
  path: string;
  original_path: string;
  bytes: number;
  compressed_bytes: number;
  crc32: number;
  method: 0 | 8;
  offset: number;
  start: number;
  end: number;
}
export interface Archive {
  source_hash: string;
  expanded_bytes: number;
  entries: (ArchiveEntry & { sha256: string })[];
  files: Map<string, Uint8Array<ArrayBuffer>>;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
export function crc32(bytes: Uint8Array, initial = 0) {
  let value = (initial ^ 0xffffffff) >>> 0;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function directory(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    size = bytes.byteLength;
  const u16 = (at: number) => {
    if (at < 0 || at + 2 > size) {
      fail("zip_truncated", "Truncated ZIP metadata.");
    }
    return view.getUint16(at, true);
  };
  const u32 = (at: number) => {
    if (at < 0 || at + 4 > size) {
      fail("zip_truncated", "Truncated ZIP metadata.");
    }
    return view.getUint32(at, true);
  };
  if (size < 22 || size > LIMITS.archiveBytes || u32(0) !== 0x04034b50) {
    fail("zip_format", "Choose a bounded non-self-extracting ZIP package.");
  }
  const endings: number[] = [];
  for (let at = size - 22; at >= Math.max(0, size - 65557); at--) {
    if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === size) {
      endings.push(at);
    }
  }
  if (endings.length !== 1) {
    fail("zip_directory", "ZIP end-directory is missing or ambiguous.");
  }
  const end = endings[0],
    count = u16(end + 10),
    centralSize = u32(end + 12),
    central = u32(end + 16);
  if (
    u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count === 65535 ||
    central === 0xffffffff || centralSize === 0xffffffff
  ) {
    fail(
      "zip_variant",
      "Split, encrypted or ZIP64 packages are not admitted by this bounded archive profile.",
    );
  }
  if (!count || count > LIMITS.entries || central + centralSize !== end) {
    fail("zip_directory", "Invalid or over-limit ZIP directory.");
  }
  const result: ArchiveEntry[] = [], names = new Set<string>();
  let at = central, total = 0;
  for (let index = 0; index < count; index++) {
    if (u32(at) !== 0x02014b50) {
      fail("zip_directory", "Invalid ZIP central entry.");
    }
    const flags = u16(at + 8),
      method = u16(at + 10),
      crc = u32(at + 16),
      compressed = u32(at + 20),
      expanded = u32(at + 24),
      nameLength = u16(at + 28),
      extraLength = u16(at + 30),
      commentLength = u16(at + 32),
      offset = u32(at + 42),
      recordEnd = at + 46 + nameLength + extraLength + commentLength;
    if (
      recordEnd > end || !nameLength || nameLength > LIMITS.pathLength * 4 ||
      u16(at + 34) || offset === 0xffffffff || compressed === 0xffffffff ||
      expanded === 0xffffffff
    ) fail("zip_entry", "Invalid or unsupported ZIP entry metadata.");
    if (
      (flags & ~0x080e) || ((flags & 6) && method !== 8) ||
      (method !== 0 && method !== 8)
    ) {
      fail(
        "zip_compression",
        "Only unencrypted stored/deflated package files are supported.",
      );
    }
    const unixMode = u32(at + 38) >>> 16;
    if ((unixMode & 0xf000) === 0xa000) {
      fail("zip_link", "Symbolic links are not package files.");
    }
    let original: string;
    try {
      original = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(at + 46, at + 46 + nameLength),
      );
    } catch {
      fail("zip_encoding", "Package entry names must be valid UTF-8.");
    }
    const isDirectory = original!.endsWith("/"),
      path = archivePath(isDirectory ? original!.slice(0, -1) : original!),
      collision = path.toLowerCase();
    if (names.has(collision)) {
      fail(
        "zip_duplicate",
        "Duplicate or case/Unicode-colliding package paths are not allowed.",
      );
    }
    names.add(collision);
    if (
      expanded > LIMITS.fileBytes || total + expanded > LIMITS.expandedBytes ||
      (isDirectory && (expanded || crc))
    ) {
      fail(
        "zip_expansion_limit",
        "Package file or expanded-size limit exceeded.",
      );
    }
    total += expanded;
    if (
      offset >= central || u32(offset) !== 0x04034b50 ||
      u16(offset + 6) !== flags || u16(offset + 8) !== method ||
      u16(offset + 26) !== nameLength
    ) fail("zip_local_metadata", "ZIP local and central headers disagree.");
    const localExtra = u16(offset + 28),
      start = offset + 30 + nameLength + localExtra,
      dataEnd = start + compressed;
    if (
      dataEnd > central ||
      !bytes.subarray(offset + 30, offset + 30 + nameLength).every((byte, i) =>
        byte === bytes[at + 46 + i]
      )
    ) fail("zip_local_metadata", "ZIP local path or data bounds disagree.");
    if (
      !(flags & 8) &&
      (u32(offset + 14) !== crc || u32(offset + 18) !== compressed ||
        u32(offset + 22) !== expanded)
    ) fail("zip_local_metadata", "ZIP sizes or CRC disagree between headers.");
    let entryEnd = dataEnd;
    if (flags & 8) {
      const descriptor = u32(dataEnd) === 0x08074b50 ? dataEnd + 4 : dataEnd;
      if (
        descriptor + 12 > central || u32(descriptor) !== crc ||
        u32(descriptor + 4) !== compressed || u32(descriptor + 8) !== expanded
      ) {
        fail(
          "zip_descriptor",
          "ZIP data descriptor disagrees with its directory.",
        );
      }
      entryEnd = descriptor + 12;
    }
    if (!isDirectory) {
      result.push({
        path,
        original_path: original!,
        bytes: expanded,
        compressed_bytes: compressed,
        crc32: crc,
        method: method as 0 | 8,
        offset,
        start,
        end: entryEnd,
      });
    } else {result.push({
        path: path + "/",
        original_path: original!,
        bytes: 0,
        compressed_bytes: compressed,
        crc32: 0,
        method: method as 0 | 8,
        offset,
        start,
        end: entryEnd,
      });}
    at = recordEnd;
  }
  if (at !== end) {
    fail("zip_directory", "ZIP directory length does not match its entries.");
  }
  let next = 0;
  for (const entry of [...result].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== next) {
      fail(
        "zip_overlap",
        "Overlapping, hidden or non-contiguous ZIP records are not admitted.",
      );
    }
    next = entry.end;
  }
  if (next !== central) {
    fail("zip_overlap", "Unlisted ZIP records or trailing payload detected.");
  }
  return result;
}
/** Every entry is decoded under actual byte limits, CRC checked, and hashed.
 * No filesystem extraction, callback URL, credential or publication side effect. */
export async function unpackArchive(
  input: Uint8Array<ArrayBuffer>,
): Promise<Archive> {
  if (input.byteLength > LIMITS.archiveBytes) {
    fail("archive_limit", "Compressed package size limit exceeded.");
  }
  const bytes = new Uint8Array(input),
    entries = directory(bytes),
    files = new Map<string, Uint8Array<ArrayBuffer>>(),
    inventory: Archive["entries"] = [];
  let total = 0;
  for (const entry of entries) {
    let data: Uint8Array<ArrayBuffer>;
    if (entry.method === 0) {
      if (entry.bytes !== entry.compressed_bytes) {
        fail("zip_size", "Stored ZIP sizes differ.");
      }
      data = bytes.slice(entry.start, entry.start + entry.compressed_bytes);
    } else {
      if (!entry.compressed_bytes) {
        fail(
          "zip_decode",
          "An empty deflate stream is not a valid package entry.",
        );
      }
      let length = 0;
      const chunks: Uint8Array[] = [],
        inflater = new Inflate((chunk) => {
          total += chunk.length;
          length += chunk.length;
          if (total > LIMITS.expandedBytes || length > entry.bytes) {
            fail(
              "zip_expansion_limit",
              "Actual ZIP output exceeds its admitted bounds.",
            );
          }
          chunks.push(chunk);
        });
      try {
        for (let offset = 0; offset < entry.compressed_bytes; offset += 512) {
          inflater.push(
            bytes.subarray(
              entry.start + offset,
              entry.start + Math.min(offset + 512, entry.compressed_bytes),
            ),
            offset + 512 >= entry.compressed_bytes,
          );
        }
      } catch (cause) {
        if (cause instanceof Error && cause.name === "InterchangeError") {
          throw cause;
        }
        fail("zip_decode", "Invalid compressed package data.");
      }
      data = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
    }
    if (entry.method === 0) total += data.length;
    if (data.length !== entry.bytes || crc32(data) !== entry.crc32) {
      fail(
        "zip_integrity",
        "Decompressed package size or CRC does not match its pinned directory.",
      );
    }
    if (total > LIMITS.expandedBytes) {
      fail(
        "zip_expansion_limit",
        "Actual expanded package size limit exceeded.",
      );
    }
    if (!entry.path.endsWith("/")) {
      files.set(entry.path, data);
      inventory.push({ ...entry, sha256: await sha256(data) });
    }
  }
  return {
    source_hash: await sha256(bytes),
    expanded_bytes: total,
    entries: inventory,
    files,
  };
}
