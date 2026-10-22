import type { ArtifactMime } from "../../assessment-core/src/artifacts.ts";
import { ARTIFACT_CHUNK_BYTES } from "../../assessment-core/src/artifacts.ts";
import type { MediaAnswerPolicy } from "../../assessment-core/src/media-answer.ts";
import { AnswerFileStore, type LocalAnswerFile } from "./answer-file-store";
import {LocalizedError,english} from './i18n/translate.ts';
export interface AcademicRecordingStatus {
  phase: "recording" | "stopping" | "interrupted" | "sealed";
  saved_bytes: number;
  problem: string | null;
}
/** Owns an academic-only stream and local encrypted byte spool. It never asks
 * for device permission, starts an attempt or selects/uploads an exam answer. */
export class AcademicRecorder {
  private chain: Promise<void> = Promise.resolve();
  private stopped!: () => void;
  private finished = new Promise<void>((resolve) => {
    this.stopped = resolve;
  });
  private requestedStop = false;
  private problem: string | null = null;
  private pendingBytes = 0;
  private sealing: Promise<LocalAnswerFile> | null = null;
  private listeners: (() => void)[] = [];
  private constructor(
    private store: AnswerFileStore,
    private file: LocalAnswerFile,
    private stream: MediaStream,
    private recorder: MediaRecorder,
    private changed: (status: AcademicRecordingStatus) => void,
  ) {
    for (const track of stream.getTracks()) {
      const ended = () =>
        this.interrupt(
          "A recording source ended. The encrypted saved prefix remains available for review; it is not a completed answer.",
        );
      track.addEventListener("ended", ended);
      this.listeners.push(() => track.removeEventListener("ended", ended));
    }
    recorder.ondataavailable = (event) => {
      if (!event.data.size || this.problem) return;
      this.pendingBytes += event.data.size;
      if (this.pendingBytes > 16 * 1048576) {
        this.interrupt(english("recorder.storageBehind"));
        return;
      }
      this.chain = this.chain.then(async () => {
        if (this.problem) return;
        for (
          let offset = 0;
          offset < event.data.size;
          offset += ARTIFACT_CHUNK_BYTES
        ) {
          const bytes = new Uint8Array(
            await event.data.slice(offset, offset + ARTIFACT_CHUNK_BYTES)
              .arrayBuffer(),
          );
          this.file = await store.append(
            this.file.id,
            this.file.byte_length,
            bytes,
          );
          this.report(this.requestedStop ? "stopping" : "recording");
        }
      }).catch((cause) =>
        this.interrupt(
          cause instanceof Error
            ? cause.message
            : english("recorder.bytesUnsaved"),
        )
      ).finally(() => {
        this.pendingBytes -= event.data.size;
      });
    };
    recorder.onerror = () =>
      this.interrupt(english("recorder.encoderFailed"));
    recorder.onstop = () => {
      if (!this.requestedStop && !this.problem) {
        this.problem = english("recorder.stoppedUnexpectedly");
      }
      this.stopTracks();
      this.stopped();
      if (this.problem) this.report("interrupted");
    };
  }
  static async start(
    store: AnswerFileStore,
    item: string,
    filename: string,
    mime: ArtifactMime,
    policy: MediaAnswerPolicy,
    stream: MediaStream,
    changed: (status: AcademicRecordingStatus) => void = () => {},
  ) {
    try {
      const tracks = stream.getTracks(),
        audio = stream.getAudioTracks(),
        video = stream.getVideoTracks();
      if (
        !tracks.length || tracks.some((track) =>
          track.readyState !== "live" || !track.enabled
        ) || (mime.startsWith("audio/") && (!audio.length || video.length)) ||
        (mime.startsWith("video/") && !video.length) ||
        !/^(audio|video)\//.test(mime)
      ) {
        throw new LocalizedError("recorder.provideLiveAcademicRecording");
      }
      if (
        typeof MediaRecorder === "undefined" ||
        !MediaRecorder.isTypeSupported(mime)
      ) {
        throw new LocalizedError("recorder.browserRecordPermittedAnswer");
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime }),
        file = await store.begin(item, filename, mime, "capture", policy);
      if (
        !stream.active || tracks.some((track) => track.readyState !== "live")
      ) {
        throw new LocalizedError("recorder.recordingSourceEndedLocal");
      }
      const result = new AcademicRecorder(
        store,
        file,
        stream,
        recorder,
        changed,
      );
      try {
        // A supported codec is only a hint. Do not announce recording or let
        // callers measure a take before the native encoder has actually started.
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            recorder.removeEventListener("start", started);
            recorder.removeEventListener("error", failed);
            recorder.removeEventListener("stop", failed);
          };
          const started = () => {
            cleanup();
            resolve();
          };
          const failed = () => {
            cleanup();
            reject(
              new LocalizedError("recorder.browserEncoderStartSaved"),
            );
          };
          const timer = setTimeout(() => {
            result.interrupt(english("recorder.startTimeout"));
            failed();
          }, 10000);
          recorder.addEventListener("start", started, { once: true });
          recorder.addEventListener("error", failed, { once: true });
          recorder.addEventListener("stop", failed, { once: true });
          try {
            recorder.start(1000);
          } catch (cause) {
            cleanup();
            reject(cause);
          }
        });
        result.report("recording");
        return result;
      } catch (cause) {
        result.stopTracks();
        throw cause;
      }
    } catch (cause) {
      for (const track of stream.getTracks()) track.stop();
      throw cause;
    }
  }
  get id() {
    return this.file.id;
  }
  private report(phase: AcademicRecordingStatus["phase"]) {
    this.changed({
      phase,
      saved_bytes: this.file.byte_length,
      problem: this.problem,
    });
  }
  private stopTracks() {
    for (const remove of this.listeners.splice(0)) remove();
    for (const track of this.stream.getTracks()) track.stop();
  }
  /** Synchronous track shutdown, including account/lease/page teardown. A
   * previously durable prefix is not silently sealed or automatically submitted. */
  interrupt(reason: string) {
    if (this.file.phase === "sealed") {
      this.stopTracks();
      return;
    }
    this.problem ??= reason;
    this.requestedStop = true;
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
    } finally {
      this.stopTracks();
      this.report("interrupted");
    }
  }
  stop(): Promise<LocalAnswerFile> {
    if (this.sealing) return this.sealing;
    this.requestedStop = true;
    if (this.recorder.state !== "inactive") this.recorder.stop();
    this.stopTracks();
    this.sealing = (async () => {
      await this.finished;
      await this.chain;
      if (this.problem) throw new Error(this.problem);
      const state = await this.store.seal(this.file.id);
      this.file = state;
      this.report("sealed");
      return state;
    })();
    return this.sealing;
  }
}
