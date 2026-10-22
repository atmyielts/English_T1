import React from "react";
import { RecordingPlayer } from "./RecordingPlayer";
import {
  RecordingCitationPicker,
  type RecordingSelection,
} from "./RecordingCitationPicker";
import type { RecordingRow, RecordingSegment } from "./recording-client";
import { label } from "./types";
const elapsed = (ms: number) =>
  `${Math.floor(ms / 60000)}:${
    String(Math.floor(ms / 1000) % 60).padStart(2, "0")
  }.${String(ms % 1000).padStart(3, "0")}`;
export function RecordingTimeline({
  selected,
  entries,
  next,
  pageLoading,
  tenant,
  actor,
  timeline,
  prepareReference,
}: {
  selected: RecordingRow;
  entries: RecordingSegment[];
  next: number | null;
  pageLoading: boolean;
  tenant: string;
  actor: string;
  timeline: (row: RecordingRow, after?: number) => Promise<void>;
  prepareReference: (value: RecordingSelection) => void;
}) {
  return (
    <article className="recording-detail">
      <h4>{label(selected.source)} recording timeline</h4>
      <p className="hint">
        Reported time is relative to this recorder/container, not a verified
        wall-clock or uninterrupted coverage claim.
      </p>
      {selected.state === "open" && (
        <p className="service-warning">
          This recording is open. Pending recovery must finish before recorded
          playback.
        </p>
      )}
      <RecordingPlayer
        key={`${selected.id}:${actor}:${tenant}`}
        row={selected}
        tenant={tenant}
        actor={actor}
      />
      <RecordingCitationPicker
        key={selected.id}
        recording={selected}
        selected={prepareReference}
      />
      <ol className="evidence-timeline">
        {entries.map((entry) => (
          <li key={entry.sequence}>
            <strong>
              #{entry.sequence} · {entry.kind === "gap"
                ? "Missing footage"
                : entry.state === "reserved"
                ? "Upload not yet confirmed"
                : "Verified saved media"}
            </strong>
            <span>
              {elapsed(entry.start_ms)}–{elapsed(entry.end_ms)} ·{" "}
              {label(entry.state)}
            </span>
            {entry.reason && <p>{entry.reason}</p>}
            <span className="recording-hash">
              Chain receipt: {entry.chain_hash}
            </span>
          </li>
        ))}
      </ol>
      {!entries.length && (
        <p>
          No media or gap entries were reserved. Sealing alone does not prove
          that footage was captured.
        </p>
      )}
      {next !== null && (
        <button
          className="quiet"
          disabled={pageLoading}
          onClick={() => void timeline(selected, next)}
        >
          Load next timeline entries
        </button>
      )}
    </article>
  );
}
