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
import { mediaAnswerAdmission } from "../../../packages/assessment-core/src/media-answer.ts";
export interface MediaAnswerRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    attempt: string,
    item: string,
  ): Promise<unknown>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
export function createMediaAnswerHandler(
  repository: MediaAnswerRepository,
  origins: string[],
  enabled = false,
) {
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
        "X-Request-ID": crypto.randomUUID(),
      };
    if (origin && origins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const reply = (status: number, body: unknown) =>
      Response.json(body, { status, headers });
    try {
      if (origin && !origins.includes(origin)) {
        throw new ContractError("origin_denied", "Origin denied", 403);
      }
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "authorization,apikey,content-type,idempotency-key",
          },
        });
      }
      if (!["GET", "POST"].includes(req.method)) {
        throw new ContractError(
          "method_not_allowed",
          "Method not allowed",
          405,
        );
      }
      const token = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        )?.[1],
        actor = token ? await repository.user(token) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue", 401);
      }
      const url = new URL(req.url),
        tenant = uuid(url.searchParams.get("tenant_id")),
        path = url.pathname.split("/assessment-cloud/answers/")[1] ?? "";
      // Read/recovery does not disappear when admission is disabled during an incident.
      if (req.method === "GET" && path === "uploads") {
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            uuid(url.searchParams.get("attempt_id")),
            uuid(url.searchParams.get("item_version_id")),
          ),
        });
      }
      if (req.method !== "POST" || path !== "commands") {
        throw new ContractError(
          "not_found",
          "Academic answer resource not found",
          404,
        );
      }
      const source = await req.text();
      if (new TextEncoder().encode(source).length > 400000) {
        throw new ContractError(
          "payload_too_large",
          "Answer metadata exceeds 400 KB",
          413,
        );
      }
      let raw: Record<string, unknown>;
      try {
        raw = object(JSON.parse(source));
      } catch {
        throw new ContractError("invalid_json", "Expected a JSON object", 400);
      }
      const key = text(req.headers.get("idempotency-key"), "Command key", 200),
        action = text(raw.action, "Action", 80),
        data = object(raw.data);
      if (key.length < 8) {
        throw new ContractError(
          "invalid_key",
          "Use a stable command key of at least eight characters",
        );
      }
      let input: Record<string, unknown>;
      if (action === "upload.begin") {
        if (!enabled) {
          throw new ContractError(
            "media_answers_unavailable",
            "Academic media answer admission is not enabled",
            503,
          );
        }
        const lease = object(data.lease),
          token = artifactHex(lease.token, "Device token");
        input = {
          ...mediaAnswerAdmission(data),
          lease: {
            device_id: uuid(lease.device_id),
            epoch: artifactInteger(
              lease.epoch,
              "Lease epoch",
              1,
              Number.MAX_SAFE_INTEGER,
            ),
            // Existing coordinator leases hash the canonical JSON string, not
            // raw token bytes. Preserve that exact contract and never accept a
            // caller-supplied token_hash as proof of the device lease.
            token_hash: await hash(token),
          },
        };
      } else if (action === "upload.cancel") {
        input = { artifact_id: uuid(data.artifact_id) };
      } else {throw new ContractError(
          "unknown_media_answer_action",
          "Unknown academic answer command",
        );}
      const result = await repository.command(
        actor,
        tenant,
        key,
        action,
        input,
      );
      if (result && typeof result === "object" && "rejected" in result) {
        throw new ContractError(
          String(result.rejected),
          "Recording continuity must be restored before admitting a new answer",
        );
      }
      return reply(200, { data: result });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      console.error("Academic answer request failed", {
        request_id: headers["X-Request-ID"],
      });
      return reply(500, {
        code: "internal_error",
        error: "The academic answer request could not be completed",
      });
    }
  };
}
