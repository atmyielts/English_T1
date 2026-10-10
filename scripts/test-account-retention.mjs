// Native SQL proof on an exclusively owned, network-isolated PostgreSQL.
// No production credentials or customer data are accessed.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const name='schood-account-retention-'+randomUUID().slice(0,8);
const image='postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa';
const source=readFileSync('supabase/migrations/20260202170000_platform_spine.sql','utf8');
const migration=readFileSync('supabase/migrations/20261009149000_account_deletion_ownership_guard.sql','utf8');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const table=n=>{const start=source.indexOf('create table if not exists public.'+n+' (');assert.ok(start>=0);return source.slice(start,source.indexOf('\n);',start)+4);};
const checks=[];let owned=false,passed=false;
function run(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    const timer=setTimeout(()=>{child.kill();reject(Error('Owned SQL operation timed out'));},35000);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err.trim()||'Owned SQL operation failed'));});child.stdin.end(input);
  });
}
const sql=text=>run(['exec','-i',name,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],text);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=async(label,action)=>{await action();checks.push(label);console.log('PASS: '+label);};
async function barrier(id){for(let i=0;i<80;i++){if(await sql("select count(*) from pg_locks where locktype='advisory' and objid="+id+" and granted;")==='1')return;await pause(30);}throw Error('Owned SQL barrier unavailable');}
async function actor(){const id=randomUUID();await sql(`insert into auth.users(id,email) values(${q(id)},'owned@example.invalid');insert into users(id,email) values(${q(id)},'owned@example.invalid');`);return id;}
async function tenant(creator,type='org') {const id=randomUUID();await sql(`insert into tenants(id,name,slug,type,created_by) values(${q(id)},'Owned QA',${q(id)},${q(type)},${q(creator)});`);return id;}
const membership=(id,t,role='owner',status='active')=>sql(`insert into tenant_memberships(tenant_id,user_id,role,status) values(${q(t)},${q(id)},${q(role)},${q(status)});`);
const preflight=id=>sql(`set role service_role;select public.account_deletion_preflight(${q(id)}::uuid);`).then(JSON.parse);
const remove=id=>sql(`delete from auth.users where id=${q(id)};`);
const exists=id=>sql(`select count(*) from auth.users where id=${q(id)};`);
try {
  await run(['run','--detach','--name',name,'--network','none','--label','schood.qa=account-retention','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);owned=true;
  let ready=false;for(let i=0;i<120;i++){try{if(await run(['exec',name,'cat','/proc/1/comm'])==='postgres'){await sql('select 1;');ready=true;break;}}catch{}await pause(100);}assert.ok(ready);
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
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
  passed=true;
} finally {
  let cleanupVerified=!owned;
  if(owned){await run(['rm','--force',name]);cleanupVerified=(await run(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']))==='';}
  mkdirSync('supabase/.temp/account-retention',{recursive:true});
  writeFileSync('supabase/.temp/account-retention/native-proof.json',JSON.stringify({time:new Date().toISOString(),passed,count:checks.length,checks,cleanupVerified,limits:['Ownership boundary only; personal erasure, immutable paid history, soft-deletion integration and hosted workflow are not qualified','Core user/Auth FK and tenant/membership definitions are canonical; optional institutional anchors have minimal owned fixtures']},null,2)+'\n');
}
