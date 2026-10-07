// Exercise the production SQL on disposable native PostgreSQL. No production connection.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container = `schood-sat-bank-${randomUUID().slice(0,8)}`;
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
const actor='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const rw='aaaaaaaa-0000-4000-8000-000000000001',math='aaaaaaaa-0000-4000-8000-000000000002',curated='aaaaaaaa-0000-4000-8000-000000000003';
const qid=n=>`bbbbbbbb-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote=value=>value==null?'null':`'${String(value).replaceAll("'","''")}'`;
const json=value=>quote(JSON.stringify(value))+'::jsonb';
const query=(filters={},user=actor)=>`select coalesce(jsonb_agg(q),'[]') from select_sat_practice_questions(${quote(user)},${quote(filters.section)},${quote(filters.domain)},${quote(filters.difficulty)},${quote(filters.history)},${filters.ids===undefined?'null':`array[${filters.ids.map(quote).join(',')}]::uuid[]`},${filters.limit??24},${filters.retired??false}) q;`;
const select=async(f,u)=>JSON.parse(await sql('set role service_role;'+query(f,u)));
async function check(name,test) {await test();checks.push({name,status:'passed'});console.log('PASS: '+name);}
try {
  containerId=await run(['run','--detach','--name',container,'--label','schood.qa=sat-bank','--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],'',60000);assert.match(containerId,/^[0-9a-f]{64}$/);
  // A temporary initialization server accepts SQL before it stops. Require
  // the final PostgreSQL process as PID1 before trusting a successful query.
  let ready=false;for(let i=0;i<120;i++){
    try{if(await run(['exec',container,'cat','/proc/1/comm'])==='postgres'){await sql('select 1');ready=true;break;}}
    catch{/* The final server may still be opening its socket. */}
    await new Promise(done=>setTimeout(done,250));
  }assert.ok(ready,'Final local PostgreSQL server did not become ready');
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table users(id uuid primary key);insert into users values('${actor}'),('${other}');create table products(id uuid primary key);insert into products values('${rw}');`);
  const spine=readFileSync('supabase/migrations/20260202170000_platform_spine.sql','utf8');
  const ddl=name=>{const start=spine.indexOf('create table if not exists public.'+name+' (');assert.ok(start>=0,name);return spine.slice(start,spine.indexOf('\n);',start)+4);};
  for(const table of ['experiences','sections','parts','content_units','sessions'])await sql(ddl(table));
  const keys=readFileSync('supabase/migrations/20260207122000_answer_keys_and_evaluations.sql','utf8');
  await sql(keys.slice(keys.indexOf('create table if not exists public.answer_keys ('),keys.indexOf('\n);')+4));
  await sql(readFileSync('supabase/migrations/20260514123000_sat_practice_lab_attempts_and_srs.sql','utf8'));
  await sql(readFileSync('supabase/migrations/20261008100000_sat_bank_filtered_selection.sql','utf8'));
  for(const [id,order] of [[rw,1],[math,2],[curated,3]]) await sql(`insert into experiences(id,product_id,name,display_order,metadata) values('${id}','${rw}','Bank',${order},${json({format:'sat_practice_bank',...(id===curated?{bank_priority:'curated'}:{})})});insert into sections(id,experience_id,name,display_order) values('${id}','${id}','Section',1);insert into parts(id,section_id,name,display_order) values('${id}','${id}','Part',1);`);
  // Deliberately exceed the old pre-filter limit with one complete subject first.
  for(let i=1;i<=65;i++) {
    const part=i<=40?rw:i<=62?math:curated;
    const metadata=i<=40?{domain:'reading_writing'}:{domain:i===61?'geometry':i===63?'algebra':'math',difficulty:i===61?'hard':'medium',...(i===64?{content_status:'legacy_placeholder'}:{})};
    await sql(`insert into content_units(id,part_id,type,data,display_order,metadata) values('${qid(i)}','${part}','question_single_choice',${json({prompt:'Fixture question',options:[{id:'A',label:'yes'},{id:'B',label:'no'}]})},${i},${json(metadata)});${i===65?'':`insert into answer_keys(content_unit_id,correct) values('${qid(i)}','{"option_id":"A"}');`}`);
  }
  await check('Math filters scan past 40 earlier RW questions before applying the limit',async()=>{const rows=await select({section:'math',limit:10});assert.equal(rows.length,10);assert.ok(rows.every(q=>q.section_type==='math'));assert.equal(rows[0].id,qid(63));});
  await check('Late geometry and hard-difficulty matches are found',async()=>{const rows=await select({section:'math',domain:'geometry_trig',difficulty:'hard',limit:1});assert.deepEqual(rows.map(q=>q.id),[qid(61)]);});
  await check('Contradictory or unavailable filters produce empty results',async()=>{assert.deepEqual(await select({section:'reading_writing',domain:'algebra'}),[]);assert.deepEqual(await select({difficulty:'easy'}),[]);});
  await check('Explicit empty IDs stay empty; selected IDs respect filters',async()=>{assert.deepEqual(await select({ids:[]}),[]);assert.deepEqual((await select({ids:[qid(61)],section:'math'})).map(q=>q.id),[qid(61)]);assert.deepEqual(await select({ids:[qid(61)],section:'reading_writing'}),[]);});
  await check('Retired and missing-key questions stay out of new drills',async()=>{const rows=await select({limit:100});assert.equal(rows.length,63);assert.ok(!rows.some(q=>[qid(64),qid(65)].includes(q.id)));assert.deepEqual((await select({ids:[qid(64)],retired:true})).map(q=>q.id),[qid(64)]);});
  await sql(`insert into sat_practice_srs_queue(user_id,question_id,incorrect_count,correct_count,leitner_box) values('${actor}','${qid(50)}',1,0,1),('${actor}','${qid(51)}',0,4,5),('${other}','${qid(52)}',3,0,1);insert into sat_practice_lab_attempts(user_id,question_ids,status,scored_items) values('${actor}',array['${qid(53)}']::uuid[],'scored',${json([{question_id:qid(53),correct:false}])}),('${actor}',array['${qid(54)}']::uuid[],'in_progress','[]');`);
  await check('Previously missed history includes scored legacy work and excludes another actor',async()=>{assert.deepEqual((await select({history:'previously_missed'})).map(q=>q.id),[qid(50),qid(53)]);assert.deepEqual((await select({history:'previously_missed'},other)).map(q=>q.id),[qid(52)]);});
  await check('Repeatedly correct means the actor reached the highest review box',async()=>{assert.deepEqual((await select({history:'mastered'})).map(q=>q.id),[qid(51)]);assert.deepEqual(await select({history:'mastered'},other),[]);});
  await check('Unseen excludes scored legacy questions and reviewed questions, not someone else’s history',async()=>{const ids=(await select({history:'unseen',limit:100})).map(q=>q.id);for(const i of [50,51,53])assert.ok(!ids.includes(qid(i)));for(const i of [52,54])assert.ok(ids.includes(qid(i)));});
  await check('History is applied before limits and sort order is stable',async()=>{assert.equal((await select({history:'previously_missed',limit:1}))[0].id,qid(50));assert.deepEqual(await select({limit:24}),await select({limit:24}));});
  await check('Inactive content cannot enter new drills but explicitly owned legacy reads can load it',async()=>{await sql(`update experiences set is_active=false where id='${curated}'`);assert.deepEqual(await select({ids:[qid(63)]}),[]);assert.equal((await select({ids:[qid(63)],retired:true})).length,1);});
  await check('Browser roles cannot request keys or another actor’s history',async()=>{for(const role of ['anon','authenticated'])await assert.rejects(sql(`set role ${role};${query({})}`),/permission denied/);});
  await check('Invalid server filters are rejected, including an unrestricted retired read',async()=>{for(const f of [{section:'science'},{domain:'unknown'},{difficulty:'expert'},{history:'everyone'},{limit:0},{retired:true}])await assert.rejects(select(f),/Invalid bank filters/);});
  await check('Retired reviews cannot hide later usable due items; due history is actor isolated and private',async()=>{
    await sql(`update content_units set metadata=metadata||'{"content_status":"retired"}'::jsonb where part_id='${rw}';insert into sat_practice_srs_queue(user_id,question_id,next_review_at) select '${actor}',id,now()-interval '3 days' from content_units where part_id='${rw}' limit 24;`);
    const due=async user=>JSON.parse(await sql(`set role service_role;select coalesce(jsonb_agg(q),'[]') from select_sat_practice_due_questions('${user}') q;`));
    assert.deepEqual((await due(actor)).map(q=>q.question.id).sort(),[qid(50),qid(51)]);
    assert.deepEqual((await due(other)).map(q=>q.question.id),[qid(52)]);
    await sql(`update sat_practice_srs_queue set next_review_at=now()+interval '1 day' where user_id='${actor}';`);
    assert.deepEqual(await due(actor),[]);
    for(const role of ['anon','authenticated'])await assert.rejects(sql(`set role ${role};select * from select_sat_practice_due_questions('${actor}');`),/permission denied/);
  });
  mkdirSync('docs/customer-readiness',{recursive:true});writeFileSync('docs/customer-readiness/2026-10-08-sat-bank-db.json',JSON.stringify({checkedAt:new Date().toISOString(),engine:image,productionContacted:false,checks},null,2)+'\n');
} finally {
  if(containerId){assert.equal(await run(['inspect','--format','{{ index .Config.Labels "schood.qa" }}',container]),'sat-bank');await run(['rm','--force',container]);}
}
