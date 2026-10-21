import React from "react";
import "./media-answer.css";
import type { MediaAnswerPolicy } from "../../assessment-core/src/media-answer.ts";
const labels: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "audio/mpeg": "MP3",
  "audio/wav": "WAV",
  "audio/ogg": "OGG",
  "audio/webm": "WebM audio",
  "audio/mp4": "MP4 / M4A audio",
  "video/mp4": "MP4",
  "video/webm": "WebM",
};
export const mediaFormatLabel = (mime: string) => labels[mime] ?? mime;
export function MediaAnswerRules({ policy }: { policy?: MediaAnswerPolicy }) {
  if (!policy) {
    return (
      <p role="alert">
        This question has no reviewed submission rules. Revise and independently
        approve the question before enabling delivery.
      </p>
    );
  }
  return (
    <div className="submission-rules">
      <dl>
        <div>
          <dt>Allowed formats</dt>
          <dd>{policy.mimes.map((mime) => labels[mime] ?? mime).join(", ")}</dd>
        </div>
        <div>
          <dt>Maximum answer size</dt>
          <dd>
            {(policy.max_bytes / 1048576).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })} MiB ({policy.max_bytes.toLocaleString()} bytes)
          </dd>
        </div>
        <div>
          <dt>Answer source</dt>
          <dd>
            {policy.sources.map((source) =>
              source === "capture"
                ? "Record inside the exam"
                : "Upload a prepared file"
            ).join(" or ")}
          </dd>
        </div>
      </dl>
      <p className="hint">
        A human marks the selected submission using the reviewed rubric. Only
        one submission is selected at a time.
      </p>
    </div>
  );
}
