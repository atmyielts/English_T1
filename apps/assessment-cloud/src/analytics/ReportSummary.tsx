import {
  type AnalyticsReport,
  metric as metricText,
} from "../../../../packages/assessment-web/src/analytics";
import { INTL, useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function ReportSummary({ report }: { report: AnalyticsReport }) {
  const t = useAppT(), { date, locale } = useI18n();
  const metric = (value: number | null | undefined, digits = 1) => metricText(value, digits, t, INTL[locale]);
  const s = report.summary, p = report.population;
  return (
    <section aria-labelledby="report-summary">
      <h2 id="report-summary">{t("report.title")}</h2>
      <h3>{report.title}</h3>
      <p>
        {t("report.snapshot", { date: date(report.as_of), cohort: p.cohort_title ?? t("analytics.wholeSitting") })}
      </p>
      <p>
        {t("report.population", { registered: String(p.registered), started: String(p.started), finalized: String(p.finalized), released: String(p.released) })}
      </p>
      <dl className="analytics-metrics">
        <div>
          <dt>{t("report.count")}</dt>
          <dd>{s.count}</dd>
        </div>
        <div>
          <dt>{t("report.mean")}</dt>
          <dd>{metric(s.mean_percent)}{s.mean_percent !== null ? "%" : ""}</dd>
        </div>
        <div>
          <dt>{t("report.median")}</dt>
          <dd>
            {metric(s.median_percent)}
            {s.median_percent !== null ? "%" : ""}
          </dd>
        </div>
        <div>
          <dt>{t("report.cutoff", { cutoff: metric(report.threshold_percent) })}</dt>
          <dd>{s.at_or_above_threshold} / {s.count}</dd>
        </div>
        <div>
          <dt>{t("report.sd")}</dt>
          <dd>
            {s.sd_percent === null
              ? t("report.notAvailable")
              : t("report.sdValue", { value: metric(s.sd_percent) })}
          </dd>
        </div>
        <div>
          <dt>{t("report.range")}</dt>
          <dd>
            {s.minimum_percent === null
              ? t("report.notAvailable")
              : t("report.rangeValue", { minimum: metric(s.minimum_percent), maximum: metric(s.maximum_percent) })}
          </dd>
        </div>
      </dl>
      {s.count < 30 && (
        <p role="status">
          {t("report.smallSample")}
        </p>
      )}
      <h3>{t("report.distribution")}</h3>
      <table>
        <caption>
          {t("report.distributionCaption")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("report.band")}</th>
            <th scope="col">{t("report.results")}</th>
          </tr>
        </thead>
        <tbody>
          {s.distribution.map((bin) => (
            <tr key={bin.from_percent}>
              <th scope="row">
                {t(bin.to_percent === 100 ? "report.bandInclusive" : "report.bandExclusive", { from: String(bin.from_percent), to: String(bin.to_percent) })}
              </th>
              <td>{bin.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>{t("report.provenance")}</summary>
        <ul>
          {report.cautions.map((caution) => <li key={caution}>{caution}</li>)}
        </ul>
        <p>{t("report.purpose", { reason: report.reason })}</p>
        <p className="analytics-hash">{t("importReview.sha", { hash: report.source_hash })}</p>
      </details>
    </section>
  );
}
