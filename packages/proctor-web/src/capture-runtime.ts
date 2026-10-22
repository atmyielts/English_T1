import {
  captureDigest,
  type CaptureTransport,
  uploadCapture,
} from "./capture-upload.ts";
import type {
  CaptureSegment,
  CaptureUploadState,
  RecordingCheckpoint,
} from "./recording-types.ts";
export interface CaptureRecoveryStore {
  readState(recording: string): Promise<CaptureUploadState>;
  pending(recording: string): Promise<CaptureSegment[]>;
  opened(recording: string): Promise<void>;
  commit(
    recording: string,
    sequence: number,
    previous: string,
    head: string,
    end: number,
  ): Promise<void>;
  closing(recording: string, reason: string): Promise<void>;
  sealed(recording: string): Promise<void>;
  run<T>(recording: string, work: () => Promise<T>): Promise<T>;
}
export interface CaptureBackend extends CaptureTransport {
  checkpoint(recording: string, sequence: number): Promise<RecordingCheckpoint>;
}
/** One durable stream/container. Recovery compares saved bytes to the canonical segment before
 * acknowledging it, and atomically persists the new head with local-byte removal. */
export class CaptureUploads {
  constructor(
    private store: CaptureRecoveryStore,
    private backend: CaptureBackend,
  ) {}
  flush(recording: string) {
    return this.store.run(recording, () => this.drain(recording));
  }
  close(
    recording: string,
    reason: "runtime_end" | "track_lost" | "user_stop" | "capture_error",
  ) {
    return this.store.run(recording, async () => {
      await this.store.closing(recording, reason);
      return this.drain(recording);
    });
  }
  private matches(state: CaptureUploadState, checkpoint: RecordingCheckpoint) {
    const r = checkpoint.recording, m = state.meta;
    if (
      r.id !== m.recording_id || r.session_id !== m.session_id ||
      r.source !== m.source || r.mime !== m.mime ||
      !["open", "sealed"].includes(r.state) ||
      !Number.isSafeInteger(r.last_sequence) ||
      !Number.isSafeInteger(r.last_end_ms) ||
      !/^[a-f0-9]{64}$/.test(r.head_hash) ||
      (checkpoint.segment &&
        !/^[a-f0-9]{64}$/.test(checkpoint.segment.chain_hash))
    ) {
      throw new Error(
        "Recording recovery scope changed. Keep the saved footage and contact your institution.",
      );
    }
  }
  private async drain(recording: string) {
    let state = await this.store.readState(recording);
    if (state.phase === "sealed") return state;
    if (state.phase === "prepared") {
      const begun = await this.backend.command(
        "recording.begin",
        state.meta as unknown as Record<string, unknown>,
        `recording:${recording}:begin`,
      );
      if (
        begun.sequence !== 0 || begun.head_hash !== "0".repeat(64) ||
        begun.state !== "open"
      ) {
        throw new Error(
          "Recording start was not confirmed. Keep the saved footage.",
        );
      }
      await this.store.opened(recording);
      state = await this.store.readState(recording);
    }
    for (const segment of await this.store.pending(recording)) {
      if (
        segment.sequence !== state.ack_sequence + 1 ||
        segment.start_ms !== state.last_end_ms
      ) {
        throw new Error(
          "Saved recording sequence is incomplete. Do not discard the remaining footage.",
        );
      }
      const checkpoint = await this.backend.checkpoint(
        recording,
        segment.sequence,
      );
      this.matches(state, checkpoint);
      const canonical = checkpoint.segment;
      if (canonical) {
        if (
          canonical.kind !== "media" ||
          canonical.sequence !== segment.sequence ||
          canonical.previous_hash !== state.head_hash ||
          canonical.start_ms !== segment.start_ms ||
          canonical.end_ms !== segment.end_ms ||
          canonical.byte_length !== segment.bytes.length ||
          canonical.sha256 !== await captureDigest(segment.bytes)
        ) {
          throw new Error(
            "Saved footage differs from the canonical recording reservation.",
          );
        }
        if (canonical.state === "committed") {
          await this.store.commit(
            recording,
            segment.sequence,
            state.head_hash,
            canonical.chain_hash,
            segment.end_ms,
          );
          state = await this.store.readState(recording);
          continue;
        }
      } else if (
        checkpoint.recording.last_sequence !== state.ack_sequence ||
        checkpoint.recording.head_hash !== state.head_hash
      ) {
        throw new Error(
          "The canonical recording head advanced without matching saved bytes. Contact your institution.",
        );
      }
      if (checkpoint.recording.state !== "open") {
        throw new Error(
          "The recording was sealed before these saved bytes were confirmed.",
        );
      }
      const committed = await uploadCapture(
        segment,
        state.head_hash,
        this.backend,
      );
      await this.store.commit(
        recording,
        segment.sequence,
        state.head_hash,
        committed.head_hash,
        segment.end_ms,
      );
      state = await this.store.readState(recording);
    }
    const checkpoint = await this.backend.checkpoint(recording, 0);
    this.matches(state, checkpoint);
    if (
      checkpoint.recording.last_sequence !== state.ack_sequence ||
      checkpoint.recording.head_hash !== state.head_hash ||
      checkpoint.recording.last_end_ms !== state.last_end_ms
    ) {
      throw new Error(
        "The server has an unresolved recording head. Preserve this device and contact your institution.",
      );
    }
    if (checkpoint.recording.state === "sealed") {
      if (
        !state.close_reason ||
        checkpoint.recording.close_reason !== state.close_reason
      ) {
        throw new Error(
          "The recording was closed by another workflow. Reconciliation is required.",
        );
      }
      await this.store.sealed(recording);
      return this.store.readState(recording);
    }
    if (state.close_reason) {
      const receipt = await this.backend.command("recording.close", {
        recording_id: recording,
        expected_sequence: state.ack_sequence,
        expected_hash: state.head_hash,
        reason: state.close_reason,
      }, `recording:${recording}:close`);
      if (
        receipt.state !== "sealed" || receipt.sequence !== state.ack_sequence ||
        receipt.head_hash !== state.head_hash
      ) {
        throw new Error(
          "Recording closure was not confirmed. Retry the saved closure.",
        );
      }
      await this.store.sealed(recording);
    }
    return this.store.readState(recording);
  }
}
