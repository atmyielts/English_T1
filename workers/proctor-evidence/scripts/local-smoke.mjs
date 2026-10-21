import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  container = `schood-proctor-evidence-${randomUUID().slice(0, 8)}`,
  directory = await mkdtemp(path.join(tmpdir(), "schood-proctor-evidence-"));
const tenant = "10000000-0000-4000-8000-000000000001",
  candidate = "00000000-0000-4000-8000-000000000003",
  owner = "00000000-0000-4000-8000-000000000001",
  foreign = "00000000-0000-4000-8000-000000000004",
  origin = "https://proctor-tests.invalid",
  secret = "synthetic-evidence-" + "a".repeat(32);
let started = false, worker, loseReceipt = true, loseComplete = true;
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || String(result.error));
  }
  return result.stdout.trim();
}
const sql = (query) =>
  docker([
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ], query);
function literal(value) {
  const encoded = typeof value === "string" ? value : JSON.stringify(value);
  let delimiter;
  do {
    delimiter = `$e_${randomUUID().replaceAll("-", "")}$`;
  } while (encoded.includes(delimiter));
  return `${delimiter}${encoded}${delimiter}`;
}
function rpc(name, args) {
  assert.match(name, /^proctor_recording_(command|read|transport|checkpoint|catalog)$/);
  const values = Object.entries(args).map(([key, value]) => {
    assert.match(key, /^p_[a-z_]+$/);
    return `${key}=>${value === null ? "null" : literal(value)}${
      key === "p_data" ? "::jsonb" : ""
    }`;
  });
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (c) => output += c);
    child.stderr.on("data", (c) => error += c);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const match = /ERROR:\s+([A-Z0-9]{5}):\s+([^\r\n]+)/.exec(error);
        resolve({
          data: null,
          error: {
            code: match?.[1],
            message: match?.[2] ?? "Fixture RPC failed",
          },
        });
        return;
      }
      try {
        resolve({
          data: JSON.parse(output.trim().split("\n").at(-1)),
          error: null,
        });
      } catch (cause) {
        reject(cause);
      }
    });
    child.stdin.end(
      `set role service_role;select public.${name}(${values.join(",")});`,
    );
  });
}
try {
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--label",
    "schood.assessment.test=proctor-evidence",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16-alpine",
  ]);
  started = true;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"])
        .status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready);
  const migrations = [
    "20261013100000_assessment_cloud_core",
    "20261013110000_proctor_control_plane",
    "20261013120000_proctor_candidate_delivery",
    "20261013130000_assessment_runtime",
    "20261013140000_assessment_recovery_schedule",
    "20261013150000_assessment_grading",
    "20261014090000_assessment_staff",
    "20261014100000_assessment_design",
    "20261014110000_assessment_artifacts",
    "20261014120000_proctor_recordings",
    "20261014130000_proctor_recording_recovery",
    "20261014140000_proctor_recording_citations",
  ];
  for (
    const file of [
      "supabase/tests/assessment-cloud.fixture.sql",
      ...migrations.map((n) => `supabase/migrations/${n}.sql`),
      "supabase/tests/assessment-stack.fixture.sql",
    ]
  ) sql(await readFile(path.join(root, file), "utf8"));
  const session = sql(
    `with pol as (insert into proctor_policies(tenant_id,title,policy,created_by) values('${tenant}','Capture authority fixture','{"schema_version":"proctor.policy.v1","mode":"browser","camera":true,"screen":true,"microphone":false,"second_camera":false,"identity_level":0,"reviewer_quorum":2}','${owner}') returning *),prep as (insert into proctor_preparations(tenant_id,registration_id,candidate_id,policy_id) select '${tenant}',a.registration_id,'${candidate}',pol.id from assessment_attempts a,pol where a.id=(select id from stack_test_ids where name='delivery')) insert into proctor_sessions(tenant_id,attempt_id,candidate_id,policy_id,policy_snapshot) select '${tenant}',(select id from stack_test_ids where name='delivery'),'${candidate}',pol.id,pol.policy from pol returning id;`,
  ).split("\n")[0];
  assert.match(session, /^[a-f0-9-]{36}$/);
  const bundle = await build({
    stdin: {
      contents:
        "export {createRecordingHandler} from './supabase/functions/proctor/recording-handler.ts';export {createRecordingRepository} from './supabase/functions/proctor/recording-repository.ts';",
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
  });
  const { createRecordingHandler, createRecordingRepository } = await import(
    `data:text/javascript;base64,${
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
    }`
  );
  const handler = createRecordingHandler(
    createRecordingRepository(
      async (token) => ({ candidate, owner, foreign }[token] ?? null),
      { rpc },
    ),
    [origin],
    { enabled: true, transportSecret: secret },
  );
  async function edge(
    route,
    body,
    token = "candidate",
    key = "evidence-fixture-command",
  ) {
    return handler(
      new Request(
        `https://canonical-evidence.invalid/functions/v1/proctor/recordings/${route}?tenant_id=${tenant}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "idempotency-key": key,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
    );
  }
  async function data(response) {
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value.data;
  }
  const options = {
    modules: true,
    scriptPath: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
    compatibilityDate: "2026-10-14",
    r2Buckets: ["EVIDENCE"],
    r2Persist: directory,
    bindings: {
      SUPABASE_URL: "https://canonical-evidence.invalid",
      SUPABASE_ANON_KEY: "synthetic-anon",
      PROCTOR_EVIDENCE_SECRET: secret,
      EVIDENCE_ACTIVE_KEY_ID: "test-k1",
      EVIDENCE_KEYRING: JSON.stringify({ "test-k1": "b".repeat(64) }),
      ALLOWED_ORIGINS: origin,
    },
    outboundService: async (req) => {
      assert.equal(new URL(req.url).hostname, "canonical-evidence.invalid");
      const body = await req.clone().json(), response = await handler(req);
      if (
        response.ok &&
        ((body.action === "part.receipt" && loseReceipt) ||
          (body.action === "segment.complete" && loseComplete))
      ) {
        if (body.action === "part.receipt") loseReceipt = false;
        else loseComplete = false;
        return Response.json({
          code: "synthetic_lost_reply",
          error: "Canonical operation committed but reply was lost",
        }, { status: 503 });
      }
      return response;
    },
  };
  worker = new Miniflare(options);
  await worker.ready;
  const recording = randomUUID(),
    begin = {
      action: "recording.begin",
      data: {
        recording_id: recording,
        session_id: session,
        source: "camera",
        mime: "video/webm",
      },
    };
  const starts = await Promise.all(
    Array.from(
      { length: 4 },
      () =>
        edge("commands", begin, "candidate", "evidence-begin-001").then(data),
    ),
  );
  assert.equal(new Set(starts.map((v) => JSON.stringify(v))).size, 1);
  const bytes = Buffer.alloc(1048576 + 37);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 251;
  const hash = (b) => createHash("sha256").update(b).digest("hex"),
    parts = [bytes.subarray(0, 1048576), bytes.subarray(1048576)];
  const reserve = {
    action: "recording.reserve",
    data: {
      recording_id: recording,
      sequence: 1,
      start_ms: 0,
      end_ms: 5000,
      previous_hash: "0".repeat(64),
      byte_length: bytes.length,
      sha256: hash(bytes),
      parts: parts.map((b) => ({ byte_length: b.length, sha256: hash(b) })),
    },
  };
  const reservations = await Promise.all(
    Array.from(
      { length: 4 },
      () =>
        edge("commands", reserve, "candidate", "evidence-reserve-001").then(
          data,
        ),
    ),
  );
  assert.equal(new Set(reservations.map((v) => JSON.stringify(v))).size, 1);
  let head = reservations[0].head_hash;
  const url =
    `https://evidence-tests.invalid/v1/recordings/${recording}/segments/1`;
  const dispatch = (suffix, method = "GET", body, token = "candidate") =>
    worker.dispatchFetch(`${url}${suffix}?tenant_id=${tenant}`, {
      method,
      headers: { authorization: `Bearer ${token}`, origin },
      ...(body ? { body } : {}),
    });
  assert.equal((await dispatch("/complete", "POST")).status, 409);
  assert.equal((await dispatch("/parts/0", "PUT", parts[0])).status, 503);
  await worker.dispose();
  worker = new Miniflare(options);
  await worker.ready;
  await Promise.all(
    Array.from(
      { length: 4 },
      () => dispatch("/parts/0", "PUT", parts[0]).then(data),
    ),
  );
  await data(await dispatch("/parts/1", "PUT", parts[1]));
  assert.equal(
    sql(
      `select count(*) from proctor_recording_parts where recording_id='${recording}';`,
    ),
    "2",
  );
  assert.equal(
    (await dispatch("/parts/1", "PUT", Buffer.from([9]))).status,
    409,
  );
  assert.equal((await dispatch("/complete", "POST")).status, 503);
  await data(await dispatch("/complete", "POST"));
  assert.equal((await dispatch("", "GET", undefined, "candidate")).status, 404);
  assert.equal((await dispatch("", "GET", undefined, "foreign")).status, 404);
  const playback = await dispatch("", "GET", undefined, "owner");
  assert.equal(playback.status, 200);
  assert.equal(playback.headers.get("cache-control"), "no-store");
  assert.equal(
    playback.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.deepEqual(Buffer.from(await playback.arrayBuffer()), bytes);
  const bucket = await worker.getR2Bucket("EVIDENCE"),
    objects = await bucket.list();
  assert.equal(objects.objects.length, 2);
  const stored = await bucket.get(objects.objects[0].key),
    cipher = Buffer.from(await stored.arrayBuffer());
  assert.notDeepEqual(cipher.subarray(0, 32), bytes.subarray(0, 32));
  const gap = await data(
    await edge(
      "commands",
      {
        action: "recording.gap",
        data: {
          recording_id: recording,
          sequence: 2,
          start_ms: 5000,
          end_ms: 7000,
          previous_hash: head,
          reason: "Fixture camera interrupted",
        },
      },
      "candidate",
      "evidence-gap-001",
    ),
  );
  head = gap.head_hash;
  const timeline = await data(await edge(recording, undefined, "owner"));
  assert.equal(timeline.segments[1].kind, "gap");
  assert.equal(timeline.recording.provenance, "browser_reported");
  const corrupted = new Uint8Array(cipher);
  corrupted[0] ^= 1;
  await bucket.put(objects.objects[0].key, corrupted, {
    customMetadata: stored.customMetadata,
  });
  assert.equal((await dispatch("", "GET", undefined, "owner")).status, 502);
  await data(
    await edge(
      "commands",
      {
        action: "recording.close",
        data: {
          recording_id: recording,
          expected_sequence: 2,
          expected_hash: head,
          reason: "runtime_end",
        },
      },
      "candidate",
      "evidence-close-001",
    ),
  );
  assert.equal((await dispatch("/parts/0", "PUT", parts[0])).status, 422);
  assert.equal(
    sql(
      `select count(*) from assessment_audit_events where target_id='${recording}' and action='proctor.recording.segment.committed';`,
    ),
    "1",
  );
  process.stdout.write(
    "Passed actual local Proctor R2/production Edge/repository/PostgreSQL: concurrent begin/reserve/part replay, restart/lost replies, whole-segment verification, private reviewer playback, explicit gap, corruption rejection and sealing. Auth is synthetic; fixture bytes are not a decoded capture.\n",
  );
} finally {
  await worker?.dispose();
  if (started) {
    const inspect = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(inspect.Name, `/${container}`);
    assert.equal(
      inspect.Config.Labels["schood.assessment.test"],
      "proctor-evidence",
    );
    assert.equal(inspect.HostConfig.AutoRemove, true);
    assert.equal(inspect.Mounts.length, 1);
    assert.equal(inspect.Mounts[0].Type, "volume");
    docker(["stop", container]);
  }
  const resolved = path.resolve(directory), parent = path.resolve(tmpdir());
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith("schood-proctor-evidence-"));
  await rm(resolved, { recursive: true, force: true });
}
