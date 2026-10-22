import React, { useId } from "react";
import "../../../../packages/assessment-web/src/media-answer.css";
import type { ItemDraft } from "../../../../packages/assessment-core/src/authoring.ts";
import type { ArtifactMime } from "../../../../packages/assessment-core/src/artifacts.ts";
import { MEDIA_RESPONSE_TYPES } from "../../../../packages/assessment-core/src/media-answer.ts";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT, type AppKey } from "../i18n/index.ts";
export const answerFormatLabels: Partial<Record<ArtifactMime, AppKey>> = {
  "application/pdf": "format.pdf",
  "image/png": "format.png",
  "image/jpeg": "format.jpeg",
  "image/webp": "format.webp",
  "audio/mpeg": "format.mp3",
  "audio/wav": "format.wav",
  "audio/ogg": "format.ogg",
  "audio/webm": "format.webmAudio",
  "audio/mp4": "format.m4a",
  "video/mp4": "format.mp4",
  "video/webm": "format.webmVideo",
};
export function MediaAnswerFields(
  { draft, setDraft }: {
    draft: ItemDraft;
    setDraft: (draft: ItemDraft) => void;
  },
) {
  const hint = useId(), t = useAppT(), { number } = useI18n();
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
      <legend>{t("rules.legend")}</legend>
      <p className="hint">
        {t("rules.lead")}
      </p>
      <fieldset>
        <legend>{t("rules.formats")}</legend>
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
            {answerFormatLabels[mime] && t(answerFormatLabels[mime])}
          </label>
        ))}
      </fieldset>
      <label>
        {t("rules.maxSize")}<select
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
          <option value="custom">{t("rules.custom")}</option>
        </select>
      </label>
      {custom && (
        <label>
          {t("rules.customBytes")}<input
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
          ? t("rules.limit", { size: number(Number(rules.maxBytes) / 1048576, {
              maximumFractionDigits: 3,
            }) })
          : t("rules.limitMissing")}{" "}
        {t("rules.limitCap")}
      </p>
      <fieldset>
        <legend>
          {t("rules.sources")}
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
              ? t("rules.upload")
              : t("rules.capture")}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        {t("rules.single")}
      </p>
    </fieldset>
  );
}
