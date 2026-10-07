// Actual migrations and independent SQL connections in an isolated local container.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container = `schood-sat-start-${randomUUID().slice(0,8)}`;
const image = 'postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
let containerId;
const checks = [];
function run(args,input='',timeout=30000) {
  return new Promise((resolve,reject) => {
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('Local Docker operation timed out'));},timeout);
    child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>error+=d);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(new Error(error.trim()||`Docker exit ${code}`));});child.stdin.end(input);
  });
}
const sql=q=>run(['exec','-i',container,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],q);
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const experience='aaaaaaaa-0000-4000-8000-000000000001';
const qid=n=>`bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=value=>value==null?'null':`'${String(value).replaceAll("'","''")}'`;
const json=value=>quote(JSON.stringify(value))+'::jsonb';
const startSql=(id,filters={section_type:'math',limit:2},user=actor)=>`select start_sat_practice_attempt(${quote(user)},${quote(id)},${json(filters)});`;
const start=async(...args)=>JSON.parse(await sql('set role service_role;'+startSql(...args)));
const completeSql=(result,answers={},questions=result.questions)=>{
  const scored=questions.map(q=>({question_id:q.id,correct:answers[q.id]?.text==='12',expected:q.correct,answer:answers[q.id]??null}));
  return `select complete_sat_practice_attempt('${actor}','${result.attempt.id}',${json(answers)},${json(questions)},${json(scored)});`;
};
const complete=async(...args)=>JSON.parse(await sql('set role service_role;'+completeSql(...args)));
const counts=async()=>JSON.parse(await sql("select jsonb_build_object('sessions',(select count(*) from sessions),'attempts',(select count(*) from sat_practice_lab_attempts),'sources',(select count(*) from sat_practice_attempt_sources),'receipts',(select count(*) from sat_practice_attempt_results));"));
const reset=()=>sql('truncate sat_practice_attempt_results,sat_practice_attempt_sources,sat_practice_lab_attempts,sat_practice_mastery,sat_practice_srs_queue,sat_practice_daily_activity,sat_practice_mistake_notebook,responses,sessions cascade;');
async function check(name,test){await reset();await test();checks.push({name,status:'passed'});console.log('PASS: '+name);}
try {
  containerId=await run(['run','--detach','--name',container,'--label','schood.qa=sat-start','--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],'',60000);assert.match(containerId,/^[0-9a-f]{64}$/);
  let ready=false;for(let i=0;i<120;i++){
    try{if(await run(['exec',container,'cat','/proc/1/comm'])==='postgres'){await sql('select 1');ready=true;break;}}catch{}
    await new Promise(done=>setTimeout(done,250));
  }assert.ok(ready,'Final local PostgreSQL server did not become ready');
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
    create table users(id uuid primary key);insert into users values('${actor}'),('${other}');create table products(id uuid primary key);insert into products values('${experience}');`);
  const spine=readFileSync('supabase/migrations/20260202170000_platform_spine.sql','utf8');
  const ddl=name=>{const start=spine.indexOf('create table if not exists public.'+name+' (');assert.ok(start>=0,name);return spine.slice(start,spine.indexOf('\n);',start)+4);};
  for(const table of ['experiences','sections','parts','content_units','sessions','responses'])await sql(ddl(table));
  const keys=readFileSync('supabase/migrations/20260207122000_answer_keys_and_evaluations.sql','utf8');
  await sql(keys.slice(keys.indexOf('create table if not exists public.answer_keys ('),keys.indexOf('\n);')+4));
  await sql('alter table sessions add column token_id uuid,add column registration_id uuid;');
  for(const file of ['20260217193000_sessions_integrity_guard.sql','20260303234000_fix_sessions_integrity_guard_service_role.sql','20260514121000_sat_practice_mistake_notebook.sql','20260514122000_sat_practice_mastery_and_plan.sql','20260514123000_sat_practice_lab_attempts_and_srs.sql','20260514124000_sat_practice_activity_and_ai_questions.sql'])await sql(readFileSync('supabase/migrations/'+file,'utf8'));
  await sql('grant all on all tables in schema public to service_role;grant select,insert,update,delete on all tables in schema public to authenticated;');
  await sql('alter default privileges in schema public grant all on tables to service_role;');
  for(const file of ['20261007100000_sat_attempt_atomic_completion.sql','20261008100000_sat_bank_filtered_selection.sql','20261008110000_sat_attempt_atomic_start.sql'])await sql(readFileSync('supabase/migrations/'+file,'utf8'));
  await sql(`insert into experiences(id,product_id,name,metadata) values('${experience}','${experience}','Bank','{"format":"sat_practice_bank"}');insert into sections(id,experience_id,name,display_order) values('${experience}','${experience}','Math',1);insert into parts(id,section_id,name,display_order) values('${experience}','${experience}','Questions',1);`);
  for(let i=1;i<=3;i++)await sql(`insert into content_units(id,part_id,type,data,display_order,metadata) values('${qid(i)}','${experience}','question_numeric','{"prompt":"What is six plus six?"}',${i},'{"domain":"math","difficulty":"easy"}');insert into answer_keys(content_unit_id,correct) values('${qid(i)}','{"value":"12"}');`);
  await check('Start atomically creates the session, attempt and private frozen questions',async()=>{
    const id=randomUUID(),r=await start(id);assert.equal(r.attempt.id,id);assert.equal(r.questions.length,2);assert.deepEqual(r.attempt.question_ids,r.questions.map(q=>q.id));assert.equal(r.replayed_start,false);
    assert.deepEqual(await counts(),{sessions:1,attempts:1,sources:1,receipts:0});assert.equal(await sql("select experience_id from sessions"),experience);
  });
  await check('Twelve concurrent retries create one drill and replay its original selection',async()=>{
    const id=randomUUID(),rows=await Promise.all(Array.from({length:12},()=>start(id)));assert.equal(rows.filter(r=>!r.replayed_start).length,1);
    for(const r of rows){assert.deepEqual(r.attempt,rows[0].attempt);assert.deepEqual(r.questions,rows[0].questions);}
    assert.deepEqual(await counts(),{sessions:1,attempts:1,sources:1,receipts:0});
  });
  await check('Foreign request identity stays private and changed selection cannot reuse an ID',async()=>{
    const id=randomUUID();await start(id);await assert.rejects(start(id,{section_type:'math',limit:2},other),/Drill not found/);await assert.rejects(start(id,{section_type:'math',limit:1}),/already used/);
    assert.equal((await counts()).attempts,1);
  });
  await check('Different-selection start races have one winner and leave one session/source',async()=>{
    const id=randomUUID(),rows=await Promise.allSettled([start(id,{section_type:'math',limit:1}),start(id,{section_type:'math',limit:2})]);
    assert.equal(rows.filter(r=>r.status==='fulfilled').length,1);assert.match(rows.find(r=>r.status==='rejected').reason.message,/already used/);
    assert.deepEqual(await counts(),{sessions:1,attempts:1,sources:1,receipts:0});
  });
  await check('No matches, empty IDs and malformed limits leave no orphan session',async()=>{
    for(const f of [{section_type:'reading_writing',limit:2},{question_ids:[],limit:2},{limit:1.5},{limit:0},{limit:101},{limit:'2'},{limit:2,unexpected:true}])await assert.rejects(start(randomUUID(),f),/No matching|Invalid/);
    assert.deepEqual(await counts(),{sessions:0,attempts:0,sources:0,receipts:0});
  });
  await check('A failure on the final source insert rolls back the preceding session and attempt',async()=>{
    await sql("create function qa_start_failure() returns trigger language plpgsql as $$begin raise exception 'QA final insert failure';end$$;create trigger qa_start_failure before insert on sat_practice_attempt_sources for each row execute function qa_start_failure();");
    try{await assert.rejects(start(randomUUID()),/QA final insert failure/);assert.deepEqual(await counts(),{sessions:0,attempts:0,sources:0,receipts:0});}finally{await sql('drop trigger qa_start_failure on sat_practice_attempt_sources;drop function qa_start_failure();');}
  });
  await check('Editing prompts and removing live keys does not alter a started drill or its score',async()=>{
    const id=randomUUID(),r=await start(id),answers=Object.fromEntries(r.questions.map(q=>[q.id,{text:'12'}]));
    await sql(`update content_units set data='{"prompt":"Changed prompt"}';delete from answer_keys;`);
    assert.deepEqual((await start(id)).questions,r.questions);const scored=await complete(r,answers);assert.equal(scored.attempt.score_raw,2);assert.deepEqual(scored.questions,r.questions);
    const replay=await complete(r,answers,[]);assert.deepEqual(replay,scored);assert.equal((await counts()).receipts,1);
    await sql(`update content_units set data='{"prompt":"What is six plus six?"}';insert into answer_keys(content_unit_id,correct) select id,'{"value":"12"}' from content_units;`);
  });
  await check('Substituted questions are rejected before any scoring effects',async()=>{
    const r=await start(randomUUID());await assert.rejects(complete(r,{},r.questions.map(q=>({...q,correct:{value:'999'}}))),/differ from the started drill/);
    assert.equal((await counts()).receipts,0);assert.equal(await sql('select count(*) from sat_practice_daily_activity'),'0');
  });
  await check('Concurrent start replay and twelve completions through the wrapper produce one receipt and reward',async()=>{
    const r=await start(randomUUID()),rows=await Promise.all([start(r.attempt.id),...Array.from({length:12},()=>complete(r))]);
    assert.deepEqual(rows[0].questions,r.questions);for(const completed of rows.slice(1))assert.deepEqual(completed,rows[1]);
    assert.deepEqual(await counts(),{sessions:1,attempts:1,sources:1,receipts:1});
    assert.equal(await sql('select attempts||\':\'||xp_earned from sat_practice_daily_activity'),'1:25');
    assert.equal(await sql('select sum(correct_count+incorrect_count) from sat_practice_srs_queue'),'2');
  });
  await check('Browser roles cannot start, read frozen keys, or bypass the completion wrapper',async()=>{
    for(const role of ['anon','authenticated']){
      await assert.rejects(sql(`set role ${role};${startSql(randomUUID())}`),/permission denied/);
      await assert.rejects(sql(`set role ${role};select * from sat_practice_attempt_sources`),/permission denied/);
      await assert.rejects(sql(`set role ${role};select complete_sat_practice_attempt_v1('${actor}','${randomUUID()}','{}','[]','[]')`),/permission denied/);
    }
    await assert.rejects(sql(`set role service_role;select complete_sat_practice_attempt_v1('${actor}','${randomUUID()}','{}','[]','[]')`),/permission denied/);
    await assert.rejects(sql(`set role service_role;update sat_practice_attempt_sources set questions='[]'`),/permission denied/);
    await assert.rejects(sql('set role service_role;delete from sat_practice_attempt_sources'),/permission denied/);
    const r=await start(randomUUID());
    await assert.rejects(sql(`update sat_practice_attempt_sources set questions='[]' where attempt_id='${r.attempt.id}'`),/immutable/);
  });
  await check('Legacy attempts created by the previous Edge can still complete and replay',async()=>{
    const original=await start(randomUUID());const id=randomUUID(),session=randomUUID();
    await sql(`insert into sessions(id,user_id,experience_id,status,metadata) values('${session}','${actor}','${experience}','active','{"mode":"sat_practice_lab"}');insert into sat_practice_lab_attempts(id,user_id,session_id,question_ids) values('${id}','${actor}','${session}',array[${original.attempt.question_ids.map(quote).join(',')}]::uuid[]);`);
    const old={...original,attempt:{...original.attempt,id}},result=await complete(old);assert.equal(result.attempt.status,'scored');assert.deepEqual(await complete(old,{},[]),result);
  });
  await check('Notebook retries require ownership and replay the same owned review',async()=>{
    const notebook=randomUUID();await sql(`insert into sat_practice_mistake_notebook(id,user_id,section_type,domain,difficulty,source,mistake_pattern) values('${notebook}','${actor}','math','algebra','easy','practice_lab','Fixture');`);
    const f={section_type:'math',domain:'algebra',difficulty:'easy',limit:2,retry_notebook_id:notebook};const id=randomUUID();await start(id,f);assert.equal((await start(id,f)).replayed_start,true);
    await assert.rejects(start(randomUUID(),f,other),/Review not found/);await assert.rejects(start(randomUUID(),{...f,retry_notebook_id:null}),/Invalid review/);
  });
  await check('Concurrent different actors retain separate starts and source rows',async()=>{
    const r=await Promise.all([start(randomUUID()),start(randomUUID(),{section_type:'math',limit:2},other)]);assert.notEqual(r[0].attempt.session_id,r[1].attempt.session_id);assert.deepEqual(await counts(),{sessions:2,attempts:2,sources:2,receipts:0});
  });
  mkdirSync('docs/customer-readiness',{recursive:true});writeFileSync('docs/customer-readiness/2026-10-08-sat-start-db.json',JSON.stringify({checkedAt:new Date().toISOString(),engine:image,productionContacted:false,checks},null,2)+'\n');
} finally {
  if(containerId){assert.equal(await run(['inspect','--format','{{ index .Config.Labels "schood.qa" }}',container]),'sat-start');await run(['rm','--force',container]);}
}
