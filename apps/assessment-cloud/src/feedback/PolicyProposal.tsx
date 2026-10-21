import { useState } from "react";
import {
  type FeedbackHistory,
  type FeedbackLevel,
} from "../../../../packages/assessment-web/src/feedback";
export function PolicyProposal(
  { history, locked, submit }: {
    history: FeedbackHistory;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<void>;
  },
) {
  const [level, setLevel] = useState<FeedbackLevel>("totals"),
    [after, setAfter] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit("policy.propose", {
          window_id: history.window_id,
          expected_revision: history.revision,
          level,
          available_after: level !== "totals" && after
            ? new Date(after).toISOString()
            : null,
          reason,
        });
      }}
    >
      <h3>Propose a feedback policy</h3>
      <p>
        Another authorized staff member must approve it. Existing releases keep
        their recorded policy.
      </p>
      <fieldset disabled={locked}>
        <legend>Candidate disclosure</legend>
        <label>
          Feedback level<select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as FeedbackLevel);
              setConfirmed(false);
            }}
          >
            <option value="totals">Overall total only</option>
            <option value="sections">Overall and section totals</option>
            <option value="questions">
              Section totals and question points
            </option>
          </select>
        </label>
        {level !== "totals" && (
          <label>
            Details available after (your local time; optional)<input
              type="datetime-local"
              value={after}
              onChange={(event) => {
                setAfter(event.target.value);
                setConfirmed(false);
              }}
            />
          </label>
        )}
        <p className="hint">
          The overall result follows its own release time. Empty detail time
          means details are available at release. Prompts, answer keys,
          responses and marker identities are never included.
        </p>
        <label>
          Policy reason<textarea
            required
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />I have checked the proposed detail level and timing.
        </label>
        <button disabled={!confirmed || !reason.trim()}>
          Submit policy for independent approval
        </button>
      </fieldset>
    </form>
  );
}
