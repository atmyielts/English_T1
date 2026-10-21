import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
export interface AppealRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    kind: string,
    id: string | null,
    after: string | null,
    limit: number,
  ): Promise<unknown>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
export function createAppealHandler(
  repository: AppealRepository,
  allowedOrigins: string[],
) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(), origin = req.headers.get("origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-ID": requestId,
      Vary: "Origin",
    };
    if (origin && allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const reply = (status: number, data: Record<string, unknown>) =>
      new Response(JSON.stringify({ ...data, request_id: requestId }), {
        status,
        headers,
      });
    try {
      if (origin && !allowedOrigins.includes(origin)) {
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
        ),
        actor = token ? await repository.user(token[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue", 401);
      }
      const url = new URL(req.url),
        prefix = "/assessment-cloud/appeals",
        offset = url.pathname.indexOf(prefix);
      if (offset < 0) {
        throw new ContractError("not_found", "Appeals route not found", 404);
      }
      const path = url.pathname.slice(offset + prefix.length).replace(
          /^\//,
          "",
        ),
        tenant = uuid(url.searchParams.get("tenant_id"));
      if (req.method === "GET") {
        const match = /^([^/]+)$/.exec(path),
          kind = path === "candidate"
            ? "candidate"
            : path === "queue"
            ? "queue"
            : match
            ? "detail"
            : null;
        if (!kind) {
          throw new ContractError(
            "not_found",
            "Appeals resource not found",
            404,
          );
        }
        const limit = Number(url.searchParams.get("limit") ?? 50),
          after = url.searchParams.get("after");
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          throw new ContractError(
            "invalid_page_limit",
            "Use a page size from 1 to 100",
          );
        }
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            kind,
            kind === "detail" ? uuid(path) : null,
            after ? uuid(after) : null,
            limit,
          ),
        });
      }
      if (path !== "commands") {
        throw new ContractError("not_found", "Appeals route not found", 404);
      }
      const key = text(req.headers.get("idempotency-key"), "Command key", 200);
      if (key.length < 8) {
        throw new ContractError(
          "invalid_key",
          "Use a command key of at least eight characters",
        );
      }
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 24000) {
        throw new ContractError(
          "payload_too_large",
          "Appeals requests must not exceed 24 KB",
          413,
        );
      }
      let payload: Record<string, unknown>;
      try {
        payload = object(JSON.parse(raw));
      } catch {
        throw new ContractError("invalid_json", "Expected a JSON object", 400);
      }
      const data = object(payload.data),
        action = text(payload.action, "Action", 80);
      let input: Record<string, unknown>;
      if (action === "appeal.submit") {
        if (
          !["scoring", "procedure", "accessibility"].includes(
            String(data.category),
          )
        ) {
          throw new ContractError(
            "invalid_appeal",
            "Choose an appeal category",
          );
        }
        input = {
          attempt_id: uuid(data.attempt_id),
          score_revision_id: uuid(data.score_revision_id),
          category: data.category,
          reason: text(data.reason, "Appeal reason", 5000),
        };
      } else if (action === "appeal.withdraw" || action === "appeal.decide") {
        if (data.expected_revision !== 1) {
          throw new ContractError(
            "invalid_appeal_revision",
            "Use the current open appeal revision",
          );
        }
        input = {
          appeal_id: uuid(data.appeal_id),
          expected_revision: 1,
          explanation: text(data.explanation, "Explanation", 5000),
        };
        if (action === "appeal.decide") {
          if (!["upheld", "regrade_requested"].includes(String(data.outcome))) {
            throw new ContractError(
              "invalid_appeal_outcome",
              "Choose uphold result or request regrading",
            );
          }
          input.outcome = data.outcome;
        }
      } else {throw new ContractError(
          "unknown_appeal_action",
          "Unknown appeals action",
        );}
      return reply(200, {
        data: await repository.command(actor, tenant, key, action, input),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      console.error("assessment appeals request failed", {
        request_id: requestId,
      });
      return reply(500, {
        code: "internal_error",
        error: "The appeals service could not complete this request",
      });
    }
  };
}
