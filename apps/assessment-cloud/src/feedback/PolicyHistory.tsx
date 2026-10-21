import { useState } from "react";
import {
  feedbackDate,
  type FeedbackHistory,
  feedbackLabel,
} from "../../../../packages/assessment-web/src/feedback";
export function PolicyHistory(
  { history, actor, locked, submit }: {
    history: FeedbackHistory;
    actor: string;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<void>;
  },
) {
  const [reviewed, setReviewed] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <section>
      <h3>Recorded policy versions</h3>
      {!history.versions.length && (
        <p>
          No policy has been proposed. New releases share only the overall
          total.
        </p>
      )}
      <ul className="records">
        {history.versions.map((version) => (
          <li key={version.id}>
            <h4>Version {version.version} · {feedbackLabel(version.level)}</h4>
            <p>
              {version.level === "totals"
                ? "No section or question points."
                : `Details: ${feedbackDate(version.available_after)}.`}
            </p>
            <p>{version.reason}</p>
            <p>
              {version.approved
                ? "Independently approved"
                : version.created_by === actor
                ? "Your proposal · another authorized person must approve"
                : "Awaiting independent approval"}
              {history.current.version_id === version.id
                ? " · active for future releases"
                : ""}
            </p>
            {version.can_approve && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit("policy.approve", {
                    id: version.id,
                    expected_revision: history.revision,
                    review_hash: version.review_hash,
                  });
                }}
              >
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={reviewed === version.id}
                    onChange={(event) =>
                      setReviewed(event.target.checked ? version.id : "")}
                  />I independently reviewed version{" "}
                  {version.version}, its detail level and timing.
                </label>
                <button disabled={locked || reviewed !== version.id}>
                  Approve feedback version {version.version}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {history.current.version_id && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit("policy.suspend", {
              window_id: history.window_id,
              expected_revision: history.revision,
              reason,
            });
          }}
        >
          <h4>Return future releases to totals only</h4>
          <p>
            This does not retract details from existing releases. Use the
            release-specific withholding controls below.
          </p>
          <label>
            Suspension reason<textarea
              required
              maxLength={2000}
              rows={2}
              disabled={locked}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              disabled={locked}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />I understand existing release snapshots are unchanged.
          </label>
          <button
            className="quiet"
            disabled={locked || !confirmed || !reason.trim()}
          >
            Suspend policy for future releases
          </button>
        </form>
      )}
    </section>
  );
}
