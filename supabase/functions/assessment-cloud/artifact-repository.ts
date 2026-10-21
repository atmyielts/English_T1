import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { ArtifactRepository } from "./artifact-handler.ts";
type Client = {
  auth: {
    getUser(
      token: string,
    ): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};
export function createArtifactRepository(
  auth: Pick<Client, "auth">,
  service: Pick<Client, "rpc">,
): ArtifactRepository {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await service.rpc(name, args);
    if (error) {
      const status =
        error.code === "42501"
          ? 403
          : error.code === "P0002"
            ? 404
            : error.code === "23505"
              ? 409
              : ["22023", "23514", "23503"].includes(error.code ?? "")
                ? 422
                : 500;
      throw new ContractError(
        status === 500 ? "database_error" : error.message,
        status === 500 ? "Artifact database request failed" : error.message,
        status,
      );
    }
    return data;
  }
  return {
    async user(token) {
      const result = await auth.auth.getUser(token);
      return result.error ? null : (result.data.user?.id ?? null);
    },
    read: (actor, tenant, after, limit) =>
      rpc("assessment_artifact_read", {
        p_actor: actor,
        p_tenant: tenant,
        p_after: after,
        p_limit: limit,
      }),
    command: (actor, tenant, key, action, data) =>
      rpc("assessment_artifact_command", {
        p_actor: actor,
        p_tenant: tenant,
        p_key: key,
        p_action: action,
        p_data: data,
      }),
    transport: (actor, tenant, action, data) =>
      rpc("assessment_artifact_transport", {
        p_actor: actor,
        p_tenant: tenant,
        p_action: action,
        p_data: data,
      }),
    claim: (limit) => rpc("assessment_artifact_scan_claim", { p_limit: limit }),
    scanBundle: (job, token, renew) =>
      rpc("assessment_artifact_scan_bundle", {
        p_job: job,
        p_token: token,
        p_renew: renew,
      }),
    report: (report) =>
      rpc("assessment_artifact_scan_report", { p_report: report }),
  };
}
