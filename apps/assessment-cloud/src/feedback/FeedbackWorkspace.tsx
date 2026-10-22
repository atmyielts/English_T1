import { useFeedback } from "./use-feedback";
import { PolicyProposal } from "./PolicyProposal";
import { PolicyHistory } from "./PolicyHistory";
import { ReleaseFeedback } from "./ReleaseFeedback";
import {
  feedbackDate,
  feedbackLabel,
} from "../../../../packages/assessment-web/src/feedback";
import "./feedback.css";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function FeedbackWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const t = useAppT(), { date: formatDate } = useI18n();
  const state = useFeedback(tenant, actor),
    locked = state.busy || state.pending || !state.ready || !state.allowed;
  return (
    <section
      className="grading-detail feedback-workspace"
      aria-label={t("feedback.label")}
    >
      <h2>{t("feedback.title")}</h2>
      <p>
        {t("feedback.lead")}
      </p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.notice && <p className="notice" role="status">{state.notice}</p>}
      {!state.ready && !state.error && (
        <p role="status">{t("feedback.opening")}</p>
      )}
      {state.pending && state.allowed && (
        <div role="status">
          <p>
            {t("feedback.pending")}
          </p>
          <button disabled={state.busy} onClick={() => void state.mutate()}>
            {t("feedback.retry")}
          </button>
        </div>
      )}
      {state.allowed && (
        <>
          <label>
            {t("feedback.sitting")}<select
              disabled={state.busy || !state.ready}
              value={state.selected}
              onChange={(event) => void state.choose(event.target.value)}
            >
              <option value="">{t("windows.chooseSitting")}</option>
              {state.sittings.map((sitting) => (
                <option key={sitting.id} value={sitting.id}>
                  {sitting.title}
                </option>
              ))}
            </select>
          </label>
          {state.ready && !state.sittings.length && (
            <p>{t("feedback.noSittings")}</p>
          )}
          {state.moreSittings && (
            <button
              className="quiet"
              disabled={state.busy}
              onClick={() => void state.more()}
            >
              {t("feedback.moreSittings")}
            </button>
          )}
          <button
            className="quiet"
            disabled={state.busy}
            onClick={() => void state.refresh()}
          >
            {t("feedback.refresh")}
          </button>
          {state.history && (
            <div key={`${state.selected}:${state.history.revision}`}>
              <p className="notice">
                {t("feedback.future", { level: feedbackLabel(state.history.current.level, t) })}
                {" "}
                {state.history.current.level !== "totals" &&
                  t("feedback.futureDetails", { date:
                    feedbackDate(state.history.current.available_after, t, (value) => formatDate(value))
                  })}
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
                  {t("feedback.nextVersions")}
                </button>
              )}
              <h3>{t("feedback.released")}</h3>
              <p>
                {t("feedback.releasedLead")}
              </p>
              {!state.releases.length && (
                <p>{t("feedback.noReleases")}</p>
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
                  {t("feedback.nextReleases")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
