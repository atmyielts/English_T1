import { captureDigest } from "./capture-upload.ts";
import type { RecordingPage } from "./recording-types.ts";
export interface ChainPosition {
  sequence: number;
  hash: string;
  end_ms: number;
}
export const emptyChain = (): ChainPosition => ({
  sequence: 0,
  hash: "0".repeat(64),
  end_ms: 0,
});
/** Verifies exact server-serialized chain payload, public segment bindings and pagination.
 * This preserves browser_reported provenance; a valid hash is not proof of truthful capture. */
export async function verifyRecordingPage(
  page: RecordingPage,
  recording: string,
  position: ChainPosition,
): Promise<ChainPosition> {
  if (
    page.recording.id !== recording ||
    page.recording.provenance !== "browser_reported" ||
    !Array.isArray(page.segments) || page.segments.length > 100 ||
    !Number.isSafeInteger(page.recording.last_sequence)
  ) throw new Error("Recording manifest scope is invalid.");
  let next = { ...position };
  for (const segment of page.segments) {
    if (
      segment.sequence !== next.sequence + 1 ||
      segment.previous_hash !== next.hash || segment.start_ms !== next.end_ms ||
      !Number.isSafeInteger(segment.end_ms) ||
      segment.end_ms <= segment.start_ms ||
      !["media", "gap"].includes(segment.kind) ||
      !["reserved", "committed"].includes(segment.state) ||
      typeof segment.chain_entry !== "string"
    ) {
      throw new Error(
        "Recording timeline contains a missing, reordered or conflicting entry.",
      );
    }
    const entry = JSON.parse(segment.chain_entry);
    if (
      entry.schema !== "proctor.segment.v1" ||
      entry.recording_id !== recording ||
      [
        "sequence",
        "kind",
        "start_ms",
        "end_ms",
        "sha256",
        "byte_length",
        "reason",
        "previous_hash",
      ].some((field) =>
        entry[field] !== segment[field as keyof typeof segment]
      ) ||
      await captureDigest(new TextEncoder().encode(segment.chain_entry)) !==
        segment.chain_hash
    ) throw new Error("Recording chain or segment identity differs.");
    next = {
      sequence: segment.sequence,
      hash: segment.chain_hash,
      end_ms: segment.end_ms,
    };
  }
  if (
    page.next_cursor !== null &&
    (page.next_cursor !== next.sequence || next.sequence === position.sequence)
  ) throw new Error("Recording pagination did not advance.");
  if (
    page.next_cursor === null &&
    (next.sequence !== page.recording.last_sequence ||
      next.hash !== page.recording.head_hash ||
      next.end_ms !== page.recording.last_end_ms)
  ) throw new Error("Recording final head does not match its timeline.");
  return next;
}
