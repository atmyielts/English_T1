// Connected acceptance fixture: actual app/SDK -> handlers/repositories -> PG,
// native credentialed playback -> real encrypted R2, actual coordinator and AV.
// Only Supabase identity/PostgREST HTTP are local adapters. No hosted mutation.
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { testDatabase } from "./browser-database.mjs";
import {fixtureDatabase} from '../../../scripts/assessment-fixture-database.mjs';
import {seedAcademicMarkers,academicAnswerReport} from './academic-answer-fixture.mjs';
import {scanControl} from './scan-control.mjs';
const root = fileURLToPath(new URL("../../../", import.meta.url));
const container = `schood-media-browser-${randomUUID().slice(0, 8)}`,
  directory = await mkdtemp(path.join(tmpdir(), "schood-media-browser-"));
let bridge;
const { docker, sql, literal, service } = testDatabase(container,{query:query=>bridge.query(query)});
const imageResponses=process.env.ASSESSMENT_IMAGE_RESPONSE_TEST==='1';
const mediaAnswers=process.env.ASSESSMENT_MEDIA_ANSWER_TEST==='1';
let answerAdmissions=mediaAnswers;
const lostAnswerReplies={admission:mediaAnswers,part:mediaAnswers,completion:mediaAnswers};
const base = "http://localhost:5911",
  institution = "http://localhost:5303",
  exam = "http://localhost:5304",
  origins = [institution, exam];
const tenant = "10000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000001",
  reviewer = "00000000-0000-4000-8000-000000000002",
  candidate = "00000000-0000-4000-8000-000000000003",
  foreign = "00000000-0000-4000-8000-000000000004";
const marker1='00000000-0000-4000-8000-000000000006',marker2='00000000-0000-4000-8000-000000000007';
const scannerSecret = randomBytes(32).toString("hex"),
  mediaSecret = randomBytes(32).toString("hex"),
  coordinatorSecret = randomBytes(32).toString("hex"),
  control = randomUUID();
const image =
    process.env.ASSESSMENT_SCANNER_IMAGE ?? "schood-assessment-scanner-local",
  database = path.resolve(
    process.env.ASSESSMENT_SCANNER_DATABASE ??
      path.join(root, "output/assessment-scanner/signatures"),
  );
let media,
  coordinator,
  server,
  started = false,
  finished = false,
  scans;
const apps = [],
  events = [],
  identities = new Map();
let finish;
const completed = new Promise((resolve) => (finish = resolve));
const stopping=new AbortController();
const stop=()=>{if(!stopping.signal.aborted)stopping.abort();finish();};
const checkRunning=()=>stopping.signal.throwIfAborted();
// Registered before startup, not only after readiness: a cancelled parent must
// not leave an isolated database/build running. No other process is targeted.
process.once('SIGINT',stop);process.once('SIGTERM',stop);
if(process.send){process.on('message',message=>{if(message?.type==='assessment.fixture.stop')stop();});process.once('disconnect',stop);}
function token(actor) {
  const value = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actor, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.local-fixture`;
  identities.set(value, actor);
  return value;
}
const auth = {
  auth: {
    getUser: async (value) => ({
      data: {
        user: identities.has(value) ? { id: identities.get(value) } : null,
      },
      error: null,
    }),
  },
};
async function child(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    processHandle.stdout.on("data", (chunk) => (output += chunk));
    processHandle.stderr.on("data", (chunk) => (error += chunk));
    processHandle.on("error", reject);
    processHandle.on("close", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(error || output || "Local fixture command failed")),
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
    "schood.assessment.test=media-browser",
    "--env",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16-alpine",
  ]);
  started = true;
  if(process.send)process.send({type:'assessment.fixture.database',container,directory});
  console.log(
    JSON.stringify({ event: "media.browser.fixture", container, directory }),
  );
  for (let retry = 0; retry < 30; retry++) {
    try {
      // TCP readiness only succeeds on the final server, not the image's socket-only init server.
      docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      sql("select 1");
      break;
    } catch {
      if (retry === 29) throw new Error("Fixture database did not start");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  for (const file of [
    "supabase/tests/assessment-cloud.fixture.sql",
    ...[
      "20261013100000_assessment_cloud_core.sql",
      "20261013110000_proctor_control_plane.sql",
      "20261013120000_proctor_candidate_delivery.sql",
      "20261013130000_assessment_runtime.sql",
      "20261013140000_assessment_recovery_schedule.sql",
      "20261013150000_assessment_grading.sql",
      "20261014090000_assessment_staff.sql",
      "20261014100000_assessment_design.sql",
      "20261014110000_assessment_artifacts.sql",
      "20261014120000_proctor_recordings.sql",
      "20261014130000_proctor_recording_recovery.sql",
      "20261014140000_proctor_recording_citations.sql",
      "20261014150000_assessment_appeals.sql",
      "20261014160000_assessment_certificates.sql",
      "20261014170000_assessment_cohorts.sql",
      "20261019100000_assessment_bank_imports.sql",
      "20261019110000_assessment_analytics.sql",
      "20261019120000_assessment_feedback.sql",
      "20261019130000_proctor_capture_launch.sql",
      "20261020100000_proctor_capture_watchdog.sql",
      "20261020110000_assessment_image_responses.sql",
      "20261020120000_assessment_media_answers.sql",
      "20261020130000_assessment_answer_recovery.sql",
      "20261020140000_assessment_native_audio.sql",
      "20261020150000_assessment_qti_jobs.sql",
      "20261020160000_assessment_qti_byte_verification.sql",
      "20261020170000_assessment_memberships.sql",
      "20261020180000_assessment_invitations.sql",
      "20261020190000_assessment_invitation_mail.sql",
      "20261020200000_proctor_live_connections.sql",
      "20261020210000_proctor_live_launch.sql",
      "20261020220000_proctor_workload.sql",
      "20261020230000_assessment_certificate_documents.sql",
      "20261021000000_assessment_certificate_lifecycle.sql",
      "20261021010000_assessment_blueprints.sql",
      "20261021020000_assessment_accommodations.sql",
      "20261022110000_assessment_entitlements.sql",
      "20261022120000_assessment_webhooks.sql",
      "20261022130000_assessment_api_clients.sql",
      "20261022140000_assessment_blueprint_relations.sql",
    ].map((name) => `supabase/migrations/${name}`),
  ])
    { checkRunning(); sql(await readFile(path.join(root, file), "utf8")); }
  // Historical Supabase tables have service-role read grants; this minimal
  // fixture must model those separately from the additive service migrations.
  sql(
    `grant select on users,tenants,tenant_memberships to service_role;insert into users values('${owner}'),('${reviewer}'),('${candidate}'),('${foreign}');insert into tenants values('${tenant}');insert into tenant_memberships values('${tenant}','${owner}','active','owner'),('${tenant}','${reviewer}','active','admin');`,
  );
  bridge=await fixtureDatabase(container,sql);
  if(mediaAnswers)seedAcademicMarkers(sql,{tenant,owner,marker1,marker2});
  checkRunning();
  const fixtures = mediaAnswers?[]:JSON.parse(
    docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=32m",
      "--mount",
      `type=bind,src=${path.join(root, "services/assessment-scanner/browser-fixtures.py")},dst=/app/browser-fixtures.py,readonly`,
      "--entrypoint",
      "python3",
      image,
      "/app/browser-fixtures.py",
    ]),
  );
  const bundle = await build({
    stdin: {
      contents:
        "export {createHandler} from './supabase/functions/assessment-cloud/handler.ts';export {createAssessmentRepository} from './supabase/functions/assessment-cloud/repository.ts';export {createArtifactHandler} from './supabase/functions/assessment-cloud/artifact-handler.ts';export {createArtifactRepository} from './supabase/functions/assessment-cloud/artifact-repository.ts';export {createRuntimeHandler} from './supabase/functions/assessment-runtime/handler.ts';export {createRuntimeRepository} from './supabase/functions/assessment-runtime/repository.ts';export {createGradingHandler} from './supabase/functions/assessment-cloud/grading-handler.ts';export {createGradingRepository} from './supabase/functions/assessment-cloud/grading-repository.ts';export {createAppealHandler} from './supabase/functions/assessment-cloud/appeal-handler.ts';export {createAppealRepository} from './supabase/functions/assessment-cloud/appeal-repository.ts';export {createCertificateHandler} from './supabase/functions/assessment-cloud/certificate-handler.ts';export {createCertificateRepository} from './supabase/functions/assessment-cloud/certificate-repository.ts';export {createMediaAnswerHandler} from './supabase/functions/assessment-cloud/media-answer-handler.ts';export {createMediaAnswerRepository} from './supabase/functions/assessment-cloud/media-answer-repository.ts';export {createFeedbackHandler} from './supabase/functions/assessment-cloud/feedback-handler.ts';export {createFeedbackRepository} from './supabase/functions/assessment-cloud/feedback-repository.ts';",
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
  });
  const modules = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  const assessment = modules.createHandler({
    repository: modules.createAssessmentRepository(auth, service),
    allowedOrigins: origins,
    promptMediaEnabled: true,
    imageResponsesEnabled:imageResponses,
    mediaAnswersEnabled:mediaAnswers,
  });
  const artifacts = modules.createArtifactHandler(
    modules.createArtifactRepository(auth, service),
    origins,
    {
      transport: mediaSecret,
      scanner: scannerSecret,
      scannerId: "local-browser-clamav",
    },
  );
  const runtime = modules.createRuntimeHandler(
    modules.createRuntimeRepository(auth, service),
    coordinatorSecret,
  );
  const gradingSecret=randomBytes(32).toString('hex');
  const grading = modules.createGradingHandler(
    modules.createGradingRepository(auth, service),
    origins,
    gradingSecret,
  );
  const appeals=modules.createAppealHandler(modules.createAppealRepository(auth,service),origins);
  const certificates=modules.createCertificateHandler(modules.createCertificateRepository(auth,service),origins,{enabled:false,signer:null});
  const feedback=modules.createFeedbackHandler(modules.createFeedbackRepository(auth,service),origins);
  const answers=(request)=>modules.createMediaAnswerHandler(modules.createMediaAnswerRepository(auth,service),origins,answerAdmissions)(request);
  media = new Miniflare({
    modules: true,
    scriptPath: path.join(root, "workers/assessment-media/dist/index.js"),
    compatibilityDate: "2026-07-30",
    r2Buckets: ["ARTIFACTS"],
    r2Persist: path.join(directory, "r2"),
    bindings: {
      SUPABASE_URL: "https://canonical-tests.invalid",
      SUPABASE_ANON_KEY: "synthetic",
      ASSESSMENT_MEDIA_SECRET: mediaSecret,
      ASSESSMENT_SCANNER_SECRET: scannerSecret,
      ARTIFACT_ACTIVE_KEY_ID: "local-browser-k1",
      ARTIFACT_KEYRING: JSON.stringify({
        "local-browser-k1": randomBytes(32).toString("hex"),
      }),
      ALLOWED_ORIGINS: origins.join(","),
    },
    outboundService: (request) => artifacts(request),
  });
  coordinator = new Miniflare({
    modules: true,
    scriptPath: path.join(root, "workers/assessment-coordinator/dist/index.js"),
    compatibilityDate: "2026-07-30",
    durableObjects: {
      ATTEMPTS: { className: "AttemptCoordinator", useSQLite: true },
    },
    durableObjectsPersist: path.join(directory, "coordinator"),
    queueProducers: { RECOVERY_QUEUE: "media-browser-recovery" },
    bindings: {
      SUPABASE_URL: "https://canonical-tests.invalid",
      SUPABASE_ANON_KEY: "synthetic",
      ASSESSMENT_COORDINATOR_SECRET: coordinatorSecret,
      ALLOWED_ORIGINS: origins.join(","),
    },
    outboundService: async (request) => {
      if (new URL(request.url).pathname === "/auth/v1/user") {
        const result = await auth.auth.getUser(
          (request.headers.get("authorization") ?? "").replace(/^Bearer /, ""),
        );
        return Response.json(result.data.user ?? {}, {
          status: result.data.user ? 200 : 401,
        });
      }
      return runtime(request);
    },
  });
  scans=scanControl(()=>Number(sql("select count(*) from assessment_artifacts where state='ready';")),()=>child(
    process.env.ASSESSMENT_SCANNER_PYTHON??'python',
    [path.join(root,'services/assessment-scanner/scanner.py'),'--once'],
    {...process.env,ASSESSMENT_API_URL:`${base}/functions/v1/assessment-cloud`,ASSESSMENT_MEDIA_URL:base,ASSESSMENT_SCANNER_SECRET:scannerSecret,ASSESSMENT_SCANNER_ID:'local-browser-clamav',CLAMAV_DATABASE:database,ASSESSMENT_SCANNER_IMAGE:image,SCANNER_ALLOW_LOOPBACK_HTTP:'true'},
  ));
  async function handle(request) {
    const url = new URL(request.url),
      cors = {
        "access-control-allow-origin": origins.includes(
          request.headers.get("origin"),
        )
          ? request.headers.get("origin")
          : institution,
        "cache-control": "no-store",
      };
    if (url.pathname === "/test/config") {
      const ids = JSON.parse(
        sql(
          "select jsonb_build_object('banks',(select coalesce(jsonb_agg(row),'[]') from(select id,title from assessment_item_banks) row),'questions',(select coalesce(jsonb_agg(row),'[]') from(select id,payload->>'prompt' as prompt,status from assessment_item_versions) row),'versions',(select coalesce(jsonb_agg(row),'[]') from(select id from assessment_versions) row),'registrations',(select coalesce(jsonb_agg(row),'[]') from(select id from assessment_registrations) row),'artifacts',(select coalesce(jsonb_agg(row),'[]') from(select id,kind,state from assessment_artifacts) row),'attempts',(select coalesce(jsonb_agg(row),'[]') from(select id,state,section_index from assessment_attempts) row));",
        ),
      );
      return Response.json(
        {
          base,
          institution,
          exam,
          tenant,
          owner,
          reviewer,
          candidate,
          foreign,
          marker1,marker2,mediaAnswers,
          control,
          fixtures,
          ids,
          imageResponses,
        },
        { headers: cors },
      );
    }
    if (url.pathname.startsWith("/test/")) {
      if (
        request.method !== "POST" ||
        request.headers.get("x-fixture-control") !== control
      )
        return new Response("Fixture control denied", { status: 403 });
      const action = url.pathname.slice(6);
      if (action === "stop") {
        setTimeout(finish, 100);
        return Response.json({ stopped: true });
      }
      if (action === "scan") {
        const data=await request.json(),target=mediaAnswers?Number(sql("select count(*) from assessment_artifacts where purpose='answer';")):fixtures.length;
        return Response.json(scans.start(data.key,target),{status:202});
      }
      if(action==='scan-status'){
        const data=await request.json();return Response.json(scans.status(data.id));
      }
      if(mediaAnswers&&action==='answer-admissions'){
        const data=await request.json();assert.equal(data.enabled,false);assert.equal(sql("select count(*) from assessment_attempts where state='active';"),'0');answerAdmissions=false;return Response.json({newAdmissions:false});
      }
      if(mediaAnswers&&action==='grade'){
        const claimed=await grading(new Request(base+'/functions/v1/assessment-cloud/grading/internal',{method:'POST',headers:{'x-assessment-grading-key':gradingSecret},body:JSON.stringify({action:'job.claim',data:{limit:100}})}));assert.equal(claimed.status,200);const tickets=(await claimed.json()).data;assert.equal(tickets.length,1);
        const processed=await grading(new Request(base+'/functions/v1/assessment-cloud/grading/internal',{method:'POST',headers:{'x-assessment-grading-key':gradingSecret},body:JSON.stringify({action:'job.process',data:tickets[0]})}));assert.equal(processed.status,200,await processed.clone().text());
        return Response.json({tasks:Number(sql('select count(*) from assessment_grading_tasks;'))});
      }
      if (action === "state") {
        const data = await request.json();
        assert.ok(
          ["pause", "resume", "expire", "lease-loss"].includes(data.operation),
        );
        const attempts = JSON.parse(
          sql(
            `select coalesce(jsonb_agg(row),'[]') from(select id,state,section_index from assessment_attempts where tenant_id='${tenant}' and candidate_id='${candidate}' order by starts_at desc limit 1) row;`,
          ),
        );
        const attempt = attempts[0];
        assert.ok(attempt);
        const id = attempt.id;
        if (data.operation === "pause")
          sql(
            `update assessment_attempts set state='paused' where id='${id}';`,
          );
        if (data.operation === "resume")
          sql(
            `update assessment_attempts set state='active' where id='${id}';`,
          );
        if (data.operation === "expire")
          sql(
            `update assessment_attempts set deadline_at=clock_timestamp()-interval '1 second',section_deadline_at=clock_timestamp()-interval '1 second' where id='${id}';select assessment_runtime_expire('${tenant}','${id}');`,
          );
        if (data.operation === "lease-loss")
          sql(
            `update assessment_attempt_leases set device_id='${foreign}',epoch=epoch+1,token_hash=repeat('f',64),expires_at=clock_timestamp()+interval '60 seconds' where attempt_id='${id}';`,
          );
        return Response.json({ id });
      }
      if (action === "finish") {
        const data = await request.json();
        assert.equal(data.passed, true);
        const report = JSON.parse(
          sql(
            `select jsonb_build_object('artifacts',(select count(*) from assessment_artifacts where state='ready'),'reports',(select count(*) from assessment_artifact_scan_reports),'approved',(select count(*) from assessment_item_versions where status='approved'),'attempts',(select count(*) from assessment_attempts),'responses',(select count(*) from assessment_response_journal),'events',(select count(*) from assessment_audit_events));`,
          ),
        );
        if(mediaAnswers){Object.assign(report,academicAnswerReport(sql));}
        else {
        assert.equal(report.artifacts, 3);
        assert.equal(report.reports, 3);
        assert.equal(report.approved, 2);
        assert.equal(report.attempts, 1);
        assert.ok(report.responses >= 1);
        }
        if(imageResponses){
          const claimed=await grading(new Request(base+'/functions/v1/assessment-cloud/grading/internal',{method:'POST',headers:{'x-assessment-grading-key':gradingSecret},body:JSON.stringify({action:'job.claim',data:{limit:100}})}));assert.equal(claimed.status,200);const tickets=(await claimed.json()).data;assert.equal(tickets.length,1);
          const processed=await grading(new Request(base+'/functions/v1/assessment-cloud/grading/internal',{method:'POST',headers:{'x-assessment-grading-key':gradingSecret},body:JSON.stringify({action:'job.process',data:tickets[0]})}));assert.equal(processed.status,200,await processed.text());
          report.image_response_grades=JSON.parse(sql("select jsonb_build_object('state',status,'scores',objective_scores,'scorer_version',scorer_version) from assessment_grading_runs;"));
          assert.equal(report.image_response_grades.state,'ready');assert.equal(report.image_response_grades.scores.length,2);assert.ok(report.image_response_grades.scores.every(row=>row.score===1&&row.status==='scored'));
          assert.equal(sql("select count(*) from assessment_response_journal where response ? 'score' or response ? 'regions';"),'0');
        }
        finished = true;
        console.log(
          JSON.stringify({
            event: "media.browser.acceptance",
            ...report,
            proof:
              "Real browser/apps, SDK, handlers/repositories, PostgreSQL, coordinator, encrypted R2 and ClamAV broker; Supabase identity/PostgREST HTTP are local adapters, pause/expiry/lease-loss are explicit fixture controls.",
          }),
        );
        setTimeout(finish, 250);
        return Response.json(report);
      }
      return new Response("Unknown fixture control", { status: 404 });
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers":
              "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
          },
        });
      if (url.pathname === "/auth/v1/token") {
        const data = await request.json(),
          actor = { owner, reviewer, candidate, foreign,marker1,marker2 }[
            data.email?.split("@")[0]
          ];
        if (!actor || data.password !== "synthetic-only")
          return Response.json(
            { error: "Invalid fixture credentials" },
            { status: 401, headers: cors },
          );
        const access = token(actor),
          exp = Math.floor(Date.now() / 1000) + 3600;
        return Response.json(
          {
            access_token: access,
            refresh_token: "local-refresh",
            expires_in: 3600,
            expires_at: exp,
            token_type: "bearer",
            user: {
              id: actor,
              aud: "authenticated",
              email: data.email,
              app_metadata: {},
              user_metadata: {},
            },
          },
          { headers: cors },
        );
      }
      if (url.pathname === "/auth/v1/logout")
        return Response.json({}, { headers: cors });
      const result = await auth.auth.getUser(
        (request.headers.get("authorization") ?? "").replace(/^Bearer /, ""),
      );
      return Response.json(result.data.user ?? {}, {
        status: result.data.user ? 200 : 401,
        headers: cors,
      });
    }
    if (url.pathname.startsWith("/functions/v1/assessment-cloud/")) {
      const body =
        request.method === "POST" ? await request.clone().json() : null;
      if (body?.action)
        events.push({
          action: body.action,
          key: request.headers.get("idempotency-key"),
        });
      const response=await (url.pathname.includes('/answers/')
        ? answers(request)
        : url.pathname.includes('/feedback/')
        ? feedback(request)
        : url.pathname.includes("/artifacts/")
        ? artifacts(request)
        : url.pathname.includes("/grading/")
          ? grading(request)
          : url.pathname.includes("/appeals/")
          ? appeals(request)
          : url.pathname.includes('/certificates/')
          ? certificates(request)
          : assessment(request));
      if(mediaAnswers&&url.pathname.includes('/answers/')&&body?.action==='upload.begin'&&response.ok&&lostAnswerReplies.admission){lostAnswerReplies.admission=false;return Response.json({error:'Synthetic admission reply lost after commit'},{status:503,headers:cors});}
      return response;
    }
    async function dispatch(worker) {
      return worker.dispatchFetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        ...(["POST", "PUT"].includes(request.method)
          ? { body: await request.arrayBuffer() }
          : {}),
      });
    }
    if (url.pathname.startsWith("/attempts/")) return dispatch(coordinator);
    if (
      url.pathname.startsWith("/v1/artifacts/") ||
      url.pathname.startsWith("/internal/scan/")
    )
    {
      const response=await dispatch(media);
      const loss=request.method==='PUT'&&/\/parts\/\d+$/.test(url.pathname)?'part':request.method==='POST'&&url.pathname.endsWith('/complete')?'completion':null;
      if(mediaAnswers&&loss&&response.ok&&lostAnswerReplies[loss]){lostAnswerReplies[loss]=false;return Response.json({error:`Synthetic ${loss} reply lost after commit`},{status:503,headers:cors});}
      return response;
    }
    return new Response("Fixture route not found", { status: 404 });
  }
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of incoming) {
        length += chunk.length;
        if (length > 2 * 1048576) throw new Error("Fixture request too large");
        chunks.push(chunk);
      }
      const request = new Request(`${base}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      const result = await handle(request);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) {
        for await (const chunk of result.body) outgoing.write(chunk);
      }
      outgoing.end();
    } catch (cause) {
      console.error("Local browser fixture failed", cause.message);
      if (!outgoing.headersSent)
        outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: cause.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(5911, "::1", resolve);
  });
  for (const [app, port] of [
    ["assessment-cloud", 5303],
    ["exam", 5304],
  ]) {
    checkRunning();
    const fixtureOutput=path.resolve(directory,`${app}-bundle`);
    assert.equal(path.dirname(fixtureOutput),path.resolve(directory));
    const fixtureEnvironment={...process.env,VITE_SUPABASE_URL:base,VITE_SUPABASE_ANON_KEY:'synthetic-only',VITE_AUTH_SHARED_COOKIE:'false',VITE_ASSESSMENT_MEDIA_URL:base,VITE_ASSESSMENT_COORDINATOR_URL:base};
    await new Promise((resolve,reject)=>{
      const builder=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--outDir',fixtureOutput],{cwd:path.join(root,'apps',app),env:fixtureEnvironment,stdio:['ignore','ignore','pipe'],signal:stopping.signal});
      let diagnostics='';builder.stderr.on('data',chunk=>diagnostics+=chunk);builder.on('error',reject);builder.on('close',code=>code===0?resolve():reject(new Error(diagnostics||`${app} fixture build failed`)));
    });
    const processHandle = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/vite/bin/vite.js"),
        'preview',
        '--outDir',fixtureOutput,
        "--host",
        "localhost",
        "--port",
        String(port),
        "--strictPort",
      ],
      {
        cwd: path.join(root, "apps", app),
        env: fixtureEnvironment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    apps.push(processHandle);
    processHandle.stderr.on("data", (chunk) => process.stderr.write(chunk));
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (processHandle.exitCode !== null)
        throw new Error(`${app} fixture process exited before readiness`);
      try {
        const probe = await fetch(`http://localhost:${port}/`),html=await probe.text(),script=/src="([^"]+\.js)"/.exec(html)?.[1];
        if (probe.ok && script && (await(await fetch(new URL(script,`http://localhost:${port}/`))).text()).includes(base)) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, `${app} fixture did not start with its own configuration`);
  }
  console.log(`Connected media browser fixture ready: ${base}/test/config`);
  if(process.send)process.send({type:'assessment.fixture.ready'});
  const timeout = setTimeout(() => {
    console.error("Connected browser fixture acceptance timed out");
    finish();
  }, 15 * 60000);
  await completed;
  clearTimeout(timeout);
  assert.ok(finished, "The fixture stopped without passing acceptance");
} finally {
  // Keep the authority/storage alive until a confirmed-live scanner job ends.
  // A browser observation failure must not restart or abandon that job.
  await scans?.drain();
  for (const app of apps) app.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (coordinator) await coordinator.dispose();
  if (media) await media.dispose();
  await bridge?.close();
  if (started) docker(["stop", container]);
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("schood-media-browser-"));
  await rm(directory, { recursive: true, force: true });
  // A successful child otherwise stays alive on its new IPC message listener,
  // even after every fixture resource was removed and assertions passed.
  if(process.connected)process.disconnect();
}
