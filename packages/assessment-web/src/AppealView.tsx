import React, { type FormEvent, useState } from "react";
import { appealCategory, type AppealDetail, appealStatus } from "./appeals";
export function AppealView(
  { appeal, busy, blocked, send }: {
    appeal: AppealDetail;
    busy: boolean;
    blocked: boolean;
    send: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
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
        {appealCategory[appeal.category]} appeal
      </h3>
      <p>
        <strong>{appealStatus[appeal.status]}</strong> · Submitted{" "}
        {new Date(appeal.created_at).toLocaleString()}
      </p>
      <p className="appeal-text">{appeal.reason}</p>
      <p>
        <strong>{appeal.released_result.title}</strong> ·{" "}
        {appeal.released_result.total} / {appeal.released_result.max_score}{" "}
        points · Grading generation {appeal.released_result.generation}
      </p>
      <p className="muted">
        Result reference:{" "}
        <span className="appeal-reference">{appeal.score_revision_id}</span>
      </p>
      {appeal.events.length > 0 && (
        <ol className="appeal-history" aria-label="Appeal history">
          {appeal.events.map((event) => (
            <li key={event.revision}>
              <strong>{appealStatus[event.event]}</strong>
              <span>· {new Date(event.created_at).toLocaleString()}</span>
              <p className="appeal-text">{event.explanation}</p>
            </li>
          ))}
        </ol>
      )}
      {appeal.requested_generation && (
        <p>
          Grading generation {appeal.requested_generation}{" "}
          was requested. Your current released result remains visible until an
          independently approved replacement is released.
        </p>
      )}
      {appeal.status === "submitted" && !appeal.can_decide &&
        !appeal.can_withdraw && (
        <p>
          An independent authorized moderator must decide this appeal. People
          who marked, adjudicated, approved or released the result cannot decide
          it.
        </p>
      )}
      {(appeal.can_withdraw || appeal.can_decide) && (
        <form onSubmit={(event) => void submit(event)}>
          {appeal.can_decide && (
            <>
              <label>
                Decision<select
                  value={outcome}
                  onChange={(event) => {
                    setOutcome(event.target.value);
                    setAck(false);
                  }}
                  disabled={busy || blocked}
                >
                  <option value="upheld">Uphold the original result</option>
                  <option
                    value="regrade_requested"
                    disabled={!appeal.can_regrade}
                  >
                    Accept and request regrading
                  </option>
                </select>
              </label>
              {!appeal.can_regrade && (
                <p>
                  A newer grading generation is already pending or available.
                  Review it before requesting another.
                </p>
              )}
            </>
          )}
          <label>
            {appeal.can_withdraw
              ? "Withdrawal reason"
              : "Decision explanation (visible to candidate)"}
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
            {appeal.can_withdraw
              ? "I understand this closes my appeal for this result."
              : "I reviewed this appeal and its released result independently. This decision does not directly change a score."}
          </label>
          <button disabled={busy || blocked || !ack || !explanation.trim()}>
            {appeal.can_withdraw ? "Withdraw appeal" : "Record appeal decision"}
          </button>
        </form>
      )}
    </section>
  );
}
