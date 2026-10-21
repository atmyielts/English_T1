import type { QtiJob } from "../../../../packages/assessment-web/src/qti";
import { qtiState } from "./QtiReview";
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
  return (
    <section>
      <h2>QTI package history</h2>
      <button className="quiet" disabled={disabled} onClick={refresh}>
        Refresh package status
      </button>
      {!jobs.length && ready && (
        <p>
          No QTI packages yet. Choose a destination bank and upload a package to
          begin.
        </p>
      )}
      <ul className="records">
        {jobs.map((row) => (
          <li key={row.id}>
            <strong>{row.filename}</strong>
            <span>{qtiState[row.state] ?? row.state}</span>
            <button
              className="quiet"
              disabled={disabled}
              onClick={() => open(row.id)}
            >
              Review package: {row.filename}
            </button>
          </li>
        ))}
      </ul>
      {more && (
        <button disabled={disabled} onClick={loadMore}>
          Load more QTI packages
        </button>
      )}
    </section>
  );
}
