import { useState } from "react";
import {
  feedbackDate,
  type FeedbackHistory,
  feedbackLabel,
} from "../../../../packages/assessment-web/src/feedback";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function PolicyHistory(
  { history, actor, locked, submit }: {
    history: FeedbackHistory;
    actor: string;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<void>;
  },
) {
  const t = useAppT(), { date: formatDate } = useI18n();
  const [reviewed, setReviewed] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <section>
      <h3>{t("policy.recorded")}</h3>
      {!history.versions.length && (
        <p>
          {t("policy.none")}
        </p>
      )}
      <ul className="records">
        {history.versions.map((version) => (
          <li key={version.id}>
            <h4>{t("policy.version", { version: String(version.version), level: feedbackLabel(version.level, t) })}</h4>
            <p>
              {version.level === "totals"
                ? t("policy.noPoints")
                : t("feedback.futureDetails", { date: feedbackDate(version.available_after, t, (value) => formatDate(value)) })}
            </p>
            <p>{version.reason}</p>
            <p>
              {version.approved
                ? t("policy.approved")
                : version.created_by === actor
                ? t("policy.own")
                : t("policy.awaiting")}
              {history.current.version_id === version.id
                ? t("policy.active")
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
                  />{t("policy.ack", { version: String(version.version) })}
                </label>
                <button disabled={locked || reviewed !== version.id}>
                  {t("policy.approve", { version: String(version.version) })}
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
          <h4>{t("policy.suspendTitle")}</h4>
          <p>
            {t("policy.suspendLead")}
          </p>
          <label>
            {t("policy.suspendReason")}<textarea
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
            />{t("policy.suspendAck")}
          </label>
          <button
            className="quiet"
            disabled={locked || !confirmed || !reason.trim()}
          >
            {t("policy.suspend")}
          </button>
        </form>
      )}
    </section>
  );
}
