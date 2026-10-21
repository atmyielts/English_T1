import { useEffect, useRef, useState } from "react";
import type { FormItem } from "../../assessment-core/src/mod.ts";
import {
  ARTIFACT_CHUNK_BYTES,
  type ArtifactMime,
} from "../../assessment-core/src/artifacts.ts";
import {
  AcademicRecorder,
  type AcademicRecordingStatus,
} from "./academic-recorder";
import {
  type CandidateAnswerAsset,
  candidateAnswerAssets,
  openAnswerFiles,
} from "./answer-upload";
import type { LocalAnswerFile } from "./answer-types";
import type { AttemptRuntime } from "./runtime";
export function useAcademicAnswer(
  tenant: string,
  actor: string,
  attempt: string,
  entry: FormItem,
  enabled: boolean,
  runtime: () => AttemptRuntime | null,
  select: (binding: unknown) => Promise<boolean>,
  onRecording?: (active: boolean) => void,
) {
  const [files, setFiles] = useState<LocalAnswerFile[]>([]),
    [assets, setAssets] = useState<CandidateAnswerAsset[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [recording, setRecording] = useState<AcademicRecordingStatus | null>(null);
  const workspace = useRef<Awaited<ReturnType<typeof openAnswerFiles>> | null>(
      null,
    ),
    recorder = useRef<AcademicRecorder | null>(null),
    generation = useRef(0),
    live = useRef(false),
    current = useRef({ enabled, runtime, select, onRecording });
  current.current = { enabled, runtime, select, onRecording };
  const scope = `${tenant}:${actor}:${attempt}:${entry.item_version_id}`,
    boundScope = useRef(scope);
  boundScope.current = scope;
  const active = (answering = false) => {
    if (
      !live.current || boundScope.current !== scope || !workspace.current ||
      (answering && !current.current.enabled)
    ) {
      throw new Error(
        "This question or active exam device changed. Saved bytes remain in their original recovery workspace.",
      );
    }
  };
  async function refresh() {
    const opened = workspace.current;
    if (!opened) return;
    const local = await opened.store.files();
    active();
    setFiles(
      local.filter((file) => file.item_version_id === entry.item_version_id),
    );
    const canonical = await candidateAnswerAssets(
      tenant,
      actor,
      attempt,
      entry.item_version_id,
    );
    active();
    setAssets(canonical);
  }
  useEffect(() => {
    let valid = true;
    live.current = true;
    setReady(false);
    setFiles([]);
    setAssets([]);
    setError("");
    setNotice("");
    void openAnswerFiles(
      tenant,
      actor,
      attempt,
      () => current.current.runtime(),
    ).then(async (opened) => {
      if (!valid) {
        opened.close();
        return;
      }
      workspace.current = opened;
      setReady(true);
      try {
        await refresh();
      } catch (cause) {
        if (valid) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Recovery status could not be loaded.",
          );
        }
      }
    }).catch((cause) => {
      if (valid) setError(cause.message);
    });
    const hide = () => {
      generation.current++;
      current.current.onRecording?.(false);
      recorder.current?.interrupt(
        "The exam page closed or was hidden. Review the saved interrupted take; it was not automatically selected.",
      );
      recorder.current = null;
    };
    window.addEventListener("pagehide", hide);
    return () => {
      valid = false;
      live.current = false;
      hide();
      window.removeEventListener("pagehide", hide);
      workspace.current?.close();
      workspace.current = null;
    };
  }, [scope]);
  useEffect(() => {
    if (!enabled) {
      generation.current++;
      current.current.onRecording?.(false);
      recorder.current?.interrupt(
        "The question clock, lease or exam state changed. The saved prefix is not a completed answer.",
      );
      recorder.current = null;
    }
  }, [enabled]);
  const running = useRef(false);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      active();
      await work();
    } catch (cause) {
      if (live.current && boundScope.current === scope) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The academic answer action could not be completed.",
        );
      }
    } finally {
      running.current = false;
      if (live.current && boundScope.current === scope) {
        setBusy(false);
        try {
          const local = await workspace.current!.store.files();
          setFiles(
            local.filter((file) =>
              file.item_version_id === entry.item_version_id
            ),
          );
        } catch {}
      }
    }
  }
  const policy = entry.item.media_response;
  return {
    files,
    assets,
    error,
    notice,
    busy,
    ready,
    recording,
    refresh: () => run(refresh),
    stage: (file: File, mime: ArtifactMime, resume?: string) =>
      run(async () => {
        active(true);
        if (
          !policy || file.size < 1 || file.size > policy.max_bytes
        ) {
          throw new Error(
            "Choose a nonempty file within this question's reviewed size limit.",
          );
        }
        const store = workspace.current!.store;
        let state = resume ? await store.read(resume) : await store.begin(
          entry.item_version_id,
          file.name,
          mime,
          "upload",
          policy,
        );
        if (
          state.source !== "upload" || state.phase !== "open" ||
          state.item_version_id !== entry.item_version_id ||
          state.filename !== file.name || state.mime !== mime
        ) {
          throw new Error(
            "Reselect the saved file and format to recover this device copy, or start a separate answer.",
          );
        }
        for (
          let offset = 0;
          offset < file.size;
          offset += ARTIFACT_CHUNK_BYTES
        ) {
          active(true);
          state = await store.append(
            state.id,
            offset,
            new Uint8Array(
              await file.slice(offset, offset + ARTIFACT_CHUNK_BYTES)
                .arrayBuffer(),
            ),
          );
        }
        active(true);
        await store.seal(state.id);
        setNotice(
          "Device copy is encrypted and ready. Use this answer before the deadline; saving a file alone does not select it.",
        );
      }),
    start: () =>
      run(async () => {
        active(true);
        if (
          !policy || !policy.sources.includes("capture") || recorder.current
        ) {
          throw new Error(
            "Recording is not available for this question or a take is already active.",
          );
        }
        const mime = policy.mimes.find((value) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(value)
        );
        if (!mime || !navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "This browser cannot record a permitted format. Use an allowed upload or contact the institution before proceeding.",
          );
        }
        current.current.onRecording?.(true);
        try {
          const version = ++generation.current,
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              ...(entry.item.type === "video_response" ? { video: true } : {}),
            });
          if (
            !live.current || boundScope.current !== scope ||
            !current.current.enabled || generation.current !== version
          ) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error(
              "Recording preparation was cancelled because the active question changed.",
            );
          }
          const started = await AcademicRecorder.start(
            workspace.current!.store,
            entry.item_version_id,
            `exam-${
              entry.item.type === "video_response" ? "video" : "audio"
            }-answer.${
              mime === "audio/mp4"
                ? "m4a"
                : mime === "audio/mpeg"
                ? "mp3"
                : mime.split("/")[1]
            }`,
            mime,
            policy,
            stream,
            (status) => {
              if (live.current && boundScope.current === scope) {
                setRecording(status);
                const fileId = recorder.current?.id;
                if (fileId) {
                  setFiles((files) =>
                    files.map((file) =>
                      file.id === fileId
                        ? { ...file, byte_length: status.saved_bytes }
                        : file
                    )
                  );
                }
                if (["interrupted", "sealed"].includes(status.phase)) {
                  current.current.onRecording?.(false);
                  recorder
                    .current = null;
                }
              }
            },
          );
          if (
            !live.current || boundScope.current !== scope ||
            !current.current.enabled || generation.current !== version
          ) {
            started.interrupt(
              "Recording preparation no longer belongs to this active question.",
            );
            throw new Error(
              "The active question changed during recording preparation.",
            );
          }
          recorder.current = started;
        } finally {
          if (!recorder.current) current.current.onRecording?.(false);
        }
      }),
    stop: () =>
      run(async () => {
        const take = recorder.current;
        if (!take) throw new Error("No active take is recording.");
        try {
          await take.stop();
          setNotice(
            "Recording is sealed on this device. Use this answer before the deadline, then finish its upload.",
          );
        } finally {
          recorder.current = null;
        }
      }),
    select: (id: string) =>
      run(async () => {
        active(true);
        const state = await workspace.current!.transfers.admit(id);
        active(true);
        const confirmed = await current.current.select(state.binding!);
        active();
        setNotice(
          confirmed
            ? "The exam service confirmed this selected answer. Finish any remaining upload; scanning may complete later."
            : "Selection is saved on this device but is still awaiting confirmation. Sync saved responses before the deadline.",
        );
      }),
    clear: () =>
      run(async () => {
        active(true);
        const confirmed = await current.current.select(null);
        active();
        setNotice(
          confirmed
            ? "The exam service confirmed that no answer is selected. Saved files and prior answer history are unchanged."
            : "Clearing is saved on this device but still awaiting confirmation. Sync saved responses before the deadline.",
        );
      }),
    upload: (id: string) =>
      run(async () => {
        const state = await workspace.current!.store.read(id);
        if (!state.binding) active(true);
        await workspace.current!.transfers.upload(id, (done, total) => {
          if (live.current && boundScope.current === scope) {
            setNotice(
              `Transporting the pinned answer: ${
                Math.floor(done / total * 100)
              }%. Uploading does not select or change an answer.`,
            );
          }
        });
        active();
        setNotice(
          "Transport completed. Refresh scan status to check availability; marks require human review.",
        );
        await refresh();
      }),
    discard: (id: string) =>
      run(async () => {
        await workspace.current!.store.discard(id);
        setNotice(
          "Only this encrypted device copy was removed. Any server-side submission and academic answer are unchanged.",
        );
      }),
  };
}
