// Native SQL proof on an exclusively owned, network-isolated PostgreSQL.
// No production credentials or customer data are accessed.
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const name='schood-account-retention-'+randomUUID().slice(0,8);
const image='postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const source=readFileSync('supabase/migrations/20260202170000_platform_spine.sql','utf8');
const migration=readFileSync('supabase/migrations/20261009149000_account_deletion_ownership_guard.sql','utf8');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const table=n=>{const start=source.indexOf('create table if not exists public.'+n+' (');assert.ok(start>=0);return source.slice(start,source.indexOf('\n);',start)+4);};
const canonical=(file,n)=>{const s=readFileSync('supabase/migrations/'+file,'utf8').replaceAll('\r\n','\n');const start=s.indexOf('create table if not exists public.'+n+' (');assert.ok(start>=0,'Canonical table missing: '+n);return s.slice(start,s.indexOf('\n);',start)+4);};
const apiName=name+'-api',httpName=name+'-http';
const apiImage='postgrest/postgrest:v13.0.7@sha256:0a46780309a604cdc8b56c776c6e5e15788ce58174d709e40459ab5a2d44d228';
const nodeImage='node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20';
const checks=[];let owned=false,apiOwned=false,passed=false;
function run(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    const timer=setTimeout(()=>{child.kill();reject(Error('Owned SQL operation timed out'));},args[0]==='run'?120000:35000);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err.trim()||'Owned SQL operation failed'));});child.stdin.end(input);
  });
}
const sql=text=>run(['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],text);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=async(label,action)=>{await action();checks.push(label);console.log('PASS: '+label);};
async function barrier(id){for(let i=0;i<80;i++){if(await sql("select count(*) from pg_locks where locktype='advisory' and objid="+id+" and granted;")==='1')return;await pause(30);}throw Error('Owned SQL barrier unavailable');}
async function actor(){const id=randomUUID();await sql(`insert into auth.users(id,email) values(${q(id)},'owned@example.invalid');insert into users(id,email) values(${q(id)},'owned@example.invalid');`);return id;}
async function tenant(creator,type='org') {const id=randomUUID();await sql(`insert into tenants(id,name,slug,type,created_by) values(${q(id)},'Owned QA',${q(id)},${q(type)},${creator===null?'null':q(creator)});`);return id;}
const membership=(id,t,role='owner',status='active')=>sql(`insert into tenant_memberships(tenant_id,user_id,role,status) values(${q(t)},${q(id)},${q(role)},${q(status)});`);
const preflight=id=>sql(`set role service_role;select public.account_deletion_preflight(${q(id)}::uuid);`).then(JSON.parse);
const remove=id=>sql(`delete from auth.users where id=${q(id)};`);
const exists=id=>sql(`select count(*) from auth.users where id=${q(id)};`);
try {
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa=account-retention','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);owned=true;
  let ready=false;for(let i=0;i<120;i++){try{if(await run(['exec',name,'cat','/proc/1/comm'])==='postgres'){await sql('select 1;');ready=true;break;}}catch{}await pause(100);}assert.ok(ready);
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
    create role authenticator noinherit login;grant anon,authenticated,service_role to authenticator;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
    ${table('users')}${table('tenants')}${table('tenant_memberships')}
    create table academy_contacts(id uuid primary key default gen_random_uuid(),academy_id uuid references tenants(id));
    create table academy_staff(id uuid primary key default gen_random_uuid(),academy_id uuid references tenants(id));
    create table academy_classrooms(id uuid primary key default gen_random_uuid(),academy_id uuid references tenants(id));
    create table academy_branding(id uuid primary key default gen_random_uuid(),academy_id uuid references tenants(id));
    create table partner_center_profiles(tenant_id uuid primary key references tenants(id));`);
  await sql(migration);
  for(const role of ['anon','authenticated'])await check(role+' cannot inspect or invoke account ownership commands',async()=>{
    await assert.rejects(sql(`set role ${role};select account_deletion_preflight(${q(randomUUID())});`),/permission denied/);
    await assert.rejects(sql(`set role ${role};select guard_account_deletion_ownership();`),/permission denied/);
  });
  await check('service role cannot directly invoke the Auth trigger',async()=>{await assert.rejects(sql('set role service_role;select guard_account_deletion_ownership();'),/permission denied/);});
  await check('missing domain identity is private and cannot become eligible',async()=>{assert.deepEqual(await preflight(randomUUID()),{eligible:false,code:'account_session_required'});});
  await check('ordinary personal accounts retain the existing hard deletion path',async()=>{const u=await actor(),t=await tenant(u,'personal');await membership(u,t);assert.deepEqual(await preflight(u),{eligible:true});await remove(u);assert.equal(await exists(u),'0');assert.equal(await sql(`select count(*) from users where id=${q(u)};`),'0');});
  await check('current business owner must transfer even when another active owner exists',async()=>{const u=await actor(),other=await actor(),t=await tenant(u);await membership(u,t);await membership(other,t);assert.equal((await preflight(u)).code,'account_ownership_transfer_required');await assert.rejects(remove(u),/account_ownership_transfer_required/);assert.equal(await exists(u),'1');});
  await check('soft deletion cannot bypass ownership transfer and rolls back all Auth fields',async()=>{const u=await actor(),t=await tenant(u);await membership(u,t);await assert.rejects(sql(`update auth.users set deleted_at=now(),email='redacted' where id=${q(u)};`),/account_ownership_transfer_required/);assert.equal(await sql(`select email||':'||(deleted_at is null)::text from auth.users where id=${q(u)};`),'owned@example.invalid:true');});
  await check('unrelated Auth updates are not intercepted',async()=>{const u=await actor(),t=await tenant(u);await membership(u,t);await sql(`update auth.users set email='changed@example.invalid' where id=${q(u)};`);assert.equal(await sql(`select email from auth.users where id=${q(u)};`),'changed@example.invalid');});
  await check('a completed transfer preserves historical creator and academy records',async()=>{const u=await actor(),other=await actor(),t=await tenant(u);await membership(u,t,'member');await membership(other,t);await sql(`insert into academy_contacts(academy_id) values(${q(t)});`);assert.deepEqual(await preflight(u),{eligible:true});await remove(u);assert.equal(await sql(`select count(*) from tenants where id=${q(t)};`),'1');assert.equal(await sql(`select count(*) from academy_contacts where academy_id=${q(t)};`),'1');});
  await check('disabled or inactive replacement owners cannot orphan a historical workspace',async()=>{for(const inactive of ['membership','user']){const u=await actor(),other=await actor(),t=await tenant(u);await membership(u,t,'member');await membership(other,t,'owner',inactive==='membership'?'disabled':'active');if(inactive==='user')await sql(`update users set is_active=false where id=${q(other)};`);assert.equal((await preflight(u)).code,'account_ownership_transfer_required');await assert.rejects(remove(u),/account_ownership_transfer_required/);}});
  await check('an owner without creator attribution must still transfer',async()=>{const u=await actor(),creator=await actor(),t=await tenant(creator);await membership(u,t);assert.equal((await preflight(u)).code,'account_ownership_transfer_required');});
  for(const anchor of ['academy_contacts','academy_staff','academy_classrooms','academy_branding','partner_center_profiles'])await check('legacy personal tenant with '+anchor+' is institutional',async()=>{const u=await actor(),t=await tenant(u,'personal');await membership(u,t);await sql(`insert into ${anchor}(${anchor==='partner_center_profiles'?'tenant_id':'academy_id'}) values(${q(t)});`);assert.equal((await preflight(u)).code,'account_ownership_transfer_required');await assert.rejects(remove(u),/account_ownership_transfer_required/);});
  await check('ownership promotion after preflight is rechecked by the final Auth transaction',async()=>{const u=await actor(),other=await actor(),t=await tenant(other);await membership(u,t,'member');await membership(other,t);assert.deepEqual(await preflight(u),{eligible:true});await sql(`update tenant_memberships set role='owner' where tenant_id=${q(t)} and user_id=${q(u)};`);await assert.rejects(remove(u),/account_ownership_transfer_required/);});
  await check('uncommitted concurrent promotion blocks deletion and then fails safely',async()=>{const u=await actor(),other=await actor(),t=await tenant(other);await membership(u,t,'member');await membership(other,t);const promotion=sql(`begin;update tenant_memberships set role='owner' where tenant_id=${q(t)} and user_id=${q(u)};select pg_advisory_xact_lock(464401);select pg_sleep(1.2);commit;`);await barrier(464401);await assert.rejects(remove(u),/account_ownership_transfer_required/);await promotion;assert.equal(await exists(u),'1');});
  await check('new concurrent membership cannot attach to a disappearing account',async()=>{const u=await actor(),other=await actor(),t=await tenant(other);const deletion=sql(`begin;delete from auth.users where id=${q(u)};select pg_advisory_xact_lock(464402);select pg_sleep(1.2);commit;`);await barrier(464402);await assert.rejects(membership(u,t),/foreign key constraint/);await deletion;assert.equal(await exists(u),'0');});
  await check('late financial restriction rolls back the entire deletion without erasing identity',async()=>{const u=await actor();await sql(`create table if not exists owned_financial_receipts(user_id uuid references users(id) on delete restrict);insert into owned_financial_receipts values(${q(u)});`);assert.deepEqual(await preflight(u),{eligible:true});await assert.rejects(remove(u),/foreign key constraint/);assert.equal(await exists(u),'1');assert.equal(await sql(`select email from users where id=${q(u)};`),'owned@example.invalid');});
  await check('pre-mirror Auth cleanup remains possible',async()=>{const u=randomUUID();await sql(`insert into auth.users(id) values(${q(u)});`);await remove(u);assert.equal(await exists(u),'0');});
  // Now qualify the database erasure/old-JWT boundary with canonical personal
  // records and real FK constraints. This is SQL-trigger proof, not an Auth
  // service emulator or a claim of the complete hosted schema being installed.
  await sql(`grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    alter table users add column telegram_chat_id text;
    alter table tenants add column metadata jsonb not null default '{}';
    alter table academy_contacts add column user_id uuid references users(id),add column notify_enabled boolean not null default true;
    alter table academy_staff add column user_id uuid references users(id),add column is_active boolean not null default true;
    create table languages(id uuid primary key);create table products(id uuid primary key);
    create table learning_content_registry_items(id uuid primary key);create table writing_prompts(id uuid primary key);create table speaking_prompts(id uuid primary key);
    create table experiences(id uuid primary key);create table content_units(id uuid primary key);
    ${canonical('20260208040000_user_profiles.sql','user_profiles')}
    ${canonical('20260420110000_english_learning_shared_core.sql','learning_attempts')}
    ${canonical('20260420110000_english_learning_shared_core.sql','learner_language_goals')}
    ${canonical('20260420123000_english_listening_writing_phase2.sql','writing_drafts')}
    ${canonical('20260420123000_english_listening_writing_phase2.sql','writing_revision_cycles')}
    ${canonical('20260420140000_english_speaking_grammar_phase3.sql','speaking_attempts')}
    ${canonical('20260420140000_english_speaking_grammar_phase3.sql','speaking_transcripts')}
    ${canonical('20260514122000_sat_practice_mastery_and_plan.sql','sat_practice_mastery')}
    ${canonical('20260608130000_monetization_features.sql','writing_tutor_sessions')}
    ${canonical('20260608155000_features_5_to_11.sql','speaking_coach_sessions')}
    ${canonical('20260608155000_features_5_to_11.sql','teacher_profiles')}
    ${canonical('20260501120000_partner_referrals_and_credits.sql','referral_accounts')}
    ${canonical('20260227120000_admin_rbac_and_security_controls.sql','admin_audit_logs')}
    ${canonical('20260812130000_telegram_growth_system.sql','telegram_acquisition_sessions')}
    ${table('sessions')}${table('responses')}${table('payments')}${table('entitlements')}
    alter table entitlements add column tenant_id uuid references tenants(id);
    ${canonical('20260210225000_trial_claims_and_limits.sql','trial_claims')}
    create table billing_subscriptions(id uuid primary key,user_id uuid references users(id),tenant_id uuid references tenants(id),status text,metadata jsonb not null default '{}');
    create table exam_tokens(id uuid primary key,tenant_id uuid references tenants(id));
    create table exam_registrations(id uuid primary key,user_id uuid references users(id),tenant_id uuid references tenants(id),session_id uuid references sessions(id),first_name text,last_name text,legal_name text,email text,phone text);
    alter table sessions add column token_id uuid references exam_tokens(id),add column registration_id uuid references exam_registrations(id);
    create table exam_admission_receipts(session_id uuid primary key references sessions(id) on delete restrict,user_id uuid references users(id) on delete restrict);
    create table academy_submissions(id uuid primary key,academy_id uuid references tenants(id),user_id uuid references users(id),session_id uuid references sessions(id),submission_content text);
    create table owned_paid_receipt(payment_id uuid primary key references payments(id) on delete restrict,user_id uuid references users(id) on delete restrict,tenant_id uuid references tenants(id) on delete restrict,result jsonb not null);
    create table public_catalog(id uuid primary key,description text);
    alter table users enable row level security;create policy own_user on users for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
    alter table user_profiles enable row level security;create policy own_profile on user_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    alter table public_catalog enable row level security;create policy public_catalog_read on public_catalog for select to anon,authenticated using(true);
    alter table academy_submissions enable row level security;create policy owned_fixture_academy_read on academy_submissions for select to authenticated using(true);`);
  const principalBoundary=readFileSync('supabase/migrations/20261010150000_account_closed_principal_boundary.sql','utf8');
  await check('principal migration contention rolls back its entire policy/receipt installation',async()=>{
    const holder=sql('begin;lock users in access exclusive mode;select pg_advisory_xact_lock(464410);select pg_sleep(3);rollback;');await barrier(464410);
    await assert.rejects(sql(principalBoundary),/lock timeout/);await holder;
    assert.equal(await sql("select to_regclass('public.account_closure_receipts') is null;"),'t');
  });
  await sql(principalBoundary);
  await sql(readFileSync('supabase/migrations/20261010151000_account_personal_erasure_transaction.sql','utf8'));
  const apiGuard=readFileSync('supabase/migrations/20261010152000_account_api_request_guard.sql','utf8');
  await check('API guard refuses an existing unreviewed request hook without replacing it',async()=>{
    await sql("alter role authenticator set pgrst.db_pre_request='public.owned_existing_hook';");
    await assert.rejects(sql(apiGuard),/Existing API request hook requires review/);
    assert.equal(await sql("select array_to_string(setconfig,',') from pg_db_role_setting where setrole='authenticator'::regrole;"),'pgrst.db_pre_request=public.owned_existing_hook');
    assert.equal(await sql("select to_regprocedure('public.account_api_pre_request()') is null;"),'t');
    await sql('alter role authenticator reset pgrst.db_pre_request;');
  });
  await sql(apiGuard);
  const close=id=>sql(`update auth.users set deleted_at=now(),email='provider-obfuscated' where id=${q(id)};`);
  const asActor=(id,query)=>sql(`set request.jwt.claim.sub=${q(id)};set role authenticated;${query}`);
  const language=randomUUID(),product=randomUUID(),content=randomUUID(),prompt=randomUUID(),exam=randomUUID(),unit=randomUUID();
  await sql(`insert into languages values(${q(language)});insert into products values(${q(product)});insert into learning_content_registry_items values(${q(content)});insert into writing_prompts values(${q(prompt)});insert into speaking_prompts values(${q(prompt)});insert into experiences values(${q(exam)});insert into content_units values(${q(unit)});insert into public_catalog values(${q(randomUUID())},'Public content');`);
  const profile=id=>sql(`insert into user_profiles(user_id,first_name,last_name,phone) values(${q(id)},'Private','Learner','private-phone');`);
  const study=async id=>{
    const draft=randomUUID(),speech=randomUUID(),attempt=randomUUID();
    await profile(id);
    await sql(`insert into learning_attempts(id,user_id,language_id,product_id,content_item_id,service_key,attempt_type,response_json) values(${q(attempt)},${q(id)},${q(language)},${q(product)},${q(content)},'writing','draft','{"private":"answer"}');
      insert into writing_drafts(id,user_id,language_id,product_id,prompt_id,current_text) values(${q(draft)},${q(id)},${q(language)},${q(product)},${q(prompt)},'Private essay');
      insert into speaking_attempts(id,user_id,language_id,product_id,prompt_id) values(${q(speech)},${q(id)},${q(language)},${q(product)},${q(prompt)});
      insert into speaking_transcripts(attempt_id,user_id,transcript_text) values(${q(speech)},${q(id)},'Private speech');
      insert into learner_language_goals(user_id,language_id,product_id) values(${q(id)},${q(language)},${q(product)});`);
  };
  await check('account closure starts disabled and cannot partially erase an account',async()=>{
    const u=await actor();await study(u);assert.equal(JSON.parse(await sql(`set role service_role;select account_closure_preflight(${q(u)});`)).code,'account_delete_unavailable');
    await assert.rejects(close(u),/account_closure_unavailable/);assert.equal(await sql(`select count(*) from user_profiles where user_id=${q(u)};`),'1');assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(u)};`),'t');
  });
  for(const role of ['anon','authenticated','service_role'])await check(role+' cannot enable erasure or rewrite closure receipts',async()=>{
    await assert.rejects(sql(`set role ${role};update account_closure_config set enabled=true;`),/permission denied/);
    for(const query of ['insert into account_closure_receipts default values','update account_closure_receipts set purge_version=2','delete from account_closure_receipts'])await assert.rejects(sql(`set role ${role};${query};`),/permission denied/);
    for(const query of ['select * from account_closure_qualifications','insert into account_closure_qualifications default values','update account_closure_qualifications set expires_at=now()','delete from account_closure_qualifications',`select account_closure_is_enabled(${q(randomUUID())})`,`select account_personal_tenants(${q(randomUUID())})`])await assert.rejects(sql(`set role ${role};${query};`),/permission denied/);
    for(const query of ['select * from account_closed_personal_tenants','insert into account_closed_personal_tenants default values','update account_closed_personal_tenants set user_id=null','delete from account_closed_personal_tenants','select guard_closed_account_billing()'])await assert.rejects(sql(`set role ${role};${query};`),/permission denied/);
  });
  await check('owner-only qualification erases only the selected QA actor while global closure stays disabled',async()=>{
    const qa=await actor(),other=await actor();await study(qa);await study(other);
    await sql(`insert into account_closure_qualifications(user_id,expires_at) values(${q(qa)},clock_timestamp()+interval '30 minutes');`);
    assert.deepEqual(JSON.parse(await sql(`set role service_role;select account_closure_preflight(${q(qa)});`)),{eligible:true});
    await close(qa);await assert.rejects(close(other),/account_closure_unavailable/);
    assert.equal(await sql('select enabled from account_closure_config;'),'f');assert.equal(await sql(`select count(*) from writing_drafts where user_id=${q(other)};`),'1');
    await sql(`delete from account_closure_qualifications where user_id=${q(qa)};`);
    await assert.rejects(remove(qa),/account_soft_delete_required/);
  });
  await check('a revoked qualification is rechecked in the final Auth transaction without any purge',async()=>{
    const u=await actor();await study(u);await sql(`insert into account_closure_qualifications(user_id,expires_at) values(${q(u)},clock_timestamp()+interval '30 minutes');`);
    assert.deepEqual(JSON.parse(await sql(`set role service_role;select account_closure_preflight(${q(u)});`)),{eligible:true});
    await sql(`delete from account_closure_qualifications where user_id=${q(u)};`);await assert.rejects(close(u),/account_closure_unavailable/);
    assert.equal(await sql(`select count(*) from writing_drafts where user_id=${q(u)};`),'1');
  });
  await check('qualification expiry is checked after ownership lock waits using the current clock',async()=>{
    const u=await actor();await study(u);await sql(`insert into account_closure_qualifications(user_id,expires_at) values(${q(u)},clock_timestamp()+interval '1.5 seconds');`);
    const holder=sql(`begin;select id from users where id=${q(u)} for update;select pg_advisory_xact_lock(464413);select pg_sleep(2.2);commit;`);await barrier(464413);
    await assert.rejects(close(u),/account_closure_unavailable/);await holder;assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(u)};`),'t');
  });
  await check('qualification cannot bypass ownership and cannot last more than one hour',async()=>{
    const u=await actor(),t=await tenant(u);await membership(u,t);await profile(u);
    await assert.rejects(sql(`insert into account_closure_qualifications(user_id,expires_at) values(${q(u)},clock_timestamp()+interval '2 hours');`),/check constraint/);
    await sql(`insert into account_closure_qualifications(user_id,expires_at) values(${q(u)},clock_timestamp()+interval '30 minutes');`);
    await assert.rejects(close(u),/account_ownership_transfer_required/);assert.equal(await sql(`select count(*) from user_profiles where user_id=${q(u)};`),'1');
  });
  await sql('update account_closure_config set enabled=true;');
  await check('enabled closure still fails closed if its API hook pointer is absent',async()=>{
    const u=await actor();await profile(u);await sql('alter role authenticator reset pgrst.db_pre_request;');
    await assert.rejects(close(u),/account_closure_unavailable/);
    assert.equal(await sql(`select count(*) from user_profiles where user_id=${q(u)};`),'1');
    await sql("alter role authenticator set pgrst.db_pre_request='public.account_api_pre_request';");
  });
  await check('old live JWT can read its own profile before closure and public access stays available',async()=>{
    const u=await actor();await profile(u);assert.equal(await asActor(u,`select count(*) from user_profiles where user_id=${q(u)};`),'1');assert.equal(await asActor(u,'select count(*) from public_catalog;'),'1');assert.equal(await sql('set role anon;select count(*) from public_catalog;'),'1');
  });
  await check('legacy personal ownership without creator attribution still anonymizes the tenant and deactivates access',async()=>{
    const u=await actor(),t=await tenant(null,'personal');await membership(u,t);await study(u);
    await sql(`update tenants set name='Private legacy workspace',metadata='{"private":"owner"}' where id=${q(t)};
      insert into entitlements(user_id,tenant_id,resource_type,resource_id,is_active) values(${q(u)},${q(t)},'product',${q(product)},true);
      insert into trial_claims(user_id,tenant_id,product_id,expires_at,metadata) values(${q(u)},${q(t)},${q(product)},now()+interval '7 days','{"private":"answers"}');`);
    await close(u);assert.equal(await sql(`select name||':'||metadata::text from tenants where id=${q(t)};`),'Deleted personal account:{}');
    assert.equal(await sql(`select is_active from entitlements where user_id=${q(u)};`),'f');assert.equal(await sql(`select metadata::text from trial_claims where user_id=${q(u)};`),'{}');
    await assert.rejects(sql(`set role service_role;update trial_claims set metadata='{"private":"restored"}' where user_id=${q(u)};`),/account_closed/);
  });
  await check('ongoing personal or institutional payer billing blocks erasure without changing financial or learning data',async()=>{
    for(const kind of ['active','trialing','past_due','paused','unrecognized','']){
      const u=await actor(),t=await tenant(null,'personal'),bill=randomUUID();await membership(u,t);await study(u);
      await sql(`insert into billing_subscriptions values(${q(bill)},${q(u)},${q(t)},${q(kind)},'{"financial":"history"}');`);
      const before=await sql(`select row_to_json(b) from billing_subscriptions b where id=${q(bill)};`);
      assert.equal(JSON.parse(await sql(`set role service_role;select account_closure_preflight(${q(u)});`)).code,'account_billing_review_required');
      await assert.rejects(close(u),/account_closure_unavailable/);assert.equal(await sql(`select row_to_json(b) from billing_subscriptions b where id=${q(bill)};`),before);
      assert.equal(await sql(`select count(*) from writing_drafts where user_id=${q(u)};`),'1');
    }
    const u=await actor(),owner=await actor(),t=await tenant(owner);await membership(u,t,'member');await membership(owner,t);
    await sql(`insert into billing_subscriptions values(${q(randomUUID())},${q(u)},${q(t)},'active','{}');`);
    await assert.rejects(close(u),/account_closure_unavailable/);
  });
  await check('terminal subscription evidence remains unchanged and other institutional payers continue after closure',async()=>{
    for(const status of ['canceled','cancelled','expired']){
      const u=await actor(),bill=randomUUID();await sql(`insert into billing_subscriptions values(${q(bill)},${q(u)},null,${q(status)},'{"financial":"history"}');`);
      const before=await sql(`select row_to_json(b) from billing_subscriptions b where id=${q(bill)};`);await close(u);
      assert.equal(await sql(`select row_to_json(b) from billing_subscriptions b where id=${q(bill)};`),before);
    }
    const u=await actor(),owner=await actor(),t=await tenant(owner),bill=randomUUID();await membership(u,t,'member');await membership(owner,t);
    await sql(`insert into billing_subscriptions values(${q(bill)},${q(owner)},${q(t)},'active','{"institution":"contract"}');`);
    await close(u);assert.equal(await sql(`select status||':'||metadata::text from billing_subscriptions where id=${q(bill)};`),'active:{"institution": "contract"}');
  });
  await check('closed payer and creatorless personal scope cannot resume billing or detach retained subscription identities',async()=>{
    const u=await actor(),other=await actor(),t=await tenant(null,'personal'),bill=randomUUID();await membership(u,t);
    await sql(`insert into billing_subscriptions values(${q(bill)},${q(u)},${q(t)},'canceled','{"financial":"history"}');`);
    await close(u);
    await assert.rejects(sql(`set role service_role;update billing_subscriptions set status='active' where id=${q(bill)};`),/account_closed/);
    await assert.rejects(sql(`update billing_subscriptions set user_id=${q(other)},tenant_id=null where id=${q(bill)};`),/account_closed/);
    await assert.rejects(sql(`insert into billing_subscriptions values(${q(randomUUID())},null,${q(t)},'active','{}');`),/account_closed/);
    await assert.rejects(sql(`insert into billing_subscriptions values(${q(randomUUID())},${q(u)},null,'active','{}');`),/account_closed/);
    await sql(`set role service_role;update billing_subscriptions set status='expired' where id=${q(bill)};`);
    assert.equal(await sql(`select status||':'||metadata::text from billing_subscriptions where id=${q(bill)};`),'expired:{"financial": "history"}');
  });
  await check('late billing callback waits for closure and cannot attach recurring billing to its retained personal scope',async()=>{
    const u=await actor(),t=await tenant(null,'personal');await membership(u,t);
    const closure=sql(`begin;update auth.users set deleted_at=now() where id=${q(u)};select pg_advisory_xact_lock(464415);select pg_sleep(1.2);commit;`);await barrier(464415);
    await assert.rejects(sql(`set role service_role;insert into billing_subscriptions values(${q(randomUUID())},null,${q(t)},'active','{}');`),/account_closed/);await closure;
    assert.equal(await sql(`select count(*) from billing_subscriptions where tenant_id=${q(t)};`),'0');
  });
  await check('a billing callback that commits first is included in the final closure billing check',async()=>{
    const u=await actor(),t=await tenant(null,'personal');await membership(u,t);
    const writer=sql(`begin;set local role service_role;insert into billing_subscriptions values(${q(randomUUID())},null,${q(t)},'active','{}');select pg_advisory_xact_lock(464416);select pg_sleep(1.2);commit;`);await barrier(464416);
    await assert.rejects(close(u),/account_closure_unavailable/);await writer;
    assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(u)};`),'t');assert.equal(await sql(`select count(*) from account_closure_receipts where user_id=${q(u)};`),'0');
  });
  await check('paid personal erasure keeps immutable finance roots and clears private learning across services',async()=>{
    const u=await actor(),other=await actor(),t=await tenant(u,'personal'),pay=randomUUID();await membership(u,t);await study(u);await study(other);
    await sql(`update users set full_name='Private name',avatar_url='https://private.invalid/avatar',telegram_chat_id='private-chat',role='admin' where id=${q(u)};
      update tenants set metadata='{"private":"name"}' where id=${q(t)};
      insert into payments(id,user_id,product_id,provider,provider_transaction_id,amount,currency,status,metadata) values(${q(pay)},${q(u)},${q(product)},'owned_qa',${q('owned-'+pay)},1313,'UZS','paid','{"retained":"payment"}');
      insert into owned_paid_receipt values(${q(pay)},${q(u)},${q(t)},'{"retained":"receipt"}');`);
    const before=await sql(`select row_to_json(p)::text from payments p where id=${q(pay)};`);
    await close(u);
    for(const relation of ['user_profiles','learning_attempts','writing_drafts','speaking_attempts','speaking_transcripts','learner_language_goals']){assert.equal(await sql(`select count(*) from ${relation} where user_id=${q(u)};`),'0');assert.equal(await sql(`select count(*) from ${relation} where user_id=${q(other)};`),'1');}
    assert.equal(await sql(`select row_to_json(p)::text from payments p where id=${q(pay)};`),before);
    assert.equal(await sql(`select result::text from owned_paid_receipt where payment_id=${q(pay)};`),'{"retained": "receipt"}');
    assert.equal(await sql(`select is_active::text||':'||(full_name is null)::text||':'||(avatar_url is null)::text||':'||(telegram_chat_id is null)::text from users where id=${q(u)};`),'false:true:true:true');
    assert.equal(await sql(`select email='deleted-'||id::text||'@deleted.invalid' from users where id=${q(u)};`),'t');assert.equal(await sql(`select count(*) from tenant_memberships where user_id=${q(u)};`),'0');
    assert.equal(await sql(`select name||':'||metadata::text from tenants where id=${q(t)};`),'Deleted personal account:{}');
    assert.equal(await asActor(u,`select count(*) from users where id=${q(u)};`),'0');assert.equal(await asActor(u,'select count(*) from public_catalog;'),'0');
    assert.equal(await asActor(other,'select count(*) from public_catalog;'),'1');assert.equal(await sql('set role anon;select count(*) from public_catalog;'),'1');
  });
  await check('old JWT writes and delayed service writes cannot recreate a closed personal profile',async()=>{
    const u=await actor();await close(u);
    await assert.rejects(asActor(u,`insert into user_profiles(user_id,first_name) values(${q(u)},'private');`),/account_closed|row-level security/);
    await assert.rejects(sql(`set role service_role;insert into user_profiles(user_id,first_name) values(${q(u)},'private');`),/account_closed/);
    await assert.rejects(sql(`set role service_role;update users set is_active=true,full_name='restored' where id=${q(u)};`),/account_closed/);
    await assert.rejects(sql(`update auth.users set deleted_at=null where id=${q(u)};`),/account_closed/);
  });
  await check('hard deletion cannot bypass the qualified retained-principal mode',async()=>{const u=await actor();await assert.rejects(remove(u),/account_soft_delete_required/);assert.equal(await exists(u),'1');});
  await check('a late closure receipt failure rolls back Auth, PII purge and tenant membership together',async()=>{
    const u=await actor(),t=await tenant(u,'personal');await membership(u,t);await study(u);
    await sql(`create function owned_fail_closure() returns trigger language plpgsql as $$begin raise exception 'owned late failure';end;$$;create trigger owned_fail_closure before insert on account_closure_receipts for each row execute function owned_fail_closure();`);
    await assert.rejects(close(u),/owned late failure/);
    assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(u)};`),'t');assert.equal(await sql(`select email from users where id=${q(u)};`),'owned@example.invalid');assert.equal(await sql(`select count(*) from writing_drafts where user_id=${q(u)};`),'1');assert.equal(await sql(`select count(*) from tenant_memberships where user_id=${q(u)};`),'1');assert.equal(await sql(`select count(*) from account_closure_receipts where user_id=${q(u)};`),'0');
    await sql('drop trigger owned_fail_closure on account_closure_receipts;');await close(u);
  });
  await check('a delayed independent service insert cannot recreate PII after erasure commits',async()=>{
    const u=await actor();await study(u);
    const closure=sql(`begin;update auth.users set deleted_at=now() where id=${q(u)};select pg_advisory_xact_lock(464411);select pg_sleep(1.2);commit;`);await barrier(464411);
    await assert.rejects(sql(`set role service_role;insert into user_profiles(user_id,first_name) values(${q(u)},'Delayed private name');`),/account_closed/);await closure;
    assert.equal(await sql(`select count(*) from user_profiles where user_id=${q(u)};`),'0');
  });
  await check('a writer that starts first is included in the subsequent committed purge',async()=>{
    const u=await actor();
    const writer=sql(`begin;set local role service_role;insert into user_profiles(user_id,first_name) values(${q(u)},'Concurrent private name');select pg_advisory_xact_lock(464412);select pg_sleep(1.2);commit;`);await barrier(464412);
    await close(u);await writer;assert.equal(await sql(`select count(*) from user_profiles where user_id=${q(u)};`),'0');
  });
  await check('retained teacher/referral/audit roots are pseudonymous and personal Telegram journeys are purged',async()=>{
    const u=await actor(),other=await actor(),journey=randomUUID(),institution=randomUUID();
    await sql(`insert into teacher_profiles(user_id,full_name,bio,avatar_url,subjects,languages,location,certifications,experience_years,metadata) values(${q(u)},'Private Teacher','Private bio','private-avatar',array['ielts'],array['uz'],'Private city',array['private-certificate'],7,'{"private":"name"}');
      insert into referral_accounts(user_id,referral_code,metadata) values(${q(u)},${q(randomUUID())},'{"private":"name"}');
      insert into admin_audit_logs(user_id,user_email,action,method,path,status_code,ip,user_agent,metadata) values(${q(u)},'private@example.invalid','owned','POST','/owned',200,'private-ip','private-agent','{"private":"name"}');
      insert into telegram_acquisition_sessions(id,bot_name,telegram_user_id,schood_user_id,journey_state,metadata) values(${q(journey)},'schoodonlinebot','private-chat',${q(u)},'{"private":"answers"}','{"private":"name"}');
      insert into telegram_acquisition_sessions(id,bot_name,telegram_user_id,schood_user_id,academy_lead_id,journey_state,metadata) values(${q(institution)},'schoodonlinebot','institution-chat',${q(u)},${q(randomUUID())},'{"private":"answers"}','{"private":"name"}');
      insert into teacher_profiles(user_id,full_name) values(${q(other)},'Other Teacher');`);
    await close(u);
    assert.equal(await sql(`select full_name||':'||is_public::text||':'||available::text||':'||metadata::text||':'||(bio is null)::text from teacher_profiles where user_id=${q(u)};`),'Deleted account:false:false:{}:true');
    assert.equal(await sql(`select status||':'||metadata::text from referral_accounts where user_id=${q(u)};`),'disabled:{}');
    assert.equal(await sql(`select (user_email is null and ip is null and user_agent is null)::text||':'||metadata::text from admin_audit_logs where user_id=${q(u)};`),'true:{}');
    assert.equal(await sql(`select count(*) from telegram_acquisition_sessions where id=${q(journey)};`),'0');
    assert.equal(await sql(`select (schood_user_id is null)::text||':'||status||':'||journey_state::text||':'||metadata::text from telegram_acquisition_sessions where id=${q(institution)};`),'true:canceled:{}:{}');
    await assert.rejects(sql(`set role service_role;update teacher_profiles set full_name='Restored private name' where user_id=${q(u)};`),/account_closed/);
    assert.equal(await sql(`select experience_years is null from teacher_profiles where user_id=${q(u)};`),'t');
    await assert.rejects(sql(`set role service_role;update referral_accounts set metadata='{"private":"restored"}' where user_id=${q(u)};`),/account_closed/);
    assert.equal(await sql(`select full_name from teacher_profiles where user_id=${q(other)};`),'Other Teacher');
  });
  await check('a delayed audit logger keeps security evidence but cannot restore closed-account PII',async()=>{
    const u=await actor(),audit=randomUUID();
    const closure=sql(`begin;update auth.users set deleted_at=now() where id=${q(u)};select pg_advisory_xact_lock(464414);select pg_sleep(1.2);commit;`);await barrier(464414);
    await sql(`set role service_role;insert into admin_audit_logs(id,user_id,user_email,action,method,path,status_code,ip,user_agent,metadata) values(${q(audit)},${q(u)},'private@example.invalid','owned-security-event','DELETE','/account',401,'private-ip','private-agent','{"private":"name"}');`);await closure;
    assert.equal(await sql(`select action||':'||(user_email is null and ip is null and user_agent is null)::text||':'||metadata::text from admin_audit_logs where id=${q(audit)};`),'owned-security-event:true:{}');
  });
  await check('institutional submissions and answers remain available to another live academy actor',async()=>{
    const u=await actor(),owner=await actor(),t=await tenant(owner),s=randomUUID(),r=randomUUID();await membership(u,t,'member');await membership(owner,t);
    await sql(`insert into sessions(id,user_id,experience_id,metadata) values(${q(s)},${q(u)},${q(exam)},'{"institution":"history"}');insert into responses(id,session_id,content_unit_id,type,data) values(${q(r)},${q(s)},${q(unit)},'written','{"institution":"answer"}');insert into academy_submissions values(${q(randomUUID())},${q(t)},${q(u)},${q(s)},'Institution-owned submission');`);
    await close(u);assert.equal(await sql(`select count(*) from sessions where id=${q(s)};`),'1');assert.equal(await sql(`select count(*) from responses where id=${q(r)};`),'1');assert.equal(await asActor(u,'select count(*) from academy_submissions;'),'0');assert.equal(await asActor(owner,'select count(*) from academy_submissions;'),'1');
  });
  await check('financial exam roots survive while their personal answers and registration PII are erased',async()=>{
    const u=await actor(),t=await tenant(u,'personal'),s=randomUUID(),token=randomUUID(),reg=randomUUID();await membership(u,t);
    await sql(`insert into exam_tokens values(${q(token)},${q(t)});insert into sessions(id,user_id,experience_id,metadata,token_id) values(${q(s)},${q(u)},${q(exam)},'{"private":"exam"}',${q(token)});insert into exam_registrations values(${q(reg)},${q(u)},${q(t)},${q(s)},'Private','Name','Private Name','private@example.invalid','private-phone');update sessions set registration_id=${q(reg)} where id=${q(s)};insert into exam_admission_receipts values(${q(s)},${q(u)});insert into responses(session_id,content_unit_id,type,data) values(${q(s)},${q(unit)},'written','{"private":"answer"}');`);
    await close(u);assert.equal(await sql(`select count(*) from sessions where id=${q(s)};`),'1');assert.equal(await sql(`select metadata::text from sessions where id=${q(s)};`),'{}');assert.equal(await sql(`select count(*) from responses where session_id=${q(s)};`),'0');assert.equal(await sql(`select legal_name||':'||(email is null)::text||':'||(phone is null)::text from exam_registrations where id=${q(reg)};`),'Deleted account:true:true');assert.equal(await sql(`select count(*) from exam_admission_receipts where session_id=${q(s)};`),'1');
  });
  await check('unclassified owned Storage objects fail closed before any personal data is erased',async()=>{
    await sql('create schema storage;create table storage.objects(id uuid primary key,owner_id text,owner uuid);');const u=await actor();await study(u);await sql(`insert into storage.objects(id,owner_id) values(${q(randomUUID())},${q(u)});`);await assert.rejects(close(u),/account_storage_review_required/);assert.equal(await sql(`select count(*) from writing_drafts where user_id=${q(u)};`),'1');assert.equal(await sql(`select deleted_at is null from auth.users where id=${q(u)};`),'t');
  });
  await check('legacy Storage owner is checked even when the newer owner_id column exists',async()=>{
    const u=await actor();await profile(u);await sql(`insert into storage.objects(id,owner) values(${q(randomUUID())},${q(u)});`);
    await assert.rejects(close(u),/account_storage_review_required/);assert.equal(await sql(`select count(*) from user_profiles where user_id=${q(u)};`),'1');
  });
  // Exercise the real REST entry point, including definer RPCs and privileged
  // views that can bypass table RLS. Both containers share only the owned
  // database loopback network; the generated local JWT key never leaves RAM.
  const live=await actor(),closed=await actor();await profile(live);await close(closed);
  await sql(`create view owned_fixture_owner_view as select submission_content from academy_submissions;
    grant select on owned_fixture_owner_view to authenticated,service_role;
    create function owned_fixture_definer_read() returns text language sql security definer set search_path=pg_catalog,public as $$select submission_content from academy_submissions limit 1$$;
    revoke all on function owned_fixture_definer_read() from public;
    grant execute on function owned_fixture_definer_read() to authenticated,service_role;`);
  const localKey=randomBytes(48).toString('base64url');
  const jwt=(role,sub)=>{const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const payload=Buffer.from(JSON.stringify({role,...(sub?{sub}:{}),exp:Math.floor(Date.now()/1000)+300})).toString('base64url');const body=header+'.'+payload;return body+'.'+createHmac('sha256',localKey).update(body).digest('base64url');};
  await run(['run','--detach','--name',apiName,'--network','container:'+name,'--label','schood.qa=account-retention',
    '-e','PGRST_DB_URI=postgres://authenticator@127.0.0.1:5432/postgres','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_DB_CONFIG=true','-e','PGRST_JWT_SECRET='+localKey,apiImage]);apiOwned=true;
  const tokens={live:jwt('authenticated',live),closed:jwt('authenticated',closed),missing:jwt('authenticated',randomUUID()),noActor:jwt('authenticated'),service:jwt('service_role')};
  let httpOutput;
  try { httpOutput=await run(['run','--rm','--interactive','--name',httpName,'--network','container:'+name,'--label','schood.qa=account-retention',nodeImage,'node','--input-type=module'],`
    import assert from 'node:assert/strict';
    const tokens=${JSON.stringify(tokens)},checks=[];
    const request=async(path,token)=>{const response=await fetch('http://127.0.0.1:3000/'+path,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(3000)});return {status:response.status,body:await response.json()};};
    let ready=false,last;for(let i=0;i<100;i++){try{last=await request('public_catalog');if(last.status===200){ready=true;break;}}catch(e){last={error:e.message};}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Owned REST service did not become ready: '+JSON.stringify(last));
    for(const path of ['public_catalog','user_profiles','owned_fixture_owner_view','rpc/owned_fixture_definer_read']){
      const open=await request(path,tokens.live);assert.equal(open.status,200,'Live account: '+path);
      const shut=await request(path,tokens.closed);assert.equal(shut.status,401,'Closed account: '+path);assert.equal(shut.body.code,'PT401');assert.equal(shut.body.message,'Sign in with an active account.');checks.push('REST rejects old JWT before '+path+' while a live account still succeeds');
    }
    for(const kind of ['missing','noActor']){assert.equal((await request('rpc/owned_fixture_definer_read',tokens[kind])).status,401);checks.push('REST rejects '+kind+' authenticated principal before definer RPC');}
    assert.equal((await request('public_catalog')).status,200);checks.push('REST public anonymous catalogue remains available');
    const trusted=await request('rpc/owned_fixture_definer_read',tokens.service);assert.equal(trusted.status,200);assert.equal(trusted.body,'Institution-owned submission');checks.push('REST trusted service callbacks retain their existing role access');
    console.log(JSON.stringify({checks}));
  `); } catch(error) { console.error(await run(['logs','--tail','30',apiName]));throw error; }
  const httpProof=JSON.parse(httpOutput);
  for(const label of httpProof.checks){checks.push(label);console.log('PASS: '+label);}
  passed=true;
} finally {
  // Inspect all intended names even after a startup timeout; a detached server
  // can exist before its launch command reports success. Never remove a name
  // that does not also have this harness's ownership label.
  for(const target of [httpName,apiName,name]){
    const remaining=await run(['ps','-a','--filter','name=^/'+target+'$','--format','{{.Names}}']);
    if(!remaining)continue;
    assert.equal(await run(['inspect','--format','{{index .Config.Labels "schood.qa"}}',target]),'account-retention');
    await run(['rm','--force',target]);
  }
  const cleanupVerified=(await run(['ps','-a','--filter','name=^/'+name+'$','--filter','name=^/'+apiName+'$','--filter','name=^/'+httpName+'$','--format','{{.Names}}']))==='';
  mkdirSync('supabase/.temp/account-retention',{recursive:true});
  writeFileSync('supabase/.temp/account-retention/native-proof.json',JSON.stringify({time:new Date().toISOString(),passed,count:checks.length,checks,cleanupVerified,images:{postgres:image,postgrest:apiImage,node:nodeImage},limits:['Native SQL and actual PostgREST 13 HTTP proof only; complete hosted schema, actual new payment receipts/identity triggers, provider integration and external storage cleanup are not yet qualified','Core user/Auth FK, tenant/membership and representative personal table definitions are canonical; optional institutional and financial anchors have minimal owned fixtures']},null,2)+'\n');
}
