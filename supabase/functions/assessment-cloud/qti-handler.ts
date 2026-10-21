import {
  ContractError,
  hash,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  artifactHex,
  artifactInteger,
} from "../../../packages/assessment-core/src/artifacts.ts";
import {
  qtiPartReceipt,
  qtiProcessingReport,
  qtiScanReport,
  qtiSourceUpload,
} from "../../../packages/assessment-core/src/qti.ts";
export interface QtiRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    id: string | null,
    after: number,
    limit: number,
  ): Promise<unknown>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  transport(
    actor: string,
    tenant: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  claim(stage: string, processor: string, limit: number): Promise<unknown>;
  bundle(
    job: string,
    stage: string,
    token: string,
    processor: string,
    renew: boolean,
  ): Promise<unknown>;
  report(
    job: string,
    stage: string,
    token: string,
    processor: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
export interface QtiConfiguration {
  enabled: boolean;
  transportKey: string;
  scannerKey: string;
  parserKey: string;
  scannerId: string;
  processorId: string;
}
async function matches(actual: string, expected: string) {
  if (expected.length < 32) return false;
  const a = await hash(actual), b = await hash(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ContractError(
      "invalid_qti_body",
      "Provide a QTI request object.",
      400,
    );
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 6 * 1048576) {
        await reader.cancel();
        throw new ContractError(
          "qti_body_limit",
          "QTI metadata exceeds its bounded request size.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new ContractError(
      "invalid_qti_body",
      "Expected a valid UTF-8 JSON object.",
      400,
    );
  }
}
const page = (
  value: string | null,
  fallback: number,
  min = 0,
  max = 2147483647,
) => {
  const result = value === null ? fallback : Number(value);
  return artifactInteger(result, "QTI page", min, max);
};
export function createQtiHandler(
  repository: QtiRepository,
  origins: string[],
  config: QtiConfiguration,
) {
  const configured =
    new Set([config.transportKey, config.scannerKey, config.parserKey]).size ===
      3 &&
    [config.transportKey, config.scannerKey, config.parserKey].every((key) =>
      key.length >= 32
    ) && !!config.scannerId.trim() && /^[a-f0-9]{64}$/.test(config.processorId);
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "content-type": "application/json",
        "cache-control": "no-store",
        vary: "Origin",
        "x-request-id": crypto.randomUUID(),
      };
    if (origin && origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
    }
    const reply = (status: number, value: unknown) =>
      Response.json(value, { status, headers });
    try {
      if (origin && !origins.includes(origin)) {
        throw new ContractError("origin_denied", "Origin denied.", 403);
      }
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers":
              "authorization,apikey,content-type,idempotency-key",
          },
        });
      }
      if (!config.enabled) {
        throw new ContractError(
          "qti_disabled",
          "QTI processing is not enabled for this environment.",
          503,
        );
      }
      if (!configured) {
        throw new ContractError(
          "qti_unavailable",
          "QTI processing identities and distinct service keys must be configured.",
          503,
        );
      }
      const url = new URL(req.url),
        prefix = "/assessment-cloud/qti/",
        at = url.pathname.indexOf(prefix),
        path = at < 0 ? "" : url.pathname.slice(at + prefix.length);
      if (at < 0) {
        throw new ContractError("not_found", "QTI resource not found.", 404);
      }
      if (path.startsWith("internal/")) {
        if (origin) {
          throw new ContractError(
            "worker_origin_denied",
            "Processing ports do not accept browser-origin requests.",
            403,
          );
        }
        if (req.method !== "POST") {
          throw new ContractError(
            "method_not_allowed",
            "Method not allowed.",
            405,
          );
        }
        const route = /^internal\/(scan|parse)\/(claim|bundle|renew|report)$/
          .exec(path);
        if (!route) {
          throw new ContractError(
            "not_found",
            "QTI processing port not found.",
            404,
          );
        }
        const [, stage, action] = route,
          expected = stage === "scan" ? config.scannerKey : config.parserKey;
        if (
          !await matches(
            req.headers.get("x-assessment-qti-worker-key") ?? "",
            expected,
          )
        ) {
          throw new ContractError(
            "qti_worker_required",
            "A distinct trusted processing worker is required.",
            403,
          );
        }
        const raw = await body(req);
        if (action === "claim") {
          return reply(200, {
            data: await repository.claim(
              stage,
              config.processorId,
              artifactInteger(raw.limit ?? 10, "Claim limit", 1, 20),
            ),
          });
        }
        const job = uuid(raw.job_id), token = uuid(raw.lease_token);
        if (action === "bundle" || action === "renew") {
          return reply(200, {
            data: await repository.bundle(
              job,
              stage,
              token,
              config.processorId,
              action === "renew",
            ),
          });
        }
        const report = stage === "scan"
          ? { ...qtiScanReport(raw.result), scanner_id: config.scannerId }
          : await qtiProcessingReport(raw.result);
        return reply(200, {
          data: await repository.report(
            job,
            stage,
            token,
            config.processorId,
            report,
          ),
        });
      }
      if (!["GET", "POST"].includes(req.method)) {
        throw new ContractError(
          "method_not_allowed",
          "Method not allowed.",
          405,
        );
      }
      const token = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        )?.[1],
        actor = token ? await repository.user(token) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue.", 401);
      }
      const tenant = uuid(url.searchParams.get("tenant_id"));
      if (req.method === "GET") {
        if (path !== "jobs" && !/^jobs\/[^/]+$/.test(path)) {
          throw new ContractError("not_found", "QTI resource not found.", 404);
        }
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            path === "jobs" ? null : uuid(path.split("/")[1]),
            page(url.searchParams.get("after"), 0),
            page(url.searchParams.get("limit"), 50, 1, 100),
          ),
        });
      }
      if (path === "transport") {
        if (
          !await matches(
            req.headers.get("x-assessment-qti-transport-key") ?? "",
            config.transportKey,
          )
        ) {
          throw new ContractError(
            "qti_transport_required",
            "A trusted QTI byte transport is required.",
            403,
          );
        }
        const raw = await body(req),
          action = text(raw.action, "Transport action", 40),
          data = object(raw.data);
        const input = action === "part.receipt"
          ? qtiPartReceipt(data)
          : action === "part.authorize"
          ? {
            job_id: uuid(data.job_id),
            index: artifactInteger(data.index, "Part index", 0, 63),
          }
          : action === "complete"
          ? { job_id: uuid(data.job_id) }
          : null;
        if (!input) {
          throw new ContractError(
            "invalid_qti_transport",
            "Unknown QTI transport action.",
          );
        }
        return reply(200, {
          data: await repository.transport(actor, tenant, action, input),
        });
      }
      if (path !== "commands") {
        throw new ContractError("not_found", "QTI resource not found.", 404);
      }
      const key = text(req.headers.get("idempotency-key"), "Request key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Request key is too short.");
      }
      const raw = await body(req),
        action = text(raw.action, "Action", 40),
        data = object(raw.data);
      let input: Record<string, unknown>;
      if (action === "source.begin") {
        input = { ...qtiSourceUpload(data), processor_id: config.processorId };
      } else if (["cancel", "retry", "adopt"].includes(action)) {
        input = {
          id: uuid(data.id),
          expected_revision: artifactInteger(
            data.expected_revision,
            "Expected revision",
            1,
            2147483647,
          ),
          reason: text(data.reason, "Review or recovery reason", 2000),
        };
        if (action === "adopt") {
          if (data.acknowledged !== true) {
            throw new ContractError(
              "qti_acknowledgement_required",
              "Explicitly acknowledge source, licensing, diagnostics and proposed content before adoption.",
            );
          }
          input.review_hash = artifactHex(data.review_hash);
          input.acknowledged = true;
        }
      } else throw new ContractError("unknown_action", "Unknown QTI command.");
      return reply(200, {
        data: await repository.command(actor, tenant, key, action, input),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      return reply(500, {
        code: "internal_error",
        error: "The private QTI request could not be completed.",
      });
    }
  };
}
