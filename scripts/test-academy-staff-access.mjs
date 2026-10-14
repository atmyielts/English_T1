import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native'),rest=process.argv.includes('--rest');
if(rest&&!native)throw Error('REST qualification requires an owned native database');
const db=native?await createNativeSessionDb():new PGlite();let checks=0,serial=100,key=0,rpc;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),foreign=id(2),branch=id(3),branchB=id(4),classA=id(5),classB=id(6),contact=id(7);
const owner=id(10),scoped=id(11),branchAdmin=id(12),teacher=id(20),other=id(21),operator=id(22),legacy=id(23);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const denied=async(fn,pattern=/Forbidden|access|401 Unauthorized/i)=>{await assert.rejects(fn,e=>pattern.test(e.message));checks++;};
const command=async(who,action,payload={},requestKey='staff:'+ ++key)=>rpc?rpc('academy_staff_access_command',{p_academy_id:academy,p_actor_id:who,p_action:action,p_payload:payload,p_request_key:requestKey}):
 (await q('select academy_staff_access_command($1::uuid,$2::uuid,$3,$4::jsonb,$5) result',[academy,who,action,JSON.stringify(payload),requestKey]))[0].result;
const current=async(who)=>(await q('select academy_current_authorities($1::uuid,$2::uuid) result',[academy,who]))[0].result;
const directory=async(who,payload={})=>rpc?rpc('academy_staff_directory',{p_academy_id:academy,p_actor_id:who,p_payload:payload}):
 (await q('select academy_staff_directory($1::uuid,$2::uuid,$3::jsonb) result',[academy,who,JSON.stringify(payload)]))[0].result;
const grant=async(who,role,type,ids,patch={})=>{
 const gid=id(serial++);await q("insert into academy_role_grants(id,academy_id,user_id,email,role,scope_type,scope_ids,status,starts_at,expires_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,$10::timestamptz)",
  [gid,academy,who,patch.email??who+'@example.invalid',role,type,JSON.stringify(ids),patch.status??'active',patch.starts??'2020-01-01',patch.expires??null]);return gid;
};
const save=(email,classes=[classA],extra={})=>({staff_email:email,staff_role:'teacher',status:'active',classroom_ids:classes,name:'Owned teacher',...extra});
const migration=readFileSync('supabase/migrations/20261014120000_academy_staff_access_commands.sql','utf8');
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
  create table users(id uuid primary key,is_active boolean not null);
  create table tenants(id uuid primary key,type text not null default 'team',metadata jsonb not null default '{}');
  create table tenant_memberships(id uuid primary key default gen_random_uuid(),tenant_id uuid,user_id uuid,role text check(role in('owner','admin','member','teacher','counselor')),status text);
  create table partner_center_profiles(tenant_id uuid primary key,status text);
  create table academy_branches(id uuid primary key,academy_id uuid,timezone text,is_active boolean,unique(academy_id,id));
  create table academy_classrooms(id uuid primary key,academy_id uuid,branch_id uuid,name text,is_active boolean default true,unique(academy_id,id));
  create table academy_contacts(id uuid primary key,academy_id uuid,primary_branch_id uuid);
  create table academy_classroom_memberships(id uuid primary key default gen_random_uuid(),academy_id uuid,classroom_id uuid,contact_id uuid,role text,status text);
  create table academy_staff(id uuid primary key default gen_random_uuid(),academy_id uuid not null,user_id uuid,email text not null,display_name text,role text not null,classroom_ids jsonb not null default '[]',is_active boolean not null default true,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),unique(academy_id,id),unique(academy_id,email));
  create table academy_role_grants(id uuid primary key default gen_random_uuid(),academy_id uuid not null,user_id uuid,email text not null,display_name text,role text not null,scope_type text not null,scope_ids jsonb not null default '[]',status text not null,granted_by uuid,revoked_by uuid,starts_at timestamptz not null default now(),expires_at timestamptz,accepted_at timestamptz,revoked_at timestamptz,last_used_at timestamptz,metadata jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),unique(academy_id,email));
  create table academy_staff_branch_assignments(id uuid primary key default gen_random_uuid(),academy_id uuid,staff_id uuid,branch_id uuid,assignment_role text,is_primary boolean default false,starts_on date,ends_on date,status text,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),unique(academy_id,staff_id,branch_id,assignment_role,starts_on),foreign key(academy_id,staff_id) references academy_staff(academy_id,id),foreign key(academy_id,branch_id) references academy_branches(academy_id,id));
  create table academy_audit_events(id uuid primary key default gen_random_uuid(),academy_id uuid,actor_user_id uuid,action text,target_type text,target_id text,metadata jsonb);
  create table academy_access_audit_logs(id uuid primary key default gen_random_uuid(),academy_id uuid,actor_user_id uuid,target_user_id uuid,target_email text,action text,role text,previous_status text,next_status text,scope_type text,scope_ids jsonb,metadata jsonb);`);
 // Only the authoritative core is needed; this command is independent of import staging.
 const authority=readFileSync('supabase/migrations/20261013155000_academy_current_authority_directory.sql','utf8');
 await db.exec(authority.slice(0,authority.indexOf('create or replace function public.academy_directory_role_has')));
 await db.exec(migration);
 await q('insert into tenants(id) values($1),($2)',[academy,foreign]);
 for(const who of [owner,scoped,branchAdmin,teacher,other,operator,legacy]){
  await q('insert into users values($1,true)',[who]);await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[who,who+'@example.invalid']);
 }
 await q("insert into tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'owner','active')",[academy,owner]);
 await q("insert into academy_branches values($1,$2,'Asia/Tashkent',true),($3,$2,'UTC',true)",[branch,academy,branchB]);
 await q("insert into academy_classrooms(id,academy_id,branch_id,name) values($1,$2,$3,'Class A'),($4,$2,$5,'Class B')",[classA,academy,branch,classB,branchB]);
 await q('insert into academy_contacts values($1,$2,$3)',[contact,academy,branch]);
 const scopedGrant=await grant(scoped,'admin','classrooms',[classA]);await grant(scoped,'receptionist','branches',[branchB],{email:'secondary@example.invalid'});
 await grant(branchAdmin,'admin','branches',[branch]);
 if(rest)rpc=await db.startRestGateway();

 const payload=save(teacher+'@example.invalid');const created=await command(scoped,'upsert_staff',payload,'create-teacher');
 eq(created.grant.user_id,teacher);eq(created.staff_profile.managed_grant_id,created.grant.id);eq(created.staff_profile.classroom_ids,[classA]);
 const rights=await current(teacher);eq(rights.length,1);eq(rights[0].source,'grant');eq(rights[0].scope_ids,[classA]);
 const replay=await command(scoped,'upsert_staff',payload,'create-teacher');eq(replay.replayed,true);eq(replay.grant.id,created.grant.id);
 eq((await q('select count(*)::int n from academy_audit_events'))[0].n,1);
 eq((await q('select count(*)::int n from academy_access_audit_logs'))[0].n,1);
 eq((await q('select action from academy_audit_events'))[0].action,'staff.upserted');
 const visible=await directory(scoped);eq(visible.staff.map(row=>row.id).sort(),[scopedGrant,created.grant.id].sort());eq(visible.has_more,false);
 const firstPage=await directory(scoped,{limit:1});eq(firstPage.has_more,true);eq(firstPage.staff.length,1);
 const nextPage=await directory(scoped,{limit:1,...firstPage.cursor});eq(nextPage.has_more,false);eq(nextPage.staff.length,1);
 eq(new Set([...firstPage.staff,...nextPage.staff].map(row=>row.id)).size,2);
 await denied(()=>directory(teacher));
 await denied(()=>command(scoped,'upsert_staff',save(other+'@example.invalid',[classB])));
 await denied(()=>command(scoped,'upsert_staff',{staff_email:'wide@example.invalid',staff_role:'admin',scope_type:'academy',scope_ids:[],status:'active'}));
 await denied(()=>command(scoped,'upsert_staff',save(teacher+'@example.invalid',[classB],{id:created.grant.id})));
 eq((await q('select scope_ids from academy_role_grants where id=$1',[created.grant.id]))[0].scope_ids,[classA]);
 await denied(()=>command(scoped,'upsert_staff',{...payload,name:'Different'},'create-teacher'),/request identity|409 Conflict/i);
 const renamed=await command(owner,'upsert_staff',save('alias@example.invalid',[classA],{id:created.grant.id,name:'Renamed'}));
 eq(renamed.grant.user_id,teacher);eq(renamed.staff_profile.user_id,teacher);eq(renamed.staff_profile.created_by,scoped);eq(renamed.grant.granted_by,scoped);
 const roleChanged=await command(owner,'upsert_staff',{id:created.staff_profile.id,staff_email:'alias@example.invalid',staff_role:'counselor'});
 eq(roleChanged.grant.scope_type,'classrooms');eq(roleChanged.grant.scope_ids,[classA]);
 await command(owner,'upsert_staff',{id:created.grant.id,staff_email:'alias@example.invalid',staff_role:'teacher'});
 await denied(()=>command(owner,'upsert_staff',save(other+'@example.invalid',[classA],{id:created.grant.id})),/reassigned|different staff|409 Conflict/i);
 const physical=await command(scoped,'upsert_staff_branch_assignment',{staff_id:created.staff_profile.id,branch_id:branch,assignment_role:'teacher'});
 eq(physical.assignment.branch_id,branch);eq((await current(teacher))[0].scope_type,'classrooms');
 await denied(()=>command(scoped,'upsert_staff_branch_assignment',{staff_id:created.staff_profile.id,branch_id:branchB,assignment_role:'teacher'}));
 await denied(()=>command(scoped,'upsert_staff_branch_assignment',{staff_id:created.staff_profile.id,branch_id:branch,assignment_role:'branch_manager'}));
 await denied(()=>command(owner,'upsert_staff_branch_assignment',{...physical.assignment,id:physical.assignment.id,staff_id:created.staff_profile.id,branch_id:branchB}),/cannot be moved|409 Conflict/i);

 const oldGrant=await grant(legacy,'teacher','classrooms',[classA]);
 await q("insert into academy_staff(academy_id,user_id,email,role,classroom_ids,created_by) values($1,$2,$3,'admin','[]',$4)",[academy,legacy,legacy+'@example.invalid',owner]);
 await denied(()=>command(scoped,'upsert_staff',save(legacy+'@example.invalid')));
 eq((await directory(scoped)).staff.some(row=>row.id===oldGrant),false);
 eq((await directory(owner)).staff.some(row=>row.id===oldGrant),true);
 const converted=await command(owner,'upsert_staff',save(legacy+'@example.invalid'));
 eq(converted.grant.id,oldGrant);eq((await current(legacy)).map(a=>a.source),['grant']);
 const revoked=await command(scoped,'remove_staff',{id:created.grant.id});eq(revoked.ok,true);eq(revoked.grant.status,'revoked');eq(revoked.staff_profile.is_active,false);
 eq((await q("select count(*)::int n from academy_access_audit_logs where action='staff.removed'"))[0].n,1);
 await q('update academy_staff set is_active=true where id=$1',[created.staff_profile.id]);eq(await current(teacher),[]);

 const branchStaff=await command(owner,'upsert_staff',{staff_email:operator+'@example.invalid',staff_role:'branch_manager',scope_type:'branches',scope_ids:[branch],status:'active'});
 eq((await current(operator))[0].scope_ids,[branch]);
 const tomorrow=(await q("select (current_date+1)::text as day_value"))[0].day_value;
 const future=await command(owner,'upsert_staff_branch_assignment',{staff_id:branchStaff.staff_profile.id,branch_id:branchB,assignment_role:'branch_manager',starts_on:tomorrow});
 eq((await current(operator))[0].scope_ids,[branch]);eq(future.assignment.starts_on.slice(0,10),tomorrow);
 const paused=await command(owner,'upsert_staff_branch_assignment',{id:future.assignment.id,staff_id:branchStaff.staff_profile.id,branch_id:branchB,assignment_role:'branch_manager',starts_on:tomorrow,status:'paused'});eq(paused.assignment.status,'paused');
 await denied(()=>command(scoped,'upsert_staff_branch_assignment',{staff_id:branchStaff.staff_profile.id,branch_id:branchB,assignment_role:'support'}));
 await denied(()=>command(branchAdmin,'upsert_staff',save('foreign-class@example.invalid',[classB])));
 const allowed=await command(branchAdmin,'upsert_staff',save('branch-teacher@example.invalid',[classA]));eq(allowed.grant.scope_ids,[classA]);

 // Audit failure must restore both records and avoid publishing a receipt.
 await db.exec("create function reject_staff_audit() returns trigger language plpgsql as $$begin raise exception 'Owned audit failure';end;$$;create trigger reject_staff_audit before insert on academy_audit_events for each row execute function reject_staff_audit();");
 await denied(()=>command(owner,'upsert_staff',save('rollback@example.invalid'), 'atomic-rollback'),/Owned audit failure|400 Bad Request/i);
 eq((await q("select count(*)::int n from academy_staff where email='rollback@example.invalid'"))[0].n,0);
 eq((await q("select count(*)::int n from academy_role_grants where email='rollback@example.invalid'"))[0].n,0);
 eq((await q("select count(*)::int n from academy_staff_command_receipts where request_key='atomic-rollback'"))[0].n,0);
 eq((await q("select count(*)::int n from academy_access_audit_logs where target_email='rollback@example.invalid'"))[0].n,0);
 await db.exec('drop trigger reject_staff_audit on academy_audit_events;');
 await q('update users set is_active=false where id=$1',[other]);
 await denied(()=>command(owner,'upsert_staff',save('foreign-resources@example.invalid',[id(999)])),/belong to this Academy|400 Bad Request/i);
 const closedGrant=await grant(other,'teacher','classrooms',[classA]);
 await denied(()=>command(owner,'upsert_staff',save(other+'@example.invalid',[classA],{id:closedGrant})),/closed staff account|409 Conflict/i);
 await q('update users set is_active=true where id=$1',[other]);
 await q("insert into users values($1,true),($2,true)",[id(40),id(41)]);
 await q("insert into auth.users(id,email,email_confirmed_at) values($1,'Duplicate@example.invalid',now()),($2,'duplicate@example.invalid',now())",[id(40),id(41)]);
 await denied(()=>command(owner,'upsert_staff',save('duplicate@example.invalid')),/verified accounts|409 Conflict/i);
 const self=await command(scoped,'upsert_staff',{id:scopedGrant,staff_email:scoped+'@example.invalid',staff_role:'teacher',scope_type:'classrooms',scope_ids:[classA],status:'active'});
 eq(self.grant.role,'teacher');await denied(()=>command(scoped,'upsert_staff',payload,'create-teacher'));
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);await denied(()=>q('select academy_staff_access_command($1::uuid,$2::uuid,$3,$4::jsonb)',[academy,owner,'remove_staff',JSON.stringify({id:oldGrant})]),/permission|403 Forbidden|401 Unauthorized/i);await db.exec('reset role');
  await db.exec('set role '+role);await denied(()=>q('select academy_staff_directory($1::uuid,$2::uuid)',[academy,owner]),/permission|403 Forbidden|401 Unauthorized/i);await db.exec('reset role');
 }
 eq((await q("select has_table_privilege('service_role','academy_staff_command_receipts','SELECT') allowed"))[0].allowed,false);
 if(native){
  const targetSql=bindSql('select academy_staff_access_command($1::uuid,$2::uuid,$3,$4::jsonb,$5)',[academy,owner,'upsert_staff',JSON.stringify(save(other+'@example.invalid',[classA],{id:closedGrant})),'target-closure-race']);
  const closed=await db.holdTransaction(bindSql('update auth.users set deleted_at=now() where id=$1;update users set is_active=false where id=$1',[other]),'target-close-first');
  const waitingTarget=db.independent(targetSql,'staff-target-waiting');waitingTarget.catch(()=>{});
  await db.waitForLock('staff-target-waiting');checks++;await closed.commit();await denied(()=>waitingTarget,/closed staff account/i);
  await q('update auth.users set deleted_at=null where id=$1',[other]);await q('update users set is_active=true where id=$1',[other]);
  const saved=await db.holdTransaction(targetSql,'target-staff-first');
  const laterClose=db.independent(bindSql('update auth.users set deleted_at=now() where id=$1;update users set is_active=false where id=$1',[other]),'target-close-waiting');
  await db.waitForLock('target-close-waiting');checks++;await saved.commit();await laterClose;
  await denied(()=>command(owner,'upsert_staff',save(other+'@example.invalid',[classA],{id:closedGrant})),/closed staff account|409 Conflict/i);
  await q('update auth.users set deleted_at=null where id=$1',[other]);await q('update users set is_active=true where id=$1',[other]);

  // Expiry after mutation but before commit must roll back records and both audit streams.
  await db.exec("create function delay_staff_audit() returns trigger language plpgsql as $$begin if new.metadata->>'request_key'='expire-during-save' then perform pg_sleep(3);end if;return new;end;$$;create trigger delay_staff_audit before insert on academy_audit_events for each row execute function delay_staff_audit();");
  await q("update academy_role_grants set expires_at=clock_timestamp()+interval '2 seconds' where user_id=$1",[branchAdmin]);
  const expiryStarted=Date.now();
  await denied(()=>command(branchAdmin,'upsert_staff',save('late-expiry@example.invalid',[classA]),'expire-during-save'),/access changed|Forbidden|403 Forbidden|401 Unauthorized/i);
  assert(Date.now()-expiryStarted>=2800,'Expiry fixture must reach the delayed post-write audit');checks++;
  eq((await q("select count(*)::int n from academy_staff where email='late-expiry@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_role_grants where email='late-expiry@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_access_audit_logs where target_email='late-expiry@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_staff_command_receipts where request_key='expire-during-save'"))[0].n,0);
  await db.exec('drop trigger delay_staff_audit on academy_audit_events;');
  await q('update academy_role_grants set expires_at=null where user_id=$1',[branchAdmin]);
  await q("update academy_role_grants set role='admin',status='active',scope_type='classrooms',scope_ids=$1::jsonb where id=$2",[JSON.stringify([classA]),scopedGrant]);
  const statement=bindSql('select academy_staff_access_command($1::uuid,$2::uuid,$3,$4::jsonb,$5)',[academy,scoped,'upsert_staff',JSON.stringify(save('race@example.invalid')),'race-staff']);
  const held=await db.holdTransaction(statement,'staff-manager-first');
  const revocation=db.independent(bindSql("update academy_role_grants set status='revoked' where id=$1::uuid",[scopedGrant]),'staff-revoker');
  await db.waitForLock('staff-revoker');checks++;await held.commit();await revocation;
  await denied(()=>command(scoped,'upsert_staff',save('after-revoke@example.invalid')));
  await q("update academy_role_grants set status='active' where id=$1",[scopedGrant]);
  const reverse=await db.holdTransaction(bindSql("update academy_role_grants set status='revoked' where id=$1::uuid",[scopedGrant]),'staff-revoke-first');
  const waiting=db.independent(statement,'staff-manager-waiting');waiting.catch(()=>{});await db.waitForLock('staff-manager-waiting');checks++;await reverse.commit();await denied(()=>waiting);
 }
 console.log(JSON.stringify({suite:'atomic-staff-access-current-scope',native,rest,checks,productionTouched:false}));
}catch(error){console.error(JSON.stringify({suite:'atomic-staff-access-current-scope',checks,message:error.message,code:error.code}));process.exitCode=1;}
finally{await db.close();}
