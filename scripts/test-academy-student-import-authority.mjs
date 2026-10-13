import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
import {createStudentImportTestSchema,studentImportMigration} from './lib/academy-student-import-test-schema.mjs';
const native=process.argv.includes('--native'),rest=process.argv.includes('--rest'),large=process.argv.includes('--large');
if(rest&&!native)throw Error('REST qualification requires the owned native fixture');
const db=native?await createNativeSessionDb():new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),foreign=id(2),branch=id(3),other=id(4),owner=id(6),manager=id(7),reception=id(8),scoped=id(9),emailActor=id(10),bound=id(11),studentActor=id(12),centerActor=id(14);
const group=id(30),otherGroup=id(31);let checks=0,sequence=0,rpc,ordinaryOutbox=0;
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const reject=async(fn,pattern=/Forbidden|permissions|permission/)=>{await assert.rejects(fn,error=>pattern.test(error.message)||(rest&&/401 Unauthorized/.test(error.message)));checks++;};
const commandSql='select public.academy_student_import_command($1::uuid,$2::uuid,$3,$4::jsonb) as data';
const command=async(who,action,payload={},scope=academy)=>rpc?await rpc('academy_student_import_command',{p_academy_id:scope,p_actor_id:who,p_action:action,p_payload:payload}):(await query(commandSql,[scope,who,action,JSON.stringify(payload)]))[0].data;
const config=(count,patch={})=>({branch_id:branch,source_filename:'owned.csv',column_mapping:{full_name:'full_name',phone:'phone',group_name:'group_name',balance:'balance',joined_on:'joined_on'},expected_rows:count,balance_convention:'credit_positive',currency:'UZS',date_format:'iso',create_missing_groups:false,duplicate_strategy:'reject',...patch});
const student=(patch={})=>({full_name:'Owned Student',phone:'90'+String(++sequence).padStart(7,'0'),group_name:'IELTS A',balance:'0',joined_on:'2026-10-01',...patch});
const stage=async(who,rows,patch={})=>(await command(who,'stage',{key:'upload-'+(++sequence),settings:config(rows.length,patch),rows:rows.map(source=>({source})),offset:0,seal:true})).job;
const preview=async(who,job)=>command(who,'preview',{job_id:job.id});
const commit=async(who,job,patch={})=>command(who,'commit',{job_id:job.id,key:'commit-'+job.id,preview_hash:job.validation.preview_hash,...patch});
const grant=async(who,role,type,ids,extra={})=>{
 const gid=id(100+(++sequence));await query('insert into academy_role_grants(id,academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,$10::timestamptz)',
  [gid,extra.academy??academy,extra.user===undefined?who:extra.user,extra.email??who+'@example.invalid',role,type,JSON.stringify(ids),extra.status??'active',extra.starts??'2020-01-01T00:00:00Z',extra.expires??null]);return gid;
};
try{
 await createStudentImportTestSchema(db);
 await db.exec(`alter table tenants add column type text not null default 'team';alter table tenants add column metadata jsonb not null default '{}';
  alter table academy_branches add column name text not null default 'Owned branch';alter table academy_contacts alter column primary_branch_id drop not null;
  create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
  create table tenant_memberships(id uuid primary key default gen_random_uuid(),tenant_id uuid,user_id uuid,role text,status text);
  create table partner_center_profiles(tenant_id uuid primary key,status text);
  create table academy_role_grants(id uuid primary key,academy_id uuid,user_id uuid,email text,role text,scope_type text,scope_ids jsonb,status text,starts_at timestamptz,expires_at timestamptz);
  create table academy_staff(id uuid primary key,academy_id uuid,user_id uuid,email text,role text,classroom_ids jsonb,is_active boolean);
  create table academy_staff_branch_assignments(id uuid primary key,academy_id uuid,staff_id uuid,branch_id uuid,starts_on date,ends_on date,status text);`);
 await query('insert into tenants(id) values($1),($2)',[academy,foreign]);
 for(const who of [owner,manager,reception,scoped,emailActor,bound,studentActor,centerActor]){
  await query('insert into users values($1,true)',[who]);await query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[who,who+'@example.invalid']);
 }
 await query("insert into academy_branches(id,academy_id,timezone,is_active,name) values($1,$2,'Asia/Tashkent',true,'Branch A'),($3,$2,'UTC',true,'Branch B')",[branch,academy,other]);
 await query("insert into academy_localization_settings values($1,'UZS')",[academy]);
 await query("insert into academy_classrooms(id,academy_id,branch_id,name,student_capacity) values($1,$2,$3,'IELTS A',null),($4,$2,$5,'IELTS B',null)",[group,academy,branch,otherGroup,other]);
 await query("insert into tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active')",[academy,owner]);
 await grant(manager,'manager','academy',[]);const scopedGrant=await grant(scoped,'admin','classrooms',[group]);
 for(const [who,bid] of [[reception,branch],[scoped,other]]){
  await query("insert into academy_staff values($1,$2,$3,$4,'receptionist','[]',true)",[id(200+Number(who.slice(-2))),academy,who,who+'@example.invalid']);
  await query("insert into academy_staff_branch_assignments values($1,$2,$3,$4,current_date-1,null,'active')",[id(300+Number(who.slice(-2))),academy,id(200+Number(who.slice(-2))),bid]);
 }
 await grant(emailActor,'admin','academy',[],{user:bound,email:emailActor+'@example.invalid'});
 await db.exec(studentImportMigration('20261013160000_academy_student_import_authority.sql'));
 if(rest)rpc=await db.startRestGateway();
 const choices=await command(scoped,'options');eq(choices.branches.map(b=>b.id).sort(),[branch,other].sort());eq(choices.branches.every(b=>!b.can_create_groups),true);
 eq(choices.groups.map(g=>g.id).sort(),[group,otherGroup].sort());
 await reject(()=>command(reception,'stage',{key:'foreign',settings:config(1,{branch_id:other}),rows:[{source:student({group_name:'IELTS B'})}],offset:0,seal:true}));
 await reject(()=>command(scoped,'stage',{key:'new-groups',settings:config(1,{branch_id:other,create_missing_groups:true}),rows:[{source:student({group_name:'New group'})}],offset:0,seal:true}),/permission|Forbidden/);
 await reject(()=>command(owner,'options',{},foreign));await reject(()=>command(emailActor,'options'));
 eq((await command(bound,'options')).branches.length,2);
 const forbidden=await preview(scoped,await stage(scoped,[student({group_name:'IELTS B',balance:'800000'})],{branch_id:other}));
 eq(forbidden.job.validation.ready,true);eq(forbidden.permissions.scope_valid,true);eq(forbidden.permissions.finance_approved,false);eq(forbidden.permissions.can_commit,false);
 await reject(()=>commit(scoped,forbidden.job,{can_finance:true,branch_ids:[branch,other]}));eq((await query('select count(*)::int n from academy_contacts'))[0].n,0);
 let prepared=await preview(reception,await stage(reception,[student()]));eq(prepared.permissions.can_commit,true);
 const registered=await commit(reception,prepared.job);eq(registered.job.status,'completed');eq(registered.job.receipt.contacts,1);
 eq((await commit(reception,prepared.job)).replayed,true);
 const financial=await preview(owner,await stage(owner,[student({balance:'800000'})]));eq(financial.permissions.can_commit,true);
 const managerView=await command(manager,'job',{job_id:financial.job.id});eq(managerView.job.validation.opening_credit,null);eq(managerView.permissions.can_commit,false);
 const managerRows=await command(manager,'rows',{job_id:financial.job.id});eq(Object.hasOwn(managerRows.rows[0].source,'balance'),false);eq(Object.hasOwn(managerRows.rows[0].normalized,'ledger_amount'),false);
 const paid=await commit(owner,financial.job);eq(paid.job.receipt.opening_balance_entries,1);
 const corrected=await command(owner,'recover',{job_id:paid.job.id,key:'correct-'+paid.job.id,reason:'Owned isolated correction'});eq(corrected.job.status,'reversed');eq((await query('select sum(amount)::text n from academy_account_ledger_entries'))[0].n,'0');
 eq((await query('select count(*)::int n from domain_event_outbox'))[0].n,0);
 prepared=await preview(scoped,await stage(scoped,[student()]));await query("update academy_role_grants set status='revoked' where id=$1",[scopedGrant]);
 await reject(()=>commit(scoped,prepared.job));await query("update academy_role_grants set status='active' where id=$1",[scopedGrant]);
 await query('update users set is_active=false where id=$1',[scoped]);await reject(()=>commit(scoped,prepared.job));await query('update users set is_active=true where id=$1',[scoped]);
 await query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[scoped]);await reject(()=>commit(scoped,prepared.job));await query('update auth.users set banned_until=null where id=$1',[scoped]);
 const existing=id(500);await query("insert into academy_contacts(id,academy_id,primary_branch_id,first_name,status,phone) values($1,$2,null,'Owned unassigned student','active','909999999')",[existing,academy]);
 await query("insert into academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status) values($1,$2,$3,'student','active')",[academy,group,existing]);
 ordinaryOutbox=(await query('select count(*)::int n from domain_event_outbox'))[0].n;
 await grant(studentActor,'manager','students',[existing]);
 prepared=await preview(studentActor,await stage(studentActor,[student({phone:'909999999',group_name:null})],{duplicate_strategy:'reuse'}));eq(prepared.job.validation.ready,true);eq(prepared.permissions.can_commit,true);
 eq((await commit(studentActor,prepared.job)).job.receipt.contacts,0);
 prepared=await preview(studentActor,await stage(studentActor,[student()]));eq(prepared.permissions.scope_valid,false);await reject(()=>commit(studentActor,prepared.job));
 const deniedRows=await command(studentActor,'rows',{job_id:prepared.job.id});eq(deniedRows.rows[0].source,{});eq(deniedRows.rows[0].mapped,{});eq(deniedRows.rows[0].normalized,{});
 if(native){
  // The importer holds a shared grant lock until its transaction completes.
  const raceJob=(await preview(scoped,await stage(scoped,[student()]))).job;
  const holder=await db.holdTransaction(bindSql(commandSql,[academy,scoped,'job',JSON.stringify({job_id:raceJob.id})]),'import-authority-reader');
  const revocation=db.independent(bindSql("update academy_role_grants set status='revoked' where id=$1",[scopedGrant]),'import-authority-revoke');revocation.catch(()=>{});
  try{await db.waitForLock('import-authority-revoke');checks++;await holder.commit();await revocation;}catch(error){await holder.rollback().catch(()=>{});await revocation.catch(()=>{});throw error;}
  await reject(()=>commit(scoped,raceJob));await query("update academy_role_grants set status='active' where id=$1",[scopedGrant]);
  // Conversely, a revoke which wins the lock is observed after the waiter wakes.
  const revokeHolder=await db.holdTransaction(bindSql("update academy_role_grants set status='revoked' where id=$1",[scopedGrant]),'import-revoke-holder');
  const before=(await query('select count(*)::int n from academy_contacts'))[0].n;
  const contender=db.independent(bindSql(commandSql,[academy,scoped,'commit',JSON.stringify({job_id:raceJob.id,key:'race-'+raceJob.id,preview_hash:raceJob.validation.preview_hash})]),'import-after-revoke');contender.catch(()=>{});
  try{await db.waitForLock('import-after-revoke');checks++;await revokeHolder.commit();await reject(()=>contender);}catch(error){await revokeHolder.rollback().catch(()=>{});await contender.catch(()=>{});throw error;}
  eq((await query('select count(*)::int n from academy_contacts'))[0].n,before);await query("update academy_role_grants set status='active' where id=$1",[scopedGrant]);
  // A lease which expires during writes cannot leave a partial registration.
  const delayed=(await preview(scoped,await stage(scoped,[student()]))).job;
  await db.exec(`create sequence owned_import_delay_hits;create function owned_import_delay() returns trigger language plpgsql as $$begin if new.metadata->>'student_import_job_id'='${delayed.id}' then perform nextval('owned_import_delay_hits');perform pg_sleep(3);end if;return new;end;$$;
   create trigger owned_import_delay before insert on academy_contacts for each row execute function owned_import_delay();`);
  await query("update academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where id=$1",[scopedGrant]);
  await reject(()=>commit(scoped,delayed));eq((await query('select count(*)::int n from academy_contacts'))[0].n,before);
  eq((await query('select status from academy_student_import_jobs where id=$1',[delayed.id]))[0].status,'validated');
  eq((await query('select is_called from owned_import_delay_hits'))[0].is_called,true);
  await query('update academy_role_grants set expires_at=null where id=$1',[scopedGrant]);await db.exec('drop trigger owned_import_delay on academy_contacts;drop function owned_import_delay();drop sequence owned_import_delay_hits;');
 }
 const resumable=await stage(reception,[student()]);eq((await command(reception,'lookup',{key:resumable.idempotency_key})).job.id,resumable.id);
 eq((await command(owner,'lookup',{key:resumable.idempotency_key})).found,false);
 eq((await command(reception,'cancel',{job_id:resumable.id})).job.status,'cancelled');
 eq((await command(reception,'cancel',{job_id:resumable.id})).job.status,'cancelled');
 if(large){
  await db.exec(`insert into academy_contacts(academy_id,primary_branch_id,first_name,status,phone)
   select '${academy}','${branch}','Existing scale fixture','active','94'||lpad(i::text,7,'0') from generate_series(1000000,1009999) i;`);
  const data=Array.from({length:5000},(_,i)=>({full_name:'Owned scale student '+i,phone:'91'+String(i).padStart(7,'0'),parent_phone:'92'+String(i).padStart(7,'0'),group_name:'Owned scale group '+(i%50),balance:'800000',joined_on:'2026-10-01'}));
  const settings=config(data.length,{create_missing_groups:true,column_mapping:{...config(1).column_mapping,parent_phone:'parent_phone'}});let job;
  for(let offset=0;offset<data.length;offset+=200)job=(await command(owner,'stage',{key:'owned-authority-scale',settings,rows:data.slice(offset,offset+200).map(source=>({source})),offset,seal:offset+200>=data.length})).job;
  let start=performance.now();const reviewed=await preview(owner,job);const previewMilliseconds=Math.round(performance.now()-start);
  eq(reviewed.job.validation.ready,true);eq(reviewed.permissions.can_commit,true);
  start=performance.now();const applied=await commit(owner,reviewed.job);const commitMilliseconds=Math.round(performance.now()-start);
  eq(applied.job.receipt.applied_rows,5000);eq(applied.job.receipt.groups,50);eq(applied.job.receipt.opening_balance_entries,5000);
  eq((await commit(owner,reviewed.job)).replayed,true);
  console.log(JSON.stringify({suite:'student-import-authority-scale',rows:5000,existingContacts:10000,previewMilliseconds,commitMilliseconds,callerBudgetSeconds:45,productionTouched:false}));
 }
 const parent=id(600);await query("insert into tenants(id,type) values($1,'org')",[parent]);await query("insert into partner_center_profiles values($1,'active')",[parent]);
 await query("insert into tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active')",[parent,centerActor]);await query("update tenants set metadata=$1::jsonb where id=$2",[JSON.stringify({parent_center_id:parent,service_family:'academy'}),academy]);
 eq((await command(centerActor,'options')).branches.length,2);await query("update partner_center_profiles set status='paused' where tenant_id=$1",[parent]);await reject(()=>command(centerActor,'options'));eq((await command(owner,'options')).branches.length,2);
 for(const role of ['anon','authenticated','service_role']){
  for(const signature of ['academy_stage_student_import(uuid,uuid,text,jsonb,jsonb,integer,boolean,uuid[])','academy_commit_student_import(uuid,uuid,uuid,text,text,uuid[],boolean,boolean,boolean)'])eq((await query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature]))[0].allowed,false);
  eq((await query("select has_table_privilege($1,'academy_student_import_rows','SELECT,INSERT,UPDATE,DELETE') allowed",[role]))[0].allowed,false);
 }
 eq((await query("select has_function_privilege('service_role','academy_student_import_command(uuid,uuid,text,jsonb)','EXECUTE') allowed"))[0].allowed,true);
 eq((await query('select count(*)::int n from domain_event_outbox'))[0].n,ordinaryOutbox);
 console.log(JSON.stringify({suite:'student-import-current-authority',native,rest,checks,productionTouched:false}));
}catch(error){console.error(JSON.stringify({suite:'student-import-current-authority',checks,error:error.message,stack:error.stack}));process.exitCode=1;}
finally{await db.close();}
