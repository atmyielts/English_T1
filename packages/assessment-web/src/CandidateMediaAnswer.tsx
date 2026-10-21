import React, { useState } from "react";
import type { FormItem } from "../../assessment-core/src/mod.ts";
import type { ArtifactMime } from "../../assessment-core/src/artifacts.ts";
import { mediaAnswer } from "../../assessment-core/src/media-answer.ts";
import type { AttemptRuntime } from "./runtime";
import { MediaAnswerRules, mediaFormatLabel } from "./MediaAnswerRules";
import { useAcademicAnswer } from "./useAcademicAnswer";
import { ClearAcademicSelection } from "./ClearAcademicSelection";
import "./media-answer.css";
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
            <p role="status">Opening encrypted academic answer recovery…</p>
          )}
          {selected && (
            <p role="status">
              {confirmed
                ? "Selected answer confirmed by the exam service."
                : "A selection is held on this device; check response sync before the deadline."}
            </p>
          )}
          {value === null && (
            <p role="status">
              {confirmed
                ? "No answer selected — confirmed by the exam service."
                : "Clearing is held on this device; check response sync before the deadline."}
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
              <legend>Save a file on this device</legend>
              <label>
                Submission file<input
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
                Submission format<select
                  value={mime}
                  onChange={(event) =>
                    setMime(event.target.value as ArtifactMime)}
                >
                  {policy.mimes.map((format) => (
                    <option key={format} value={format}>
                      {mediaFormatLabel(format)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Device copy to recover<select
                  value={resume}
                  onChange={(event) =>
                    setResume(event.target.value)}
                >
                  <option value="">Save as a new device copy</option>
                  {state.files.filter((row) =>
                    row.phase === "open" && row.source === "upload"
                  ).map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.filename} · {row.byte_length.toLocaleString()}{" "}
                      bytes saved
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
                Save encrypted device copy
              </button>
            </fieldset>
          )}
          {policy.sources.includes("capture") && (
            <fieldset disabled={disabled || !enabled}>
              <legend>Record this academic answer</legend>
              <p className="hint">
                This explicitly requests your
                microphone{entry.item.type === "video_response"
                  ? " and camera"
                  : ""}{" "}
                for this answer only. It is separate from proctor monitoring.
              </p>
              <p role="status">
                {state.recording
                  ? `${state.recording.phase}: ${state.recording.saved_bytes.toLocaleString()} bytes committed on this device. ${
                    state.recording.problem ?? ""
                  }`
                  : "No academic take is recording."}
              </p>
              <button
                type="button"
                disabled={capturing}
                onClick={() =>
                  void state.start()}
              >
                Start {entry.item.type === "video_response" ? "video" : "audio"}
                {" "}
                answer recording
              </button>
              <button
                type="button"
                className="quiet"
                disabled={!capturing}
                onClick={() => void state.stop()}
              >
                Stop and seal this take
              </button>
            </fieldset>
          )}
          <h3>Device copies and selected answer</h3>
          <p className="hint">
            A device copy is not automatically selected. Use a sealed copy
            before the deadline; its exact pinned bytes may finish uploading
            afterward.
          </p>
          {!state.files.length
            ? (
              <p>
                No answer bytes are saved in this question's device workspace.
              </p>
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
                        {row.byte_length.toLocaleString()} bytes ·{" "}
                        {row.phase === "open"
                          ? row.source === "capture"
                            ? "Interrupted or unfinished take — not a complete answer"
                            : "Incomplete device copy — reselect to recover"
                          : "Sealed device copy"}
                      </span>
                      {row.binding && (
                        <span>
                          {chosen
                            ? confirmed
                              ? "Selected and confirmed"
                              : "Selected locally; awaiting sync"
                            : "Admitted, not currently selected"} ·{" "}
                          {remote?.state ?? row.upload?.completed?.state ??
                            "upload incomplete"}
                        </span>
                      )}
                      <div className="author-actions">
                        <button
                          type="button"
                          disabled={disabled || !enabled || capturing ||
                            row.phase !== "sealed"}
                          onClick={() => void state.select(row.id)}
                        >
                          Use this answer
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={disabled || capturing ||
                            row.phase !== "sealed" ||
                            (!enabled && !row.binding)}
                          onClick={() => void state.upload(row.id)}
                        >
                          Finish or recover upload
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          disabled={disabled || capturing}
                          onClick={() => setDiscard(row.id)}
                        >
                          Remove device copy
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          {discard && (
            <div role="group" aria-label="Confirm device copy removal">
              <p>
                This removes only local recovery bytes. It does not clear the
                selected answer or remove a server submission. Keep a copy until
                transport is confirmed.
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  void state.discard(discard);
                  setDiscard("");
                }}
              >
                Confirm device copy removal
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  setDiscard("")}
              >
                Keep device copy
              </button>
            </div>
          )}
          <button
            type="button"
            className="quiet"
            disabled={disabled || capturing}
            onClick={() => void state.refresh()}
          >
            Refresh academic scan status
          </button>
        </>
      )}
    </div>
  );
}
