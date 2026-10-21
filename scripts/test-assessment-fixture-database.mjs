import { fixtureDatabase } from "./assessment-fixture-database.mjs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {testDatabase} from '../workers/assessment-media/scripts/browser-database.mjs';
import {scanControl} from '../workers/assessment-media/scripts/scan-control.mjs';
let readyCount=0,scansStarted=0,finishScan;
const controlledScan=scanControl(()=>readyCount,()=>{scansStarted++;return new Promise(resolve=>{finishScan=()=>{readyCount++;resolve();};});});
const scan=controlledScan.start('stable-scan-job',2);assert.equal(scan.state,'running');assert.equal(controlledScan.start('stable-scan-job',2).id,scan.id);assert.equal(scansStarted,1);assert.throws(()=>controlledScan.start('competing-scan-job',2));assert.equal(controlledScan.status(scan.id).state,'running');finishScan();await controlledScan.drain();assert.equal(controlledScan.status(scan.id).state,'complete');assert.equal(controlledScan.start('stable-scan-job',2).scanned,1);assert.equal(scansStarted,1);
const failedScan=scanControl(()=>0,()=>Promise.reject(new Error('Synthetic decoder failure'))),failedJob=failedScan.start('failed-scan-job',1);await failedScan.drain();assert.equal(failedScan.status(failedJob.id).state,'failed');
// The bounded PostgREST fixture must reach the public answer/feedback RPCs,
// without permitting renamed private helpers or arbitrary function names.
const mapped=[];
const {service:mediaService}=testDatabase('schood-media-browser-00000000',{query:query=>{mapped.push(query);return Promise.resolve({data:[],error:null});}});
for(const name of ['assessment_answer_read','assessment_answer_command','assessment_feedback_read','assessment_feedback_command'])await mediaService.rpc(name,{p_actor:'00000000-0000-4000-8000-000000000001'});
assert.equal(mapped.length,4);
for(const name of ['assessment_prompt_artifact_command','assessment_media_policy_valid','arbitrary_function'])assert.throws(()=>mediaService.rpc(name,{}));
const container = "schood-appeals-browser-" + randomUUID().slice(0, 8);
let bridge, started = false;
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 60000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || String(result.error));
  }
  return result.stdout;
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
  for (let n = 0; n < 40; n++) {
    if (
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
        encoding: "utf8",
      }).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready);
  const sql = (query) =>
    docker([
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ], query);
  sql(
    "create role service_role bypassrls;create table fixture_parent(id integer primary key);create table fixture_child(id integer references fixture_parent(id) deferrable initially deferred);create table fixture_private(id integer);grant select,insert on fixture_child to service_role;",
  );
  bridge = await fixtureDatabase(container, sql);
  assert.deepEqual(
    await bridge.query(
      "select jsonb_build_object('text','O''zbek, Русский'||chr(10)||'quoted');",
    ),
    { data: { text: "O'zbek, Русский\nquoted" }, error: null },
  );
  const results = await Promise.all(
    Array.from(
      { length: 12 },
      (_, index) => bridge.query("select to_jsonb(" + index + ");"),
    ),
  );
  assert.deepEqual(
    results.map((row) => row.data),
    Array.from({ length: 12 }, (_, i) => i),
  );
  assert.ok(results.every((row) => !row.error));
  assert.equal(
    (await bridge.query("select to_jsonb(id) from fixture_private;")).error
      .code,
    "42501",
  );
  assert.equal(
    (await bridge.query("select to_jsonb(1/0);")).error.code,
    "22012",
  );
  assert.equal(
    (await bridge.query(
      "with added as(insert into fixture_child values(999) returning id) select to_jsonb(id) from added;",
    )).error.code,
    "23503",
  );
  assert.deepEqual(
    await bridge.query("select to_jsonb(count(*)) from fixture_child;"),
    { data: 0, error: null },
  );
  assert.deepEqual(await bridge.query("select to_jsonb(true);"), {
    data: true,
    error: null,
  });
  console.log(
    "Passed real PostgreSQL fixture port: service-role authority, UTF-8/newline framing, concurrent request identity, SQLSTATE preservation, deferred-FK rejection, atomic rollback and recovery.",
  );
} finally {
  bridge?.close();
  if (started) {
    assert.match(container, /^schood-appeals-browser-[a-f0-9]{8}$/);
    spawnSync("docker", ["stop", container], {
      encoding: "utf8",
      timeout: 20000,
    });
  }
}
