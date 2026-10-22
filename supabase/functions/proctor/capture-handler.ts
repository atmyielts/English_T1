import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import { captureCommand } from "../../../packages/assessment-core/src/capture-launch.ts";
export interface CaptureRepository {
  user(token: string): Promise<string | null>;
  read(actor: string, tenant: string, session: string): Promise<unknown>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
export function createCaptureHandler(
  repository: CaptureRepository,
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
    const reply = (status: number, value: unknown) =>
      Response.json(value, { status, headers });
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
        path = url.pathname.split("/proctor/capture/")[1] ?? "";
      if (req.method === "GET") {
        const match = /^sessions\/([^/]+)$/.exec(path);
        if (!match) {
          throw new ContractError(
            "not_found",
            "Capture resource not found",
            404,
          );
        }
        return reply(200, {
          data: await repository.read(actor, tenant, uuid(match[1])),
        });
      }
      if (path !== "commands") {
        throw new ContractError("not_found", "Capture resource not found", 404);
      }
      const key = text(req.headers.get("idempotency-key"), "Request key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Request key is too short.");
      }
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 8192) {
        throw new ContractError(
          "payload_too_large",
          "Capture preparation request exceeds 8 KB.",
          413,
        );
      }
      let body: Record<string, unknown>;
      try {
        body = object(JSON.parse(raw));
      } catch {
        throw new ContractError(
          "invalid_json",
          "Expected a capture preparation object.",
          400,
        );
      }
      const action = text(body.action, "Action", 60),
        data = captureCommand(action, body.data);
      if (action === "capture.open" && !enabled) {
        throw new ContractError(
          "capture_launch_unavailable",
          "Capture preparation is not enabled. Contact your institution.",
          503,
        );
      }
      return reply(200, {
        data: await repository.command(actor, tenant, key, action, data),
      });
    } catch (cause) {
      return cause instanceof ContractError
        ? reply(cause.status, { code: cause.code, error: cause.message })
        : reply(500, {
          code: "internal_error",
          error: "The capture preparation request failed.",
        });
    }
  };
}
