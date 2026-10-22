export class InterchangeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "InterchangeError";
  }
}
export const fail = (code: string, message: string): never => {
  throw new InterchangeError(code, message);
};
export const LIMITS = Object.freeze({
  archiveBytes: 64 * 1048576,
  expandedBytes: 128 * 1048576,
  fileBytes: 16 * 1048576,
  entries: 10000,
  xmlBytes: 4 * 1048576,
  xmlNodes: 100000,
  xmlDepth: 64,
  attributes: 64,
  pathLength: 1024,
});
export const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
/** Bound the actual serialized tree, including repeated references, before
 * allocating a full JSON string. This data-only service never receives getters. */
export function boundedJson(value: unknown, maximum = 32 * 1048576): string {
  let size = 0;
  const add = (amount: number) => {
    size += amount;
    if (size > maximum) {
      fail("output_limit", "The serialized review exceeds its output budget.");
    }
  };
  const string = (value: string) => {
    add(2);
    for (const char of value) {
      const point = char.codePointAt(0)!;
      add(
        char === '"' || char === "\\"
          ? 2
          : point < 32
          ? ("\b\f\n\r\t".includes(char) ? 2 : 6)
          : point < 128
          ? 1
          : point < 2048
          ? 2
          : point >= 0xd800 && point <= 0xdfff
          ? 6
          : point <= 0xffff
          ? 3
          : 4,
      );
    }
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 256) {
      fail(
        "output_limit",
        "The review nesting exceeds its serialization budget.",
      );
    }
    if (value === null) {
      add(4);
      return;
    }
    if (typeof value === "string") {
      string(value);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      if (typeof value === "number" && !Number.isFinite(value)) {
        fail("output_data", "Nonfinite values are not interchange JSON data.");
      }
      add(String(value).length);
      return;
    }
    if (Array.isArray(value)) {
      add(2 + Math.max(0, value.length - 1));
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (value && typeof value === "object") {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        fail("output_data", "Only plain JSON records may leave interchange.");
      }
      const entries = Object.entries(value).filter(([, entry]) =>
        entry !== undefined
      );
      add(2 + Math.max(0, entries.length - 1));
      for (const [key, entry] of entries) {
        string(key);
        add(1);
        visit(entry, depth + 1);
      }
      return;
    }
    fail("output_data", "Only JSON data may leave interchange.");
  };
  visit(value, 0);
  return JSON.stringify(value);
}
/** Portable logical archive path, never a host filesystem destination. */
export function archivePath(value: string) {
  const path = value.normalize("NFC");
  if (
    !path || path.length > LIMITS.pathLength ||
    /^[\/]|[\\\u0000-\u001f\u007f:]/.test(path) ||
    path.split("/").some((part) =>
      !part || part === "." || part === ".." || /[. ]$/.test(part)
    )
  ) fail("archive_path", "Use an unambiguous relative package path.");
  return path;
}
/** Resolve relative package URIs without URL fetching, host access or query semantics. */
export function packageReference(from: string, href: string) {
  archivePath(from);
  if (
    !href || href.length > LIMITS.pathLength * 3 || href.includes("?") ||
    /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)
  ) {
    fail(
      "external_reference",
      "Package references must remain inside the admitted archive.",
    );
  }
  let raw: string;
  try {
    raw = decodeURIComponent(href.split("#")[0]);
  } catch {
    fail(
      "reference_encoding",
      "Package references must have valid UTF-8 URI encoding.",
    );
  }
  if (!raw!) return from;
  if (/[\\\u0000-\u001f\u007f:]/.test(raw!) || raw!.startsWith("/")) {
    fail("external_reference", "Unsafe package reference.");
  }
  const parts = from.split("/").slice(0, -1);
  for (const part of raw!.split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (!parts.length) {
        fail("reference_escape", "A reference leaves its package.");
      }
      parts.pop();
    } else parts.push(part);
  }
  return archivePath(parts.join("/"));
}
