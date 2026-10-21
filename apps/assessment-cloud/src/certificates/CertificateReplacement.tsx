import { type FormEvent, useState } from "react";
import type {
  CertificateProgram,
  CertificateResult,
  CertificateRow,
} from "../../../../packages/assessment-web/src/certificates";
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
        A replacement is awaiting a signature. The original stays unchanged
        until signing commits. Review the pending record before another
        replacement.
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
        Replace certificate
      </button>
      {open && (
        <form onSubmit={(event) => void replace(event)}>
          <h3>Review a replacement for {row.claims.recipient}</h3>
          <p>
            Original:{" "}
            {row.id}. A replacement keeps this candidate and assessment attempt,
            uses the current recorded name and latest eligible released result,
            and requires independently approved criteria. It is a new award with
            a new issue date and expiry. Only its committed signature marks the
            original as replaced; no grade is changed.
          </p>
          <label>
            Replacement program<select
              required
              value={program}
              disabled={disabled}
              onChange={(event) => {
                setProgram(event.target.value);
                setAck(false);
              }}
            >
              <option value="">Choose an active approved program</option>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · Minimum {item.minimum_percent}%
                </option>
              ))}
            </select>
          </label>
          {policy && (
            <p>
              {policy.description} · {policy.valid_days
                ? `${policy.valid_days} days validity from the new issue date`
                : "No scheduled expiry"}
            </p>
          )}
          <label>
            Replacement released result<select
              required
              value={score}
              disabled={disabled}
              onChange={(event) => {
                setScore(event.target.value);
                setAck(false);
              }}
            >
              <option value="">Choose this candidate’s current result</option>
              {options.map((item) => (
                <option
                  key={item.score_revision_id}
                  value={item.score_revision_id}
                >
                  {item.candidate} · {item.exam} · Generation {item.generation}
                </option>
              ))}
            </select>
          </label>
          {!options.length && (
            <p>
              Load or refresh released results for this original attempt. A
              different candidate or assessment cannot be substituted.
            </p>
          )}
          <label>
            Replacement reason<textarea
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
            />I reviewed the original, recipient, current result, replacement
            criteria and new validity period, and authorize this replacement.
          </label>
          <button
            disabled={disabled || !policy || !result || !reason.trim() || !ack}
          >
            Issue replacement certificate
          </button>
        </form>
      )}
    </div>
  );
}
