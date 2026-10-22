import React, { useState } from "react";
import {
  type RecordingReference,
  recordingReferences,
} from "../../../packages/assessment-core/src/recording-citations";
import type { RecordingRow } from "./recording-client";
import { useAppT, useCodeText, useErrorText } from "./i18n/index.ts";
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
  const t = useAppT(), code = useCodeText(), problem = useErrorText();
  const [first, setFirst] = useState("1"),
    [last, setLast] = useState(String(recording.last_sequence)),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (recording.state !== "sealed" || !recording.last_sequence) {
    return <p className="hint">{t("picker.sealedOnly")}</p>;
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
          setNotice(t("picker.prepared"));
        } catch (cause) {
          setError(problem(cause, "picker.failed"));
        }
      }}
    >
      <h5>{t("picker.title")}</h5>
      <p className="hint">{t("picker.hint")}</p>
      <div className="form-pair">
        <label>
          {t("picker.first")}<input
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
          {t("picker.last")}<input
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
        {t("picker.submit", { source: code("source", recording.source) })}
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}
