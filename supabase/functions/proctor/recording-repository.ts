import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { RecordingRepository } from "./recording-handler.ts";
export interface RecordingDatabase {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<
    { data: unknown; error: { code?: string; message: string } | null }
  >;
}
export function createRecordingRepository(
  user: RecordingRepository["user"],
  database: RecordingDatabase,
): RecordingRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await database.rpc(name, args);
    if (error) {
      const status = error.code === "42501"
        ? 403
        : error.code === "P0002"
        ? 404
        : error.code === "23505"
        ? 409
        : ["22023", "23514", "23503", "22P02", "22003"].includes(
            error.code ?? "",
          )
        ? 422
        : 500;
      throw new ContractError(
        status === 500 ? "database_error" : error.message,
        status === 500 ? "Database request failed" : error.message,
        status,
      );
    }
    return data;
  }
  return {
    user,
    checkpoint: (actor, tenant, recording, sequence) =>
      rpc("proctor_recording_checkpoint", {
        p_actor: actor,
        p_tenant: tenant,
        p_recording: recording,
        p_sequence: sequence,
      }),
    catalog: (actor, tenant, session, after, limit) =>
      rpc("proctor_recording_catalog", {
        p_actor: actor,
        p_tenant: tenant,
        p_session: session,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("proctor_recording_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
    read: (actor, tenant, recording, after, limit) =>
      rpc("proctor_recording_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_recording: recording,
        p_after: after,
        p_limit: limit,
      }),
    transport: (actor, tenant, action, data) =>
      rpc("proctor_recording_transport", {
        p_actor: actor,
        p_tenant: tenant,
        p_action: action,
        p_data: data,
      }),
  };
}
