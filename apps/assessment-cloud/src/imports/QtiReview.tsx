import { useEffect, useRef, useState } from "react";
import type { QtiJob } from "../../../../packages/assessment-web/src/qti";
import { itemLabels } from "../../../../packages/assessment-core/src/authoring.ts";
import { ImportKey } from "./ImportKey";
import { QtiScanResult } from "./QtiScanResult";
export const qtiState: Record<string, string> = {
  uploading: "Upload incomplete",
  scan_queued: "Waiting for security scan",
  scanning: "Security scan in progress",
  parse_queued: "Waiting for question processing",
  parsing: "Processing questions",
  review_ready: "Ready for your review",
  blocked: "Package needs attention",
  adopted: "Sent to draft import review",
  cancelled: "Cancelled",
};
export function QtiReview({ job, disabled, send, more, openImport }: {
  job: QtiJob;
  disabled: boolean;
  send(action: string, data: Record<string, unknown>): void;
  more(): void;
  openImport(id: string): void;
}) {
  const [ack, setAck] = useState(false), [reason, setReason] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const terminal = ["adopted", "cancelled"].includes(job.state),
    base = { id: job.id, expected_revision: job.revision };
  return (
    <section aria-labelledby="qti-review-heading">
      <h2 id="qti-review-heading" tabIndex={-1} ref={heading}>
        Review QTI package
      </h2>
      <h3>{job.filename}</h3>
      <p role="status">{qtiState[job.state] ?? job.state}</p>
      <p>Source: {job.filename} · {job.total ?? 0} proposed questions</p>
      <details>
        <summary>Package identity</summary>
        <p>Source SHA-256: {job.source_hash}</p>
        <p>Reviewed result: {job.review_hash ?? "Not available yet"}</p>
      </details>
      <QtiScanResult scan={job.scan} />
      {job.state === "blocked" && (
        <p role="alert">
          This package cannot be adopted. Review its security result and content
          diagnostics. If neither explains the problem, ask your administrator
          to inspect processing.
        </p>
      )}
      {!!job.blocked.length && (
        <div>
          <h3>Content that could not be imported</h3>
          <ul>
            {job.blocked.map((entry, index) => (
              <li key={index}>
                <strong>{entry.path}</strong>
                <p>{entry.message}</p>
                <small>{entry.code}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="records">
        {job.rows.map((row) => (
          <li key={row.line}>
            <strong>
              Entry {row.line} · {itemLabels[row.item.type]} · {row.item.locale}
            </strong>
            <p className="import-prompt">{row.item.prompt}</p>
            {row.item.options && (
              <ul>
                {row.item.options.map((option) => (
                  <li key={option.id}>{option.id}: {option.text}</li>
                ))}
              </ul>
            )}
            <p>{row.item.max_score} points</p>
            <details>
              <summary>Answer key and source reference</summary>
              <ImportKey answer={row.key} />
              <p>{row.identifier} · {row.source_path}</p>
            </details>
            {row.warnings.map((warning, index) => (
              <p key={index}>Review warning: {warning}</p>
            ))}
          </li>
        ))}
      </ol>
      {job.rows.length < job.total && (
        <button className="quiet" disabled={disabled} onClick={more}>
          Load more QTI questions
        </button>
      )}
      {job.adoption && (
        <button
          disabled={disabled}
          onClick={() => openImport(job.adoption!.import_id)}
        >
          Continue draft import review
        </button>
      )}
      {!terminal && (
        <>
          <label>
            Reason for package decision<textarea
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {job.state === "review_ready" && (
            <>
              <p>
                Review every proposed question and answer key. Adoption only
                stages a protected bank import; it does not approve questions or
                publish an exam.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                />I reviewed all proposed questions, answer keys, warnings and
                source/licensing rights for this destination bank.
              </label>
              <button
                disabled={disabled || !ack || !reason.trim() ||
                  job.rows.length !== job.total || !!job.blocked.length ||
                  job.scan?.verdict !== "clean" ||
                  job.scan.byte_verified !== true}
                onClick={() =>
                  send("adopt", {
                    ...base,
                    review_hash: job.review_hash,
                    acknowledged: true,
                    reason,
                  })}
              >
                Adopt package for draft import
              </button>
            </>
          )}
          <div className="actions">
            <button
              className="quiet"
              disabled={disabled || !reason.trim()}
              onClick={() => send("cancel", { ...base, reason })}
            >
              Cancel QTI package
            </button>
          </div>
        </>
      )}
    </section>
  );
}
