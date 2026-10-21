import {
  ContractError,
  hash,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import {
  invitationCommand,
  invitationProof,
} from "../../../packages/assessment-core/src/invitations.ts";
import type { InvitationSigner } from "./invitation-signer.ts";
export interface InvitationView {
  id: string;
  tenant_id: string;
  key_id: string;
  state: string;
  [key: string]: unknown;
}
export interface InvitationIdentity {
  id: string;
  email: string | null;
  verified: boolean;
}
export interface InvitationRepository {
  user(token: string): Promise<InvitationIdentity | null>;
  read(
    actor: string,
    tenant: string,
    id: string | null,
    after: string | null,
    limit: number,
    link: boolean,
  ): Promise<InvitationView | InvitationView[] | null>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  preview(
    actor: string,
    tenant: string,
    id: string,
    tokenHash: string,
    email: string,
  ): Promise<unknown>;
  accept(
    actor: string,
    tenant: string,
    key: string,
    id: string,
    tokenHash: string,
    email: string,
    reviewHash: string,
  ): Promise<unknown>;
}
export interface InvitationConfiguration {
  enabled: boolean;
  signer: InvitationSigner | null;
  appUrl: string;
  allowLocalhost?: boolean;
}
export async function invitationBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new ContractError("invalid_json", "Expected an invitation request.");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 40000) {
        await reader.cancel();
        throw new ContractError(
          "payload_too_large",
          "Invitation request exceeds 40 KB",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new ContractError("invalid_json", "Expected a JSON object.");
  }
}
export function createInvitationHandler(
  repository: InvitationRepository,
  origins: string[],
  config: InvitationConfiguration,
) {
  let app: URL | null = null;
  try {
    const url = new URL(config.appUrl);
    if (
      !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" ||
        (config.allowLocalhost && url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
    ) app = url;
  } catch { /* Fail this namespace closed, not the whole service. */ }
  return async (req: Request) => {
    const origin = req.headers.get("origin"),
      headers: Record<string, string> = {
        "content-type": "application/json",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "vary": "Origin",
        "access-control-allow-headers":
          "authorization,apikey,content-type,idempotency-key",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      };
    if (origin && origins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
    }
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers });
    try {
      if (origin && !origins.includes(origin)) {
        throw new ContractError(
          "forbidden_origin",
          "This origin is not allowed.",
          403,
        );
      }
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      if (!config.enabled || !config.signer || !app) {
        throw new ContractError(
          "invitations_unavailable",
          "Staff invitations are not enabled in this environment.",
          503,
        );
      }
      const bearer = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = bearer ? await repository.user(bearer[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue.", 401);
      }
      const url = new URL(req.url),
        prefix = "/assessment-cloud/invitations/",
        index = url.pathname.indexOf(prefix);
      if (index < 0) {
        throw new ContractError(
          "not_found",
          "Invitation route not found.",
          404,
        );
      }
      const route = url.pathname.slice(index + prefix.length),
        tenant = uuid(url.searchParams.get("tenant_id"));
      const share = async (id: string) => {
        const invitation = await repository.read(
          actor.id,
          tenant,
          id,
          null,
          1,
          true,
        ) as InvitationView | null;
        if (!invitation) {
          throw new ContractError(
            "invitation_not_found",
            "Invitation not found.",
            404,
          );
        }
        const token = await config.signer!.token(tenant, id, invitation.key_id),
          link = new URL(app!);
        link.hash = new URLSearchParams({
          assessment_invite: JSON.stringify({ tenant, id, token }),
        }).toString();
        return { invitation, url: link.toString(), delivery: "share_link" };
      };
      if (req.method === "GET" && route === "list") {
        const limit = Number(url.searchParams.get("limit") ?? 50),
          after = url.searchParams.get("after");
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          throw new ContractError(
            "invalid_page_limit",
            "Use a page size of 1–100.",
          );
        }
        return reply(200, {
          data: await repository.read(
            actor.id,
            tenant,
            null,
            after ? uuid(after) : null,
            limit,
            false,
          ),
        });
      }
      if (req.method !== "POST") {
        throw new ContractError(
          "method_not_allowed",
          "Method not allowed.",
          405,
        );
      }
      const input = await invitationBody(req), data = object(input.data);
      if (route === "link") {
        return reply(200, { data: await share(uuid(data.id)) });
      }
      if (route === "preview" || route === "accept") {
        if (!actor.verified || !actor.email) {
          throw new ContractError(
            "verified_recipient_required",
            "Sign in with the invitation recipient’s verified email address.",
            403,
          );
        }
        const proof = invitationProof(data, route === "accept"),
          digest = await hash(proof.token);
        if (route === "preview") {
          return reply(200, {
            data: await repository.preview(
              actor.id,
              tenant,
              proof.id,
              digest,
              actor.email,
            ),
          });
        }
        const key = text(
          req.headers.get("idempotency-key"),
          "Command key",
          200,
        );
        if (key.length < 8) {
          throw new ContractError("invalid_key", "Use a stable command key.");
        }
        return reply(200, {
          data: await repository.accept(
            actor.id,
            tenant,
            key,
            proof.id,
            digest,
            actor.email,
            proof.review_hash!,
          ),
        });
      }
      if (route !== "commands") {
        throw new ContractError(
          "not_found",
          "Invitation route not found.",
          404,
        );
      }
      const key = text(req.headers.get("idempotency-key"), "Command key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Use a stable command key.");
      }
      const action = text(input.action, "Action", 80),
        command = invitationCommand(action, data);
      if (action === "invite.create") {
        // A committed retry retains its original key after active-key rotation.
        const existing = await repository.read(
          actor.id,
          tenant,
          command.id as string,
          null,
          1,
          false,
        ) as InvitationView | null;
        const keyId = existing?.key_id ?? config.signer.active,
          token = await config.signer.token(
            tenant,
            command.id as string,
            keyId,
          );
        command.key_id = keyId;
        command.token_hash = await hash(token);
      }
      return reply(200, {
        data: await repository.command(actor.id, tenant, key, action, command),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      console.error("assessment invitation request failed", {
        request_id: crypto.randomUUID(),
      });
      return reply(500, {
        code: "internal_error",
        error: "The invitation request could not be completed.",
      });
    }
  };
}
