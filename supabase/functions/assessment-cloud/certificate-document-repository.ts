import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type {
  CertificateRepository,
  CertificateSigningRecord,
} from "./certificate-handler.ts";
import type { CertificateDocumentRepository } from "./certificate-document-handler.ts";
interface Database {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<
    { data: unknown; error: { code?: string; message: string } | null }
  >;
}
export function createCertificateDocumentRepository(
  base: CertificateRepository,
  database: Database,
): CertificateDocumentRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await database.rpc(name, args);
    if (error) {
      const status = error.code === "42501"
        ? 403
        : error.code === "P0002"
        ? 404
        : error.code === "23505"
        ? 409
        : ["23514", "22023", "23502", "22P02"].includes(error.code ?? "")
        ? 422
        : 500;
      throw new ContractError(
        status === 500 ? "database_error" : error.message,
        status === 500
          ? "The certificate document database request failed."
          : error.message,
        status,
      );
    }
    return data;
  }
  return {
    user: (token) => base.user(token),
    read: async (actor, tenant, id) =>
      await base.read(
        actor,
        tenant,
        "download",
        id,
        null,
        1,
      ) as CertificateSigningRecord,
    resolve: async (reference) =>
      await rpc("assessment_certificate_reference", {
        p_id: reference.id,
        p_key_id: reference.key_id,
        p_payload_hash: reference.payload_hash,
        p_signature: reference.signature,
      }) as { record: CertificateSigningRecord; documents: unknown[] },
    status: (reference) =>
      base.status(
        reference.id,
        reference.key_id,
        reference.payload_hash,
        reference.signature,
      ),
    report: (actor, tenant, id, document) =>
      rpc("assessment_certificate_document_report", {
        p_actor: actor,
        p_tenant: tenant,
        p_id: id,
        p_payload_hash: document.payload_hash,
        p_renderer_id: document.renderer_id,
        p_locale: document.locale,
        p_sha256: document.sha256,
        p_byte_length: document.bytes.byteLength,
      }),
  };
}
