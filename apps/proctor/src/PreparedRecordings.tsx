import React from "react";
import {
  type RecordingSelection,
  referenceKey,
} from "./RecordingCitationPicker";
import { useAppT, useCodeText } from "./i18n/index.ts";
export function PreparedRecordings(
  { selections, remove }: {
    selections: RecordingSelection[];
    remove: (key: string) => void;
  },
) {
  const t = useAppT(), code = useCodeText();
  return (
    <div className="prepared-recordings">
      <h3>{t("prepared.title")}</h3>
      <p className="hint">{t("prepared.hint")}</p>
      <ul className="records">
        {selections.map((entry) => (
          <li key={referenceKey(entry.reference)}>
            <span>
              {t("recording.entries", { source: code("source", entry.source), from: String(entry.reference.from_sequence), to: String(entry.reference.to_sequence) })}
            </span>
            <button
              className="quiet"
              onClick={() => remove(referenceKey(entry.reference))}
            >
              {t("prepared.remove", { source: code("source", entry.source) })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
