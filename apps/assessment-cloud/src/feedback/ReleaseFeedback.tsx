import { useState } from "react";
import {
  feedbackDate,
  feedbackLabel,
  type FeedbackRelease,
} from "../../../../packages/assessment-web/src/feedback";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function ReleaseFeedback(
  { release, locked, submit }: {
    release: FeedbackRelease;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<void>;
  },
) {
  const t = useAppT(), { date: formatDate } = useI18n();
  const [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <li>
      <h4>{t("releaseRow.title", { generation: String(release.generation), id: release.id })}</h4>
      <p>
        {t("releaseRow.summary", { date: feedbackDate(release.release_at, t, (value) => formatDate(value)), level: feedbackLabel(release.feedback_snapshot.level, t) })}
      </p>
      <p>
        {release.held
          ? t("releaseRow.held")
          : t("releaseRow.notHeld")}
        {release.feedback_snapshot.level !== "totals" &&
          t("releaseRow.detail", { date:
            feedbackDate(release.feedback_snapshot.available_at, t, (value) => formatDate(value))
          })}
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
            {t("releaseRow.reason")}<textarea
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
            />{t("releaseRow.ack")}
          </label>
          <button
            className="quiet"
            disabled={locked || !confirmed || !reason.trim()}
          >
            {release.held
              ? t("releaseRow.restore")
              : t("releaseRow.withhold")}
          </button>
        </form>
      )}
    </li>
  );
}
