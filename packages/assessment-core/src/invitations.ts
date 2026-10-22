import { ContractError, object, text, uuid } from "./mod.ts";
const invalid = (message: string): never => {
  throw new ContractError("invalid_invitation", message);
};
function timestamp(value: unknown, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === "")) {
    return null;
  }
  const raw = text(value, "Expiry", 80);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) {
    return invalid("Use an expiry with a timezone.");
  }
  return new Date(raw).toISOString();
}
export function invitationCommand(
  action: string,
  value: unknown,
): Record<string, unknown> {
  const data = object(value),
    id = uuid(data.id),
    reason = text(data.reason, "Reason", 5000);
  if (action === "invite.revoke") {
    if (
      !Number.isSafeInteger(data.expected_revision) ||
      Number(data.expected_revision) < 1
    ) return invalid("Refresh the invitation before revoking it.");
    return { id, expected_revision: data.expected_revision, reason };
  }
  if (action !== "invite.create") {
    return invalid("Choose a supported invitation action.");
  }
  const email = text(data.recipient_email, "Recipient email", 254)
    .toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
    return invalid("Enter the recipient’s email address.");
  }
  if (data.acknowledged !== true) {
    return invalid("Review the role and acknowledge its permissions.");
  }
  return {
    id,
    recipient_email: email,
    role_version_id: uuid(data.role_version_id),
    expires_at: timestamp(data.expires_at),
    permission_expires_at: timestamp(data.permission_expires_at, true),
    reason,
    acknowledged: true,
  };
}
export function invitationProof(value: unknown, accept = false) {
  const data = object(value),
    id = uuid(data.id),
    token = text(data.token, "Invitation token", 43);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return invalid("Open the complete invitation link.");
  }
  if (!accept) return { id, token };
  const review_hash = text(data.review_hash, "Reviewed invitation", 64);
  if (!/^[a-f0-9]{64}$/.test(review_hash) || data.acknowledged !== true) {
    return invalid(
      "Review and acknowledge the exact invitation before accepting.",
    );
  }
  return { id, token, review_hash };
}
