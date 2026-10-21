import { useState } from "react";
import {
  feedbackDate,
  feedbackLabel,
  type FeedbackRelease,
} from "../../../../packages/assessment-web/src/feedback";
export function ReleaseFeedback(
  { release, locked, submit }: {
    release: FeedbackRelease;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<void>;
  },
) {
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <li>
      <h4>Generation {release.generation} · {release.id}</h4>
      <p>
        Result release: {feedbackDate(release.release_at)}. Recorded policy:
        {" "}
        {feedbackLabel(release.feedback_snapshot.level)}.
      </p>
      <p>
        {release.held
          ? "Additional feedback is withheld."
          : "No feedback hold."}
        {release.feedback_snapshot.level !== "totals" &&
          ` Detail time: ${
            feedbackDate(release.feedback_snapshot.available_at)
          }.`}
      </p>
      {release.feedback_snapshot.level !== "totals" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(release.held ? "release.resume" : "release.hold", {
              id: release.id,
              expected_revision: release.revision,
              reason,
            });
          }}
        >
          <label>
            Feedback decision reason<textarea
              required
              rows={2}
              maxLength={2000}
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
            />I confirm this changes detail access only, not the grade or
            overall result.
          </label>
          <button
            className="quiet"
            disabled={locked || !confirmed || !reason.trim()}
          >
            {release.held
              ? "Restore pinned feedback"
              : "Withhold additional feedback"}
          </button>
        </form>
      )}
    </li>
  );
}
