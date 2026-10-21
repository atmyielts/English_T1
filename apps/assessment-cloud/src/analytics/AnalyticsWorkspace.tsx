import { useState } from "react";
import { useAnalytics } from "./use-analytics";
import { ReportSummary } from "./ReportSummary";
import { ItemDiagnostics } from "./ItemDiagnostics";
import "./analytics.css";
export function AnalyticsWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const model = useAnalytics(tenant, actor),
    [windowId, setWindowId] = useState(""),
    [cohort, setCohort] = useState(""),
    [cutoff, setCutoff] = useState("70"),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  const disabled = model.busy || model.pending || !model.ready;
  if (!model.allowed) {
    return (
      <section>
        <h2>Report access changed</h2>
        <p role="alert" className="error">{model.error}</p>
      </section>
    );
  }
  return (
    <div className="analytics-workspace">
      <section>
        <h2>Create a result snapshot</h2>
        <p>
          Use the latest eligible released result per attempt. A snapshot stays
          reproducible when results are later regraded. Reporting never changes
          grades, answer keys or integrity decisions.
        </p>
        {model.error && <p role="alert" className="error">{model.error}</p>}
        {!model.ready && (
          <p role="status">
            Opening reporting permissions and secure request recovery…
          </p>
        )}
        {model.pending && (
          <div role="status">
            <p>A report request needs its canonical receipt.</p>
            <button disabled={model.busy} onClick={() => void model.create()}>
              Retry saved report request
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void model.create({
              window_id: windowId,
              cohort_id: cohort || null,
              threshold_percent: Number(cutoff),
              reason,
            });
          }}
        >
          <fieldset disabled={disabled}>
            <label>
              Report sitting<select
                value={windowId}
                onChange={(event) => setWindowId(event.target.value)}
                required
              >
                <option value="">Choose a sitting</option>
                {model.sittings.map((row) => (
                  <option key={row.id} value={row.id}>{row.title}</option>
                ))}
              </select>
            </label>
            {model.pages.sittings && (
              <button
                type="button"
                className="quiet"
                onClick={() => void model.loadMore("sittings")}
              >
                Load more report sittings
              </button>
            )}
            <label>
              Report cohort<select
                value={cohort}
                onChange={(event) => setCohort(event.target.value)}
              >
                <option value="">Whole sitting</option>
                {model.cohorts.map((row) => (
                  <option key={row.id} value={row.id}>{row.title}</option>
                ))}
              </select>
            </label>
            {model.pages.cohorts && (
              <button
                type="button"
                className="quiet"
                onClick={() => void model.loadMore("cohorts")}
              >
                Load more report cohorts
              </button>
            )}
            <p>
              Cohort filtering uses active cohort entries at snapshot creation,
              not historical membership at exam time.
            </p>
            <label>
              Analysis cutoff percentage<input
                type="number"
                min="0"
                max="100"
                step="0.000001"
                required
                value={cutoff}
                onChange={(event) => setCutoff(event.target.value)}
              />
            </label>
            <label>
              Report purpose<textarea
                required
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
              />I understand this cutoff is exploratory and does not create
              official pass/fail decisions.
            </label>
            <button disabled={!windowId || !reason.trim() || !ack}>
              Create released-result snapshot
            </button>
          </fieldset>
        </form>
      </section>
      <section>
        <h2>Saved report snapshots</h2>
        {!model.snapshots.length && <p>No snapshots have been created yet.</p>}
        <ul className="records">
          {model.snapshots.map((row) => (
            <li key={row.id}>
              <strong>{row.title}</strong>
              <span>
                {new Date(row.as_of).toLocaleString()} ·{" "}
                {row.population.released} released results
              </span>
              <button
                className="quiet"
                disabled={model.busy}
                onClick={() => void model.open(row.id)}
              >
                Open result report
              </button>
            </li>
          ))}
        </ul>
        {model.pages.snapshots && (
          <button
            disabled={model.busy}
            onClick={() => void model.loadMore("snapshots")}
          >
            Load more report snapshots
          </button>
        )}
      </section>
      {model.busy && <p role="status">Loading canonical report…</p>}
      {model.report && (
        <>
          <ReportSummary report={model.report} />
          <ItemDiagnostics
            report={model.report}
            disabled={disabled}
            selectForm={(form) => void model.open(model.report!.id, form)}
            moreForms={model.moreForms}
            loadForms={() => void model.loadForms()}
            moreItems={model.moreItems}
            loadItems={() =>
              void model.open(
                model.report!.id,
                model.report!.selected_form,
                model.report!.items.at(-1)?.id ?? null,
              )}
          />
        </>
      )}
    </div>
  );
}
