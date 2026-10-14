import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native'),rest=process.argv.includes('--rest');
const invitations=process.argv.includes('--invitations');
const legacyImport=process.argv.includes('--legacy-import');
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
 if(legacyImport){
  await db.exec(`create table academy_import_jobs(id uuid primary key default gen_random_uuid(),academy_id uuid not null,import_type text not null,source_filename text not null,status text not null default 'draft',column_mapping jsonb not null default '{}',total_rows integer not null default 0,valid_rows integer not null default 0,invalid_rows integer not null default 0,committed_rows integer not null default 0,error_summary jsonb not null default '[]',idempotency_key text not null,created_by uuid,committed_by uuid,created_at timestamptz default now(),completed_at timestamptz,import_mode text not null default 'dry_run',duplicate_strategy text not null default 'reject',rollback_status text not null default 'not_requested',rollback_reason text,rolled_back_by uuid,rolled_back_at timestamptz,unique(academy_id,id),unique(academy_id,idempotency_key));
   create table academy_import_rows(id uuid primary key default gen_random_uuid(),academy_id uuid not null,import_job_id uuid not null,row_number integer not null,raw_data jsonb not null,mapped_data jsonb not null,validation_status text not null default 'pending',validation_errors jsonb not null default '[]',target_id uuid,target_table text,duplicate_key text,created_at timestamptz default now(),unique(academy_id,id),unique(academy_id,import_job_id,row_number),foreign key(academy_id,import_job_id) references academy_import_jobs(academy_id,id));
   create table academy_import_effects(id uuid primary key default gen_random_uuid(),academy_id uuid not null,import_job_id uuid not null,import_row_id uuid not null,target_table text not null,target_id uuid not null,effect_type text not null,rollback_strategy text not null,before_snapshot jsonb,after_snapshot jsonb not null,rollback_status text not null default 'pending',rollback_reference_id uuid,rollback_error text,created_at timestamptz default now(),rolled_back_at timestamptz,unique(academy_id,id),unique(academy_id,import_row_id),foreign key(academy_id,import_job_id) references academy_import_jobs(academy_id,id),foreign key(academy_id,import_row_id) references academy_import_rows(academy_id,id));`);
  await db.exec(readFileSync('supabase/migrations/20261012210000_academy_legacy_import_boundary.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261014140000_academy_legacy_staff_import_commands.sql','utf8'));
 }
 if(invitations){
  await db.exec(`create table academy_access_invitations(id uuid primary key default gen_random_uuid(),academy_id uuid not null,invite_kind text not null,email text not null,role text,contact_id uuid,classroom_id uuid,guardian_relationship_id uuid,token_hash text not null unique,token_expires_at timestamptz not null,status text not null default 'pending',delivery_status text not null default 'queued',delivery_error text,sent_at timestamptz,resend_count integer not null default 0,last_resent_at timestamptz,accepted_by uuid,accepted_at timestamptz,revoked_by uuid,revoked_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),metadata jsonb not null default '{}',unique(academy_id,id));
   create unique index academy_access_invitations_active_target_uidx on academy_access_invitations(academy_id,invite_kind,email,coalesce(classroom_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(guardian_relationship_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(role,'')) where status='pending';`);
  await db.exec('grant select on academy_access_invitations to anon,authenticated;grant select(email) on academy_access_invitations to public;');
  eq((await q("select has_column_privilege('anon','academy_access_invitations','email','SELECT') allowed"))[0].allowed,true);
  await db.exec(readFileSync('supabase/migrations/20261014130000_academy_staff_invitation_commands.sql','utf8'));
  for(const role of ['anon','authenticated'])eq((await q("select has_table_privilege($1,'academy_access_invitations','SELECT') or has_column_privilege($1,'academy_access_invitations','email','SELECT') allowed",[role]))[0].allowed,false);
 }
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
 if(invitations){
  const call=async(name,args)=>rpc?rpc(name,args):(await q('select '+name+'('+Object.entries(args).map((_,i)=>'$'+(i+1)).join(',')+') result',Object.values(args)))[0].result;
  const prepare=(who,payload,hash,key_value,action='create_access_invitation')=>call('academy_staff_invitation_prepare',{p_academy_id:academy,p_actor_id:who,p_action:action,p_payload:JSON.stringify(payload),p_token_hash:hash,p_request_key:key_value});
  const accept=(who,hash=null,gid=null)=>call('academy_staff_accept_access',{p_actor_id:who,p_grant_id:gid,p_token_hash:hash});
  const revoke=(who,iv,key_value)=>call('academy_staff_invitation_revoke',{p_academy_id:academy,p_actor_id:who,p_invitation_id:iv,p_request_key:key_value});
  // REST JSON must receive a JSON object, while SQL bindings use exact JSON text.
  const prepareInvite=async(who,payload,hash,key_value,action='create_access_invitation')=>rpc?rpc('academy_staff_invitation_prepare',{p_academy_id:academy,p_actor_id:who,p_action:action,p_payload:payload,p_token_hash:hash,p_request_key:key_value}):prepare(who,payload,hash,key_value,action);
  const delivery=(who,iv,hash,action,attempt=null,sent=null)=>call('academy_staff_invitation_delivery',{p_academy_id:academy,p_actor_id:who,p_invitation_id:iv,p_token_hash:hash,p_action:action,p_attempt_id:attempt,p_sent:sent});
  const invitationPage=(who,payload={})=>rpc?rpc('academy_staff_invitation_directory',{p_academy_id:academy,p_actor_id:who,p_payload:payload}):call('academy_staff_invitation_directory',{p_academy_id:academy,p_actor_id:who,p_payload:JSON.stringify(payload)});
  await q("update academy_role_grants set role='admin',status='active',expires_at=null where id=$1",[scopedGrant]);
  for(const who of [id(70),id(71),id(72),id(73)]){await q('insert into users values($1,true)',[who]);await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[who,who+'@example.invalid']);}
  const input={email:id(70)+'@example.invalid',role:'teacher',classroom_ids:[classA]};
  await denied(()=>prepareInvite(scoped,{...input,email:'foreign-invite@example.invalid',classroom_ids:[classB]},'a'.repeat(64),'foreign-invite'));
  eq((await q("select count(*)::int n from academy_role_grants where email='foreign-invite@example.invalid'"))[0].n,0);
  const first=await prepareInvite(scoped,input,'a'.repeat(64),'owned-invite');eq(first.invitation.invite_kind,'staff');eq(first.deliver,true);
  eq(Object.hasOwn(first.invitation,'token_hash'),false);eq(Object.hasOwn(first.invitation,'metadata'),false);
  const again=await prepareInvite(scoped,input,'a'.repeat(64),'owned-invite');eq(again.replayed,true);eq(again.invitation.id,first.invitation.id);eq(again.invitation.resend_count,0);
  eq((await invitationPage(scoped)).invitations.map(row=>row.id),[first.invitation.id]);
  eq((await invitationPage(teacher)).invitations,[]);
  const claimed=await delivery(scoped,first.invitation.id,'a'.repeat(64),'claim');eq(claimed.claimed,true);
  eq((await delivery(scoped,first.invitation.id,'a'.repeat(64),'claim')).claimed,false);
  await delivery(scoped,first.invitation.id,'a'.repeat(64),'finish',claimed.attempt_id,true);
  eq((await delivery(scoped,first.invitation.id,'a'.repeat(64),'finish',claimed.attempt_id,true)).replayed,true);
  await denied(()=>delivery(scoped,first.invitation.id,'a'.repeat(64),'finish',claimed.attempt_id,false),/conflicts|409 Conflict/i);
  await denied(()=>delivery(owner,first.invitation.id,'a'.repeat(64),'finish',claimed.attempt_id,true),/another request|401 Unauthorized/i);
  eq((await delivery(scoped,first.invitation.id,'a'.repeat(64),'claim')).claimed,false);
  const resent=await prepareInvite(scoped,{invitation_id:first.invitation.id},'b'.repeat(64),'owned-resend','resend_access_invitation');eq(resent.invitation.resend_count,1);
  eq(resent.invitation.staff_grant_id,first.invitation.staff_grant_id);
  if(rest)await denied(()=>q('select academy_staff_accept_access($1::uuid,null,$2)',[id(70),'a'.repeat(64)]),/Invitation not found/i);
  await denied(()=>accept(id(70),'a'.repeat(64)),/not found|404 Not Found|500 Internal Server Error/i);
  await denied(()=>accept(id(71),'b'.repeat(64)),/another account|verified email|401 Unauthorized/i);
  const accepted=await accept(id(70),'b'.repeat(64));eq(accepted.invitation.status,'accepted');eq(accepted.staff_profile.managed_grant_id,accepted.grant.id);
  eq(accepted.grant.user_id,id(70));eq(accepted.staff_profile.user_id,id(70));eq((await current(id(70))).map(row=>row.source),['grant']);
  eq((await accept(id(70),'b'.repeat(64))).replayed,true);
  await denied(()=>prepareInvite(scoped,{invitation_id:first.invitation.id},'c'.repeat(64),'late-resend','resend_access_invitation'),/pending|409 Conflict/i);
  await denied(()=>revoke(scoped,first.invitation.id,'accepted-revoke'),/pending|409 Conflict/i);
  const pausedInv=await prepareInvite(owner,{email:id(71)+'@example.invalid',role:'teacher',classroom_ids:[classA]},'d'.repeat(64),'owned-withdraw');
  const removed=await revoke(scoped,pausedInv.invitation.id,'withdraw');eq(removed.invitation.status,'revoked');
  eq((await q('select status from academy_role_grants where id=$1',[pausedInv.invitation.staff_grant_id]))[0].status,'revoked');
  eq((await q('select is_active from academy_staff where managed_grant_id=$1',[pausedInv.invitation.staff_grant_id]))[0].is_active,false);
  eq((await revoke(scoped,pausedInv.invitation.id,'withdraw')).replayed,true);
  await denied(()=>accept(id(71),'d'.repeat(64)),/revoked|409 Conflict/i);
  const auto=await prepareInvite(owner,{email:id(72)+'@example.invalid',role:'teacher',classroom_ids:[classA]},'e'.repeat(64),'owned-auto');
  const autoAccepted=await accept(id(72),null,auto.invitation.staff_grant_id);eq(autoAccepted.grant.status,'active');
  eq((await q('select status from academy_access_invitations where id=$1',[auto.invitation.id]))[0].status,'accepted');
  const exp=await prepareInvite(owner,{email:id(73)+'@example.invalid',role:'teacher',classroom_ids:[classA]},'f'.repeat(64),'owned-expired');
  await q("update academy_access_invitations set token_expires_at=now()-interval '1 second' where id=$1",[exp.invitation.id]);
  await denied(()=>accept(id(73),'f'.repeat(64)),/expired|400 Bad Request|500 Internal Server Error/i);
  eq((await q('select status from academy_role_grants where id=$1',[exp.invitation.staff_grant_id]))[0].status,'invited');
  for(const who of [id(74),id(77)]){await q('insert into users values($1,true)',[who]);await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[who,who+'@example.invalid']);}
  const historicalGrant=await grant(id(74),'teacher','classrooms',[classA],{status:'invited'});
  await q("insert into academy_staff(academy_id,user_id,email,role,classroom_ids,created_by) values($1,$2,$3,'teacher',$4::jsonb,$5)",[academy,id(74),id(74)+'@example.invalid',JSON.stringify([classA]),owner]);
  const historicalAccepted=await accept(id(74),null,historicalGrant);eq(historicalAccepted.staff_profile.created_by,owner);eq(historicalAccepted.staff_profile.managed_grant_id,historicalGrant);
  eq((await current(id(74))).map(row=>row.source),['grant']);
  const conflictingGrant=await grant(id(77),'teacher','classrooms',[classA],{status:'invited'});
  await q("insert into academy_staff(academy_id,user_id,email,role,classroom_ids,created_by) values($1,$2,$3,'admin','[]',$4)",[academy,id(77),id(77)+'@example.invalid',owner]);
  await denied(()=>accept(id(77),null,conflictingGrant),/historical staff profile|409 Conflict/i);
  eq((await q('select status from academy_role_grants where id=$1',[conflictingGrant]))[0].status,'invited');
  await denied(()=>prepareInvite(owner,{...input,classroom_ids:[classB]},'8'.repeat(64),'move-invite'),/staff resources|409 Conflict/i);
  await db.exec("create function reject_invitation_audit() returns trigger language plpgsql as $$begin if new.metadata->>'request_key'='invitation-rollback' then raise exception 'Owned invitation audit failure';end if;return new;end;$$;create trigger reject_invitation_audit before insert on academy_audit_events for each row execute function reject_invitation_audit();");
  await denied(()=>prepareInvite(owner,{email:'rollback-invite@example.invalid',role:'teacher',classroom_ids:[classA]},'9'.repeat(64),'invitation-rollback'),/Owned invitation audit failure|400 Bad Request|500 Internal Server Error/i);
  eq((await q("select count(*)::int n from academy_role_grants where email='rollback-invite@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_staff where email='rollback-invite@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_access_invitations where email='rollback-invite@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_staff_command_receipts where request_key='invitation-rollback' or request_key='invitation-grant:'||md5('invitation-rollback')"))[0].n,0);
  await db.exec('drop trigger reject_invitation_audit on academy_audit_events;');
  const foreignScoped=await prepareInvite(owner,{email:'branch-b-invite@example.invalid',role:'teacher',classroom_ids:[classB]},'0'.repeat(64),'owned-foreign-list');
  eq((await invitationPage(scoped)).invitations.some(row=>row.id===foreignScoped.invitation.id),false);
  eq((await invitationPage(owner)).invitations.some(row=>row.id===foreignScoped.invitation.id),true);
  const one=await invitationPage(owner,{limit:1});eq(one.has_more,true);eq(one.invitations.length,1);
  const two=await invitationPage(owner,{limit:1,...one.cursor});eq(two.invitations.length,1);eq(two.invitations[0].id===one.invitations[0].id,false);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await denied(()=>q('select academy_staff_accept_access($1::uuid,$2::uuid,null)',[id(70),first.invitation.staff_grant_id]),/permission|403 Forbidden/i);await db.exec('reset role');
  }
  if(native){
   for(const who of [id(75),id(76)]){await q('insert into users values($1,true)',[who]);await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[who,who+'@example.invalid']);}
   const acceptFirst=await prepareInvite(owner,{email:id(75)+'@example.invalid',role:'teacher',classroom_ids:[classA]},'3'.repeat(64),'accept-first');
   const heldAccept=await db.holdTransaction(bindSql('select academy_staff_accept_access($1::uuid,null,$2)',[id(75),'3'.repeat(64)]),'invitation-accept-first');
   const revoker=db.independent(bindSql('select academy_staff_invitation_revoke($1::uuid,$2::uuid,$3::uuid,$4)',[academy,owner,acceptFirst.invitation.id,'race-revoke-after-accept']),'invitation-revoker-waiting');revoker.catch(()=>{});
   await db.waitForLock('invitation-revoker-waiting');checks++;await heldAccept.commit();await denied(()=>revoker,/Only pending/i);
   eq((await q('select status from academy_access_invitations where id=$1',[acceptFirst.invitation.id]))[0].status,'accepted');
   const revokeFirst=await prepareInvite(owner,{email:id(76)+'@example.invalid',role:'teacher',classroom_ids:[classA]},'4'.repeat(64),'revoke-first');
   const heldRevoke=await db.holdTransaction(bindSql('select academy_staff_invitation_revoke($1::uuid,$2::uuid,$3::uuid,$4)',[academy,owner,revokeFirst.invitation.id,'race-revoke-first']),'invitation-revoke-first');
   const accepter=db.independent(bindSql('select academy_staff_accept_access($1::uuid,null,$2)',[id(76),'4'.repeat(64)]),'invitation-accepter-waiting');accepter.catch(()=>{});
   await db.waitForLock('invitation-accepter-waiting');checks++;await heldRevoke.commit();await denied(()=>accepter,/revoked/i);
   eq((await q('select status from academy_role_grants where id=$1',[revokeFirst.invitation.staff_grant_id]))[0].status,'revoked');
  }
 }
 if(legacyImport){
  await q("update academy_role_grants set role='admin',status='active',expires_at=null where id=$1",[scopedGrant]);
  const stage=async(mapped,duplicates='reject')=>{
   const jobId=id(serial++),rowId=id(serial++);
   await q("insert into academy_import_jobs(id,academy_id,import_type,source_filename,status,idempotency_key,created_by,import_mode,duplicate_strategy) values($1,$2,'staff','owned-staff.csv','draft',$3,$4,'dry_run',$5)",[jobId,academy,'legacy-job:'+jobId,owner,duplicates]);
   await q("insert into academy_import_rows(id,academy_id,import_job_id,row_number,raw_data,mapped_data,validation_status) values($1,$2,$3,1,$4::jsonb,$4::jsonb,'valid')",[rowId,academy,jobId,JSON.stringify(mapped)]);
   await q("update academy_import_jobs set status='ready',total_rows=1,valid_rows=1 where id=$1",[jobId]);return {jobId,rowId};
  };
  const commit=async(who,row,confirm=true)=>rpc?rpc('academy_legacy_staff_import_row',{p_academy_id:academy,p_actor_id:who,p_row_id:row,p_confirm:confirm}):
   (await q('select academy_legacy_staff_import_row($1::uuid,$2::uuid,$3::uuid,$4) result',[academy,who,row,confirm]))[0].result;
  const mapped={email:'owned-import-staff@example.invalid',role:'teacher',classroom_ids:[classA],display_name:'Imported teacher',is_active:true};
  const first=await stage(mapped);await denied(()=>commit(scoped,first.rowId,false),/Confirm the reviewed|400 Bad Request/i);
  const result=await commit(scoped,first.rowId);eq(result.committed,true);eq(result.replayed,false);eq(result.effect.target_table,'academy_staff');
  eq(result.effect.after_snapshot.staff_profile.managed_grant_id,result.effect.after_snapshot.grant.id);
  eq((await commit(scoped,first.rowId)).replayed,true);
  eq((await q('select count(*)::int n from academy_import_effects where import_row_id=$1',[first.rowId]))[0].n,1);
  await denied(()=>q("update academy_import_rows set mapped_data='{}' where id=$1",[first.rowId]),/committed import source/i);
  await denied(()=>q("update academy_import_effects set after_snapshot='{}' where import_row_id=$1",[first.rowId]),/effect evidence is immutable/i);
  const invalid=await stage({...mapped,email:'foreign-staff-import@example.invalid',classroom_ids:[classB]});
  await denied(()=>commit(scoped,invalid.rowId));eq((await q("select count(*)::int n from academy_staff where email='foreign-staff-import@example.invalid'"))[0].n,0);
  const escalation=await stage({...mapped,email:'wide-staff-import@example.invalid',role:'admin',classroom_ids:[],scope_type:'academy',scope_ids:[]});
  await denied(()=>commit(scoped,escalation.rowId));eq((await q("select count(*)::int n from academy_role_grants where email='wide-staff-import@example.invalid'"))[0].n,0);
  const duplicate=await stage({...mapped,display_name:'Same identity, renamed'},'update_safe_fields');
  const changed=await commit(scoped,duplicate.rowId);eq(changed.effect.effect_type,'safe_update');eq(changed.effect.after_snapshot.staff_profile.id,result.effect.target_id);
  eq(changed.effect.after_snapshot.grant.granted_by,scoped);eq(changed.effect.after_snapshot.grant.role,'teacher');
  await db.exec("create function reject_legacy_effect() returns trigger language plpgsql as $$begin raise exception 'Owned effect failure';end;$$;create trigger reject_legacy_effect before insert on academy_import_effects for each row execute function reject_legacy_effect();");
  const atomic=await stage({...mapped,email:'atomic-staff-import@example.invalid'});await denied(()=>commit(owner,atomic.rowId),/Owned effect failure|400 Bad Request|500 Internal Server Error/i);
  eq((await q("select count(*)::int n from academy_staff where email='atomic-staff-import@example.invalid'"))[0].n,0);
  eq((await q("select count(*)::int n from academy_role_grants where email='atomic-staff-import@example.invalid'"))[0].n,0);
  eq((await q('select validation_status from academy_import_rows where id=$1',[atomic.rowId]))[0].validation_status,'valid');
  eq((await q('select status from academy_import_jobs where id=$1',[atomic.jobId]))[0].status,'ready');
  await db.exec('drop trigger reject_legacy_effect on academy_import_effects;');
  const recover=async(who,effect)=>rpc?rpc('academy_legacy_staff_import_recover',{p_academy_id:academy,p_actor_id:who,p_effect_id:effect,p_reason:'Owned correction'}):
   (await q('select academy_legacy_staff_import_recover($1::uuid,$2::uuid,$3::uuid,$4) result',[academy,who,effect,'Owned correction']))[0].result;
  const finish=async(who,job,recovery=false)=>rpc?rpc('academy_legacy_staff_import_finish',{p_academy_id:academy,p_actor_id:who,p_job_id:job,p_recovery:recovery,p_reason:recovery?'Owned correction':null}):
   (await q('select academy_legacy_staff_import_finish($1::uuid,$2::uuid,$3::uuid,$4,$5) result',[academy,who,job,recovery,recovery?'Owned correction':null]))[0].result;
  const finalized=await finish(scoped,duplicate.jobId);eq(finalized.status,'completed');eq(finalized.committed_rows,1);eq(finalized.pending_rows,0);
  eq((await recover(scoped,changed.effect.id)).manual_required,false);
  eq((await q('select display_name from academy_staff where id=$1',[result.effect.target_id]))[0].display_name,mapped.display_name);
  eq((await q('select managed_grant_id from academy_staff where id=$1',[result.effect.target_id]))[0].managed_grant_id,result.effect.after_snapshot.grant.id);
  eq((await finish(scoped,duplicate.jobId,true)).rollback_status,'completed');
  await denied(()=>finish(scoped,duplicate.jobId),/import state|409 Conflict/i);
  await denied(()=>commit(scoped,duplicate.rowId),/entered recovery|409 Conflict/i);
  eq((await recover(scoped,changed.effect.id)).replayed,true);
  const fresh=await stage({...mapped,email:'unused-staff@example.invalid'});
  const unused=await commit(scoped,fresh.rowId);await finish(scoped,fresh.jobId);
  eq((await recover(scoped,unused.effect.id)).manual_required,false);
  eq((await q('select status from academy_role_grants where id=$1',[unused.effect.after_snapshot.grant.id]))[0].status,'revoked');
  eq((await q('select is_active from academy_staff where id=$1',[unused.effect.target_id]))[0].is_active,false);
  eq((await q('select count(*)::int n from academy_staff where id=$1',[unused.effect.target_id]))[0].n,1);
  eq((await finish(scoped,fresh.jobId,true)).completed,1);
  const usedStage=await stage({...mapped,email:'used-staff@example.invalid'}),used=await commit(scoped,usedStage.rowId);
  await q('update academy_role_grants set last_used_at=now() where id=$1',[used.effect.after_snapshot.grant.id]);
  eq((await recover(scoped,used.effect.id)).manual_required,true);
  eq((await q('select status from academy_role_grants where id=$1',[used.effect.after_snapshot.grant.id]))[0].status,'active');
  eq((await finish(scoped,usedStage.jobId,true)).rollback_status,'manual_required');
  const referenceStage=await stage({...mapped,email:'referenced-staff@example.invalid'}),referenced=await commit(scoped,referenceStage.rowId);
  await db.exec('create table owned_teacher_payroll(academy_id uuid,staff_id uuid,foreign key(academy_id,staff_id) references academy_staff(academy_id,id));');
  await q('insert into owned_teacher_payroll values($1,$2)',[academy,referenced.effect.target_id]);
  eq((await recover(scoped,referenced.effect.id)).manual_required,true);
  eq((await q('select is_active from academy_staff where id=$1',[referenced.effect.target_id]))[0].is_active,true);
  const pausedStage=await stage({...mapped,email:'paused-import@example.invalid',is_active:'нет'}),pausedImport=await commit(scoped,pausedStage.rowId);
  eq(pausedImport.effect.after_snapshot.grant.status,'suspended');eq(pausedImport.effect.after_snapshot.staff_profile.is_active,false);
  eq((await q('select mapped_data from academy_import_rows where id=$1',[pausedStage.rowId]))[0].mapped_data.is_active,'нет');
  const historic=await stage({...mapped,email:'historic-import@example.invalid'});
  const historicEffect=id(serial++);
  await q("insert into academy_import_effects(id,academy_id,import_job_id,import_row_id,target_table,target_id,effect_type,rollback_strategy,after_snapshot,rollback_status) values($1,$2,$3,$4,'academy_staff',$5,'insert','delete_if_unreferenced','{}','completed')",[historicEffect,academy,historic.jobId,historic.rowId,result.effect.target_id]);
  await denied(()=>recover(scoped,historicEffect),/Academy-wide|401 Unauthorized/i);
  eq((await recover(owner,historicEffect)).replayed,true);
  eq((await q('select rollback_status from academy_import_effects where id=$1',[historicEffect]))[0].rollback_status,'completed');
  const olderWriter=await stage({...mapped,email:'old-edge-writer@example.invalid'}),oldEffect=id(serial++);
  await q("insert into academy_import_effects(id,academy_id,import_job_id,import_row_id,target_table,target_id,effect_type,rollback_strategy,after_snapshot) values($1,$2,$3,$4,'academy_staff',$5,'insert','delete_if_unreferenced','{}')",[oldEffect,academy,olderWriter.jobId,olderWriter.rowId,result.effect.target_id]);
  await q("update academy_import_rows set validation_status='committed',target_table='academy_staff',target_id=$1 where id=$2",[result.effect.target_id,olderWriter.rowId]);
  eq((await q('select validation_status from academy_import_rows where id=$1',[olderWriter.rowId]))[0].validation_status,'committed');
  await denied(()=>q('delete from academy_import_rows where id=$1',[olderWriter.rowId]),/committed import source/i);
  const removable=await stage({...mapped,email:'uncommitted-source@example.invalid'});
  await q('delete from academy_import_rows where id=$1',[removable.rowId]);eq((await q('select count(*)::int n from academy_import_rows where id=$1',[removable.rowId]))[0].n,0);
  const failureStage=await stage({...mapped,email:'recovery-audit@example.invalid'}),failure=await commit(scoped,failureStage.rowId);
  await db.exec("create function reject_recovery_audit() returns trigger language plpgsql as $$begin if new.action='import.staff_row_recovered' then raise exception 'Owned recovery audit failure';end if;return new;end;$$;create trigger reject_recovery_audit before insert on academy_audit_events for each row execute function reject_recovery_audit();");
  await denied(()=>recover(scoped,failure.effect.id),/Owned recovery audit failure|400 Bad Request|500 Internal Server Error/i);
  eq((await q('select status from academy_role_grants where id=$1',[failure.effect.after_snapshot.grant.id]))[0].status,'active');
  eq((await q('select rollback_status from academy_import_effects where id=$1',[failure.effect.id]))[0].rollback_status,'pending');
  await db.exec('drop trigger reject_recovery_audit on academy_audit_events;');
  const resumable=await stage({...mapped,email:'resume-staff@example.invalid'});
  eq((await finish(scoped,resumable.jobId)).pending_rows,1);
  eq((await commit(scoped,resumable.rowId)).committed,true);
  eq((await finish(scoped,resumable.jobId)).status,'completed');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await denied(()=>q('select academy_legacy_staff_import_recover($1::uuid,$2::uuid,$3::uuid,$4)',[academy,owner,failure.effect.id,'Owned correction']),/permission/i);await db.exec('reset role');
  }
  if(native){
   // Edits first: the transaction may save staff temporarily but must roll it
   // back when its exact reviewed source changes while it waits on the row.
   const raced=await stage({...mapped,email:'source-race@example.invalid'});
   const edit=await db.holdTransaction(bindSql("update academy_import_rows set mapped_data=mapped_data||'{\"display_name\":\"Changed review\"}'::jsonb where id=$1",[raced.rowId]),'legacy-edit-first');
   const pending=db.independent(bindSql('select academy_legacy_staff_import_row($1::uuid,$2::uuid,$3::uuid,true)',[academy,scoped,raced.rowId]),'legacy-import-waiting');pending.catch(()=>{});
   await db.waitForLock('legacy-import-waiting');checks++;await edit.commit();await denied(()=>pending,/source changed/i);
   eq((await q("select count(*)::int n from academy_staff where email='source-race@example.invalid'"))[0].n,0);
   eq((await q('select count(*)::int n from academy_import_effects where import_row_id=$1',[raced.rowId]))[0].n,0);
   const accepted=await db.holdTransaction(bindSql('select academy_legacy_staff_import_row($1::uuid,$2::uuid,$3::uuid,true)',[academy,scoped,raced.rowId]),'legacy-import-first');
   const lateEdit=db.independent(bindSql("update academy_import_rows set mapped_data='{}' where id=$1",[raced.rowId]),'legacy-late-edit');lateEdit.catch(()=>{});
   await db.waitForLock('legacy-late-edit');checks++;await accepted.commit();await denied(()=>lateEdit,/committed import source/i);
  }
 }
 console.log(JSON.stringify({suite:'atomic-staff-access-current-scope',native,rest,invitations,legacyImport,checks,productionTouched:false}));
}catch(error){console.error(JSON.stringify({suite:'atomic-staff-access-current-scope',checks,message:error.message,code:error.code}));process.exitCode=1;}
finally{await db.close();}
