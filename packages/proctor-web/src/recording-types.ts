export interface CaptureSegment {
  recording_id: string;
  sequence: number;
  start_ms: number;
  end_ms: number;
  bytes: Uint8Array;
}
export interface CaptureMeta {
  recording_id: string;
  session_id: string;
  source: "camera" | "screen" | "microphone";
  mime: string;
}
export interface CaptureUploadState {
  meta: CaptureMeta;
  phase: "prepared" | "open" | "sealed";
  ack_sequence: number;
  head_hash: string;
  last_end_ms: number;
  close_reason: string | null;
}
export interface RecordingCheckpoint {
  recording: {
    id: string;
    session_id: string;
    source: string;
    mime: string;
    state: "open" | "sealed";
    last_sequence: number;
    head_hash: string;
    last_end_ms: number;
    close_reason: string | null;
  };
  segment: null | {
    sequence: number;
    kind: "media" | "gap";
    state: "reserved" | "committed";
    start_ms: number;
    end_ms: number;
    byte_length: number | null;
    sha256: string | null;
    previous_hash: string;
    chain_hash: string;
  };
}
export interface RecordingRow {
  id: string;
  session_id: string;
  source: string;
  mime: string;
  state: "open" | "sealed";
  provenance: string;
  last_sequence: number;
  last_end_ms: number;
  head_hash?: string;
  close_reason: string | null;
  created_at: string;
  sealed_at: string | null;
  expires_at: string;
  gap_count?: number;
  pending_count?: number;
}
export interface RecordingSegment {
  sequence: number;
  kind: "media" | "gap";
  state: "reserved" | "committed";
  start_ms: number;
  end_ms: number;
  byte_length: number | null;
  sha256: string | null;
  reason: string | null;
  previous_hash: string;
  chain_hash: string;
  chain_entry: string;
}
export interface RecordingPage {
  recording: RecordingRow;
  segments: RecordingSegment[];
  next_cursor: number | null;
}
