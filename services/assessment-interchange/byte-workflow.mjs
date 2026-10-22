import assert from "node:assert/strict";
import {
  convertV4MiniflareOptions,
  Miniflare,
  Response as RuntimeResponse,
} from "miniflare";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { processingClient, processTicket } from "./process.mjs";
import { runProcessor } from "./worker.mjs";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function realByteWorkflow(
  { call, handler, sql, cfg, bank, built, tenant, actor },
) {
  const parent = await realpath(tmpdir()),
    directory = await mkdtemp(path.join(parent, "schood-qti-bytes-"));
  let worker, loseReceipt = true, cancelRead = null;
  const origin = "https://assessment.qti.test",
    options = {
      name: "assessment-qti-source",
      modules: true,
      script: readFileSync(
        new URL("../../workers/assessment-qti/dist/index.js", import.meta.url),
        "utf8",
      ),
      compatibilityDate: "2026-10-20",
      r2Buckets: ["SOURCES"],
      resourcePersistencePath: directory,
      bindings: {
        QTI_ENABLED: "true",
        SUPABASE_URL: "https://canonical.qti.test",
        SUPABASE_ANON_KEY: "fixture-only",
        QTI_TRANSPORT_SECRET: cfg.transportKey,
        QTI_SCANNER_SECRET: cfg.scannerKey,
        QTI_PARSER_SECRET: cfg.parserKey,
        QTI_ACTIVE_KEY_ID: "qti-k1",
        QTI_KEYRING: JSON.stringify({
          "qti-k1": randomBytes(32).toString("hex"),
          "qti-k2": randomBytes(32).toString("hex"),
        }),
        ALLOWED_ORIGINS: origin,
      },
      outboundService: async (req) => {
        assert.equal(new URL(req.url).hostname, "canonical.qti.test");
        const raw = await req.clone().json();
        if (
          cancelRead && raw.job_id === cancelRead.id &&
          new URL(req.url).pathname.endsWith("/bundle") &&
          ++cancelRead.count === 3
        ) {
          const view = (await call("qti/jobs/" + cancelRead.id)).body.data;
          assert.equal(
            (await call("qti/commands", {
              action: "cancel",
              data: {
                id: cancelRead.id,
                expected_revision: view.revision,
                reason: "Cancel during the exact source stream.",
              },
            })).status,
            200,
          );
        }
        const response = await handler(
          new Request(req.url, {
            method: req.method,
            headers: Object.fromEntries(req.headers),
            body: JSON.stringify(raw),
          }),
        );
        if (raw.action === "part.receipt" && response.ok && loseReceipt) {
          loseReceipt = false;
          return RuntimeResponse.json({
            code: "fixture_reply_lost",
            error: "Committed receipt reply lost.",
          }, { status: 503 });
        }
        return new RuntimeResponse(await response.arrayBuffer(), {
          status: response.status,
          headers: Object.fromEntries(response.headers),
        });
      },
    };
  const base = "https://source.qti.test",
    workerCall = (url, init) => worker.dispatchFetch(url, init);
  const fetcher = (url, init) =>
    new URL(url).hostname === "canonical.qti.test"
      ? handler(new Request(url, init))
      : workerCall(url, init);
  const ports = processingClient({
    apiURL: "https://canonical.qti.test",
    sourceURL: base,
    scannerKey: cfg.scannerKey,
    parserKey: cfg.parserKey,
    anonKey: "fixture-only",
    fetcher,
  });
  const url = (job, suffix) =>
    `${base}/v1/qti/sources/${job}/${suffix}?tenant_id=${tenant}`;
  const upload = (job, index, bytes) =>
    workerCall(url(job, "parts/" + index), {
      method: "PUT",
      headers: { authorization: "Bearer author", origin },
      body: bytes,
    });
  async function create(bytes, label, sourceHash = digest(bytes), useBank) {
    const target = useBank ??
        JSON.parse(
          sql(
            `select assessment_command('${actor}','${tenant}','qti-bytes-bank-${randomUUID()}','bank.create','{"title":"QTI byte ${label}"}');`,
          ),
        ).id,
      parts = [];
    for (let i = 0; i < bytes.length; i += 1048576) {
      const part = bytes.subarray(i, i + 1048576);
      parts.push({ sha256: digest(part), byte_length: part.length });
    }
    const response = await call("qti/commands", {
      action: "source.begin",
      data: {
        bank_id: target,
        filename: label + ".zip",
        source_hash: sourceHash,
        byte_length: bytes.length,
        parts,
      },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return {
      id: response.body.data.id,
      bytes,
      hash: sourceHash,
      parts,
      bank: target,
    };
  }
  async function uploadAll(source) {
    for (let index = 0; index < source.parts.length; index++) {
      const response = await upload(
        source.id,
        index,
        source.bytes.subarray(index * 1048576, (index + 1) * 1048576),
      );
      assert.equal(
        response.status,
        200,
        `part ${index}: ${await response.text()}`,
      );
    }
    const response = await workerCall(url(source.id, "complete"), {
      method: "POST",
      headers: { authorization: "Bearer author", origin },
    });
    assert.equal(response.status, 200, await response.text());
  }
  async function process(source, stage) {
    const claimed = await ports.claim(stage, 1);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, source.id);
    const receipt = await processTicket(claimed[0], ports);
    assert.equal(receipt.id, source.id);
    assert.deepEqual(await processTicket(claimed[0], ports), receipt);
    return claimed[0];
  }
  try {
    worker = new Miniflare(convertV4MiniflareOptions(options));
    const files = unzipSync(built.bytes);
    files["data.bin"] = new Uint8Array(randomBytes(1048576 + 128));
    files["imsmanifest.xml"] = strToU8(
      strFromU8(files["imsmanifest.xml"]).replace(
        "</resources>",
        '<resource identifier="aux" type="webcontent"><file href="data.bin"/></resource></resources>',
      ),
    );
    const source = await create(
      new Uint8Array(zipSync(files)),
      "multipart",
      undefined,
      bank,
    );
    assert.equal(source.parts.length, 2);
    assert.equal(
      (await workerCall(url(source.id, "parts/0"), {
        method: "PUT",
        headers: {
          authorization: "Bearer author",
          origin: "https://foreign.test",
        },
        // Origin must be denied before any source body is required or consumed.
      })).status,
      403,
    );
    const first = await upload(source.id, 0, source.bytes.subarray(0, 1048576));
    assert.equal(first.status, 503, await first.text());
    const bucket = await worker.getR2Bucket("SOURCES"),
      key = `assessment-qti/${tenant}/${source.id}/0/${source.parts[0].sha256}`,
      stored = await bucket.get(key),
      cipher = Buffer.from(await stored.arrayBuffer());
    assert.equal(cipher.length, 1048576 + 16);
    assert.equal(
      cipher.equals(Buffer.from(source.bytes.subarray(0, 1048576))),
      false,
    );
    const etag = stored.etag, originalMetadata = { ...stored.customMetadata };
    assert.equal(
      (await upload(source.id, 0, source.bytes.subarray(0, 1048576))).status,
      200,
    );
    assert.equal((await bucket.get(key)).etag, etag);
    await worker.dispose();
    options.bindings.QTI_ACTIVE_KEY_ID = "qti-k2";
    worker = new Miniflare(convertV4MiniflareOptions(options));
    const persisted = await (await worker.getR2Bucket("SOURCES")).get(key);
    assert.ok(persisted, "Encrypted object must survive Worker restart");
    assert.equal(persisted.etag, etag);
    assert.deepEqual({ ...persisted.customMetadata }, originalMetadata);
    assert.equal(
      digest(new Uint8Array(await persisted.arrayBuffer())),
      digest(cipher),
    );
    await uploadAll(source);
    const restored = await (await worker.getR2Bucket("SOURCES")).get(key);
    assert.equal(restored.etag, etag);
    assert.equal(restored.customMetadata.key_id, "qti-k1");
    const processorEvents = [];
    await runProcessor({
      ports,
      signal: new AbortController().signal,
      once: true,
      publish: (event) => processorEvents.push(event),
    });
    assert.deepEqual(
      processorEvents.map((event) => [event.event, event.stage, event.id]),
      [
        ["qti.processing.committed", "scan", source.id],
        ["qti.processing.committed", "parse", source.id],
      ],
    );
    const scanProof = JSON.parse(
      sql(
        `select payload from assessment_qti_reports where job_id='${source.id}' and stage='scan';`,
      ),
    );
    assert.equal(scanProof.scan_performed, true);
    assert.equal(scanProof.observed_source_hash, source.hash);
    assert.equal(scanProof.verdict, "clean");
    assert.ok(!scanProof.engine_version.includes("FIXTURE"));
    const view = (await call("qti/jobs/" + source.id)).body.data;
    assert.equal(view.state, "review_ready");
    assert.equal(view.rows.length, 1);
    const adopted = await call("qti/commands", {
      action: "adopt",
      data: {
        id: source.id,
        expected_revision: view.revision,
        review_hash: view.review_hash,
        acknowledged: true,
        reason: "Reviewed exact scanned source and normalized question/key.",
      },
    });
    assert.equal(adopted.status, 200, JSON.stringify(adopted.body));
    const imported = adopted.body.data.import;
    assert.equal(
      (await call("imports/commands", {
        action: "confirm",
        data: {
          id: imported.id,
          expected_revision: 1,
          review_hash: imported.review_hash,
          reason: "Reviewed staged bank rows.",
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
    const badFiles = unzipSync(built.bytes);
    badFiles["eicar.txt"] = strToU8(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    );
    const infected = await create(
      new Uint8Array(zipSync(badFiles)),
      "antivirus",
    );
    await uploadAll(infected);
    await process(infected, "scan");
    assert.equal(
      (await call("qti/jobs/" + infected.id)).body.data.state,
      "blocked",
    );
    assert.deepEqual(await ports.claim("parse", 1), []);
    const mismatch = await create(built.bytes, "hash-mismatch", "0".repeat(64));
    await uploadAll(mismatch);
    await process(mismatch, "scan");
    const observed = JSON.parse(
      sql(
        `select payload from assessment_qti_reports where job_id='${mismatch.id}' and stage='scan';`,
      ),
    );
    assert.equal(observed.reason, "source_hash_mismatch");
    assert.equal(observed.scan_performed, false);
    assert.equal(observed.observed_source_hash, built.sha256);
    assert.deepEqual(await ports.claim("parse", 1), []);
    const malformedFiles = unzipSync(built.bytes);
    malformedFiles["imsmanifest.xml"] = strToU8(
      "<!DOCTYPE manifest><manifest/>",
    );
    const malformed = await create(
      new Uint8Array(zipSync(malformedFiles)),
      "malformed-XML",
    );
    await uploadAll(malformed);
    await process(malformed, "scan");
    await process(malformed, "parse");
    const blocked = (await call("qti/jobs/" + malformed.id)).body.data;
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.blocked[0].code, "xml_dtd");
    const cancelled = await create(source.bytes, "cancelled-stream");
    await uploadAll(cancelled);
    const cancellationTicket = (await ports.claim("scan", 1))[0],
      cancellationBundle = await ports.bundle(cancellationTicket, false);
    cancelRead = { id: cancelled.id, count: 0 };
    await assert.rejects(
      ports.source(
        cancellationTicket,
        cancellationBundle,
        new AbortController().signal,
      ),
    );
    cancelRead = null;
    assert.equal(
      (await call("qti/jobs/" + cancelled.id)).body.data.state,
      "cancelled",
    );
    const tampered = await create(built.bytes, "cipher-tamper");
    await uploadAll(tampered);
    const storage = await worker.getR2Bucket("SOURCES"),
      tamperKey = `assessment-qti/${tenant}/${tampered.id}/0/${
        tampered.parts[0].sha256
      }`,
      before = await storage.get(tamperKey),
      changed = new Uint8Array(await before.arrayBuffer());
    changed[0] ^= 1;
    await storage.put(tamperKey, changed, {
      customMetadata: before.customMetadata,
    });
    const tamperTicket = (await ports.claim("scan", 1))[0];
    await assert.rejects(processTicket(tamperTicket, ports));
    const tamperView = (await call("qti/jobs/" + tampered.id)).body.data;
    assert.equal(tamperView.state, "scanning");
    assert.equal(
      (await call("qti/commands", {
        action: "cancel",
        data: {
          id: tampered.id,
          expected_revision: tamperView.revision,
          reason:
            "Preserve evidence of changed storage; no scan verdict exists.",
        },
      })).status,
      200,
    );
    const proof = JSON.parse(
      sql(
        `select jsonb_build_object('sources',(select count(*) from assessment_qti_jobs),'reports',(select count(*) from assessment_qti_reports),'adoptions',(select count(*) from assessment_qti_adoptions),'drafts',(select count(*) from assessment_item_versions where status='draft' and approved_by is null),'unverified_clean',(select count(*) from assessment_qti_reports where stage='scan' and payload->>'verdict'='clean' and (payload->>'schema_version'<>'assessment.qti-scan.v2' or payload->'scan_performed'<>'true')));`,
      ),
    );
    assert.deepEqual(proof, {
      sources: 6,
      reports: 6,
      adoptions: 1,
      drafts: 1,
      unverified_clean: 0,
    });
    sql(
      `update tenant_memberships set status='inactive' where tenant_id='${tenant}' and user_id='${actor}';`,
    );
    assert.equal((await call("qti/jobs/" + source.id)).status, 403);
  } finally {
    await worker?.dispose();
    const resolved = await realpath(directory);
    if (
      path.dirname(resolved) !== parent ||
      !/^schood-qti-bytes-[A-Za-z0-9]+$/.test(path.basename(resolved))
    ) throw new Error("Unexpected QTI fixture cleanup target.");
    await rm(resolved, { recursive: true, force: true });
  }
}
