import type { QtiJob } from "../../../../packages/assessment-web/src/qti";
import { useQtiState } from "./QtiReview";
import { useAppT } from "../i18n/index.ts";
export function QtiHistory(
  { jobs, ready, disabled, more, refresh, open, loadMore }: {
    jobs: QtiJob[];
    ready: boolean;
    disabled: boolean;
    more: boolean;
    refresh(): void;
    open(id: string): void;
    loadMore(): void;
  },
) {
  const t = useAppT(), qtiState = useQtiState();
  return (
    <section>
      <h2>{t("qtiHistory.title")}</h2>
      <button className="quiet" disabled={disabled} onClick={refresh}>
        {t("qtiHistory.refresh")}
      </button>
      {!jobs.length && ready && (
        <p>
          {t("qtiHistory.empty")}
        </p>
      )}
      <ul className="records">
        {jobs.map((row) => (
          <li key={row.id}>
            <strong>{row.filename}</strong>
            <span>{qtiState(row.state)}</span>
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => open(row.id)}
            >
              {t("qtiHistory.review", { name: row.filename })}
            </button>
          </li>
        ))}
      </ul>
      {more && (
        <button disabled={disabled} onClick={loadMore}>
          {t("qtiHistory.more")}
        </button>
      )}
    </section>
  );
}
