import { ContractError, object, uuid } from "./mod.ts";
import { recordingHash, recordingInteger } from "./recordings.ts";
export interface RecordingReference {
  recording_id: string;
  from_sequence: number;
  to_sequence: number;
  head_hash: string;
}
export function recordingReferences(value: unknown): RecordingReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 25) {
    throw new ContractError(
      "invalid_recording_citations",
      "Select at most 25 recording intervals",
      422,
    );
  }
  const refs = value.map((raw) => {
    const data = object(raw),
      from = recordingInteger(
        data.from_sequence,
        "First recording entry",
        1,
        100000,
      ),
      to = recordingInteger(
        data.to_sequence,
        "Last recording entry",
        from,
        100000,
      );
    return {
      recording_id: uuid(data.recording_id),
      from_sequence: from,
      to_sequence: to,
      head_hash: recordingHash(data.head_hash),
    };
  });
  return [
    ...new Map(
      refs.map(
        (ref) => [
          `${ref.recording_id}:${ref.from_sequence}:${ref.to_sequence}:${ref.head_hash}`,
          ref,
        ],
      ),
    ).values(),
  ].sort((a, b) =>
    a.recording_id.localeCompare(b.recording_id) ||
    a.from_sequence - b.from_sequence || a.to_sequence - b.to_sequence ||
    a.head_hash.localeCompare(b.head_hash)
  );
}
