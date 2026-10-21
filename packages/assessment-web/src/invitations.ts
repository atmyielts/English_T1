import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
import type { StaffCapability } from "../../assessment-core/src/staff";
import {LocalizedError,english,isWebKey,messageText,type Translate} from './i18n/translate.ts';
export interface InvitationLink {
  tenant: string;
  id: string;
  token: string;
}
export interface StaffInvitation {
  id: string;
  tenant_id: string;
  recipient_email: string;
  role_version_id: string;
  role_title: string;
  role_version: number;
  capabilities: StaffCapability[];
  permission_expires_at: string | null;
  expires_at: string;
  created_by: string;
  state: "pending" | "accepted" | "revoked" | "expired";
  revision: number;
  review_hash: string;
  institution_name?: string;
}
export function invitationFromFragment(): InvitationLink | null {
  const raw = new URLSearchParams(location.hash.slice(1)).get(
    "assessment_invite",
  );
  if (raw === null) return null;
  try {
    if (raw.length > 500) throw new Error();
    const value = JSON.parse(raw);
    if (
      !/^[0-9a-f-]{36}$/i.test(value.tenant) ||
      !/^[0-9a-f-]{36}$/i.test(value.id) ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.token)
    ) throw new Error();
    return { tenant: value.tenant, id: value.id, token: value.token };
  } catch {
    throw new LocalizedError("invitation.linkIncomplete");
  }
}
export async function openInvitationCommands(
  tenant: string,
  actor: string,
  recipient = false,
  mail = false,
) {
  if (!navigator.locks) {
    throw new LocalizedError("invitation.locks");
  }
  const scope = `invitations:${
      mail ? 'mail' : recipient ? "recipient" : "manager"
    }:${tenant}:${actor}`,
    journal = await ResponseJournal.create(scope),
    lock = async <T>(work: () => Promise<T>): Promise<T> =>
      await navigator.locks.request(`schood-${scope}`, work);
  const commands = new GradeCommands(
    {
      async pending() {
        const rows = await journal.pending();
        if (!rows.length) return null;
        const value = rows[0].response as {
          action: string;
          data: Record<string, unknown>;
        };
        return { ...value, key: rows[0].command_key };
      },
      async save(action, data) {
        const row = await journal.append(1, "invitation-command", {
          action,
          data,
        });
        return { action, data, key: row.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request(
        `invitations/${mail ? 'mail/commands' : recipient ? "accept" : "commands"}`,
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    lock,
    "invitation",
  );
  return { commands, close: () => journal.close() };
}
/** Known invitation refusals are translated under `invitation.code.<code>`. */
export function invitationProblem(cause: unknown, t: Translate = english) {
  const code = (cause as { code?: string })?.code, key = `invitation.code.${code}`;
  return code && isWebKey(key)
    ? t(key)
    : messageText(cause, t, "invitation.problem.failed");
}
