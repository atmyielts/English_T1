import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { QtiRepository } from "./qti-handler.ts";
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
export function createQtiRepository(
  auth: AuthPort,
  service: DatabasePort,
): QtiRepository {
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
      status === 500 ? "The private QTI request failed." : error.message,
      status,
    );
  };
  return {
    async user(token) {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    read: (actor, tenant, id, after, limit) =>
      rpc("assessment_qti_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_id: id,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_qti_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
    transport: (actor, tenant, action, data) =>
      rpc("assessment_qti_transport", {
        p_actor: actor,
        p_tenant: tenant,
        p_action: action,
        p_data: data,
      }),
    claim: (stage, processor, limit) =>
      rpc("assessment_qti_claim", {
        p_stage: stage,
        p_processor: processor,
        p_limit: limit,
      }),
    bundle: (job, stage, token, processor, renew) =>
      rpc("assessment_qti_bundle", {
        p_job: job,
        p_stage: stage,
        p_token: token,
        p_processor: processor,
        p_renew: renew,
      }),
    report: (job, stage, token, processor, data) =>
      rpc("assessment_qti_report", {
        p_job: job,
        p_stage: stage,
        p_token: token,
        p_processor: processor,
        p_data: data,
      }),
  };
}
