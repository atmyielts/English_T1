import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { processingClient, processTicket } from "./process.mjs";
const source = new Uint8Array(Buffer.from("Exact bounded QTI test source")),
  sha = createHash("sha256").update(source).digest("hex");
const ticket = {
  id: "10000000-0000-4000-8000-000000000001",
  tenant_id: "20000000-0000-4000-8000-000000000001",
  lease_token: "30000000-0000-4000-8000-000000000001",
  source_hash: sha,
  manifest_hash: "a".repeat(64),
  processor_id: "b".repeat(64),
  stage: "parse",
};
function fixture() {
  const calls = [];
  return {
    calls,
    ports: {
      bundle: async () => ({ ...ticket, byte_length: source.length }),
      source: async () => {
        calls.push("source");
        return source;
      },
      report: async (_task, result) => {
        calls.push(result);
        return { id: ticket.id, report_hash: "c".repeat(64) };
      },
    },
  };
}
test("committed stages recover without fetching or parsing source again", async () => {
  const { calls, ports } = fixture();
  ports.bundle = async () => ({
    id: ticket.id,
    done: true,
    report_hash: "d".repeat(64),
  });
  assert.equal(
    (await processTicket(ticket, ports)).report_hash,
    "d".repeat(64),
  );
  assert.deepEqual(calls, []);
});
test("known invalid source semantics are explicit failures, never fabricated questions", async () => {
  const { calls, ports } = fixture();
  await processTicket(ticket, ports, {
    parse: () =>
      Promise.reject(
        Object.assign(new Error("DTD forbidden"), { code: "xml_dtd" }),
      ),
  });
  assert.equal(calls[1].schema_version, "assessment.qti-source-failure.v1");
  assert.equal(calls[1].source_hash, sha);
});
test("operational parsing failures and changed source bytes produce no report", async () => {
  const { calls, ports } = fixture();
  await assert.rejects(
    processTicket(ticket, ports, {
      parse: () => Promise.reject(new Error("Runtime unavailable")),
    }),
  );
  assert.equal(calls.length, 1);
  ports.source = async () => new Uint8Array(source.length);
  await assert.rejects(processTicket(ticket, ports), /changed/);
  assert.equal(calls.length, 1);
});
test("renewal failure cancels ongoing work and cannot commit a clean or parsed result", async () => {
  const { calls, ports } = fixture();
  ports.bundle = async (_ticket, renew) => {
    if (renew) throw new Error("Lease revoked");
    return { ...ticket, stage: "scan", byte_length: source.length };
  };
  await assert.rejects(
    processTicket({ ...ticket, stage: "scan" }, ports, {
      heartbeatMs: 10,
      scan: (_bytes, _hash, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("Cancelled")),
            { once: true },
          )
        ),
    }),
  );
  assert.equal(calls.length, 1);
});
test("malformed canonical receipts never acknowledge a processing result", async () => {
  const { ports } = fixture();
  ports.report = async () => ({ id: ticket.id, report_hash: "not-a-digest" });
  await assert.rejects(
    processTicket(ticket, ports, { parse: async () => ({}) }),
    /receipt/,
  );
  ports.bundle = async () => ({ id: ticket.id, done: true });
  await assert.rejects(processTicket(ticket, ports), /receipt/);
});
test("processing client rejects unknown stages, unbounded claims and oversized streamed metadata", async () => {
  let reads = 0, cancelled = false, calls = 0;
  const client = processingClient({
    apiURL: "https://api.test",
    sourceURL: "https://source.test",
    scannerKey: "s".repeat(40),
    parserKey: "p".repeat(40),
    anonKey: "test",
    fetcher: async () => {
      calls++;
      return new Response(
        new ReadableStream({
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(1048576));
          },
          cancel() {
            cancelled = true;
          },
        }, { highWaterMark: 0 }),
      );
    },
  });
  await assert.rejects(async () => client.claim("unknown"), /stage/);
  assert.throws(() => client.claim("scan", 21), /limit/);
  assert.equal(calls, 0);
  await assert.rejects(client.claim("scan"), /exceeds/);
  assert.equal(cancelled, true);
  assert.equal(reads, 7);
});
test("processor shutdown reaches the running sandbox and never commits after interruption", async () => {
  const { calls, ports } = fixture(), controller = new AbortController();
  await assert.rejects(
    processTicket(ticket, ports, {
      signal: controller.signal,
      parse: async (_source, _operation, { signal }) => {
        controller.abort();
        signal.throwIfAborted();
      },
    }),
  );
  assert.deepEqual(calls, ["source"]);
});
