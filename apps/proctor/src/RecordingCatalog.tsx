import React from "react";
import type { RecordingRow } from "./recording-client";
import { dateTime, label } from "./types";
export function RecordingCatalog(
  { rows, pageLoading, timeline }: {
    rows: RecordingRow[];
    pageLoading: boolean;
    timeline: (row: RecordingRow) => Promise<void>;
  },
) {
  return (
    <ul className="records">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="record-heading">
            <strong>{label(row.source)} recording</strong>
            <span className="state-badge">{label(row.state)}</span>
          </div>
          <span>
            Source: {label(row.provenance)} · Started {dateTime(row.created_at)}
          </span>
          <span>
            {row.last_sequence} timeline entries · {row.gap_count ?? 0}{" "}
            explicit gaps · {row.pending_count ?? 0} pending uploads
          </span>
          <span>
            Close reason:{" "}
            {row.close_reason ? label(row.close_reason) : "Not sealed"}{" "}
            · Retention access ends {dateTime(row.expires_at)}
          </span>
          <button
            className="quiet"
            disabled={pageLoading}
            onClick={() => void timeline(row)}
          >
            Inspect {label(row.source)} recording
          </button>
        </li>
      ))}
    </ul>
  );
}
