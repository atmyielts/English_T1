import React, { useState } from "react";
import { useAppT } from "./i18n/index.ts";
import type { Command, Session } from "./types";
export function SessionActions(
  { session, busy, command }: {
    session: Session;
    busy: boolean;
    command: Command;
  },
) {
  const t = useAppT();
  const [reason, setReason] = useState("");
  const paused = session.state === "paused";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void command("session.warn", {
          session_id: session.id,
          reason,
        }, t("actions.warned"));
      }}
    >
      <label>
        {t("actions.reason")}<textarea
          className="prose-input"
          required
          maxLength={2000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="action-row">
        <button disabled={busy}>{t("actions.warn")}</button>
        <button
          type="button"
          className="quiet"
          disabled={busy || !reason.trim()}
          onClick={() => {
            const action = paused ? "session.resume" : "session.pause";
            if (window.confirm(t(paused ? "actions.confirmResume" : "actions.confirmPause"))) {
              void command(
                action,
                { session_id: session.id, reason },
                action === "session.pause" ? t("actions.paused") : t("actions.resumed"),
              );
            }
          }}
        >
          {paused ? t("actions.resume") : t("actions.pause")}
        </button>
      </div>
    </form>
  );
}
