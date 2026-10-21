import { ContractError, object, text, uuid } from "./mod.ts";
const fail = (message: string): never => {
  throw new ContractError("invalid_invitation_mail", message);
};
const revision = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return fail("Refresh the invitation or delivery before changing it.");
  }
  return value;
};
export function invitationMailCommand(
  action: string,
  value: unknown,
): Record<string, unknown> {
  const data = object(value),
    id = uuid(data.id),
    reason = text(data.reason, "Delivery reason", 5000);
  if (data.acknowledged !== true) {
    return fail(
      "Review the recipient, delivery and schedule before confirming.",
    );
  }
  if (action === "mail.cancel") {
    return {
      id,
      expected_revision: revision(data.expected_revision),
      reason,
      acknowledged: true,
    };
  }
  if (action !== "mail.queue") return fail("Choose a supported mail action.");
  const sendAfter = text(data.send_after, "Send time", 80);
  if (
    !/(Z|[+-]\d{2}:\d{2})$/.test(sendAfter) ||
    !Number.isFinite(Date.parse(sendAfter)) ||
    !["uz", "ru", "en"].includes(String(data.locale)) ||
    !["invitation", "reminder"].includes(String(data.kind))
  ) return fail("Choose a language, message type and send time with timezone.");
  const retry = data.retry_of === null || data.retry_of === undefined
    ? null
    : uuid(data.retry_of);
  return {
    id,
    invitation_id: uuid(data.invitation_id),
    expected_invitation_revision: revision(data.expected_invitation_revision),
    send_after: new Date(sendAfter).toISOString(),
    kind: data.kind,
    locale: data.locale,
    retry_of: retry,
    expected_source_revision: retry
      ? revision(data.expected_source_revision)
      : null,
    possible_duplicate_ack: data.possible_duplicate_ack === true,
    reason,
    acknowledged: true,
  };
}
