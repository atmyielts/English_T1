import {
  ContractError,
  hash,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
export interface CohortRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    kind: string,
    id: string | null,
    window: string | null,
    after: string | null,
    limit: number,
    query: string,
  ): Promise<unknown>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  claim(limit: number): Promise<unknown>;
  step(tenant: string, job: string, lease: string): Promise<unknown>;
}
function integer(value: unknown, label: string, min: number, max: number) {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < min ||
    value > max
  ) {
    throw new ContractError(
      "invalid_cohort_number",
      `${label} must be an integer from ${min} to ${max}`,
    );
  }
  return value;
}
export function createCohortHandler(
  repository: CohortRepository,
  origins: string[],
  workerSecret: string,
) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(),
      origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
        Vary: "Origin",
      };
    if (origin && origins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const reply = (status: number, data: Record<string, unknown>) =>
      new Response(JSON.stringify({ ...data, request_id: requestId }), {
        status,
        headers,
      });
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
      const url = new URL(req.url),
        prefix = "/assessment-cloud/cohorts",
        offset = url.pathname.indexOf(prefix);
      if (offset < 0) {
        throw new ContractError("not_found", "Cohort route not found", 404);
      }
      const path = url.pathname.slice(offset + prefix.length).replace(
        /^\//,
        "",
      );
      async function body() {
        const raw = await req.text();
        if (new TextEncoder().encode(raw).length > 32000) {
          throw new ContractError(
            "payload_too_large",
            "Cohort commands must not exceed 32 KB",
            413,
          );
        }
        try {
          return object(JSON.parse(raw));
        } catch {
          throw new ContractError(
            "invalid_json",
            "Expected a JSON object",
            400,
          );
        }
      }
      if (path === "internal" && req.method === "POST") {
        if (workerSecret.length < 32) {
          throw new ContractError(
            "roster_unconfigured",
            "The roster worker is not configured",
            503,
          );
        }
        const left = await hash(
            req.headers.get("x-assessment-roster-key") ?? "",
          ),
          right = await hash(workerSecret);
        let different = 0;
        for (let i = 0; i < left.length; i++) {
          different |= left.charCodeAt(i) ^ right.charCodeAt(i);
        }
        if (different) {
          throw new ContractError(
            "worker_required",
            "A trusted roster worker is required",
            403,
          );
        }
        const input = await body(), data = object(input.data);
        if (input.action === "job.claim") {
          return reply(200, {
            data: await repository.claim(
              integer(data.limit, "Claim size", 1, 100),
            ),
          });
        }
        if (input.action === "job.step") {
          return reply(200, {
            data: await repository.step(
              uuid(data.tenant_id),
              uuid(data.job_id),
              uuid(data.lease_token),
            ),
          });
        }
        throw new ContractError(
          "unknown_roster_action",
          "Unknown roster worker action",
        );
      }
      const token = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = token ? await repository.user(token[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue", 401);
      }
      const tenant = uuid(url.searchParams.get("tenant_id"));
      if (req.method === "GET") {
        const match = /^(groups|jobs)\/([^/]+)$/.exec(path),
          kind = match ? (match[1] === "groups" ? "cohort" : "job") : ({
            groups: "cohorts",
            jobs: "jobs",
            directory: "directory",
            sittings: "sittings",
            preview: "preview",
          } as Record<string, string>)[path];
        if (!kind) {
          throw new ContractError(
            "not_found",
            "Cohort resource not found",
            404,
          );
        }
        const after = url.searchParams.get("after"),
          window = url.searchParams.get("window_id"),
          cohort = url.searchParams.get("cohort_id"),
          query = url.searchParams.get("q") ?? "";
        if (query.length > 200) {
          throw new ContractError(
            "invalid_cohort_query",
            "Search must not exceed 200 characters",
          );
        }
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            kind,
            match ? uuid(match[2]) : kind === "preview" ? uuid(cohort) : null,
            kind === "preview" ? uuid(window) : null,
            after ? uuid(after) : null,
            integer(
              Number(url.searchParams.get("limit") ?? 50),
              "Page size",
              1,
              100,
            ),
            query,
          ),
        });
      }
      if (path !== "commands") {
        throw new ContractError("not_found", "Cohort route not found", 404);
      }
      const key = text(req.headers.get("idempotency-key"), "Command key", 200);
      if (key.length < 8) {
        throw new ContractError(
          "invalid_key",
          "Use a command key of at least eight characters",
        );
      }
      const input = await body(),
        action = text(input.action, "Action", 80),
        data = object(input.data);
      let normalized: Record<string, unknown>;
      switch (action) {
        case "cohort.create":
          normalized = {
            title: text(data.title, "Cohort title", 200),
            description:
              data.description === undefined || data.description === ""
                ? ""
                : text(data.description, "Description", 2000),
          };
          break;
        case "cohort.revise":
          if (!["active", "archived"].includes(String(data.state))) {
            throw new ContractError(
              "invalid_cohort_state",
              "Choose active or archived",
            );
          }
          normalized = {
            cohort_id: uuid(data.cohort_id),
            expected_revision: integer(
              data.expected_revision,
              "Revision",
              1,
              Number.MAX_SAFE_INTEGER,
            ),
            title: text(data.title, "Title", 200),
            description:
              data.description === undefined || data.description === ""
                ? ""
                : text(data.description, "Description", 2000),
            state: data.state,
            reason: text(data.reason, "Reason", 2000),
          };
          break;
        case "member.add":
        case "member.remove":
          normalized = {
            cohort_id: uuid(data.cohort_id),
            user_id: uuid(data.user_id),
            expected_revision: integer(
              data.expected_revision,
              "Revision",
              1,
              Number.MAX_SAFE_INTEGER,
            ),
            ...(action === "member.add"
              ? {
                extra_seconds: integer(
                  data.extra_seconds ?? 0,
                  "Extra time",
                  0,
                  86400,
                ),
              }
              : {}),
            reason: text(data.reason, "Reason", 2000),
          };
          break;
        case "job.create": {
          const review = text(data.review_hash, "Review hash", 64);
          if (!/^[a-f0-9]{64}$/.test(review)) {
            throw new ContractError(
              "roster_review_changed",
              "Review the current roster and sitting",
            );
          }
          normalized = {
            cohort_id: uuid(data.cohort_id),
            window_id: uuid(data.window_id),
            review_hash: review,
          };
          break;
        }
        case "job.resume":
        case "job.cancel":
          normalized = {
            job_id: uuid(data.job_id),
            expected_revision: integer(
              data.expected_revision,
              "Revision",
              1,
              Number.MAX_SAFE_INTEGER,
            ),
            reason: text(data.reason, "Reason", 2000),
          };
          break;
        default:
          throw new ContractError(
            "unknown_cohort_action",
            "Unknown cohort action",
          );
      }
      return reply(200, {
        data: await repository.command(actor, tenant, key, action, normalized),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      console.error("assessment cohort request failed", {
        request_id: requestId,
      });
      return reply(500, {
        code: "internal_error",
        error: "The cohort service could not complete this request",
      });
    }
  };
}
