import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { MediaAnswerRepository } from "./media-answer-handler.ts";
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
export function createMediaAnswerRepository(
  auth: AuthPort,
  service: DatabasePort,
): MediaAnswerRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await service.rpc(name, args);
    if (!error) return data;
    const status = error.code === "42501"
      ? 403
      : error.code === "P0002"
      ? 404
      : error.code === "23505"
      ? 409
      : ["22023", "23514", "23503", "22P02", "23502", "22003"].includes(
          error.code ?? "",
        )
      ? 422
      : 500;
    throw new ContractError(
      status === 500 ? "database_error" : error.message,
      status === 500
        ? "Academic answer database request failed"
        : error.message,
      status,
    );
  }
  return {
    async user(token) {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    read: (actor, tenant, attempt, item) =>
      rpc("assessment_answer_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_attempt: attempt,
        p_item: item,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_answer_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
  };
}
