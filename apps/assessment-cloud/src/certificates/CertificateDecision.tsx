import { type FormEvent, useState } from "react";
import type { CertificateRow } from "../../../../packages/assessment-web/src/certificates";
import { useAppT } from "../i18n/index.ts";
export function CertificateDecision(
  { row, disabled, send }: {
    row: CertificateRow;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const t = useAppT();
  const [reason, setReason] = useState(""), [ack, setAck] = useState(false);
  if (!["issued", "pending"].includes(row.state)) return null;
  const cancel = row.state === "pending";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (ack) {
      await send(cancel ? "certificate.cancel" : "certificate.revoke", {
        id: row.id,
        expected_revision: row.revision,
        reason,
      });
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <label>
        {cancel ? t("decision.cancelReason") : t("decision.revokeReason")}
        <textarea
          required
          maxLength={5000}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setAck(false);
          }}
          disabled={disabled}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={ack}
          onChange={(event) => setAck(event.target.checked)}
          disabled={disabled}
        />
        {cancel
          ? t("decision.cancelAck")
          : t("decision.revokeAck")}
      </label>
      <button className="quiet" disabled={disabled || !reason.trim() || !ack}>
        {cancel ? t("decision.cancel") : t("decision.revoke")}
      </button>
    </form>
  );
}
