import {
  RECORDING_PART_BYTES,
  recordingCommand,
  recordingTransport,
} from "./recordings.ts";
import { canonicalJson } from "./mod.ts";
function equal(a: unknown, b: unknown) {
  if (canonicalJson(a) !== canonicalJson(b)) {
    throw new Error("Recording contract differs");
  }
}
const id = "00000000-0000-4000-8000-000000000001", sha = "a".repeat(64);
const reserve = {
  recording_id: id,
  sequence: 1,
  start_ms: 0,
  end_ms: 5000,
  previous_hash: "0".repeat(64),
  sha256: sha,
  byte_length: 3,
  parts: [{ sha256: sha, byte_length: 3 }],
};
function rejects(fn: () => unknown) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
Deno.test("recording contracts strip candidate storage, trust and session overrides", () => {
  equal(
    recordingCommand("recording.reserve", {
      ...reserve,
      tenant_id: id,
      provenance: "trusted",
      object_key: "x",
    }),
    reserve,
  );
  equal(
    recordingTransport("part.authorize", {
      recording_id: id,
      sequence: 1,
      index: 0,
      actor_id: id,
    }),
    { recording_id: id, sequence: 1, index: 0 },
  );
});
Deno.test("recording manifests bound bytes, intervals, exact parts and digests", () => {
  for (
    const patch of [
      { sequence: 1.5 },
      { end_ms: 60001 },
      { start_ms: 5000 },
      { sha256: "A".repeat(64) },
      { byte_length: 8388609 },
      { parts: [] },
      { parts: [{ sha256: sha, byte_length: 2 }] },
    ]
  ) {
    rejects(() =>
      recordingCommand("recording.reserve", { ...reserve, ...patch })
    );
  }
  const large = {
    ...reserve,
    byte_length: RECORDING_PART_BYTES + 3,
    parts: [{ sha256: sha, byte_length: RECORDING_PART_BYTES }, {
      sha256: sha,
      byte_length: 3,
    }],
  };
  equal(recordingCommand("recording.reserve", large), large);
});
Deno.test("recording source, close and explicit gaps cannot impersonate other evidence", () => {
  rejects(() =>
    recordingCommand("recording.begin", {
      recording_id: id,
      session_id: id,
      source: "camera",
      mime: "audio/webm",
    })
  );
  rejects(() =>
    recordingCommand("recording.close", {
      recording_id: id,
      expected_sequence: 1,
      expected_hash: sha,
      reason: "complete_no_cheating",
    })
  );
  equal(
    recordingCommand("recording.gap", {
      ...reserve,
      reason: "No capture while reconnecting",
    }),
    {
      recording_id: id,
      sequence: 1,
      start_ms: 0,
      end_ms: 5000,
      previous_hash: "0".repeat(64),
      reason: "No capture while reconnecting",
    },
  );
});
