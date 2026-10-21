import { useFeedback } from "./use-feedback";
import { PolicyProposal } from "./PolicyProposal";
import { PolicyHistory } from "./PolicyHistory";
import { ReleaseFeedback } from "./ReleaseFeedback";
import {
  feedbackDate,
  feedbackLabel,
} from "../../../../packages/assessment-web/src/feedback";
import "./feedback.css";
export function FeedbackWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const state = useFeedback(tenant, actor),
    locked = state.busy || state.pending || !state.ready || !state.allowed;
  return (
    <section
      className="grading-detail feedback-workspace"
      aria-label="Institution result feedback"
    >
      <h2>Control what candidates receive</h2>
      <p>
        Set a sitting's feedback policy, obtain independent approval, then
        review it again when releasing grades. No policy change silently expands
        an old release.
      </p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.notice && <p className="notice" role="status">{state.notice}</p>}
      {!state.ready && !state.error && (
        <p role="status">Opening the protected feedback workspace…</p>
      )}
      {state.pending && state.allowed && (
        <div role="status">
          <p>
            A saved feedback request needs its canonical receipt. Retry it
            before making another decision.
          </p>
          <button disabled={state.busy} onClick={() => void state.mutate()}>
            Retry saved feedback request
          </button>
        </div>
      )}
      {state.allowed && (
        <>
          <label>
            Feedback sitting<select
              disabled={state.busy || !state.ready}
              value={state.selected}
              onChange={(event) => void state.choose(event.target.value)}
            >
              <option value="">Choose a sitting</option>
              {state.sittings.map((sitting) => (
                <option key={sitting.id} value={sitting.id}>
                  {sitting.title}
                </option>
              ))}
            </select>
          </label>
          {state.ready && !state.sittings.length && (
            <p>No sittings are available. Create an exam sitting first.</p>
          )}
          {state.moreSittings && (
            <button
              className="quiet"
              disabled={state.busy}
              onClick={() => void state.more()}
            >
              Load more feedback sittings
            </button>
          )}
          <button
            className="quiet"
            disabled={state.busy}
            onClick={() => void state.refresh()}
          >
            Refresh feedback controls
          </button>
          {state.history && (
            <div key={`${state.selected}:${state.history.revision}`}>
              <p className="notice">
                Future releases: {feedbackLabel(state.history.current.level)}.
                {" "}
                {state.history.current.level !== "totals" &&
                  `Details: ${
                    feedbackDate(state.history.current.available_after)
                  }.`}
              </p>
              <PolicyProposal
                history={state.history}
                locked={locked}
                submit={state.mutate}
              />
              <PolicyHistory
                history={state.history}
                actor={actor}
                locked={locked}
                submit={state.mutate}
              />
              {state.history.versions.length === 100 && (
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={() => void state.page("versions")}
                >
                  Next 100 policy versions
                </button>
              )}
              <h3>Released feedback</h3>
              <p>
                Withholding prevents future detail reads. It cannot erase
                information already viewed or downloaded. Overall results,
                grades and certificates are not revoked by a feedback hold.
              </p>
              {!state.releases.length && (
                <p>No result releases on this page.</p>
              )}
              <ul className="records">
                {state.releases.map((release) => (
                  <ReleaseFeedback
                    key={`${release.id}:${release.revision}`}
                    release={release}
                    locked={locked}
                    submit={state.mutate}
                  />
                ))}
              </ul>
              {state.releases.length === 100 && (
                <button
                  className="quiet"
                  disabled={state.busy}
                  onClick={() => void state.page("releases")}
                >
                  Next 100 feedback releases
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
