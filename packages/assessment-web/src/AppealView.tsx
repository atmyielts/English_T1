import React, { type FormEvent, useState } from "react";
import {
  appealCategoryText,
  type AppealDetail,
  appealStatusText,
} from "./appeals";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { useWebT } from "./i18n/useWebT.ts";
export function AppealView(
  { appeal, actor, busy, blocked, send }: {
    appeal: AppealDetail;
    /** The signed-in reviewer; needed to take an appeal for review. */
    actor?: string;
    busy: boolean;
    blocked: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const t = useWebT(), { date } = useI18n();
  const [explanation, setExplanation] = useState(""),
    [outcome, setOutcome] = useState("upheld"),
    [ack, setAck] = useState(false),
    [reason, setReason] = useState(""),
    [escalateAck, setEscalateAck] = useState(false);
  async function escalate(event: FormEvent) {
    event.preventDefault();
    if (
      await send("appeal.escalate", {
        appeal_id: appeal.id,
        expected_revision: appeal.revision,
        reason,
      })
    ) {
      setReason("");
      setEscalateAck(false);
    }
  }
  const open = appeal.status === "submitted" || appeal.status === "escalated";
  async function submit(event: FormEvent) {
    event.preventDefault();
    const action = appeal.can_withdraw ? "appeal.withdraw" : "appeal.decide";
    if (
      await send(action, {
        appeal_id: appeal.id,
        expected_revision: appeal.revision,
        explanation,
        ...(action === "appeal.decide" ? { outcome } : {}),
      })
    ) {
      setExplanation("");
      setAck(false);
    }
  }
  return (
    <section
      className="appeal-detail"
      aria-labelledby={`appeal-heading-${appeal.id}`}
    >
      <h3 id={`appeal-heading-${appeal.id}`}>
        {t("appeal.view.heading", {
          category: appealCategoryText(appeal.category, t),
        })}
      </h3>
      <p>
        <strong>{appealStatusText(appeal.status, t)}</strong> ·{" "}
        {t("appeal.view.submitted", { date: date(appeal.created_at) })}
      </p>
      <p className="appeal-text">{appeal.reason}</p>
      <p>
        <strong>{appeal.released_result.title}</strong> ·{" "}
        {t("appeal.view.result", {
          total: appeal.released_result.total,
          max: appeal.released_result.max_score,
          generation: appeal.released_result.generation,
        })}
      </p>
      <p className="muted">
        {t("appeal.view.reference")}{" "}
        <span className="appeal-reference">{appeal.score_revision_id}</span>
      </p>
      {appeal.stage === 2 && (
        <p>
          <strong>{t("appeal.view.stageTwo")}</strong>
        </p>
      )}
      {open && appeal.assigned_to && (
        <p role="status">
          {t(
            appeal.can_decide
              ? "appeal.view.assignedToYou"
              : "appeal.view.assignedReviewer",
          )}
        </p>
      )}
      {appeal.can_assign_self && actor && (
        <button
          type="button"
          className="quiet"
          disabled={busy || blocked}
          onClick={() =>
            void send("appeal.assign", {
              appeal_id: appeal.id,
              expected_revision: appeal.revision,
              reviewer_id: actor,
            })}
        >
          {t("appeal.view.assignSelf")}
        </button>
      )}
      {appeal.events.length > 0 && (
        <ol className="appeal-history" aria-label={t("appeal.view.history")}>
          {appeal.events.map((event) => (
            <li key={event.revision}>
              <strong>{appealStatusText(event.event, t)}</strong>
              <span>· {date(event.created_at)}</span>
              <p className="appeal-text">{event.explanation}</p>
            </li>
          ))}
        </ol>
      )}
      {appeal.requested_generation && (
        <p>
          {t("appeal.view.regradeRequested", {
            generation: appeal.requested_generation,
          })}
        </p>
      )}
      {open && !appeal.can_decide &&
        !appeal.can_withdraw && (
        <p>{t("appeal.view.independent")}</p>
      )}
      {appeal.can_escalate && (
        <form onSubmit={(event) => void escalate(event)}>
          <h4>{t("appeal.view.escalateTitle")}</h4>
          <p>
            {t("appeal.view.escalateLead")}
            {appeal.escalation_deadline &&
              " " +
                t("appeal.view.escalationDeadline", {
                  date: date(appeal.escalation_deadline),
                })}
          </p>
          <label>
            {t("appeal.view.escalateReason")}
            <textarea
              required
              maxLength={5000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setEscalateAck(false);
              }}
              disabled={busy || blocked}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={escalateAck}
              onChange={(event) => setEscalateAck(event.target.checked)}
              disabled={busy || blocked}
            />
            {t("appeal.view.escalateAck")}
          </label>
          <button
            disabled={busy || blocked || !escalateAck || !reason.trim()}
          >
            {t("appeal.view.escalate")}
          </button>
        </form>
      )}
      {(appeal.can_withdraw || appeal.can_decide) && (
        <form onSubmit={(event) => void submit(event)}>
          {appeal.can_decide && (
            <>
              <label>
                {t("appeal.view.decision")}<select
                  value={outcome}
                  onChange={(event) => {
                    setOutcome(event.target.value);
                    setAck(false);
                  }}
                  disabled={busy || blocked}
                >
                  <option value="upheld">{t("appeal.view.uphold")}</option>
                  <option
                    value="regrade_requested"
                    disabled={!appeal.can_regrade}
                  >
                    {t("appeal.view.regrade")}
                  </option>
                </select>
              </label>
              {!appeal.can_regrade && (
                <p>{t("appeal.view.regradePending")}</p>
              )}
            </>
          )}
          <label>
            {t(
              appeal.can_withdraw
                ? "appeal.view.withdrawReason"
                : "appeal.view.explanation",
            )}
            <textarea
              required
              maxLength={5000}
              value={explanation}
              onChange={(event) => {
                setExplanation(event.target.value);
                setAck(false);
              }}
              disabled={busy || blocked}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) =>
                setAck(event.target.checked)}
              disabled={busy || blocked}
            />
            {t(
              appeal.can_withdraw
                ? "appeal.view.withdrawAck"
                : "appeal.view.decideAck",
            )}
          </label>
          <button disabled={busy || blocked || !ack || !explanation.trim()}>
            {t(appeal.can_withdraw ? "appeal.view.withdraw" : "appeal.view.record")}
          </button>
        </form>
      )}
    </section>
  );
}
