import { type FormEvent, useState } from "react";
import type { CertificateProgram } from "../../../../packages/assessment-web/src/certificates";
export function ProgramRetirement(
  { program, disabled, send }: {
    program: CertificateProgram;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  async function retire(event: FormEvent) {
    event.preventDefault();
    if (!ack || !reason.trim()) return;
    await send("program.retire", {
      id: program.id,
      review_hash: program.review_hash,
      reason,
    });
  }
  if (program.retirement) {
    return (
      <p>
        Retired {new Date(program.retirement.retired_at).toLocaleDateString()}.
        {" "}
        {program.retirement.reason}{" "}
        Existing signed awards remain in their original history.
      </p>
    );
  }
  return (
    <div>
      <button
        className="quiet"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Retire program
      </button>
      {open && (
        <form onSubmit={(event) => void retire(event)}>
          <h4>Retire {program.title}</h4>
          <p>
            This permanently stops approval and new signing under this program,
            including unfinished preparations. Existing signed awards are not
            revoked. Create and independently approve a new program to change
            its criteria.
          </p>
          <label>
            Program retirement reason<textarea
              required
              maxLength={5000}
              value={reason}
              disabled={disabled}
              onChange={(event) => {
                setReason(event.target.value);
                setAck(false);
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              disabled={disabled}
              onChange={(event) => setAck(event.target.checked)}
            />I reviewed this program and understand that retirement is
            permanent and does not revoke existing awards.
          </label>
          <button disabled={disabled || !reason.trim() || !ack}>
            Confirm program retirement
          </button>
        </form>
      )}
    </div>
  );
}
