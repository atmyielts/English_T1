import React, { useState } from "react";
import type { RecordingRow } from "./recording-client";
import { useRecordingPlayback } from "./use-recording-playback";
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

  return (
    <div className="recording-player">
      <div className="action-row">
        <button
          className="quiet"
          disabled={row.state !== "sealed"}
          onClick={() =>
            setPlayback({ target: 0, epoch: (playback?.epoch ?? 0) + 1 })}
        >
          Load verified playback
        </button>
        {playback && (
          <button
            className="quiet"
            onClick={() => {
              setPlayback(null);
              setStatus("Playback cleared.");
              setProblem("");
            }}
          >
            Clear playback
          </button>
        )}
      </div>
      <video
        ref={video}
        controls
        preload="metadata"
        aria-label={`${row.source} recording playback`}
        playsInline
      />
      <p className="hint">
        No autoplay. Footage and timestamps are browser-reported, not proof of
        identity or misconduct. A transcript is not available yet.
      </p>
      {status && <p role="status">{status}</p>}
      {problem && <p role="alert" className="error">{problem}</p>}
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
            Jump to playback time (seconds)<input
              type="number"
              min={0}
              max={row.last_end_ms / 1000}
              step="0.1"
              value={seconds}
              onChange={(event) => setSeconds(event.target.value)}
            />
          </label>
          <button className="quiet">Seek from verified initialization</button>
          <p className="hint">
            Seeking outside the buffer rereads the ordered container from its
            beginning. Indexed processed renditions are still required for
            efficient long-recording access.
          </p>
        </form>
      )}
    </div>
  );
}
