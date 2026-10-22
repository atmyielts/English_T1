import { type FormEvent, useState } from "react";
import type {
  CertificateProgram,
  CertificateResult,
  CertificateRow,
} from "../../../../packages/assessment-web/src/certificates";
import { useAppT } from "../i18n/index.ts";
export function CertificateReplacement({
  row,
  programs,
  results,
  disabled,
  send,
}: {
  row: CertificateRow;
  programs: CertificateProgram[];
  results: CertificateResult[];
  disabled: boolean;
  send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useAppT();
  const [open, setOpen] = useState(false),
    [program, setProgram] = useState(""),
    [score, setScore] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  if (row.state !== "issued" || row.replacement_id || !row.attempt_id) {
    return null;
  }
  if (row.replacement_pending) {
    return (
      <p>
        {t("replacement.awaiting")}
      </p>
    );
  }
  const eligible = programs.filter((item) =>
      item.approved_by && !item.retirement
    ),
    policy = eligible.find((item) => item.id === program),
    options = results.filter((result) => result.attempt_id === row.attempt_id),
    result = options.find((item) => item.score_revision_id === score);
  async function replace(event: FormEvent) {
    event.preventDefault();
    if (!policy || !result || !ack || !reason.trim()) return;
    await send("certificate.replace", {
      id: row.id,
      expected_revision: row.revision,
      program_id: policy.id,
      attempt_id: result.attempt_id,
      score_revision_id: result.score_revision_id,
      reason,
    });
  }
  return (
    <div className="certificate-replacement">
      <button
        className="quiet"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t("replacement.open")}
      </button>
      {open && (
        <form onSubmit={(event) => void replace(event)}>
          <h3>{t("replacement.title", { recipient: row.claims.recipient })}</h3>
          <p>
            {t("replacement.lead", { id: row.id })}
          </p>
          <label>
            {t("replacement.program")}<select
              required
              value={program}
              disabled={disabled}
              onChange={(event) => {
                setProgram(event.target.value);
                setAck(false);
              }}
            >
              <option value="">{t("replacement.chooseProgram")}</option>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {t("issuer.programOption", { title: item.title, minimum: String(item.minimum_percent) })}
                </option>
              ))}
            </select>
          </label>
          {policy && (
            <p>
              {t("replacement.policy", { description: policy.description, validity: policy.valid_days
                ? t("replacement.validity", { count: policy.valid_days, days: String(policy.valid_days) })
                : t("replacement.noExpiry") })}
            </p>
          )}
          <label>
            {t("replacement.result")}<select
              required
              value={score}
              disabled={disabled}
              onChange={(event) => {
                setScore(event.target.value);
                setAck(false);
              }}
            >
              <option value="">{t("replacement.chooseResult")}</option>
              {options.map((item) => (
                <option
                  key={item.score_revision_id}
                  value={item.score_revision_id}
                >
                  {t("issuer.resultOption", { candidate: item.candidate, exam: item.exam, generation: String(item.generation) })}
                </option>
              ))}
            </select>
          </label>
          {!options.length && (
            <p>
              {t("replacement.noResults")}
            </p>
          )}
          <label>
            {t("replacement.reason")}<textarea
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
            />{t("replacement.ack")}
          </label>
          <button
            disabled={disabled || !policy || !result || !reason.trim() || !ack}
          >
            {t("replacement.issue")}
          </button>
        </form>
      )}
    </div>
  );
}
