import { useEffect, useRef, useState } from "react";
import type { BankImport } from "../../../../packages/assessment-web/src/bank-import";
import { itemLabels } from "../../../../packages/assessment-core/src/authoring.ts";
import { ImportKey } from "./ImportKey";
export function ImportReview(
  { job, actor, disabled, send, more, reviewDrafts }: {
    job: BankImport;
    actor: string;
    disabled: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<unknown>;
    more: () => void;
    reviewDrafts: () => void;
  },
) {
  const [reason, setReason] = useState(""), [ack, setAck] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const terminal = ["completed", "cancelled"].includes(job.state),
    base = { id: job.id, expected_revision: job.revision };
  return (
    <section aria-labelledby="import-review-heading">
      <h2 id="import-review-heading" tabIndex={-1} ref={heading}>Review imported questions</h2>
      <h3>{job.source_name}</h3>
      <p role="status">
        {job.state} · {job.processed} of {job.total} drafts created
      </p>
      <p>
        Imported questions remain drafts. A separate human must review and
        approve them before they can be published in an exam. Cancelling
        preserves drafts already created.
      </p>
      {job.processed > 0 && (
        <button className="quiet" disabled={disabled} onClick={reviewDrafts}>
          Open question drafts for review
        </button>
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
            <p>{row.item.max_score} points · {row.state}</p>
            <details>
              <summary>Answer key and provenance</summary>
              <ImportKey answer={row.key} />
              <p>Source SHA-256: {job.source_hash}</p>
            </details>
            {row.warnings.map((warning) => (
              <p key={warning} role="status">Review warning: {warning}</p>
            ))}
          </li>
        ))}
      </ol>
      {job.rows.length < job.total && (
        <button className="quiet" disabled={disabled} onClick={more}>
          Load more imported questions
        </button>
      )}
      {!terminal && (
        <>
          <label>
            Reason for import decision<textarea
              value={reason}
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />I reviewed the file, destination bank and warnings. Duplicate
            entries will create separate drafts.
          </label>
          <div className="actions">
            <button
              disabled={disabled || !ack || !reason.trim()}
              onClick={() =>
                void send("confirm", {
                  ...base,
                  review_hash: job.review_hash,
                  reason,
                })}
            >
              {job.state === "staged"
                ? "Confirm reviewed import"
                : "Adopt reviewed import"}
            </button>
            {job.state === "importing" && job.authorized_by === actor && (
              <button
                disabled={disabled}
                onClick={() => void send("step", base)}
              >
                Create next 50 question drafts
              </button>
            )}
            <button
              className="quiet"
              disabled={disabled || !ack || !reason.trim()}
              onClick={() => void send("cancel", { ...base, reason })}
            >
              Cancel remaining import
            </button>
          </div>
        </>
      )}
    </section>
  );
}
