import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  convertV4MiniflareOptions,
  Miniflare,
  Response as RuntimeResponse,
} from "miniflare";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000003",
  first = "20000000-0000-4000-8000-000000000001",
  second = "20000000-0000-4000-8000-000000000002",
  secret = "synthetic-live-broker-key-at-least-32",
  sfuSecret = "synthetic-live-app-secret-at-least-32";
const sdp =
  "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\na=sendonly\r\n";
test("real workerd/SQLite broker preserves provider effects over restart and closes withdrawn feeds through native alarms; Auth/PG/SFU are explicit metadata adapters", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "schood-live-worker-")),
    contexts = new Map(),
    sessions = new Map(),
    providerPaths=[],
    calls = { create: 0, publish: 0, close: 0,relayIssue:0,relayRevoke:0 };
  let worker, withdrawnClosedResolve;
  const withdrawnClosed = new Promise((resolve) => {
    withdrawnClosedResolve = resolve;
  });
  for (const id of [first, second]) {
    contexts.set(id, {
      id,
      tenant_id: tenant,
      actor_id: actor,
      role: "publisher",
      source: "camera",
      state: "opening",
      allowed: true,
      expires_at: new Date(Date.now() + 60000).toISOString(),
      server_time: new Date().toISOString(),
      revision: 1,
      provider_session_id: null,
      mid: null,
      track_name: "c-" + id + "-camera",
      publisher_provider_session_id: null,
      publisher_track_name: null,
    });
  }
  async function outbound(req) {
    const url = new URL(req.url),
      raw = req.method === "GET" ? "" : await req.text(),
      body = raw ? JSON.parse(raw) : null;
    if (url.origin === "https://canonical.live.test") {
      assert.equal(url.pathname, "/functions/v1/proctor/live/internal");
      assert.equal(req.headers.get("x-proctor-live-key"), secret);
      assert.equal(body.tenant_id, tenant);
      const c = contexts.get(body.id);
      assert.ok(c);
      if (body.action === "context" || body.action === "system.context") {
        if (
          body.action === "context" &&
          req.headers.get("authorization") !== "Bearer synthetic"
        ) {
          return RuntimeResponse.json({ code: "live_access_denied" }, {
            status: 403,
          });
        }
        c.server_time = new Date().toISOString();
        return RuntimeResponse.json({
          data: {
            ...c,
            allowed: c.allowed &&
              !["closed", "closing", "faulted"].includes(c.state),
          },
        });
      }
      assert.equal(body.action, "report");
      const report = body.data;
      if (report.action === "allocated") {
        c.provider_session_id = report.data.provider_session_id;
        c.provider_app_id = report.data.provider_app_id;
        c.state = "allocated";
      }
      if (report.action === "negotiated") {
        c.mid = report.data.mid;
        c.state = "negotiating";
      }
      if (report.action === "connected") c.state = "active";
      if (report.action === "faulted") c.state = "faulted";
      if (report.action === "closed") {
        c.state = "closed";
        if (body.id === second) withdrawnClosedResolve();
      }
      return RuntimeResponse.json({ data: { id: c.id, state: c.state } });
    }
    assert.equal(url.origin, "https://rtc.live.cloudflare.com");
    providerPaths.push(url.pathname);
    if(url.pathname.includes('/turn/keys/')){
      assert.equal(req.headers.get('authorization'),'Bearer '+sfuSecret);
      if(url.pathname.endsWith('/generate-ice-servers')){calls.relayIssue++;assert.equal(body.ttl,600);return RuntimeResponse.json({iceServers:[{urls:['turns:turn.cloudflare.com:443?transport=tcp'],username:'native-user-'+calls.relayIssue,credential:'native-password'}]},{status:201});}
      if(url.pathname.endsWith('/revoke')){calls.relayRevoke++;return new RuntimeResponse(null,{status:204});}
      throw Error('Unexpected synthetic TURN call');
    }
    assert.equal(req.headers.get("authorization"), "Bearer " + sfuSecret);
    if (url.pathname.endsWith("/sessions/new")) {
      const sessionId = "native-session-" + (++calls.create);
      sessions.set(sessionId, []);
      return RuntimeResponse.json({ sessionId });
    }
    const session = /\/sessions\/([^/]+)/.exec(url.pathname)?.[1];
    assert.ok(sessions.has(session));
    if (url.pathname.endsWith("/tracks/new")) {
      calls.publish++;
      const track = body.tracks[0];
      sessions.set(session, [{ ...track, status: "active" }]);
      return RuntimeResponse.json({
        sessionDescription: { type: "answer", sdp },
        requiresImmediateRenegotiation: false,
        tracks: [track],
      });
    }
    if (url.pathname.endsWith("/tracks/close")) {
      calls.close++;
      sessions.set(session, []);
      return RuntimeResponse.json({
        tracks: body.tracks.map((row) => ({ mid: row.mid })),
      });
    }
    if (req.method === "GET") {
      return RuntimeResponse.json({ tracks: sessions.get(session) });
    }
    throw new Error("Unexpected native broker provider request");
  }
  const converted = convertV4MiniflareOptions({
    name: "proctor-live-native",
    modules: true,
    script: await readFile(
      new URL("../../workers/proctor-live/dist/index.js", import.meta.url),
      "utf8",
    ),
    compatibilityDate: "2026-10-20",
    durableObjects: {
      CONNECTIONS: { className: "LiveConnectionBroker", useSQLite: true },
    },
    bindings: {
      PROCTOR_LIVE_ENABLED: "true",
      PROCTOR_LIVE_BROKER_SECRET: secret,
      PROCTOR_SFU_APP_ID: "native-app",
      PROCTOR_SFU_APP_SECRET: sfuSecret,
      PROCTOR_TURN_KEY_ID:'native-turn-key',PROCTOR_TURN_KEY_SECRET:sfuSecret,
      SUPABASE_URL: "https://canonical.live.test",
      SUPABASE_ANON_KEY: "synthetic-anon",
      ALLOWED_ORIGINS: "https://exam.live.test",
    },
    outboundService: outbound,
  });
  const options = { ...converted, resourcePersistencePath: directory },
    send = (
      id = first,
      bearer = "Bearer synthetic",
      origin = "https://exam.live.test",
      action='publish',
    ) =>
      worker.dispatchFetch(
        `https://broker.live.test/v1/connections/${id}?tenant_id=${tenant}`,
        {
          method: "POST",
          headers: {
            authorization: bearer,
            origin,
            "content-type": "application/json",
            "idempotency-key": "native-publish-" + id,
          },
          body: JSON.stringify({
            action,
            data: action==='ice'?{}:{ mid: "0", sessionDescription: { type: "offer", sdp } },
          }),
        },
      );
  try {
    worker = new Miniflare(options);
    assert.equal(
      (await send(first, "Bearer synthetic", "https://foreign.invalid")).status,
      403,
    );
    assert.equal((await send(first, "Bearer foreign")).status, 403);
    const relayReplies=await Promise.all(Array.from({length:4},()=>send(first,'Bearer synthetic','https://exam.live.test','ice')));for(const response of relayReplies)assert.equal(response.status,200,await response.text());assert.equal(calls.relayIssue,1);
    const replies = await Promise.all(Array.from({ length: 4 }, async () => {
      const response = await send();
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    }));
    assert.ok(
      replies.every((row) =>
        JSON.stringify(row) === JSON.stringify(replies[0])
      ),
    );
    assert.equal(calls.create, 1);
    assert.equal(calls.publish, 1);
    await worker.dispose();
    worker = new Miniflare(options);
    assert.equal((await send()).status, 200);
    assert.equal(calls.publish, 1);
    assert.equal((await send(first,'Bearer synthetic','https://exam.live.test','ice')).status,200);assert.equal(calls.relayIssue,1);
    assert.equal((await send(second,'Bearer synthetic','https://exam.live.test','ice')).status,200);
    assert.equal((await send(second)).status, 200);
    contexts.get(second).allowed = false;
    let timer;
    try {
      await Promise.race([
        withdrawnClosed,
        new Promise((_, reject) => {
          timer = setTimeout(() =>
            reject(
              new Error(
                'Native live lease alarm did not close withdrawn provider forwarding: '+JSON.stringify({calls,paths:providerPaths,state:contexts.get(second).state}),
              ),
            ), 12000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    assert.equal(contexts.get(second).state, "closed");
    assert.equal(calls.close, 1);
    assert.equal(calls.relayRevoke,1);
    assert.equal((await send(second)).status, 403);
    assert.equal(calls.publish, 2);
  } finally {
    await worker?.dispose();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("schood-live-worker-"));
    await rm(directory, { recursive: true, force: true });
  }
});
