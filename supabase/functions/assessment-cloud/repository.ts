import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { Repository } from "./handler.ts";
type Row = Record<string, unknown>;
interface Result<T> {
  data: T | null;
  error: { code?: string; message: string } | null;
}
interface Query extends PromiseLike<Result<Row[]>> {
  eq(name: string, value: string): Query;
  in(name: string, values: string[]): Query;
  limit(count: number): Query;
  maybeSingle(): PromiseLike<Result<Row>>;
}
export interface AssessmentDatabase {
  from(table: string): { select(columns: string): Query };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<Result<unknown>>;
}
export interface AssessmentAuth {
  auth: {
    getUser(
      token: string,
    ): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}
const dbError = (cause: { code?: string; message: string }): never => {
  const status =
    cause.code === "42501"
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
};
/** The same canonical mapping is used by the Edge entry and connected tests. */
export function createAssessmentRepository(
  auth: AssessmentAuth,
  service: AssessmentDatabase,
  options:{liveLaunchEnabled?:boolean}={},
): Repository {
  return {
    async user(token) {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    async workspaces(user) {
      const { data, error } = await service.rpc("assessment_workspaces", { p_actor: user });
      if (error) dbError(error);
      return (data ?? []) as Record<string, unknown>[];
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
    async list(table, tenant, filters = {}) {
      let query = service.from(table).select("*").eq("tenant_id", tenant);
      for (const [name, value] of Object.entries(filters))
        query = query.eq(name, value);
      const { data, error } = await query.limit(1000);
      if (error) dbError(error);
      return data ?? [];
    },
    async get(table, tenant, id) {
      const { data, error } = await service
        .from(table)
        .select("*")
        .eq("tenant_id", tenant)
        .eq("id", id)
        .maybeSingle();
      if (error) dbError(error);
      return data;
    },
    async versions(tenant, ids) {
      const result: Row[] = [];
      for (let index = 0; index < ids.length; index += 100) {
        const { data, error } = await service
          .from("assessment_item_versions")
          .select("id,payload,created_by,approved_by")
          .eq("tenant_id", tenant)
          .in("id", ids.slice(index, index + 100));
        if (error) dbError(error);
        result.push(...(data ?? []));
      }
      return result;
    },
    async saturated(tenant, actor, registration) {
      const { data, error } = await service.rpc("assessment_blueprint_saturated", { p_actor: actor, p_tenant: tenant, p_registration: registration });
      if (error) dbError(error);
      return Array.isArray(data) ? data.map(String) : [];
    },
    async windowRequirements(tenant, ids) {
      const result: Row[] = [];
      for (let index = 0; index < ids.length; index += 100) {
        const { data, error } = await service
          .from("assessment_exam_windows")
          .select("id,title,required_services")
          .eq("tenant_id", tenant)
          .in("id", ids.slice(index, index + 100));
        if (error) dbError(error);
        result.push(...(data ?? []));
      }
      return result;
    },
    async key(tenant, itemVersion) {
      const { data, error } = await service
        .from("assessment_item_keys")
        .select("key")
        .eq("tenant_id", tenant)
        .eq("item_version_id", itemVersion)
        .maybeSingle();
      if (error) dbError(error);
      return data;
    },
    async command(actor, tenant, key, action, data) {
      const { data: result, error } = await service.rpc(action==='attempt.start'?"assessment_command_live_gate":"assessment_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
        ...(action==='attempt.start'?{p_live_enabled:options.liveLaunchEnabled===true}:{}),
      });
      if (error) dbError(error);
      return result;
    },
  };
}
