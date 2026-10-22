import { ContractError, object, text, uuid } from "./mod.ts";
export const RECORDING_PART_BYTES = 1048576;
export const RECORDING_SEGMENT_BYTES = 8 * RECORDING_PART_BYTES;
export const RECORDING_ZERO_HASH = "0".repeat(64);
export const RECORDING_MIMES = [
  "video/webm",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/mp4",
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
] as const;
export function recordingInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < min ||
    value > max
  ) {
    throw new ContractError(
      "invalid_recording_number",
      `${name} must be an integer between ${min} and ${max}`,
      422,
    );
  }
  return value;
}
export function recordingHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ContractError(
      "invalid_recording_hash",
      "Use a lowercase SHA-256 digest",
      422,
    );
  }
  return value;
}
export function recordingCommand(
  action: string,
  raw: unknown,
): Record<string, unknown> {
  const d = object(raw), recording_id = uuid(d.recording_id);
  if (action === "recording.begin") {
    if (
      !["camera", "screen", "microphone"].includes(String(d.source)) ||
      !(RECORDING_MIMES as readonly string[]).includes(String(d.mime)) ||
      (d.source === "microphone") !== String(d.mime).startsWith("audio/")
    ) {
      throw new ContractError(
        "invalid_recording_source",
        "Choose a supported recording source and matching MIME type",
        422,
      );
    }
    return {
      recording_id,
      session_id: uuid(d.session_id),
      source: d.source,
      mime: d.mime,
    };
  }
  if (action === "recording.close") {
    if (
      !["runtime_end", "track_lost", "user_stop", "capture_error"].includes(
        String(d.reason),
      )
    ) {
      throw new ContractError(
        "invalid_recording_close",
        "Choose a recording close reason",
        422,
      );
    }
    return {
      recording_id,
      expected_sequence: recordingInteger(
        d.expected_sequence,
        "Expected sequence",
        0,
        100000,
      ),
      expected_hash: recordingHash(d.expected_hash),
      reason: d.reason,
    };
  }
  if (!["recording.reserve", "recording.gap"].includes(action)) {
    throw new ContractError(
      "unknown_recording_action",
      "Unknown recording action",
      422,
    );
  }
  const sequence = recordingInteger(d.sequence, "Sequence", 1, 100000),
    start_ms = recordingInteger(d.start_ms, "Start time", 0, 86400000),
    end_ms = recordingInteger(d.end_ms, "End time", 1, 86400000);
  if (
    end_ms <= start_ms ||
    (action === "recording.reserve" && end_ms - start_ms > 60000)
  ) {
    throw new ContractError(
      "invalid_recording_time",
      "Use a positive interval; media segments cannot exceed sixty seconds",
      422,
    );
  }
  const base = {
    recording_id,
    sequence,
    start_ms,
    end_ms,
    previous_hash: recordingHash(d.previous_hash),
  };
  if (action === "recording.gap") {
    return { ...base, reason: text(d.reason, "Gap reason", 1000) };
  }
  const byte_length = recordingInteger(
    d.byte_length,
    "Segment bytes",
    1,
    RECORDING_SEGMENT_BYTES,
  );
  if (
    !Array.isArray(d.parts) ||
    d.parts.length !== Math.ceil(byte_length / RECORDING_PART_BYTES)
  ) {
    throw new ContractError(
      "invalid_recording_parts",
      "Pin every ordered part of the segment",
      422,
    );
  }
  return {
    ...base,
    byte_length,
    sha256: recordingHash(d.sha256),
    parts: d.parts.map((value, index) => {
      const part = object(value);
      return {
        sha256: recordingHash(part.sha256),
        byte_length: recordingInteger(
          part.byte_length,
          "Part bytes",
          Math.min(
            RECORDING_PART_BYTES,
            byte_length - index * RECORDING_PART_BYTES,
          ),
          Math.min(
            RECORDING_PART_BYTES,
            byte_length - index * RECORDING_PART_BYTES,
          ),
        ),
      };
    }),
  };
}
export function recordingTransport(
  action: string,
  raw: unknown,
): Record<string, unknown> {
  const d = object(raw),
    base = {
      recording_id: uuid(d.recording_id),
      sequence: recordingInteger(d.sequence, "Sequence", 1, 100000),
    };
  if (action === "segment.complete" || action === "segment.read") return base;
  if (action !== "part.authorize" && action !== "part.receipt") {
    throw new ContractError(
      "unknown_recording_transport",
      "Unknown recording transport action",
      422,
    );
  }
  const binding = {
    ...base,
    index: recordingInteger(d.index, "Part index", 0, 7),
  };
  if (action === "part.authorize") return binding;
  const iv = text(d.iv, "IV", 24), key_id = text(d.key_id, "Key ID", 80);
  if (!/^[a-f0-9]{24}$/.test(iv) || !/^[-a-zA-Z0-9_]{1,80}$/.test(key_id)) {
    throw new ContractError(
      "invalid_recording_envelope",
      "Invalid evidence encryption envelope",
      422,
    );
  }
  // Tenant/object identity is reconstructed by Postgres, never accepted from a client.
  return {
    ...binding,
    sha256: recordingHash(d.sha256),
    byte_length: recordingInteger(
      d.byte_length,
      "Part bytes",
      1,
      RECORDING_PART_BYTES,
    ),
    cipher_sha256: recordingHash(d.cipher_sha256),
    iv,
    key_id,
    etag: text(d.etag, "Storage ETag", 200),
  };
}
