import { type FormEvent, useState } from "react";
import type { CertificateRow } from "../../../../packages/assessment-web/src/certificates";
export function CertificateDecision(
  { row, disabled, send }: {
    row: CertificateRow;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
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
        {cancel ? "Cancellation reason" : "Revocation reason"}
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
          ? "Cancel this unfinished issuance permanently."
          : "I understand that this permanent revocation changes verification status but does not change the academic result."}
      </label>
      <button className="quiet" disabled={disabled || !reason.trim() || !ack}>
        {cancel ? "Cancel pending certificate" : "Revoke certificate"}
      </button>
    </form>
  );
}
