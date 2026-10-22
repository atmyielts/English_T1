import {
  ContractError,
  object,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  base64url,
  CERTIFICATE_FORMAT,
  type CertificateEnvelope,
} from "../../../packages/assessment-core/src/certificates.ts";
import {
  certificateLocale,
  type CertificateReference,
  certificateReference,
  certificateVerificationUrl,
  referenceForCertificate,
} from "../../../packages/assessment-core/src/certificate-document.ts";
import type { CertificateSigner } from "./certificate-signer.ts";
import type { CertificateSigningRecord } from "./certificate-handler.ts";
import type {
  CertificateDocumentRenderer,
  CertificatePdf,
} from "./certificate-document-transport.ts";
export interface CertificateDocumentRepository {
  user(token: string): Promise<string | null>;
  read(
    actor: string,
    tenant: string,
    id: string,
  ): Promise<CertificateSigningRecord>;
  resolve(
    reference: CertificateReference,
  ): Promise<{ record: CertificateSigningRecord; documents: unknown[] }>;
  status(reference: CertificateReference): Promise<unknown>;
  report(
    actor: string,
    tenant: string,
    id: string,
    document: CertificatePdf,
  ): Promise<unknown>;
}
const envelope = (record: CertificateSigningRecord): CertificateEnvelope => ({
  format: CERTIFICATE_FORMAT,
  key_id: record.key_id,
  payload: base64url(new TextEncoder().encode(record.payload_text)),
  signature: record.signature ?? "",
});
async function input(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new ContractError("invalid_json", "Expected a reference.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2000) {
        await reader.cancel();
        throw new ContractError(
          "payload_too_large",
          "Verification references must not exceed 2 KB.",
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
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  try {
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new ContractError("invalid_json", "Expected a reference.", 400);
  }
}
export function createCertificateDocumentHandler(
  repository: CertificateDocumentRepository,
  origins: string[],
  options: {
    enabled: boolean;
    signer: CertificateSigner | null;
    renderer: CertificateDocumentRenderer | null;
    verificationUrl: string;
    allowLocalhost?: boolean;
  },
) {
  return async (req: Request) => {
    const requestId = crypto.randomUUID(),
      url = new URL(req.url),
      path = url.pathname.split("/assessment-cloud/certificates/")[1] ?? "",
      publicRoute = path === "reference/resolve",
      origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "x-request-id": requestId,
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        vary: "Origin",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,apikey,content-type",
      };
    if (publicRoute) headers["access-control-allow-origin"] = "*";
    else if (origin && origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
    }
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers });
    try {
      if (!publicRoute && origin && !origins.includes(origin)) {
        throw new ContractError("origin_denied", "Origin denied.", 403);
      }
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      if (publicRoute && req.method === "POST") {
        if (!options.signer) {
          throw new ContractError(
            "certificate_signing_unconfigured",
            "Certificate verification is not configured.",
            503,
          );
        }
        const data = await input(req),
          reference = certificateReference(data.reference),
          resolved = await repository.resolve(reference),
          verified = await options.signer.verify(envelope(resolved.record));
        if (
          verified.claims.certificate_id !== reference.id ||
          verified.payloadHash !== reference.payload_hash ||
          verified.envelope.key_id !== reference.key_id ||
          verified.envelope.signature !== reference.signature
        ) {
          throw new ContractError(
            "certificate_reference_not_found",
            "This reference does not match an issued certificate.",
            404,
          );
        }
        return reply(200, {
          data: {
            ...object(await repository.status(reference)),
            certificate: verified.envelope,
            documents: resolved.documents,
          },
        });
      }
      const match = /^([^/]+)\/pdf$/.exec(path);
      if (req.method !== "GET" || !match) {
        throw new ContractError(
          "not_found",
          "Certificate document route not found.",
          404,
        );
      }
      const bearer = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = bearer ? await repository.user(bearer[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue.", 401);
      }
      const tenant = uuid(url.searchParams.get("tenant_id")),
        id = uuid(match[1]),
        locale = certificateLocale(url.searchParams.get("locale") ?? "en");
      if (!options.enabled || !options.signer || !options.renderer) {
        throw new ContractError(
          "certificate_document_disabled",
          "Certificate PDF delivery is not enabled and configured.",
          503,
        );
      }
      const record = await repository.read(actor, tenant, id),
        verified = await options.signer.verify(envelope(record));
      if (
        verified.claims.certificate_id !== id ||
        verified.payloadHash !== record.payload_hash
      ) {
        throw new ContractError(
          "certificate_payload_corrupt",
          "Certificate material does not match its receipt.",
          503,
        );
      }
      const verificationUrl = certificateVerificationUrl(
          options.verificationUrl,
          await referenceForCertificate(verified.envelope),
          options.allowLocalhost,
        ),
        document = await options.renderer.render(
          verified.envelope,
          locale,
          verificationUrl,
        );
      if (
        document.payload_hash !== verified.payloadHash ||
        document.locale !== locale
      ) {
        throw new ContractError(
          "certificate_document_mismatch",
          "The rendered document does not match this credential.",
          503,
        );
      }
      if (await repository.user(bearer![1]) !== actor) {
        throw new ContractError(
          "unauthorized",
          "The current identity could not be confirmed.",
          401,
        );
      }
      const latest = await repository.read(actor, tenant, id);
      if (
        latest.payload_hash !== record.payload_hash ||
        latest.signature !== record.signature
      ) {
        throw new ContractError(
          "certificate_payload_conflict",
          "The certificate changed while preparing the document.",
          409,
        );
      }
      await repository.report(actor, tenant, id, document);
      return new Response(new Uint8Array(document.bytes), {
        status: 200,
        headers: {
          ...headers,
          "content-type": "application/pdf",
          "content-disposition":
            `attachment; filename="schood-certificate-${id}-${locale}.pdf"`,
          "content-length": String(document.bytes.byteLength),
          "x-certificate-sha256": document.sha256,
          "access-control-expose-headers":
            "content-disposition,x-certificate-sha256",
        },
      });
    } catch (cause) {
      if (!(cause instanceof ContractError)) {
        console.error("certificate document request failed", {
          request_id: requestId,
          type: cause instanceof Error ? cause.name : "UnknownError",
          frames: cause instanceof Error
            ? cause.stack?.split("\n").filter((line) => /^\s+at /.test(line))
              .slice(0, 3)
            : [],
        });
      }
      return cause instanceof ContractError
        ? reply(cause.status, { code: cause.code, error: cause.message })
        : reply(500, {
          code: "internal_error",
          error: "The certificate document request could not be completed.",
        });
    }
  };
}
