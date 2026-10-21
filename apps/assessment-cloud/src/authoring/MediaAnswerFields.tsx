import React, { useId } from "react";
import "../../../../packages/assessment-web/src/media-answer.css";
import type { ItemDraft } from "../../../../packages/assessment-core/src/authoring.ts";
import type { ArtifactMime } from "../../../../packages/assessment-core/src/artifacts.ts";
import { MEDIA_RESPONSE_TYPES } from "../../../../packages/assessment-core/src/media-answer.ts";
export const answerFormatLabels: Partial<Record<ArtifactMime, string>> = {
  "application/pdf": "PDF document",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/webp": "WebP image",
  "audio/mpeg": "MP3 audio",
  "audio/wav": "WAV audio",
  "audio/ogg": "OGG audio",
  "audio/webm": "WebM audio (browser recording)",
  "audio/mp4": "MP4 / M4A audio (browser recording)",
  "video/mp4": "MP4 video",
  "video/webm": "WebM video",
};
export function MediaAnswerFields(
  { draft, setDraft }: {
    draft: ItemDraft;
    setDraft: (draft: ItemDraft) => void;
  },
) {
  const hint = useId();
  if (!(MEDIA_RESPONSE_TYPES as readonly string[]).includes(draft.type)) {
    return null;
  }
  const formats: ArtifactMime[] = draft.type === "audio_response"
    ? ["audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4"]
    : draft.type === "video_response"
    ? ["video/mp4", "video/webm"]
    : ["application/pdf", "image/png", "image/jpeg", "image/webp"];
  const rules = draft.responsePolicy;
  const sizes = [
    { bytes: "10485760", label: "10 MiB" },
    { bytes: "52428800", label: "50 MiB" },
    { bytes: "104857600", label: "100 MiB" },
    { bytes: "524288000", label: "500 MiB" },
    { bytes: "2147483648", label: "2 GiB" },
  ];
  const custom = !sizes.some((size) => size.bytes === rules.maxBytes);
  const update = (value: Partial<typeof rules>) =>
    setDraft({ ...draft, responsePolicy: { ...rules, ...value } });
  return (
    <fieldset className="submission-rules">
      <legend>Submission rules</legend>
      <p className="hint">
        These rules are versioned with the question and independently reviewed.
        A later revision cannot change a published exam.
      </p>
      <fieldset>
        <legend>Allowed answer formats — choose at least one</legend>
        {formats.map((mime) => (
          <label className="check" key={mime}>
            <input
              type="checkbox"
              checked={rules.mimes.includes(mime)}
              onChange={(event) =>
                update({
                  mimes: event.target.checked
                    ? [...rules.mimes, mime]
                    : rules.mimes.filter((value) => value !== mime),
                })}
            />
            {answerFormatLabels[mime]}
          </label>
        ))}
      </fieldset>
      <label>
        Maximum submission size<select
          value={custom ? "custom" : rules.maxBytes}
          aria-describedby={hint}
          onChange={(event) =>
            update({
              maxBytes: event.target.value === "custom"
                ? ""
                : event.target.value,
            })}
        >
          {sizes.map((size) => (
            <option key={size.bytes} value={size.bytes}>{size.label}</option>
          ))}
          <option value="custom">Custom exact size</option>
        </select>
      </label>
      {custom && (
        <label>
          Custom maximum size (bytes)<input
            type="number"
            required
            min="1"
            max="2147483648"
            step="1"
            value={rules.maxBytes}
            aria-describedby={hint}
            onChange={(event) => update({ maxBytes: event.target.value })}
          />
        </label>
      )}
      <p id={hint} className="hint">
        {rules.maxBytes.trim() &&
            Number.isSafeInteger(Number(rules.maxBytes)) &&
            Number(rules.maxBytes) > 0
          ? `Each selected answer may contain up to ${
            (Number(rules.maxBytes) / 1048576).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })
          } MiB.`
          : "Enter a custom exact byte limit or choose a standard size."}{" "}
        Larger files are rejected; the limit cannot exceed 2 GiB.
      </p>
      <fieldset>
        <legend>
          How candidates may produce the answer — choose at least one
        </legend>
        {([
          "upload",
          ...(draft.type === "file_response" ? [] : ["capture"]),
        ] as const).map((source) => (
          <label className="check" key={source}>
            <input
              type="checkbox"
              checked={rules.sources.includes(source as "upload" | "capture")}
              onChange={(event) =>
                update({
                  sources: event.target.checked
                    ? [...rules.sources, source as "upload" | "capture"]
                    : rules.sources.filter((value) => value !== source),
                })}
            />
            {source === "upload"
              ? "Upload a prepared file"
              : "Record inside the exam"}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        Only one answer is selected at a time. Scanning does not award marks; an
        assigned human marker uses the approved rubric.
      </p>
    </fieldset>
  );
}
