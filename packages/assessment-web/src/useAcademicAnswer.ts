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
import {
  english,
  LocalizedError,
  messageText,
} from "./i18n/translate.ts";
import { useWebT } from "./i18n/useWebT.ts";
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
  const t = useWebT();
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
      throw new LocalizedError("mediaAnswer.scopeChanged");
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
          setError(messageText(cause, t, "mediaAnswer.statusFailed"));
        }
      }
    }).catch((cause) => {
      if (valid) setError(messageText(cause, t, "mediaAnswer.statusFailed"));
    });
    const hide = () => {
      generation.current++;
      current.current.onRecording?.(false);
      recorder.current?.interrupt(
        english("mediaAnswer.pageHidden"),
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
        english("mediaAnswer.stateChanged"),
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
        setError(messageText(cause, t, "mediaAnswer.actionFailed"));
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
          throw new LocalizedError("mediaAnswer.fileTooLarge");
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
          throw new LocalizedError("mediaAnswer.reselectFile");
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
          t("mediaAnswer.copyReady"),
        );
      }),
    start: () =>
      run(async () => {
        active(true);
        if (
          !policy || !policy.sources.includes("capture") || recorder.current
        ) {
          throw new LocalizedError("mediaAnswer.recordingUnavailable");
        }
        const mime = policy.mimes.find((value) =>
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(value)
        );
        if (!mime || !navigator.mediaDevices?.getUserMedia) {
          throw new LocalizedError("mediaAnswer.browserCannotRecord");
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
            throw new LocalizedError("mediaAnswer.preparationCancelled");
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
              english("mediaAnswer.prepNotOwned"),
            );
            throw new LocalizedError("mediaAnswer.questionChanged");
          }
          recorder.current = started;
        } finally {
          if (!recorder.current) current.current.onRecording?.(false);
        }
      }),
    stop: () =>
      run(async () => {
        const take = recorder.current;
        if (!take) throw new LocalizedError("mediaAnswer.noActiveTake");
        try {
          await take.stop();
          setNotice(
            t("mediaAnswer.sealed"),
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
            ? t("mediaAnswer.selectConfirmed")
            : t("mediaAnswer.selectPending"),
        );
      }),
    clear: () =>
      run(async () => {
        active(true);
        const confirmed = await current.current.select(null);
        active();
        setNotice(
          confirmed
            ? t("mediaAnswer.clearConfirmed")
            : t("mediaAnswer.clearPending"),
        );
      }),
    upload: (id: string) =>
      run(async () => {
        const state = await workspace.current!.store.read(id);
        if (!state.binding) active(true);
        await workspace.current!.transfers.upload(id, (done, total) => {
          if (live.current && boundScope.current === scope) {
            setNotice(
              t("mediaAnswer.transporting", {
                percent: Math.floor(done / total * 100),
              }),
            );
          }
        });
        active();
        setNotice(
          t("mediaAnswer.transportDone"),
        );
        await refresh();
      }),
    discard: (id: string) =>
      run(async () => {
        await workspace.current!.store.discard(id);
        setNotice(
          t("mediaAnswer.copyRemoved"),
        );
      }),
  };
}
