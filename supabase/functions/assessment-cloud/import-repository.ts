import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { ImportRepository } from "./import-handler.ts";
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
export function createImportRepository(
  auth: AuthPort,
  service: DatabasePort,
): ImportRepository {
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
        ? "The private question-bank request failed."
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
      rpc("assessment_bank_import_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_kind: kind,
        p_id: id,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_bank_import_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
    export: (actor, tenant, bank, after, at) =>
      rpc("assessment_bank_export", {
        p_actor: actor,
        p_tenant: tenant,
        p_bank: bank,
        p_after: after,
        p_at: at,
        p_limit: 100,
      }),
  };
}
