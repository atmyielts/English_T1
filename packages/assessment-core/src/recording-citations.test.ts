import { recordingReferences } from "./recording-citations.ts";
import { canonicalJson } from "./mod.ts";
const id = "00000000-0000-4000-8000-000000000001",
  ref = {
    recording_id: id,
    from_sequence: 1,
    to_sequence: 2,
    head_hash: "a".repeat(64),
  };
function rejects(fn: () => unknown) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("Expected citation rejection");
}
Deno.test("recording references normalize duplicates/order and strip claimed authority", () => {
  const value = recordingReferences([
    { ...ref, source: "trusted_model", guilty: true, object_key: "foreign" },
    { ...ref },
    { ...ref, from_sequence: 3, to_sequence: 3 },
  ]);
  if (
    canonicalJson(value) !==
      canonicalJson([ref, { ...ref, from_sequence: 3, to_sequence: 3 }])
  ) throw new Error("Citation normalization differs");
  if (recordingReferences(undefined).length) {
    throw new Error("Legacy finding gained citations");
  }
});
Deno.test("recording references reject malformed hashes, fractional/reversed intervals and unbounded lists", () => {
  for (
    const patch of [
      { head_hash: "A".repeat(64) },
      { from_sequence: 0 },
      { to_sequence: 100001 },
      { from_sequence: 1.5 },
      { from_sequence: 3, to_sequence: 2 },
      { recording_id: "foreign" },
    ]
  ) rejects(() => recordingReferences([{ ...ref, ...patch }]));
  rejects(() => recordingReferences(Array.from({ length: 26 }, () => ref)));
  rejects(() => recordingReferences(null));
});
