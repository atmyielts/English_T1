import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native'),rest=process.argv.includes('--rest');
if(rest&&!native)throw Error('REST qualification requires the isolated native fixture');
const db=native?await createNativeSessionDb():new PGlite();let checks=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const a=id(1),foreign=id(2),actor=id(3),other=id(4);const eq=(x,y)=>{assert.deepEqual(x,y);checks++;};
const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
const payload={import_type:'contacts',source_filename:'owned.csv',column_mapping:{first_name:'Name'},import_mode:'dry_run',duplicate_strategy:'skip'};
const sql='select academy_create_import_job($1::uuid,$2::uuid,$3::jsonb,$4) as data';
const args=(key,patch={},who=actor,academy=a)=>[academy,who,JSON.stringify({...payload,...patch}),key];
const create=async(...input)=>(await rows(sql,args(...input)))[0].data;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table tenants(id uuid primary key);create table users(id uuid primary key,is_active boolean not null);
  create table academy_import_jobs(id uuid primary key default gen_random_uuid(),academy_id uuid not null references tenants(id),created_by uuid references users(id) on delete set null,idempotency_key text not null,import_type text not null,source_filename text not null,column_mapping jsonb not null default '{}',status text not null default 'draft',import_mode text not null default 'dry_run',duplicate_strategy text not null default 'reject',unique(academy_id,id),unique(academy_id,idempotency_key));
  create table academy_import_rows(id uuid primary key default gen_random_uuid(),academy_id uuid not null,import_job_id uuid not null,validation_status text,mapped_data jsonb,foreign key(academy_id,import_job_id) references academy_import_jobs(academy_id,id));
  create table academy_import_effects(id uuid primary key default gen_random_uuid(),academy_id uuid not null,import_job_id uuid not null,after_snapshot jsonb,foreign key(academy_id,import_job_id) references academy_import_jobs(academy_id,id));
  create table academy_account_ledger_entries(id uuid primary key default gen_random_uuid(),academy_id uuid,amount bigint);
  grant usage on schema public to anon,authenticated,service_role;grant all on all tables in schema public to anon,authenticated,service_role;
  alter table academy_import_jobs enable row level security;create policy formerly_broad on academy_import_jobs for all using(true) with check(true);
  alter table academy_import_rows enable row level security;create policy formerly_broad on academy_import_rows for all using(true) with check(true);
  alter table academy_import_effects enable row level security;create policy formerly_broad on academy_import_effects for all using(true) with check(true);`);
 await rows('insert into tenants values($1),($2)',[a,foreign]);await rows('insert into users values($1,true),($2,true)',[actor,other]);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261012210000_academy_legacy_import_boundary.sql',import.meta.url),'utf8'));
 const job=await create(' key ');eq(job.idempotency_key,'key');eq(job.duplicate_strategy,'skip');eq(job.import_mode,'dry_run');eq((await create('key')).id,job.id);
 for(const patch of [{import_type:'staff'},{source_filename:'different.csv'},{column_mapping:{phone:'Phone'}},{import_mode:'commit'},{duplicate_strategy:'reject'}])await reject(()=>create('key',patch),/another operator or configuration/);
 await reject(()=>create('key',{},other),/another operator or configuration/);
 await reject(()=>rows("update academy_import_jobs set import_type='staff' where id=$1",[job.id]),/identity is immutable/);
 await reject(()=>rows("update academy_import_jobs set request_identity='{}' where id=$1",[job.id]),/identity is immutable/);
 await reject(()=>rows("update academy_import_jobs set import_mode='commit' where id=$1",[job.id]),/reviewed dry-run/);
 await rows("update academy_import_jobs set status='ready' where id=$1",[job.id]);await rows("update academy_import_jobs set status='committing',import_mode='commit' where id=$1",[job.id]);
 eq((await create('key')).id,job.id);eq((await create('key')).import_mode,'commit');
 // The previous deployed Edge sends no configuration fields to the RPC,
 // then configures the job separately. Preserve exactly that one-deploy flow.
 const oldPayload={import_type:'contacts',source_filename:'old.csv',column_mapping:{first_name:'Name'}};
 const oldJob=(await rows(sql,[a,actor,JSON.stringify(oldPayload),'old-edge']))[0].data;
 eq(oldJob.request_identity.legacy_config_pending,true);
 await rows("update academy_import_jobs set import_mode='dry_run',duplicate_strategy='skip' where id=$1",[oldJob.id]);
 const oldReplay=(await rows(sql,[a,actor,JSON.stringify(oldPayload),'old-edge']))[0].data;
 eq(oldReplay.duplicate_strategy,'skip');eq(oldReplay.request_identity.legacy_config_pending,undefined);
 await rows("update academy_import_jobs set duplicate_strategy='skip' where id=$1",[oldJob.id]);checks++;
 await reject(()=>rows("update academy_import_jobs set duplicate_strategy='reject' where id=$1",[oldJob.id]),/identity is immutable/);
 // A draft created by the prior function just before migration may still be
 // awaiting its first configuration. It gets the same single safe transition.
 await rows("insert into academy_import_jobs(academy_id,created_by,idempotency_key,import_type,source_filename,column_mapping) values($1,$2,'historical-draft','contacts','old.csv',$3::jsonb)",[a,actor,JSON.stringify(oldPayload.column_mapping)]);
 const historical=(await rows(sql,[a,actor,JSON.stringify(oldPayload),'historical-draft']))[0].data;
 eq(historical.request_identity.legacy_config_pending,true);
 await rows("update academy_import_jobs set duplicate_strategy='skip' where id=$1",[historical.id]);
 eq((await rows('select duplicate_strategy,request_identity from academy_import_jobs where id=$1',[historical.id]))[0].request_identity.duplicates,'skip');
 await reject(()=>rows('update academy_import_jobs set created_by=$1 where id=$2',[other,job.id]),/identity is immutable/);
 await reject(()=>rows('update academy_import_jobs set created_by=null where id=$1',[job.id]),/identity is immutable/);
 await rows('insert into users values($1,true)',[id(8)]);const retained=await create('retained-attribution',{},id(8));
 await rows('delete from users where id=$1',[id(8)]);
 const detached=(await rows('select created_by,request_identity from academy_import_jobs where id=$1',[retained.id]))[0];
 eq(detached.created_by,null);eq(detached.request_identity.actor,id(8));
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role};`);try{
   await reject(()=>create('forged-rpc'),/permission denied/);
   for(const table of ['academy_import_jobs','academy_import_rows','academy_import_effects']){
    await reject(()=>rows(`select * from ${table}`),/permission denied/);
    await reject(()=>rows(`delete from ${table}`),/permission denied/);
   }
   await reject(()=>rows("update academy_import_jobs set status='ready' where id=$1",[job.id]),/permission denied/);
  }finally{await db.exec('reset role;');}
 }
 if(native){
  const held=await db.holdTransaction(bindSql(sql,args('concurrent')),'legacy-import-holder');
  const pending=db.independent(bindSql(sql,args('concurrent')),'legacy-import-contender');pending.catch(()=>{});
  try{await db.waitForLock('legacy-import-contender');checks++;await held.commit();await pending;}
  catch(error){await held.rollback().catch(()=>{});await pending.catch(()=>{});throw error;}
  eq((await rows("select count(*)::int n from academy_import_jobs where idempotency_key='concurrent'"))[0].n,1);
 }
 if(rest){
  const contact=await create('contact-history'),staff=await create('staff-history',{import_type:'staff'}),balance=await create('balance-history',{import_type:'balances'});
  for(const record of [contact,staff,balance]){
   await rows("insert into academy_import_rows(academy_id,import_job_id,validation_status,mapped_data) values($1,$2,'valid','{}')",[a,record.id]);
   await rows("insert into academy_import_effects(academy_id,import_job_id,after_snapshot) values($1,$2,'{}')",[a,record.id]);
  }
  const rpc=await db.startRestGateway();
  for(const table of ['academy_import_rows','academy_import_effects']){
   const result=await rpc.select(table,{select:'*,academy_import_jobs!inner(import_type)',academy_id:'eq.'+a,'academy_import_jobs.import_type':'in.(contacts)'});
   eq(result.length,1);eq(result[0].import_job_id,contact.id);
  }
  await rows('insert into academy_account_ledger_entries(academy_id,amount) values($1,$2::bigint)',[a,'9223372036854775807']);
  const exact=await rpc.select('academy_account_ledger_entries',{select:'amount::text',academy_id:'eq.'+a});eq(exact[0].amount,'9223372036854775807');
 }
 console.log(JSON.stringify({suite:'legacy-import-database-boundary',native,rest,checks,productionTouched:false}));
}catch(error){console.error(JSON.stringify({suite:'legacy-import-database-boundary',error:error.message}));process.exitCode=1;}finally{await db.close();}
