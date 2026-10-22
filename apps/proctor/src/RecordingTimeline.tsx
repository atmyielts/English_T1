import React from "react";
import { RecordingPlayer } from "./RecordingPlayer";
import {
  RecordingCitationPicker,
  type RecordingSelection,
} from "./RecordingCitationPicker";
import type { RecordingRow, RecordingSegment } from "./recording-client";
import { useAppT, useCodeText } from "./i18n/index.ts";
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
  const t = useAppT(), code = useCodeText();
  return (
    <article className="recording-detail">
      <h4>{t("timeline.title", { source: code("source", selected.source) })}</h4>
      <p className="hint">{t("timeline.hint")}</p>
      {selected.state === "open" && (
        <p className="service-warning">{t("timeline.open")}</p>
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
                ? t("timeline.gap")
                : entry.state === "reserved"
                ? t("timeline.reserved")
                : t("timeline.saved")}
            </strong>
            <span>
              {elapsed(entry.start_ms)}–{elapsed(entry.end_ms)} ·{" "}
              {code("state", entry.state)}
            </span>
            {entry.reason && <p>{entry.reason}</p>}
            <span className="recording-hash">
              {t("timeline.receipt", { hash: entry.chain_hash })}
            </span>
          </li>
        ))}
      </ol>
      {!entries.length && (
        <p>{t("timeline.empty")}</p>
      )}
      {next !== null && (
        <button
          className="quiet"
          disabled={pageLoading}
          onClick={() => void timeline(selected, next)}
        >
          {t("timeline.next")}
        </button>
      )}
    </article>
  );
}
