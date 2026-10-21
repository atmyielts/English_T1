import { type FormEvent, useState } from "react";
import { useCohorts } from "./use-cohorts";
import { CohortEditor } from "./CohortEditor";
import { RosterPreview } from "./RosterPreview";
import { RosterJobView } from "./RosterJobView";
import { rosterState } from "../../../../packages/assessment-web/src/cohorts";
import "./cohorts.css";
export function CohortsWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
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
        <p role="status">Checking institution cohorts and registration jobs…</p>
      )}
      {state.pending && (
        <section>
          <h2>Saved cohort request needs a receipt</h2>
          <p>
            Retry the saved request before making another change. A job receipt
            confirms its creation, not that every candidate has been registered.
          </p>
          <button
            disabled={state.busy}
            onClick={() => void state.send()}
          >
            Retry saved cohort request
          </button>
        </section>
      )}
      <section>
        <h2>Institution cohorts</h2>
        <p>
          Choose active institution members by name. These assessment cohorts do
          not change Academy groups or the institution's identity/membership
          records.
        </p>
        <ul className="records">
          {state.groups.map((group) => (
            <li key={group.id}>
              <strong>{group.title}</strong>
              <span>
                {group.state} · {group.member_count ?? 0} roster entries
              </span>
              <button
                className="quiet"
                disabled={state.busy}
                onClick={() => void state.openGroup(group.id)}
              >
                Manage {group.title}
              </button>
            </li>
          ))}
        </ul>
        {!state.loading && !state.groups.length && (
          <p>No assessment cohorts yet.</p>
        )}
        {state.more.groups && (
          <button
            className="quiet"
            disabled={disabled}
            onClick={() => void state.load("groups")}
          >
            Load more cohorts
          </button>
        )}
        <form
          onSubmit={(event) =>
            void create(event)}
        >
          <h3>Create an assessment cohort</h3>
          <label>
            New cohort title<input
              required
              maxLength={200}
              value={title}
              onChange={(event) =>
                setTitle(event.target.value)}
              disabled={disabled}
            />
          </label>
          <label>
            New cohort description<textarea
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={disabled}
            />
          </label>
          <button disabled={disabled || !title.trim()}>Create cohort</button>
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
              Load more cohort members
            </button>
          )}
          {state.more.directory && (
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => void state.moreDirectory()}
            >
              Load more institution members
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
              Load more exam sittings
            </button>
          )}
        </>
      )}
      <section>
        <h2>Registration jobs</h2>
        <ul className="records">
          {state.jobs.map((job) => (
            <li key={job.id}>
              <strong>{job.window_snapshot.title}</strong>
              <span>
                {rosterState[job.state]} · {job.processed} / {job.total}
              </span>
              <button
                className="quiet"
                disabled={state.busy}
                onClick={() => void state.openJob(job.id)}
              >
                Open registration job
              </button>
            </li>
          ))}
        </ul>
        {!state.loading && !state.jobs.length && (
          <p>No registration jobs yet.</p>
        )}
        {state.more.jobs && (
          <button
            className="quiet"
            disabled={disabled}
            onClick={() => void state.load("jobs")}
          >
            Load more registration jobs
          </button>
        )}
        <button
          className="quiet"
          disabled={disabled}
          onClick={() => void state.load()}
        >
          Refresh cohorts and jobs
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
              Load more registration outcomes
            </button>
          )}
        </>
      )}
    </div>
  );
}
