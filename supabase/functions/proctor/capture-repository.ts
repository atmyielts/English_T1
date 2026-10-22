import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { CaptureRepository } from "./capture-handler.ts";
import type { RecordingDatabase } from "./recording-repository.ts";
export function createCaptureRepository(
  user: CaptureRepository["user"],
  database: RecordingDatabase,
  options:{liveLaunchEnabled?:boolean}={},
): CaptureRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await database.rpc(name, args);
    if (!error) return data;
    const status = error.code === "42501"
      ? 403
      : error.code === "P0002"
      ? 404
      : error.code === "23505"
      ? 409
      : ["22023", "23514", "23503", "23502", "22P02", "22003"].includes(
          error.code ?? "",
        )
      ? 422
      : 500;
    throw new ContractError(
      status === 500 ? "database_error" : error.message,
      status === 500
        ? "The canonical capture database request failed."
        : error.message,
      status,
    );
  }
  return {
    user,
    read: (actor, tenant, session) =>
      rpc("proctor_capture_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_session: session,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc(action==='capture.open'?"proctor_capture_command_live_gate":"proctor_capture_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
        ...(action==='capture.open'?{p_live_enabled:options.liveLaunchEnabled===true}:{}),
      }),
  };
}
