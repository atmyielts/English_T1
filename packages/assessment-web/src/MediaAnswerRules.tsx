import React from "react";
import "./media-answer.css";
import type { MediaAnswerPolicy } from "../../assessment-core/src/media-answer.ts";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { useWebT } from "./i18n/useWebT.ts";
import { english, type Translate } from "./i18n/translate.ts";
import type { WebKey } from "./i18n/catalog.ts";
const labels: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "audio/mpeg": "MP3",
  "audio/wav": "WAV",
  "audio/ogg": "OGG",
  "video/mp4": "MP4",
  "video/webm": "WebM",
};
const translated: Record<string, WebKey> = {
  "audio/webm": "mediaRules.format.webmAudio",
  "audio/mp4": "mediaRules.format.mp4Audio",
};
export const mediaFormatLabel = (mime: string, t: Translate = english) =>
  translated[mime] ? t(translated[mime]) : labels[mime] ?? mime;
export function MediaAnswerRules({ policy }: { policy?: MediaAnswerPolicy }) {
  const t = useWebT(), { number } = useI18n();
  if (!policy) {
    return (
      <p role="alert">{t("mediaRules.missing")}</p>
    );
  }
  return (
    <div className="submission-rules">
      <dl>
        <div>
          <dt>{t("mediaRules.formats")}</dt>
          <dd>{policy.mimes.map((mime) => mediaFormatLabel(mime, t)).join(", ")}</dd>
        </div>
        <div>
          <dt>{t("mediaRules.maxSize")}</dt>
          <dd>
            {t("mediaRules.size", {
              mib: number(policy.max_bytes / 1048576, {
                maximumFractionDigits: 3,
              }),
              bytes: number(policy.max_bytes),
            })}
          </dd>
        </div>
        <div>
          <dt>{t("mediaRules.source")}</dt>
          <dd>
            {policy.sources.map((source) =>
              t(source === "capture" ? "mediaRules.capture" : "mediaRules.upload")
            ).join(t("mediaRules.or"))}
          </dd>
        </div>
      </dl>
      <p className="hint">{t("mediaRules.marking")}</p>
    </div>
  );
}
