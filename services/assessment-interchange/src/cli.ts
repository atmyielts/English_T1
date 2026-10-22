import { inspectPackage } from "./package.ts";
import { reviewPackage } from "./model.ts";
import { buildChoicePackage, draftCandidates } from "./choice-profile.ts";
import {
  boundedJson,
  fail,
  InterchangeError,
  LIMITS,
  sha256,
} from "./policy.ts";
const MAX_OUTPUT = 32 * 1048576;
try {
  const [operation, expectedHash, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !["inspect", "review", "candidates", "export-choices"].includes(
      operation,
    ) || !/^[a-f0-9]{64}$/.test(expectedHash ?? "")
  ) {
    fail(
      "request",
      "Specify one operation and the exact lowercase SHA-256 of stdin.",
    );
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > LIMITS.archiveBytes) {
      fail("input_limit", "Input exceeds the bounded package size.");
    }
    chunks.push(chunk);
  }
  const source = new Uint8Array(Buffer.concat(chunks));
  if (await sha256(source) !== expectedHash) {
    fail("source_hash", "Source bytes do not match their pinned receipt.");
  }
  let result: unknown;
  if (operation === "inspect") result = await inspectPackage(source);
  else if (operation === "review") result = await reviewPackage(source);
  else if (operation === "candidates") {
    result = draftCandidates(await reviewPackage(source));
  } else {
    if (source.length > 4 * 1048576) {
      fail("export_input_limit", "Export snapshot exceeds its bounded size.");
    }
    let request: unknown;
    try {
      request = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(source),
      );
    } catch {
      fail("export_request", "A valid UTF-8 JSON export snapshot is required.");
    }
    if (
      !request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).length !== 2 || !("schema_version" in request) ||
      request.schema_version !== "assessment.qti-export-input.v1" ||
      !("rows" in request) || !Array.isArray(request.rows)
    ) fail("export_request", "Use an explicit versioned export snapshot.");
    const built = await buildChoicePackage(
      (request as { rows: { id: string; item: unknown; key: unknown }[] }).rows,
    );
    result = {
      schema_version: "assessment.qti-built-package.v1",
      input_hash: expectedHash,
      package_hash: built.sha256,
      item_count: built.item_count,
      source_rows: built.source_rows,
      zip_base64: Buffer.from(built.bytes).toString("base64"),
      publishable: false,
    };
  }
  const output = boundedJson({ ok: true, data: result }, MAX_OUTPUT);
  process.stdout.write(output + "\n");
} catch (cause) {
  // Package text and parser internals never appear in operational error logs.
  const known = cause instanceof InterchangeError;
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: {
        code: known ? cause.code : "interchange_failed",
        message: known
          ? cause.message
          : "Interchange failed without admitting or publishing content.",
      },
    }) + "\n",
  );
  process.exitCode = 1;
}
