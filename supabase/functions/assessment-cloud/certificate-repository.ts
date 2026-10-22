import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { CertificateRepository } from "./certificate-handler.ts";
interface AuthPort {
  auth: {
    getUser(
      token: string,
    ): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}
interface DatabasePort {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<
    { data: unknown; error: { code?: string; message: string } | null }
  >;
}
export function createCertificateRepository(
  auth: AuthPort,
  service: DatabasePort,
): CertificateRepository {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await service.rpc(name, args);
    if (!error) return data;
    const status = error.code === "42501"
      ? 403
      : error.code === "P0002"
      ? 404
      : error.code === "23505"
      ? 409
      : ["22023", "22P02", "23514", "23503", "23502"].includes(error.code ?? "")
      ? 422
      : 500;
    throw new ContractError(
      status === 500 ? "database_error" : error.message,
      status === 500
        ? "The certificate database request failed"
        : error.message,
      status,
    );
  };
  return {
    async user(token) {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    read: (actor, tenant, kind, id, after, limit) =>
      rpc("assessment_certificate_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_kind: kind,
        p_id: id,
        p_after: after,
        p_limit: limit,
      }),
    command: async (actor, tenant, key, action, data) =>
      await rpc("assessment_certificate_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }) as { id: string },
    seal: (actor, tenant, id, keyId, payloadHash, signature) =>
      rpc("assessment_certificate_seal", {
        p_actor: actor,
        p_tenant: tenant,
        p_id: id,
        p_key_id: keyId,
        p_payload_hash: payloadHash,
        p_signature: signature,
      }),
    status: (id, keyId, payloadHash, signature) =>
      rpc("assessment_certificate_status", {
        p_id: id,
        p_key_id: keyId,
        p_payload_hash: payloadHash,
        p_signature: signature,
      }),
  };
}
