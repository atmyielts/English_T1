import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import { prepareBankImport } from "../../../packages/assessment-core/src/bank-import.ts";
export interface ImportRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    kind: string,
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
  export(
    actor: string,
    tenant: string,
    bank: string,
    after: string | null,
    at: string | null,
  ): Promise<unknown>;
}
const integer = (value: unknown, min = 0, max = 2147483647) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new ContractError(
      "invalid_import_number",
      "Invalid import page or revision.",
    );
  }
  return number;
};
export function createImportHandler(
  repository: ImportRepository,
  origins: string[],
) {
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Vary": "Origin",
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
        tenant = uuid(url.searchParams.get("tenant_id"), "Institution"),
        path = url.pathname.split("/assessment-cloud/imports/")[1] ?? "";
      if (req.method === "GET") {
        if (path === "export") {
          const at = url.searchParams.get("snapshot_at");
          if (
            at &&
            (!/(Z|[+-]\d{2}:\d{2})$/.test(at) ||
              !Number.isFinite(Date.parse(at)))
          ) {
            throw new ContractError(
              "invalid_export_timestamp",
              "Invalid export snapshot.",
            );
          }
          return reply(200, {
            data: await repository.export(
              actor,
              tenant,
              uuid(url.searchParams.get("bank_id")),
              url.searchParams.has("after")
                ? uuid(url.searchParams.get("after"))
                : null,
              at,
            ),
          });
        }
        if (path === "jobs" || /^jobs\/[^/]+$/.test(path)) {
          return reply(200, {
            data: await repository.read(
              actor,
              tenant,
              path === "jobs" ? "list" : "job",
              path === "jobs" ? null : uuid(path.split("/")[1]),
              integer(url.searchParams.get("after") ?? 0),
              integer(url.searchParams.get("limit") ?? 50, 1, 100),
            ),
          });
        }
        throw new ContractError("not_found", "Import resource not found", 404);
      }
      if (path !== "commands") {
        throw new ContractError("not_found", "Import resource not found", 404);
      }
      const key = text(req.headers.get("idempotency-key"), "Request key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Request key is too short.");
      }
      const source = await req.text();
      if (new TextEncoder().encode(source).length > 6_000_000) {
        throw new ContractError(
          "payload_too_large",
          "Import request exceeds 6 MB.",
          413,
        );
      }
      let body: Record<string, unknown>;
      try {
        body = object(JSON.parse(source));
      } catch {
        throw new ContractError(
          "invalid_json",
          "Expected an import request object.",
          400,
        );
      }
      const action = text(body.action, "Action", 20), data = object(body.data);
      let input: Record<string, unknown>;
      if (action === "stage") {
        // Check current private-bank authority before parsing/providing detailed diagnostics.
        await repository.read(actor, tenant, "list", null, 0, 1);
        if (data.format !== "csv" && data.format !== "json") {
          throw new ContractError(
            "invalid_import_format",
            "Choose CSV or Schood bank JSON.",
          );
        }
        if (typeof data.source !== "string") {
          throw new ContractError(
            "invalid_import",
            "File content must be text.",
          );
        }
        const plan = await prepareBankImport(data.format, data.source);
        if (plan.errors.length) {
          return reply(422, {
            code: "import_validation_failed",
            error: "Correct the listed rows before staging this file.",
            issues: plan.errors,
          });
        }
        input = {
          bank_id: uuid(data.bank_id),
          source_name: text(data.source_name, "File name", 200),
          format: data.format,
          source_hash: plan.source_hash,
          rows: plan.rows,
        };
      } else if (["confirm", "step", "cancel"].includes(action)) {
        input = {
          id: uuid(data.id),
          expected_revision: integer(data.expected_revision, 1),
        };
        if (action !== "step") input.reason = text(data.reason, "Reason", 2000);
        if (action === "confirm") {
          const review = text(data.review_hash, "Reviewed content hash", 64);
          if (!/^[a-f0-9]{64}$/.test(review)) {
            throw new ContractError(
              "invalid_import_hash",
              "Review this import again.",
            );
          }
          input.review_hash = review;
        }
      } else throw new ContractError("unknown_action", "Unknown import action");
      return reply(200, {
        data: await repository.command(actor, tenant, key, action, input),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      return reply(500, {
        code: "internal_error",
        error: "The import request could not be completed.",
      });
    }
  };
}
