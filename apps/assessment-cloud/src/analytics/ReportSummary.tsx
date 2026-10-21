import {
  type AnalyticsReport,
  metric,
} from "../../../../packages/assessment-web/src/analytics";
export function ReportSummary({ report }: { report: AnalyticsReport }) {
  const s = report.summary, p = report.population;
  return (
    <section aria-labelledby="report-summary">
      <h2 id="report-summary">Released result report</h2>
      <h3>{report.title}</h3>
      <p>
        Snapshot {new Date(report.as_of).toLocaleString()} ·{" "}
        {p.cohort_title ?? "Whole sitting"}
      </p>
      <p>
        {p.registered} registered · {p.started} started · {p.finalized}{" "}
        finalized · {p.released} released at snapshot time
      </p>
      <dl className="analytics-metrics">
        <div>
          <dt>Results in selected view</dt>
          <dd>{s.count}</dd>
        </div>
        <div>
          <dt>Mean score</dt>
          <dd>{metric(s.mean_percent)}{s.mean_percent !== null ? "%" : ""}</dd>
        </div>
        <div>
          <dt>Median score</dt>
          <dd>
            {metric(s.median_percent)}
            {s.median_percent !== null ? "%" : ""}
          </dd>
        </div>
        <div>
          <dt>At or above {metric(report.threshold_percent)}% cutoff</dt>
          <dd>{s.at_or_above_threshold} / {s.count}</dd>
        </div>
        <div>
          <dt>Sample standard deviation</dt>
          <dd>
            {s.sd_percent === null
              ? "Not available"
              : `${metric(s.sd_percent)} percentage points`}
          </dd>
        </div>
        <div>
          <dt>Score range</dt>
          <dd>
            {s.minimum_percent === null
              ? "Not available"
              : `${metric(s.minimum_percent)}% – ${metric(s.maximum_percent)}%`}
          </dd>
        </div>
      </dl>
      {s.count < 30 && (
        <p role="status">
          Small sample: interpret these descriptive results cautiously. This is
          not a calibrated quality verdict.
        </p>
      )}
      <h3>Score distribution</h3>
      <table>
        <caption>
          Percentage score bands; only the final band includes its upper bound.
        </caption>
        <thead>
          <tr>
            <th scope="col">Score band</th>
            <th scope="col">Results</th>
          </tr>
        </thead>
        <tbody>
          {s.distribution.map((bin) => (
            <tr key={bin.from_percent}>
              <th scope="row">
                {bin.from_percent}–{bin.to_percent}
                {bin.to_percent === 100 ? "% inclusive" : "% (upper excluded)"}
              </th>
              <td>{bin.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Interpretation and provenance</summary>
        <ul>
          {report.cautions.map((caution) => <li key={caution}>{caution}</li>)}
        </ul>
        <p>Purpose: {report.reason}</p>
        <p className="analytics-hash">Source SHA-256: {report.source_hash}</p>
      </details>
    </section>
  );
}
