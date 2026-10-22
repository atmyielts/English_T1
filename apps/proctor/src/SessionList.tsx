import React from "react";
import { useAppT, useCodeText, useDateTime } from "./i18n/index.ts";
import { identifier, type ScreenProps } from "./types";
export function SessionList(
  { rows, busy, detailLoading, selectSession }: {
    rows: ScreenProps["rows"];
    busy: boolean;
    detailLoading: boolean;
    selectSession: (id: string) => void;
  },
) {
  const t = useAppT(), code = useCodeText(), dateTime = useDateTime();
  return (
    <section>
      <h2>{t("sessions.authorized")}</h2>
      {!rows.sessions?.length && <p>{t("sessions.empty")}</p>}
      <ul className="records">
        {rows.sessions?.map((row) => (
          <li key={row.id}>
            <div className="record-heading">
              <strong>{identifier(row.candidate_id)}</strong>
              <span className="state-badge">{code("state", row.state)}</span>
            </div>
            <span>
              {t("sessions.heartbeat", { time: dateTime(row.last_heartbeat_at) })}
            </span>
            <button
              className="quiet"
              disabled={busy || detailLoading}
              onClick={() => selectSession(identifier(row.id))}
            >
              {t("sessions.open")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
