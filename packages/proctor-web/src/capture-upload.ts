import {
  RECORDING_PART_BYTES,
  recordingCommand,
} from "../../assessment-core/src/recordings.ts";
import type { CaptureSegment } from "./recording-types.ts";
export interface CaptureTransport {
  command(
    action: string,
    data: Record<string, unknown>,
    key: string,
  ): Promise<{ sequence: number; head_hash: string; state: string }>;
  part(
    recording: string,
    sequence: number,
    index: number,
    bytes: Uint8Array,
  ): Promise<unknown>;
  complete(
    recording: string,
    sequence: number,
  ): Promise<{ sequence: number; head_hash: string; state: string }>;
}
export const captureDigest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  ).map((b) => b.toString(16).padStart(2, "0")).join("");
/** Caller serializes one stream and restores its prior head before draining. The reserve key and
 * normalized manifest are deterministic, so a lost receipt replays the same command. */
export async function uploadCapture(
  segment: CaptureSegment,
  previous_hash: string,
  transport: CaptureTransport,
) {
  const parts: Uint8Array[] = [];
  for (
    let start = 0;
    start < segment.bytes.length;
    start += RECORDING_PART_BYTES
  ) parts.push(segment.bytes.slice(start, start + RECORDING_PART_BYTES));
  const manifest = recordingCommand("recording.reserve", {
    recording_id: segment.recording_id,
    sequence: segment.sequence,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    previous_hash,
    byte_length: segment.bytes.length,
    sha256: await captureDigest(segment.bytes),
    parts: await Promise.all(
      parts.map(async (bytes) => ({
        byte_length: bytes.length,
        sha256: await captureDigest(bytes),
      })),
    ),
  });
  const reserved = await transport.command(
    "recording.reserve",
    manifest,
    `recording:${segment.recording_id}:${segment.sequence}`,
  );
  if (
    reserved.sequence !== segment.sequence || reserved.state !== "reserved" ||
    !/^[a-f0-9]{64}$/.test(reserved.head_hash)
  ) {
    throw new Error(
      "Recording reservation receipt differs. Keep the saved footage for recovery.",
    );
  }
  for (let index = 0; index < parts.length; index++) {
    await transport.part(
      segment.recording_id,
      segment.sequence,
      index,
      parts[index],
    );
  }
  const receipt = await transport.complete(
    segment.recording_id,
    segment.sequence,
  );
  if (
    receipt.sequence !== segment.sequence || receipt.state !== "committed" ||
    receipt.head_hash !== reserved.head_hash
  ) {
    throw new Error(
      "Recording completion is not confirmed. Keep the saved footage for recovery.",
    );
  }
  return receipt;
}
