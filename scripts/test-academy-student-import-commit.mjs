import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native');
const db=native?await createNativeSessionDb():new PGlite();let checks=0,sequence=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),foreign=id(2),branch=id(3),other=id(4),actor=id(6),reviewer=id(7),classroom=id(10);
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const reject=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const load=file=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
const installedFunction=(file,name)=>{const text=load(file),start=text.indexOf('create or replace function public.'+name+'('),end=text.indexOf('$$;',start);assert.ok(start>=0&&end>start);return text.slice(start,end+3);};
const student=(patch={})=>({full_name:'Aziz G‘ofirov',phone:'901234567',parent_phone:'902222222',group_name:'IELTS A',balance:'800000',joined_on:'2026-10-01',...patch});
const config=(n,patch={})=>({branch_id:branch,source_filename:'students.csv',expected_rows:n,column_mapping:{full_name:'full_name',phone:'phone',email:'email',parent_phone:'parent_phone',parent_name:'parent_name',group_name:'group_name',balance:'balance',joined_on:'joined_on'},balance_convention:'credit_positive',currency:'UZS',date_format:'iso',create_missing_groups:false,duplicate_strategy:'reject',...patch});
const stage=async(source,patch={})=>{
 const key='commit-fixture-'+(++sequence),c=config(source.length,patch);let job;
 for(let offset=0;offset<source.length;offset+=200)job=(await query('select academy_stage_student_import($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::integer,$7::boolean,$8::uuid[]) as data',[academy,actor,key,JSON.stringify(c),JSON.stringify(source.slice(offset,offset+200).map(row=>({source:row}))),offset,offset+200>=source.length,[branch]]))[0].data.job;
 return job;
};
const preview=async(job,groups=false)=>(await query('select academy_validate_student_import($1::uuid,$2::uuid,$3::uuid,$4::uuid[],$5::boolean,$6::boolean) as data',[academy,actor,job.id,[branch],false,groups]))[0].data.job;
const commitSql='select academy_commit_student_import($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid[],$7::boolean,$8::boolean,$9::boolean) as data';
const commitArgs=(job,patch={})=>[academy,patch.actor??actor,job.id,patch.key??'apply-'+job.id,patch.hash??job.validation.preview_hash,patch.scope===undefined?[branch]:patch.scope,patch.reviewAll??false,patch.groups??false,patch.finance??true];
const commit=async(job,patch={})=>(await query(commitSql,commitArgs(job,patch)))[0].data;
const counts=async()=> (await query('select (select count(*) from academy_contacts)::int contacts,(select count(*) from academy_guardians)::int guardians,(select count(*) from academy_classroom_memberships)::int memberships,(select count(*) from academy_student_guardian_relationships)::int relationships,(select count(*) from academy_account_ledger_entries)::int balances,(select count(*) from academy_student_import_effects)::int effects,(select count(*) from academy_student_lifecycle_events)::int lifecycle,(select count(*) from domain_event_outbox)::int outbox,(select count(*) from academy_audit_events)::int audit'))[0];
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table tenants(id uuid primary key);create table users(id uuid primary key,is_active boolean not null);
  create table academy_branches(id uuid primary key,academy_id uuid not null references tenants(id),timezone text not null,is_active boolean not null,unique(academy_id,id));
  create table academy_localization_settings(academy_id uuid primary key,currency text not null);`);
 await query('insert into tenants values($1),($2)',[academy,foreign]);await query('insert into users values($1,true),($2,true)',[actor,reviewer]);
 await query("insert into academy_branches values($1,$2,'Asia/Tashkent',true),($3,$2,'UTC',true)",[branch,academy,other]);await query("insert into academy_localization_settings values($1,'UZS')",[academy]);
 await db.exec(installedFunction('20260810190000_academy_business_os_phase_g.sql','academy_normalize_phone'));
 await db.exec(`create table academy_contacts(id uuid primary key default gen_random_uuid(),academy_id uuid not null,primary_branch_id uuid not null,first_name text not null,last_name text not null default '',status text not null,phone text,email text,user_id uuid,lifecycle_stage text,created_by uuid,metadata jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),phone_normalized text generated always as(academy_normalize_phone(phone)) stored,unique(academy_id,id),unique(academy_id,phone));
  create index on academy_contacts(academy_id,phone_normalized);create unique index on academy_contacts(academy_id,lower(email));
  create table academy_classrooms(id uuid primary key default gen_random_uuid(),academy_id uuid not null,branch_id uuid not null,name text not null,is_active boolean default true,student_capacity integer,created_by uuid,metadata jsonb not null default '{}',unique(academy_id,id),unique(academy_id,name));
  create table academy_classroom_memberships(id uuid primary key default gen_random_uuid(),academy_id uuid not null,classroom_id uuid not null,contact_id uuid not null,role text not null,status text not null,joined_at timestamptz,started_at timestamptz,metadata jsonb not null default '{}',unique(classroom_id,contact_id),foreign key(academy_id,classroom_id) references academy_classrooms(academy_id,id),foreign key(academy_id,contact_id) references academy_contacts(academy_id,id));
  create index on academy_classroom_memberships(classroom_id);
  create table academy_guardians(id uuid primary key default gen_random_uuid(),academy_id uuid not null,full_name text not null,phone text,status text not null,created_by uuid,metadata jsonb not null default '{}',phone_normalized text generated always as(academy_normalize_phone(phone)) stored,unique(academy_id,id));
  create index on academy_guardians(academy_id,phone_normalized);
  create table academy_student_guardian_relationships(id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,guardian_id uuid not null,relationship_type text,status text not null,consent_status text not null,is_financially_responsible boolean,is_primary_contact boolean,can_view_payments boolean,can_view_debt boolean,created_by uuid,metadata jsonb not null default '{}',unique(academy_id,id),foreign key(academy_id,contact_id) references academy_contacts(academy_id,id),foreign key(academy_id,guardian_id) references academy_guardians(academy_id,id));
  create table academy_account_ledger_entries(id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,entry_type text not null,amount bigint not null check(amount<>0),currency text not null,effective_at timestamptz,reason text,idempotency_key text not null,created_by uuid,metadata jsonb not null default '{}',unique(academy_id,idempotency_key),foreign key(academy_id,contact_id) references academy_contacts(academy_id,id));
  create table academy_audit_events(id uuid primary key default gen_random_uuid(),academy_id uuid not null,actor_user_id uuid,action text not null,target_type text not null,target_id text not null,metadata jsonb not null);
  create table academy_lead_conversions(academy_id uuid,contact_id uuid,lead_id uuid,converted_at timestamptz);
  create table academy_student_lifecycle_events(id uuid primary key default gen_random_uuid(),academy_id uuid not null,branch_id uuid,lead_id uuid,contact_id uuid,classroom_id uuid,subscription_id uuid,guardian_relationship_id uuid,event_key text not null,actor_user_id uuid,source_table text,source_id uuid,idempotency_key text not null,evidence jsonb not null,occurred_at timestamptz not null default now(),unique(academy_id,idempotency_key));
  create table domain_event_outbox(id uuid primary key default gen_random_uuid(),event_type text,event_version text,aggregate_type text,aggregate_id uuid,user_id uuid,occurred_at timestamptz,payload jsonb,status text,attempts integer,idempotency_key text unique);`);
 await db.exec(installedFunction('20260810190000_academy_business_os_phase_g.sql','academy_capture_student_lifecycle_event'));
 await db.exec(installedFunction('20260810230000_academy_lifecycle_automation_worker.sql','academy_publish_lifecycle_event'));
 await db.exec(`create trigger capture_membership after insert or update on academy_classroom_memberships for each row execute function academy_capture_student_lifecycle_event();
  create trigger capture_relationship after insert or update on academy_student_guardian_relationships for each row execute function academy_capture_student_lifecycle_event();
  create trigger publish_lifecycle after insert on academy_student_lifecycle_events for each row execute function academy_publish_lifecycle_event();`);
 for(const file of ['20261012160000_academy_student_import_staging.sql','20261012170000_academy_student_import_normalization.sql','20261012180000_academy_student_import_preview.sql','20261012190000_academy_student_import_commit.sql','20261012200000_academy_student_import_lifecycle.sql'])await db.exec(load(file));
 await query("insert into academy_classrooms(id,academy_id,branch_id,name,student_capacity) values($1,$2,$3,'IELTS A',20)",[classroom,academy,branch]);
 let job=await preview(await stage([student()]));eq(job.status,'validated');
 await reject(()=>commit(job,{finance:false}),/finance approval/);eq((await counts()).contacts,0);
 await reject(()=>commit(job,{actor:reviewer}),/Forbidden import job/);
 await reject(()=>commit(job,{scope:[other]}),/Forbidden import job/);
 const applied=await commit(job);eq(applied.receipt.applied_rows,1);eq(applied.receipt.contacts,1);eq(applied.receipt.opening_balance_entries,1);eq(applied.receipt.payment_collected,false);eq(applied.receipt.messages_sent,0);
 eq(await counts(),{contacts:1,guardians:1,memberships:1,relationships:1,balances:1,effects:5,lifecycle:2,outbox:0,audit:1});
 eq((await query("select amount::text,entry_type,effective_at from academy_account_ledger_entries"))[0].amount,'-800000');
 const consent=(await query('select status,consent_status,is_financially_responsible,can_view_payments from academy_student_guardian_relationships'))[0];eq(consent,{status:'pending',consent_status:'pending',is_financially_responsible:false,can_view_payments:false});
 const history=await query('select occurred_at,actor_user_id,evidence from academy_student_lifecycle_events');eq(history.every(row=>new Date(row.occurred_at).toISOString()==='2026-09-30T19:00:00.000Z'&&row.actor_user_id===actor&&row.evidence.automation_suppressed===true),true);
 const again=await commit(job);eq(again.replayed,true);eq(again.receipt,applied.receipt);eq((await counts()).effects,5);
 await reject(()=>commit(job,{key:'another-operation'}),/Commit identity/);
 await reject(()=>commit(job,{hash:'0'.repeat(64)}),/Commit identity/);
 await reject(()=>query("update academy_student_import_effects set after_snapshot='{}'"),/append-only/);
 await reject(()=>query('delete from academy_student_import_effects'),/append-only/);
 // A late failure after all records/effects were created rolls back everything,
 // including lifecycle history and receipt status. Retry applies exactly once.
 const before=await counts();job=await preview(await stage([student({phone:'903333333',parent_phone:'904444444'})]));
 await db.exec("create function fail_import_audit() returns trigger language plpgsql as $$begin if new.action='student_import.committed' then raise exception 'Injected late audit failure';end if;return new;end;$$;create trigger injected_import_audit_failure before insert on academy_audit_events for each row execute function fail_import_audit();");
 await reject(()=>commit(job),/Injected late audit failure/);eq(await counts(),before);
 eq((await query('select status,receipt,commit_scope from academy_student_import_jobs where id=$1',[job.id]))[0],{status:'validated',receipt:null,commit_scope:null});
 await db.exec('drop trigger injected_import_audit_failure on academy_audit_events;');eq((await commit(job)).receipt.applied_rows,1);
 // Changed capacity returns a fresh preview, with no business writes.
 job=await preview(await stage([student({phone:'905555555',parent_phone:null})]));const baseline=await counts();await query('update academy_classrooms set student_capacity=2 where id=$1',[classroom]);
 const changed=await commit(job);eq(changed.preview_changed,true);eq(changed.job.validation.ready,false);eq(await counts(),baseline);
 await query('update academy_classrooms set student_capacity=20 where id=$1',[classroom]);job=await preview(job);eq((await commit(job)).receipt.applied_rows,1);
 // Two siblings share one newly staged parent and one newly created group.
 job=await preview(await stage([student({phone:'906666661',parent_phone:'907777777',group_name:'New group'}),student({phone:'906666662',parent_phone:'907777777',group_name:'NEW GROUP'})],{create_missing_groups:true}),true);
 const siblings=await commit(job,{groups:true});eq(siblings.receipt.groups,1);eq(siblings.receipt.guardians,1);eq(siblings.receipt.relationships,2);eq(siblings.receipt.memberships,2);
 console.log('PASS: atomic records/effects/audit, consent, historical lifecycle and replay qualification');
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role};`);try{await reject(()=>commit(job,{groups:true}),/permission denied/);await reject(()=>query('select * from academy_student_import_effects'),/permission denied/);}finally{await db.exec('reset role;');}
 }
 if(native){
  job=await preview(await stage([student({phone:'908888888',parent_phone:null,balance:'0'})]));
  const args=commitArgs(job),held=await db.holdTransaction(bindSql(commitSql,args),'import-commit-holder');
  const pending=db.independent(bindSql(commitSql,args),'import-commit-contender');pending.catch(()=>{});
  try{await db.waitForLock('import-commit-contender');checks++;await held.commit();const result=await pending;assert.ok(result.includes('"replayed": true'));checks++;}
  catch(error){await held.rollback().catch(()=>{});await pending.catch(()=>{});throw error;}
  eq((await query("select count(*)::int n from academy_contacts where phone_normalized='+998908888888'"))[0].n,1);
  // Two ordinary writers cannot both take the last seat while bypassing import.
  const seats=(await query('select id from academy_contacts order by id limit 2')).map(row=>row.id);
  await query("insert into academy_classrooms(id,academy_id,branch_id,name,student_capacity) values($1,$2,$3,'One seat',1)",[id(12),academy,branch]);
  const insertSeat='insert into academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values($1::uuid,$2::uuid,$3::uuid,\'student\',\'active\')';
  const seatHolder=await db.holdTransaction(bindSql(insertSeat,[academy,id(12),seats[0]]),'seat-holder');
  const seatContender=db.independent(bindSql(insertSeat,[academy,id(12),seats[1]]),'seat-contender');seatContender.catch(()=>{});
  try{await db.waitForLock('seat-contender');checks++;await seatHolder.commit();await reject(()=>seatContender,/Classroom capacity exceeded/);}
  catch(error){await seatHolder.rollback().catch(()=>{});await seatContender.catch(()=>{});throw error;}
  eq((await query('select count(*)::int n from academy_classroom_memberships where classroom_id=$1',[id(12)]))[0].n,1);
  await query('update academy_classrooms set student_capacity=0 where id=$1',[id(12)]);
  await query("update academy_classroom_memberships set status='active' where classroom_id=$1",[id(12)]);checks++; // Idempotent status acknowledgement consumes no new seat.
 }
 // An ordinary enrollment still produces normal automation. A caller cannot
 // suppress it by attaching metadata for a completed historical import.
 const ordinaryOutbox=(await counts()).outbox;
 const contact=(await query("select id from academy_contacts where phone_normalized='+998901234567'"))[0].id;
 await query("insert into academy_classrooms(id,academy_id,branch_id,name,student_capacity) values($1,$2,$3,'Ordinary group',10)",[id(11),academy,branch]);
 await query("insert into academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status,metadata) values($1,$2,$3,'student','active',$4::jsonb)",[academy,id(11),contact,JSON.stringify({student_import_job_id:applied.receipt.job_id,source_joined_on:'2020-01-01'})]);
 eq((await counts()).outbox,ordinaryOutbox+1);
 if(process.argv.includes('--large')){
  const records=Array.from({length:5000},(_,i)=>student({full_name:`Student ${i+1}`,phone:String(920000000+i),parent_phone:String(930000000+i),group_name:'Large group '+(i%50+1),balance:'100000'}));
  for(let group=1;group<=50;group++)await query('insert into academy_classrooms(id,academy_id,branch_id,name,student_capacity) values($1,$2,$3,$4,100)',[id(100+group),academy,branch,'Large group '+group]);
  console.log('Starting complete 5,000-student contact/parent/group/balance qualification.');
  const before=await counts(),prepared=await preview(await stage(records)),started=performance.now();
  eq(prepared.validation.create_rows,5000);eq(prepared.validation.invalid_rows,0);
  const complete=await commit(prepared),firstCommitWallMilliseconds=Math.round(performance.now()-started);eq(complete.receipt.applied_rows,5000);
  for(const field of ['contacts','guardians','relationships','memberships','opening_balance_entries'])eq(complete.receipt[field],5000);
  const after=await counts();eq(after.effects-before.effects,25000);eq(after.lifecycle-before.lifecycle,10000);eq(after.outbox,before.outbox);
  eq((await commit(prepared)).receipt,complete.receipt);
  console.log(JSON.stringify({largeCommitRows:5000,groups:50,firstCommitWallMilliseconds,qualificationIncludingReplayMilliseconds:Math.round(performance.now()-started),productionPerformanceUnproven:true}));
 }
 console.log(JSON.stringify({suite:'student-import-commit',database:native?'native PostgreSQL 17':'PGlite',checks,productionTouched:false,fullInstalledSchemaQualified:false}));
}catch(error){console.error(JSON.stringify({suite:'student-import-commit',error:error.message,where:error.where??null}));process.exitCode=1;}finally{await db.close();}
