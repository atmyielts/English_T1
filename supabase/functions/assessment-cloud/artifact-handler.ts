import {
  ContractError,
  hash,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  artifactInteger,
  artifactReceipt,
  artifactScanReport,
  artifactUpload,
} from "../../../packages/assessment-core/src/artifacts.ts";
export interface ArtifactRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
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
  transport(
    actor: string,
    tenant: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  claim(limit: number): Promise<unknown>;
  scanBundle(job: string, token: string, renew: boolean): Promise<unknown>;
  report(data: Record<string, unknown>): Promise<unknown>;
}
export interface ArtifactSecrets {
  transport: string;
  scanner: string;
  scannerId: string;
}
async function secretMatches(supplied: string, expected: string) {
  if (expected.length < 32) return false;
  const a = await hash(supplied),
    b = await hash(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function createArtifactHandler(
  repository: ArtifactRepository,
  origins: string[],
  secrets: ArtifactSecrets,
) {
  if (secrets.transport.length >= 32 && secrets.transport === secrets.scanner)
    throw new Error("Media transport and scanner secrets must be distinct");
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      requestId = crypto.randomUUID(),
      headers: Record<string, string> = {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": requestId,
        vary: "Origin",
      };
    if (origin && origins.includes(origin))
      headers["access-control-allow-origin"] = origin;
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers });
    try {
      if (origin && !origins.includes(origin))
        throw new ContractError(
          "forbidden_origin",
          "This origin is not allowed",
          403,
        );
      if (req.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers":
              "authorization,apikey,content-type,idempotency-key",
          },
        });
      const url = new URL(req.url),
        prefix = "/assessment-cloud/artifacts/",
        offset = url.pathname.indexOf(prefix);
      if (offset < 0)
        throw new ContractError("not_found", "Artifact route not found", 404);
      const path = url.pathname.slice(offset + prefix.length);
      if (path.startsWith("scan/")) {
        if (req.method !== "POST")
          throw new ContractError(
            "method_not_allowed",
            "Method not allowed",
            405,
          );
        if (
          !(await secretMatches(
            req.headers.get("x-assessment-scanner-key") ?? "",
            secrets.scanner,
          )) ||
          !secrets.scannerId
        )
          throw new ContractError(
            "scanner_required",
            "A configured trusted scanner is required",
            403,
          );
        const raw = await body(req);
        if (path === "scan/claim")
          return reply(200, {
            data: await repository.claim(
              artifactInteger(raw.limit ?? 20, "Claim limit", 1, 20),
            ),
          });
        if (path === "scan/bundle" || path === "scan/renew")
          return reply(200, {
            data: await repository.scanBundle(
              uuid(raw.job_id),
              uuid(raw.lease_token),
              path === "scan/renew",
            ),
          });
        if (path === "scan/report") {
          const report = artifactScanReport(raw);
          if (report.scanner_id !== secrets.scannerId)
            throw new ContractError(
              "scanner_identity_mismatch",
              "The configured scanner identity is required",
              403,
            );
          return reply(200, { data: await repository.report(report) });
        }
        throw new ContractError("not_found", "Scan route not found", 404);
      }
      // Browser tokens never authorize storage receipts or scanner verdicts on their own.
      if (
        path === "transport" &&
        !(await secretMatches(
          req.headers.get("x-assessment-media-key") ?? "",
          secrets.transport,
        ))
      )
        throw new ContractError(
          "media_transport_required",
          "A trusted media transport must send this request",
          403,
        );
      const token = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = token ? await repository.user(token[1]) : null;
      if (!actor)
        throw new ContractError("unauthorized", "Sign in to continue", 401);
      const tenant = uuid(url.searchParams.get("tenant_id"));
      if (req.method === "GET" && path === "library") {
        const after = url.searchParams.get("after");
        return reply(200, {
          data: await repository.read(
            actor,
            tenant,
            after ? uuid(after) : null,
            artifactInteger(
              Number(url.searchParams.get("limit") ?? 100),
              "Page limit",
              1,
              100,
            ),
          ),
        });
      }
      if (req.method !== "POST")
        throw new ContractError(
          "method_not_allowed",
          "Method not allowed",
          405,
        );
      const raw = await body(req),
        action = text(raw.action, "Action", 80),
        data = object(raw.data);
      if (path === "transport") {
        let input: Record<string, unknown>;
        if (action === "chunk.receipt") input = artifactReceipt(data);
        else if (action === "chunk.authorize")
          input = {
            artifact_id: uuid(data.artifact_id),
            index: artifactInteger(data.index, "Part index", 0, 2047),
          };
        else if (action === "upload.complete")
          input = { artifact_id: uuid(data.artifact_id) };
        else if (action === "read.authorize") {
          if (data.attempt_id && data.task_id)
            throw new ContractError("ambiguous_artifact_scope", "Choose candidate attempt or assigned marking task, not both");
          input = {
            artifact_id: uuid(data.artifact_id),
            ...(data.attempt_id ? { attempt_id: uuid(data.attempt_id) } : {}),
            ...(data.task_id ? { task_id: uuid(data.task_id) } : {}),
          };
        }
        else
          throw new ContractError(
            "unknown_artifact_transport",
            "Unknown artifact transport action",
          );
        return reply(200, {
          data: await repository.transport(actor, tenant, action, input),
        });
      }
      if (path !== "commands")
        throw new ContractError("not_found", "Artifact route not found", 404);
      const key = text(req.headers.get("idempotency-key"), "Command key", 200);
      if (key.length < 8)
        throw new ContractError(
          "invalid_key",
          "Use a stable command key of at least eight characters",
        );
      const input =
        action === "upload.begin"
          ? artifactUpload(data)
          : action === "upload.cancel"
            ? { artifact_id: uuid(data.artifact_id) }
            : null;
      if (!input)
        throw new ContractError(
          "unknown_artifact_action",
          "Unknown artifact command",
        );
      return reply(200, {
        data: await repository.command(
          actor,
          tenant,
          key,
          action,
          input as unknown as Record<string, unknown>,
        ),
      });
    } catch (cause) {
      if (cause instanceof ContractError)
        return reply(cause.status, {
          code: cause.code,
          error: cause.message,
          request_id: requestId,
        });
      console.error("assessment artifact request failed", {
        request_id: requestId,
      });
      return reply(500, {
        code: "internal_error",
        error: "The artifact service could not complete this request",
        request_id: requestId,
      });
    }
  };
}
async function body(req: Request) {
  const content = await req.text();
  if (new TextEncoder().encode(content).length > 400000)
    throw new ContractError(
      "payload_too_large",
      "Artifact metadata exceeds 400 KB",
      413,
    );
  try {
    return object(JSON.parse(content));
  } catch {
    throw new ContractError("invalid_json", "Expected a JSON object", 400);
  }
}
