import { useState } from "react";
import { useAnalytics } from "./use-analytics";
import { ReportSummary } from "./ReportSummary";
import { ItemDiagnostics } from "./ItemDiagnostics";
import "./analytics.css";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function AnalyticsWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const t = useAppT(), { date } = useI18n();
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
        <h2>{t("analytics.accessChanged")}</h2>
        <p role="alert" className="error">{model.error}</p>
      </section>
    );
  }
  return (
    <div className="analytics-workspace">
      <section>
        <h2>{t("analytics.createTitle")}</h2>
        <p>
          {t("analytics.createLead")}
        </p>
        {model.error && <p role="alert" className="error">{model.error}</p>}
        {!model.ready && (
          <p role="status">
            {t("analytics.opening")}
          </p>
        )}
        {model.pending && (
          <div role="status">
            <p>{t("analytics.pending")}</p>
            <button disabled={model.busy} onClick={() => void model.create()}>
              {t("analytics.retry")}
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
              {t("analytics.sitting")}<select
                value={windowId}
                onChange={(event) => setWindowId(event.target.value)}
                required
              >
                <option value="">{t("windows.chooseSitting")}</option>
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
                {t("analytics.moreSittings")}
              </button>
            )}
            <label>
              {t("analytics.cohort")}<select
                value={cohort}
                onChange={(event) => setCohort(event.target.value)}
              >
                <option value="">{t("analytics.wholeSitting")}</option>
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
                {t("analytics.moreCohorts")}
              </button>
            )}
            <p>
              {t("analytics.cohortHint")}
            </p>
            <label>
              {t("analytics.cutoff")}<input
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
              {t("analytics.purpose")}<textarea
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
              />{t("analytics.ack")}
            </label>
            <button disabled={!windowId || !reason.trim() || !ack}>
              {t("analytics.create")}
            </button>
          </fieldset>
        </form>
      </section>
      <section>
        <h2>{t("analytics.saved")}</h2>
        {!model.snapshots.length && <p>{t("analytics.noSnapshots")}</p>}
        <ul className="records">
          {model.snapshots.map((row) => (
            <li key={row.id}>
              <strong>{row.title}</strong>
              <span>
                {t("analytics.snapshotMeta", { date: date(row.as_of), count: String(row.population.released) })}
              </span>
              <button
                className="quiet"
                disabled={model.busy}
                onClick={() => void model.open(row.id)}
              >
                {t("analytics.open")}
              </button>
            </li>
          ))}
        </ul>
        {model.pages.snapshots && (
          <button
            disabled={model.busy}
            onClick={() => void model.loadMore("snapshots")}
          >
            {t("analytics.moreSnapshots")}
          </button>
        )}
      </section>
      {model.busy && <p role="status">{t("analytics.loading")}</p>}
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
