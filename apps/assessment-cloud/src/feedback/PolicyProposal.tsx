import { useState } from "react";
import {
  type FeedbackHistory,
  type FeedbackLevel,
} from "../../../../packages/assessment-web/src/feedback";
import { useAppT } from "../i18n/index.ts";
export function PolicyProposal(
  { history, locked, submit }: {
    history: FeedbackHistory;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<void>;
  },
) {
  const t = useAppT();
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
      <h3>{t("proposal.title")}</h3>
      <p>
        {t("proposal.lead")}
      </p>
      <fieldset disabled={locked}>
        <legend>{t("proposal.disclosure")}</legend>
        <label>
          {t("proposal.level")}<select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value as FeedbackLevel);
              setConfirmed(false);
            }}
          >
            <option value="totals">{t("proposal.totals")}</option>
            <option value="sections">{t("proposal.sections")}</option>
            <option value="questions">
              {t("proposal.questions")}
            </option>
          </select>
        </label>
        {level !== "totals" && (
          <label>
            {t("proposal.after")}<input
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
          {t("proposal.hint")}
        </p>
        <label>
          {t("proposal.reason")}<textarea
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
          />{t("proposal.ack")}
        </label>
        <button disabled={!confirmed || !reason.trim()}>
          {t("proposal.submit")}
        </button>
      </fieldset>
    </form>
  );
}
