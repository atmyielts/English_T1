import { useEffect, useRef, useState } from "react";
import type { QtiJob } from "../../../../packages/assessment-web/src/qti";
import { useAppT, useCodeText, useItemLabel } from "../i18n/index.ts";
import { ImportKey } from "./ImportKey";
import { QtiScanResult } from "./QtiScanResult";
/** Reader-language QTI job state (`qti.state.<code>`); unknown codes show as given. */
export function useQtiState() {
  const codeText = useCodeText();
  return (state: string) => codeText("qti.state", state);
}
export function QtiReview({ job, disabled, send, more, openImport }: {
  job: QtiJob;
  disabled: boolean;
  send(action: string, data: Record<string, unknown>): void;
  more(): void;
  openImport(id: string): void;
}) {
  const t = useAppT(), itemLabel = useItemLabel(), qtiState = useQtiState();
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
        {t("qtiReview.title")}
      </h2>
      <h3>{job.filename}</h3>
      <p role="status">{qtiState(job.state)}</p>
      <p>{t("qtiReview.source", { name: job.filename, count: String(job.total ?? 0) })}</p>
      <details>
        <summary>{t("qtiReview.identity")}</summary>
        <p>{t("importReview.sha", { hash: job.source_hash })}</p>
        <p>{t("qtiReview.reviewed", { hash: job.review_hash ?? t("qtiReview.notYet") })}</p>
      </details>
      <QtiScanResult scan={job.scan} />
      {job.state === "blocked" && (
        <p role="alert">
          {t("qtiReview.blocked")}
        </p>
      )}
      {!!job.blocked.length && (
        <div>
          <h3>{t("qtiReview.unimported")}</h3>
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
            <p>{t("qtiReview.points", { score: String(row.item.max_score) })}</p>
            <details>
              <summary>{t("qtiReview.reference")}</summary>
              <ImportKey answer={row.key} />
              <p>{row.identifier} · {row.source_path}</p>
            </details>
            {row.warnings.map((warning, index) => (
              <p key={index}>{t("importReview.warning", { warning })}</p>
            ))}
          </li>
        ))}
      </ol>
      {job.rows.length < job.total && (
        <button className="quiet" disabled={disabled} onClick={more}>
          {t("qtiReview.more")}
        </button>
      )}
      {job.adoption && (
        <button
          disabled={disabled}
          onClick={() => openImport(job.adoption!.import_id)}
        >
          {t("qtiReview.continue")}
        </button>
      )}
      {!terminal && (
        <>
          <label>
            {t("qtiReview.reason")}<textarea
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {job.state === "review_ready" && (
            <>
              <p>
                {t("qtiReview.adoptLead")}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                />{t("qtiReview.ack")}
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
                {t("qtiReview.adopt")}
              </button>
            </>
          )}
          <div className="actions">
            <button
              className="quiet"
              disabled={disabled || !reason.trim()}
              onClick={() => send("cancel", { ...base, reason })}
            >
              {t("qtiReview.cancel")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
