import type { BankImport } from "../../../../packages/assessment-web/src/bank-import";
export function ImportHistory(
  { jobs, disabled, more, open, loadMore }: {
    jobs: BankImport[];
    disabled: boolean;
    more: boolean;
    open: (id: string) => void;
    loadMore: () => void;
  },
) {
  return (
    <section>
      <h2>Import history</h2>
      {!jobs.length && <p>No staged imports yet.</p>}
      <ul className="records">
        {jobs.map((job) => (
          <li key={job.id}>
            <strong>{job.source_name}</strong>
            <span>{job.state} · {job.processed}/{job.total}</span>
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => open(job.id)}
            >
              Review {job.source_name}
            </button>
          </li>
        ))}
      </ul>
      {more && (
        <button disabled={disabled} onClick={loadMore}>
          Load more imports
        </button>
      )}
    </section>
  );
}
