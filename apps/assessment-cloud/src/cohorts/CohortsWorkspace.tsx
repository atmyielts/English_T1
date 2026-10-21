import { type FormEvent, useState } from "react";
import { useCohorts } from "./use-cohorts";
import { CohortEditor } from "./CohortEditor";
import { RosterPreview } from "./RosterPreview";
import { RosterJobView } from "./RosterJobView";
import { rosterStateText } from "../../../../packages/assessment-web/src/cohorts";
import { useAppT, useCodeText } from "../i18n/index.ts";
import "./cohorts.css";
export function CohortsWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const t = useAppT(), codeText = useCodeText();
  const state = useCohorts(tenant, actor),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    disabled = state.busy || state.loading || !state.ready || !!state.pending;
  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await state.send("cohort.create", { title, description });
    if (result) {
      setTitle("");
      setDescription("");
      await state.openGroup(String(result.id));
    }
  }
  return (
    <div className="cohorts-workspace" aria-busy={state.loading || state.busy}>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      {state.notice && <p role="status" className="notice">{state.notice}</p>}
      {state.loading && (
        <p role="status">{t("cohorts.checking")}</p>
      )}
      {state.pending && (
        <section>
          <h2>{t("cohorts.pendingTitle")}</h2>
          <p>
            {t("cohorts.pendingBody")}
          </p>
          <button
            disabled={state.busy}
            onClick={() => void state.send()}
          >
            {t("cohorts.retry")}
          </button>
        </section>
      )}
      <section>
        <h2>{t("cohorts.title")}</h2>
        <p>
          {t("cohorts.lead")}
        </p>
        <ul className="records">
          {state.groups.map((group) => (
            <li key={group.id}>
              <strong>{group.title}</strong>
              <span>
                {t("cohorts.groupMeta", { state: codeText("cohort.state", group.state), count: String(group.member_count ?? 0) })}
              </span>
              <button
                className="quiet"
                disabled={state.busy}
                onClick={() => void state.openGroup(group.id)}
              >
                {t("cohorts.manage", { title: group.title })}
              </button>
            </li>
          ))}
        </ul>
        {!state.loading && !state.groups.length && (
          <p>{t("cohorts.empty")}</p>
        )}
        {state.more.groups && (
          <button
            className="quiet"
            disabled={disabled}
            onClick={() => void state.load("groups")}
          >
            {t("cohorts.more")}
          </button>
        )}
        <form
          onSubmit={(event) =>
            void create(event)}
        >
          <h3>{t("cohorts.create")}</h3>
          <label>
            {t("cohorts.newTitle")}<input
              required
              maxLength={200}
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)}
              disabled={disabled}
            />
          </label>
          <label>
            {t("cohorts.newDescription")}<textarea
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={disabled}
            />
          </label>
          <button disabled={disabled || !title.trim()}>{t("cohorts.submit")}</button>
        </form>
      </section>
      {state.group && (
        <>
          <CohortEditor
            key={`${state.group.id}:${state.group.revision}`}
            group={state.group}
            directory={state.directory}
            disabled={disabled}
            search={state.search}
            send={state.send}
          />
          {state.more.members && (
            <button
              className="quiet"
              disabled={disabled}
              onClick={() =>
                void state.openGroup(
                  state.group!.id,
                  state.group!.members?.at(-1)?.id,
                )}
            >
              {t("cohorts.moreMembers")}
            </button>
          )}
          {state.more.directory && (
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => void state.moreDirectory()}
            >
              {t("cohorts.moreDirectory")}
            </button>
          )}
          <RosterPreview
            key={`preview:${state.group.id}:${state.group.revision}`}
            group={state.group}
            sittings={state.sittings}
            tenant={tenant}
            actor={actor}
            disabled={disabled}
            send={state.send}
            openJob={state.openJob}
          />
          {state.more.sittings && (
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => void state.load("sittings")}
            >
              {t("cohorts.moreSittings")}
            </button>
          )}
        </>
      )}
      <section>
        <h2>{t("cohorts.jobs")}</h2>
        <ul className="records">
          {state.jobs.map((job) => (
            <li key={job.id}>
              <strong>{job.window_snapshot.title}</strong>
              <span>
                {t("cohorts.jobMeta", { state: rosterStateText(job.state, t) ?? "", processed: String(job.processed), total: String(job.total) })}
              </span>
              <button
                className="quiet"
                disabled={state.busy}
                onClick={() => void state.openJob(job.id)}
              >
                {t("cohorts.openJob")}
              </button>
            </li>
          ))}
        </ul>
        {!state.loading && !state.jobs.length && (
          <p>{t("cohorts.noJobs")}</p>
        )}
        {state.more.jobs && (
          <button
            className="quiet"
            disabled={disabled}
            onClick={() => void state.load("jobs")}
          >
            {t("cohorts.moreJobs")}
          </button>
        )}
        <button
          className="quiet"
          disabled={disabled}
          onClick={() => void state.load()}
        >
          {t("cohorts.refresh")}
        </button>
      </section>
      {state.job && (
        <>
          <RosterJobView
            key={`${state.job.id}:${state.job.revision}`}
            job={state.job}
            disabled={disabled}
            send={state.send}
            refresh={() => state.openJob(state.job!.id)}
          />
          {state.more.targets && (
            <button
              className="quiet"
              disabled={disabled}
              onClick={() =>
                void state.openJob(
                  state.job!.id,
                  state.job!.targets?.at(-1)?.user_id,
                )}
            >
              {t("cohorts.moreTargets")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
