import {
  CandidateCapture,
  type CandidateCapturePorts,
  type CaptureRunStatus,
  type CaptureStream,
} from "./candidate-capture.ts";
import type { CaptureLaunch } from "../../assessment-core/src/capture-launch.ts";
import type { CaptureUploadState } from "./recording-types.ts";
const equal = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(JSON.stringify({ a, b }));
  }
};
const rejected = async (work: Promise<unknown>) => {
  let failed = false;
  try {
    await work;
  } catch {
    failed = true;
  }
  equal(failed, true);
};
function fixture(sources: ("camera" | "microphone" | "screen")[] = ["camera"]) {
  let clock = 0,
    ready = false,
    fail = false,
    acquires = 0,
    flushes = 0,
    heartbeats = 0;
  const states = new Map<string, CaptureUploadState>(),
    tracks: { readyState: string; stopped: number; stop(): void }[] = [],
    callbacks: ((value: CaptureRunStatus) => void)[] = [],
    closures: { id: string; reason: string }[] = [],
    starts: string[] = [];
  const initial: CaptureLaunch = {
    schema_version: "proctor.capture.v1",
    session_id: "session",
    registration_id: "registration",
    attempt_id: null,
    policy_id: "policy",
    state: "preparing",
    ready: false,
    expires_at: "2026-10-20T10:01:00Z",
    activated_at: null,
    server_time: "2026-10-20T10:00:00Z",
    sources: sources.map((source) => ({ source, ready: false })),
  };
  const stream = () => {
    const track = {
      readyState: "live" as "live" | "ended",
      stopped: 0,
      stop() {
        this.readyState = "ended";
        this.stopped++;
      },
    };
    tracks.push(track);
    return { getTracks: () => [track] } satisfies CaptureStream;
  };
  const ports: CandidateCapturePorts = {
    store: {
      async initialize(meta) {
        states.set(meta.recording_id, {
          meta,
          phase: "prepared",
          ack_sequence: 0,
          head_hash: "0".repeat(64),
          last_end_ms: 0,
          close_reason: null,
        });
      },
      append: async () => {},
      states: async () => [...states.values()],
    },
    uploads: {
      async flush(id) {
        flushes++;
        if (fail) throw new Error("Network unavailable; saved footage remains");
        states.get(id)!.phase = "open";
      },
      async close(id, reason) {
        closures.push({ id, reason });
        states.get(id)!.phase = "sealed";
        states.get(id)!.close_reason = reason;
      },
    },
    acquire: async () => {
      acquires++;
      return stream();
    },
    recorder(id, input, _sink, status) {
      callbacks.push(status);
      return {
        mime: "video/webm",
        start() {
          starts.push(id);
          status({ state: "recording", reason: null });
        },
        async stop(reason) {
          input.getTracks().forEach((track) => track.stop());
          status({ state: "stopped", reason });
        },
      };
    },
    async heartbeat() {
      heartbeats++;
      return {
        ...initial,
        ready,
        sources: sources.map((source) => ({ source, ready })),
      };
    },
  };
  const controller = new CandidateCapture(
    initial,
    ports,
    () => {},
    () => clock,
  );
  return {
    controller,
    ports,
    initial,
    states,
    tracks,
    callbacks,
    closures,
    starts,
    stream,
    setReady(value: boolean) {
      ready = value;
    },
    setFail(value: boolean) {
      fail = value;
    },
    advance(value: number) {
      clock += value;
    },
    counts: () => ({ acquires, flushes, heartbeats }),
  };
}
Deno.test('live publisher failure does not stop consented recording or trust canonical ready without local live media',async()=>{
 const f=fixture();let state='failed',liveClosed=0,borrowed=false;f.ports.live={view:()=>({state,problem:state==='failed'?'Relay unavailable':null}),start:async(_source,stream)=>{borrowed=stream.getTracks()[0]===f.tracks[0];throw new Error('Relay unavailable');},reconnect:async()=>{state='live';},close:async()=>{liveClosed++;}};
 f.setReady(true);await f.controller.start('camera');await f.controller.tick();equal(borrowed,true);equal(f.tracks[0].readyState,'live');equal(f.controller.view().sources[0].state,'recording');equal(f.controller.view().ready,false);await f.controller.reconnectLive('camera');equal(f.controller.view().ready,true);equal(f.counts().acquires,1);await f.controller.close();equal(liveClosed,1);equal(f.tracks[0].readyState,'ended');
});
Deno.test('paused capture can recover readiness without changing academic state',async()=>{
  const f=fixture();f.initial.state='paused';f.initial.attempt_id='attempt';f.setReady(true);
  await f.controller.start('camera');await f.controller.tick();
  equal(f.controller.view().ready,true);equal(f.controller.view().launch.state,'paused');
});
Deno.test('background confirmation of a sealed stopped container does not permanently block source restart',async()=>{
  const f=fixture();await f.controller.start('camera');f.callbacks[0]({state:'stopped',reason:'track_lost'});
  f.states.get(f.starts[0])!.phase='sealed';
  await f.controller.recover();await f.controller.start('camera');
  equal(f.starts.length,2);equal(f.starts[0]===f.starts[1],false);
});
Deno.test("candidate capture requires live local sources and fresh canonical media readiness, not a local ready claim", async () => {
  const f = fixture(["camera", "microphone"]);
  equal(f.counts().acquires, 0);
  await f.controller.recover();
  equal(f.counts().acquires, 0);
  await f.controller.start("camera");
  f.setReady(true);
  await f.controller.tick();
  equal(f.controller.view().ready, false);
  await f.controller.start("microphone");
  await f.controller.tick();
  equal(f.controller.view().ready, true);
  f.advance(10001);
  equal(f.controller.view().ready, false);
  await f.controller.close();
});
Deno.test("candidate screen permission is requested synchronously in start, and a late permission result is stopped after closure", async () => {
  const f = fixture(["screen"]);
  let resolve!: (value: CaptureStream) => void;
  f.ports.acquire = () => {
    let done!: (value: CaptureStream) => void;
    const promise = new Promise<CaptureStream>((yes) => done = yes);
    resolve = done;
    return promise;
  };
  const pending = f.controller.start("screen");
  if (!resolve) {
    throw new Error("Permission was deferred beyond the button gesture");
  }
  const failure = rejected(pending);
  await f.controller.close("user_stop");
  resolve(f.stream());
  await failure;
  equal(f.starts.length, 0);
  equal(f.states.size, 0);
  equal(f.tracks[0].readyState, "ended");
});
Deno.test("candidate capture does not reacquire duplicate or unrequired sources", async () => {
  const f = fixture();
  await rejected(f.controller.start("screen"));
  await f.controller.start("camera");
  await rejected(f.controller.start("camera"));
  equal(f.counts().acquires, 1);
  await f.controller.close();
});
Deno.test("candidate upload failure blocks readiness without silently dropping recording state or stopping a healthy local stream", async () => {
  const f = fixture();
  await f.controller.start("camera");
  f.setReady(true);
  await f.controller.tick();
  equal(f.controller.view().ready, true);
  f.setFail(true);
  await rejected(f.controller.tick());
  equal(f.controller.view().ready, false);
  equal(f.states.size, 1);
  equal(f.tracks[0].readyState, "live");
  f.setFail(false);
  await f.controller.tick();
  equal(f.controller.view().ready, true);
  await f.controller.close();
});
Deno.test("candidate source loss requires recorded recovery and a new container identity", async () => {
  const f = fixture();
  await f.controller.start("camera");
  const first = f.starts[0];
  f.callbacks[0]({ state: "stopped", reason: "track_lost" });
  await rejected(f.controller.start("camera"));
  await f.controller.recover();
  equal(f.closures[0], { id: first, reason: "track_lost" });
  await f.controller.start("camera");
  if (f.starts[1] === first) {
    throw new Error("Recording container identity was reused");
  }
  await f.controller.close();
});
Deno.test("candidate close stops physical tracks before network drain and retains a failed closure for retry", async () => {
  const f = fixture();
  await f.controller.start("camera");
  let finish!: () => void;
  f.ports.uploads.close = () =>
    new Promise<void>((resolve) => finish = resolve);
  const closed = f.controller.close();
  equal(f.tracks[0].readyState, "ended");
  equal(f.controller.view().ready, false);
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  if (!finish) throw new Error("Closure did not reach the drain");
  finish();
  await closed;
  equal(f.controller.close(), closed);
});
Deno.test("candidate recovery refuses foreign saved scope and canonical policy changes", async () => {
  const f = fixture();
  f.states.set("foreign", {
    meta: {
      recording_id: "foreign",
      session_id: "other",
      source: "camera",
      mime: "video/webm",
    },
    phase: "open",
    ack_sequence: 1,
    head_hash: "0".repeat(64),
    last_end_ms: 1,
    close_reason: null,
  });
  await rejected(f.controller.recover());
  equal(f.closures.length, 0);
  f.states.clear();
  f.ports.heartbeat = async () => ({ ...f.initial, policy_id: "changed" });
  await rejected(f.controller.tick());
  equal(f.controller.view().ready, false);
  await f.controller.close();
});
Deno.test("candidate capture retries failed closure without losing saved state", async () => {
  const f = fixture();
  await f.controller.start("camera");
  const close = f.ports.uploads.close;
  f.ports.uploads.close = async () => {
    throw new Error("Receipt lost");
  };
  await rejected(f.controller.close("user_stop"));
  equal(f.tracks[0].readyState, "ended");
  equal([...f.states.values()][0].phase, "open");
  f.ports.uploads.close = close;
  await f.controller.close("user_stop");
  equal([...f.states.values()][0].phase, "sealed");
});
Deno.test("candidate capture can recover an initialization failure without inventing a recording container or retrying permission automatically", async () => {
  const f = fixture(), initialize = f.ports.store.initialize;
  f.ports.store.initialize = async () => {
    throw new Error("Device storage unavailable");
  };
  await rejected(f.controller.start("camera"));
  equal(f.starts.length, 0);
  equal(f.states.size, 0);
  await f.controller.recover();
  equal(f.counts().acquires, 1);
  f.ports.store.initialize = initialize;
  await f.controller.start("camera");
  equal(f.starts.length, 1);
  await f.controller.close();
});
Deno.test("candidate capture rejects empty streams and inconsistent canonical source confirmation", async () => {
  const f = fixture();
  f.ports.acquire = async () => ({ getTracks: () => [] });
  await rejected(f.controller.start("camera"));
  equal(f.starts.length, 0);
  equal(f.states.size, 0);
  f.ports.acquire = async () => f.stream();
  await f.controller.start("camera");
  f.ports.heartbeat = async () => ({ ...f.initial, ready: true });
  await f.controller.tick();
  equal(f.controller.view().ready, false);
  await f.controller.close();
});
