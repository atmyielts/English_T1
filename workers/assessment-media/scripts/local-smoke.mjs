import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFile, writeFile, stat, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  container = `schood-artifact-test-${randomUUID().slice(0, 8)}`,
  directory = await mkdtemp(path.join(tmpdir(), "schood-artifact-test-"));
const tenant = "10000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000001",
  foreign = "00000000-0000-4000-8000-000000000004",
  mediaSecret = "synthetic-media-" + "a".repeat(32),
  scannerSecret = "synthetic-scanner-" + "b".repeat(32),
  origin = "https://assessment-tests.invalid";
let worker,
  started = false,
  loseReceipt = true;
const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAIklEQVR4nGP8/+ESAzUAE1VMGTVo1KBRg0YNGjVo1CCKAAB/uALxjJNMrgAAAABJRU5ErkJggg==",
    "base64",
  ),
  digest = createHash("sha256").update(bytes).digest("hex");
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60000,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
}
const sql = (query) =>
  docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    query,
  );
function literal(value) {
  const encoded = typeof value === "string" ? value : JSON.stringify(value);
  let delimiter;
  do {
    delimiter = `$a_${randomUUID().replaceAll("-", "")}$`;
  } while (encoded.includes(delimiter));
  return `${delimiter}${encoded}${delimiter}`;
}
async function rpc(name, args) {
  assert.match(
    name,
    /^assessment_artifact_(read|command|transport|scan_claim|scan_bundle|scan_report)$/,
  );
  const values = Object.entries(args).map(([key, value]) => {
    assert.match(key, /^p_[a-z_]+$/);
    return `${key}=>${value === null ? "null" : literal(value)}${["p_data", "p_report"].includes(key) ? "::jsonb" : ""}`;
  });
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
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
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const match = /ERROR:\s+([A-Z0-9]{5}):\s+([^\r\n]+)/.exec(error);
        resolve({
          data: null,
          error: {
            code: match?.[1],
            message: match?.[2] ?? "Test database RPC failed",
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
  for (const file of [
    "supabase/tests/assessment-cloud.fixture.sql",
    "supabase/migrations/20261013100000_assessment_cloud_core.sql",
    "supabase/migrations/20261013110000_proctor_control_plane.sql",
    "supabase/migrations/20261013120000_proctor_candidate_delivery.sql",
    "supabase/migrations/20261013130000_assessment_runtime.sql",
    "supabase/migrations/20261013140000_assessment_recovery_schedule.sql",
    "supabase/migrations/20261013150000_assessment_grading.sql",
    "supabase/migrations/20261014090000_assessment_staff.sql",
    "supabase/migrations/20261014100000_assessment_design.sql",
    "supabase/migrations/20261014110000_assessment_artifacts.sql",
    "supabase/tests/assessment-stack.fixture.sql",
  ])
    sql(await readFile(path.join(root, file), "utf8"));
  const bundle = await build({
    stdin: {
      contents:
        "export {createArtifactHandler} from './supabase/functions/assessment-cloud/artifact-handler.ts';export {createArtifactRepository} from './supabase/functions/assessment-cloud/artifact-repository.ts';",
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
  });
  const { createArtifactHandler, createArtifactRepository } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const auth = {
      auth: {
        getUser: async (token) => ({
          data: {
            user:
              token === "owner"
                ? { id: owner }
                : token === "foreign"
                  ? { id: foreign }
                  : null,
          },
          error: null,
        }),
      },
    },
    handler = createArtifactHandler(
      createArtifactRepository(auth, { rpc }),
      [origin],
      {
        transport: mediaSecret,
        scanner: scannerSecret,
        scannerId: "synthetic-scanner",
      },
    );
  async function edge(path, body, headers = {}) {
    return handler(
      new Request(
        `https://canonical-tests.invalid/functions/v1/assessment-cloud/artifacts/${path}?tenant_id=${tenant}`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer owner",
            "content-type": "application/json",
            "idempotency-key": "artifact-local-begin-001",
            ...headers,
          },
          body: JSON.stringify(body),
        },
      ),
    );
  }
  async function data(response) {
    const json = await response.json();
    assert.equal(response.status, 200, JSON.stringify(json));
    return json.data;
  }
  const options = {
    modules: true,
    scriptPath: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
    compatibilityDate: "2026-07-30",
    r2Buckets: ["ARTIFACTS"],
    r2Persist: directory,
    bindings: {
      SUPABASE_URL: "https://canonical-tests.invalid",
      SUPABASE_ANON_KEY: "synthetic-anon",
      ASSESSMENT_MEDIA_SECRET: mediaSecret,
      ASSESSMENT_SCANNER_SECRET: scannerSecret,
      ARTIFACT_ACTIVE_KEY_ID: "test-k1",
      ARTIFACT_KEYRING: JSON.stringify({ "test-k1": "c".repeat(64) }),
      ALLOWED_ORIGINS: origin,
    },
    outboundService: async (req) => {
      assert.equal(new URL(req.url).hostname, "canonical-tests.invalid");
      const cloned = req.clone(),
        body = await cloned.json(),
        response = await handler(req);
      if (body.action === "chunk.receipt" && response.ok && loseReceipt) {
        loseReceipt = false;
        return Response.json(
          {
            code: "synthetic_ack_loss",
            error: "Synthetic receipt lost after commit",
          },
          { status: 503 },
        );
      }
      return response;
    },
  };
  worker = new Miniflare(options);
  const upload = {
    filename: "Institution image.png",
    mime: "image/png",
    byte_length: bytes.length,
    parts: [{ sha256: digest, byte_length: bytes.length }],
  };
  const begun = await data(
      await edge("commands", { action: "upload.begin", data: upload }),
    ),
    artifact = begun.id;
  const endpoint = `https://media-tests.invalid/v1/artifacts/${artifact}?tenant_id=${tenant}`,
    partEndpoint = `https://media-tests.invalid/v1/artifacts/${artifact}/parts/0?tenant_id=${tenant}`,
    headers = { authorization: "Bearer owner", origin };
  assert.equal(
    (
      await worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers: { authorization: "Bearer invalid", origin },
        body: bytes,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers: { ...headers, origin: "https://foreign.invalid" },
        body: bytes,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers,
        body: new Uint8Array([1, 2, 3]),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers,
        body: bytes,
      })
    ).status,
    503,
  );
  const canonical = JSON.parse(
    sql(
      `select to_jsonb(p) from assessment_artifact_parts p where artifact_id='${artifact}';`,
    ),
  );
  let bucket = await worker.getR2Bucket("ARTIFACTS");
  const stored = await bucket.get(canonical.object_key),
    cipher = await stored.arrayBuffer(),
    storedMetadata = { ...stored.customMetadata };
  assert.notDeepEqual(Buffer.from(cipher), bytes);
  assert.equal(storedMetadata.iv, canonical.iv);
  assert.equal(stored.size, bytes.length + 16);
  for (const response of await Promise.all(
    Array.from({ length: 4 }, () =>
      worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers,
        body: bytes,
      }),
    ),
  ))
    assert.equal(response.status, 200);
  assert.equal(
    sql(
      `select count(*) from assessment_artifact_parts where artifact_id='${artifact}';`,
    ),
    "1",
  );
  assert.equal((await bucket.list()).objects.length, 1);
  assert.equal((await bucket.head(canonical.object_key)).etag, canonical.etag);
  await worker.dispose();
  worker = new Miniflare(options);
  bucket = await worker.getR2Bucket("ARTIFACTS");
  assert.equal(
    (
      await worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers,
        body: bytes,
      })
    ).status,
    200,
  );
  const completed = await data(
    await worker.dispatchFetch(
      `https://media-tests.invalid/v1/artifacts/${artifact}/complete?tenant_id=${tenant}`,
      { method: "POST", headers },
    ),
  );
  assert.equal(completed.state, "quarantined");
  assert.equal((await worker.dispatchFetch(endpoint, { headers })).status, 422);
  assert.equal(
    (
      await edge(
        "scan/claim",
        { limit: 1 },
        { "x-assessment-scanner-key": mediaSecret },
      )
    ).status,
    403,
  );
  const tickets = await data(
      await edge(
        "scan/claim",
        { limit: 1 },
        { "x-assessment-scanner-key": scannerSecret },
      ),
    ),
    ticket = tickets[0];
  assert.equal(ticket.artifact_id, artifact);
  const scanEndpoint = `https://media-tests.invalid/internal/scan/${ticket.job_id}?lease_token=${ticket.lease_token}`;
  assert.equal(
    (
      await worker.dispatchFetch(scanEndpoint, {
        headers: { authorization: "Bearer owner" },
      })
    ).status,
    403,
  );
  const scanBytes = await worker.dispatchFetch(scanEndpoint, {
    headers: { "x-assessment-scanner-key": scannerSecret },
  });
  assert.equal(scanBytes.status, 200);
  const downloaded = Buffer.from(await scanBytes.arrayBuffer());
  assert.deepEqual(downloaded, bytes);
  let realVerdict = null;
  if (process.env.ASSESSMENT_SCANNER_DATABASE) {
    const database = path.resolve(process.env.ASSESSMENT_SCANNER_DATABASE),
      artifactFile = path.join(directory, "scanner-artifact");
    assert.ok((await stat(database)).isDirectory());
    assert.ok(!database.includes(","));
    await writeFile(artifactFile, downloaded);
    const args = [
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "64",
      "--memory",
      "4g",
      "--cpus",
      "2",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=256m",
      "--mount",
      `type=bind,src=${database},dst=/signatures,readonly`,
      "--mount",
      `type=bind,src=${artifactFile},dst=/work/artifact,readonly`,
    ];
    if (process.getuid)
      args.push("--user", `${process.getuid()}:${process.getgid()}`);
    args.push(
      process.env.ASSESSMENT_SCANNER_IMAGE ?? "schood-assessment-scanner-local",
      "--inspect",
      "/work/artifact",
      "--mime",
      "image/png",
      "--database",
      "/signatures",
    );
    realVerdict = await new Promise((resolve, reject) => {
      const child = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "",
        error = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Real scanner timed out"));
      }, 150000);
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.length > 100000) child.kill();
      });
      child.stderr.on("data", (chunk) => (error += chunk));
      child.on("error", (cause) => {
        clearTimeout(timer);
        reject(cause);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(error || "Real scanner failed"));
          return;
        }
        try {
          resolve(JSON.parse(output));
        } catch (cause) {
          reject(cause);
        }
      });
    });
    assert.equal(realVerdict.verdict, "clean");
    assert.equal(realVerdict.decoder_checked, true);
    assert.equal(realVerdict.detected_mime, "image/png");
  }
  const report = {
    job_id: ticket.job_id,
    lease_token: ticket.lease_token,
    manifest_hash: ticket.manifest_hash,
    verdict: "clean",
    detected_mime: "image/png",
    decoder_checked: true,
    scanner_id: "synthetic-scanner",
    scanner_version: realVerdict?.engine_version ?? "synthetic-fixture-1",
    signature_version: realVerdict?.signature_version ?? "synthetic-fixture-1",
    report_hash: realVerdict
      ? createHash("sha256").update(JSON.stringify(realVerdict)).digest("hex")
      : "f".repeat(64),
  };
  assert.equal(
    (
      await edge(
        "scan/report",
        { ...report, decoder_checked: false },
        { "x-assessment-scanner-key": scannerSecret },
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await data(
        await edge("scan/report", report, {
          "x-assessment-scanner-key": scannerSecret,
        }),
      )
    ).state,
    "ready",
  );
  assert.equal(
    (
      await data(
        await edge("scan/report", report, {
          "x-assessment-scanner-key": scannerSecret,
        }),
      )
    ).state,
    "ready",
  );
  const full = await worker.dispatchFetch(endpoint, { headers });
  assert.equal(full.headers.get("content-type"), "image/png");
  assert.equal(full.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
  const cookieHeaders = {
    origin,
    cookie: `schood-auth=${encodeURIComponent(JSON.stringify({ access_token: "owner", expires_at: Math.floor(Date.now() / 1000) + 60 }))}`,
  };
  const native = await worker.dispatchFetch(endpoint, {
    headers: cookieHeaders,
  });
  assert.equal(native.status, 200);
  assert.equal(native.headers.get("access-control-allow-origin"), origin);
  assert.equal(native.headers.get("access-control-allow-credentials"), "true");
  assert.equal(native.headers.get("cross-origin-resource-policy"), "same-site");
  assert.deepEqual(Buffer.from(await native.arrayBuffer()), bytes);
  assert.equal(
    (
      await worker.dispatchFetch(partEndpoint, {
        method: "PUT",
        headers: cookieHeaders,
        body: bytes,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await worker.dispatchFetch(endpoint, {
        headers: { ...cookieHeaders, authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await worker.dispatchFetch(endpoint, {
        headers: { ...cookieHeaders, "sec-fetch-site": "cross-site" },
      })
    ).status,
    401,
  );
  const ranged = await worker.dispatchFetch(endpoint, {
    headers: { ...headers, range: "bytes=2-6" },
  });
  assert.equal(ranged.status, 206);
  assert.deepEqual(
    Buffer.from(await ranged.arrayBuffer()),
    bytes.subarray(2, 7),
  );
  assert.equal(
    (
      await worker.dispatchFetch(endpoint, {
        headers: { ...headers, range: "bytes=9999-" },
      })
    ).status,
    416,
  );
  assert.equal(
    (
      await worker.dispatchFetch(endpoint, {
        headers: { authorization: "Bearer foreign", origin },
      })
    ).status,
    403,
  );
  sql(
    `update tenant_memberships set status='inactive' where tenant_id='${tenant}' and user_id='${owner}';`,
  );
  assert.equal((await worker.dispatchFetch(endpoint, { headers })).status, 403);
  assert.equal(
    (await worker.dispatchFetch(endpoint, { headers: cookieHeaders })).status,
    403,
  );
  sql(
    `update tenant_memberships set status='active' where tenant_id='${tenant}' and user_id='${owner}';`,
  );
  const tampered = new Uint8Array(cipher.slice(0));
  tampered[0] ^= 1;
  await bucket.put(canonical.object_key, tampered.buffer, {
    customMetadata: storedMetadata,
  });
  const corrupt = await worker.dispatchFetch(endpoint, { headers });
  assert.equal(corrupt.status, 502);
  assert.equal((await corrupt.json()).code, "artifact_integrity_failed");
  process.stdout.write(
    `Passed real local workerd/R2 AES-GCM -> artifact handler/repository -> PostgreSQL: pinned upload manifest, ciphertext-only storage, conditional concurrent retries, lost committed receipt and restart recovery, quarantine, isolated scanner delivery/report lease, credentialed native and bearer range reads, current/foreign authority denial and corrupt-cipher rejection. ${realVerdict ? "Actual networkless ClamAV and complete PNG decoder verdict with verified official signatures." : "Scanner verdict is synthetic."} Auth is synthetic; no hosted acceptance.\n`,
  );
} finally {
  if (worker) await worker.dispose();
  if (started) docker(["rm", "-f", container]);
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("schood-artifact-test-"));
  await rm(directory, { recursive: true, force: true });
}
