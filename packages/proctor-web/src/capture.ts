import {
  RECORDING_MIMES,
  RECORDING_SEGMENT_BYTES,
} from "../../assessment-core/src/recordings.ts";
import type { CaptureSegment } from "./recording-types.ts";
export type { CaptureSegment } from "./recording-types.ts";
export interface CaptureSink {
  append(segment: CaptureSegment): Promise<void>;
}
export interface CaptureStatus {
  state: "recording" | "stopping" | "stopped" | "failed";
  reason: string | null;
}
/** Caller must first obtain explicit policy consent and acquire a stream in a user gesture.
 * Chunks are one ordered MediaRecorder container, not independently playable video files. */
export class CaptureRecorder {
  private recorder: MediaRecorder;
  private writes: Promise<void> = Promise.resolve();
  private sequence = 0;
  private lastEnd = 0;
  private started: number | null = null;
  private failed: string | null = null;
  private stopReason: string | null = null;
  private finished: Promise<void>;
  private finish!: () => void;
  private removers: (() => void)[] = [];
  constructor(
    private recording: string,
    private stream: MediaStream,
    private sink: CaptureSink,
    private status: (s: CaptureStatus) => void,
    private clock = () => performance.now(),
  ) {
    const video = stream.getVideoTracks().length > 0;
    const audio = stream.getAudioTracks().length > 0;
    const mime = typeof MediaRecorder === "undefined"
      ? undefined
      : [...RECORDING_MIMES].sort((a, b) =>
        Number(!a.includes("codecs=")) - Number(!b.includes("codecs="))
      ).find((m) =>
        (video ? m.startsWith("video/") : m.startsWith("audio/")) &&
        (!video || !m.includes("codecs=") || m.includes("opus") === audio) &&
        MediaRecorder.isTypeSupported(m)
      );
    if (
      !mime || !stream.getTracks().length ||
      stream.getTracks().some((t) => t.readyState !== "live")
    ) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("This device has no supported live recording stream.");
    }
    try {
      this.recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 600000,
        audioBitsPerSecond: 64000,
      });
    } catch (cause) {
      for (const track of stream.getTracks()) track.stop();
      throw cause;
    }
    this.finished = new Promise((resolve) => this.finish = resolve);
    this.recorder.addEventListener(
      "dataavailable",
      (event) => this.enqueue(event.data),
    );
    this.recorder.addEventListener(
      "error",
      () => this.fail("The browser recording encoder failed."),
    );
    this.recorder.addEventListener("stop", () => {
      void this.writes.finally(() => {
        this.cleanup();
        this.status({
          state: this.failed ? "failed" : "stopped",
          reason: this.failed ?? this.stopReason,
        });
        this.finish();
      });
    });
    for (const track of stream.getTracks()) {
      const ended = () => void this.stop("track_lost");
      track.addEventListener("ended", ended);
      this.removers.push(() => track.removeEventListener("ended", ended));
    }
  }
  get mime() {
    return this.recorder.mimeType;
  }
  start() {
    if (
      this.recorder.state !== "inactive" || this.started !== null ||
      this.stopReason !== null
    ) throw new Error("This recorder cannot be restarted.");
    this.started = this.clock();
    try {
      this.recorder.start(5000);
      this.status({ state: "recording", reason: null });
    } catch (cause) {
      this.failed = "The browser could not start recording.";
      this.cleanup();
      this.finish();
      this.status({ state: "failed", reason: this.failed });
      throw cause;
    }
  }
  private enqueue(blob: Blob) {
    if (!blob.size || this.failed) return;
    const end = Math.max(
        this.lastEnd + 1,
        Math.round(this.clock() - (this.started ?? this.clock())),
      ),
      start = this.lastEnd,
      sequence = ++this.sequence;
    this.lastEnd = end;
    if (blob.size > RECORDING_SEGMENT_BYTES || end - start > 60000) {
      this.fail(
        "The browser produced an oversized or delayed recording segment. Capture stopped; this interval must be recorded as a gap.",
      );
      return;
    }
    // Serialize persistence, not network. Never discard a chunk after an upload failure.
    const work = this.writes.then(async () => {
      if (this.failed) throw new Error(this.failed);
      await this.sink.append({
        recording_id: this.recording,
        sequence,
        start_ms: start,
        end_ms: end,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    });
    this.writes = work.catch((cause) =>
      this.fail(
        `Recording could not be saved on this device: ${
          cause instanceof Error ? cause.message : "storage unavailable"
        }`,
      )
    );
  }
  private fail(reason: string) {
    if (this.failed) return;
    this.failed = reason;
    this.status({ state: "failed", reason });
    void this.stop("capture_error");
  }
  async stop(
    reason: "runtime_end" | "track_lost" | "user_stop" | "capture_error" =
      "runtime_end",
  ) {
    this.stopReason ??= reason;
    if (this.recorder.state !== "inactive") {
      this.status({
        state: this.failed ? "failed" : "stopping",
        reason: this.failed ?? reason,
      });
      this.recorder.stop();
    } else if (this.started === null) {
      this.cleanup();
      this.finish();
    }
    // Stop physical capture immediately; wait only for the final emitted chunk to persist.
    for (const track of this.stream.getTracks()) track.stop();
    await this.finished;
  }
  private cleanup() {
    for (const remove of this.removers) remove();
    this.removers = [];
    for (const track of this.stream.getTracks()) track.stop();
  }
}
export async function acquireCapture(
  source: "camera" | "screen" | "microphone",
  microphone: boolean = false,
): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices) {
    throw new Error("Recording requires a secure supported browser.");
  }
  if (source === "screen") {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" },
      audio: false,
    });
    if (
      stream.getVideoTracks()[0]?.getSettings().displaySurface !== "monitor"
    ) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("Share your entire screen, not a window or browser tab.");
    }
    return stream;
  }
  return navigator.mediaDevices.getUserMedia({
    video: source === "camera"
      ? {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 360, max: 720 },
        frameRate: { ideal: 15, max: 24 },
      }
      : false,
    audio: source === "microphone" || microphone,
  });
}
