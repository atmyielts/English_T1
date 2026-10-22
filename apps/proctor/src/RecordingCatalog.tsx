import React from "react";
import type { RecordingRow } from "./recording-client";
import { useAppT, useCodeText, useDateTime } from "./i18n/index.ts";
export function RecordingCatalog(
  { rows, pageLoading, timeline }: {
    rows: RecordingRow[];
    pageLoading: boolean;
    timeline: (row: RecordingRow) => Promise<void>;
  },
) {
  const t = useAppT(), code = useCodeText(), dateTime = useDateTime();
  return (
    <ul className="records">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="record-heading">
            <strong>{t("recording.title", { source: code("source", row.source) })}</strong>
            <span className="state-badge">{code("state", row.state)}</span>
          </div>
          <span>
            {t("recording.meta", { source: code("source", row.provenance), time: dateTime(row.created_at) })}
          </span>
          <span>
            {t("recording.counts", { entries: row.last_sequence, gaps: row.gap_count ?? 0, pending: row.pending_count ?? 0 })}
          </span>
          <span>
            {t("recording.close", { reason: row.close_reason ? code("closeReason", row.close_reason) : t("recording.notSealed"), time: dateTime(row.expires_at) })}
          </span>
          <button
            className="quiet"
            disabled={pageLoading}
            onClick={() => void timeline(row)}
          >
            {t("recording.inspect", { source: code("source", row.source) })}
          </button>
        </li>
      ))}
    </ul>
  );
}
