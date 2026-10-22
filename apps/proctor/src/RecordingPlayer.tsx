import React, { useState } from "react";
import type { RecordingRow } from "./recording-client";
import { useRecordingPlayback } from "./use-recording-playback";
import { useAppT, useCodeText, useErrorText } from "./i18n/index.ts";
export function RecordingPlayer(
  { row, tenant, actor }: { row: RecordingRow; tenant: string; actor: string },
) {
  const {
    video,
    playback,
    setPlayback,
    problem,
    status,
    setProblem,
    setStatus,
  } = useRecordingPlayback(row, tenant, actor);
  const [seconds, setSeconds] = useState("0");
  const t = useAppT(), code = useCodeText(), problemText = useErrorText();

  return (
    <div className="recording-player">
      <div className="action-row">
        <button
          className="quiet"
          disabled={row.state !== "sealed"}
          onClick={() =>
            setPlayback({ target: 0, epoch: (playback?.epoch ?? 0) + 1 })}
        >
          {t("player.load")}
        </button>
        {playback && (
          <button
            className="quiet"
            onClick={() => {
              setPlayback(null);
              setStatus({ key: "player.cleared" });
              setProblem(null);
            }}
          >
            {t("player.clear")}
          </button>
        )}
      </div>
      <video
        ref={video}
        controls
        preload="metadata"
        aria-label={t("player.video", { source: code("source", row.source) })}
        playsInline
      />
      <p className="hint">{t("player.hint")}</p>
      {status && <p role="status">{t(status.key, status.params)}</p>}
      {problem != null && <p role="alert" className="error">{problemText(problem, "player.failed")}</p>}
      {playback && (
        <form
          className="playback-seek"
          onSubmit={(event) => {
            event.preventDefault();
            const target = Number(seconds);
            if (
              Number.isFinite(target) && target >= 0 &&
              target <= row.last_end_ms / 1000
            ) setPlayback({ target, epoch: playback.epoch + 1 });
          }}
        >
          <label>
            {t("player.jump")}<input
              type="number"
              min={0}
              max={row.last_end_ms / 1000}
              step="0.1"
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
            />
          </label>
          <button className="quiet">{t("player.seek")}</button>
          <p className="hint">{t("player.seekHint")}</p>
        </form>
      )}
    </div>
  );
}
