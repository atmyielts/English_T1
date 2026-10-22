import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type {
  InvitationRepository,
  InvitationView,
} from "./invitation-handler.ts";
type Auth = {
  auth: {
    getUser(
      token: string,
    ): Promise<
      {
        data: {
          user:
            | { id: string; email?: string; email_confirmed_at?: string }
            | null;
        };
        error: unknown;
      }
    >;
  };
};
type Database = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<
    { data: unknown; error: { code?: string; message: string } | null }
  >;
};
export function createInvitationRepository(
  auth: Auth,
  database: Database,
): InvitationRepository {
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
        status === 500 ? "Invitation database request failed." : error.message,
        status,
      );
    }
    return data;
  }
  return {
    async user(token) {
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user) return null;
      const user = data.user;
      return {
        id: user.id,
        email: user.email?.trim().toLowerCase() ?? null,
        verified: !!user.email_confirmed_at &&
          Number.isFinite(Date.parse(user.email_confirmed_at)),
      };
    },
    read: (actor, tenant, id, after, limit, link) =>
      rpc("assessment_invitation_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_id: id,
        p_after: after,
        p_limit: limit,
        p_link: link,
      }) as Promise<InvitationView | InvitationView[] | null>,
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_invitation_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
    preview: (actor, tenant, id, tokenHash, email) =>
      rpc("assessment_invitation_preview", {
        p_actor: actor,
        p_tenant: tenant,
        p_id: id,
        p_token_hash: tokenHash,
        p_verified_email: email,
      }),
    accept: (actor, tenant, key, id, tokenHash, email, reviewHash) =>
      rpc("assessment_invitation_accept", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_id: id,
        p_token_hash: tokenHash,
        p_verified_email: email,
        p_review_hash: reviewHash,
      }),
  };
}
