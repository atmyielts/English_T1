import {
  ContractError,
  hash,
  object,
  text,
  uuid,
} from "../../../packages/assessment-core/src/mod.ts";
import { invitationMailCommand } from "../../../packages/assessment-core/src/invitation-mail.ts";
import type {
  InvitationConfiguration,
  InvitationIdentity,
  InvitationView,
} from "./invitation-handler.ts";
import { invitationBody } from "./invitation-handler.ts";
import { invitationMailTemplate } from "./invitation-mail-template.ts";
export interface InvitationMailRepository {
  user(token: string): Promise<InvitationIdentity | null>;
  read(
    actor: string,
    tenant: string,
    invitation: string,
    after: string | null,
    limit: number,
  ): Promise<unknown>;
  command(
    actor: string,
    tenant: string,
    key: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  claim(limit: number): Promise<unknown>;
  begin(
    tenant: string,
    id: string,
    token: string,
  ): Promise<Record<string, unknown>>;
  report(
    tenant: string,
    id: string,
    token: string,
    outcome: string,
    code: string,
  ): Promise<unknown>;
}
export interface InvitationMailConfiguration extends InvitationConfiguration {
  workerSecret: string;
}
export function createInvitationMailHandler(
  repository: InvitationMailRepository,
  origins: string[],
  config: InvitationMailConfiguration,
) {
  let app: URL | null = null;
  try {
    const url = new URL(config.appUrl);
    if (
      !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" ||
        (config.allowLocalhost && url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    ) app = url;
  } catch { /* Isolated configuration. */ }
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
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers });
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
      if (
        !config.enabled || !config.signer || !app ||
        config.workerSecret.length < 32
      ) {
        throw new ContractError(
          "invitation_mail_unavailable",
          "Invitation email is not enabled in this environment.",
          503,
        );
      }
      const url = new URL(req.url),
        prefix = "/assessment-cloud/invitations/mail/",
        index = url.pathname.indexOf(prefix);
      if (index < 0) {
        throw new ContractError("not_found", "Mail route not found.", 404);
      }
      const route = url.pathname.slice(index + prefix.length);
      if (route === "internal" && req.method === "POST") {
        const left = await hash(req.headers.get("x-assessment-mail-key") ?? ""),
          right = await hash(config.workerSecret);
        let different = 0;
        for (let i = 0; i < left.length; i++) {
          different |= left.charCodeAt(i) ^ right.charCodeAt(i);
        }
        if (different) {
          throw new ContractError(
            "mail_worker_required",
            "A trusted mail worker is required.",
            403,
          );
        }
        const input = await invitationBody(req), data = object(input.data);
        if (input.action === "mail.claim") {
          const limit = Number(data.limit);
          if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
            throw new ContractError(
              "invalid_page_limit",
              "Use a claim size of 1–20.",
            );
          }
          return reply(200, { data: await repository.claim(limit) });
        }
        const tenant = uuid(data.tenant_id),
          id = uuid(data.id),
          token = uuid(data.lease_token);
        if (input.action === "mail.report") {
          return reply(200, {
            data: await repository.report(
              tenant,
              id,
              token,
              text(data.outcome, "Outcome", 20),
              text(data.code, "Outcome code", 80),
            ),
          });
        }
        if (input.action !== "mail.begin") {
          throw new ContractError(
            "invalid_mail_action",
            "Unsupported mail worker action.",
          );
        }
        const handoff = await repository.begin(tenant, id, token);
        if (handoff.send !== true) return reply(200, { data: handoff });
        try {
          const invitation = handoff.invitation as InvitationView,
            secret = await config.signer.token(
              tenant,
              invitation.id,
              invitation.key_id,
            ),
            link = new URL(app);
          link.hash = new URLSearchParams({
            assessment_invite: JSON.stringify({
              tenant,
              id: invitation.id,
              token: secret,
            }),
          }).toString();
          if (!["uz", "ru", "en"].includes(String(handoff.locale))) {
            throw new Error("Invalid canonical mail locale");
          }
          return reply(200, {
            data: {
              id,
              state: "sending",
              send: true,
              message: invitationMailTemplate(
                id,
                handoff.locale as "uz" | "ru" | "en",
                String(handoff.kind),
                invitation,
                String(handoff.institution_name),
                link.toString(),
              ),
            },
          });
        } catch {
          await repository.report(
            tenant,
            id,
            token,
            "failed",
            "render_unavailable",
          );
          throw new ContractError(
            "mail_render_unavailable",
            "The invitation could not be prepared. Restore its key/configuration before explicitly retrying.",
            503,
          );
        }
      }
      const bearer = /^Bearer (\S+)$/.exec(
          req.headers.get("authorization") ?? "",
        ),
        actor = bearer ? await repository.user(bearer[1]) : null;
      if (!actor) {
        throw new ContractError("unauthorized", "Sign in to continue.", 401);
      }
      const tenant = uuid(url.searchParams.get("tenant_id"));
      if (route === "list" && req.method === "GET") {
        const after = url.searchParams.get("after"),
          limit = Number(url.searchParams.get("limit") ?? 50);
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
            uuid(url.searchParams.get("invitation_id")),
            after ? uuid(after) : null,
            limit,
          ),
        });
      }
      if (route !== "commands" || req.method !== "POST") {
        throw new ContractError("not_found", "Mail route not found.", 404);
      }
      const input = await invitationBody(req),
        action = text(input.action, "Action", 80),
        key = text(req.headers.get("idempotency-key"), "Command key", 200);
      if (key.length < 8) {
        throw new ContractError("invalid_key", "Use a stable command key.");
      }
      return reply(200, {
        data: await repository.command(
          actor.id,
          tenant,
          key,
          action,
          invitationMailCommand(action, input.data),
        ),
      });
    } catch (cause) {
      if (cause instanceof ContractError) {
        return reply(cause.status, { code: cause.code, error: cause.message });
      }
      console.error("assessment invitation mail request failed", {
        request_id: crypto.randomUUID(),
      });
      return reply(500, {
        code: "internal_error",
        error: "The invitation email request could not be completed.",
      });
    }
  };
}
