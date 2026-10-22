import React from "react";
import { dateTime, identifier, label, type ScreenProps } from "./types";
export function SessionList(
  { rows, busy, detailLoading, selectSession }: {
    rows: ScreenProps["rows"];
    busy: boolean;
    detailLoading: boolean;
    selectSession: (id: string) => void;
  },
) {
  return (
    <section>
      <h2>Authorized sessions</h2>
      {!rows.sessions?.length && (
        <p>
          No sessions are visible. Candidates must start an exam with a
          monitoring policy, and your account must be authorized to access it.
        </p>
      )}
      <ul className="records">
        {rows.sessions?.map((row) => (
          <li key={row.id}>
            <div className="record-heading">
              <strong>{identifier(row.candidate_id)}</strong>
              <span className="state-badge">{label(row.state)}</span>
            </div>
            <span>
              Last candidate heartbeat: {dateTime(row.last_heartbeat_at)}
            </span>
            <button
              className="quiet"
              disabled={busy || detailLoading}
              onClick={() => selectSession(identifier(row.id))}
            >
              Open session
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
