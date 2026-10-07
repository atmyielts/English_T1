// Real independent PostgreSQL connections, using a disposable local container.
// No linked Supabase commands, host ports, mounted volumes or production keys.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container = `schood-sat-attempt-${randomUUID().slice(0, 8)}`;
const image = 'postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const results = [];
let containerId;
function run(args, input = '', timeout = 30000) {
  return new Promise((resolve, reject) => {
    const process = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    process.stdout.on('data', data => output += data);
    process.stderr.on('data', data => error += data);
    const timer = setTimeout(() => { process.kill(); reject(new Error('Local Docker operation timed out')); }, timeout);
    process.on('error', e => { clearTimeout(timer); reject(e); });
    process.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || `Docker exit ${code}`)); });
    process.stdin.end(input);
  });
}
const sql = (query) => run(['exec','-i',container,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'], query);
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const q1='33333333-3333-4333-8333-333333333333',q2='44444444-4444-4444-8444-444444444444';
const questions=[q1,q2].map(id=>({id,type:'question_numeric',data:{prompt:'What is six plus six?'},metadata:{},correct:{value:'12'},section_type:'math',domain:'algebra',difficulty:'easy'}));
const answers={[q1]:{text:'12'},[q2]:{text:'11'}};
const items=questions.map(q=>({question_id:q.id,correct:q.id===q1,expected:q.correct,answer:answers[q.id]}));
const json=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const completeSql=(id,user=actor,a=answers,qs=questions,scored=items)=>`select complete_sat_practice_attempt('${user}','${id}',${json(a)},${json(qs)},${json(scored)});`;
const complete=async(...args)=>JSON.parse(await sql('set role service_role; '+completeSql(...args)));
async function seed(user=actor,status='in_progress') {
  const id=randomUUID(),session=randomUUID();
  await sql(`insert into sessions(id,user_id,experience_id,status,metadata) values('${session}','${user}','55555555-5555-4555-8555-555555555555','active','{"mode":"sat_practice_lab"}');
    insert into sat_practice_lab_attempts(id,user_id,session_id,question_ids,status,answers) values('${id}','${user}','${session}',array['${q1}','${q2}']::uuid[],'${status}',${json(status==='scored'?answers:{})});`);
  return id;
}
const reset=()=>sql('truncate sat_practice_attempt_results,sat_practice_lab_attempts,sat_practice_mastery,sat_practice_srs_queue,sat_practice_daily_activity,sat_practice_mistake_notebook,responses,sessions cascade;');
async function check(name,test){await reset();await test();results.push({name,status:'passed'});console.log('PASS: '+name);}
async function stats(){return JSON.parse(await sql(`select jsonb_build_object('mastery',coalesce((select sum(attempts) from sat_practice_mastery),0),'srs',coalesce((select sum(correct_count+incorrect_count) from sat_practice_srs_queue),0),'responses',(select count(*) from responses),'mistakes',(select count(*) from sat_practice_mistake_notebook),'attempts',coalesce((select sum(attempts) from sat_practice_daily_activity),0),'xp',coalesce((select sum(xp_earned) from sat_practice_daily_activity),0),'receipts',(select count(*) from sat_practice_attempt_results));`));}
const once={mastery:2,srs:2,responses:2,mistakes:1,attempts:1,xp:35,receipts:1};
try {
  containerId=await run(['run','--detach','--name',container,'--label','schood.qa=sat-attempt','--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],'',60000);
  assert.match(containerId,/^[0-9a-f]{64}$/);
  let ready=false;for(let i=0;i<30;i++){try{await sql('select 1');ready=true;break;}catch{await new Promise(done=>setTimeout(done,250));}}assert.ok(ready);
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    create schema auth;create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table users(id uuid primary key);insert into users values('${actor}'),('${other}');
    create table experiences(id uuid primary key);insert into experiences values('55555555-5555-4555-8555-555555555555');
    create table content_units(id uuid primary key);insert into content_units values('${q1}'),('${q2}');`);
  const spine=readFileSync('supabase/migrations/20260202170000_platform_spine.sql','utf8');
  const tableDDL=name=>spine.slice(spine.indexOf('create table if not exists public.'+name+' ('),spine.indexOf('\n);',spine.indexOf('create table if not exists public.'+name+' ('))+4);
  await sql(tableDDL('sessions')+'\n'+tableDDL('responses'));
  await sql("alter table sessions add column token_id uuid,add column registration_id uuid;create function auth.role() returns text language sql as $$ select coalesce(current_setting('request.jwt.claim.role',true),'') $$;");
  await sql(readFileSync('supabase/migrations/20260217193000_sessions_integrity_guard.sql','utf8'));
  await sql(readFileSync('supabase/migrations/20260303234000_fix_sessions_integrity_guard_service_role.sql','utf8'));
  for(const file of ['20260514121000_sat_practice_mistake_notebook.sql','20260514122000_sat_practice_mastery_and_plan.sql','20260514123000_sat_practice_lab_attempts_and_srs.sql','20260514124000_sat_practice_activity_and_ai_questions.sql'])await sql(readFileSync('supabase/migrations/'+file,'utf8'));
  await sql('grant all on all tables in schema public to service_role;grant select,insert,update,delete on all tables in schema public to authenticated;grant update(score_raw) on sat_practice_lab_attempts to authenticated;');
  await sql(readFileSync('supabase/migrations/20261007100000_sat_attempt_atomic_completion.sql','utf8'));
  await check('Completion writes all effects and immutable receipt once',async()=>{const id=await seed();const r=await complete(id);assert.equal(r.attempt.score_raw,1);assert.equal(Number(r.attempt.score_accuracy),0.5);assert.deepEqual(r.questions,questions);assert.deepEqual(await stats(),once);assert.equal(await sql("select status from sessions"),'completed');assert.equal(await sql('select rolling_accuracy from sat_practice_mastery'),'0.700');});
  await check('Twelve independent retries return exactly the same receipt without duplicate effects',async()=>{const id=await seed();const r=await Promise.all(Array.from({length:12},()=>complete(id)));for(const x of r)assert.deepEqual(x,r[0]);assert.deepEqual(await stats(),once);});
  await check('Concurrent different attempts preserve every aggregate update',async()=>{const ids=await Promise.all(Array.from({length:6},()=>seed()));await Promise.all(ids.map(id=>complete(id)));const s=await stats();for(const k of Object.keys(once))assert.equal(s[k],once[k]*6,k);});
  await check('Changed-answer race has one winner and a conflict without extra XP',async()=>{const id=await seed(),changed={...answers,[q2]:{text:'12'}},changedItems=items.map(x=>x.question_id===q2?{...x,answer:changed[q2],correct:true}:x);const r=await Promise.allSettled([complete(id),complete(id,actor,changed,questions,changedItems)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.match(r.find(x=>x.status==='rejected').reason.message,/already submitted/);assert.equal((await stats()).attempts,1);});
  await check('A late response failure rolls back mastery, SRS, notebook, activity and scoring',async()=>{const id=await seed();await sql(`create function qa_response_failure() returns trigger language plpgsql as $$ begin if new.content_unit_id='${q2}' then raise exception 'QA late failure';end if;return new;end $$;create trigger qa_response_failure before insert on responses for each row execute function qa_response_failure();`);try{await assert.rejects(complete(id),/QA late failure/);assert.deepEqual(await stats(),Object.fromEntries(Object.keys(once).map(k=>[k,0])));assert.equal(await sql('select status from sat_practice_lab_attempts'),'in_progress');assert.equal(await sql('select status from sessions'),'active');}finally{await sql('drop trigger qa_response_failure on responses;drop function qa_response_failure();');}await complete(id);assert.deepEqual(await stats(),once);});
  await check('Incomplete questions or wrong question identity cannot partially score',async()=>{const id=await seed();await assert.rejects(complete(id,actor,answers,questions.slice(0,1),items),/complete question set/);await assert.rejects(complete(id,actor,answers,[questions[1],questions[0]],items),/Invalid scored question/);assert.equal((await stats()).mastery,0);});
  await check('Foreign actor and extra answers are rejected',async()=>{const id=await seed();await assert.rejects(complete(id,other),/Attempt not found/);await assert.rejects(complete(id,actor,{...answers,[randomUUID()]:'x'}),/does not belong/);assert.equal((await stats()).receipts,0);});
  await check('Legacy scored attempts return old result without any re-award',async()=>{const id=await seed(actor,'scored');await sql(`update sat_practice_lab_attempts set score_raw=1,score_accuracy=.5 where id='${id}';`);const r=await complete(id);assert.equal(r.legacy_result,true);assert.equal(r.attempt.score_raw,1);assert.equal((await stats()).xp,0);await assert.rejects(complete(id,actor,{}),/already submitted/);});
  await check('Snapshot replay survives source content deletion',async()=>{const id=await seed();const r=await complete(id);await sql(`delete from responses;delete from content_units where id='${q1}';`);assert.deepEqual(await complete(id,actor,answers,[],[]),r);await sql(`insert into content_units values('${q1}');`);});
  await check('Browser roles cannot finalize, forge progress, alter scores or read private snapshots',async()=>{const id=await seed();for(const role of ['anon','authenticated']){await assert.rejects(sql(`set role ${role};${completeSql(id)}`),/permission denied/);await assert.rejects(sql(`set role ${role};select * from sat_practice_attempt_results;`),/permission denied/);}for(const t of ['sat_practice_lab_attempts','sat_practice_mastery','sat_practice_srs_queue','sat_practice_daily_activity','sat_practice_mistake_notebook'])await assert.rejects(sql(`set role authenticated;update ${t} set user_id='${actor}';`),/permission denied/);await assert.rejects(sql(`set role authenticated;update sat_practice_lab_attempts set score_raw=100;`),/permission denied/);});
  await check('Owned reads remain isolated and shared simulator write grants are preserved',async()=>{await seed();await seed(other);assert.equal(await sql(`set role authenticated;set request.jwt.claim.sub='${actor}';select count(*) from sat_practice_lab_attempts;`),'1');assert.equal(await sql("select has_table_privilege('authenticated','sessions','INSERT') and has_table_privilege('authenticated','responses','INSERT');"),'t');});
  await check('Wrong session owner prevents all progress changes',async()=>{const id=await seed();await sql(`update sessions set user_id='${other}';`);await assert.rejects(complete(id),/Invalid drill session/);assert.equal((await stats()).xp,0);});
  await check('Failure saving the final receipt rolls back every completed side effect',async()=>{
    const id=await seed();
    await sql("create function qa_receipt_failure() returns trigger language plpgsql as $$ begin raise exception 'QA receipt failure';end $$;create trigger qa_receipt_failure before insert on sat_practice_attempt_results for each row execute function qa_receipt_failure();");
    try {await assert.rejects(complete(id),/QA receipt failure/);assert.deepEqual(await stats(),Object.fromEntries(Object.keys(once).map(k=>[k,0])));assert.equal(await sql('select status from sessions'),'active');assert.equal(await sql('select status from sat_practice_lab_attempts'),'in_progress');}
    finally {await sql('drop trigger qa_receipt_failure on sat_practice_attempt_results;drop function qa_receipt_failure();');}
    await complete(id);assert.deepEqual(await stats(),once);
  });
  const report={checkedAt:new Date().toISOString(),engine:image,productionContacted:false,checks:results};
  mkdirSync('docs/customer-readiness',{recursive:true});
  writeFileSync('docs/customer-readiness/2026-10-07-sat-completion-db.json',JSON.stringify(report,null,2)+'\n');
} finally {
  if(containerId){const label=await run(['inspect','--format','{{ index .Config.Labels "schood.qa" }}',container]);assert.equal(label,'sat-attempt');await run(['rm','--force',container]);}
}
