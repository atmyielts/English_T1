import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  tenant = "10000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000001",
  candidate = "00000000-0000-4000-8000-000000000003",
  reviewer = "00000000-0000-4000-8000-000000000005",
  reviewer2 = "00000000-0000-4000-8000-000000000006",
  observer = "00000000-0000-4000-8000-000000000004";
export async function recordingBrowserStack() {
  const container = `schood-proctor-browser-${randomUUID().slice(0, 8)}`,
    directory = await mkdtemp(path.join(tmpdir(), "schood-proctor-browser-")),
    secret = "synthetic-evidence-" + randomUUID(),
    control = randomUUID(),
    tokens = new Map(),
    users = { owner, candidate, reviewer, reviewer2, observer };
  let worker,
    server,
    started = false,
    handler,
    base,
    session,
    sdk,
    loseReceipt = true,
    loseComplete = true,
    loseClose = true,
    loseFinding = true;
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
      delimiter = `$b_${randomUUID().replaceAll("-", "")}$`;
    } while (encoded.includes(delimiter));
    return `${delimiter}${encoded}${delimiter}`;
  }
  function query(statement) {
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
              message: match?.[2] ?? "Fixture query failed",
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
      child.stdin.end(`set role service_role;${statement}`);
    });
  }
  const database = {
    rpc(name, args) {
      assert.match(
        name,
        /^(proctor_recording_(command|read|transport|checkpoint|catalog)|proctor_(command|can_access)|assessment_has_capability)$/,
      );
      return query(
        `select to_jsonb(public.${name}(${
          Object.entries(args).map(([key, value]) => {
            assert.match(key, /^p_[a-z_]+$/);
            return `${key}=>${value === null ? "null" : literal(value)}${
              key === "p_data" ? "::jsonb" : ""
            }`;
          }).join(",")
        }));`,
      );
    },
    from(table) {
      assert.match(
        table,
        /^(proctor_[a-z_]+|assessment_(exam_windows|registrations|attempts)|tenant_memberships)$/,
      );
      return {
        select(columns) {
          let filters = [], limit = 1000, single = false;
          const q = {
            eq(field, value) {
              assert.match(field, /^[a-z_]+$/);
              filters.push([field, value]);
              return q;
            },
            limit(count) {
              assert.ok(count >= 1 && count <= 1000);
              limit = count;
              return q;
            },
            maybeSingle() {
              single = true;
              return q;
            },
            then(ok, fail) {
              const where = filters.map(([field, value]) =>
                `t.${field}=${literal(value)}`
              ).join(" and ");
              const projection = columns === "tenant_id,role,tenants(name)"
                ? "t.tenant_id,t.role,jsonb_build_object('name','Recording test center') as tenants"
                : "t.*";
              assert.ok(
                columns === "*" || columns === "tenant_id,role,tenants(name)",
              );
              return query(
                `select ${
                  single
                    ? "coalesce(jsonb_agg(row)->0,'null'::jsonb)"
                    : "coalesce(jsonb_agg(row),'[]')"
                } from (select ${projection} from public.${table} t ${
                  where ? "where " + where : ""
                } limit ${limit}) row;`,
              ).then(ok, fail);
            },
          };
          return q;
        },
      };
    },
  };
  const json = (value) => Response.json(value);
  async function route(req) {
    const url = new URL(req.url), pathname = url.pathname;
    if (pathname === "/test/config") {
      return json({
        base,
        tenant,
        session,
        control,
        tokens: Object.fromEntries(
          Object.entries(users).map((
            [name, id],
          ) => [
            name,
            [...tokens.entries()].find(([_token, user]) => user.id === id)[0],
          ]),
        ),
      });
    }
    if (pathname.startsWith("/test/control/")) {
      if (
        req.method !== "POST" ||
        req.headers.get("x-fixture-control") !== control
      ) return new Response("Denied", { status: 403 });
      const action = pathname.slice(14);
      if (action === "revoke") {
        sql(
          `update proctor_assignments set active=false where session_id='${session}' and user_id='${reviewer}';`,
        );
      } else if (action === "restore") {
        sql(
          `update proctor_assignments set active=true where session_id='${session}' and user_id='${reviewer}';`,
        );
      } else if (action === "finish") {
        const state = JSON.parse(
          sql(
            `select jsonb_build_object('recordings',(select count(*) from proctor_recordings),'committed',(select count(*) from proctor_recording_segments where kind='media' and state='committed'),'gaps',(select count(*) from proctor_recording_segments where kind='gap'),'parts',(select count(*) from proctor_recording_parts),'playbacks',(select count(*) from assessment_audit_events where action='proctor.recording.playback'),'findings',(select count(*) from proctor_case_findings),'citations',(select count(*) from proctor_recording_citations),'resolved',(select count(*) from proctor_review_cases where state='resolved' and disposition='insufficient_evidence'),'scores',(select count(*) from assessment_score_revisions),'citation_audits',(select count(*) from assessment_audit_events where action='proctor.recording.cited'));`,
          ),
        );
        assert.ok(
          state.recordings >= 1 && state.committed >= 2 && state.parts >= 2 &&
            state.playbacks >= 1,
        );
        assert.equal(state.findings, 2);
        assert.equal(state.citations, 4);
        assert.equal(state.resolved, 1);
        assert.equal(state.scores, 0);
        assert.equal(state.citation_audits, 2);
        return json(state);
      } else return new Response("Unknown fixture control", { status: 404 });
      return json({ ok: true });
    }
    if (pathname === "/test/capture.js") {
      return new Response(sdk, {
        headers: {
          "content-type": "text/javascript",
          "cache-control": "no-store",
        },
      });
    }
    if (pathname === "/test/capture") {
      return new Response(
        '<!doctype html><html lang="en"><head><title>Synthetic connected recording capture</title></head><body><h1>Synthetic connected recording capture</h1><p>No personal camera, microphone or screen is accessed.</p><script src="/test/capture.js"></script></body></html>',
        { headers: { "content-type": "text/html" } },
      );
    }
    if (pathname.startsWith("/auth/v1/")) {
      if (pathname.endsWith("/token")) {
        const data = await req.json(),
          name = String(data.email).split("@")[0],
          id = users[name];
        if (!id) return json({ error: "unknown synthetic identity" });
        const [access_token, user] = [...tokens.entries()].find((
          [_token, user],
        ) => user.id === id);
        return json({
          access_token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "synthetic-" + name,
          user,
        });
      }
      if (pathname.endsWith("/logout")) return json({});
      if (pathname.endsWith("/user")) {
        const user = tokens.get(
          (req.headers.get("authorization") ?? "").slice(7),
        );
        return user
          ? json(user)
          : new Response("Unauthorized", { status: 401 });
      }
      return new Response("Auth route not found", { status: 404 });
    }
    if (pathname.startsWith("/functions/v1/proctor/")) return handler(req);
    if (pathname.startsWith("/v1/recordings/")) {
      return worker.dispatchFetch(req.url, {
        method: req.method,
        headers: req.headers,
        ...(req.method === "PUT" ? { body: await req.arrayBuffer() } : {}),
      });
    }
    const relative = pathname === "/"
        ? "index.html"
        : decodeURIComponent(pathname.slice(1)),
      file = path.resolve(directory, "app", relative);
    if (!file.startsWith(path.resolve(directory, "app") + path.sep)) {
      return new Response("Denied", { status: 403 });
    }
    try {
      const bytes = await readFile(file),
        ext = path.extname(file),
        type = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".ttf": "font/ttf",
        }[ext] ?? "application/octet-stream";
      return new Response(bytes, {
        headers: { "content-type": type, "cache-control": "no-store" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }
  async function dispose() {
    if (server) await new Promise((resolve) => server.close(resolve));
    await worker?.dispose();
    if (started) {
      const info = JSON.parse(docker(["inspect", container]))[0];
      assert.equal(info.Name, `/${container}`);
      assert.equal(
        info.Config.Labels["schood.assessment.test"],
        "proctor-browser",
      );
      assert.equal(info.HostConfig.AutoRemove, true);
      assert.ok(info.Mounts.every((m) => m.Type === "volume"));
      docker(["stop", container]);
    }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("schood-proctor-browser-"));
    await rm(directory, { recursive: true, force: true });
  }
  try {
    docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "--label",
      "schood.assessment.test=proctor-browser",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:16-alpine",
    ]);
    started = true;
    let ready = false;
    for (let i = 0; i < 30; i++) {
      if (
        spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"])
          .status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready);
    for (
      const file of [
        "supabase/tests/assessment-cloud.fixture.sql",
        ...[
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
        ].map((n) => `supabase/migrations/${n}.sql`),
        "supabase/tests/assessment-stack.fixture.sql",
      ]
    ) sql(await readFile(path.join(root, file), "utf8"));
    sql(
      `insert into users values('${reviewer}'),('${reviewer2}');insert into tenant_memberships values('${tenant}','${reviewer}','active','member'),('${tenant}','${reviewer2}','active','member'),('${tenant}','${observer}','active','member');`,
    );
    session = sql(
      `with pol as (insert into proctor_policies(tenant_id,title,policy,created_by) values('${tenant}','Capture fixture','{"schema_version":"proctor.policy.v1","mode":"browser","camera":true,"screen":true,"microphone":false,"second_camera":false,"identity_level":0,"reviewer_quorum":2}','${owner}') returning *),prep as (insert into proctor_preparations(tenant_id,registration_id,candidate_id,policy_id) select '${tenant}',a.registration_id,'${candidate}',pol.id from assessment_attempts a,pol where a.id=(select id from stack_test_ids where name='delivery')) insert into proctor_sessions(tenant_id,attempt_id,candidate_id,policy_id,policy_snapshot) select '${tenant}',(select id from stack_test_ids where name='delivery'),'${candidate}',pol.id,pol.policy from pol returning id;`,
    ).split("\n")[0];
    assert.match(session, /^[a-f0-9-]{36}$/);
    sql(
      `select proctor_command('${owner}','${tenant}','fixture-grant-review','capability.grant','{"user_id":"${reviewer}","capability":"proctor.review"}');select proctor_command('${owner}','${tenant}','fixture-review-assign','session.assign','{"session_id":"${session}","user_id":"${reviewer}","assignment_role":"reviewer"}');select proctor_command('${owner}','${tenant}','fixture-grant-observe','capability.grant','{"user_id":"${observer}","capability":"proctor.observe"}');select proctor_command('${owner}','${tenant}','fixture-observe-assign','session.assign','{"session_id":"${session}","user_id":"${observer}","assignment_role":"observer"}');grant select on tenant_memberships to service_role;`,
    );
    for (const [name, id] of Object.entries(users)) {
      if (name === "reviewer2") {
        sql(
          `select proctor_command('${owner}','${tenant}','fixture-grant-review-two','capability.grant','{"user_id":"${reviewer2}","capability":"proctor.review"}');select proctor_command('${owner}','${tenant}','fixture-review-two-assign','session.assign','{"session_id":"${session}","user_id":"${reviewer2}","assignment_role":"reviewer"}');`,
        );
      }
      const user = {
          id,
          email: name + "@example.test",
          aud: "authenticated",
          role: "authenticated",
          user_metadata: {},
          app_metadata: {},
          created_at: new Date().toISOString(),
        },
        encode = (value) =>
          Buffer.from(JSON.stringify(value)).toString("base64url"),
        token = encode({ alg: "HS256", typ: "JWT" }) + "." +
          encode({
            sub: id,
            role: "authenticated",
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
          }) + ".synthetic-only";
      tokens.set(token, user);
    }
    server = createServer(async (req, res) => {
      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 1048576) {
            res.statusCode = 413;
            res.end();
            return;
          }
          chunks.push(chunk);
        }
        const request = new Request(base + req.url, {
            method: req.method,
            headers: req.headers,
            ...(["GET", "HEAD"].includes(req.method)
              ? {}
              : { body: Buffer.concat(chunks) }),
          }),
          response = await route(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const edge = await build({
        stdin: {
          contents:
            "export {createRecordingHandler} from './supabase/functions/proctor/recording-handler.ts';export {createRecordingRepository} from './supabase/functions/proctor/recording-repository.ts';export {createProctorHandler} from './supabase/functions/proctor/handler.ts';export {createProctorRepository} from './supabase/functions/proctor/repository.ts';",
          resolveDir: root,
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "esm",
        platform: "node",
        target: "es2022",
      }),
      modules = await import(
        `data:text/javascript;base64,${
          Buffer.from(edge.outputFiles[0].text).toString("base64")
        }`
      ),
      user = async (token) => tokens.get(token)?.id ?? null,
      recordings = modules.createRecordingHandler(
        modules.createRecordingRepository(user, database),
        [base],
        { enabled: true, transportSecret: secret },
      ),
      main = modules.createProctorHandler(
        modules.createProctorRepository(user, database),
        [base],
      );
    handler = (req) =>
      new URL(req.url).pathname.includes("/proctor/recordings/")
        ? recordings(req)
        : main(req);
    const options = {
      modules: true,
      scriptPath: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
      compatibilityDate: "2026-07-30",
      r2Buckets: ["EVIDENCE"],
      r2Persist: path.join(directory, "r2"),
      bindings: {
        SUPABASE_URL: "https://canonical-proctor-fixture.invalid",
        SUPABASE_ANON_KEY: "synthetic-anon",
        PROCTOR_EVIDENCE_SECRET: secret,
        EVIDENCE_ACTIVE_KEY_ID: "fixture-k1",
        EVIDENCE_KEYRING: JSON.stringify({ "fixture-k1": "c".repeat(64) }),
        ALLOWED_ORIGINS: base,
      },
      outboundService: async (req) => {
        assert.equal(
          new URL(req.url).hostname,
          "canonical-proctor-fixture.invalid",
        );
        const body = await req.clone().json(), response = await recordings(req);
        if (
          response.ok &&
          ((body.action === "part.receipt" && loseReceipt) ||
            (body.action === "segment.complete" && loseComplete))
        ) {
          if (body.action === "part.receipt") loseReceipt = false;
          else loseComplete = false;
          return Response.json({
            code: "synthetic_lost_reply",
            error: "Committed reply lost",
          }, { status: 503 });
        }
        return response;
      },
    };
    worker = new Miniflare(options);
    await worker.ready;
    const original = handler;
    handler = async (req) => {
      const body = req.method === "POST" ? await req.clone().json() : null,
        response = await original(req);
      if (response.ok && body?.action === "recording.close" && loseClose) {
        loseClose = false;
        return Response.json({
          code: "synthetic_lost_reply",
          error: "Committed close reply lost",
        }, { status: 503 });
      }
      if (response.ok && body?.action === "case.finding" && loseFinding) {
        loseFinding = false;
        return Response.json({
          code: "synthetic_lost_reply",
          error: "Committed finding reply lost",
        }, { status: 503 });
      }
      return response;
    };
    const capture = await build({
      stdin: {
        contents:
          "export {CaptureRecorder} from './packages/proctor-web/src/capture.ts';export {CaptureJournal} from './packages/proctor-web/src/capture-journal.ts';export {CaptureUploads} from './packages/proctor-web/src/capture-runtime.ts';",
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "iife",
      globalName: "ProctorCaptureFixture",
      platform: "browser",
      target: "es2022",
    });
    sdk = capture.outputFiles[0].text;
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        path.join(root, "node_modules/vite/bin/vite.js"),
        "build",
        "--outDir",
        path.join(directory, "app"),
      ], {
        cwd: path.join(root, "apps/proctor"),
        env: {
          ...process.env,
          VITE_SUPABASE_URL: base,
          VITE_SUPABASE_ANON_KEY: "synthetic-anon",
          VITE_PROCTOR_EVIDENCE_URL: base,
          VITE_AUTH_SHARED_COOKIE: "false",
          VITE_AUTH_COOKIE_DOMAIN: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let error = "";
      child.stderr.on("data", (c) => error += c);
      child.on("error", reject);
      child.on(
        "close",
        (code) => code === 0 ? resolve() : reject(new Error(error)),
      );
    });
    return { base, control, dispose };
  } catch (cause) {
    await dispose();
    throw cause;
  }
}
