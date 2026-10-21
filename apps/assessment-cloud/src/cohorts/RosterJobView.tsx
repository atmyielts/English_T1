import { useState } from "react";
import {
  type RosterJob,
  rosterOutcome,
  rosterState,
} from "../../../../packages/assessment-web/src/cohorts";
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
  const [reason, setReason] = useState(""), [ack, setAck] = useState(false);
  return (
    <section>
      <h2>Registration progress</h2>
      <h3>{job.window_snapshot.title}</h3>
      <p>
        <strong>{rosterState[job.state] ?? job.state}</strong> · {job.processed}
        {" "}
        of {job.total} entries processed
      </p>
      {job.blocked_reason && (
        <p role="status">
          Blocked reason:{" "}
          {job.blocked_reason.replaceAll("_", " ")}. An authorized coordinator
          must decide how to continue.
        </p>
      )}
      <ul aria-label="Registration outcome summary">
        {Object.entries(job.summary ?? {}).map(([outcome, count]) => (
          <li key={outcome}>{rosterOutcome[outcome]}: {count}</li>
        ))}
      </ul>
      <ul className="records" aria-label="Candidate registration outcomes">
        {job.targets?.map((target) => (
          <li key={target.user_id}>
            <strong>{target.name}</strong>
            <span>
              {target.extra_seconds} extra seconds ·{" "}
              {rosterOutcome[target.outcome]}
            </span>
          </li>
        ))}
      </ul>
      <button
        className="quiet"
        disabled={disabled}
        onClick={() => void refresh()}
      >
        Refresh registration progress
      </button>
      {["queued", "running", "blocked"].includes(job.state) && (
        <>
          <label>
            Reason for job action<textarea
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
            />I reviewed current progress. Cancellation affects only unprocessed
            entries. Resuming adopts authority for the same reviewed targets.
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
                Resume reviewed registration job
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
              Cancel remaining registrations
            </button>
          </div>
        </>
      )}
    </section>
  );
}
