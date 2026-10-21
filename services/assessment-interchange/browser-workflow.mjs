import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  convertV4MiniflareOptions,
  Miniflare,
  Response as RuntimeResponse,
} from "miniflare";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createQtiHandler } from "../../supabase/functions/assessment-cloud/qti-handler.ts";
import { createQtiRepository } from "../../supabase/functions/assessment-cloud/qti-repository.ts";
import { createImportHandler } from "../../supabase/functions/assessment-cloud/import-handler.ts";
import { createImportRepository } from "../../supabase/functions/assessment-cloud/import-repository.ts";
import { createHandler } from "../../supabase/functions/assessment-cloud/handler.ts";
import { createAssessmentRepository } from "../../supabase/functions/assessment-cloud/repository.ts";
import { createGradingHandler } from "../../supabase/functions/assessment-cloud/grading-handler.ts";
import { createGradingRepository } from "../../supabase/functions/assessment-cloud/grading-repository.ts";
import { browserDatabase } from "./browser-database.mjs";
import { processingClient } from "./process.mjs";
import { runProcessor } from "./worker.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const npx = [
  process.env.npm_execpath
    ? path.join(path.dirname(process.env.npm_execpath), "npx-cli.js")
    : "",
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"),
  path.resolve(
    path.dirname(process.execPath),
    "../lib/node_modules/npm/bin/npx-cli.js",
  ),
].find((value) => value && existsSync(value));
function command(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let output = "", error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on(
      "close",
      (code) =>
        code === 0 ? resolve(output) : reject(new Error(error || output)),
    );
  });
}
export async function realBrowserWorkflow(
  { sql, db, service, cfg, bank, built, tenant, actor },
) {
  assert.ok(npx, "Installed npm/npx runtime required.");
  const parent = await realpath(tmpdir()),
    directory = await mkdtemp(path.join(parent, "schood-qti-browser-"));
  const session = "qti-connected-" + randomUUID().slice(0, 8),
    stop = new AbortController(),
    jobs = new Map();
  let worker,
    server,
    base,
    busyJob = null,
    qti,
    imports,
    author,
    grading,
    ports;
  let loseBegin = true,
    losePart = true,
    loseAdoption = true,
    loseConfirm = true;
  const exp = Math.floor(Date.now() / 1000) + 3600,
    token = Buffer.from('{"alg":"HS256"}').toString("base64url") + "." +
      Buffer.from(JSON.stringify({ sub: actor, exp, role: "authenticated" }))
        .toString("base64url") +
      ".fixture-signature";
  const auth = {
    auth: {
      async getUser(value) {
        return {
          data: { user: value === token ? { id: actor } : null },
          error: null,
        };
      },
    },
  };
  const database = browserDatabase(service, db),
    cli = (args) =>
      command([
        npx,
        "--yes",
        "--package",
        "@playwright/cli",
        "playwright-cli",
        "-s=" + session,
        ...args,
      ]);
  function json(res, status, payload) {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(payload));
  }
  async function reply(res, response) {
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }
  const packages = { clean: built.bytes };
  const malwareFiles = unzipSync(built.bytes);
  malwareFiles["eicar.txt"] = strToU8(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  packages.malware = new Uint8Array(zipSync(malwareFiles));
  const xmlFiles = unzipSync(built.bytes);
  xmlFiles["imsmanifest.xml"] = strToU8("<!DOCTYPE manifest><manifest/>");
  packages.xml = new Uint8Array(zipSync(xmlFiles));
  // All private tables are server-only; this minimal historical spine models
  // the real service-role read grants, never browser table access.
  async function processRound(key) {
    if (jobs.has(key)) return jobs.get(key);
    if (busyJob?.state === "running") {
      throw new Error("Another fixture processing job is active.");
    }
    const job = {
      id: randomUUID(),
      key,
      state: "running",
      events: [],
      task: null,
    };
    jobs.set(key, job);
    busyJob = job;
    job.task = runProcessor({
      ports,
      signal: stop.signal,
      once: true,
      publish: (event) => job.events.push(event),
    }).then(() => {
      job.state = job.events.some((event) => event.event.endsWith("failed"))
        ? "failed"
        : "completed";
    }).catch(() => {
      job.state = "failed";
    });
    return job;
  }
  try {
    sql("grant select on all tables in schema public to service_role;");
    const capability = await service.rpc("assessment_has_capability", {
      p_tenant: tenant,
      p_user: actor,
      p_capability: "banks.read",
    });
    assert.equal(capability.error, null, JSON.stringify(capability.error));
    assert.equal(capability.data, true);
    const banks = await database.from("assessment_item_banks").select("*").eq(
      "tenant_id",
      tenant,
    ).limit(1000);
    assert.equal(banks.error, null, JSON.stringify(banks.error));
    assert.ok(banks.data.some((row) => row.id === bank));
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, base || "http://127.0.0.1"), chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 6 * 1048576) {
            json(res, 413, { error: "Fixture body exceeds bound." });
            return;
          }
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks),
          headers = { ...req.headers },
          request = () =>
            new Request(base + req.url, {
              method: req.method,
              headers,
              ...(body.length ? { body } : {}),
            });
        if (url.pathname === "/test/info") {
          json(res, 200, {
            tenant,
            actor,
            bank,
            source_hash: built.sha256,
            prompt: "Reviewed imported choice",
          });
          return;
        }
        if (url.pathname === "/test/package") {
          const bytes = packages[url.searchParams.get("kind") ?? "clean"];
          assert.ok(bytes);
          res.writeHead(200, {
            "content-type": "application/zip",
            "cache-control": "no-store",
          });
          res.end(Buffer.from(bytes));
          return;
        }
        if (url.pathname === "/test/process" && req.method === "POST") {
          const key = JSON.parse(body).key;
          assert.match(key, /^[a-z-]{1,50}$/);
          const job = await processRound(key);
          json(res, 200, { id: job.id, state: job.state });
          return;
        }
        if (url.pathname.startsWith("/test/process/") && req.method === "GET") {
          const job = [...jobs.values()].find((job) =>
            job.id === url.pathname.split("/").at(-1)
          );
          assert.ok(job);
          json(res, 200, { id: job.id, state: job.state, events: job.events });
          return;
        }
        if (url.pathname === "/test/revoke" && req.method === "POST") {
          sql(
            `update tenant_memberships set status='inactive' where tenant_id='${tenant}' and user_id='${actor}';`,
          );
          json(res, 200, { revoked: true });
          return;
        }
        if (url.pathname === "/test/proof") {
          const result = await db.query(
            `select jsonb_build_object('sources',(select count(*) from assessment_qti_jobs),'reports',(select count(*) from assessment_qti_reports),'adoptions',(select count(*) from assessment_qti_adoptions),'imports',(select count(*) from assessment_bank_imports),'drafts',(select count(*) from assessment_item_versions where status='draft' and approved_by is null),'approved',(select count(*) from assessment_item_versions where approved_by is not null),'commands',(select jsonb_object_agg(action,n) from(select request->>'action' action,count(*) n from assessment_qti_commands group by request->>'action')x),'scans',(select jsonb_agg(jsonb_build_object('state',j.state,'filename',j.filename,'source_hash',j.source_hash,'verdict',r.payload->>'verdict','performed',r.payload->'scan_performed','observed',r.payload->>'observed_source_hash','engine',r.payload->>'engine_version','parse_reports',(select count(*) from assessment_qti_reports p where p.job_id=j.id and p.stage='parse'))) from assessment_qti_jobs j left join assessment_qti_reports r on r.job_id=j.id and r.stage='scan'),'source_completed_audits',(select count(*) from assessment_audit_events where action='qti.source.completed'),'adopt_audits',(select count(*) from assessment_audit_events where action='qti.adopt'));`,
          );
          assert.equal(result.error, null);
          json(res, 200, result.data);
          return;
        }
        if (url.pathname.startsWith("/auth/v1/")) {
          if (url.pathname.endsWith("/token")) {
            json(res, 200, {
              access_token: token,
              refresh_token: "fixture-refresh",
              expires_in: 3600,
              expires_at: exp,
              token_type: "bearer",
              user: {
                id: actor,
                aud: "authenticated",
                email: "author@example.test",
                app_metadata: {},
                user_metadata: {},
              },
            });
            return;
          }
          json(
            res,
            200,
            url.pathname.endsWith("/user")
              ? { id: actor, email: "author@example.test" }
              : {},
          );
          return;
        }
        if (url.pathname.startsWith("/v1/qti/")) {
          await reply(
            res,
            await worker.dispatchFetch(base + req.url, {
              method: req.method,
              headers,
              ...(body.length ? { body } : {}),
            }),
          );
          return;
        }
        const api = "/functions/v1/assessment-cloud/";
        if (url.pathname.startsWith(api)) {
          const route = url.pathname.slice(api.length),
            endpoint = route.startsWith("qti/")
              ? qti
              : route.startsWith("imports/")
              ? imports
              : route.startsWith("grading/")
              ? grading
              : author;
          const response = await endpoint(request());
          if (response.ok && req.method === "POST") {
            const action = JSON.parse(body).action;
            const lost = (action === "source.begin" && loseBegin) ||
              (action === "adopt" && loseAdoption) ||
              (route === "imports/commands" && action === "confirm" &&
                loseConfirm);
            if (lost) {
              if (action === "source.begin") loseBegin = false;
              else if (action === "adopt") loseAdoption = false;
              else loseConfirm = false;
              json(res, 503, {
                code: "fixture_reply_lost",
                error:
                  "The canonical request committed but its response was lost. Retry the saved request.",
              });
              return;
            }
          }
          await reply(res, response);
          return;
        }
        const pathname = url.pathname === "/"
            ? "index.html"
            : decodeURIComponent(url.pathname).replace(/^\//, ""),
          target = path.resolve(directory, "app", pathname);
        if (
          !target.startsWith(path.join(directory, "app") + path.sep) ||
          !/\.(html|js|css|ttf|txt|svg)$/.test(target)
        ) {
          json(res, 404, { error: "Fixture route not found." });
          return;
        }
        const type = target.endsWith(".js")
          ? "text/javascript"
          : target.endsWith(".css")
          ? "text/css"
          : target.endsWith(".ttf")
          ? "font/ttf"
          : target.endsWith(".svg")
          ? "image/svg+xml"
          : "text/html";
        res.writeHead(200, { "content-type": type });
        res.end(await readFile(target));
      } catch (cause) {
        if (!res.headersSent) {
          json(res, 500, {
            error: "Connected QTI fixture failed.",
            detail: String(cause.message),
          });
        } else res.destroy();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    qti = createQtiHandler(createQtiRepository(auth, service), [base], cfg);
    imports = createImportHandler(createImportRepository(auth, service), [
      base,
    ]);
    author = createHandler({
      repository: createAssessmentRepository(auth, database),
      allowedOrigins: [base],
    });
    grading = createGradingHandler(createGradingRepository(auth, service), [
      base,
    ]);
    worker = new Miniflare({
      ...convertV4MiniflareOptions({
        name: "qti-browser-source",
        modules: true,
        script: await readFile(
          new URL(
            "../../workers/assessment-qti/dist/index.js",
            import.meta.url,
          ),
          "utf8",
        ),
        compatibilityDate: "2026-10-20",
        r2Buckets: ["SOURCES"],
        bindings: {
          QTI_ENABLED: "true",
          SUPABASE_URL: "https://canonical.qti.test",
          SUPABASE_ANON_KEY: "fixture-only",
          QTI_TRANSPORT_SECRET: cfg.transportKey,
          QTI_SCANNER_SECRET: cfg.scannerKey,
          QTI_PARSER_SECRET: cfg.parserKey,
          QTI_ACTIVE_KEY_ID: "qti-browser-k1",
          QTI_KEYRING: JSON.stringify({
            "qti-browser-k1": randomBytes(32).toString("hex"),
          }),
          ALLOWED_ORIGINS: base,
        },
        outboundService: async (req) => {
          assert.equal(new URL(req.url).hostname, "canonical.qti.test");
          const raw = await req.json(),
            response = await qti(
              new Request(req.url, {
                method: req.method,
                headers: Object.fromEntries(req.headers),
                body: JSON.stringify(raw),
              }),
            );
          if (response.ok && raw.action === "part.receipt" && losePart) {
            losePart = false;
            return RuntimeResponse.json({
              code: "fixture_part_reply_lost",
              error:
                "The package part was saved but its receipt reply was lost. Resume the same file.",
            }, { status: 503 });
          }
          return new RuntimeResponse(await response.arrayBuffer(), {
            status: response.status,
            headers: Object.fromEntries(response.headers),
          });
        },
      }),
      resourcePersistencePath: path.join(directory, "r2"),
    });
    ports = processingClient({
      apiURL: "https://canonical.qti.test",
      sourceURL: "https://source.qti.test",
      scannerKey: cfg.scannerKey,
      parserKey: cfg.parserKey,
      anonKey: "fixture-only",
      fetcher: (url, init) =>
        new URL(url).hostname === "canonical.qti.test"
          ? qti(new Request(url, init))
          : worker.dispatchFetch(url, init),
    });
    await command([
      "node_modules/vite/bin/vite.js",
      "build",
      "apps/assessment-cloud",
      "--outDir",
      path.join(directory, "app"),
    ], {
      env: {
        ...process.env,
        VITE_SUPABASE_URL: base,
        VITE_SUPABASE_ANON_KEY: "fixture-only",
        VITE_ASSESSMENT_QTI_URL: base,
        VITE_AUTH_SHARED_COOKIE: "false",
        VITE_AUTH_COOKIE_DOMAIN: "",
        VITE_ASSESSMENT_MEDIA_URL: "",
        VITE_ASSESSMENT_COORDINATOR_URL: "",
      },
    });
    await mkdir(path.join(root, "output/playwright/qti-connected"), {
      recursive: true,
    });
    await cli(["open", base, "--browser", "chrome"]);
    await cli(["snapshot"]);
    const result = await cli([
        "run-code",
        "--filename",
        "scripts/connected-qti-browser.js",
      ]),
      raw = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
    assert.ok(raw, result);
    const proof = JSON.parse(raw);
    assert.equal(proof.connected_qti, true);
    assert.equal(proof.adoptions, 1);
    assert.equal(proof.drafts, 1);
    assert.equal(proof.approved, 0);
    assert.equal(proof.sources, 3);
    assert.equal(proof.reports, 5);
    assert.equal(proof.source_completed_audits, 3);
    assert.equal(proof.adopt_audits, 1);
    assert.equal(loseBegin || losePart || loseAdoption || loseConfirm, false);
    const bucket = await worker.getR2Bucket("SOURCES");
    for (
      const entry of (await db.query(
        "select jsonb_agg(to_jsonb(p)) from assessment_qti_parts p;",
      )).data
    ) {
      const stored = await bucket.get(entry.object_key);
      assert.ok(stored);
      const cipher = new Uint8Array(await stored.arrayBuffer());
      assert.equal(cipher.length, entry.byte_length + 16);
      assert.equal(digest(cipher), entry.cipher_sha256);
      assert.notEqual(digest(cipher), entry.sha256);
    }
    console.log(
      JSON.stringify({ event: "qti.connected.browser.acceptance", ...proof }),
    );
  } catch (cause) {
    try {
      console.error(await cli(["snapshot"]));
    } catch {}
    throw cause;
  } finally {
    stop.abort();
    await Promise.allSettled([...jobs.values()].map((job) => job.task));
    try {
      await cli(["close"]);
    } catch {}
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
    await worker?.dispose();
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.match(path.basename(resolved), /^schood-qti-browser-[A-Za-z0-9]+$/);
    await rm(resolved, { recursive: true, force: true });
  }
}
