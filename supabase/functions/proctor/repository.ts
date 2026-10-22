import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { ProctorRepository } from "./handler.ts";
type Row = Record<string, unknown>;
type Result<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};
interface Query extends PromiseLike<Result<Row[]>> {
  eq(name: string, value: string): Query;
  limit(count: number): Query;
  maybeSingle(): PromiseLike<Result<Row>>;
}
export interface ProctorDatabase {
  from(table: string): { select(columns: string): Query };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<Result<unknown>>;
}
export function createProctorRepository(
  user: ProctorRepository["user"],
  service: ProctorDatabase,
): ProctorRepository {
  function dbError(cause: { code?: string; message: string }): never {
    const status = cause.code === "42501"
      ? 403
      : cause.code === "P0002"
      ? 404
      : cause.code === "23505"
      ? 409
      : ["22023", "23514", "23503"].includes(cause.code ?? "")
      ? 422
      : 500;
    throw new ContractError(
      status === 500 ? "database_error" : cause.message,
      status === 500 ? "Database request failed" : cause.message,
      status,
    );
  }
  return {
    user,
    async workspaces(user) {
      const { data, error } = await service.from("tenant_memberships").select(
        "tenant_id,role,tenants(name)",
      ).eq("user_id", user).eq("status", "active");
      if (error) dbError(error);
      return data ?? [];
    },
    async capability(tenant, user, capability) {
      const { data, error } = await service.rpc("assessment_has_capability", {
        p_tenant: tenant,
        p_user: user,
        p_capability: capability,
      });
      if (error) dbError(error);
      return data === true;
    },
    async access(tenant, session, user, assignment) {
      const { data, error } = await service.rpc("proctor_can_access", {
        p_tenant: tenant,
        p_session: session,
        p_user: user,
        p_assignment: assignment ?? null,
      });
      if (error) dbError(error);
      return data === true;
    },
    async list(table, tenant, filters = {}) {
      let query = service.from(table).select("*").eq("tenant_id", tenant);
      for (const [field, value] of Object.entries(filters)) {
        query = query.eq(
          field,
          value,
        );
      }
      const { data, error } = await query.limit(1000);
      if (error) dbError(error);
      return data ?? [];
    },
    async get(table, tenant, id) {
      const { data, error } = await service.from(table).select("*").eq(
        "tenant_id",
        tenant,
      ).eq("id", id).maybeSingle();
      if (error) dbError(error);
      return data;
    },
    async outcome(actor, tenant, caseId) {
      const { data, error } = await service.rpc("proctor_case_outcome", { p_actor: actor, p_tenant: tenant, p_case: caseId });
      if (error) dbError(error);
      return data;
    },
    async candidateOutcomes(actor, tenant) {
      const { data, error } = await service.rpc("proctor_candidate_outcomes", { p_actor: actor, p_tenant: tenant });
      if (error) dbError(error);
      return data ?? [];
    },
    async command(actor, tenant, key, action, data) {
      const { data: result, error } = await service.rpc("proctor_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      });
      if (error) dbError(error);
      return result;
    },
  };
}
