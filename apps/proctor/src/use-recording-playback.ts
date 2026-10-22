import { useEffect, useRef, useState } from "react";
import {
  emptyChain,
  verifyRecordingPage,
} from "../../../packages/proctor-web/src/recording-pages";
import {
  recordingBytes,
  recordingPage,
  type RecordingRow,
} from "./recording-client";
import { buffered, waitEvent, waitTime } from "./recording-native";
import type { Params } from "../../../packages/service-i18n/src/format.ts";
import { AppError, type ProctorKey } from "./i18n/index.ts";
/** A status line kept as a catalog key so it follows the reader's language. */
export type PlaybackStatus = { key: ProctorKey; params?: Params } | null;
export function useRecordingPlayback(
  row: RecordingRow,
  tenant: string,
  actor: string,
) {
  const video = useRef<HTMLVideoElement>(null),
    [playback, setPlayback] = useState<
      { target: number; epoch: number } | null
    >(null),
    [problem, setProblem] = useState<unknown>(null),
    [status, setStatus] = useState<PlaybackStatus>(null);
  useEffect(() => {
    if (!playback || !video.current) return;
    const element = video.current, controller = new AbortController();
    let active = true,
      objectUrl = "",
      buffer: SourceBuffer | undefined,
      media: MediaSource | undefined,
      permissionTimer: ReturnType<typeof setInterval> | undefined,
      checking = false,
      seekReady = false;
    setProblem(null);
    setStatus({ key: "player.verifying" });
    function clear() {
      controller.abort();
      if (permissionTimer) clearInterval(permissionTimer);
      try {
        if (buffer?.updating) buffer.abort();
      } catch {}
      element.pause();
      element.removeAttribute("src");
      element.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
    function fail(cause: unknown) {
      if (!active) return;
      active = false;
      clear();
      setProblem(cause instanceof Error ? cause : new AppError("player.failed"));
      setStatus({ key: "player.stopped" });
    }
    const seek = () => {
      if (seekReady && !buffered(element, element.currentTime)) {
        setPlayback((current) =>
          current
            ? { target: element.currentTime, epoch: current.epoch + 1 }
            : null
        );
      }
    };
    const decoderError = () =>
      fail(new AppError("player.decodeFailed"));
    element.addEventListener("seeking", seek);
    element.addEventListener("error", decoderError);
    void (async () => {
      const initial = await recordingPage(row.id, 0, tenant, actor),
        pinned = initial.recording;
      if (!active || controller.signal.aborted) return;
      if (pinned.state !== "sealed") {
        throw new AppError("player.stillOpen");
      }
      if (
        !("MediaSource" in window) || !MediaSource.isTypeSupported(pinned.mime)
      ) {
        throw new AppError("player.unsupported");
      }
      permissionTimer = setInterval(() => {
        if (checking || !active) return;
        checking = true;
        void recordingPage(row.id, pinned.last_sequence, tenant, actor).then(
          (page) => {
            if (
              page.recording.id !== row.id ||
              page.recording.head_hash !== pinned.head_hash ||
              page.recording.state !== "sealed"
            ) {
              throw new AppError("player.manifestChanged");
            }
          },
        ).catch(fail).finally(() => checking = false);
      }, 5000);
      media = new MediaSource();
      objectUrl = URL.createObjectURL(media);
      const opened = waitEvent(media, "sourceopen", controller.signal);
      element.src = objectUrl;
      await opened;
      if (!active) return;
      buffer = media.addSourceBuffer(pinned.mime);
      media.duration = Math.max(.001, pinned.last_end_ms / 1000);
      let position = emptyChain(), page = initial, readSegments = 0;
      for (;;) {
        if (
          page.recording.head_hash !== pinned.head_hash ||
          page.recording.last_sequence !== pinned.last_sequence
        ) throw new AppError("player.manifestChangedDuring");
        position = await verifyRecordingPage(page, row.id, position);
        for (const segment of page.segments) {
          if (segment.kind === "gap") continue;
          if (segment.state !== "committed") {
            throw new AppError("player.unconfirmed");
          }
          while (
            active && buffer.buffered.length &&
            buffer.buffered.end(buffer.buffered.length - 1) >
              Math.max(element.currentTime, playback.target) + 20
          ) await waitTime(controller.signal);
          if (!active) return;
          const bytes = await recordingBytes(
            row.id,
            segment,
            tenant,
            actor,
            controller.signal,
          );
          if (!active) return;
          const updated = waitEvent(buffer, "updateend", controller.signal);
          void updated.catch(() => {});
          buffer.appendBuffer(new Uint8Array(bytes).buffer);
          await updated;
          readSegments++;
          if (!seekReady && buffered(element, playback.target)) {
            element.currentTime = playback.target;
            seekReady = true;
          }
          const trim = Math.max(
            0,
            Math.max(element.currentTime, playback.target) - 30,
          );
          if (buffer.buffered.length && buffer.buffered.start(0) < trim) {
            const removed = waitEvent(buffer, "updateend", controller.signal);
            void removed.catch(() => {});
            buffer.remove(0, trim);
            await removed;
          }
          if (active) {
            setStatus({ key: "player.buffered", params: { count: readSegments } });
          }
        }
        if (page.next_cursor === null) break;
        page = await recordingPage(row.id, page.next_cursor, tenant, actor);
      }
      if (!readSegments) {
        throw new AppError("player.noMedia");
      }
      if (media.readyState === "open") media.endOfStream();
    })().catch(fail);
    return () => {
      active = false;
      element.removeEventListener("seeking", seek);
      element.removeEventListener("error", decoderError);
      clear();
    };
  }, [playback, row.id, tenant, actor]);
  return {
    video,
    playback,
    setPlayback,
    problem,
    status,
    setProblem,
    setStatus,
  };
}
