import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import {fixtureDatabase} from './assessment-fixture-database.mjs';
import {capturePorts} from './assessment-capture-ports.mjs';
import {seedAssessmentStaff,assessmentStaffProof} from './assessment-staff-fixture.mjs';
import {seedAssessmentInvitations,assessmentInvitationProof} from './assessment-invitation-fixture.mjs';
import {assessmentMailFixture} from './assessment-mail-fixture.mjs';
import {assessmentDocumentFixture} from './assessment-document-fixture.mjs';
import {seedAssessmentBlueprints,assessmentBlueprintProof} from './assessment-blueprint-fixture.mjs';
import {seedAssessmentAccommodations,bumpAccommodation,setAccommodatedAttemptState,assessmentAccommodationProof} from './assessment-accommodations-fixture.mjs';
const root = fileURLToPath(new URL("../", import.meta.url)),
  tenant = "10000000-0000-4000-8000-000000000001";
export async function appealBrowserStack({ certificates = false,documents=false,lifecycle=false,blueprints=false,accommodations=false,cohorts=false,imports=false,analytics=false,feedback=false,capture=false,live=false,workload=false,staff=false,invitations=false,mail=false } = {}) {
  if(blueprints||accommodations)capture=true;
  if(lifecycle)documents=true;
  if(documents)certificates=true;
  if(live)capture=true;
  if(workload)capture=true;
  if(mail)invitations=true;
  const container = `schood-appeals-browser-${randomUUID().slice(0, 8)}`,
    directory = await mkdtemp(path.join(tmpdir(), "schood-appeals-browser-")),
    control = randomUUID();
  const actors = {
    owner: "00000000-0000-4000-8000-000000000001",
    reviewer: "00000000-0000-4000-8000-000000000002",
    candidate: "00000000-0000-4000-8000-000000000003",
    observer: "00000000-0000-4000-8000-000000000004",
  };
  if(workload)actors.boardobserver='00000000-0000-4000-8000-000000000071';
  let server,
    bridge,
    base,
    appealHandler,
    gradingHandler,
    certificateHandler,
    documentServices,
    blueprintIds,accommodationIds,loseAccommodation=accommodations,loseBreakBegin=accommodations,loseBlueprintCreate=blueprints,loseBlueprintPublish=blueprints,loseBlueprintStart=blueprints,
    certificateOptions,
    rotateSigner,
    retireSigner,
    retireReplacementSigner,
    cohortHandler,assessmentHandler,importHandler,importBank,analyticsHandler,analyticsIds,feedbackHandler,feedbackIds,artifactHandler,rosterWorker,seededCohort,rosterSitting,rosterFetch,
    started = false,
    loseSubmit = true,
    loseDecision = true,
    losePrepare = certificates,
    loseIssue = certificates,
    loseRevocation = certificates,
    loseReplacementPrepare=lifecycle,loseReplacementSeal=lifecycle,loseRetirement=lifecycle,
    loseCohort=cohorts,loseJob=cohorts,loseStep=cohorts,
    loseImportStage=imports,loseImportStep=imports,
    failImportRefresh=false,
    loseAnalytics=analytics,
    loseFeedback=feedback,
    captureServices,captureIds,
    scoreSnapshot,staffIds,staffHandler,loseStaffMembership=staff,invitationIds,invitationHandler,invitationOptions,rotateInvitation,loseInvitationCreate=invitations,loseInvitationAccept=invitations,mailServices,loseMailQueue=mail,loseMailReport=mail;
  const originalFetch=globalThis.fetch,rosterSecret='synthetic-roster-'+randomUUID(),messages=[];
  const docker = (args, input) => {
    const out = spawnSync("docker", args, {
      input,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (out.status !== 0) throw new Error(out.stderr || String(out.error));
    return out.stdout.trim();
  };
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
  // HTTP/PostgREST adapter reads must not block the server's event loop while
  // another request waits on PostgreSQL. Setup/control scripts still use sql().
  const sqlRead=async(query)=>{const{data,error}=await bridge.query(query);if(error)throw new Error(error.message);return JSON.stringify(data);};
  const literal = (value) =>
    value === null ? "null" : "'" +
      (typeof value === "object" ? JSON.stringify(value) : String(value))
        .replaceAll("'", "''") +
      "'";
  const tokens = new Map();
  const database = {
    rpc(name, args) {
      assert.match(
        name,
        /^(assessment_(workspaces|invitation_(mail_(read|command|claim|begin|report)|read|command|preview|accept)|staff_(read|command)|command(_live_gate)?|runtime_(snapshot|command|expire|schedule_claim|schedule_reconcile)|appeal_(read|command)|grading_(read|command)|certificate_(read|command|seal|status|reference|document_report)|cohort_(read|command)|roster_(claim|step)|bank_(import_(read|command)|export)|analytics_(read|command)|feedback_(read|command)|artifact_read|released_breakdown|has_capability)|proctor_(command|can_access|workload_(read|staff|command)|capture_(read|command(_live_gate)?)|live_(read|command|context|report)|recording_(command|checkpoint|transport|catalog|read)))$/,
      );
      const query=`select to_jsonb(public.${name}(${Object.entries(args).map(([key,value])=>{assert.match(key,/^p_[a-z][a-z0-9_]*$/);return `${key}=>${literal(value)}${key==='p_data'?'::jsonb':''}`;}).join(',')}));`;
      return bridge.query(query).then(async result=>{
        if(!result.error&&name==='assessment_certificate_command'&&args.p_action==='certificate.prepare'&&losePrepare){losePrepare=false;await rotateSigner();return{data:null,error:{code:'08006',message:'Committed preparation receipt lost'}};}
        if(!result.error&&name==='assessment_certificate_command'&&args.p_action==='certificate.replace.prepare'&&loseReplacementPrepare){loseReplacementPrepare=false;return{data:null,error:{code:'08006',message:'Committed replacement preparation reply lost'}};}
        return result;
      });
    },
  };
  const auth = {
    auth: {
      async getUser(token) {
        const session = tokens.get(token);
        return {
          data: { user: session?.user ?? null },
          error: session ? null : "Synthetic token unknown",
        };
      },
    },
  };
  const reply = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  async function dispose() {
    if(rosterFetch)globalThis.fetch=originalFetch;
    if (server) await new Promise((resolve) => server.close(resolve));
    await captureServices?.dispose();
    await mailServices?.dispose();
    await documentServices?.dispose();
    bridge?.close();
    if (started) {
      assert.match(container, /^schood-appeals-browser-[a-f0-9]{8}$/);
      spawnSync("docker", ["stop", container], {
        encoding: "utf8",
        timeout: 20000,
      });
    }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("schood-appeals-browser-"));
    await rm(directory, { recursive: true, force: true });
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
    for (let index = 0; index < 40; index++) {
      if (
        spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"])
          .status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
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
      "20261014150000_assessment_appeals",
      "20261014160000_assessment_certificates",
      "20261014170000_assessment_cohorts",
      "20261019100000_assessment_bank_imports",
      "20261019110000_assessment_analytics",
      "20261019120000_assessment_feedback",
      "20261019130000_proctor_capture_launch",
      "20261020100000_proctor_capture_watchdog",
      "20261020110000_assessment_image_responses",
      "20261020120000_assessment_media_answers",
      "20261020130000_assessment_answer_recovery",
      "20261020140000_assessment_native_audio",
      "20261020150000_assessment_qti_jobs",
      "20261020160000_assessment_qti_byte_verification",
      "20261020170000_assessment_memberships",
      "20261020180000_assessment_invitations",
      "20261020190000_assessment_invitation_mail",
      "20261020200000_proctor_live_connections",
      "20261020210000_proctor_live_launch",
      "20261020220000_proctor_workload",
      "20261020230000_assessment_certificate_documents",
      "20261021000000_assessment_certificate_lifecycle",
      "20261021010000_assessment_blueprints",
      "20261021020000_assessment_accommodations",
      "20261022110000_assessment_entitlements",
    ];
    sql(
      await readFile(
        path.join(root, "supabase/tests/assessment-cloud.fixture.sql"),
        "utf8",
      ),
    );
    for (const name of migrations) {
      sql(
        await readFile(
          path.join(root, `supabase/migrations/${name}.sql`),
          "utf8",
        ),
      );
    }
    const runtime = await readFile(
      path.join(root, "supabase/tests/assessment-runtime.fixture.sql"),
      "utf8",
    );
    for (
      const name of [
        "assessment-cloud",
        "proctor",
        "proctor-candidate",
        "assessment-runtime",
        "assessment-recovery",
        "assessment-grading",
      ]
    ) {
      sql(
        runtime + "\n" +
          await readFile(
            path.join(root, `supabase/tests/${name}.integration.sql`),
            "utf8",
          ),
      );
    }
    sql("grant select on public.tenant_memberships to service_role;");
    scoreSnapshot = sql(
      "select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;",
    );
    sql(
      `alter table users add column full_name text;alter table tenants add column name text;update users set full_name='Dilshod Karimov' where id='${actors.candidate}';update tenants set name='Assessment test center';`,
    );
    if(imports){importBank=JSON.parse(sql(`select assessment_command('${actors.owner}','${tenant}','fixture-import-bank','bank.create','{"title":"Native import library"}');`)).id;sql('grant select on assessment_item_banks to service_role;');}
    if(staff)staffIds=seedAssessmentStaff(sql,actors,tenant);
    if(workload){sql(await readFile(path.join(root,'supabase/tests/proctor-workload.fixture.sql'),'utf8'));sql("update users set full_name=case id when '00000000-0000-4000-8000-000000000071' then 'Board Observer' when '00000000-0000-4000-8000-000000000072' then 'Board Reviewer' else 'Board Candidate' end where id in('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000073');");}
    if(blueprints)blueprintIds=seedAssessmentBlueprints(sql,actors,tenant);
    if(accommodations)accommodationIds=seedAssessmentAccommodations(sql,actors,tenant);
    if(invitations)invitationIds=seedAssessmentInvitations(sql,actors,tenant);
    if(analytics){sql(runtime+'\n'+await readFile(path.join(root,'supabase/tests/assessment-analytics.fixture.sql'),'utf8'));analyticsIds=JSON.parse(sql('select to_jsonb(t) from assessment_analytics_fixture_ids t;'));scoreSnapshot=sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;');}
    if(feedback){sql(await readFile(path.join(root,'supabase/tests/assessment-feedback.fixture.sql'),'utf8'));feedbackIds=JSON.parse(sql('select to_jsonb(t) from assessment_feedback_fixture_ids t;'));scoreSnapshot=sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;');}
    if(capture){
      sql(`create table public.assessment_native_capture_fixture(window_id uuid,registration_id uuid);do $$ declare w uuid;r uuid;p uuid;begin
       w:=(assessment_command('${actors.owner}','${tenant}','native-capture-window','window.create',jsonb_build_object('assessment_version_id',(select assessment_version_id from assessment_exam_windows where title='Grading sitting'),'title','Native required capture','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'))->>'id')::uuid;
       r:=(assessment_command('${actors.owner}','${tenant}','native-capture-register','registration.create',jsonb_build_object('window_id',w,'candidate_id','${actors.candidate}'))->>'id')::uuid;
       p:=(proctor_command('${actors.owner}','${tenant}','native-capture-policy','policy.create','{"title":"Native capture before the clock","policy":{"schema_version":"proctor.policy.v1","mode":"${live?'live':'record_review'}","identity_level":0,"camera":true,"microphone":true,"screen":true,"second_camera":false,"auto_pause":true,"recording_retention_days":7,"identity_retention_days":30,"recovery_seconds":10,"reviewer_quorum":2}}')->>'id')::uuid;
       perform proctor_command('${actors.owner}','${tenant}','native-capture-attach','policy.attach',jsonb_build_object('window_id',w,'policy_id',p));insert into assessment_native_capture_fixture values(w,r);end;$$;`);
      captureIds=JSON.parse(sql('select to_jsonb(t) from assessment_native_capture_fixture t;'));
      if(live)sql(`update tenant_memberships set role='member' where tenant_id='${tenant}' and user_id='${actors.reviewer}';insert into tenant_memberships(tenant_id,user_id,status,role) select '${tenant}','${actors.observer}','active','member' where not exists(select 1 from tenant_memberships where tenant_id='${tenant}' and user_id='${actors.observer}');`);
    }
    if(cohorts){
      sql(`insert into users(id,full_name) select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Roster student '||n from generate_series(1,121)n;insert into tenant_memberships(tenant_id,user_id,status,role) select '${tenant}',id,'active','member' from users where id::text like '70000000-%';grant select on assessment_registrations,assessment_exam_windows to service_role;`);
      seededCohort=JSON.parse(sql(`select assessment_cohort_command('${actors.owner}','${tenant}','fixture-large-cohort','cohort.create','{"title":"Large reviewed class","description":"121 candidate fixture"}');`)).id;
      sql(`do $$ declare n integer;begin for n in 1..121 loop perform assessment_cohort_command('${actors.owner}','${tenant}','fixture-member-'||n,'member.add',jsonb_build_object('cohort_id','${seededCohort}','user_id',('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'expected_revision',n,'extra_seconds',0,'reason','Approved fixture roster'));end loop;end;$$;`);
      rosterSitting=JSON.parse(sql(`select assessment_command('${actors.owner}','${tenant}','fixture-roster-sitting','window.create',jsonb_build_object('assessment_version_id',(select id from assessment_versions limit 1),'title','Native cohort sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '2 hours'));`)).id;
    }
    for (const [name, id] of Object.entries(actors)) {
      const exp = Math.floor(Date.now() / 1000) + 3600,
        user = {
          id,
          email: name + "@example.test",
          email_confirmed_at:name==='unverified'?undefined:'2026-10-20T00:00:00Z',
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
        };
      const token =
        Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") +
        "." +
        Buffer.from(JSON.stringify({ sub: id, exp, role: "authenticated" }))
          .toString("base64url") +
        ".synthetic";
      tokens.set(token, {
        access_token: token,
        refresh_token: "synthetic-" + name,
        expires_at: exp,
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
    bridge=await fixtureDatabase(container,sql);
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, base ?? "http://127.0.0.1");
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (url.pathname === "/test/info") {
          reply(res, 200, { tenant, control,document_enabled:documents,lifecycle_enabled:lifecycle,blueprints_enabled:blueprints,blueprintIds,accommodations_enabled:accommodations,accommodationIds,live_enabled:live,mail_enabled:mail,seededCohort,rosterSitting,importBank,analyticsIds,feedbackIds,captureIds,invitationIds:invitationIds?{role:invitationIds.role,invited:invitationIds.invited}:undefined,staffIds:staffIds?{local:staffIds.local,legacy:staffIds.legacy}:undefined });
          return;
        }
        if (url.pathname.startsWith("/test/")) {
          if (req.headers["x-fixture-control"] !== control) {
            reply(res, 403, {});
            return;
          }
          if(live&&url.pathname==='/test/live-provider'){const response=await captureServices.liveControl(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if(live&&url.pathname==='/test/live-proof'){reply(res,200,{...captureServices.liveProof(),...JSON.parse(await sqlRead(`select jsonb_build_object('live_connections',(select count(*) from proctor_live_connections c join proctor_sessions s on s.id=c.session_id where s.registration_id='${captureIds.registration_id}'),'live_open',(select count(*) from proctor_live_connections c join proctor_sessions s on s.id=c.session_id where s.registration_id='${captureIds.registration_id}' and c.state not in('closed','faulted')),'live_active',(select count(*) from proctor_live_connections c join proctor_sessions s on s.id=c.session_id where s.registration_id='${captureIds.registration_id}' and c.state='active'),'live_pauses',(select count(*) from assessment_audit_events e join proctor_sessions s on s.id=e.target_id where s.registration_id='${captureIds.registration_id}' and e.action='proctor.capture.paused'),'ready',(select (proctor_capture_read('${actors.candidate}','${tenant}',id)->>'ready')::boolean from proctor_sessions where registration_id='${captureIds.registration_id}'));`))});return;}
          if (url.pathname === "/test/revoke") {
            sql(
              `update tenant_memberships set status='inactive' where tenant_id='${tenant}' and user_id='${actors.reviewer}';`,
            );
            reply(res, 200, {});
            return;
          }
          if(workload&&url.pathname==='/test/workload-proof'){reply(res,200,{...JSON.parse(sql("select jsonb_build_object('sessions',(select count(*) from fixture_proctor_workload),'commands',(select count(*) from proctor_workload_commands),'audits',(select count(*) from assessment_audit_events where action like 'proctor.workload.%'),'active_observer_assignments',(select count(*) from proctor_assignments where session_id in(select session_id from fixture_proctor_workload) and active and assignment_role='observer'),'academic_attempts',(select count(*) from assessment_attempts));")),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if(url.pathname==='/test/revoke-coordinator'){sql(`update tenant_memberships set status='inactive' where tenant_id='${tenant}' and user_id='${actors.owner}';`);reply(res,200,{});return;}
          if(url.pathname==='/test/capture-proof'){
            const proof=JSON.parse(sql(`select jsonb_build_object('attempts',(select count(*) from assessment_attempts where registration_id='${captureIds.registration_id}'),'attempt_state',(select state from assessment_attempts where registration_id='${captureIds.registration_id}'),'monitoring_sessions',(select count(*) from proctor_sessions where registration_id='${captureIds.registration_id}'),'session_id',(select id from proctor_sessions where registration_id='${captureIds.registration_id}'),'responses',(select count(*) from assessment_response_journal j join assessment_attempts a on a.id=j.attempt_id where a.registration_id='${captureIds.registration_id}'),'recordings',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'source',r.source,'state',r.state,'sequence',r.last_sequence,'head_hash',r.head_hash,'days',extract(epoch from(r.expires_at-r.created_at))/86400)),'[]') from proctor_recordings r join proctor_sessions s on s.id=r.session_id where s.registration_id='${captureIds.registration_id}'),'segments',(select count(*) from proctor_recording_segments g join proctor_recordings r on r.id=g.recording_id join proctor_sessions s on s.id=r.session_id where s.registration_id='${captureIds.registration_id}' and g.kind='media' and g.state='committed'),'parts',(select count(*) from proctor_recording_parts p join proctor_recordings r on r.id=p.recording_id join proctor_sessions s on s.id=r.session_id where s.registration_id='${captureIds.registration_id}'),'opens',(select count(*) from assessment_audit_events where action='proctor.capture.open'),'activations',(select count(*) from assessment_audit_events where action='proctor.capture.activated'));`));
            reply(res,200,{...proof,scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;
          }
          if(url.pathname==='/test/feedback-proof'){reply(res,200,{...JSON.parse(sql("select jsonb_build_object('versions',(select count(*) from assessment_feedback_versions),'approvals',(select count(*) from assessment_feedback_approvals),'holds',(select count(*) from assessment_feedback_holds),'audits',(select count(*) from assessment_audit_events where action like 'feedback.%'),'policies',(select jsonb_agg(jsonb_build_object('generation',r.generation,'level',l.feedback_snapshot->>'level','future',(l.feedback_snapshot->>'available_at')::timestamptz>clock_timestamp()) order by r.generation) from assessment_grading_releases l join assessment_grading_runs r on r.id=l.run_id join assessment_attempts a on a.id=r.attempt_id join assessment_registrations g on g.id=a.registration_id join assessment_exam_windows w on w.id=g.window_id where w.title='Grading sitting'));")),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if(url.pathname==='/test/analytics-proof'){reply(res,200,{...JSON.parse(sql("select jsonb_build_object('snapshots',(select count(*) from assessment_analytics_snapshots),'rows',(select count(*) from assessment_analytics_rows),'audits',(select count(*) from assessment_audit_events where action='analytics.snapshot.created'));")),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if(url.pathname==='/test/import-proof'){reply(res,200,{...JSON.parse(sql("select jsonb_build_object('imports',(select count(*) from assessment_bank_imports),'rows',(select count(*) from assessment_bank_import_rows),'created',(select count(*) from assessment_bank_import_rows where state='created'),'drafts',(select count(*) from assessment_item_versions where payload->>'prompt' like 'Native imported question %' and status='draft'),'approved',(select count(*) from assessment_item_versions where payload->>'prompt' like 'Native imported question %' and status='approved' and approved_by<>created_by),'steps',(select count(*) from assessment_audit_events where action='bank-import.step'));")),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if(staff&&url.pathname==='/test/staff-proof'){reply(res,200,assessmentStaffProof(sql,tenant,staffIds,scoreSnapshot));return;}
          if(invitations&&url.pathname==='/test/invitation-proof'){reply(res,200,{...assessmentInvitationProof(sql,tenant,invitationIds,scoreSnapshot),...(mailServices?mailServices.proof():{})});return;}
          if(mail&&url.pathname==='/test/mail/run'){const mode=body.length?JSON.parse(body).mode:'accept';assert.ok(['accept','uncertain','temporary','reject'].includes(mode));reply(res,200,await mailServices.run(mode));return;}
          if(mail&&url.pathname==='/test/mail/mailbox'){reply(res,200,mailServices.mailbox());return;}
          if(mail&&url.pathname==='/test/mail/advance-reminders'){mailServices.advanceReminders();reply(res,200,{});return;}
          if(url.pathname==='/test/roster-run'){
            const env={SUPABASE_URL:'https://canonical-roster.invalid',SUPABASE_ANON_KEY:'synthetic-anon',ASSESSMENT_ROSTER_SECRET:rosterSecret,ROSTER_BATCH_LIMIT:'1',ROSTER_QUEUE:{async sendBatch(rows){messages.push(...rows.map(row=>({body:row.body,attempts:1})));}}};
            await rosterWorker.scheduled({},env);let acked=0,retried=0;const batch=messages.splice(0).map(row=>({...row,ack(){acked++;},retry(){retried++;messages.push({...row,attempts:row.attempts+1});}}));await rosterWorker.queue({messages:batch},env);
            reply(res,200,{acked,retried,jobs:JSON.parse(sql("select coalesce(jsonb_agg(jsonb_build_object('id',id,'state',state,'processed',processed,'total',total)),'[]') from assessment_roster_jobs;"))});return;
          }
          if(url.pathname==='/test/roster-proof'){reply(res,200,{...JSON.parse(sql("select jsonb_build_object('jobs',(select count(*) from assessment_roster_jobs),'targets',(select count(*) from assessment_roster_targets),'registered',(select count(*) from assessment_roster_targets where outcome='created'),'finished_audits',(select count(*) from assessment_audit_events where action='cohorts.job.finished'),'blocked_audits',(select count(*) from assessment_audit_events where action='cohorts.job.blocked'));")),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if (url.pathname === "/test/proof") {
            const proof = JSON.parse(
              sql(
                "select jsonb_build_object('appeals',(select count(*) from assessment_result_appeals),'events',(select count(*) from assessment_appeal_events),'commands',(select count(*) from assessment_appeal_commands),'regrade_jobs',(select count(*) from assessment_grading_jobs where generation=3),'audit',(select count(*) from assessment_audit_events where action like 'appeal.%'));",
              ),
            );
            reply(res, 200, {
              ...proof,
              scores_unchanged: scoreSnapshot ===
                sql(
                  "select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;",
                ),
            });
            return;
          }
          if (url.pathname === "/test/retire-signing-key") {
            await retireSigner();
            reply(res, 200, {});
            return;
          }
          if(accommodations&&url.pathname==='/test/accommodation-bump'){reply(res,200,bumpAccommodation(sql,actors,tenant,accommodationIds));return;}
          if(accommodations&&(url.pathname==='/test/accommodation-pause'||url.pathname==='/test/accommodation-resume')){setAccommodatedAttemptState(sql,accommodationIds,url.pathname.endsWith('pause')?'paused':'active');reply(res,200,{});return;}
          if(accommodations&&url.pathname==='/test/accommodation-proof'){reply(res,200,{...assessmentAccommodationProof(sql,accommodationIds),approval_reply_lost:!loseAccommodation,break_reply_lost:!loseBreakBegin,scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if(blueprints&&url.pathname==='/test/blueprint-proof'){reply(res,200,{...assessmentBlueprintProof(sql),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')});return;}
          if (url.pathname === "/test/certificate-proof") {
            if(lifecycle&&url.searchParams.get('lifecycle')==='1'){reply(res,200,{...JSON.parse(sql("select jsonb_build_object('certificates',(select count(*) from assessment_certificates),'retirements',(select count(*) from assessment_certificate_program_retirements),'replacement_intents',(select count(*) from assessment_certificate_replacement_preparations),'replaced_audits',(select count(*) from assessment_audit_events where action='certificates.replaced'),'replaced_events',(select count(*) from domain_event_outbox where event_type='assessment.certificate.replaced'),'issued_audits',(select count(*) from assessment_audit_events where action='certificates.issued'),'retired_audits',(select count(*) from assessment_audit_events where action='certificates.program.retire'),'revoked',(select count(*) from assessment_certificates where state='revoked'),'documents',(select count(*) from assessment_certificate_documents),'document_audits',(select count(*) from assessment_audit_events where action='certificates.document.rendered'));")),scores_unchanged:scoreSnapshot===sql("select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;")});return;}
            if(documents&&url.searchParams.get('documents')==='1'){reply(res,200,JSON.parse(sql("select jsonb_build_object('documents',(select count(*) from assessment_certificate_documents),'document_audits',(select count(*) from assessment_audit_events where action='certificates.document.rendered'),'document_locales',(select jsonb_agg(locale order by locale) from assessment_certificate_documents));")));return;}
            const proof = JSON.parse(
              sql(
                "select jsonb_build_object('certificates',(select count(*) from assessment_certificates),'revoked',(select count(*) from assessment_certificates where state='revoked'),'programs',(select count(*) from assessment_certificate_programs where approved_by is not null),'issuance_audits',(select count(*) from assessment_audit_events where action='certificates.issued'),'revocation_audits',(select count(*) from assessment_audit_events where action='certificates.certificate.revoke'),'issued_events',(select count(*) from domain_event_outbox where event_type='assessment.certificate.issued'))",
              ),
            );
            reply(res, 200, {
              ...proof,
              scores_unchanged: scoreSnapshot ===
                sql(
                  "select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;",
                ),
            });
            return;
          }
        }
        if (url.pathname === "/auth/v1/token") {
          const payload = JSON.parse(body),
            session = payload.grant_type === "refresh_token" ||
                url.searchParams.get("grant_type") === "refresh_token"
              ? [...tokens.values()].find((row) =>
                row.refresh_token === payload.refresh_token
              )
              : [...tokens.values()].find((row) =>
                row.user.email === payload.email
              );
          reply(res, session ? 200 : 401, session ?? {});
          return;
        }
        if (url.pathname === "/auth/v1/logout") {
          reply(res, 200, {});
          return;
        }
        const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")
            ?.[1],
          session = tokens.get(token);
        if (url.pathname === "/auth/v1/user") {
          reply(res, session ? 200 : 401, session?.user ?? {});
          return;
        }
        if(live&&url.pathname.startsWith('/v1/connections/')){const response=await captureServices.live(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
        if(accommodations&&loseBreakBegin&&req.method==='POST'&&url.pathname.startsWith('/coordinator/')&&body.length&&JSON.parse(body).action==='break.begin'){const response=await captureServices.coordinator(new Request(base+req.url,{method:req.method,headers:req.headers,body}));if(response.ok){loseBreakBegin=false;reply(res,503,{code:'fixture_reply_lost',error:'The break started but its reply was lost. Retry the saved request.'});return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
        if(capture&&(url.pathname.startsWith('/functions/v1/proctor/')||url.pathname.startsWith('/coordinator/')||url.pathname.startsWith('/v1/recordings/'))){const request=new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}),response=await(url.pathname.startsWith('/functions/v1/proctor/')?captureServices.proctor(request):url.pathname.startsWith('/coordinator/')?captureServices.coordinator(request):captureServices.evidence(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
        if (url.pathname.startsWith("/functions/v1/assessment-cloud/")) {
          if(accommodations&&/\/(workspaces|item-banks|item-versions|rubrics|assessments|assessment-revisions|assessment-versions|exam-windows|registrations|commands)$/.test(url.pathname)){const response=await assessmentHandler(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})})),action=body.length?JSON.parse(body).action:null;if(response.ok&&action==='registration.accommodate'&&loseAccommodation){loseAccommodation=false;reply(res,503,{code:'fixture_reply_lost',error:'The approval committed but its reply was lost. Retry the saved request.'});return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if(blueprints&&(/\/(workspaces|item-banks|item-versions|rubrics|assessments|assessment-revisions|assessment-versions|exam-windows|registrations|commands|blueprints\/preview)$/.test(url.pathname)||/\/item-versions\/[^/]+\/review$/.test(url.pathname))){const response=await assessmentHandler(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})})),action=body.length?JSON.parse(body).action:null;if(response.ok&&((action==='assessment.create'&&loseBlueprintCreate)||(action==='assessment.publish'&&loseBlueprintPublish)||(action==='attempt.start'&&loseBlueprintStart))){if(action==='assessment.create')loseBlueprintCreate=false;else if(action==='assessment.publish')loseBlueprintPublish=false;else loseBlueprintStart=false;reply(res,503,{code:'fixture_reply_lost',error:'The blueprint command committed but its reply was lost. Retry the saved request.'});return;}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if(staff||invitations){
            const endpoint=url.pathname.includes('/invitations/mail/')?mailServices?.handler:url.pathname.includes('/invitations/')?invitationHandler:url.pathname.includes('/staff/')?staffHandler:url.pathname.includes('/grading/')?gradingHandler:assessmentHandler;
            if(!endpoint){reply(res,503,{code:'fixture_mail_disabled',error:'Mail fixture is disabled.'});return;}
            const response=await endpoint(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));
            if(response.ok&&req.method==='POST'&&url.pathname.includes('/staff/')&&JSON.parse(body).action==='member.suspend'&&loseStaffMembership){loseStaffMembership=false;reply(res,503,{code:'fixture_reply_lost',error:'The Assessment suspension committed, but its receipt reply was lost.'});return;}
            if(response.ok&&url.pathname.includes('/invitations/')&&body.length){const input=JSON.parse(body),action=input.action;
              if(action==='invite.create'&&loseInvitationCreate){loseInvitationCreate=false;await rotateInvitation();reply(res,503,{code:'fixture_reply_lost',error:'Invitation created; its reply was lost and the active signing key rotated.'});return;}
              if(action==='invite.accept'&&loseInvitationAccept){loseInvitationAccept=false;reply(res,503,{code:'fixture_reply_lost',error:'Invitation accepted; its reply was lost.'});return;}
              if(mail&&action==='mail.queue'&&loseMailQueue){loseMailQueue=false;reply(res,503,{code:'fixture_reply_lost',error:'Mail queue receipt lost after commit.'});return;}
              if(mail&&action==='mail.report'&&input.data.outcome==='accepted'&&loseMailReport){loseMailReport=false;reply(res,503,{code:'fixture_reply_lost',error:'SMTP acceptance report reply lost after commit.'});return;}
            }
            res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
          }
          if(capture&&(/\/candidate\/(registrations|preparation|attempts\/[^/]+)$/.test(url.pathname)||url.pathname.endsWith('/assessment-cloud/commands'))){const response=await assessmentHandler(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if(req.method==='GET'&&url.pathname.endsWith('/assessment-cloud/artifacts/library')){const response=await artifactHandler(new Request(base+req.url,{headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if (
            url.pathname.includes("/appeals/") ||
            url.pathname.includes("/certificates/") ||
            url.pathname.includes('/cohorts/') ||
            url.pathname.includes('/imports/') ||
            url.pathname.includes('/analytics/') ||
            url.pathname.includes('/feedback/') ||
            url.pathname.includes("/grading/")
          ) {
            const request = new Request(base + req.url, {
              method: req.method,
              headers: req.headers,
              ...(body.length ? { body } : {}),
            });
            const response = await (documents&&/\/certificates\/(?:reference\/resolve|[^/]+\/pdf)$/.test(url.pathname)?documentServices.handler:url.pathname.includes("/appeals/")
              ? appealHandler
              : url.pathname.includes("/certificates/")
              ? certificateHandler
              : url.pathname.includes('/feedback/')?feedbackHandler:url.pathname.includes('/analytics/')?analyticsHandler:url.pathname.includes('/imports/')?importHandler:url.pathname.includes('/cohorts/')?cohortHandler:gradingHandler)(request);
            const action = body.length ? JSON.parse(body).action : null;
            if(response.ok&&action==='certificate.replace'&&loseReplacementSeal){loseReplacementSeal=false;await retireReplacementSigner();reply(res,503,{code:'fixture_reply_lost',error:'Committed replacement signature reply lost. Retry the saved request.'});return;}
            if(response.ok&&action==='program.retire'&&loseRetirement){loseRetirement=false;reply(res,503,{code:'fixture_reply_lost',error:'Committed program retirement reply lost. Retry the saved request.'});return;}
            if(response.ok&&action==='policy.propose'&&loseFeedback){loseFeedback=false;reply(res,503,{code:'fixture_reply_lost',error:'Committed feedback proposal reply lost'});return;}
            if(response.ok&&action==='snapshot.create'&&loseAnalytics){loseAnalytics=false;reply(res,503,{code:'fixture_reply_lost',error:'Committed report receipt lost'});return;}
            if(response.ok&&url.pathname.includes('/imports/')&&((action==='stage'&&loseImportStage)||(action==='step'&&loseImportStep))){if(action==='stage')loseImportStage=false;else loseImportStep=false;reply(res,503,{code:'fixture_reply_lost',error:'Committed import receipt lost'});return;}
            if (
              response.ok &&
              (action === "appeal.submit" && loseSubmit ||
                action === "appeal.decide" && loseDecision ||
                action === "certificate.issue" && loseIssue ||
                action === "certificate.revoke" && loseRevocation||action==='cohort.create'&&loseCohort||action==='job.create'&&loseJob)
            ) {
              if (action === "appeal.submit") {
                loseSubmit = false;
              } else if (action === "appeal.decide") {
                loseDecision = false;
              } else if (action === "certificate.issue") {
                loseIssue = false;
                await retireSigner();
              } else if(action==='certificate.revoke')loseRevocation=false;else if(action==='cohort.create')loseCohort=false;else loseJob=false;
              reply(res, 503, {
                code: "fixture_reply_lost",
                error:
                  "The committed fixture reply was intentionally lost. Retry the saved request.",
              });
              return;
            }
            res.writeHead(
              response.status,
              Object.fromEntries(response.headers),
            );
            res.end(Buffer.from(await response.arrayBuffer()));
            return;
          }
          if (!session) {
            reply(res, 401, { code: "unauthorized" });
            return;
          }
          if (url.pathname.endsWith("/workspaces")) {
            const rows = JSON.parse(
              await sqlRead(
                `select coalesce(jsonb_agg(jsonb_build_object('tenant_id',tenant_id,'role',role,'tenants',jsonb_build_object('name','Assessment appeals test center'))),'[]') from tenant_memberships where user_id=${
                  literal(session.user.id)
                } and status='active';`,
              ),
            );
            reply(res, 200, { data: rows });
            return;
          }
          if(cohorts&&url.pathname.endsWith('/candidate/registrations')){const response=await assessmentHandler(new Request(base+req.url,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if(imports&&(/\/(item-banks|item-versions|rubrics|commands)$/.test(url.pathname)||/\/item-versions\/[^/]+\/review$/.test(url.pathname))){if(url.pathname.endsWith('/item-banks')&&failImportRefresh){failImportRefresh=false;reply(res,503,{code:'fixture_refresh_lost',error:'The committed change is safe; the fixture lost its refresh reply.'});return;}const response=await assessmentHandler(new Request(base+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}));if(response.ok&&body.length&&JSON.parse(body).action==='item.approve')failImportRefresh=true;res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
          if (
            url.pathname.endsWith("/candidate/registrations") ||
            /\/(item-banks|item-versions|rubrics|assessments|assessment-versions|exam-windows|registrations)$/
              .test(url.pathname)
          ) {
            reply(res, 200, { data: [] });
            return;
          }
          reply(res, 404, {
            code: "fixture_route_unknown",
            error: "Unknown fixture route",
          });
          return;
        }
        const app = url.pathname.startsWith("/exam/") ? "exam" : (live||workload)&&url.pathname.startsWith('/proctor/')?'proctor':"assessment",
          relative = url.pathname.slice(`/${app}/`.length),
          file = path.resolve(
            directory,
            app,
            relative.startsWith("assets/") || relative.startsWith("licenses/")
              ? relative
              : "index.html",
          );
        assert.ok(file.startsWith(path.resolve(directory, app) + path.sep));
        const bytes = await readFile(file);
        res.writeHead(200, {
          "Content-Type": file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".ttf")
            ? "font/ttf"
            : file.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html",
          "Cache-Control": "no-store",
        });
        res.end(bytes);
      } catch (cause) {
        console.error("Appeal fixture request failed:", cause.message);
        reply(res, 500, {
          code: "fixture_error",
          error: "Local fixture request failed",
        });
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const bundleFile = path.join(directory, "edge.mjs");
    await build({
      stdin: {
        contents:
          "export {createCertificateDocumentHandler} from './supabase/functions/assessment-cloud/certificate-document-handler.ts';export {createCertificateDocumentRepository} from './supabase/functions/assessment-cloud/certificate-document-repository.ts';export {createCertificateDocumentTransport} from './supabase/functions/assessment-cloud/certificate-document-transport.ts';export {ContractError} from './packages/assessment-core/src/mod.ts';" +
          "export {createImportHandler} from './supabase/functions/assessment-cloud/import-handler.ts';export {createImportRepository} from './supabase/functions/assessment-cloud/import-repository.ts';export {createAppealHandler} from './supabase/functions/assessment-cloud/appeal-handler.ts';export {createAppealRepository} from './supabase/functions/assessment-cloud/appeal-repository.ts';export {createGradingHandler} from './supabase/functions/assessment-cloud/grading-handler.ts';export {createGradingRepository} from './supabase/functions/assessment-cloud/grading-repository.ts';export {createCertificateHandler} from './supabase/functions/assessment-cloud/certificate-handler.ts';export {createCertificateRepository} from './supabase/functions/assessment-cloud/certificate-repository.ts';export {CertificateSigner} from './supabase/functions/assessment-cloud/certificate-signer.ts';export {createCohortHandler} from './supabase/functions/assessment-cloud/cohort-handler.ts';export {createCohortRepository} from './supabase/functions/assessment-cloud/cohort-repository.ts';export {default as rosterWorker} from './workers/assessment-roster/src/index.ts';export {createHandler} from './supabase/functions/assessment-cloud/handler.ts';export {createAssessmentRepository} from './supabase/functions/assessment-cloud/repository.ts';",
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: bundleFile,
    });
    const modules = await import(pathToFileURL(bundleFile).href);
    const analyticsBundle=path.join(directory,'analytics-edge.mjs');await build({stdin:{contents:"export {createAnalyticsHandler} from './supabase/functions/assessment-cloud/analytics-handler.ts';export {createAnalyticsRepository} from './supabase/functions/assessment-cloud/analytics-repository.ts';export {createArtifactHandler} from './supabase/functions/assessment-cloud/artifact-handler.ts';export {createArtifactRepository} from './supabase/functions/assessment-cloud/artifact-repository.ts';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:analyticsBundle});const analyticsModules=await import(pathToFileURL(analyticsBundle).href);analyticsHandler=analyticsModules.createAnalyticsHandler(analyticsModules.createAnalyticsRepository(auth,database),[base]);artifactHandler=analyticsModules.createArtifactHandler(analyticsModules.createArtifactRepository(auth,database),[base],{transport:'',scanner:'',scannerId:''});
    const feedbackBundle=path.join(directory,'feedback-edge.mjs');await build({stdin:{contents:"export {createFeedbackHandler} from './supabase/functions/assessment-cloud/feedback-handler.ts';export {createFeedbackRepository} from './supabase/functions/assessment-cloud/feedback-repository.ts';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:feedbackBundle});const feedbackModules=await import(pathToFileURL(feedbackBundle).href);feedbackHandler=feedbackModules.createFeedbackHandler(feedbackModules.createFeedbackRepository(auth,database),[base]);
    importHandler=modules.createImportHandler(modules.createImportRepository(auth,database),[base]);
    if(staff||invitations){const staffBundle=path.join(directory,'staff-edge.mjs');await build({stdin:{contents:"export {createStaffHandler} from './supabase/functions/assessment-cloud/staff-handler.ts';export {createStaffRepository} from './supabase/functions/assessment-cloud/staff-repository.ts';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:staffBundle});const staffModules=await import(pathToFileURL(staffBundle).href);staffHandler=staffModules.createStaffHandler(staffModules.createStaffRepository(auth,database),[base]);}
    if(invitations){const invitationBundle=path.join(directory,'invitation-edge.mjs');await build({stdin:{contents:"export {createInvitationHandler} from './supabase/functions/assessment-cloud/invitation-handler.ts';export {createInvitationRepository} from './supabase/functions/assessment-cloud/invitation-repository.ts';export {InvitationSigner} from './supabase/functions/assessment-cloud/invitation-signer.ts';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:invitationBundle});const modules=await import(pathToFileURL(invitationBundle).href),keys={one:Buffer.alloc(32,1).toString('base64url'),two:Buffer.alloc(32,2).toString('base64url')};invitationOptions={enabled:true,signer:await modules.InvitationSigner.create('one',keys),appUrl:base+'/assessment/',allowLocalhost:true};rotateInvitation=async()=>{invitationOptions.signer=await modules.InvitationSigner.create('two',keys);};invitationHandler=modules.createInvitationHandler(modules.createInvitationRepository(auth,database),[base],invitationOptions);}
    cohortHandler=modules.createCohortHandler(modules.createCohortRepository(auth,database),[base],rosterSecret);rosterWorker=modules.rosterWorker;
    if(mail)mailServices=await assessmentMailFixture({root,directory,auth,database,base,sql});
    const tables={...database,from(table){assert.ok(['assessment_definitions','assessment_definition_revisions','assessment_registrations','assessment_exam_windows','assessment_item_banks','assessment_items','assessment_item_versions','assessment_item_keys','assessment_rubrics','assessment_attempts','assessment_forms','assessment_response_journal','assessment_versions','tenant_memberships'].includes(table)||/^proctor_(policies|preparations|identity_checks|sessions|candidate_notices|notice_acknowledgements|assignments|integrity_events|review_cases|case_findings|recording_citations|window_policies)$/.test(table));const filters=[],builder={select(){return builder;},eq(name,value){assert.ok(['tenant_id','candidate_id','id','item_version_id','window_id','attempt_id','session_id','user_id','status','registration_id','notice_id','policy_id','active','case_id','assessment_id','revision'].includes(name));filters.push(`${name}=${literal(value)}`);return builder;},in(name,values){assert.equal(name,'id');filters.push(`id=any(array[${values.map(literal).join(',')}]::uuid[])`);return builder;},then(resolve,reject){return builder.limit(1000).then(resolve,reject);},async maybeSingle(){const result=await builder.limit(1);return{...result,data:result.data[0]??null};},async limit(count){assert.ok(Number.isSafeInteger(count)&&count>=1&&count<=1000);return {data:JSON.parse(await sqlRead(`select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select * from ${table} ${filters.length?'where '+filters.join(' and '):''} limit ${count})t;`)),error:null};}};return {select:builder.select};}};
    assessmentHandler=modules.createHandler({repository:modules.createAssessmentRepository(auth,tables,{liveLaunchEnabled:live}),allowedOrigins:[base],captureLaunchEnabled:capture});
    if(capture)captureServices=await capturePorts({root,directory,base,auth,database,tables,live,workload});
    if(cohorts){rosterFetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url??input.toString());if(url.hostname!=='canonical-roster.invalid')return originalFetch(input,init);const request=new Request(input,init),body=await request.clone().json(),response=await cohortHandler(new Request(base+url.pathname,{method:request.method,headers:request.headers,body:await request.text()}));if(response.ok&&body.action==='job.step'&&loseStep){loseStep=false;return Response.json({code:'fixture_reply_lost',error:'Committed roster step reply lost'},{status:503});}return response;};globalThis.fetch=rosterFetch;}
    appealHandler = modules.createAppealHandler(
      modules.createAppealRepository(auth, database),
      [base],
    );
    gradingHandler = modules.createGradingHandler(
      modules.createGradingRepository(auth, database),
      [base],
      "",
    );
    const makeKey = async () => {
        const pair = await crypto.subtle.generateKey("Ed25519", true, [
          "sign",
          "verify",
        ]);
        return await crypto.subtle.exportKey("jwk", pair.privateKey);
      },
      oldKey = await makeKey(),
      nextKey = await makeKey(),futureKey=lifecycle?await makeKey():null;
    certificateOptions = {
      enabled: certificates,
      documentsEnabled:documents,
      signer: await modules.CertificateSigner.create("fixture-a", [{
        id: "fixture-a",
        jwk: oldKey,
      }]),
    };
    rotateSigner = async () => {
      certificateOptions.signer = await modules.CertificateSigner.create(
        "fixture-b",
        [{ id: "fixture-a", jwk: oldKey }, { id: "fixture-b", jwk: nextKey }],
      );
    };
    retireSigner = async () => {
      const { d: _private, ...publicOld } = oldKey;
      certificateOptions.signer = await modules.CertificateSigner.create(
        "fixture-b",
        [{ id: "fixture-a", jwk: publicOld }, {
          id: "fixture-b",
          jwk: nextKey,
        }],
      );
    };
    retireReplacementSigner=async()=>{const{d:_a,...publicOld}=oldKey,{d:_b,...publicNext}=nextKey;certificateOptions.signer=await modules.CertificateSigner.create('fixture-c',[{id:'fixture-a',jwk:publicOld},{id:'fixture-b',jwk:publicNext},{id:'fixture-c',jwk:futureKey}]);};
    certificateHandler = modules.createCertificateHandler(
      modules.createCertificateRepository(auth, database),
      [base],
      certificateOptions,
    );
    if(documents)documentServices=await assessmentDocumentFixture({root,base,modules,repository:modules.createCertificateRepository(auth,database),database,currentSigner:()=>certificateOptions.signer});
    for (const app of ["assessment", "exam",...((live||workload)?['proctor']:[])]) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
          path.join(root, "node_modules/vite/bin/vite.js"),
          "build",
          "--base",
          `/${app}/`,
          "--outDir",
          path.join(directory, app),
        ], {
          cwd: path.join(
            root,
            "apps",
            app === "assessment" ? "assessment-cloud" : app,
          ),
          env: {
            ...process.env,
            VITE_SUPABASE_URL: base,
            VITE_SUPABASE_ANON_KEY: "synthetic-anon",
            VITE_AUTH_SHARED_COOKIE: "false",
            VITE_AUTH_COOKIE_DOMAIN: "",
            VITE_ASSESSMENT_INVITATIONS_ENABLED:invitations?'true':'false',
            VITE_ASSESSMENT_INVITATION_MAIL_ENABLED:mail?'true':'false',
            VITE_PROCTOR_EVIDENCE_URL:capture?base:'',
            VITE_PROCTOR_LIVE_URL:live?base:'',
            VITE_ASSESSMENT_COORDINATOR_URL:capture?base+'/coordinator':'',
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
    }
    return { base, dispose };
  } catch (cause) {
    await dispose();
    throw cause;
  }
}
