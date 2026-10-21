import React, { useState } from "react";
import {
  type RecordingReference,
  recordingReferences,
} from "../../../packages/assessment-core/src/recording-citations";
import type { RecordingRow } from "./recording-client";
import { label } from "./types";
export interface RecordingSelection {
  reference: RecordingReference;
  source: string;
}
export const referenceKey = (ref: RecordingReference) =>
  `${ref.recording_id}:${ref.from_sequence}:${ref.to_sequence}:${ref.head_hash}`;
export function RecordingCitationPicker(
  { recording, selected }: {
    recording: RecordingRow;
    selected: (value: RecordingSelection) => void;
  },
) {
  const [first, setFirst] = useState("1"),
    [last, setLast] = useState(String(recording.last_sequence)),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (recording.state !== "sealed" || !recording.last_sequence) {
    return (
      <p className="hint">
        Only sealed, nonempty recording timelines can be cited in permanent
        findings.
      </p>
    );
  }
  return (
    <form
      className="recording-citation-picker"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        try {
          const [reference] = recordingReferences([{
            recording_id: recording.id,
            from_sequence: Number(first),
            to_sequence: Number(last),
            head_hash: recording.head_hash,
          }]);
          selected({ reference, source: recording.source });
          setNotice(
            "Recording interval prepared. Select it in the relevant human finding below.",
          );
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not prepare this citation.",
          );
        }
      }}
    >
      <h5>Prepare recording evidence</h5>
      <p className="hint">
        Choose timeline entry numbers you personally reviewed. This pins the
        immutable recording and selected interval, including any missing-footage
        entries; it does not generate a misconduct decision.
      </p>
      <div className="form-pair">
        <label>
          First recording entry<input
            type="number"
            required
            min={1}
            max={recording.last_sequence}
            step={1}
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </label>
        <label>
          Last recording entry<input
            type="number"
            required
            min={Number(first) || 1}
            max={recording.last_sequence}
            step={1}
            value={last}
            onChange={(event) => setLast(event.target.value)}
          />
        </label>
      </div>
      <button className="quiet">
        Prepare {label(recording.source)} interval
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}
