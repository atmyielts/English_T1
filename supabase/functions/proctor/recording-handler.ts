import {
  ContractError,
  hash,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  recordingCommand,
  recordingInteger,
  recordingTransport,
} from "../../../packages/assessment-core/src/recordings.ts";
export interface RecordingRepository {
  user(token: string): Promise<string | null>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  read(
    actor: string,
    tenant: string,
    recording: string,
    after: number,
    limit: number,
  ): Promise<unknown>;
  transport(
    actor: string,
    tenant: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  checkpoint(
    actor: string,
    tenant: string,
    recording: string,
    sequence: number,
  ): Promise<unknown>;
  catalog(
    actor: string,
    tenant: string,
    session: string,
    after: string | null,
    limit: number,
  ): Promise<unknown>;
}
async function trusted(supplied: string, expected: string) {
  if (expected.length < 32) return false;
  const a = await hash(supplied), b = await hash(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ContractError("invalid_json", "Provide a JSON object", 400);
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  let fail!: (e: unknown) => void;
  const timeout = new Promise<never>((_, reject) => fail = reject),
    timer = setTimeout(
      () =>
        fail(
          new ContractError(
            "request_timeout",
            "Recording request timed out",
            408,
          ),
        ),
      10000,
    );
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.length;
      if (length > 32768) {
        throw new ContractError(
          "payload_too_large",
          "Recording metadata exceeds 32 KiB",
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return object(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      throw new ContractError("invalid_json", "Provide a JSON object", 400);
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
export function createRecordingHandler(
  repository: RecordingRepository,
  origins: string[],
  options: { enabled: boolean; transportSecret: string },
) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin"),
      request_id = crypto.randomUUID(),
      headers: Record<string, string> = {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": request_id,
        vary: "Origin",
      };
    if (origin && origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
    }
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !origins.includes(origin)) {
        throw new ContractError(
          "origin_denied",
          "This origin is not allowed",
          403,
        );
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
      if (!options.enabled) {
        throw new ContractError(
          "recording_not_enabled",
          "Recording delivery is not enabled in this environment",
          503,
        );
      }
      const token = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = token ? await repository.user(token[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue", 401);
      }
      const url = new URL(req.url),
        prefix = "/proctor/recordings/",
        pos = url.pathname.indexOf(prefix),
        path = pos < 0 ? "" : url.pathname.slice(pos + prefix.length),
        tenant = uuid(url.searchParams.get("tenant_id"));
      if (req.method === "GET" && /^candidate\/[-a-f0-9]{36}$/.test(path)) {
        return reply(200, {
          data: await repository.checkpoint(
            actor,
            tenant,
            uuid(path.slice(10)),
            recordingInteger(
              Number(url.searchParams.get("sequence") ?? 0),
              "Sequence",
              0,
              100000,
            ),
          ),
        });
      }
      if (req.method === "GET" && /^sessions\/[-a-f0-9]{36}$/.test(path)) {
        return reply(200, {
          data: await repository.catalog(
            actor,
            tenant,
            uuid(path.slice(9)),
            url.searchParams.has("after")
              ? uuid(url.searchParams.get("after"))
              : null,
            recordingInteger(
              Number(url.searchParams.get("limit") ?? 100),
              "Limit",
              1,
              100,
            ),
          ),
        });
      }
      if (req.method === "GET" && /^[-a-f0-9]{36}$/.test(path)) {
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            uuid(path),
            recordingInteger(
              Number(url.searchParams.get("after") ?? 0),
              "After",
              0,
              100000,
            ),
            recordingInteger(
              Number(url.searchParams.get("limit") ?? 100),
              "Limit",
              1,
              100,
            ),
          ),
        });
      }
      if (req.method !== "POST") {
        throw new ContractError(
          "method_not_allowed",
          "Method not allowed",
          405,
        );
      }
      if (!["commands", "transport"].includes(path)) {
        throw new ContractError("not_found", "Recording route not found", 404);
      }
      if (
        path === "transport" &&
        !(await trusted(
          req.headers.get("x-proctor-evidence-key") ?? "",
          options.transportSecret,
        ))
      ) {
        throw new ContractError(
          "evidence_transport_required",
          "A trusted evidence transport is required",
          403,
        );
      }
      const raw = await body(req), action = text(raw.action, "Action", 80);
      if (path === "transport") {
        return reply(200, {
          data: await repository.transport(
            actor,
            tenant,
            action,
            recordingTransport(action, raw.data),
          ),
        });
      }
      const key = text(
        req.headers.get("idempotency-key"),
        "Idempotency-Key",
        200,
      );
      if (key.length < 8) {
        throw new ContractError(
          "invalid_key",
          "Use an idempotency key of at least eight characters",
          422,
        );
      }
      return reply(200, {
        data: await repository.command(
          actor,
          tenant,
          key,
          action,
          recordingCommand(action, raw.data),
        ),
      });
    } catch (cause) {
      const status = cause instanceof ContractError ? cause.status : 500;
      return reply(status, {
        code: cause instanceof ContractError ? cause.code : "recording_error",
        error: status === 500
          ? "The recording service could not complete this request"
          : cause instanceof Error
          ? cause.message
          : "Recording request failed",
        request_id,
      });
    }
  };
}
