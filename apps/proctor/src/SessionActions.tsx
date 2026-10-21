import React, { useState } from "react";
import type { Command, Session } from "./types";
export function SessionActions(
  { session, busy, command }: {
    session: Session;
    busy: boolean;
    command: Command;
  },
) {
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void command("session.warn", {
          session_id: session.id,
          reason,
        }, "Candidate warning recorded.");
      }}
    >
      <label>
        Reason for session action<textarea
          className="prose-input"
          required
          maxLength={2000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="action-row">
        <button disabled={busy}>Record warning</button>
        <button
          type="button"
          className="quiet"
          disabled={busy || !reason.trim()}
          onClick={() => {
            const action = session.state === "paused"
              ? "session.resume"
              : "session.pause";
            if (
              window.confirm(
                `${
                  session.state === "paused" ? "Resume" : "Pause"
                } this candidate’s exam? The reason will be audited.`,
              )
            ) {
              void command(
                action,
                { session_id: session.id, reason },
                action === "session.pause"
                  ? "Assessment paused."
                  : "Assessment resumed.",
              );
            }
          }}
        >
          {session.state === "paused"
            ? "Resume assessment"
            : "Pause assessment"}
        </button>
      </div>
    </form>
  );
}
