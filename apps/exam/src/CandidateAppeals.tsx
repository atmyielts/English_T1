import { type FormEvent, useState } from "react";
import { useAppeals } from "../../../packages/assessment-web/src/use-appeals";
import { AppealList } from "../../../packages/assessment-web/src/AppealList";
import { AppealView } from "../../../packages/assessment-web/src/AppealView";
import type { ReleasedResult } from "../../../packages/assessment-web/src/grading";
import "../../../packages/assessment-web/src/appeals.css";
export function CandidateAppeals(
  { tenant, actor, results }: {
    tenant: string;
    actor: string;
    results: ReleasedResult[];
  },
) {
  const state = useAppeals(tenant, actor, "candidate"),
    [selected, setSelected] = useState(""),
    [category, setCategory] = useState("scoring"),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  const availableResults = results.filter((row) =>
    !state.rows.some((appeal) =>
      appeal.score_revision_id === row.score_revision_id
    )
  );
  const result = availableResults.find((row) =>
    row.score_revision_id === selected
  );
  const blocked = state.busy || !!state.pending || !state.commandReady;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!result) return;
    if (
      await state.send("appeal.submit", {
        attempt_id: result.attempt_id,
        score_revision_id: result.score_revision_id,
        category,
        reason,
      })
    ) {
      setReason("");
      setSelected("");
      setAck(false);
    }
  }
  return (
    <section
      className="appeals-panel"
      aria-labelledby="candidate-appeals-title"
      aria-busy={state.loading || state.busy}
    >
      <h2 id="candidate-appeals-title">Your result appeals</h2>
      <p>
        If you believe a released result needs review, explain your concern
        here. An independent institution moderator will decide it. An accepted
        appeal requests regrading; it does not immediately change your score.
      </p>
      <AppealList state={state} />
      {state.detail && (
        <AppealView
          key={`${state.detail.id}:${state.detail.revision}`}
          appeal={state.detail}
          busy={state.busy}
          blocked={!!state.pending || !state.commandReady}
          send={state.send}
        />
      )}
      {!state.loading && results.length > 0 && !availableResults.length && (
        <p>
          These released results already have an appeal. Open the record above
          to follow its review or decision.
        </p>
      )}
      {availableResults.length > 0 && (
        <form onSubmit={(event) => void submit(event)}>
          <h3>Submit a result appeal</h3>
          <label>
            Released result<select
              required
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setAck(false);
              }}
              disabled={blocked}
            >
              <option value="">Choose a released result</option>
              {availableResults.map((row) => (
                <option
                  key={row.score_revision_id}
                  value={row.score_revision_id}
                >
                  {row.total} / {row.max_score} · Generation {row.generation} ·
                  {" "}
                  {new Date(row.released_at).toLocaleString()} ·{" "}
                  {row.attempt_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Concern<select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)}
              disabled={blocked}
            >
              <option value="scoring">Scoring or marking</option>
              <option value="procedure">Exam procedure</option>
              <option value="accessibility">Access or accommodation</option>
            </select>
          </label>
          <label>
            Explain your concern<textarea
              required
              maxLength={5000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setAck(false);
              }}
              disabled={blocked}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              disabled={blocked}
            />I checked the selected result and understand that one appeal can
            be submitted for each released score revision.
          </label>
          <button
            disabled={blocked || !result || !ack ||
              !reason.trim()}
          >
            Submit appeal for review
          </button>
        </form>
      )}
    </section>
  );
}
