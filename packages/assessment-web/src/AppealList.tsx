import React from "react";
import { appealCategoryText, appealStatusText } from "./appeals";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { useWebT } from "./i18n/useWebT.ts";
import type { useAppeals } from "./use-appeals";
export function AppealList(
  { state }: { state: ReturnType<typeof useAppeals> },
) {
  const t = useWebT(), { date } = useI18n();
  return (
    <>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      {state.notice && <p role="status" className="notice">{state.notice}</p>}
      {state.pending && (
        <div role="status">
          <p>
            {t(
              state.pending.action === "appeal.submit"
                ? "appeal.list.pendingSubmission"
                : state.pending.action === "appeal.withdraw"
                ? "appeal.list.pendingWithdrawal"
                : "appeal.list.pendingDecision",
            )}
          </p>
          <button disabled={state.busy} onClick={() => void state.send()}>
            {t("appeal.list.retry")}
          </button>
        </div>
      )}
      {state.loading && <p role="status">{t("appeal.list.loading")}</p>}
      {!state.commandReady && !state.error && (
        <p role="status">{t("appeal.list.preparing")}</p>
      )}
      {!state.loading && !state.rows.length && !state.error && (
        <p>{t("appeal.list.empty")}</p>
      )}
      <ul className="records appeal-list" aria-label={t("appeal.list.label")}>
        {state.rows.map((row) => (
          <li key={row.id}>
            <strong>{appealCategoryText(row.category, t)}</strong>
            <span>
              {appealStatusText(row.status, t)} · {date(row.created_at)}
            </span>
            <button
              className="quiet"
              disabled={state.busy}
              onClick={() => void state.open(row.id)}
            >
              {t("appeal.list.open")}
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
          {t("appeal.list.refresh")}
        </button>
        {state.more && (
          <button
            className="quiet"
            disabled={state.loading || state.busy}
            onClick={() => void state.loadMore()}
          >
            {t("appeal.list.more")}
          </button>
        )}
      </div>
    </>
  );
}
