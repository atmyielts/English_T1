import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
import {createStudentImportTestSchema,studentImportMigration} from './lib/academy-student-import-test-schema.mjs';
const native=process.argv.includes('--native'),rest=process.argv.includes('--rest');
if(rest&&!native)throw Error('REST checks require the owned native database');
const db=native?await createNativeSessionDb():new PGlite();let checks=0,rpc=null,seq=100;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),otherAcademy=id(2),branch=id(3),otherBranch=id(4),center=id(5);
const owner=id(10),scoped=id(11),mixed=id(12),student=id(13),expired=id(14),bareTeacher=id(15),bound=id(16),emailActor=id(17),centerActor=id(18);
const classA=id(30),classB=id(31),classC=id(32),a=id(40),b=id(41),c=id(42),legacy=id(43),cross=id(44);
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const reject=async(fn,pattern=/Forbidden|permission|access/i)=>{await assert.rejects(fn,e=>pattern.test(e.message)||(rest&&e.message.includes('401 Unauthorized')));checks++;};
const read=async(who,action,payload={},scope=academy)=>rpc?rpc('academy_scoped_directory',{p_academy_id:scope,p_actor_id:who,p_action:action,p_payload:payload}):
 (await query('select academy_scoped_directory($1::uuid,$2::uuid,$3,$4::jsonb) data',[scope,who,action,JSON.stringify(payload)]))[0].data;
const grant=async(who,role,kind,ids,patch={})=>{
 const gid=id(seq++);await query('insert into academy_role_grants values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,$10::timestamptz)',
  [gid,academy,patch.user===undefined?who:patch.user,patch.email??who+'@example.invalid',role,kind,JSON.stringify(ids),patch.status??'active',patch.starts??'2020-01-01',patch.expires??null]);return gid;
};
const sorted=(rows)=>rows.map(row=>row.id).sort();
try{
 await createStudentImportTestSchema(db);
 await db.exec(`alter table tenants add column type text not null default 'team';alter table tenants add column metadata jsonb not null default '{}';
  alter table academy_branches add column name text not null default 'Owned branch';alter table academy_contacts alter column primary_branch_id drop not null;
  alter table academy_classrooms add column description text;
  create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
  create table tenant_memberships(id uuid primary key default gen_random_uuid(),tenant_id uuid,user_id uuid,role text,status text);
  create table partner_center_profiles(tenant_id uuid primary key,status text);
  create table academy_role_grants(id uuid primary key,academy_id uuid,user_id uuid,email text,role text,scope_type text,scope_ids jsonb,status text,starts_at timestamptz,expires_at timestamptz);
  create table academy_staff(id uuid primary key,academy_id uuid,user_id uuid,email text,role text,classroom_ids jsonb,is_active boolean);
  create table academy_staff_branch_assignments(id uuid primary key,academy_id uuid,staff_id uuid,branch_id uuid,starts_on date,ends_on date,status text);`);
 await query('insert into tenants(id) values($1),($2),($3)',[academy,otherAcademy,center]);
 for(const who of [owner,scoped,mixed,student,expired,bareTeacher,bound,emailActor,centerActor]){
  await query('insert into users values($1,true)',[who]);await query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[who,who+'@example.invalid']);
 }
 await query("insert into academy_branches(id,academy_id,timezone,is_active) values($1,$2,'Asia/Tashkent',true),($3,$2,'UTC',true)",[branch,academy,otherBranch]);
 await query("insert into academy_classrooms(id,academy_id,branch_id,name,metadata) values($1,$2,$3,'Class A','{}'),($4,$2,$5,'Class B','{\"private\":\"peer information\"}'),($6,$2,$5,'Class C','{}')",[classA,academy,branch,classB,otherBranch,classC]);
 for(const [contact,bid,name] of [[a,branch,'Student A'],[b,otherBranch,'Student B'],[c,otherBranch,'Student C'],[legacy,null,'Legacy Student'],[cross,otherBranch,'Cross Student']]){
  await query("insert into academy_contacts(id,academy_id,primary_branch_id,first_name,status,phone) values($1,$2,$3,$4,'active',$5)",[contact,academy,bid,name,'90'+String(contact.slice(-7))]);
 }
 for(const [contact,classroom] of [[a,classA],[b,classB],[c,classC],[legacy,classA],[cross,classA],[cross,classB]])await query("insert into academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status,joined_at) values($1,$2,$3,'student','active',now())",[academy,classroom,contact]);
 await query("insert into tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active'),($1,$3,'teacher','active')",[academy,owner,bareTeacher]);
 await grant(scoped,'admin','classrooms',[classB]);await grant(mixed,'admin','classrooms',[classB]);await grant(mixed,'receptionist','branches',[branch]);
 const studentGrant=await grant(student,'manager','students',[b]);await grant(expired,'admin','academy',[],{expires:'2020-01-01'});
 await grant(emailActor,'admin','academy',[],{user:bound,email:emailActor+'@example.invalid'});
 await db.exec(studentImportMigration('20261013160000_academy_student_import_authority.sql'));

 if(rest)rpc=await db.startRestGateway();
 eq(sorted((await read(owner,'contacts')).contacts),[a,b,c,legacy,cross].sort());
 eq(sorted((await read(scoped,'contacts')).contacts),[b,cross].sort());
 eq(sorted((await read(scoped,'classrooms')).classrooms),[classB]);
 const union=await read(mixed,'contacts');eq(sorted(union.contacts),[a,b,legacy,cross].sort());
 eq(sorted((await read(mixed,'classrooms')).classrooms),[classA,classB].sort());
 const ownStudent=await read(student,'contacts');eq(sorted(ownStudent.contacts),[b]);
 const limited=await read(student,'classrooms');eq(sorted(limited.classrooms),[classB]);eq(limited.classrooms[0].member_count,null);eq(limited.classrooms[0].roster_visible,false);eq(limited.classrooms[0].metadata,{});
 const roster=await read(student,'classroom-memberships');eq(roster.classroom_memberships.map(row=>row.contact_id),[b]);
 eq((await read(student,'classroom-memberships',{classroom_id:classC})).classroom_memberships,[]);
 const fullClass=(await read(scoped,'classrooms')).classrooms[0];eq(fullClass.member_count,2);eq(fullClass.roster_visible,true);eq(fullClass.metadata.private,'peer information');
 eq((await read(scoped,'classroom-memberships')).classroom_memberships.map(row=>row.contact_id).sort(),[b,cross].sort());
 eq((await read(owner,'contacts',{query:'Student C'})).contacts.map(row=>row.id),[c]);
 eq((await read(owner,'contacts',{query:'%'})).contacts,[]);
 eq((await read(scoped,'contacts',{query:'Student C'})).contacts,[]);
 const first=await read(owner,'contacts',{limit:2});eq(first.has_more,true);eq(first.contacts.length,2);
 const second=await read(owner,'contacts',{limit:2,...first.cursor});const third=await read(owner,'contacts',{limit:2,...second.cursor});
 eq(new Set([...first.contacts,...second.contacts,...third.contacts].map(row=>row.id)).size,5);eq(third.has_more,false);
 for(const who of [expired,emailActor])await reject(()=>read(who,'contacts'));
 eq((await read(bareTeacher,'contacts')).contacts,[]);eq((await read(bareTeacher,'classrooms')).classrooms,[]);
 eq((await read(bound,'contacts')).contacts.length,5);
 await reject(()=>read(owner,'contacts',{},otherAcademy));
 await query("update academy_role_grants set status='revoked' where id=$1",[studentGrant]);await reject(()=>read(student,'contacts'));
 await query("update academy_role_grants set status='active' where id=$1",[studentGrant]);
 await query("update auth.users set deleted_at=now() where id=$1",[student]);await reject(()=>read(student,'contacts'));
 await query("update auth.users set deleted_at=null where id=$1",[student]);await query('update users set is_active=false where id=$1',[student]);await reject(()=>read(student,'contacts'));
 await query("insert into tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active')",[center,centerActor]);
 await query("insert into partner_center_profiles values($1,'paused')",[center]);
 await query("update tenants set metadata=jsonb_build_object('parent_center_id',$1::text,'service_family','academy') where id=$2",[center,academy]);
 await reject(()=>read(centerActor,'contacts'));
 await query("update partner_center_profiles set status='active' where tenant_id=$1",[center]);eq((await read(centerActor,'contacts')).contacts.length,5);
 await query("update partner_center_profiles set status='paused' where tenant_id=$1",[center]);await query("insert into tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active')",[academy,centerActor]);eq((await read(centerActor,'contacts')).contacts.length,5);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);await reject(()=>query('select academy_scoped_directory($1::uuid,$2::uuid,$3)',[academy,owner,'contacts']));await db.exec('reset role');
 }
 eq((await query("select has_function_privilege('service_role','public.academy_current_authorities(uuid,uuid)','EXECUTE') allowed"))[0].allowed,false);
 await reject(()=>read(owner,'contacts',{limit:301}),/valid directory page|400 Bad Request/i);
 await reject(()=>read(owner,'contacts',{before_id:a}),/complete directory cursor|400 Bad Request/i);
 if(native){
  const statement=bindSql('select academy_scoped_directory($1::uuid,$2::uuid,$3,$4::jsonb)',[academy,scoped,'contacts','{}']);
  const held=await db.holdTransaction(statement,'directory-reader');
  const revoke=db.independent(bindSql("update academy_role_grants set status='revoked' where academy_id=$1::uuid and user_id=$2::uuid",[academy,scoped]),'directory-revoker');
  await db.waitForLock('directory-revoker');checks++;await held.commit();await revoke;
  await reject(()=>read(scoped,'contacts'));
  await query("update academy_role_grants set status='active' where academy_id=$1 and user_id=$2",[academy,scoped]);
  const first=db.holdTransaction(bindSql("update academy_role_grants set status='revoked' where academy_id=$1::uuid and user_id=$2::uuid",[academy,scoped]),'directory-revoke-first');
  const revocation=await first;
  const waiting=db.independent(statement,'directory-waiter');waiting.catch(()=>{});
  await db.waitForLock('directory-waiter');checks++;await revocation.commit();await reject(()=>waiting);
  // Delay only the selected fixture student and verify that the read reached
  // evaluation before its lease expired. Sequence increments survive rollback.
  await db.exec(`create sequence directory_read_marker;
   create function directory_fixture_delay() returns boolean language plpgsql as $$begin perform nextval('directory_read_marker');perform pg_sleep(3);return true;end;$$;
   alter table academy_contacts rename to directory_contact_storage;
   create view academy_contacts as select c.*,case when c.id='${b}'::uuid then directory_fixture_delay() else false end as read_evaluated from directory_contact_storage c;`);
  const migration=studentImportMigration('20261013155000_academy_current_authority_directory.sql');
  const begin=migration.indexOf('create or replace function public.academy_scoped_directory('),end=migration.indexOf('$$;',begin)+3;
  await db.exec(migration.slice(begin,end));
  await grant(expired,'manager','students',[b],{expires:new Date(Date.now()+1500).toISOString()});
  await reject(()=>read(expired,'contacts',{limit:1}));
  eq((await query('select is_called from directory_read_marker'))[0].is_called,true);
 }
 console.log(JSON.stringify({suite:'scoped-directory-current-grants',native,rest,checks,productionTouched:false}));
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,stack:error.stack?.split('\n').slice(-5).join('\n')}));process.exitCode=1;}
finally{await db.close();}
