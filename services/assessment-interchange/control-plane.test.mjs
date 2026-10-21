import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fixtureDatabase } from "../../scripts/assessment-fixture-database.mjs";
import { createQtiHandler } from "../../supabase/functions/assessment-cloud/qti-handler.ts";
import { createQtiRepository } from "../../supabase/functions/assessment-cloud/qti-repository.ts";
import { createImportHandler } from "../../supabase/functions/assessment-cloud/import-handler.ts";
import { createImportRepository } from "../../supabase/functions/assessment-cloud/import-repository.ts";
import { buildChoicePackage } from "./src/choice-profile.ts";
import { IMAGE, sandbox } from "./run.mjs";
import { realByteWorkflow } from "./byte-workflow.mjs";
import { realBrowserWorkflow } from "./browser-workflow.mjs";
const realBrowser = process.env.ASSESSMENT_QTI_REAL_BROWSER === "true";
const realBytes = realBrowser ||
  process.env.ASSESSMENT_QTI_REAL_BYTES === "true";
const tenant = "10000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000001";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
test(
  realBrowser
    ? "actual institution browser/QTI Worker/encrypted R2/ClamAV/processor/parser/PG reviewed draft workflow; identity/PostgREST are explicit fixtures"
    : realBytes
    ? "real QTI Worker/encrypted R2/ClamAV/parser/PG adoption and rejection paths; identity/PostgREST are explicit fixtures"
    : "production QTI handlers/repositories + PG + pinned isolated parser preserve reviewed adoption; transport/AV are explicit metadata fixtures",
  async () => {
    const container = `schood-media-browser-${randomUUID().slice(0, 8)}`;
    let db, started = false;
    const sql = (program) =>
      execFileSync("docker", [
        "exec",
        "-i",
        container,
        "psql",
        "-qAt",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ], {
        input: program,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 16 * 1048576,
        windowsHide: true,
      });
    try {
      execFileSync("docker", [
        "run",
        "--detach",
        "--rm",
        "--name",
        container,
        "--label",
        "schood.assessment-qti.control=true",
        "--env",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:16-alpine",
      ], { stdio: "pipe", windowsHide: true });
      started = true;
      for (let i = 0;; i++) {
        try {
          execFileSync("docker", [
            "exec",
            container,
            "pg_isready",
            "-U",
            "postgres",
          ], { stdio: "pipe", windowsHide: true });
          break;
        } catch {
          if (i >= 40) {
            throw new Error("QTI fixture database did not become ready.");
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      const migrations = readdirSync(
        new URL("../../supabase/migrations", import.meta.url),
      ).filter((name) => /^\d{14}_(assessment|proctor)_/.test(name)).sort();
      assert.equal(migrations.length, 37);
      const program = readFileSync(
        new URL(
          "../../supabase/tests/assessment-cloud.fixture.sql",
          import.meta.url,
        ),
        "utf8",
      ) +
        `\ninsert into users values('${actor}');insert into tenants values('${tenant}');insert into tenant_memberships values('${tenant}','${actor}','active','owner');\n` +
        migrations.map((name) =>
          readFileSync(
            new URL("../../supabase/migrations/" + name, import.meta.url),
            "utf8",
          )
        ).join("\n");
      await new Promise((resolve, reject) => {
        const child = spawn("docker", [
          "exec",
          "-i",
          container,
          "psql",
          "-q",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        let error = "";
        child.stdout.resume();
        child.stderr.on(
          "data",
          (chunk) => error = (error + chunk).slice(-16000),
        );
        child.on("error", reject);
        child.on(
          "close",
          (code) => code === 0 ? resolve() : reject(new Error(error)),
        );
        child.stdin.on("error", reject);
        child.stdin.end(program);
      });
      db = await fixtureDatabase(container, sql);
      const service = {
        rpc: async (name, args) => {
          if (
            ![
              "assessment_qti_read",
              "assessment_qti_command",
              "assessment_qti_transport",
              "assessment_qti_claim",
              "assessment_qti_bundle",
              "assessment_qti_report",
              "assessment_bank_import_command",
              "assessment_bank_import_read",
              "assessment_bank_export",
              "assessment_has_capability",
              "assessment_workspaces",
              "assessment_command",
              "assessment_grading_read",
            ].includes(name)
          ) throw new Error("Unexpected fixture RPC.");
          const parameters = Object.entries(args).map(([key, value]) => {
            assert.match(key, /^p_[a-z_]+$/);
            const encoded = value === null
              ? "null"
              : typeof value === "object"
              ? literal(JSON.stringify(value)) + "::jsonb"
              : typeof value === "string"
              ? literal(value)
              : String(value);
            return key + "=>" + encoded;
          });
          return db.query(
            `select to_jsonb(public.${name}(${parameters.join(",")}));`,
          );
        },
      };
      const auth = {
        auth: {
          getUser: (token) =>
            Promise.resolve({
              data: { user: token === "author" ? { id: actor } : null },
              error: null,
            }),
        },
      };
      const imageId = execFileSync("docker", [
        "image",
        "inspect",
        IMAGE,
        "--format",
        "{{.Id}}",
      ], { encoding: "utf8", windowsHide: true }).trim();
      assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
      const cfg = {
        enabled: true,
        transportKey: "fixture-transport".repeat(4),
        scannerKey: "fixture-scanner".repeat(4),
        parserKey: "fixture-parser".repeat(4),
        scannerId: realBytes ? "local-real-qti-av" : "metadata-fixture-no-AV",
        processorId: imageId.slice(7),
      };
      const handler = createQtiHandler(
          createQtiRepository(auth, service),
          [],
          cfg,
        ),
        imports = createImportHandler(
          createImportRepository(auth, service),
          [],
        );
      const call = async (
        path,
        body,
        key = "qti-control-" + randomUUID(),
        extra = {},
      ) => {
        const req = new Request(
          `https://fixture.invalid/assessment-cloud/${path}?tenant_id=${tenant}`,
          {
            method: body === undefined ? "GET" : "POST",
            headers: {
              authorization: "Bearer author",
              "content-type": "application/json",
              "idempotency-key": key,
              ...extra,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        );
        const response =
          await (path.startsWith("qti/") ? handler(req) : imports(req));
        return { status: response.status, body: await response.json() };
      };
      const bank = JSON.parse(
        sql(
          `select assessment_command('${actor}','${tenant}','qti-control-bank','bank.create','{"title":"Connected QTI review"}');`,
        ),
      ).id;
      const built = await buildChoicePackage([{
        id: "source-version",
        item: {
          schema_version: "assessment.item.v1",
          type: "single_choice",
          locale: "en",
          prompt: "Reviewed imported choice",
          max_score: 4,
          tags: [],
          options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }],
        },
        key: { correct: "A" },
      }]);
      if (realBrowser) {
        await realBrowserWorkflow({
          sql,
          db,
          service,
          cfg,
          bank,
          built,
          tenant,
          actor,
        });
        return;
      }
      if (realBytes) {
        await realByteWorkflow({
          call,
          handler,
          sql,
          cfg,
          bank,
          built,
          tenant,
          actor,
        });
        return;
      }
      const begin = {
        action: "source.begin",
        data: {
          bank_id: bank,
          filename: "reviewed.zip",
          source_hash: built.sha256,
          byte_length: built.bytes.length,
          parts: [{
            sha256: digest(built.bytes),
            byte_length: built.bytes.length,
          }],
          processor_id: "forged",
        },
      };
      const created = await Promise.all(
        Array.from(
          { length: 4 },
          () => call("qti/commands", begin, "qti-connected-source"),
        ),
      );
      for (const response of created) assert.deepEqual(response, created[0]);
      assert.equal(created[0].status, 200);
      const id = created[0].body.data.id;
      const transport = { "x-assessment-qti-transport-key": cfg.transportKey };
      const part = {
        job_id: id,
        index: 0,
        sha256: built.sha256,
        byte_length: built.bytes.length,
        cipher_sha256: "c".repeat(64),
        iv: "d".repeat(24),
        key_id: "metadata-fixture-no-R2",
        etag: "fixture-receipt",
        object_key: `assessment-qti/${tenant}/${id}/0/${built.sha256}`,
      };
      assert.equal(
        (await call(
          "qti/transport",
          { action: "part.receipt", data: part },
          undefined,
          transport,
        )).status,
        200,
      );
      assert.equal(
        (await call(
          "qti/transport",
          { action: "complete", data: { job_id: id } },
          undefined,
          transport,
        )).status,
        200,
      );
      const scanHeaders = { "x-assessment-qti-worker-key": cfg.scannerKey },
        parseHeaders = { "x-assessment-qti-worker-key": cfg.parserKey };
      const scanning = await call(
        "qti/internal/scan/claim",
        { limit: 1 },
        undefined,
        scanHeaders,
      );
      assert.equal(scanning.status, 200);
      const scanTicket = scanning.body.data[0];
      assert.equal(
        (await call(
          "qti/internal/scan/report",
          {
            job_id: id,
            lease_token: scanTicket.lease_token,
            result: {
              schema_version: "assessment.qti-scan.v2",
              observed_source_hash: built.sha256,
              scan_performed: true,
              reason: "clean",
              source_hash: built.sha256,
              byte_length: built.bytes.length,
              verdict: "clean",
              engine_version: "METADATA FIXTURE ONLY - not AV proof",
              signature_version: "e".repeat(64),
              report_hash: "f".repeat(64),
            },
          },
          undefined,
          scanHeaders,
        )).status,
        200,
      );
      const parsing = await call(
          "qti/internal/parse/claim",
          { limit: 1 },
          undefined,
          parseHeaders,
        ),
        ticket = parsing.body.data[0];
      assert.equal(ticket.processor_id, cfg.processorId);
      const bundle = await call(
        "qti/internal/parse/bundle",
        { job_id: id, lease_token: ticket.lease_token },
        undefined,
        parseHeaders,
      );
      assert.equal(bundle.body.data.source_hash, built.sha256);
      const result = await sandbox(built.bytes, "candidates", {
        expectedHash: bundle.body.data.source_hash,
        imageId,
      });
      assert.equal(result.draft_candidates.length, 1);
      assert.deepEqual(result.blocked, []);
      // Lose the observed report reply only after the real handler transaction committed.
      const report = { job_id: id, lease_token: ticket.lease_token, result };
      const committed = await call(
        "qti/internal/parse/report",
        report,
        undefined,
        parseHeaders,
      );
      assert.equal(committed.status, 200);
      const recovered = await call(
        "qti/internal/parse/report",
        report,
        undefined,
        parseHeaders,
      );
      assert.deepEqual(recovered, committed);
      const view = (await call("qti/jobs/" + id)).body.data;
      assert.equal(view.state, "review_ready");
      assert.equal(view.rows[0].key.correct, "A");
      assert.equal(view.rows[0].item.max_score, 4);
      assert.ok(!("lease_token" in view));
      const adopt = {
        action: "adopt",
        data: {
          id,
          expected_revision: view.revision,
          review_hash: view.review_hash,
          reason:
            "Reviewed exact source, license requirements and proposed question/key.",
          acknowledged: true,
          rows: [{ approved: true }],
        },
      };
      assert.equal(
        (await call("qti/commands", {
          ...adopt,
          data: { ...adopt.data, review_hash: "0".repeat(64) },
        })).status,
        409,
      );
      const adoption = await call("qti/commands", adopt, "qti-connected-adopt");
      assert.equal(adoption.status, 200);
      assert.deepEqual(
        await call("qti/commands", adopt, "qti-connected-adopt"),
        adoption,
      );
      const imported = adoption.body.data.import;
      assert.equal(
        (await call("imports/commands", {
          action: "confirm",
          data: {
            id: imported.id,
            expected_revision: 1,
            review_hash: imported.review_hash,
            reason: "Reviewed exact bank rows before draft creation.",
          },
        })).status,
        200,
      );
      assert.equal(
        (await call("imports/commands", {
          action: "step",
          data: { id: imported.id, expected_revision: 2 },
        })).status,
        200,
      );
      const proof = JSON.parse(
        sql(
          `select jsonb_build_object('sources',(select count(*) from assessment_qti_jobs),'reports',(select count(*) from assessment_qti_reports),'adoptions',(select count(*) from assessment_qti_adoptions),'items',(select count(*) from assessment_items where bank_id='${bank}'),'drafts',(select count(*) from assessment_item_versions v join assessment_items i on i.id=v.item_id where i.bank_id='${bank}' and v.status='draft' and v.approved_by is null),'raw_source_hash',(select raw_source_hash from assessment_qti_adoptions),'system_audits',(select count(*) from assessment_audit_events where action in('qti.scan.reported','qti.parse.reported') and actor_kind='system'));`,
        ),
      );
      assert.deepEqual(proof, {
        sources: 1,
        reports: 2,
        adoptions: 1,
        items: 1,
        drafts: 1,
        raw_source_hash: built.sha256,
        system_audits: 2,
      });
      sql(
        `update tenant_memberships set status='inactive' where tenant_id='${tenant}' and user_id='${actor}';`,
      );
      assert.equal(
        (await call("qti/commands", adopt, "qti-connected-adopt")).status,
        403,
      );
      assert.equal((await call("qti/jobs/" + id)).status, 403);
      assert.equal(
        (await call(
          "qti/internal/parse/report",
          report,
          undefined,
          parseHeaders,
        ))
          .status,
        403,
      );
    } finally {
      db?.close();
      if (started) {
        execFileSync("docker", ["stop", container], {
          stdio: "pipe",
          windowsHide: true,
        });
      }
    }
  },
);
