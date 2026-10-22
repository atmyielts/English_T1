import React, { useState } from "react";
import type { FormItem } from "../../assessment-core/src/mod.ts";
import type { ArtifactMime } from "../../assessment-core/src/artifacts.ts";
import { mediaAnswer } from "../../assessment-core/src/media-answer.ts";
import type { AttemptRuntime } from "./runtime";
import { MediaAnswerRules, mediaFormatLabel } from "./MediaAnswerRules";
import { useAcademicAnswer } from "./useAcademicAnswer";
import { ClearAcademicSelection } from "./ClearAcademicSelection";
import "./media-answer.css";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { isWebKey, localizeText } from "./i18n/translate.ts";
import { useWebT } from "./i18n/useWebT.ts";
export function CandidateMediaAnswer({
  tenant,
  actor,
  attempt,
  entry,
  enabled,
  value,
  confirmed,
  runtime,
  select,
  onRecording,
}: {
  tenant: string;
  actor: string;
  attempt: string;
  entry: FormItem;
  enabled: boolean;
  value: unknown;
  confirmed: boolean;
  runtime: () => AttemptRuntime | null;
  select: (binding: unknown) => Promise<boolean>;
  onRecording?: (active: boolean) => void;
}) {
  const t = useWebT(), { number } = useI18n();
  /** Status codes keep their English wording; other languages translate them. */
  const code = (prefix: "phase" | "asset", value: string) => {
    const key = `mediaAnswer.${prefix}.${value}`;
    return isWebKey(key) ? t(key) : value;
  };
  const state = useAcademicAnswer(
      tenant,
      actor,
      attempt,
      entry,
      enabled,
      runtime,
      select,
      onRecording,
    ),
    policy = entry.item.media_response;
  const [file, setFile] = useState<File | null>(null),
    [mime, setMime] = useState<ArtifactMime>(
      policy?.mimes[0] ?? "application/pdf",
    ),
    [resume, setResume] = useState(""),
    [discard, setDiscard] = useState("");
  let selected = "";
  try {
    selected = mediaAnswer(value).artifact_id;
  } catch {}
  const capturing = state.recording?.phase === "recording" ||
      state.recording?.phase === "stopping",
    disabled = state.busy || !state.ready;
  return (
    <div className="academic-answer">
      <MediaAnswerRules policy={policy} />
      {!policy ? null : (
        <>
          {state.error && <p className="error" role="alert">{state.error}</p>}
          {state.notice && <p role="status">{state.notice}</p>}
          {!state.ready && (
            <p role="status">{t("mediaAnswer.opening")}</p>
          )}
          {selected && (
            <p role="status">
              {t(
                confirmed
                  ? "mediaAnswer.selectedConfirmed"
                  : "mediaAnswer.selectedHeld",
              )}
            </p>
          )}
          {value === null && (
            <p role="status">
              {t(
                confirmed
                  ? "mediaAnswer.clearedConfirmed"
                  : "mediaAnswer.clearedHeld",
              )}
            </p>
          )}
          {selected && (
            <ClearAcademicSelection
              selected={selected}
              disabled={disabled || !enabled || capturing}
              clear={() => void state.clear()}
            />
          )}
          {policy.sources.includes("upload") && (
            <fieldset disabled={disabled || !enabled || capturing}>
              <legend>{t("mediaAnswer.saveFile")}</legend>
              <label>
                {t("mediaAnswer.file")}<input
                  type="file"
                  accept={policy.mimes.join(",")}
                  onChange={(event) => {
                    const chosen = event.target.files?.[0] ?? null;
                    setFile(chosen);
                    if (
                      chosen &&
                      policy.mimes.includes(chosen.type as ArtifactMime)
                    ) {
                      setMime(chosen.type as ArtifactMime);
                    }
                  }}
                />
              </label>
              <label>
                {t("mediaAnswer.format")}<select
                  value={mime}
                  onChange={(event) =>
                    setMime(event.target.value as ArtifactMime)}
                >
                  {policy.mimes.map((format) => (
                    <option key={format} value={format}>
                      {mediaFormatLabel(format, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("mediaAnswer.recoverCopy")}<select
                  value={resume}
                  onChange={(event) =>
                    setResume(event.target.value)}
                >
                  <option value="">{t("mediaAnswer.newCopy")}</option>
                  {state.files.filter((row) =>
                    row.phase === "open" && row.source === "upload"
                  ).map((row) => (
                    <option value={row.id} key={row.id}>
                      {t("mediaAnswer.bytesSaved", {
                        name: row.filename,
                        bytes: number(row.byte_length),
                      })}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!file}
                onClick={() =>
                  file && void state.stage(file, mime, resume || undefined)}
              >
                {t("mediaAnswer.saveCopy")}
              </button>
            </fieldset>
          )}
          {policy.sources.includes("capture") && (
            <fieldset disabled={disabled || !enabled}>
              <legend>{t("mediaAnswer.record")}</legend>
              <p className="hint">
                {t(
                  entry.item.type === "video_response"
                    ? "mediaAnswer.requestsVideo"
                    : "mediaAnswer.requestsAudio",
                )}
              </p>
              <p role="status">
                {state.recording
                  ? t("mediaAnswer.committed", {
                    phase: code("phase", state.recording.phase),
                    bytes: number(state.recording.saved_bytes),
                    problem: state.recording.problem
                      ? localizeText(state.recording.problem, t)
                      : "",
                  })
                  : t("mediaAnswer.noTake")}
              </p>
              <button
                type="button"
                disabled={capturing}
                onClick={() =>
                  void state.start()}
              >
                {t(
                  entry.item.type === "video_response"
                    ? "mediaAnswer.startVideo"
                    : "mediaAnswer.startAudio",
                )}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={!capturing}
                onClick={() => void state.stop()}
              >
                {t("mediaAnswer.stop")}
              </button>
            </fieldset>
          )}
          <h3>{t("mediaAnswer.copies")}</h3>
          <p className="hint">{t("mediaAnswer.copiesHint")}</p>
          {!state.files.length
            ? (
              <p>{t("mediaAnswer.noCopies")}</p>
            )
            : (
              <ul className="records">
                {state.files.map((row) => {
                  const remote = state.assets.find((asset) =>
                      asset.id === row.binding?.artifact_id
                    ),
                    chosen = selected === row.binding?.artifact_id;
                  return (
                    <li key={row.id}>
                      <strong>{row.filename}</strong>
                      <span>
                        {t("mediaAnswer.copyState", {
                          bytes: number(row.byte_length),
                          state: t(
                            row.phase === "open"
                              ? row.source === "capture"
                                ? "mediaAnswer.copy.interrupted"
                                : "mediaAnswer.copy.incomplete"
                              : "mediaAnswer.copy.sealed",
                          ),
                        })}
                      </span>
                      {row.binding && (
                        <span>
                          {t(
                            chosen
                              ? confirmed
                                ? "mediaAnswer.binding.confirmed"
                                : "mediaAnswer.binding.local"
                              : "mediaAnswer.binding.admitted",
                          )} ·{" "}
                          {code(
                            "asset",
                            remote?.state ?? row.upload?.completed?.state ??
                              "upload_incomplete",
                          )}
                        </span>
                      )}
                      <div className="author-actions">
                        <button
                          type="button"
                          disabled={disabled || !enabled || capturing ||
                            row.phase !== "sealed"}
                          onClick={() => void state.select(row.id)}
                        >
                          {t("mediaAnswer.use")}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={disabled || capturing ||
                            row.phase !== "sealed" ||
                            (!enabled && !row.binding)}
                          onClick={() => void state.upload(row.id)}
                        >
                          {t("mediaAnswer.finishUpload")}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={disabled || capturing}
                          onClick={() => setDiscard(row.id)}
                        >
                          {t("mediaAnswer.remove")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          {discard && (
            <div role="group" aria-label={t("mediaAnswer.confirmRemove")}>
              <p>{t("mediaAnswer.removeExplain")}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  void state.discard(discard);
                  setDiscard("");
                }}
              >
                {t("mediaAnswer.confirmRemove")}
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  setDiscard("")}
              >
                {t("mediaAnswer.keep")}
              </button>
            </div>
          )}
          <button
            type="button"
            className="quiet"
            disabled={disabled || capturing}
            onClick={() => void state.refresh()}
          >
            {t("mediaAnswer.refresh")}
          </button>
        </>
      )}
    </div>
  );
}
