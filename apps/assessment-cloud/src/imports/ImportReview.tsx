import { useEffect, useRef, useState } from "react";
import type { BankImport } from "../../../../packages/assessment-web/src/bank-import";
import { useAppT, useItemLabel } from "../i18n/index.ts";
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
  const t = useAppT(), itemLabel = useItemLabel();
  const [reason, setReason] = useState(""), [ack, setAck] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const terminal = ["completed", "cancelled"].includes(job.state),
    base = { id: job.id, expected_revision: job.revision };
  return (
    <section aria-labelledby="import-review-heading">
      <h2 id="import-review-heading" tabIndex={-1} ref={heading}>{t("importReview.title")}</h2>
      <h3>{job.source_name}</h3>
      <p role="status">
        {t("importReview.status", { state: job.state, processed: String(job.processed), total: String(job.total) })}
      </p>
      <p>
        {t("importReview.lead")}
      </p>
      {job.processed > 0 && (
        <button className="quiet" disabled={disabled} onClick={reviewDrafts}>
          {t("importReview.openDrafts")}
        </button>
      )}
      <ol className="records">
        {job.rows.map((row) => (
          <li key={row.line}>
            <strong>
              {t("importReview.entry", { line: String(row.line), type: itemLabel(row.item.type) ?? "", locale: row.item.locale })}
            </strong>
            <p className="import-prompt">{row.item.prompt}</p>
            {row.item.options && (
              <ul>
                {row.item.options.map((option) => (
                  <li key={option.id}>{t("importReview.option", { id: option.id, text: option.text })}</li>
                ))}
              </ul>
            )}
            <p>{t("importReview.points", { score: String(row.item.max_score), state: row.state })}</p>
            <details>
              <summary>{t("importReview.provenance")}</summary>
              <ImportKey answer={row.key} />
              <p>{t("importReview.sha", { hash: job.source_hash })}</p>
            </details>
            {row.warnings.map((warning) => (
              <p key={warning} role="status">{t("importReview.warning", { warning })}</p>
            ))}
          </li>
        ))}
      </ol>
      {job.rows.length < job.total && (
        <button className="quiet" disabled={disabled} onClick={more}>
          {t("importReview.more")}
        </button>
      )}
      {!terminal && (
        <>
          <label>
            {t("importReview.reason")}<textarea
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
            />{t("importReview.ack")}
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
                ? t("importReview.confirm")
                : t("importReview.adopt")}
            </button>
            {job.state === "importing" && job.authorized_by === actor && (
              <button
                disabled={disabled}
                onClick={() => void send("step", base)}
              >
                {t("importReview.step")}
              </button>
            )}
            <button
              className="quiet"
              disabled={disabled || !ack || !reason.trim()}
              onClick={() => void send("cancel", { ...base, reason })}
            >
              {t("importReview.cancel")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
