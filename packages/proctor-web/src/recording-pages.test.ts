import { emptyChain, verifyRecordingPage } from "./recording-pages.ts";
import { captureDigest } from "./capture-upload.ts";
import type { RecordingPage } from "./recording-types.ts";
const id = "00000000-0000-4000-8000-000000000001";
async function page(): Promise<RecordingPage> {
  const entry = JSON.stringify({
      schema: "proctor.segment.v1",
      recording_id: id,
      sequence: 1,
      kind: "gap",
      start_ms: 0,
      end_ms: 5000,
      sha256: null,
      byte_length: null,
      reason: "No footage",
      parts: null,
      previous_hash: "0".repeat(64),
    }),
    hash = await captureDigest(new TextEncoder().encode(entry));
  return {
    recording: {
      id,
      session_id: id,
      source: "camera",
      mime: "video/webm",
      state: "sealed",
      provenance: "browser_reported",
      last_sequence: 1,
      last_end_ms: 5000,
      head_hash: hash,
      close_reason: "runtime_end",
      created_at: "",
      sealed_at: null,
      expires_at: "",
    },
    segments: [{
      sequence: 1,
      kind: "gap",
      state: "committed",
      start_ms: 0,
      end_ms: 5000,
      byte_length: null,
      sha256: null,
      reason: "No footage",
      previous_hash: "0".repeat(64),
      chain_hash: hash,
      chain_entry: entry,
    }],
    next_cursor: null,
  };
}
async function rejects(work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error("Expected manifest rejection");
}
Deno.test("recording pages verify immutable gaps and final head", async () => {
  const p = await page(),
    position = await verifyRecordingPage(p, id, emptyChain());
  if (position.hash !== p.recording.head_hash || position.sequence !== 1) {
    throw new Error("Chain head differs");
  }
});
Deno.test("recording pages reject scope, hash, ordering, metadata and cursor corruption", async () => {
  for (
    const mutate of [
      (p: RecordingPage) => p.recording.id = "foreign",
      (p: RecordingPage) => p.segments[0].reason = "Erased gap",
      (p: RecordingPage) => p.segments[0].sequence = 2,
      (p: RecordingPage) => p.segments[0].chain_hash = "a".repeat(64),
      (p: RecordingPage) => p.recording.head_hash = "a".repeat(64),
      (p: RecordingPage) => p.next_cursor = 0,
    ]
  ) {
    const p = await page();
    mutate(p);
    await rejects(() => verifyRecordingPage(p, id, emptyChain()));
  }
});
