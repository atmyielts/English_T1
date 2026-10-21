import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  workloadAssignment,
  type WorkloadFilters,
  workloadFilters,
} from "../../../packages/assessment-core/src/proctor-workload.ts";
export interface WorkloadRepository {
  user(token: string): Promise<string | null>;
  read(actor: string, tenant: string, data: WorkloadFilters): Promise<unknown>;
  staff(
    actor: string,
    tenant: string,
    role: string,
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
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ContractError("invalid_json", "Expected a JSON object.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        throw new ContractError(
          "payload_too_large",
          "Assignment requests must not exceed 16 KB.",
          413,
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new ContractError("invalid_json", "Expected a JSON object.", 400);
  }
}
export function createWorkloadHandler(
  repository: WorkloadRepository,
  origins: string[],
) {
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "content-type": "application/json",
        "cache-control": "no-store",
        "vary": "Origin",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers":
          "authorization,apikey,content-type,idempotency-key",
      };
    if (origin && origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
    }
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !origins.includes(origin)) {
        throw new ContractError("origin_denied", "Origin denied.", 403);
      }
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      const bearer = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = bearer ? await repository.user(bearer[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue.", 401);
      }
      const url = new URL(req.url),
        route = url.pathname.split("/proctor/workload/")[1] ?? "",
        tenant = uuid(url.searchParams.get("tenant_id"));
      if (req.method === "GET" && route === "sessions") {
        let after: unknown = null;
        try {
          if (url.searchParams.has("after")) {
            after = JSON.parse(url.searchParams.get("after")!);
          }
        } catch {
          throw new ContractError(
            "invalid_workload_cursor",
            "Refresh to restart paging.",
          );
        }
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            workloadFilters({
              state: url.searchParams.get("state") ?? "all",
              assignment: url.searchParams.get("assignment") ?? "all",
              window_id: url.searchParams.get("window_id"),
              candidate_id: url.searchParams.get("candidate_id"),
              limit: Number(url.searchParams.get("limit") ?? 25),
              after,
            }),
          ),
        });
      }
      if (req.method === "GET" && route === "staff") {
        const role = url.searchParams.get("role") ?? "observer",
          limit = Number(url.searchParams.get("limit") ?? 25);
        if (
          !["observer", "reviewer"].includes(role) ||
          !Number.isInteger(limit) || limit < 1 || limit > 50
        ) {
          throw new ContractError(
            "invalid_workload_filter",
            "Choose a role and 1–50 staff per page.",
          );
        }
        return reply(200, {
          data: await repository.staff(
            actor,
            tenant,
            role,
            url.searchParams.get("after")
              ? uuid(url.searchParams.get("after"))
              : null,
            limit,
          ),
        });
      }
      if (req.method === "POST" && route === "commands") {
        const input = await body(req),
          action = text(input.action, "Action", 40),
          key = text(req.headers.get("idempotency-key"), "Request key", 200);
        if (key.length < 8) {
          throw new ContractError(
            "invalid_request_key",
            "Use a stable request key.",
          );
        }
        return reply(200, {
          data: await repository.command(
            actor,
            tenant,
            key,
            action,
            workloadAssignment(action, input.data),
          ),
        });
      }
      throw new ContractError("not_found", "Workload resource not found.", 404);
    } catch (cause) {
      return cause instanceof ContractError
        ? reply(cause.status, { code: cause.code, error: cause.message })
        : reply(500, {
          code: "internal_error",
          error: "The proctor workload request could not be completed.",
        });
    }
  };
}
