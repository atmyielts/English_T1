import type { BankImport } from "../../../../packages/assessment-web/src/bank-import";
import { useAppT } from "../i18n/index.ts";
export function ImportHistory(
  { jobs, disabled, more, open, loadMore }: {
    jobs: BankImport[];
    disabled: boolean;
    more: boolean;
    open: (id: string) => void;
    loadMore: () => void;
  },
) {
  const t = useAppT();
  return (
    <section>
      <h2>{t("history.title")}</h2>
      {!jobs.length && <p>{t("history.empty")}</p>}
      <ul className="records">
        {jobs.map((job) => (
          <li key={job.id}>
            <strong>{job.source_name}</strong>
            <span>{t("history.meta", { state: job.state, processed: String(job.processed), total: String(job.total) })}</span>
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => open(job.id)}
            >
              {t("history.review", { name: job.source_name })}
            </button>
          </li>
        ))}
      </ul>
      {more && (
        <button disabled={disabled} onClick={loadMore}>
          {t("history.more")}
        </button>
      )}
    </section>
  );
}
