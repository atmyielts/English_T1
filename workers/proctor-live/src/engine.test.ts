import { canonicalJson } from "../../../packages/assessment-core/src/mod.ts";
import {
  type LiveBridge,
  type LiveContext,
  LiveEngine,
  type LiveInvocation,
  type LiveStore,
} from "./engine.ts";
import type { LiveProvider } from "./provider.ts";
import type {TurnProvider} from './turn.ts';
Deno.test('slow relay revocation does not postpone stopping known SFU forwarding',async()=>{
 const f=fixture();let release!:()=>void;const blocked=new Promise<void>(resolve=>release=resolve),relay:TurnProvider={keyId:'test-key',issue:()=>Promise.resolve([{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'test-user',credential:'test-password'}]),revoke:()=>blocked};
 const engine=new LiveEngine(f.store,f.bridge,f.provider,()=>Date.now(),relay);await engine.invoke(f.input('ice','ice-request-001',{}));await engine.invoke(f.input());f.ctx.allowed=false;const alarm=engine.alarm();let closedBeforeRelay=false;
 try{for(let i=0;i<100&&f.calls.close===0;i++)await Promise.resolve();closedBeforeRelay=f.calls.close===1;}finally{release();await alarm;}
 eq(closedBeforeRelay,true);eq(f.ctx.state,'closed');
});
const tenant = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000003";
const sdp =
  "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\na=sendonly\r\n";
const eq = (x: unknown, y: unknown) => {
  if (canonicalJson(x) !== canonicalJson(y)) {
    throw new Error(`Expected ${JSON.stringify(y)}, got ${JSON.stringify(x)}`);
  }
};
Deno.test('relay issuance rechecks fresh authority before returning passwords and revokes a known late reply',async()=>{
 const f=fixture();let revoked=0;const relay:TurnProvider={keyId:'fixture-key',issue:()=>{f.ctx.allowed=false;return Promise.resolve([{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'fixture-user',credential:'fixture-password'}]);},revoke:()=>{revoked++;return Promise.resolve();}};
 await rejects(()=>new LiveEngine(f.store,f.bridge,f.provider,()=>Date.now(),relay).invoke(f.input('ice','ice-request-001',{})),'live_access_denied');eq(revoked,1);eq(f.ctx.state,'closed');eq(f.calls.create,0);
});

Deno.test("provider application changes never replay or clean up IDs through a different application", async () => {
  const f = fixture();
  await f.make().invoke(f.input());
  let wrongCalls = 0;
  const wrong = new LiveEngine(f.store, f.bridge, {
    ...f.provider,
    appId: "different-app",
    inspect: () => {
      wrongCalls++;
      return Promise.resolve({ tracks: [] });
    },
  });
  await rejects(() => wrong.invoke(f.input()), "live_provider_app_changed");
  await rejects(() => wrong.alarm(), "live_reconciliation_pending");
  eq(wrongCalls, 0);
  eq(f.ctx.state, "negotiating");
  if (!f.alarm()) {
    throw new Error("Original application recovery lost its alarm");
  }
  f.ctx.allowed = false;
  await f.make().alarm();
  eq(f.ctx.state, "closed");
  eq(f.calls.close, 1);
});
Deno.test("withdrawal during provider negotiation withholds SDP and closes the returned resources", async () => {
  const f = fixture(), publish = f.provider.publish;
  f.provider.publish = async (...args) => {
    const result = await publish(...args);
    f.ctx.allowed = false;
    return result;
  };
  await rejects(() => f.make().invoke(f.input()), "live_access_denied");
  eq(f.calls.publish, 1);
  eq(f.calls.close, 1);
  eq(f.ctx.state, "closed");
  if ([...f.values.keys()].some((key) => key.startsWith("receipt:"))) {
    throw new Error("Withdrawn SDP retained");
  }
});
async function rejects(fn: () => Promise<unknown>, code?: string) {
  try {
    await fn();
  } catch (cause) {
    if (code) eq((cause as { code: string }).code, code);
    return;
  }
  throw new Error("Expected operation to fail");
}
function fixture(role: "publisher" | "viewer" = "publisher") {
  const values = new Map<string, unknown>(),
    calls = { create: 0, publish: 0, subscribe: 0, answer: 0, close: 0 },
    reports: string[] = [],
    ctx: LiveContext = {
      id,
      tenant_id: tenant,
      actor_id: actor,
      role,
      source: "camera",
      state: "opening",
      allowed: true,
      expires_at: new Date(Date.now() + 20000).toISOString(),
      server_time: new Date().toISOString(),
      revision: 1,
      provider_session_id: null,
      mid: null,
      track_name: "c-" + id + "-camera",
      publisher_provider_session_id: "remote-publisher",
      publisher_track_name: "remote-camera",
    };
  let alarm: number | null = null,
    lostReport = false,
    lostWrite = false,
    unavailable = false;
  const store: LiveStore = {
    get: <T>(key: string) =>
      Promise.resolve(structuredClone(values.get(key)) as T | undefined),
    put: async (key, value) => {
      if (
        lostWrite && key.startsWith("receipt:") &&
        (value as { phase: string }).phase === "done"
      ) {
        lostWrite = false;
        throw new Error("Receipt storage reply lost");
      }
      values.set(key, structuredClone(value));
    },
    setAlarm: (time) => {
      alarm = time;
      return Promise.resolve();
    },
    deleteAlarm: () => {
      alarm = null;
      return Promise.resolve();
    },
    deleteReceipts: () => {
      for (const key of values.keys()) {
        if (key.startsWith("receipt:")) values.delete(key);
      }
      return Promise.resolve();
    },
  };
  const bridge: LiveBridge = {
    context: () => {
      if (unavailable) throw new Error("Canonical service down");
      return Promise.resolve(
        structuredClone({
          ...ctx,
          allowed: ctx.allowed &&
            !["closed", "closing", "faulted"].includes(ctx.state),
        }),
      );
    },
    report: async (_t, _i, action, data) => {
      if (unavailable) throw new Error("Canonical service down");
      if (!reports.includes(action)) reports.push(action);
      if (action === "allocated") {
        ctx.provider_session_id = String(data.provider_session_id);
        ctx.provider_app_id = String(data.provider_app_id);
        ctx.state = "allocated";
      }
      if (action === "negotiated") {
        ctx.mid = String(data.mid);
        ctx.state = "negotiating";
        if (lostReport) {
          lostReport = false;
          throw new Error("Committed report reply lost");
        }
      }
      if (action === "connected") ctx.state = "active";
      if (action === "closed") ctx.state = "closed";
      if (action === "faulted") ctx.state = "faulted";
      return { id, state: ctx.state };
    },
  };
  const provider: LiveProvider = {
    appId: "test-app",
    create: () => {
      calls.create++;
      return Promise.resolve("provider-session");
    },
    publish: (_session, trackName, mid) => {
      calls.publish++;
      return Promise.resolve({
        sessionDescription: { type: "answer", sdp },
        requiresImmediateRenegotiation: false,
        tracks: [{ trackName, mid, location: "local" }],
      });
    },
    subscribe: (_session, publisher, trackName) => {
      calls.subscribe++;
      return Promise.resolve({
        sessionDescription: { type: "offer", sdp },
        requiresImmediateRenegotiation: true,
        tracks: [{
          trackName,
          mid: "7",
          sessionId: publisher,
          location: "remote",
        }],
      });
    },
    answer: () => {
      calls.answer++;
      return Promise.resolve({});
    },
    inspect: () =>
      Promise.resolve({
        tracks: [{
          mid: role === "publisher" ? "0" : "7",
          status: "active",
          trackName: ctx.track_name,
        }],
      }),
    close: (_session, mids) => {
      calls.close++;
      return Promise.resolve({ tracks: mids.map((mid) => ({ mid })) });
    },
  };
  const make = () => new LiveEngine(store, bridge, provider),
    input = (
      action = "publish",
      key = "live-operation-001",
      data: Record<string, unknown> = {
        mid: "0",
        sessionDescription: { type: "offer", sdp },
      },
    ): LiveInvocation => ({
      tenant,
      id,
      bearer: "Bearer private-auth-token",
      action,
      key,
      data,
    });
  return {
    store,
    values,
    calls,
    reports,
    ctx,
    bridge,
    provider,
    make,
    input,
    alarm: () => alarm,
    loseReport() {
      lostReport = true;
    },
    loseWrite() {
      lostWrite = true;
    },
    setUnavailable(value: boolean) {
      unavailable = value;
    },
  };
}
Deno.test("live broker serializes concurrent publish and recovers known reply across durable restart", async () => {
  const f = fixture(),
    engine = f.make(),
    results = await Promise.all(
      Array.from({ length: 4 }, () => engine.invoke(f.input())),
    );
  for (const result of results) eq(result, results[0]);
  eq(f.calls.create, 1);
  eq(f.calls.publish, 1);
  eq(await f.make().invoke(f.input()), results[0]);
  eq(f.calls.publish, 1);
  if (JSON.stringify([...f.values.values()]).includes("private-auth-token")) {
    throw new Error("Bearer token persisted");
  }
});
Deno.test("lost canonical track receipt resumes the durable effect without another provider mutation", async () => {
  const f = fixture();
  f.loseReport();
  await rejects(() => f.make().invoke(f.input()));
  const result = await f.make().invoke(f.input());
  eq(f.calls.create, 1);
  eq(f.calls.publish, 1);
  eq((result as { tracks: unknown }).tracks, [{ mid: "0" }]);
});
Deno.test("lost final durable receipt resumes after the negotiation phase was advanced", async () => {
  const f = fixture();
  f.loseWrite();
  await rejects(() => f.make().invoke(f.input()));
  await f.make().invoke(f.input());
  eq(f.calls.publish, 1);
});
Deno.test("viewer cannot overlap a second offer or confirm before answer; provider answer finishes the exchange", async () => {
  const f = fixture("viewer"), engine = f.make();
  await engine.invoke(f.input("subscribe", "viewer-subscribe-001", {}));
  await rejects(
    () => engine.invoke(f.input("subscribe", "viewer-subscribe-002", {})),
    "live_negotiation_pending",
  );
  await rejects(
    () => engine.invoke(f.input("connected", "viewer-connected-001", {})),
    "live_negotiation_incomplete",
  );
  await engine.invoke(
    f.input("answer", "viewer-answer-001", {
      sessionDescription: { type: "answer", sdp },
    }),
  );
  await engine.invoke(f.input("connected", "viewer-connected-001", {}));
  eq(f.calls.answer, 1);
  eq(f.calls.subscribe, 1);
  eq(f.ctx.state, "active");
});
Deno.test("unknown provider mutation is never blindly replayed and keeps late resource cleanup scheduled", async () => {
  const f = fixture();
  f.provider.publish = () => {
    f.calls.publish++;
    throw new Error("Allocation completed but reply lost");
  };
  await rejects(() => f.make().invoke(f.input()), "live_provider_uncertain");
  await rejects(() => f.make().invoke(f.input()));
  eq(f.calls.publish, 1);
  if (!f.alarm() || f.calls.close < 1) {
    throw new Error("Unknown provider outcome lost cleanup custody");
  }
  eq(f.values.has("binding"), true);
});
Deno.test("permission loss is checked before cached SDP; known forwarding closes and private descriptions are erased", async () => {
  const f = fixture();
  await f.make().invoke(f.input());
  f.ctx.allowed = false;
  await rejects(() => f.make().invoke(f.input()), "live_access_denied");
  eq(f.calls.close, 1);
  eq(
    [...f.values.keys()].filter((key) => key.startsWith("receipt:")).length,
    0,
  );
  eq(f.ctx.state, "closed");
});
Deno.test("canonical outage stops forwarding rather than trusting stale authorization", async () => {
  const f = fixture();
  await f.make().invoke(f.input());
  f.setUnavailable(true);
  await rejects(() => f.make().alarm(), "live_reconciliation_pending");
  eq(f.calls.close, 1);
  f.setUnavailable(false);
  await f.make().alarm();
  eq(f.ctx.state, "closed");
  eq(f.alarm(), null);
});
Deno.test("partial provider allocation preserves successful resources for cleanup, and consented media kind is enforced", async () => {
  const f = fixture();
  f.provider.publish = () => {
    f.calls.publish++;
    return Promise.resolve({
      tracks: [{
        mid: "0",
        trackName: f.ctx.track_name,
        errorCode: "track_error",
      }, { mid: "1", trackName: "unexpected-allocation" }],
    });
  };
  await rejects(() => f.make().invoke(f.input()), "live_partial_allocation");
  await f.make().alarm();
  eq(f.calls.close, 1);
  eq(f.ctx.state, "closed");
  const g = fixture();
  await rejects(
    () =>
      g.make().invoke(
        g.input("publish", "wrong-source-001", {
          mid: "0",
          sessionDescription: {
            type: "offer",
            sdp: sdp.replace("m=video ", "m=audio "),
          },
        }),
      ),
    "live_source_kind_mismatch",
  );
  eq(g.calls.publish, 0);
  await rejects(()=>g.make().invoke(g.input('publish','extra-source-001',{mid:'0',sessionDescription:{type:'offer',sdp:sdp+'m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:1\r\na=sendonly\r\n'}})),'live_source_kind_mismatch');
  eq(g.calls.publish,0);
});
