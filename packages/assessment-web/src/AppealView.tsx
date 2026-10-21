import React, { type FormEvent, useState } from "react";
import {
  appealCategoryText,
  type AppealDetail,
  appealStatusText,
} from "./appeals";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { useWebT } from "./i18n/useWebT.ts";
export function AppealView(
  { appeal, busy, blocked, send }: {
    appeal: AppealDetail;
    busy: boolean;
    blocked: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const t = useWebT(), { date } = useI18n();
  const [explanation, setExplanation] = useState(""),
    [outcome, setOutcome] = useState("upheld"),
    [ack, setAck] = useState(false);
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
      {appeal.status === "submitted" && !appeal.can_decide &&
        !appeal.can_withdraw && (
        <p>{t("appeal.view.independent")}</p>
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
