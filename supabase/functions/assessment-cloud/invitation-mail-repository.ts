import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { InvitationMailRepository } from "./invitation-mail-handler.ts";
import type { InvitationRepository } from "./invitation-handler.ts";
type Database = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<
    { data: unknown; error: { code?: string; message: string } | null }
  >;
};
export function createInvitationMailRepository(
  identity: Pick<InvitationRepository, "user">,
  database: Database,
): InvitationMailRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await database.rpc(name, args);
    if (error) {
      const status = error.code === "42501"
        ? 403
        : error.code === "P0002"
        ? 404
        : error.code === "23505"
        ? 409
        : ["22023", "22007", "22P02", "23514", "23503"].includes(
            error.code ?? "",
          )
        ? 422
        : 500;
      throw new ContractError(
        status === 500 ? "database_error" : error.message,
        status === 500
          ? "Invitation mail database request failed."
          : error.message,
        status,
      );
    }
    return data;
  }
  return {
    user: identity.user,
    read: (actor, tenant, invitation, after, limit) =>
      rpc("assessment_invitation_mail_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_invitation: invitation,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_invitation_mail_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
    claim: (limit) =>
      rpc("assessment_invitation_mail_claim", { p_limit: limit }),
    begin: (tenant, id, token) =>
      rpc("assessment_invitation_mail_begin", {
        p_tenant: tenant,
        p_id: id,
        p_token: token,
      }) as Promise<Record<string, unknown>>,
    report: (tenant, id, token, outcome, code) =>
      rpc("assessment_invitation_mail_report", {
        p_tenant: tenant,
        p_id: id,
        p_token: token,
        p_outcome: outcome,
        p_code: code,
      }),
  };
}
