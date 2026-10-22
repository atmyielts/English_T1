import React from "react";
import { useAppT, useCodeText } from "./i18n/index.ts";
import type { RecordingCitation } from "./types";
export function FindingRecordingCitation(
  { cite }: { cite: RecordingCitation },
) {
  const t = useAppT(), code = useCodeText();
  return (
    <div className="permanent-recording-citation">
      <strong>
        {t("recording.entries", { source: code("source", cite.source), from: String(cite.from_sequence), to: String(cite.to_sequence) })}
      </strong>
      <p>
        {t("citation.counts", { media: cite.media_count, gaps: cite.gap_count, source: code("source", cite.provenance) })}
      </p>
      <span>
        {t("citation.interval", { start: (cite.start_ms / 1000).toFixed(3), end: (cite.end_ms / 1000).toFixed(3) })}
      </span>
      <details>
        <summary>{t("citation.receipts")}</summary>
        <p className="recording-hash">
          {t("citation.recording", { id: cite.recording_id })}
          <br />{t("citation.manifest", { hash: cite.recording_head_hash })}
          <br />{t("citation.first", { hash: cite.from_chain_hash })}
          <br />{t("citation.last", { hash: cite.to_chain_hash })}
        </p>
      </details>
    </div>
  );
}
