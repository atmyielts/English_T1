import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
export interface AnalyticsRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    kind: string,
    id: string | null,
    form: string | null,
    after: string | null,
    limit: number,
  ): Promise<unknown>;
  create(
    actor: string,
    tenant: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  breakdown(actor: string, tenant: string, attempt: string): Promise<unknown>;
}
export function createAnalyticsHandler(
  repository: AnalyticsRepository,
  origins: string[],
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
        path = url.pathname.split("/assessment-cloud/analytics/")[1] ?? "";
      if (req.method === "GET") {
        if (path === "candidate/result") {
          return reply(200, {
            data: await repository.breakdown(
              actor,
              tenant,
              uuid(url.searchParams.get("attempt_id")),
            ),
          });
        }
        const kind = ["sittings", "cohorts", "snapshots"].includes(path)
          ? path
          : /^reports\/[^/]+$/.test(path)
          ? "report"
          : /^reports\/[^/]+\/forms$/.test(path)
          ? "forms"
          : null;
        if (!kind) {
          throw new ContractError(
            "not_found",
            "Report resource not found",
            404,
          );
        }
        const limit = Number(url.searchParams.get("limit") ?? 50);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new ContractError(
            "invalid_analytics_page",
            "Choose a page of 1–100 records.",
          );
        }
        const form = url.searchParams.get("form");
        if (form !== null && !/^[a-f0-9]{64}$/.test(form)) {
          throw new ContractError(
            "invalid_analytics_form",
            "Choose a form from this report.",
          );
        }
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            kind,
            ["report", "forms"].includes(kind)
              ? uuid(path.split("/")[1])
              : null,
            form,
            url.searchParams.has("after")
              ? uuid(url.searchParams.get("after"))
              : null,
            limit,
          ),
        });
      }
      if (path !== "commands") {
        throw new ContractError("not_found", "Report resource not found", 404);
      }
      const key = text(req.headers.get("idempotency-key"), "Request key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Request key is too short.");
      }
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 16384) {
        throw new ContractError(
          "payload_too_large",
          "Report request exceeds 16 KB.",
          413,
        );
      }
      let body: Record<string, unknown>;
      try {
        body = object(JSON.parse(raw));
      } catch {
        throw new ContractError(
          "invalid_json",
          "Expected a report request object.",
          400,
        );
      }
      if (body.action !== "snapshot.create") {
        throw new ContractError("unknown_action", "Unknown reporting action.");
      }
      const data = object(body.data), cutoff = data.threshold_percent;
      if (
        typeof cutoff !== "number" || !Number.isFinite(cutoff) || cutoff < 0 ||
        cutoff > 100 || Math.round(cutoff * 1e6) / 1e6 !== cutoff
      ) {
        throw new ContractError(
          "invalid_analysis_cutoff",
          "Choose an analysis cutoff from 0–100 with at most six decimal places.",
        );
      }
      return reply(200, {
        data: await repository.create(actor, tenant, key, {
          window_id: uuid(data.window_id),
          cohort_id: data.cohort_id ? uuid(data.cohort_id) : null,
          threshold_percent: cutoff,
          reason: text(data.reason, "Report purpose", 2000),
        }),
      });
    } catch (cause) {
      return cause instanceof ContractError
        ? reply(cause.status, { code: cause.code, error: cause.message })
        : reply(500, {
          code: "internal_error",
          error: "The report could not be retrieved.",
        });
    }
  };
}
