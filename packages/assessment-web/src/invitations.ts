import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
import type { StaffCapability } from "../../assessment-core/src/staff";
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
    throw new Error(
      "This invitation link is incomplete. Ask the sender for the full link.",
    );
  }
}
export async function openInvitationCommands(
  tenant: string,
  actor: string,
  recipient = false,
  mail = false,
) {
  if (!navigator.locks) {
    throw new Error(
      "Secure workspace locking is required for staff invitations.",
    );
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
const problems: Record<string, string> = {
  invitation_recipient_required:
    "Sign in with the verified email address this invitation was sent to. The link must be complete.",
  verified_recipient_required:
    "Verify your Schood email, then sign in with the invitation recipient’s account.",
  recipient_profile_required:
    "Complete your Schood account setup before accepting this invitation.",
  invitation_unavailable:
    "This invitation has expired or was revoked. Ask the center for a replacement.",
  invitation_manager_required:
    "The sender no longer has permission to invite staff. Ask the center to review the invitation.",
  recipient_access_suspended:
    "Your access is suspended. An authorized manager must restore it; another invitation cannot bypass that decision.",
  pending_invitation_exists:
    "A pending invitation already exists for this email and role version. Review it in the list below.",
  invitation_review_changed:
    "The reviewed invitation does not match. Refresh and review it again.",
  invitation_link_unavailable:
    "Only the original sender can recover a pending, unexpired link while they still hold the required permissions.",
  invitation_finalized:
    "This invitation is already finalized. Refresh the list.",
  invitation_revision_conflict:
    "This invitation changed. Refresh before revoking it.",
  assignment_revision_conflict:
    "This person already has an assignment for that role. Review their permissions instead of replacing it through an invitation.",
};
export function invitationProblem(cause: unknown) {
  const code = (cause as { code?: string })?.code;
  return (code && problems[code]) ||
    (cause instanceof Error
      ? cause.message
      : "The invitation request could not be completed.");
}
