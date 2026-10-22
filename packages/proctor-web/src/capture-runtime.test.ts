import {
  type CaptureBackend,
  type CaptureRecoveryStore,
  CaptureUploads,
} from "./capture-runtime.ts";
import { captureDigest } from "./capture-upload.ts";
import { canonicalJson } from "../../assessment-core/src/mod.ts";
import type {
  CaptureSegment,
  CaptureUploadState,
  RecordingCheckpoint,
} from "./recording-types.ts";
const id = "00000000-0000-4000-8000-000000000001",
  zero = "0".repeat(64),
  head = "a".repeat(64);
function equal(a: unknown, b: unknown) {
  if (canonicalJson(a) !== canonicalJson(b)) {
    throw new Error("Capture recovery differs");
  }
}
async function rejects(work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error("Expected recovery error");
}
async function fixture() {
  let state: CaptureUploadState = {
      meta: {
        recording_id: id,
        session_id: id,
        source: "camera",
        mime: "video/webm;codecs=vp8",
      },
      phase: "prepared",
      ack_sequence: 0,
      head_hash: zero,
      last_end_ms: 0,
      close_reason: null,
    },
    segment: CaptureSegment | null = {
      recording_id: id,
      sequence: 1,
      start_ms: 0,
      end_ms: 5000,
      bytes: new Uint8Array([1, 2, 3]),
    },
    remote: RecordingCheckpoint = {
      recording: {
        id,
        session_id: id,
        source: "camera",
        mime: state.meta.mime,
        state: "open",
        last_sequence: 0,
        head_hash: zero,
        last_end_ms: 0,
        close_reason: null,
      },
      segment: null,
    },
    loseBegin = false,
    loseComplete = false,
    loseClose = false,
    localFail = false;
  const calls: unknown[] = [];
  const store: CaptureRecoveryStore = {
    readState: async () => structuredClone(state),
    pending: async () => segment ? [structuredClone(segment)] : [],
    opened: async () => {
      state.phase = "open";
    },
    commit: async (_r, seq, previous, hash, end) => {
      if (localFail) {
        localFail = false;
        throw new Error("Device transaction interrupted");
      }
      equal(previous, state.head_hash);
      state.ack_sequence = seq;
      state.head_hash = hash;
      state.last_end_ms = end;
      segment = null;
    },
    closing: async (_r, reason) => {
      state.close_reason = reason;
    },
    sealed: async () => {
      state.phase = "sealed";
    },
    run: async (_r, work) => work(),
  };
  const backend: CaptureBackend = {
    async command(action, data, key) {
      calls.push({ action, data, key });
      if (action === "recording.begin") {
        if (loseBegin) {
          loseBegin = false;
          throw new Error("Lost begin reply");
        }
        return { sequence: 0, head_hash: zero, state: "open" };
      }
      if (action === "recording.close") {
        remote.recording.state = "sealed";
        remote.recording.close_reason = String(data.reason);
        if (loseClose) {
          loseClose = false;
          throw new Error("Lost close reply");
        }
        return { sequence: 1, head_hash: head, state: "sealed" };
      }
      remote = {
        ...remote,
        recording: {
          ...remote.recording,
          last_sequence: 1,
          head_hash: head,
          last_end_ms: 5000,
        },
        segment: {
          sequence: 1,
          kind: "media",
          state: "reserved",
          start_ms: 0,
          end_ms: 5000,
          byte_length: 3,
          sha256: await captureDigest(new Uint8Array([1, 2, 3])),
          previous_hash: zero,
          chain_hash: head,
        },
      };
      return { sequence: 1, head_hash: head, state: "reserved" };
    },
    part: async () => {},
    complete: async () => {
      remote.segment!.state = "committed";
      if (loseComplete) {
        loseComplete = false;
        throw new Error("Lost completion reply");
      }
      return { sequence: 1, head_hash: head, state: "committed" };
    },
    checkpoint: async () => structuredClone(remote),
  };
  return {
    store,
    backend,
    calls,
    state: () => state,
    remote: () => remote,
    loseBegin: () => loseBegin = true,
    loseComplete: () => loseComplete = true,
    loseClose: () => loseClose = true,
    localFail: () => localFail = true,
  };
}
Deno.test("capture recovery persists begin identity and retries identical metadata", async () => {
  const f = await fixture(), runtime = new CaptureUploads(f.store, f.backend);
  f.loseBegin();
  await rejects(() => runtime.flush(id));
  equal(f.state().phase, "prepared");
  equal((await f.store.pending(id)).length, 1);
  await runtime.flush(id);
  equal(f.calls[0], f.calls[1]);
  equal(f.state().ack_sequence, 1);
});
Deno.test("lost committed upload recovers canonical bytes/head without reserving again", async () => {
  const f = await fixture(), runtime = new CaptureUploads(f.store, f.backend);
  f.loseComplete();
  await rejects(() => runtime.flush(id));
  equal(f.state().head_hash, zero);
  equal((await f.store.pending(id)).length, 1);
  await runtime.flush(id);
  equal(f.state().head_hash, head);
  equal(
    f.calls.filter((c) =>
      (c as { action: string }).action === "recording.reserve"
    ).length,
    1,
  );
});
Deno.test("device checkpoint failure preserves saved footage and reconciles committed receipt", async () => {
  const f = await fixture(), runtime = new CaptureUploads(f.store, f.backend);
  f.localFail();
  await rejects(() => runtime.flush(id));
  equal(f.state().ack_sequence, 0);
  equal((await f.store.pending(id)).length, 1);
  await runtime.flush(id);
  equal((await f.store.pending(id)).length, 0);
  equal(f.state().ack_sequence, 1);
});
Deno.test("lost close reply recovers the exact durable closure without duplicate command", async () => {
  const f = await fixture(), runtime = new CaptureUploads(f.store, f.backend);
  await runtime.flush(id);
  f.loseClose();
  await rejects(() => runtime.close(id, "runtime_end"));
  equal(f.state().close_reason, "runtime_end");
  equal(f.state().phase, "open");
  await runtime.flush(id);
  equal(f.state().phase, "sealed");
  equal(
    f.calls.filter((c) =>
      (c as { action: string }).action === "recording.close"
    ).length,
    1,
  );
});
Deno.test("capture recovery rejects foreign bindings or canonical media conflicts without deletion", async () => {
  for (
    const patch of [{ kind: "gap" }, { sha256: "b".repeat(64) }, {
      start_ms: 1,
    }, { previous_hash: "b".repeat(64) }]
  ) {
    const f = await fixture(), runtime = new CaptureUploads(f.store, f.backend);
    f.loseComplete();
    await rejects(() => runtime.flush(id));
    Object.assign(f.remote().segment!, patch);
    await rejects(() => runtime.flush(id));
    equal((await f.store.pending(id)).length, 1);
  }
  const f = await fixture();
  f.remote().recording.session_id = "foreign";
  await rejects(() => new CaptureUploads(f.store, f.backend).flush(id));
  equal((await f.store.pending(id)).length, 1);
});
