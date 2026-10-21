import { useState } from "react";
import {
  type RosterJob,
  rosterOutcomeText,
  rosterStateText,
} from "../../../../packages/assessment-web/src/cohorts";
import { useAppT } from "../i18n/index.ts";
export function RosterJobView({
  job,
  disabled,
  send,
  refresh,
}: {
  job: RosterJob;
  disabled: boolean;
  send: (
    action: string,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  refresh: () => Promise<void>;
}) {
  const t = useAppT();
  const [reason, setReason] = useState(""), [ack, setAck] = useState(false);
  return (
    <section>
      <h2>{t("job.title")}</h2>
      <h3>{job.window_snapshot.title}</h3>
      <p>
        <strong>{rosterStateText(job.state, t) ?? job.state}</strong> · {t("job.progress", { processed: String(job.processed), total: String(job.total) })}
      </p>
      {job.blocked_reason && (
        <p role="status">
          {t("job.blocked", { reason: job.blocked_reason.replaceAll("_", " ") })}
        </p>
      )}
      <ul aria-label={t("job.summaryLabel")}>
        {Object.entries(job.summary ?? {}).map(([outcome, count]) => (
          <li key={outcome}>{t("job.summaryRow", { outcome: rosterOutcomeText(outcome, t) ?? "", count: String(count) })}</li>
        ))}
      </ul>
      <ul className="records" aria-label={t("job.targetsLabel")}>
        {job.targets?.map((target) => (
          <li key={target.user_id}>
            <strong>{target.name}</strong>
            <span>
              {t("job.target", { count: target.extra_seconds, seconds: String(target.extra_seconds), outcome: rosterOutcomeText(target.outcome, t) ?? "" })}
            </span>
          </li>
        ))}
      </ul>
      <button
        className="quiet"
        disabled={disabled}
        onClick={() => void refresh()}
      >
        {t("job.refresh")}
      </button>
      {["queued", "running", "blocked"].includes(job.state) && (
        <>
          <label>
            {t("job.reason")}<textarea
              required
              maxLength={2000}
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
            />{t("job.ack")}
          </label>
          <div className="cohort-actions">
            {job.state === "blocked" && (
              <button
                disabled={disabled || !reason.trim() || !ack}
                onClick={() =>
                  void send("job.resume", {
                    job_id: job.id,
                    expected_revision: job.revision,
                    reason,
                  })}
              >
                {t("job.resume")}
              </button>
            )}
            <button
              className="quiet"
              disabled={disabled || !reason.trim() || !ack}
              onClick={() =>
                void send("job.cancel", {
                  job_id: job.id,
                  expected_revision: job.revision,
                  reason,
                })}
            >
              {t("job.cancel")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
