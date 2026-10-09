// Native, independent PostgreSQL connections; exclusively owned local fixtures.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const name='schood-marketplace-'+randomUUID().slice(0,8);
const image='postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const migration=readFileSync('supabase/migrations/20261009110000_marketplace_transaction_boundary.sql','utf8');
const baseline=readFileSync('supabase/migrations/20260608155000_features_5_to_11.sql','utf8');
const actors=Array.from({length:18},()=>randomUUID());
const [owner,teacher,otherTeacher,suspended,stranger,admin,member]=actors;
const tenant=randomUUID(),otherTenant=randomUUID(),personalTenant=randomUUID(),checks=[];
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
let created=false;
function run(args,input=''){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    const timer=setTimeout(()=>{child.kill();reject(Error('Owned local Docker operation timed out'));},30_000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err.trim()||'Owned Docker operation failed'));});child.stdin.end(input);
  });
}
const sql=s=>run(['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],s);
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
const expression=(actor,action,payload={})=>'public.marketplace_command('+(actor?quote(actor)+'::uuid':'null')+','+quote(action)+','+quote(JSON.stringify(payload))+'::jsonb)';
const command=async(actor,action,payload={})=>JSON.parse(await sql('set role service_role;select '+expression(actor,action,payload)+';'));
const profile=(actor=teacher,extra={})=>command(actor,'upsert_profile',{full_name:'Synthetic teacher',request_id:randomUUID(),expected_revision:0,...extra});
const job=(extra={})=>command(owner,'post_job',{tenant_id:tenant,title:'Synthetic teaching position',request_id:randomUUID(),...extra});
const check=async(label,test)=>{await test();checks.push({case:label,passed:true});console.log('PASS: '+label);};
async function barrier(id){for(let i=0;i<30;i++){if(await sql("select count(*) from pg_locks where locktype='advisory' and objid="+id+" and granted;")==='1')return;await pause();}throw Error('Independent transaction barrier unavailable');}
try{
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa=marketplace','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  let ready=false;for(let i=0;i<120;i++){try{if(await run(['exec',name,'cat','/proc/1/comm'])==='postgres'){await sql('select 1;');ready=true;break;}}catch{}await pause();}assert.ok(ready,'Final native PostgreSQL server unavailable');
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table users(id uuid primary key,is_active boolean not null default true);create table tenants(id uuid primary key,name text,type text not null default 'personal');
    create table tenant_memberships(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),user_id uuid references users(id),role text,status text,unique(tenant_id,user_id));
    alter table users enable row level security;create policy "Users view self" on users for select to authenticated using(id=auth.uid());
    alter table tenant_memberships enable row level security;create policy "Memberships view own" on tenant_memberships for select to authenticated using(user_id=auth.uid());
    create function public.is_academy_member(uuid) returns boolean language sql as $$select exists(select 1 from tenant_memberships where tenant_id=$1 and user_id=auth.uid() and status='active')$$;
    create function public.is_academy_admin(uuid) returns boolean language sql as $$select exists(select 1 from tenant_memberships where tenant_id=$1 and user_id=auth.uid() and status='active' and role in ('owner','admin'))$$;
    create function public.handle_teacher_studio_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
    insert into users(id) values ${actors.map(a=>'('+quote(a)+')').join(',')};
    insert into tenants values(${quote(tenant)},'Owned synthetic academy','team'),(${quote(otherTenant)},'Other synthetic academy','org'),(${quote(personalTenant)},'Personal synthetic tenant','personal');
    insert into tenant_memberships(tenant_id,user_id,role,status) values
      (${quote(tenant)},${quote(owner)},'owner','active'),(${quote(tenant)},${quote(admin)},'admin','active'),
      (${quote(tenant)},${quote(suspended)},'admin','disabled'),(${quote(tenant)},${quote(member)},'member','active'),
      (${quote(otherTenant)},${quote(stranger)},'owner','active'),(${quote(personalTenant)},${quote(teacher)},'owner','active');`);
  const start=baseline.indexOf('create table if not exists public.teacher_profiles');assert.ok(start>=0,'Legacy Marketplace DDL unavailable');await sql(baseline.slice(start));
  const legacyTeacher=randomUUID(),legacyJob=randomUUID();
  await sql(`grant update(verified),select(metadata) on teacher_profiles to authenticated,anon;
    insert into teacher_profiles(id,user_id,full_name,metadata) values(${quote(legacyTeacher)},${quote(teacher)},'Synthetic legacy teacher','{"private_marker":"QA-only"}');
    insert into job_listings(id,tenant_id,title,created_by) values(${quote(legacyJob)},${quote(tenant)},'Synthetic legacy position',${quote(owner)});`);
  await check('legacy browser can self-verify and insert a forged hired application',async()=>{
    await sql(`set role authenticated;select set_config('request.jwt.claim.sub',${quote(teacher)},false);update teacher_profiles set verified=true where id=${quote(legacyTeacher)};
      insert into job_applications(listing_id,teacher_id,status) values(${quote(legacyJob)},${quote(legacyTeacher)},'hired');`);
    assert.equal(await sql('select verified from teacher_profiles where id='+quote(legacyTeacher)+';'),'t');
    assert.equal(await sql('select status from job_applications where listing_id='+quote(legacyJob)+';'),'hired');
    await sql('delete from job_applications;update teacher_profiles set verified=false;');
  });
  await check('bounded migration lock failure rolls back grants and schema changes',async()=>{
    const holder=sql('begin;lock teacher_profiles in access exclusive mode;select pg_advisory_xact_lock(434340);select pg_sleep(3);rollback;');await barrier(434340);
    await assert.rejects(sql(migration),/lock timeout/);await holder;
    assert.equal(await sql("select count(*) from information_schema.columns where table_name='teacher_profiles' and column_name='revision';"),'0');
    assert.equal(await sql('set role anon;select count(*) from teacher_profiles;'),'1');
  });
  await sql(migration);
  for(const role of ['anon','authenticated'])await check(role+' cannot directly read/write trusted tables, columns or commands',async()=>{
    for(const table of ['teacher_profiles','job_listings','job_applications','marketplace_profile_requests','marketplace_application_decisions']){
      for(const statement of ['select * from '+table+';','insert into '+table+' default values;','update '+table+' set '+(table==='marketplace_profile_requests'?'request_id=request_id':'id=id')+';','delete from '+table+';'])await assert.rejects(sql('set role '+role+';'+statement),/permission denied/);
    }
    await assert.rejects(sql('set role '+role+';select metadata from teacher_profiles;'),/permission denied/);
    await assert.rejects(sql('set role '+role+';update teacher_profiles set verified=true;'),/permission denied/);
    await assert.rejects(sql('set role '+role+';select '+expression(owner,'my_jobs',{tenant_id:tenant})+';'),/permission denied/);
  });
  await check('existing records and service CRUD retained; ledgers are append-only',async()=>{
    assert.equal(await sql('set role service_role;select count(*) from teacher_profiles;'),'1');
    assert.equal(await sql('set role service_role;select metadata->>\'private_marker\' from teacher_profiles;'),'QA-only');
    for(const table of ['marketplace_profile_requests','marketplace_application_decisions']){
      await assert.rejects(sql('set role service_role;delete from '+table+';'),/permission denied/);
      await assert.rejects(sql('set role service_role;update '+table+' set request_id=request_id;'),/permission denied/);
    }
  });
  await check('public profile DTO hides private metadata and private/unavailable profiles',async()=>{
    let result=await command(null,'teachers');assert.equal(result.teachers.length,1);assert.ok(!('metadata'in result.teachers[0]));assert.ok(!('user_id'in result.teachers[0]));
    const created=await profile(otherTeacher);assert.equal(created.profile.is_public,false);assert.equal((await command(null,'teachers')).teachers.length,1);
  });
  const profilePayload={request_id:randomUUID(),expected_revision:1,full_name:'Updated synthetic teacher',is_public:true,available:true,hourly_rate:0,experience_years:0,subjects:['ielts'],verified:true,metadata:{forged:true},user_id:owner};
  await check('12 profile retries produce one immutable receipt and never self-verify',async()=>{
    const replies=await Promise.all(Array.from({length:12},()=>command(teacher,'upsert_profile',profilePayload)));
    assert.ok(replies.every(r=>r.profile.revision===2&&r.profile.id===legacyTeacher&&r.request_id===profilePayload.request_id));assert.equal(replies[0].profile.verified,false);
    assert.equal(replies[0].profile.hourly_rate,0);assert.equal(replies[0].profile.experience_years,0);
    assert.equal(await sql('select count(*) from marketplace_profile_requests where actor_id='+quote(teacher)+';'),'1');
    await assert.rejects(command(teacher,'upsert_profile',{...profilePayload,full_name:'Changed retry'}),/different content/);
  });
  await check('stale profile edits conflict; an old receipt never overwrites a newer visibility decision',async()=>{
    await command(teacher,'upsert_profile',{request_id:randomUUID(),expected_revision:2,full_name:'Private newer profile',is_public:false});
    await assert.rejects(command(teacher,'upsert_profile',{...profilePayload,request_id:randomUUID()}),/profile changed/);
    assert.equal((await command(teacher,'upsert_profile',profilePayload)).profile.revision,2);
    const current=await command(teacher,'get_my_profile');assert.equal(current.profile.revision,3);assert.equal(current.profile.is_public,false);assert.equal(current.profile.full_name,'Private newer profile');
  });
  await check('profile validation rejects invalid arrays, booleans, numbers and long fields',async()=>{
    for(const extra of [{subjects:'ielts'},{subjects:[{}]},{available:'false'},{hourly_rate:-1},{hourly_rate:1.5},{experience_years:[]},{bio:'a'.repeat(2001)}])await assert.rejects(command(teacher,'upsert_profile',{request_id:randomUUID(),expected_revision:3,full_name:'Invalid synthetic edit',...extra}),/ERROR:/);
    assert.equal((await command(teacher,'get_my_profile')).profile.revision,3);
  });
  await check('manager discovery excludes disabled, unrelated and ordinary members',async()=>{
    assert.equal((await command(owner,'manageable_tenants')).tenants[0].id,tenant);assert.equal((await command(admin,'manageable_tenants')).tenants[0].id,tenant);
    assert.deepEqual((await command(member,'manageable_tenants')).tenants,[]);assert.deepEqual((await command(suspended,'manageable_tenants')).tenants,[]);
    for(const actor of [teacher,member,suspended,stranger])for(const action of ['my_jobs','post_job'])await assert.rejects(command(actor,action,{tenant_id:tenant,title:'Refused synthetic listing',request_id:randomUUID()}),/active owner or administrator/);
  });
  await check('browser membership edits cannot turn an ordinary member into a manager',async()=>{
    await sql('set role authenticated;select set_config(\'request.jwt.claim.sub\','+quote(member)+',false);update tenant_memberships set role=\'owner\' where tenant_id='+quote(tenant)+' and user_id='+quote(member)+';');
    assert.equal(await sql('select role from tenant_memberships where tenant_id='+quote(tenant)+' and user_id='+quote(member)+';'),'member');
    await assert.rejects(command(member,'my_jobs',{tenant_id:tenant}),/active owner or administrator/);
  });
  await check('automatic personal-tenant ownership does not grant academy publishing access',async()=>{
    assert.deepEqual((await command(teacher,'manageable_tenants')).tenants,[]);
    for(const action of ['post_job','my_jobs'])await assert.rejects(command(teacher,action,{tenant_id:personalTenant,title:'Refused personal listing',request_id:randomUUID()}),/active owner or administrator/);
    await sql('insert into job_listings(tenant_id,title,created_by) values('+quote(personalTenant)+',\'Hidden legacy personal listing\','+quote(teacher)+');');
    assert.ok(!(await command(null,'jobs')).jobs.some(j=>j.tenant_id===personalTenant));
  });
  await check('disabled accounts cannot issue private commands or remain publicly listed',async()=>{
    await sql('update users set is_active=false where id='+quote(teacher)+';');
    for(const action of ['get_my_profile','my_applications','manageable_tenants'])await assert.rejects(command(teacher,action),/active account/);
    assert.ok(!(await command(null,'teachers')).teachers.some(t=>t.id===legacyTeacher));
    await sql('update users set is_active=true where id='+quote(teacher)+';');
  });
  const jobPayload={tenant_id:tenant,title:'Duplicate-title synthetic position',description:'Original synthetic job description',request_id:randomUUID(),salary_min:0,salary_max:0,subjects:['ielts'],expires_in_days:30};
  let jobId;
  await check('12 post retries create one job and preserve original expiration and content',async()=>{
    const replies=await Promise.all(Array.from({length:12},()=>command(owner,'post_job',jobPayload)));jobId=replies[0].job.id;
    assert.ok(replies.every(r=>r.job.id===jobId&&r.job.request_id===jobPayload.request_id));assert.equal(await sql('select count(*) from job_listings where request_id='+quote(jobPayload.request_id)+';'),'1');
    await assert.rejects(command(owner,'post_job',{...jobPayload,title:'Changed retry'}),/different content/);
  });
  await check('job validation rejects invalid salary bounds, duration, employment and text',async()=>{
    for(const extra of [{salary_min:100,salary_max:50},{salary_min:-1},{expires_in_days:0},{expires_in_days:366},{expires_in_days:'30'},{employment_type:'unknown'},{remote_ok:'false'},{description:'a'.repeat(3001)}])await assert.rejects(job(extra),/ERROR:/);
  });
  let appId;
  await check('12 applications save once, always pending, without accepting forged status',async()=>{
    const replies=await Promise.all(Array.from({length:12},()=>command(teacher,'apply',{listing_id:jobId,cover_note:'Original synthetic note',status:'hired',teacher_id:owner})));
    appId=replies[0].application.id;assert.ok(replies.every(r=>r.application.id===appId&&r.application.status==='pending'&&r.application.listing_id===jobId));
    assert.equal(await sql('select count(*) from job_applications where listing_id='+quote(jobId)+';'),'1');
  });
  await check('application management denies other tenants, disabled managers and ordinary members',async()=>{
    for(const actor of [teacher,stranger,suspended,member])for(const action of ['close_job','list_applications','update_application_status'])await assert.rejects(command(actor,action,{job_id:jobId,application_id:appId,status:'hired',expected_status:'pending',request_id:randomUUID()}),/active owner or administrator/);
    const list=await command(admin,'list_applications',{job_id:jobId});assert.equal(list.applications[0].id,appId);assert.ok(!('user_id'in list.applications[0].teacher_profiles));
  });
  const decision={application_id:appId,status:'shortlisted',expected_status:'pending',request_id:randomUUID()};
  await check('12 decision retries append one receipt and preserve an employer decision',async()=>{
    const replies=await Promise.all(Array.from({length:12},()=>command(owner,'update_application_status',decision)));
    assert.ok(replies.every(r=>r.decision.id===replies[0].decision.id&&r.application.status==='shortlisted'));
    assert.equal(await sql('select count(*) from marketplace_application_decisions where application_id='+quote(appId)+';'),'1');
    const replay=await command(teacher,'apply',{listing_id:jobId,cover_note:'Changed retry'});assert.equal(replay.application.status,'shortlisted');assert.equal(await sql('select cover_note from job_applications where id='+quote(appId)+';'),'Original synthetic note');
  });
  await check('optimistic decisions conflict and old decision receipts cannot regress a later hire',async()=>{
    await command(admin,'update_application_status',{...decision,request_id:randomUUID(),expected_status:'shortlisted',status:'hired'});
    await assert.rejects(command(owner,'update_application_status',{...decision,request_id:randomUUID(),status:'rejected'}),/application changed/);
    const replay=await command(owner,'update_application_status',decision);assert.equal(replay.decision.to_status,'shortlisted');assert.equal(replay.application.status,'hired');
    await assert.rejects(command(owner,'update_application_status',{...decision,status:'rejected'}),/different content/);
    assert.equal((await command(teacher,'apply',{listing_id:jobId})).application.status,'hired');
  });
  await check('application histories use stable listing identities even when job titles match',async()=>{
    const twin=await job({title:jobPayload.title});await command(teacher,'apply',{listing_id:twin.job.id});
    const history=await command(teacher,'my_applications');assert.equal(history.applications.length,2);assert.ok(history.applications.some(a=>a.listing_id===jobId&&a.status==='hired'));assert.ok(history.applications.some(a=>a.listing_id===twin.job.id&&a.status==='pending'));
    assert.deepEqual((await command(stranger,'my_applications')).applications,[]);
  });
  await check('closed and expired jobs disappear publicly and reject new applications',async()=>{
    await command(owner,'close_job',{job_id:jobId});await assert.rejects(command(otherTeacher,'apply',{listing_id:jobId}),/no longer accepting/);
    assert.equal((await command(teacher,'apply',{listing_id:jobId})).application.status,'hired');
    assert.ok(!(await command(null,'jobs')).jobs.some(j=>j.id===jobId));
    const expired=await job();await sql('update job_listings set expires_at=clock_timestamp()-interval \'1 second\' where id='+quote(expired.job.id)+';');
    await assert.rejects(command(otherTeacher,'apply',{listing_id:expired.job.id}),/no longer accepting/);assert.ok(!(await command(null,'jobs')).jobs.some(j=>j.id===expired.job.id));
  });
  await check('profile receipt failure rolls back the edit and its revision together',async()=>{
    await sql("create function fail_profile_receipt() returns trigger language plpgsql as $$begin raise exception 'forced profile receipt failure';end$$;create trigger fail_profile before insert on marketplace_profile_requests for each row execute function fail_profile_receipt();");
    await assert.rejects(command(teacher,'upsert_profile',{request_id:randomUUID(),expected_revision:3,full_name:'Must roll back',is_public:true}),/forced profile receipt failure/);
    const current=await command(teacher,'get_my_profile');assert.equal(current.profile.revision,3);assert.equal(current.profile.is_public,false);
    await sql('drop trigger fail_profile on marketplace_profile_requests;');
  });
  await check('concurrent listing close and application serialize without admitting after-close writes',async()=>{
    const target=await job();const closing=sql('begin;set role service_role;select '+expression(owner,'close_job',{job_id:target.job.id})+';select pg_advisory_xact_lock(434341);select pg_sleep(1);commit;');await barrier(434341);
    await assert.rejects(command(otherTeacher,'apply',{listing_id:target.job.id}),/no longer accepting/);await closing;
    assert.equal(await sql('select count(*) from job_applications where listing_id='+quote(target.job.id)+';'),'0');
  });
  await check('membership revocation serializes with manager commands and denies access after commit',async()=>{
    const revoking=sql('begin;update tenant_memberships set status=\'disabled\' where tenant_id='+quote(tenant)+' and user_id='+quote(admin)+';select pg_advisory_xact_lock(434342);select pg_sleep(1);commit;');await barrier(434342);
    await assert.rejects(command(admin,'my_jobs',{tenant_id:tenant}),/active owner or administrator/);await revoking;
    await assert.rejects(command(admin,'list_applications',{job_id:jobId}),/active owner or administrator/);
  });
  await check('account suspension serializes with private commands and refuses them after commit',async()=>{
    const disabling=sql('begin;update users set is_active=false where id='+quote(owner)+';select pg_advisory_xact_lock(434343);select pg_sleep(1);commit;');await barrier(434343);
    await assert.rejects(command(owner,'my_jobs',{tenant_id:tenant}),/active account/);await disabling;
    await assert.rejects(command(owner,'post_job',{...jobPayload,request_id:randomUUID()}),/active account/);
  });
  await check('unreviewed historical verification flags never become public trust badges',async()=>{
    const auditedTeacher=actors[17];const saved=await profile(auditedTeacher,{is_public:true});
    await sql('update teacher_profiles set verified=true where id='+quote(saved.profile.id)+';');
    assert.equal((await command(null,'teachers')).teachers.find(t=>t.id===saved.profile.id).verified,false);
    await command(auditedTeacher,'upsert_profile',{full_name:'Synthetic audited teacher',request_id:randomUUID(),expected_revision:1,is_public:true,verification_reviewed_at:'2026-10-01T00:00:00Z',verification_reviewed_by:auditedTeacher});
    assert.equal((await command(null,'teachers')).teachers.find(t=>t.id===saved.profile.id).verified,false);
    await sql('update teacher_profiles set verification_reviewed_at=clock_timestamp(),verification_reviewed_by='+quote(admin)+' where id='+quote(saved.profile.id)+';');
    assert.equal((await command(null,'teachers')).teachers.find(t=>t.id===saved.profile.id).verified,true);
  });
  const evidence={checkedAt:new Date().toISOString(),nativePostgres:true,productionContacted:false,image,checks};
  const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);if(output)writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
  console.log('Native Marketplace cases passed: '+checks.length);
}finally{if(created){await run(['rm','--force',name]);console.log('Owned native Marketplace container removed.');}}
