import {
  type AnswerTransferBackend,
  AnswerTransfers,
  type AnswerTransferStore,
} from "../src/answer-transfers.ts";
import type { LocalAnswerFile } from "../src/answer-types.ts";
import { AttemptRuntime } from "../src/runtime.ts";
const id = "00000000-0000-4000-8000-000000000001",
  item = "10000000-0000-4000-8000-000000000001";
Deno.test("recovery-only transport restores a lost admission checkpoint without calling new admission", async () => {
  const a = fixture();
  a.backend.recover = () =>
    Promise.resolve({ id, content_hash: "c".repeat(64) });
  await a.make().recoverUpload(id);
  equal(a.calls, ["part:0", "part:1", "complete"]);
  equal(a.state().binding?.artifact_id, id);
  const b = fixture();
  b.backend.recover = () => Promise.resolve(null);
  await fails(() => b.make().recoverUpload(id));
  equal(b.calls, []);
  equal(b.state().binding, undefined);
});
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
async function fails(work: () => Promise<unknown>) {
  let failed = false;
  try {
    await work();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Expected operation to fail");
}
function fixture() {
  let state: LocalAnswerFile = {
      id,
      key: crypto.randomUUID(),
      item_version_id: item,
      filename: "answer.pdf",
      mime: "application/pdf",
      source: "upload",
      max_bytes: 2097152,
      byte_length: 1048579,
      phase: "sealed",
      manifest: {
        filename: "answer.pdf",
        mime: "application/pdf",
        byte_length: 1048579,
        parts: [{ sha256: "a".repeat(64), byte_length: 1048576 }, {
          sha256: "b".repeat(64),
          byte_length: 3,
        }],
      },
    },
    active = true,
    loseBegin = false,
    losePart = false,
    failCheckpoint = false,
    loseComplete = false;
  const calls: string[] = [],
    received = new Map<number, number>(),
    keys: string[] = [];
  const store: AnswerTransferStore = {
    read: () => Promise.resolve(structuredClone(state)),
    bind: (_id, binding) => {
      state.binding = binding as LocalAnswerFile["binding"];
      return Promise.resolve(structuredClone(state));
    },
    part: (_id, index) =>
      Promise.resolve(new Uint8Array(index === 0 ? 1048576 : 3).fill(index)),
    checkpoint: (_id, next, completed) => {
      if (failCheckpoint) {
        failCheckpoint = false;
        return Promise.reject(new Error("device quota"));
      }
      state.upload = { next_part: next, ...(completed ? { completed } : {}) };
      return Promise.resolve(structuredClone(state));
    },
  };
  const backend: AnswerTransferBackend = {
    admit: (file) => {
      calls.push("admit");
      keys.push(file.key);
      if (loseBegin) {
        loseBegin = false;
        return Promise.reject(new Error("lost admission reply"));
      }
      return Promise.resolve({ id, content_hash: "c".repeat(64) });
    },
    part: (_id, index, bytes) => {
      calls.push("part:" + index);
      if (received.has(index)) equal(received.get(index), bytes.length);
      received.set(index, bytes.length);
      if (losePart) {
        losePart = false;
        return Promise.reject(new Error("lost part reply"));
      }
      return Promise.resolve({});
    },
    complete: () => {
      calls.push("complete");
      equal(received.size, 2);
      if (loseComplete) {
        loseComplete = false;
        return Promise.reject(new Error("lost completion reply"));
      }
      return Promise.resolve({
        id,
        state: "quarantined",
        manifest_hash: "d".repeat(64),
      });
    },
  };
  const make = () =>
    new AnswerTransfers(store, backend, (_file, work) => work(), () => {
      if (!active) throw new Error("scope closed");
    });
  return {
    make,
    calls,
    keys,
    backend,
    state: () => state,
    open: () => {
      state.phase = "open";
    },
    close: () => {
      active = false;
    },
    loseBegin: () => {
      loseBegin = true;
    },
    losePart: () => {
      losePart = true;
    },
    loseComplete: () => {
      loseComplete = true;
    },
    failCheckpoint: () => {
      failCheckpoint = true;
    },
  };
}
Deno.test("academic upload resumes exact committed parts and cannot select an answer", async () => {
  const f = fixture();
  f.losePart();
  await fails(() => f.make().upload(id));
  equal(f.state().binding?.artifact_id, id);
  equal(f.state().upload, undefined);
  await f.make().upload(id);
  equal(f.calls, ["admit", "part:0", "part:0", "part:1", "complete"]);
  equal(f.state().upload?.next_part, 2);
  equal(f.state().upload?.completed?.state, "quarantined");
  await f.make().upload(id);
  equal(f.calls.at(-1), "complete");
  equal(f.calls.filter((call) => call === "complete").length, 1);
});
Deno.test("lost admission/completion replies preserve command key and skip durably confirmed bytes", async () => {
  const f = fixture();
  f.loseBegin();
  await fails(() => f.make().admit(id));
  await f.make().admit(id);
  equal(f.keys[0], f.keys[1]);
  f.loseComplete();
  await fails(() => f.make().upload(id));
  equal(f.state().upload?.next_part, 2);
  await f.make().upload(id);
  equal(f.calls, [
    "admit",
    "admit",
    "part:0",
    "part:1",
    "complete",
    "complete",
  ]);
});
Deno.test("device checkpoint failure retries receipt bytes instead of skipping or changing admission", async () => {
  const f = fixture();
  f.failCheckpoint();
  await fails(() => f.make().upload(id));
  await f.make().upload(id);
  equal(f.calls, ["admit", "part:0", "part:0", "part:1", "complete"]);
});
Deno.test("account closure during part or completion waits cannot publish new recovery progress", async () => {
  const part = fixture(), progress: number[] = [];
  part.backend.part = () => {
    part.close();
    return Promise.resolve({});
  };
  await fails(() => part.make().upload(id, (done) => progress.push(done)));
  equal(part.state().upload, undefined);
  equal(progress, [0]);
  equal(part.calls, ["admit"]);
  const complete = fixture();
  complete.backend.complete = () => {
    complete.close();
    return Promise.resolve({
      id,
      state: "ready",
      manifest_hash: "d".repeat(64),
    });
  };
  await fails(() => complete.make().upload(id));
  equal(complete.state().upload?.next_part, 2);
  equal(complete.state().upload?.completed, undefined);
});
Deno.test("unsealed files, closed scope, wrong completion identity and caller-ready states fail closed", async () => {
  const a = fixture();
  a.open();
  await fails(() => a.make().admit(id));
  equal(a.calls, []);
  const b = fixture();
  b.close();
  await fails(() => b.make().upload(id));
  equal(b.calls, []);
  const c = fixture();
  c.backend.complete = () =>
    Promise.resolve({
      id: item,
      state: "ready",
      manifest_hash: "d".repeat(64),
    });
  await fails(() => c.make().upload(id));
  equal(c.state().upload?.completed, undefined);
  const d = fixture();
  d.backend.complete = () =>
    Promise.resolve({ id, state: "uploading", manifest_hash: "d".repeat(64) });
  await fails(() => d.make().upload(id));
  equal(d.state().upload?.completed, undefined);
});
Deno.test("academic admission exposes only a live scoped lease and never grants new answering time", async () => {
  let now = Date.parse("2030-01-01T10:00:00Z"),
    mode = "active",
    received: unknown,
    credentials = { device_id: id, token: "a".repeat(64), epoch: 1 };
  const snapshot = () => ({
    attempt_id: id,
    state: mode,
    deadline_at: "2030-01-01T11:00:00Z",
    section_deadline_at: "2030-01-01T10:30:00Z",
    closes_at: "2030-01-01T11:00:00Z",
    section_index: 0,
    last_sequence: 0,
    lease_epoch: 1,
    lease_expires_at: new Date(now + 60000).toISOString(),
    server_time: new Date(now).toISOString(),
    next_deadline_at: null,
  });
  const runtime = new AttemptRuntime(
    {
      state: () => Promise.resolve({ snapshot: snapshot() }),
      command: () =>
        Promise.resolve({ result: { epoch: 1 }, snapshot: snapshot() }),
    },
    {
      read: () => credentials,
      write: (value) => {
        credentials = value as typeof credentials;
      },
    },
    () => {},
    () => {},
    () => now,
  );
  await runtime.withAnswerLease((lease) => {
    received = lease;
    return Promise.resolve();
  });
  equal(received, { device_id: id, token: "a".repeat(64), epoch: 1 });
  mode = "paused";
  await runtime.tick();
  await fails(() => runtime.withAnswerLease(() => Promise.resolve()));
  mode = "active";
  now += 31 * 60000;
  await runtime.tick();
  await fails(() => runtime.withAnswerLease(() => Promise.resolve()));
  runtime.close();
  await fails(() => runtime.withAnswerLease(() => Promise.resolve()));
});
