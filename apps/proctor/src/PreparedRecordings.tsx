import React from "react";
import {
  type RecordingSelection,
  referenceKey,
} from "./RecordingCitationPicker";
import { label } from "./types";
export function PreparedRecordings(
  { selections, remove }: {
    selections: RecordingSelection[];
    remove: (key: string) => void;
  },
) {
  return (
    <div className="prepared-recordings">
      <h3>Prepared recording intervals</h3>
      <p className="hint">
        Select the relevant intervals in a human finding. Preparing an interval
        does not save a finding or assert a breach.
      </p>
      <ul className="records">
        {selections.map((entry) => (
          <li key={referenceKey(entry.reference)}>
            <span>
              {label(entry.source)} · entries{" "}
              {entry.reference.from_sequence}–{entry.reference.to_sequence}
            </span>
            <button
              className="quiet"
              onClick={() => remove(referenceKey(entry.reference))}
            >
              Remove {label(entry.source)} interval
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
