import { createHash } from "node:crypto";
import { sandbox } from "./run.mjs";
import { scanSource } from "./scan.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function task(value) {
  if (
    !value || typeof value !== "object" || !uuid.test(value.id) ||
    !uuid.test(value.tenant_id) || !uuid.test(value.lease_token) ||
    !["scan", "parse"].includes(value.stage) ||
    ![value.processor_id, value.source_hash, value.manifest_hash].every(
      (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    )
  ) throw new Error("Invalid scoped processing task.");
  return value;
}
function committed(value, id) {
  if (
    !value || value.id !== id || typeof value.report_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.report_hash)
  ) {
    throw new Error("Invalid canonical processing receipt.");
  }
  return { id, report_hash: value.report_hash };
}
/** The trusted host owns credentials and canonical leases. Sandboxes receive
 * source bytes only. Port failures/AV outages never become clean verdicts. */
export async function processTicket(
  value,
  ports,
  {
    scan = scanSource,
    parse = sandbox,
    heartbeatMs = 45000,
    signal: shutdown,
  } = {},
) {
  const ticket = task(value), controller = new AbortController();
  const signal = shutdown
    ? AbortSignal.any([shutdown, controller.signal])
    : controller.signal;
  signal.throwIfAborted();
  let pending = null, heartbeatFailure = null, timer;
  const current = async (renew) => {
    const data = await ports.bundle(ticket, renew);
    if (data.id !== ticket.id) {
      throw new Error("Processing bundle scope changed.");
    }
    if (data.done === true) {
      committed(data, ticket.id);
      return data;
    }
    if (
      data.stage !== ticket.stage || data.tenant_id !== ticket.tenant_id ||
      data.processor_id !== ticket.processor_id ||
      data.source_hash !== ticket.source_hash ||
      data.manifest_hash !== ticket.manifest_hash ||
      !Number.isSafeInteger(data.byte_length) || data.byte_length < 22 ||
      data.byte_length > 64 * 1048576
    ) throw new Error("Processing source binding changed.");
    return data;
  };
  const initial = await current(false);
  if (initial.done === true) {
    return { id: ticket.id, report_hash: initial.report_hash };
  }
  if (
    !Number.isSafeInteger(heartbeatMs) || heartbeatMs < 10 ||
    heartbeatMs > 45000
  ) throw new Error("Invalid processing heartbeat policy.");
  timer = setInterval(() => {
    if (pending) return;
    pending = current(true).then((result) => {
      if (result.done) {
        throw new Error("Processing already completed elsewhere.");
      }
    }).catch((cause) => {
      heartbeatFailure = cause;
      controller.abort();
    }).finally(() => {
      pending = null;
    });
  }, heartbeatMs);
  try {
    const source = await ports.source(ticket, initial, signal);
    if (
      !(source instanceof Uint8Array) || source.length !== initial.byte_length
    ) throw new Error("Processing source transport was incomplete.");
    let result;
    if (ticket.stage === "scan") {
      result = await scan(source, ticket.source_hash, {
        signal,
      });
    } else {
      if (hash(source) !== ticket.source_hash) {
        throw new Error(
          "Previously cleared source bytes changed; recovery is required.",
        );
      }
      try {
        result = await parse(source, "candidates", {
          expectedHash: ticket.source_hash,
          imageId: `sha256:${ticket.processor_id}`,
          signal,
        });
      } catch (cause) {
        if (
          typeof cause?.code !== "string" ||
          !/^(zip_|xml_|manifest_|archive_|resource_|dependency_|reference_|graph_|semantic_|diagnostic_)/
            .test(cause.code)
        ) throw cause;
        result = {
          schema_version: "assessment.qti-source-failure.v1",
          source_hash: ticket.source_hash,
          code: cause.code,
          message: String(cause.message).slice(0, 2000),
        };
      }
    }
    if (pending) await pending;
    if (heartbeatFailure || signal.aborted) {
      throw heartbeatFailure ?? new Error("Processing cancelled.");
    }
    const beforeReport = await current(false);
    if (beforeReport.done) {
      return { id: ticket.id, report_hash: beforeReport.report_hash };
    }
    return committed(await ports.report(ticket, result), ticket.id);
  } finally {
    clearInterval(timer);
    controller.abort();
    if (pending) await pending;
  }
}
export function processingClient(
  { apiURL, sourceURL, scannerKey, parserKey, anonKey, fetcher = fetch },
) {
  const api = new URL(apiURL), source = new URL(sourceURL);
  if (
    [api, source].some((url) =>
      url.protocol !== "https:" || url.username || url.password || url.search ||
      url.hash
    ) ||
    [scannerKey, parserKey].some((value) =>
      typeof value !== "string" || value.length < 32
    ) || scannerKey === parserKey
  ) {
    throw new Error(
      "Use independent configured HTTPS processing endpoints and credentials.",
    );
  }
  const key = (stage) => {
    if (!["scan", "parse"].includes(stage)) {
      throw new Error("Unknown processing stage.");
    }
    return stage === "scan" ? scannerKey : parserKey;
  };
  const rpc = async (stage, action, body) => {
    const response = await fetcher(
      new URL(
        `/functions/v1/assessment-cloud/qti/internal/${stage}/${action}`,
        api,
      ),
      {
        method: "POST",
        redirect: "error",
        headers: {
          apikey: anonKey,
          "content-type": "application/json",
          "x-assessment-qti-worker-key": key(stage),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      throw new Error("Canonical processing authority denied this operation.");
    }
    const reader = response.body?.getReader(), chunks = [];
    let total = 0, done = false;
    if (!reader) throw new Error("Missing processing metadata.");
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          done = true;
          break;
        }
        total += next.value.byteLength;
        if (total > 6 * 1048576) {
          throw new Error("Processing metadata exceeds policy.");
        }
        chunks.push(next.value);
      }
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      ).data;
    } finally {
      if (!done) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  return {
    claim: (stage, limit = 2) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("Invalid processing claim limit.");
      }
      return rpc(stage, "claim", { limit });
    },
    bundle: (ticket, renew) =>
      rpc(ticket.stage, renew ? "renew" : "bundle", {
        job_id: ticket.id,
        lease_token: ticket.lease_token,
      }),
    report: (ticket, result) =>
      rpc(ticket.stage, "report", {
        job_id: ticket.id,
        lease_token: ticket.lease_token,
        result,
      }),
    async source(ticket, bundle, signal) {
      const url = new URL(`/internal/qti/${ticket.stage}/${ticket.id}`, source);
      url.searchParams.set("lease_token", ticket.lease_token);
      const response = await fetcher(url, {
        headers: { "x-assessment-qti-worker-key": key(ticket.stage) },
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      });
      if (
        !response.ok ||
        response.headers.get("x-qti-source-hash") !== ticket.source_hash ||
        response.headers.get("x-qti-manifest-hash") !== ticket.manifest_hash
      ) throw new Error("Source transfer denied or rebound.");
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > bundle.byte_length || length > 64 * 1048576) {
          throw new Error("Source transfer exceeds policy.");
        }
        chunks.push(chunk);
      }
      if (length !== bundle.byte_length) {
        throw new Error("Source transfer ended early.");
      }
      return new Uint8Array(Buffer.concat(chunks));
    },
  };
}
