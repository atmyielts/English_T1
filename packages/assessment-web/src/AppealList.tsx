import React from "react";
import { appealCategory, appealStatus } from "./appeals";
import type { useAppeals } from "./use-appeals";
export function AppealList(
  { state }: { state: ReturnType<typeof useAppeals> },
) {
  return (
    <>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      {state.notice && <p role="status" className="notice">{state.notice}</p>}
      {state.pending && (
        <div role="status">
          <p>
            A saved {state.pending.action === "appeal.submit"
              ? "appeal submission"
              : state.pending.action === "appeal.withdraw"
              ? "withdrawal"
              : "decision"}{" "}
            has no confirmed receipt. Retry it before another change.
          </p>
          <button disabled={state.busy} onClick={() => void state.send()}>
            Retry saved appeal request
          </button>
        </div>
      )}
      {state.loading && <p role="status">Checking appeal records…</p>}
      {!state.commandReady && !state.error && (
        <p role="status">Preparing secure appeal recovery…</p>
      )}
      {!state.loading && !state.rows.length && !state.error && (
        <p>No appeal records yet.</p>
      )}
      <ul className="records appeal-list" aria-label="Appeal records">
        {state.rows.map((row) => (
          <li key={row.id}>
            <strong>{appealCategory[row.category]}</strong>
            <span>
              {appealStatus[row.status]} ·{" "}
              {new Date(row.created_at).toLocaleString()}
            </span>
            <button
              className="quiet"
              disabled={state.busy}
              onClick={() => void state.open(row.id)}
            >
              Open appeal
            </button>
          </li>
        ))}
      </ul>
      <div className="appeal-actions">
        <button
          className="quiet"
          disabled={state.loading || state.busy}
          onClick={() => void state.refresh()}
        >
          Refresh appeals
        </button>
        {state.more && (
          <button
            className="quiet"
            disabled={state.loading || state.busy}
            onClick={() => void state.loadMore()}
          >
            Load more appeals
          </button>
        )}
      </div>
    </>
  );
}
