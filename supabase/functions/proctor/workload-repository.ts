import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { RecordingDatabase } from "./recording-repository.ts";
import type { WorkloadRepository } from "./workload-handler.ts";
export function createWorkloadRepository(
  user: WorkloadRepository["user"],
  database: RecordingDatabase,
): WorkloadRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await database.rpc(name, args);
    if (error) {
      const status = error.code === "42501"
        ? 403
        : error.code === "P0002"
        ? 404
        : error.code === "23505"
        ? 409
        : ["22023", "23514", "23502", "22P02", "22007", "22008", "22003"]
            .includes(error.code ?? "")
        ? 422
        : 500;
      throw new ContractError(
        status === 500 ? "database_error" : error.message,
        status === 500
          ? "The workload database request failed."
          : error.message,
        status,
      );
    }
    return data;
  }
  return {
    user,
    read: (actor, tenant, data) =>
      rpc("proctor_workload_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_data: data,
      }),
    staff: (actor, tenant, role, after, limit) =>
      rpc("proctor_workload_staff", {
        p_actor: actor,
        p_tenant: tenant,
        p_role: role,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("proctor_workload_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
  };
}
