// Independent native PostgreSQL connections; disposable container, no production keys.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const name = 'schood-peer-review-' + randomUUID().slice(0,8);
const image = 'postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const migration = readFileSync('supabase/migrations/20261008194000_peer_review_privacy_commands.sql','utf8');
const baseline = readFileSync('supabase/migrations/20260608155000_features_5_to_11.sql','utf8');
const actors = Array.from({length:15},()=>randomUUID());
const [author,reviewer,second,stranger] = actors;
const legacy = randomUUID(), tenant = randomUUID(), checks = [];
const essay = 'A synthetic practice essay with no personal information. '.repeat(8);
const quote = text => "'"+String(text).replaceAll("'","''")+"'";
let created = false;
function run(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',err='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);
    const timer=setTimeout(()=>{child.kill();reject(Error('Local Docker operation timed out'));},30_000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err.trim()||'Docker operation failed'));});
    child.stdin.end(input);
  });
}
const sql = statement=>run(['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],statement);
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
const expression=(actor,action,payload={})=>'public.peer_review_command('+quote(actor)+'::uuid,'+quote(action)+','+quote(JSON.stringify(payload))+'::jsonb)';
const command=async(actor,action,payload={})=>JSON.parse(await sql('set role service_role; select '+expression(actor,action,payload)+';'));
const submit=(actor=author,extra={})=>command(actor,'submit',{request_id:randomUUID(),sharing_consent:true,essay_text:essay,exam_type:'ielts',task_type:'task2',...extra});
const check=async(label,action)=>{await action();checks.push({name:label,passed:true});console.log('PASS: '+label);};
async function barrier(objid) {
  for(let n=0;n<30;n++) {if(await sql("select count(*) from pg_locks where locktype='advisory' and objid="+objid+" and granted;")==='1')return;await pause();}
  throw Error('Independent connection barrier not reached');
}
try {
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa=peer-review','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  let ready=false;
  for(let n=0;n<120;n++){try{if(await run(['exec',name,'cat','/proc/1/comm'])==='postgres'){await sql('select 1;');ready=true;break;}}catch{}await pause();}
  assert.ok(ready,'Final PostgreSQL server unavailable');
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table users(id uuid primary key);create table tenants(id uuid primary key);
    insert into users values ${actors.map(id=>'('+quote(id)+')').join(',')};insert into tenants values(${quote(tenant)});`);
  const start = baseline.indexOf('create table if not exists public.peer_review_submissions');
  const end = baseline.indexOf('create table if not exists public.academy_branding');
  assert.ok(start >= 0 && end > start, 'Native fixture boundary unavailable');
  await sql(baseline.slice(start,end));
  await sql(`grant select(essay_text),update(essay_text) on peer_review_submissions to anon,authenticated;
    grant select(overall_comment),update(overall_comment) on peer_reviews to anon,authenticated;
    insert into peer_review_submissions(id,user_id,essay_text,prompt_text) values(${quote(legacy)},${quote(author)},${quote(essay)},'Synthetic prompt');`);
  await check('legacy anonymous policy exposes synthetic essay without consent',async()=>{
    assert.equal(await sql('set role anon;select essay_text from peer_review_submissions where id='+quote(legacy)+';'),essay.trim());
  });
  await check('busy-table migration times out and rolls back without changing data or grants',async()=>{
    const holder=sql('begin;lock peer_review_submissions in access exclusive mode;select pg_advisory_xact_lock(424240);select pg_sleep(3);rollback;');
    await barrier(424240);await assert.rejects(sql(migration),/lock timeout/);await holder;
    assert.equal(await sql("select count(*) from information_schema.columns where table_name='peer_review_submissions' and column_name='sharing_consent_at';"),'0');
    assert.equal(await sql('set role anon;select count(*) from peer_review_submissions;'),'1');
  });
  await sql(migration);
  for(const role of ['anon','authenticated']) {
    await check(role+' cannot directly read or mutate essays, feedback, assignments or trusted commands',async()=>{
      for(const statement of ['select * from peer_review_submissions;','select essay_text from peer_review_submissions;',
        'insert into peer_review_submissions default values;','update peer_review_submissions set essay_text=\'changed\';','delete from peer_review_submissions;',
        'select * from peer_reviews;','select overall_comment from peer_reviews;','insert into peer_reviews default values;',
        "update peer_reviews set overall_comment='changed';",'delete from peer_reviews;','select * from peer_review_assignments;',
        'insert into peer_review_assignments default values;','select '+expression(author,'queue')+';']) {
        await assert.rejects(sql('set role '+role+';'+statement),/permission denied/);
      }
    });
  }
  await check('legacy essays retained privately; author can opt in and withdraw',async()=>{
    assert.deepEqual((await command(reviewer,'queue')).submissions,[]);
    await assert.rejects(command(reviewer,'get_submission',{submission_id:legacy}),/unavailable/);
    await assert.rejects(command(reviewer,'set_sharing',{submission_id:legacy,sharing_consent:true}),/unavailable/);
    assert.equal((await command(author,'get_submission',{submission_id:legacy})).submission.essay_text,essay);
    await command(author,'set_sharing',{submission_id:legacy,sharing_consent:true});
    assert.equal((await command(reviewer,'queue')).submissions[0].id,legacy);
    await command(author,'set_sharing',{submission_id:legacy,sharing_consent:false});
  });
  await check('submission consent, types, lengths, supported exams and identity are enforced',async()=>{
    for(const extra of [{sharing_consent:false},{sharing_consent:'true'},{essay_text:7},{essay_text:'short'},
      {essay_text:'a'.repeat(20001)},{prompt_text:'a'.repeat(2001)},{exam_type:'other'},{task_type:'other'},{request_id:null}]) {
      await assert.rejects(submit(author,extra),/consent|text|100|supported|request id/);
    }
    await assert.rejects(command(randomUUID(),'queue'),/Account not found/);
  });
  let first;
  await check('12 same-request independent submissions create one immutable identity; changed content conflicts',async()=>{
    const payload={request_id:randomUUID(),sharing_consent:true,essay_text:essay,exam_type:'ielts',task_type:'task2'};
    const results=await Promise.all(Array.from({length:12},()=>command(author,'submit',payload)));
    first=results[0].submission.id;assert.equal(new Set(results.map(r=>r.submission.id)).size,1);
    assert.equal(await sql('select count(*) from peer_review_submissions where request_id='+quote(payload.request_id)+';'),'1');
    await assert.rejects(command(author,'submit',{...payload,essay_text:essay+' changed'}),/different content/);
    for(const key of ['essay_text','prompt_text','user_id'])assert.equal(key in (await command(reviewer,'queue')).submissions[0],false);
  });
  await check('12 competing reviewers reserve exactly two slots; strangers cannot open or complete',async()=>{
    const results=await Promise.allSettled(actors.slice(1,13).map(actor=>command(actor,'claim_submission',{submission_id:first})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
    for(const r of results.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/reserved/);
    assert.equal(await sql('select count(*) from peer_review_assignments where submission_id='+quote(first)+';'),'2');
    const unassigned=actors[14];await assert.rejects(command(unassigned,'get_submission',{submission_id:first}),/Reserve/);
    await assert.rejects(command(unassigned,'submit_review',{submission_id:first,overall_comment:'not assigned'}),/Reserve/);
    for(const actor of actors.slice(1,13))await command(actor,'release_submission',{submission_id:first});
  });
  await check('one reviewer concurrently claiming two essays gets only one assignment',async()=>{
    const other=(await submit()).submission.id;
    const claims=await Promise.allSettled([first,other].map(id=>command(reviewer,'claim_submission',{submission_id:id})));
    assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
    assert.match(claims.find(r=>r.status==='rejected').reason.message,/current review/);
    for(const id of [first,other])await command(reviewer,'release_submission',{submission_id:id});
    await command(author,'set_sharing',{submission_id:other,sharing_consent:false});
  });
  let reviewId;
  await check('12 review retries create one receipt and count; first feedback remains in queue',async()=>{
    await command(reviewer,'claim_submission',{submission_id:first});
    const payload={submission_id:first,overall_comment:'Clear structure.',band_score:0};
    const receipts=await Promise.all(Array.from({length:12},()=>command(reviewer,'submit_review',payload)));
    reviewId=receipts[0].review.id;assert.equal(new Set(receipts.map(r=>r.review.id)).size,1);
    assert.equal(await sql('select reviews_count,status from peer_review_submissions where id='+quote(first)+';'),'1|reviewing');
    assert.ok((await command(second,'queue')).submissions.some(s=>s.id===first));
    await assert.rejects(command(reviewer,'submit_review',{...payload,overall_comment:'changed'}),/different content/);
  });
  await check('simultaneous differing reviews save once and close atomically at the actual count',async()=>{
    await command(second,'claim_submission',{submission_id:first});
    const results=await Promise.allSettled(['second feedback','different feedback'].map(overall_comment=>command(second,'submit_review',{submission_id:first,overall_comment})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/different content/);
    assert.equal(await sql('select reviews_count,status from peer_review_submissions where id='+quote(first)+';'),'2|reviewed');
    assert.equal((await command(stranger,'queue')).submissions.some(s=>s.id===first),false);
    await assert.rejects(command(stranger,'claim_submission',{submission_id:first}),/unavailable/);
  });
  await check('owner history is scoped, counts actual reviews and retains original feedback; other history stays private',async()=>{
    await sql('update peer_review_submissions set reviews_count=999 where id='+quote(first)+';');
    const history=await command(author,'my_submissions');
    assert.equal(history.submissions.find(s=>s.id===first).reviews_count,2);
    assert.equal(history.reviews.find(r=>r.id===reviewId).band_score,0);
    assert.deepEqual((await command(stranger,'my_submissions')).submissions,[]);
    const given=await command(reviewer,'my_reviews');assert.equal(given.reviews.length,1);
    for(const field of ['essay_text','prompt_text','user_id'])assert.equal(field in given.reviews[0].peer_review_submissions,false);
  });
  await check('only author can rate helpfulness and boolean false is preserved',async()=>{
    await assert.rejects(command(stranger,'rate_helpful',{review_id:reviewId,is_helpful:true}),/unavailable/);
    await assert.rejects(command(author,'rate_helpful',{review_id:reviewId,is_helpful:'false'}),/true or false/);
    await command(author,'rate_helpful',{review_id:reviewId,is_helpful:false});
    assert.equal(await sql('select is_helpful,status from peer_reviews where id='+quote(reviewId)+';'),'f|not_helpful');
  });
  await check('failure at final counter update rolls back feedback and keeps reservation for retry',async()=>{
    const id=(await submit()).submission.id;await command(reviewer,'claim_submission',{submission_id:id});
    await sql("create function qa_peer_failure() returns trigger language plpgsql as $$begin raise exception 'QA final counter failure';end$$;create trigger qa_peer_failure before update on peer_review_submissions for each row execute function qa_peer_failure();");
    try{await assert.rejects(command(reviewer,'submit_review',{submission_id:id,overall_comment:'Retried feedback'}),/QA final counter failure/);
      assert.equal(await sql('select count(*) from peer_reviews where submission_id='+quote(id)+';'),'0');
      assert.equal(await sql('select count(*) from peer_review_assignments where submission_id='+quote(id)+';'),'1');
    }finally{await sql('drop trigger qa_peer_failure on peer_review_submissions;drop function qa_peer_failure();');}
    await command(reviewer,'submit_review',{submission_id:id,overall_comment:'Retried feedback'});
    await command(author,'set_sharing',{submission_id:id,sharing_consent:false});
  });
  await check('same-reviewer claim versus completion avoids the user foreign-key lock inversion',async()=>{
    const id=(await submit()).submission.id;await command(reviewer,'claim_submission',{submission_id:id});
    const holder=sql('begin;set role service_role;select id from users where id='+quote(reviewer)+' for no key update;select pg_advisory_xact_lock(424241);select pg_sleep(1);select '+expression(reviewer,'claim_submission',{submission_id:id})+';commit;');
    // Observe rejection immediately so the intentionally conflicting holder never becomes unhandled.
    const observed=holder.then(()=>({ok:true}),error=>({error}));await barrier(424241);
    await command(reviewer,'submit_review',{submission_id:id,overall_comment:'Concurrent completion'});
    const result=await observed;assert.match(result.error?.message??'',/already reviewed|unavailable/);
    assert.equal(await sql('select count(*) from peer_reviews where submission_id='+quote(id)+';'),'1');
    await command(author,'set_sharing',{submission_id:id,sharing_consent:false});
  });
  await check('expired reservation rejects reads and writes; explicit renewal retains a valid assignment',async()=>{
    const id=(await submit()).submission.id;await command(reviewer,'claim_submission',{submission_id:id});
    await sql('update peer_review_assignments set expires_at=now()-interval \'1 second\' where submission_id='+quote(id)+';');
    await assert.rejects(command(reviewer,'get_submission',{submission_id:id}),/Reserve/);
    await assert.rejects(command(reviewer,'submit_review',{submission_id:id,overall_comment:'expired'}),/Reserve/);
    await command(reviewer,'claim_submission',{submission_id:id});
    assert.ok((await command(reviewer,'get_submission',{submission_id:id})).submission.assignment_expires_at);
    await command(author,'set_sharing',{submission_id:id,sharing_consent:false});
  });
  await check('withdrawal serializes with reads/claims and revokes all remaining reservations',async()=>{
    const id=(await submit()).submission.id;await command(reviewer,'claim_submission',{submission_id:id});
    const holder=sql('begin;set role service_role;select '+expression(author,'set_sharing',{submission_id:id,sharing_consent:false})+';select pg_advisory_xact_lock(424243);select pg_sleep(0.5);commit;');
    await barrier(424243);
    const accesses=await Promise.allSettled([command(reviewer,'get_submission',{submission_id:id}),command(second,'claim_submission',{submission_id:id})]);
    await holder;assert.ok(accesses.every(r=>r.status==='rejected'&&/unavailable/.test(r.reason.message)));
    assert.equal(await sql('select count(*) from peer_review_assignments where submission_id='+quote(id)+';'),'0');
    await assert.rejects(command(reviewer,'submit_review',{submission_id:id,overall_comment:'withdrawn'}),/unavailable/);
    assert.equal((await command(author,'get_submission',{submission_id:id})).submission.essay_text,essay.trim());
  });
  await check('supported iTEP feedback scale, required text and range are enforced',async()=>{
    const id=(await submit(author,{exam_type:'itep'})).submission.id;await command(reviewer,'claim_submission',{submission_id:id});
    for(const payload of [{band_score:7,overall_comment:'invalid scale'},{band_score:'5',overall_comment:'invalid type'},{overall_comment:''},{overall_comment:'a'.repeat(3001)}]) {
      await assert.rejects(command(reviewer,'submit_review',{submission_id:id,...payload}),/scale|numeric|feedback/);
    }
    await command(reviewer,'submit_review',{submission_id:id,band_score:6,overall_comment:'Valid peer opinion'});
    await command(author,'set_sharing',{submission_id:id,sharing_consent:false});
  });
  await check('academy-scoped essays never enter public queue or reviewer access',async()=>{
    const id=randomUUID();await sql('insert into peer_review_submissions(id,user_id,tenant_id,essay_text,sharing_consent_at) values('+[id,author,tenant,essay].map(quote).join(',')+',now());');
    await assert.rejects(command(author,'set_sharing',{submission_id:id,sharing_consent:true}),/Academy/);
    await assert.rejects(command(reviewer,'claim_submission',{submission_id:id}),/unavailable/);
    assert.equal((await command(reviewer,'queue')).submissions.some(s=>s.id===id),false);
  });
  const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
  if(output)writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),nativePostgres:true,productionContacted:false,image,checks},null,2)+'\n');
}finally{if(created){await run(['rm','--force',name]);console.log('Owned native PostgreSQL container removed.');}}
