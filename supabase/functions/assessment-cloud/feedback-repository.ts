import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { FeedbackRepository } from "./feedback-handler.ts";
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
export function createFeedbackRepository(
  auth: AuthPort,
  service: DatabasePort,
): FeedbackRepository {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await service.rpc(name, args);
    if (!error) return data;
    const status = error.code === "42501"
      ? 403
      : error.code === "P0002"
      ? 404
      : error.code === "23505"
      ? 409
      : ["22023", "22P02", "23514", "23503", "23502", "22003", "22007", "22008"]
          .includes(error.code ?? "")
      ? 422
      : 500;
    throw new ContractError(
      status === 500 ? "database_error" : error.message,
      status === 500
        ? "The canonical feedback database request failed."
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
      rpc("assessment_feedback_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_kind: kind,
        p_id: id,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_feedback_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
  };
}
