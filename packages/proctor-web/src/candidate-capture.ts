import type { CaptureLaunch } from "../../assessment-core/src/capture-launch.ts";
import type {
  CaptureMeta,
  CaptureSegment,
  CaptureUploadState,
} from "./recording-types.ts";
export interface CaptureRunStatus {
  state: "recording" | "stopping" | "stopped" | "failed";
  reason: string | null;
}
export interface CaptureStream {
  getTracks(): { stop(): void; readyState: "live" | "ended" }[];
}
export type CaptureSource = "camera" | "microphone" | "screen";
type StopReason = "runtime_end" | "track_lost" | "user_stop" | "capture_error";
export interface CandidateCaptureStore {
  initialize(meta: CaptureMeta): Promise<unknown>;
  append(segment: CaptureSegment): Promise<void>;
  states(): Promise<CaptureUploadState[]>;
}
export interface CandidateRecorder {
  mime: string;
  start(): void;
  stop(reason: StopReason): Promise<void>;
}
export interface CandidateCapturePorts {
  live?: {
    view(source: CaptureSource): { state: string; problem: string | null };
    start(source: CaptureSource, stream: CaptureStream): Promise<void>;
    close(): Promise<void>;
    reconnect(source: CaptureSource): Promise<void>;
  };
  store: CandidateCaptureStore;
  uploads: {
    flush(id: string): Promise<unknown>;
    close(id: string, reason: StopReason): Promise<unknown>;
  };
  acquire(source: CaptureSource): Promise<CaptureStream>;
  recorder(
    id: string,
    stream: CaptureStream,
    sink: { append(segment: CaptureSegment): Promise<void> },
    status: (value: CaptureRunStatus) => void,
  ): CandidateRecorder;
  heartbeat(): Promise<CaptureLaunch>;
}
export interface CandidateCaptureView {
  live?: { source: CaptureSource; state: string; problem: string | null }[];
  closed: boolean;
  ready: boolean;
  problem: string | null;
  launch: CaptureLaunch;
  sources: {
    source: CaptureSource;
    state: "off" | "permission" | CaptureRunStatus["state"];
    saved: boolean;
  }[];
}
interface SourceRun {
  id: string;
  stream: CaptureStream;
  recorder: CandidateRecorder;
  state: CaptureRunStatus["state"];
  reason: StopReason | null;
  initializing: Promise<void>;
}
/** No device permission is requested during construction/recovery/ticks.
 * start() calls acquire synchronously, preserving the button's user gesture. */
export class CandidateCapture {
  private runs = new Map<CaptureSource, SourceRun>();
  private requesting = new Set<CaptureSource>();
  private closed = false;
  private problem: string | null = null;
  private flight: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private checkedAt = -Infinity;
  private validUntil = -Infinity;
  private required: CaptureSource[];
  constructor(
    private launch: CaptureLaunch,
    private ports: CandidateCapturePorts,
    private changed: (value: CandidateCaptureView) => void,
    private clock = () => performance.now(),
  ) {
    this.required = launch.sources.map((row) => row.source);
    if (
      !this.required.length ||
      new Set(this.required).size !== this.required.length ||
      this.required.some((source) =>
        !["camera", "microphone", "screen"].includes(source)
      )
    ) throw new Error("The required capture sources are invalid.");
    this.publish();
  }
  view(): CandidateCaptureView {
    return {
      ...(this.ports.live
        ? {
          live: this.required.map((source) => {
            const value = this.ports.live!.view(source);
            return { source, state: value.state, problem: value.problem };
          }),
        }
        : {}),
      closed: this.closed,
      ready: !this.closed && !this.problem &&
        this.clock() - this.checkedAt < 10000 &&
        this.clock() < this.validUntil && this.launch.ready &&
        this.launch.sources.every((row) => row.ready === true) &&
        ["preparing", "active", "paused"].includes(this.launch.state) &&
        (!this.ports.live ||
          this.required.every((source) =>
            this.ports.live!.view(source).state === "live"
          )) &&
        this.required.every((source) =>
          this.runs.get(source)?.state === "recording" &&
          this.runs.get(source)!.stream.getTracks().length > 0 &&
          this.runs.get(source)!.stream.getTracks().every((track) =>
            track.readyState === "live"
          )
        ),
      problem: this.problem,
      launch: this.launch,
      sources: this.required.map((source) => ({
        source,
        state: this.requesting.has(source)
          ? "permission"
          : this.runs.get(source)?.state ?? "off",
        saved:
          this.launch.sources.find((row) => row.source === source)?.ready ===
            true,
      })),
    };
  }
  private publish() {
    this.changed(this.view());
  }
  liveChanged() {
    if (!this.closed) this.publish();
  }
  async reconnectLive(source: CaptureSource) {
    if (
      this.closed || !this.ports.live ||
      this.runs.get(source)?.state !== "recording"
    ) {
      throw new Error(
        "Restore required recording before reconnecting live media.",
      );
    }
    await this.ports.live.reconnect(source);
    this.publish();
  }
  async recover() {
    if (this.closed) throw new Error("This capture session is closed.");
    const states = await this.ports.store.states();
    for (const state of states) {
      if (this.closed) return;
      if (
        state.meta.session_id !== this.launch.session_id ||
        !this.required.includes(state.meta.source)
      ) {
        throw new Error(
          "Saved capture belongs to a different session/policy. Preserve it and contact your institution.",
        );
      }
      const run = this.runs.get(state.meta.source);
      if (state.phase === "sealed") {
        // A background checkpoint can confirm a lost close receipt before this
        // explicit recovery. Retire its local run too, or restart stays blocked.
        if (run?.id === state.meta.recording_id) {
          await run.recorder.stop(run.reason ?? "capture_error");
          this.runs.delete(state.meta.source);
        }
        continue;
      }
      if (run?.state === "recording") continue;
      if (run) {
        await run.initializing.catch(() => {});
        await run.recorder.stop("capture_error");
      }
      await this.ports.uploads.close(
        state.meta.recording_id,
        (state.close_reason as StopReason | null) ?? run?.reason ??
          "capture_error",
      );
      if (run?.id === state.meta.recording_id) {
        this.runs.delete(state.meta.source);
      }
    }
    for (const [source, run] of this.runs) {
      if (
        run.state !== "recording" &&
        !states.some((state) => state.meta.recording_id === run.id)
      ) {
        await run.initializing.catch(() => {});
        await run.recorder.stop(run.reason ?? "capture_error");
        this.runs.delete(source);
      }
    }
    this.problem = null;
    this.publish();
  }
  async start(source: CaptureSource) {
    if (this.closed || !this.required.includes(source)) {
      throw new Error("This capture source is not available.");
    }
    if (this.requesting.has(source) || this.runs.has(source)) {
      throw new Error(
        "Recover the previous recording before starting this source again.",
      );
    }
    this.requesting.add(source);
    this.problem = null;
    this.publish();
    let stream: CaptureStream | null = null, run: SourceRun | null = null;
    try {
      // Must precede any asynchronous storage/network work for screen permission.
      const permission = this.ports.acquire(source);
      stream = await permission;
      if (this.closed) {
        throw new Error(
          "Capture preparation was closed while waiting for permission.",
        );
      }
      if (
        !stream.getTracks().length ||
        stream.getTracks().some((track) => track.readyState !== "live")
      ) throw new Error("The required capture stream is not live.");
      const id = crypto.randomUUID();
      const recorder = this.ports.recorder(id, stream, {
        append: async (segment) => {
          await this.ports.store.append(segment);
          if (!this.closed) void this.tick().catch(() => {});
        },
      }, (status) => {
        const current = this.runs.get(source);
        if (!current || current.id !== id) return;
        current.state = status.state;
        if (
          ["track_lost", "user_stop", "runtime_end", "capture_error"].includes(
            status.reason ?? "",
          )
        ) current.reason ??= status.reason as StopReason;
        else if (status.state === "failed") current.reason ??= "capture_error";
        if (
          !this.closed &&
          (status.state === "failed" || status.state === "stopped")
        ) {
          this.problem = status.reason ??
            "Required capture stopped. Recover it before continuing.";
        }
        this.publish();
      });
      run = {
        id,
        stream,
        recorder,
        state: "stopped",
        reason: null,
        initializing: Promise.resolve(),
      };
      this.runs.set(source, run);
      run.initializing = (async () => {
        await this.ports.store.initialize({
          recording_id: id,
          session_id: this.launch.session_id,
          source,
          mime: recorder.mime,
        });
        if (!this.closed) await this.ports.uploads.flush(id);
      })();
      await run.initializing;
      if (this.closed) throw new Error("Capture preparation is closed.");
      recorder.start();
      // Live transport does not own recorder/device lifetime. A network failure
      // remains a separate status; it must not enter the recording catch path.
      try{await this.ports.live?.start(source, stream);}catch{/* Live failure is separate from recorder/device failure. */}
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      if (run) {
        run.state = "failed";
        await run.recorder.stop("capture_error").catch(() => {});
      }
      if (!this.closed) {
        this.problem = cause instanceof Error
          ? cause.message
          : "The recording source could not start.";
      }
      throw cause;
    } finally {
      this.requesting.delete(source);
      this.publish();
    }
  }
  tick(): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("This capture session is closed."));
    }
    if (this.flight) return this.flight;
    const work = (async () => {
      try {
        await Promise.all([...this.runs.values()].map(async (run) => {
          await run.initializing;
          await this.ports.uploads.flush(run.id);
        }));
        if (this.closed) return;
        const current = await this.ports.heartbeat();
        if (this.closed) return;
        if (
          current.schema_version !== "proctor.capture.v1" ||
          current.session_id !== this.launch.session_id ||
          current.registration_id !== this.launch.registration_id ||
          current.policy_id !== this.launch.policy_id ||
          current.monitoring_mode !== this.launch.monitoring_mode ||
          JSON.stringify(current.sources.map((row) => row.source).sort()) !==
            JSON.stringify([...this.required].sort())
        ) {
          throw new Error(
            "The capture policy/session changed. Stop and contact your institution.",
          );
        }
        const remaining = Date.parse(current.expires_at) -
          Date.parse(current.server_time);
        if (!Number.isFinite(remaining)) {
          throw new Error("The capture lease time is invalid.");
        }
        this.launch = current;
        this.checkedAt = this.clock();
        this.validUntil = this.checkedAt + remaining;
        this.problem = null;
        if (current.state === "completed") {
          void this.close("runtime_end").catch(() => {});
        }
      } catch (cause) {
        if (!this.closed) {
          this.problem = cause instanceof Error
            ? cause.message
            : "Saved recording sync failed.";
        }
        throw cause;
      } finally {
        this.publish();
      }
    })();
    this.flight = work;
    void work.finally(() => {
      if (this.flight === work) this.flight = null;
    }).catch(() => {});
    return work;
  }
  /** Physical teardown is synchronous. Network failure retains the encrypted spool. */
  close(reason: StopReason = "runtime_end"): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    let liveClosing: Promise<void> | undefined;
    try {
      liveClosing = this.ports.live?.close();
    } catch {
      /* Physical recording teardown must still happen if a transport adapter fails. */
    }
    for (const run of this.runs.values()) {
      run.stream.getTracks().forEach((track) => track.stop());
    }
    this.publish();
    this.closing = (async () => {
      await liveClosing?.catch(() => {});
      const runs = [...this.runs.values()];
      await Promise.allSettled(runs.map(async (run) => {
        await run.initializing.catch(() => {});
        await run.recorder.stop(reason);
      }));
      await this.flight?.catch(() => {});
      const outcomes = await Promise.allSettled(
        (await this.ports.store.states()).filter((state) =>
          state.phase !== "sealed"
        ).map((state) => {
          if (
            state.meta.session_id !== this.launch.session_id ||
            !this.required.includes(state.meta.source)
          ) {
            throw new Error(
              "Saved capture scope changed. Preserve this device and contact your institution.",
            );
          }
          return this.ports.uploads.close(
            state.meta.recording_id,
            (state.close_reason as StopReason | null) ??
              this.runs.get(state.meta.source)?.reason ?? reason,
          );
        }),
      );
      const failed = outcomes.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    })();
    const work = this.closing;
    void work.catch(() => {
      if (this.closing === work) this.closing = null;
    });
    return this.closing;
  }
}
