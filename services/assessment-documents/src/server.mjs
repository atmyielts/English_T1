import { createServer } from "node:http";
import { Worker } from "node:worker_threads";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function createDocumentServer(
  { secret, clock = Date.now, maxWorkers = 2, deadlineMs = 10000 } = {},
) {
  if (
    typeof secret !== "string" || secret.length < 32 || maxWorkers < 1 ||
    maxWorkers > 4
  ) throw Error("Document service requires private transport configuration.");
  let running = 0;
  const nonces = new Map(), workers = new Set();
  const sign = (value) =>
      createHmac("sha256", secret).update(value).digest("hex"),
    match = (left, right) =>
      typeof left === "string" && /^[a-f0-9]{64}$/.test(left) &&
      timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    const fail = (status, code) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ code }));
    };
    if (req.method !== "POST" || req.url !== "/render") {
      fail(404, "not_found");
      return;
    }
    const time = req.headers["x-document-time"],
      nonce = req.headers["x-document-nonce"];
    if (
      typeof time !== "string" || !/^\d{13}$/.test(time) ||
      Math.abs(clock() - Number(time)) > 30000 || typeof nonce !== "string" ||
      !/^[a-f0-9-]{36}$/.test(nonce)
    ) {
      fail(403, "document_transport_required");
      return;
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32000) {
          fail(413, "document_request_too_large");
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      fail(400, "invalid_request");
      return;
    }
    const bytes = Buffer.concat(chunks);
    if (
      !match(
        req.headers["x-document-signature"],
        sign(`request.v1\n${time}\n${nonce}\n${digest(bytes)}`),
      )
    ) {
      fail(403, "document_transport_required");
      return;
    }
    for (const [key, expires] of nonces) {
      if (expires < clock()) nonces.delete(key);
    }
    if (nonces.has(nonce)) {
      fail(409, "document_transport_replay");
      return;
    }
    if (nonces.size >= 4096 || running >= maxWorkers) {
      fail(503, "document_capacity_unavailable");
      return;
    }
    nonces.set(nonce, clock() + 60000);
    let data;
    try {
      data = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail(422, "invalid_document");
      return;
    }
    running++;
    const worker = new Worker(new URL("./render-worker.mjs", import.meta.url), {
      workerData: data,
      execArgv: ["--experimental-transform-types"],
      env: { NODE_ENV: "production" },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    workers.add(worker);
    let done = false;
    const timer = setTimeout(() => finish(503), deadlineMs);
    const finish = (status, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      running--;
      workers.delete(worker);
      void worker.terminate();
      if (res.destroyed) return;
      if (status !== 200) {
        fail(status, "document_render_unavailable");
        return;
      }
      const length = value.bytes.byteLength,
        signature = sign(
          `response.v1\n${nonce}\n${value.renderer_id}\n${value.sha256}\n${value.payload_hash}\n${value.locale}\n${length}`,
        );
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": length,
        "x-document-sha256": value.sha256,
        "x-document-renderer": value.renderer_id,
        "x-document-payload": value.payload_hash,
        "x-document-signature": signature,
      });
      res.end(Buffer.from(value.bytes));
    };
    worker.on(
      "message",
      (value) => value.error ? finish(422) : finish(200, value),
    );
    worker.on("error", () => finish(503));
    worker.on("exit", () => {
      if (!done) finish(503);
    });
    res.once("close", () => {
      if (!res.writableEnded) finish(499);
    });
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.maxConnections = 8;
  server.keepAliveTimeout = 1000;
  return {
    server,
    async close() {
      server.closeAllConnections();
      await Promise.all([...workers].map((worker) => worker.terminate()));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const service = createDocumentServer({
    secret: process.env.ASSESSMENT_DOCUMENT_SECRET,
  });
  service.server.listen(Number(process.env.PORT ?? 8789), "127.0.0.1");
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => void service.close());
  }
}
