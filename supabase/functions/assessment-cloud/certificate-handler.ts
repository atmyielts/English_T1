import {
  ContractError,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  base64url,
  CERTIFICATE_FORMAT,
  certificatePayloadHash,
  certificateProgram,
} from "../../../packages/assessment-core/src/certificates.ts";
import type { CertificateSigner } from "./certificate-signer.ts";
export interface CertificateSigningRecord {
  id: string;
  key_id: string;
  payload_text: string;
  payload_hash: string;
  signature?: string;
}
export interface CertificateRepository {
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
  ): Promise<{ id: string }>;
  seal(
    actor: string,
    tenant: string,
    id: string,
    keyId: string,
    payloadHash: string,
    signature: string,
  ): Promise<unknown>;
  status(
    id: string,
    keyId: string,
    payloadHash: string,
    signature: string,
  ): Promise<unknown>;
}
export function createCertificateHandler(
  repository: CertificateRepository,
  origins: string[],
  options: {
    enabled: boolean;
    signer: CertificateSigner | null;
    documentsEnabled?: boolean;
  },
) {
  return async (req: Request): Promise<Response> => {
    const id = crypto.randomUUID(),
      url = new URL(req.url),
      origin = req.headers.get("origin"),
      prefix = "/assessment-cloud/certificates",
      offset = url.pathname.indexOf(prefix),
      path = offset < 0
        ? ""
        : url.pathname.slice(offset + prefix.length).replace(/^\//, "");
    const publicRoute = req.method === "GET" && path === "keys" ||
      req.method === "POST" && path === "verify" ||
      req.method === "OPTIONS" && ["keys", "verify"].includes(path);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-ID": id,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      Vary: "Origin",
    };
    if (publicRoute) headers["Access-Control-Allow-Origin"] = "*";
    else if (origin && origins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    const reply = (status: number, value: Record<string, unknown>) =>
      new Response(JSON.stringify({ ...value, request_id: id }), {
        status,
        headers,
      });
    async function body() {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 32000) {
        throw new ContractError(
          "payload_too_large",
          "Certificate requests must not exceed 32 KB",
          413,
        );
      }
      try {
        return object(JSON.parse(raw));
      } catch {
        throw new ContractError("invalid_json", "Expected a JSON object", 400);
      }
    }
    try {
      if (offset < 0) {
        throw new ContractError(
          "not_found",
          "Certificate route not found",
          404,
        );
      }
      if (origin && !publicRoute && !origins.includes(origin)) {
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
      if (path === "keys" && req.method === "GET") {
        return reply(200, { data: options.signer?.publicKeys() ?? [] });
      }
      if (path === "verify" && req.method === "POST") {
        if (!options.signer) {
          throw new ContractError(
            "certificate_signing_unconfigured",
            "Certificate verification is not configured.",
            503,
          );
        }
        const payload = await body(),
          verified = await options.signer.verify(payload.certificate),
          status = await repository.status(
            verified.claims.certificate_id,
            verified.envelope.key_id,
            verified.payloadHash,
            verified.envelope.signature,
          );
        return reply(200, {
          data: {
            ...object(status),
            signature_verified: true,
            claims: verified.claims,
          },
        });
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
        const download = /^([^/]+)\/download$/.exec(path),
          kind = download
            ? "download"
            : ["candidate", "institution", "programs", "results", "access"]
                .includes(path)
            ? path
            : null;
        if (!kind) {
          throw new ContractError(
            "not_found",
            "Certificate resource not found",
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
        const value = await repository.read(
          actor,
          tenant,
          kind,
          download ? uuid(download[1]) : null,
          after ? uuid(after) : null,
          limit,
        );
        if (download) {
          const record = value as CertificateSigningRecord;
          return reply(200, {
            data: {
              format: CERTIFICATE_FORMAT,
              key_id: record.key_id,
              payload: base64url(new TextEncoder().encode(record.payload_text)),
              signature: record.signature,
            },
          });
        }
        return reply(200, {
          data: kind === "access"
            ? {
              ...object(value),
              issuance_enabled: options.enabled && options.signer !== null,
            }
            : options.documentsEnabled === true &&
                ["candidate", "institution"].includes(kind) &&
                Array.isArray(value)
            ? value.map((row) => ({ ...object(row), pdf_enabled: true }))
            : value,
        });
      }
      if (path !== "commands") {
        throw new ContractError(
          "not_found",
          "Certificate route not found",
          404,
        );
      }
      const key = text(req.headers.get("idempotency-key"), "Command key", 200);
      if (key.length < 8) {
        throw new ContractError(
          "invalid_key",
          "Use a stable command key of at least eight characters",
        );
      }
      const payload = await body(),
        action = text(payload.action, "Action", 80),
        data = object(payload.data);
      let input: Record<string, unknown>, backendAction = action;
      switch (action) {
        case "program.create":
          input = certificateProgram(data);
          break;
        case "program.retire":
        case "program.approve": {
          const digest = text(data.review_hash, "Review hash", 64);
          if (!/^[a-f0-9]{64}$/.test(digest)) {
            throw new ContractError(
              "certificate_program_review_required",
              "Review the current program before approval",
            );
          }
          input = {
            id: uuid(data.id),
            review_hash: digest,
            ...(action === "program.retire"
              ? { reason: text(data.reason, "Retirement reason", 5000) }
              : {}),
          };
          break;
        }
        case "certificate.replace":
        case "certificate.issue":
          if (!options.enabled || !options.signer) {
            throw new ContractError(
              "certificate_issuance_disabled",
              "Certificate issuance has not been enabled and configured for this environment.",
              503,
            );
          }
          input = {
            attempt_id: uuid(data.attempt_id),
            program_id: uuid(data.program_id),
            score_revision_id: uuid(data.score_revision_id),
          };
          if (action === "certificate.replace") {
            if (
              typeof data.expected_revision !== "number" ||
              !Number.isInteger(data.expected_revision) ||
              data.expected_revision < 1 || data.expected_revision > 3
            ) {
              throw new ContractError(
                "invalid_certificate_revision",
                "Review the current original certificate revision.",
              );
            }
            input = {
              ...input,
              id: uuid(data.id),
              expected_revision: data.expected_revision,
              reason: text(data.reason, "Replacement reason", 5000),
            };
          }
          backendAction = action === "certificate.replace"
            ? "certificate.replace.prepare"
            : "certificate.prepare";
          break;
        case "certificate.revoke":
        case "certificate.cancel":
          if (
            typeof data.expected_revision !== "number" ||
            !Number.isInteger(data.expected_revision) ||
            data.expected_revision < 1 || data.expected_revision > 3
          ) {
            throw new ContractError(
              "invalid_certificate_revision",
              "Use the current certificate revision",
            );
          }
          input = {
            id: uuid(data.id),
            expected_revision: data.expected_revision,
            reason: text(data.reason, "Reason", 5000),
          };
          break;
        default:
          throw new ContractError(
            "unknown_certificate_action",
            "Unknown certificate action",
          );
      }
      // Pin signing identity outside the replay fingerprint: a retry after rotation must
      // use the original DB-held key, not turn a committed preparation into a conflict.
      const result = await repository.command(
        actor,
        tenant,
        key,
        backendAction,
        {
          ...input,
          ...(["certificate.issue", "certificate.replace"].includes(action)
            ? { key_id: options.signer!.active }
            : {}),
        },
      );
      if (!["certificate.issue", "certificate.replace"].includes(action)) {
        return reply(200, { data: result });
      }
      const record = await repository.read(
        actor,
        tenant,
        "signing",
        result.id,
        null,
        1,
      ) as CertificateSigningRecord;
      if (
        await certificatePayloadHash(record.payload_text) !==
          record.payload_hash
      ) {
        throw new ContractError(
          "certificate_payload_corrupt",
          "Certificate signing material does not match its receipt.",
          503,
        );
      }
      const signed = record.signature
        ? (await options.signer!.verify({
          format: CERTIFICATE_FORMAT,
          key_id: record.key_id,
          payload: base64url(new TextEncoder().encode(record.payload_text)),
          signature: record.signature,
        })).envelope
        : await options.signer!.sign(record.payload_text, record.key_id);
      return reply(200, {
        data: await repository.seal(
          actor,
          tenant,
          record.id,
          record.key_id,
          record.payload_hash,
          signed.signature,
        ),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      console.error("assessment certificate request failed", {
        request_id: id,
      });
      return reply(500, {
        code: "internal_error",
        error: "The certificate service could not complete this request",
      });
    }
  };
}
