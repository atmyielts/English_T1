import { type FormEvent, useState } from "react";
import type { CertificateProgram } from "../../../../packages/assessment-web/src/certificates";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function ProgramRetirement(
  { program, disabled, send }: {
    program: CertificateProgram;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const t = useAppT(), { date } = useI18n();
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
        {t("retirement.done", { date: date(program.retirement.retired_at, { dateStyle: "short" }), reason: program.retirement.reason })}
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
        {t("retirement.open")}
      </button>
      {open && (
        <form onSubmit={(event) => void retire(event)}>
          <h4>{t("retirement.title", { title: program.title })}</h4>
          <p>
            {t("retirement.lead")}
          </p>
          <label>
            {t("retirement.reason")}<textarea
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
            />{t("retirement.ack")}
          </label>
          <button disabled={disabled || !reason.trim() || !ack}>
            {t("retirement.confirm")}
          </button>
        </form>
      )}
    </div>
  );
}
