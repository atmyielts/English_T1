import React from "react";
import { label, type RecordingCitation } from "./types";
export function FindingRecordingCitation(
  { cite }: { cite: RecordingCitation },
) {
  return (
    <div className="permanent-recording-citation">
      <strong>
        {label(cite.source)} · entries {cite.from_sequence}–{cite.to_sequence}
      </strong>
      <p>
        {cite.media_count} saved media{" "}
        {cite.media_count === 1 ? "entry" : "entries"} · {cite.gap_count}{" "}
        missing-footage {cite.gap_count === 1 ? "entry" : "entries"} · source:
        {" "}
        {label(cite.provenance)}
      </p>
      <span>
        Reported interval:{" "}
        {(cite.start_ms / 1000).toFixed(3)}–{(cite.end_ms / 1000)
          .toFixed(3)} seconds
      </span>
      <details>
        <summary>Pinned recording receipts</summary>
        <p className="recording-hash">
          Recording: {cite.recording_id}
          <br />Manifest: {cite.recording_head_hash}
          <br />First entry: {cite.from_chain_hash}
          <br />Last entry: {cite.to_chain_hash}
        </p>
      </details>
    </div>
  );
}
