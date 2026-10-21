import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
export interface FeedbackRepository {
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
export function createFeedbackHandler(
  repository: FeedbackRepository,
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
        path = url.pathname.split("/assessment-cloud/feedback/")[1] ?? "";
      if (req.method === "GET") {
        const match = /^(policy|releases|preview)\/([^/]+)$/.exec(path),
          kind = path === "sittings" ? path : match?.[1];
        if (!kind) {
          throw new ContractError(
            "not_found",
            "Feedback resource not found",
            404,
          );
        }
        const limit = Number(url.searchParams.get("limit") ?? 50);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new ContractError(
            "invalid_feedback_page",
            "Choose a page of 1–100 records.",
          );
        }
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            kind,
            match ? uuid(match[2]) : null,
            url.searchParams.has("after")
              ? uuid(url.searchParams.get("after"))
              : null,
            limit,
          ),
        });
      }
      if (path !== "commands") {
        throw new ContractError(
          "not_found",
          "Feedback resource not found",
          404,
        );
      }
      const key = text(req.headers.get("idempotency-key"), "Request key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Request key is too short.");
      }
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 16384) {
        throw new ContractError(
          "payload_too_large",
          "Feedback request exceeds 16 KB.",
          413,
        );
      }
      let body: Record<string, unknown>;
      try {
        body = object(JSON.parse(raw));
      } catch {
        throw new ContractError(
          "invalid_json",
          "Expected a feedback request object.",
          400,
        );
      }
      const action = text(body.action, "Action", 50),
        data = object(body.data),
        revision = data.expected_revision;
      if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
        throw new ContractError(
          "invalid_feedback_revision",
          "Refresh the current policy before making a change.",
        );
      }
      const clean: Record<string, unknown> = { expected_revision: revision };
      switch (action) {
        case "policy.propose": {
          if (
            !["totals", "sections", "questions"].includes(String(data.level))
          ) {
            throw new ContractError(
              "invalid_feedback_level",
              "Choose a supported feedback level.",
            );
          }
          clean.window_id = uuid(data.window_id);
          clean.level = data.level;
          clean.reason = text(data.reason, "Policy reason", 2000);
          clean.available_after = null;
          if (data.available_after != null) {
            const value = data.available_after;
            if (
              typeof value !== "string" ||
              !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/
                .test(value) ||
              !Number.isFinite(Date.parse(value))
            ) {
              throw new ContractError(
                "invalid_feedback_time",
                "Choose a valid feedback time including its timezone.",
              );
            }
            if (data.level === "totals") {
              throw new ContractError(
                "invalid_feedback_time",
                "Totals-only feedback has no additional detail date.",
              );
            }
            clean.available_after = new Date(value).toISOString();
          }
          break;
        }
        case "policy.approve":
          clean.id = uuid(data.id);
          if (
            typeof data.review_hash !== "string" ||
            !/^[a-f0-9]{64}$/.test(data.review_hash)
          ) {
            throw new ContractError(
              "invalid_feedback_hash",
              "Review this exact policy before approval.",
            );
          }
          clean.review_hash = data.review_hash;
          break;
        case "policy.suspend":
          clean.window_id = uuid(data.window_id);
          clean.reason = text(data.reason, "Suspension reason", 2000);
          break;
        case "release.hold":
        case "release.resume":
          clean.id = uuid(data.id);
          clean.reason = text(data.reason, "Feedback decision reason", 2000);
          break;
        default:
          throw new ContractError("unknown_action", "Unknown feedback action.");
      }
      return reply(200, {
        data: await repository.command(actor, tenant, key, action, clean),
      });
    } catch (cause) {
      return cause instanceof ContractError
        ? reply(cause.status, { code: cause.code, error: cause.message })
        : reply(500, {
          code: "internal_error",
          error: "The feedback request could not be completed.",
        });
    }
  };
}
