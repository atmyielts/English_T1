// Original content and migration integration on isolated PostgreSQL. No production contact.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const container=`schood-sat-content-${randomUUID().slice(0,8)}`;
const image='postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
let containerId;const checks=[];
function run(args,input='',timeout=30000){return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Local Docker operation timed out'));},timeout);
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>error+=d);
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(Error(error.trim()||`Docker exit ${code}`));});child.stdin.on('error',()=>{});child.stdin.end(input);
});}
const sql=q=>run(['exec','-i',container,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],q);
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const product='2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010',legacy='5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef',foreign='aaaaaaaa-0000-4000-8000-000000000099';
const rw='4d9d460b-b514-4ace-91ef-80977fe4d404',math='5eae571c-c625-4bdf-a2ff-90a88fe5d505';
const rwPart='7a440001-8d3f-4bf4-8c1c-444000001001';
const qid=n=>`bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=v=>v==null?'null':`'${String(v).replaceAll("'","''")}'`;
const json=v=>quote(JSON.stringify(v))+'::jsonb';
const query=({section=null,domain=null,ids=null,retired=false,limit=100}={})=>`select coalesce(jsonb_agg(q),'[]') from select_sat_practice_questions('${actor}',${quote(section)},${quote(domain)},null,null,${ids===null?'null':`array[${ids.map(quote).join(',')}]::uuid[]`},${limit},${retired}) q;`;
const bank=async opts=>JSON.parse(await sql('set role service_role;'+query(opts)));
const start=async filters=>JSON.parse(await sql(`set role service_role;select start_sat_practice_attempt('${actor}','${randomUUID()}',${json({limit:1,...filters})});`));
const complete=async r=>{
  const answers=Object.fromEntries(r.questions.map(q=>[q.id,{selected_option:q.correct.option_id}]));
  const items=r.questions.map(q=>({question_id:q.id,correct:true,answer:answers[q.id],expected:q.correct}));
  return JSON.parse(await sql(`set role service_role;select complete_sat_practice_attempt('${actor}','${r.attempt.id}',${json(answers)},${json(r.questions)},${json(items)});`));
};
const migration=readFileSync('supabase/migrations/20261020183010_sat_original_foundations.sql','utf8');
async function check(name,test){await test();checks.push({name,status:'passed'});console.log('PASS: '+name);}
try{
  containerId=await run(['run','--detach','--name',container,'--label','schood.qa=sat-content','--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],'',60000);assert.match(containerId,/^[0-9a-f]{64}$/);
  let ready=false;for(let i=0;i<120;i++){try{if(await run(['exec',container,'cat','/proc/1/comm'])==='postgres'){await sql('select 1');ready=true;break;}}catch{}await new Promise(done=>setTimeout(done,250));}assert.ok(ready);
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'')$$;
    create table users(id uuid primary key,role text default 'student');insert into users(id) values('${actor}'),('${other}');
    create table products(id uuid primary key);insert into products values('${legacy}'),('${foreign}');
    create table tenant_memberships(user_id uuid,tenant_id uuid,status text);create table entitlements(tenant_id uuid,is_active boolean,resource_type text,resource_id uuid,starts_at timestamptz,ends_at timestamptz);`);
  const spine=readFileSync('supabase/migrations/20260202170000_platform_spine.sql','utf8');
  const ddl=name=>{const a=spine.indexOf('create table if not exists public.'+name+' (');assert.ok(a>=0);return spine.slice(a,spine.indexOf('\n);',a)+4);};
  for(const name of ['experiences','sections','parts','content_units','sessions','responses'])await sql(ddl(name));
  const keyMigration=readFileSync('supabase/migrations/20260207122000_answer_keys_and_evaluations.sql','utf8');await sql(keyMigration.slice(0,keyMigration.indexOf('create table if not exists public.evaluations')));
  await sql('alter table sessions add column token_id uuid,add column registration_id uuid;');
  for(const name of ['20260217193000_sessions_integrity_guard.sql','20260303234000_fix_sessions_integrity_guard_service_role.sql','20260514121000_sat_practice_mistake_notebook.sql','20260514122000_sat_practice_mastery_and_plan.sql','20260514123000_sat_practice_lab_attempts_and_srs.sql','20260514124000_sat_practice_activity_and_ai_questions.sql'])await sql(readFileSync('supabase/migrations/'+name,'utf8'));
  await sql('grant all on all tables in schema public to service_role;grant select on all tables in schema public to anon,authenticated;alter default privileges in schema public grant all on tables to service_role;');
  for(const name of ['20261007100000_sat_attempt_atomic_completion.sql','20261008100000_sat_bank_filtered_selection.sql','20261008110000_sat_attempt_atomic_start.sql'])await sql(readFileSync('supabase/migrations/'+name,'utf8'));
  for(const [exp,prod,part] of [[rw,legacy,rwPart],[math,legacy,math],[foreign,foreign,foreign]])await sql(`insert into experiences(id,product_id,name,metadata) values('${exp}','${prod}','Fixture','{"format":"sat_practice_bank"}');insert into sections(id,experience_id,name,display_order) values('${exp}','${exp}','Fixture',1);insert into parts(id,section_id,name,display_order) values('${part}','${exp}','Fixture',1);`);
  for(const n of [1,2,3,4,301]){
    const data={prompt:`RW Practice Q${n}: Choose the most concise and precise revision.`,options:'ABCD'.split('').map(id=>({id,label:`Choice ${id} (${n})`}))};
    if(n===4)data.options[0].label='Edited choice that must not be changed';
    await sql(`insert into content_units(id,part_id,type,data,display_order,metadata) values('${qid(n)}','${rwPart}','question_single_choice',${json(data)},${n},${json({domain:'reading_writing',practice_item:n})});insert into answer_keys(content_unit_id,correct) values('${qid(n)}','{"option_id":"A"}');`);
  }
  for(const [n,part] of [[500,math],[501,foreign]])await sql(`insert into content_units(id,part_id,type,data,display_order,metadata) values('${qid(n)}','${part}','question_single_choice','{"prompt":"Fixture retained question","options":[{"id":"A","label":"Retained"}]}',1,'{"domain":"math"}');insert into answer_keys(content_unit_id,correct) values('${qid(n)}','{"option_id":"A"}');`);
  const completedOld=await start({question_ids:[qid(1)]}),oldReceipt=await complete(completedOld),pendingOld=await start({question_ids:[qid(2)]});
  const beforeExisting=await sql(`select jsonb_agg(jsonb_build_object('id',u.id,'data',u.data,'correct',k.correct) order by u.id) from content_units u join answer_keys k on k.content_unit_id=u.id;`);
  await check('Missing dedicated product fails before any original insert or legacy retirement',async()=>{
    await assert.rejects(sql(migration),/SAT Practice product missing/);assert.equal(await sql('select count(*) from content_units where metadata ? \'original_slug\''),'0');assert.equal(await sql("select count(*) from content_units where metadata->>'content_status'='legacy_placeholder'"),'0');
  });
  await sql(`insert into products values('${product}')`);await sql(migration);
  const original=await bank(),curated=original.filter(q=>q.metadata.content_revision==='original-2026-10-v1');
  await check('All27 original prompts, choices, private keys and explanations match the verified source',async()=>{
    const draft=JSON.parse(readFileSync('content/sat-practice/original-foundations.json','utf8'));assert.equal(curated.length,27);
    for(const q of draft.questions){const row=curated.find(r=>r.metadata.original_slug===q.slug);assert.ok(row);assert.equal(row.data.prompt,q.prompt);assert.deepEqual(row.data.options.map(o=>o.label),q.options);assert.equal(row.correct.option_id,q.correctOption);assert.equal(row.correct.feedback.explanation,q.explanation);assert.equal(row.domain,q.domain);assert.equal(row.difficulty,q.difficulty);assert.ok(!('feedback' in row.data)&&!('feedback' in row.metadata));}
    assert.equal(new Set(curated.map(q=>q.domain)).size,9);
  });
  await check('Only exact reviewed RW templates1..300 are retired; existing rows and keys survive',async()=>{
    assert.equal(await sql(`select jsonb_agg(id order by id) from content_units where metadata->>'content_status'='legacy_placeholder'`),JSON.stringify([qid(1),qid(2),qid(3)]).replaceAll(',',', '));
    const after=await sql(`select jsonb_agg(jsonb_build_object('id',u.id,'data',u.data,'correct',k.correct) order by u.id) from content_units u join answer_keys k on k.content_unit_id=u.id where not(u.metadata ? 'original_slug');`);assert.equal(after,beforeExisting);
    assert.ok(original.some(q=>q.id===qid(500)));assert.ok(original.some(q=>q.id===qid(4)));assert.ok(original.some(q=>q.id===qid(301)));assert.ok(!original.some(q=>[qid(1),qid(2),qid(3)].includes(q.id)));
  });
  await check('Published foundations are prioritized and subject/domain filters stay exact',async()=>{
    assert.ok(original.slice(0,27).every(q=>q.metadata.content_revision==='original-2026-10-v1'));
    for(const domain of new Set(curated.map(q=>q.domain))){const rows=await bank({domain});assert.equal(rows.filter(q=>q.metadata.content_revision==='original-2026-10-v1').length,3);assert.ok(rows.every(q=>q.domain===domain));}
    assert.equal((await bank({section:'math'})).filter(q=>q.metadata.original_slug).length,12);assert.equal((await bank({section:'reading_writing'})).filter(q=>q.metadata.original_slug).length,15);
  });
  await check('Unrelated products cannot join the authorized bank by copying its format tag',async()=>{
    assert.ok(!original.some(q=>q.id===qid(501)));assert.deepEqual(await bank({ids:[qid(501)]}),[]);assert.deepEqual(await bank({ids:[qid(501)],retired:true}),[]);
  });
  await check('Completed receipts and frozen pending questions survive legacy retirement unchanged',async()=>{
    assert.deepEqual(await complete(completedOld),oldReceipt);const result=await complete(pendingOld);assert.deepEqual(result.questions,pendingOld.questions);assert.equal(result.attempt.score_raw,1);
    const historical=await bank({ids:[qid(2)],retired:true});assert.equal(historical.length,1);assert.equal(historical[0].data.prompt,pendingOld.questions[0].data.prompt);
  });
  await check('Original explanations/keys freeze at start despite later editorial revisions',async()=>{
    const id=curated[0].id,r=await start({question_ids:[id]});
    await sql(`update answer_keys set correct='{"option_id":"D"}',metadata='{"feedback":{"explanation":"Changed editorial feedback"}}' where content_unit_id='${id}'`);
    const result=await complete(r);assert.deepEqual(result.questions,r.questions);assert.equal(result.attempt.score_raw,1);assert.notEqual((await bank({ids:[id]}))[0].correct.feedback.explanation,r.questions[0].correct.feedback.explanation);
  });
  await sql(readFileSync('supabase/migrations/20260207121500_content_rls_protection.sql','utf8'));
  const asUser=(role,user,q)=>sql(`set role ${role};set request.jwt.claim.sub='${user}';${q}`);
  await check('Unentitled and anonymous browsers cannot read paid original content or private answer material',async()=>{
    for(const role of ['anon','authenticated']){assert.equal(await asUser(role,actor,"select count(*) from content_units where metadata ? 'original_slug'"),'0');assert.equal(await asUser(role,actor,'select count(*) from answer_keys'),'0');await assert.rejects(asUser(role,actor,query()),/permission denied/);await assert.rejects(asUser(role,actor,'select * from sat_practice_attempt_sources'),/permission denied/);}
  });
  await check('The entitled actor can read original exercises while all static answer keys remain private',async()=>{
    const tenant=randomUUID();await sql(`insert into tenant_memberships values('${actor}','${tenant}','active');insert into entitlements values('${tenant}',true,'product','${product}',null,null);`);
    assert.equal(await asUser('authenticated',actor,"select count(*) from content_units where metadata ? 'original_slug'"),'27');assert.equal(await asUser('authenticated',actor,'select count(*) from answer_keys'),'0');assert.equal(await asUser('authenticated',other,"select count(*) from content_units where metadata ? 'original_slug'"),'0');
  });
  await check('Reapplying an already-used publication identity fails without overwriting any content',async()=>{
    const before=await sql('select jsonb_agg(to_jsonb(u) order by id) from content_units u');await assert.rejects(sql(migration),/duplicate key/);assert.equal(await sql('select jsonb_agg(to_jsonb(u) order by id) from content_units u'),before);
  });
  mkdirSync('supabase/.temp/sat-foundations',{recursive:true});writeFileSync('supabase/.temp/sat-foundations/native-proof.json',JSON.stringify({checkedAt:new Date().toISOString(),engine:image,productionContacted:false,publishedInProduction:false,checks},null,2)+'\n');
}finally{if(containerId){assert.equal(await run(['inspect','--format','{{ index .Config.Labels "schood.qa" }}',container]),'sat-content');await run(['rm','--force','--volumes',container]);}}
