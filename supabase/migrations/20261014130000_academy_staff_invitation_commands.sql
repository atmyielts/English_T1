-- Staff invitations use explicit grant provenance. Existing invitations remain
-- readable through the service; ambiguous historical targets require review.
begin;
set local lock_timeout='5s';
alter table public.academy_access_invitations add column staff_grant_id uuid;
alter table public.academy_access_invitations add constraint academy_invitation_staff_grant_fk
 foreign key(academy_id,staff_grant_id) references public.academy_role_grants(academy_id,id) on delete restrict;
alter table public.academy_access_invitations add column delivery_attempt_id uuid;
alter table public.academy_access_invitations add column delivery_lease_until timestamptz;
alter table public.academy_access_invitations add column delivery_actor_id uuid references public.users(id) on delete restrict;
-- Supported clients use the service API. Revoke inherited column privileges as
-- well as table grants; invitation hashes and unrelated recipient rows are private.
revoke all on public.academy_access_invitations from public,anon,authenticated;
do $$declare col text;begin
 for col in select attname from pg_attribute where attrelid='public.academy_access_invitations'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke all (%I) on public.academy_access_invitations from public,anon,authenticated',col);
 end loop;
end;$$;
grant all on public.academy_access_invitations to service_role;

create or replace function public.academy_staff_invitation_target(p_academy uuid,p_invitation public.academy_access_invitations)
returns uuid language plpgsql set search_path=public as $$
declare target uuid;n integer;
begin
 if p_invitation.academy_id<>p_academy or p_invitation.invite_kind<>'staff' then raise exception using errcode='42501',message='Forbidden staff invitation';end if;
 if p_invitation.staff_grant_id is not null then
  select id into target from public.academy_role_grants where academy_id=p_academy and id=p_invitation.staff_grant_id;
 else
  select count(*),min(id::text)::uuid into n,target from public.academy_role_grants where academy_id=p_academy
   and lower(trim(email))=lower(trim(p_invitation.email));
  if n>1 then raise exception using errcode='23505',message='Invitation identity needs manual review';end if;
  if not exists(select 1 from public.academy_role_grants where academy_id=p_academy and id=target and role=p_invitation.role) then
   raise exception using errcode='23505',message='Reissue this historical invitation after reviewing the staff grant';end if;
 end if;
 if target is null then raise exception using errcode='P0002',message='Staff access grant is unavailable';end if;
 return target;
end;$$;
revoke all on function public.academy_staff_invitation_target(uuid,public.academy_access_invitations) from public,anon,authenticated,service_role;

create or replace function public.academy_staff_invitation_authorize(p_academy uuid,p_actor uuid,p_grant uuid)
returns jsonb language plpgsql set search_path=public as $$
declare auths jsonb;g public.academy_role_grants;s public.academy_staff;scope jsonb;scopes jsonb;
begin
 auths:=public.academy_current_authorities(p_academy,p_actor);
 select * into g from public.academy_role_grants where academy_id=p_academy and id=p_grant for share;
 if not found then raise exception using errcode='P0002',message='Staff access grant is unavailable';end if;
 scopes:=jsonb_build_array(jsonb_build_object('type',g.scope_type,'ids',g.scope_ids));
 for s in select * from public.academy_staff where academy_id=p_academy and
  (managed_grant_id=g.id or(managed_grant_id is null and lower(trim(email))=lower(trim(g.email)))) order by id for share loop
  scopes:=scopes||jsonb_build_array(public.academy_staff_profile_scope(p_academy,s.id));
 end loop;
 for scope in select value from jsonb_array_elements(scopes) loop
  if not public.academy_staff_scope_covers(p_academy,auths,scope) then raise exception using errcode='42501',message='Current access does not cover this staff invitation';end if;
 end loop;
 return scopes;
end;$$;
revoke all on function public.academy_staff_invitation_authorize(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_staff_invitation_prepare(p_academy_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,p_token_hash text,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;g public.academy_role_grants;receipt public.academy_staff_command_receipts;
 email_value text;gid uuid;n integer;key_value text;grant_payload jsonb;payload jsonb;staff_result jsonb;scopes jsonb;result jsonb;now_at timestamptz;
begin
 if p_action not in('create_access_invitation','resend_access_invitation') or jsonb_typeof(p_payload) is distinct from 'object'
  or octet_length(p_payload::text)>65536 or p_token_hash !~ '^[0-9a-f]{64}$' or p_token_hash is null then
  raise exception using errcode='22023',message='Choose a valid staff invitation';end if;
 key_value:=coalesce(nullif(p_request_key,''),'legacy:'||gen_random_uuid()::text);
 if length(key_value)>160 or key_value !~ '^[A-Za-z0-9_.:-]+$' then raise exception using errcode='22023',message='Choose a valid request identity';end if;
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 payload:=jsonb_build_object('input',p_payload,'token_hash',p_token_hash);
 select * into receipt from public.academy_staff_command_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=key_value for update;
 if found then
  if receipt.action<>p_action or receipt.payload is distinct from payload then raise exception using errcode='23505',message='This request identity belongs to another invitation';end if;
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=(receipt.result->'invitation'->>'id')::uuid;
  if not found then raise exception using errcode='P0002',message='Invitation is no longer available';end if;
  perform public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,public.academy_staff_invitation_target(p_academy_id,iv));
  return jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',true,
   'deliver',iv.token_hash=p_token_hash and iv.status='pending');
 end if;
 if p_action='resend_access_invitation' then
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=(p_payload->>'invitation_id')::uuid;
  if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
  if iv.invite_kind<>'staff' or iv.status<>'pending' then raise exception using errcode='23505',message='Only pending staff invitations can be resent';end if;
  gid:=public.academy_staff_invitation_target(p_academy_id,iv);
  select * into g from public.academy_role_grants where academy_id=p_academy_id and id=gid;
  if lower(trim(g.email))<>lower(trim(iv.email)) then raise exception using errcode='23505',message='Reissue the invitation for the current staff email';end if;
 else
  email_value:=lower(trim(p_payload->>'email'));
  if email_value is null or email_value='' then raise exception using errcode='22023',message='Staff email is required';end if;
  select count(*) into n from public.academy_role_grants where academy_id=p_academy_id and lower(trim(email))=email_value;
  if n>1 then raise exception using errcode='23505',message='Invitation identity needs manual review';end if;
  select * into g from public.academy_role_grants where academy_id=p_academy_id and lower(trim(email))=email_value;
  if g.id is not null and p_payload->>'role' is not null and p_payload->>'role'<>g.role then
   raise exception using errcode='23505',message='Change existing staff roles in the staff editor before inviting';end if;
 end if;
 if g.id is not null then
  if g.status not in('invited','active') then raise exception using errcode='23505',message='Review suspended or revoked staff access before inviting';end if;
  if (p_payload ? 'scope_type' and p_payload->>'scope_type'<>g.scope_type)
   or(p_payload ? 'scope_ids' and public.academy_authority_scope_ids(p_payload->'scope_ids') is distinct from public.academy_authority_scope_ids(g.scope_ids))
   or(jsonb_typeof(p_payload->'classroom_ids')='array' and jsonb_array_length(p_payload->'classroom_ids')>0 and
    (g.scope_type<>'classrooms' or public.academy_authority_scope_ids(p_payload->'classroom_ids') is distinct from public.academy_authority_scope_ids(g.scope_ids))) then
   raise exception using errcode='23505',message='Change existing staff resources in the staff editor before inviting';end if;
  grant_payload:=jsonb_build_object('id',g.id,'staff_email',g.email);
 else
  grant_payload:=jsonb_build_object('staff_email',email_value,'staff_role',coalesce(p_payload->>'role','teacher'),'status','invited');
  if p_payload ? 'display_name' then grant_payload:=grant_payload||jsonb_build_object('display_name',p_payload->'display_name');end if;
  if p_payload ? 'classroom_ids' then grant_payload:=grant_payload||jsonb_build_object('classroom_ids',p_payload->'classroom_ids');end if;
  if p_payload ? 'branch_ids' then grant_payload:=grant_payload||jsonb_build_object('branch_ids',p_payload->'branch_ids');end if;
  if p_payload ? 'scope_type' then grant_payload:=grant_payload||jsonb_build_object('scope_type',p_payload->'scope_type','scope_ids',p_payload->'scope_ids');end if;
 end if;
 -- Target Auth/public identities are locked by this nested command before any
 -- invitation rows. Both commands and their evidence share this transaction.
 staff_result:=public.academy_staff_access_command(p_academy_id,p_actor_id,'upsert_staff',grant_payload,'invitation-grant:'||md5(key_value));
 gid:=(staff_result->'grant'->>'id')::uuid;
 select * into g from public.academy_role_grants where academy_id=p_academy_id and id=gid;
 if g.status not in('invited','active') then raise exception using errcode='23505',message='Review suspended or revoked staff access before inviting';end if;
 scopes:=public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
 now_at:=clock_timestamp();
 if iv.id is null then
  select count(*) into n from public.academy_access_invitations where academy_id=p_academy_id and invite_kind='staff' and lower(trim(email))=lower(trim(g.email)) and status='pending';
  if n>1 then raise exception using errcode='23505',message='Multiple pending invitations need manual review';end if;
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and invite_kind='staff' and lower(trim(email))=lower(trim(g.email)) and status='pending' for update;
 else select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=iv.id for update;end if;
 if iv.id is not null and (iv.status<>'pending' or public.academy_staff_invitation_target(p_academy_id,iv)<>gid) then
  raise exception using errcode='23505',message='Invitation changed; reload before sending';end if;
 if iv.id is null then
  insert into public.academy_access_invitations(academy_id,invite_kind,email,role,staff_grant_id,token_hash,token_expires_at,created_by,metadata)
   values(p_academy_id,'staff',g.email,g.role,g.id,p_token_hash,now_at+interval '7 days',p_actor_id,'{"source":"atomic_staff_invitation"}') returning * into iv;
 else
  update public.academy_access_invitations set role=g.role,staff_grant_id=g.id,token_hash=p_token_hash,token_expires_at=now_at+interval '7 days',
   delivery_status='queued',delivery_error=null,delivery_attempt_id=null,delivery_lease_until=null,resend_count=resend_count+1,last_resent_at=now_at,updated_at=now_at
   where academy_id=p_academy_id and id=iv.id returning * into iv;
 end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,case when iv.resend_count=0 then 'access.invitation_created' else 'access.invitation_resent' end,'academy_access_invitation',iv.id::text,jsonb_build_object('invite_kind','staff','grant_id',g.id,'request_key',key_value));
 perform public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
 result:=jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',false,'deliver',true);
 insert into public.academy_staff_command_receipts(academy_id,actor_id,request_key,action,payload,protected_scopes,result)
  values(p_academy_id,p_actor_id,key_value,p_action,payload,scopes,result);
 return result;
end;$$;
revoke all on function public.academy_staff_invitation_prepare(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.academy_staff_invitation_prepare(uuid,uuid,text,jsonb,text,text) to service_role;

create or replace function public.academy_staff_invitation_revoke(p_academy_id uuid,p_actor_id uuid,p_invitation_id uuid,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;g public.academy_role_grants;gid uuid;scopes jsonb;result jsonb;receipt public.academy_staff_command_receipts;key_value text;
begin
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
 perform public.academy_current_authorities(p_academy_id,p_actor_id);
 key_value:=coalesce(nullif(p_request_key,''),'legacy:'||gen_random_uuid()::text);
 if length(key_value)>160 or key_value !~ '^[A-Za-z0-9_.:-]+$' then raise exception using errcode='22023',message='Choose a valid request identity';end if;
 select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id;
 if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
 gid:=public.academy_staff_invitation_target(p_academy_id,iv);
 select * into receipt from public.academy_staff_command_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=key_value for update;
 if found then
  perform public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
  if receipt.action<>'revoke_access_invitation' or receipt.payload<>jsonb_build_object('invitation_id',p_invitation_id) then raise exception using errcode='23505',message='This request identity belongs to another invitation';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if iv.status<>'pending' then raise exception using errcode='23505',message='Only pending invitations can be revoked; manage accepted access in the staff editor';end if;
 select * into g from public.academy_role_grants where academy_id=p_academy_id and id=gid;
 -- Withdrawing unaccepted access closes both grant and profile. Active or
 -- subsequently changed grants retain their separately-approved access.
 if g.status='invited' and lower(trim(g.email))=lower(trim(iv.email)) and g.role=iv.role then
  perform public.academy_staff_access_command(p_academy_id,p_actor_id,'remove_staff',jsonb_build_object('id',gid),'invitation-revoke:'||md5(key_value));
 end if;
 scopes:=public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
 update public.academy_access_invitations set status='revoked',revoked_by=p_actor_id,revoked_at=clock_timestamp(),delivery_attempt_id=null,delivery_lease_until=null,
  updated_at=clock_timestamp() where academy_id=p_academy_id and id=p_invitation_id and status='pending' returning * into iv;
 if not found then raise exception using errcode='23505',message='Invitation changed; reload before revoking';end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'access.invitation_revoked','academy_access_invitation',iv.id::text,jsonb_build_object('invite_kind','staff','grant_id',gid,'request_key',key_value));
 perform public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
 result:=jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',false);
 insert into public.academy_staff_command_receipts(academy_id,actor_id,request_key,action,payload,protected_scopes,result)
  values(p_academy_id,p_actor_id,key_value,'revoke_access_invitation',jsonb_build_object('invitation_id',p_invitation_id),scopes,result);
 return result;
end;$$;
revoke all on function public.academy_staff_invitation_revoke(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_staff_invitation_revoke(uuid,uuid,uuid,text) to service_role;

create or replace function public.academy_staff_accept_access(p_actor_id uuid,p_grant_id uuid default null,p_token_hash text default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;g public.academy_role_grants;s public.academy_staff;email_value text;academy uuid;gid uuid;n integer;
 existing_scope jsonb;now_at timestamptz;was_active boolean;replayed boolean;
begin
 if (p_grant_id is null)=(p_token_hash is null) or(p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='Choose a valid staff invitation';end if;
 select lower(trim(email)) into email_value from auth.users where id=p_actor_id and email_confirmed_at is not null for share;
 if not found then raise exception using errcode='42501',message='A verified invitation recipient is required';end if;
 if p_token_hash is not null then
  select * into iv from public.academy_access_invitations where token_hash=p_token_hash and invite_kind='staff';
  if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
  academy:=iv.academy_id;gid:=public.academy_staff_invitation_target(academy,iv);
 else
  select academy_id,id into academy,gid from public.academy_role_grants where id=p_grant_id;
  if not found then raise exception using errcode='P0002',message='Staff grant not found';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||academy::text,0));
 perform public.academy_current_authorities(academy,p_actor_id); -- validates/locks the current public/Auth principal, even before membership exists
 select * into g from public.academy_role_grants where academy_id=academy and id=gid for update;
 if not found or (g.user_id is not null and g.user_id<>p_actor_id) or(g.user_id is null and lower(trim(g.email))<>email_value) then
  raise exception using errcode='42501',message='The staff grant belongs to another account';end if;
 now_at:=clock_timestamp();
 if g.status not in('invited','active') or g.starts_at>now_at or(g.expires_at is not null and g.expires_at<=now_at) then
  raise exception using errcode='23505',message='Staff access is revoked, suspended, expired or not yet started';end if;
 was_active:=g.status='active';replayed:=was_active and iv.id is null;
 if iv.id is not null then
  select * into iv from public.academy_access_invitations where academy_id=academy and id=iv.id for update;
  if iv.token_hash<>p_token_hash then raise exception using errcode='23505',message='This invitation was replaced';end if;
  if iv.status='accepted' and iv.accepted_by=p_actor_id and was_active then
   return jsonb_build_object('grant',to_jsonb(g),'invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',true);
  end if;
  if iv.status<>'pending' then raise exception using errcode='23505',message='This invitation is no longer pending';end if;
  if iv.token_expires_at<=now_at then raise exception using errcode='P0010',message='Invitation has expired';end if;
  if lower(trim(iv.email))<>email_value or lower(trim(g.email))<>email_value then
   raise exception using errcode='42501',message='Sign in with the verified email that received this invitation';end if;
 end if;
 if g.user_id is null and (select count(*) from auth.users u join public.users p on p.id=u.id and p.is_active
  where lower(trim(u.email))=email_value and u.email_confirmed_at is not null and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp()))>1 then
  raise exception using errcode='23505',message='Multiple verified accounts need manual identity review';end if;
 select count(*) into n from public.academy_staff where academy_id=academy and(managed_grant_id=g.id or(managed_grant_id is null and lower(trim(email))=lower(trim(g.email))));
 if n>1 then raise exception using errcode='23505',message='Multiple staff identities need manual review';end if;
 select * into s from public.academy_staff where academy_id=academy and(managed_grant_id=g.id or(managed_grant_id is null and lower(trim(email))=lower(trim(g.email)))) for update;
 if s.id is not null and ((s.user_id is not null and s.user_id<>p_actor_id) or(s.managed_grant_id is not null and s.managed_grant_id<>g.id)) then
  raise exception using errcode='23505',message='The staff profile belongs to another account';end if;
 if s.id is not null and s.managed_grant_id is null then
  existing_scope:=public.academy_staff_profile_scope(academy,s.id);
  if s.role<>g.role or existing_scope->>'type'<>g.scope_type or public.academy_authority_scope_ids(existing_scope->'ids') is distinct from public.academy_authority_scope_ids(g.scope_ids) then
   raise exception using errcode='23505',message='An administrator must review this historical staff profile before activation';end if;
 end if;
 if s.id is null then
  insert into public.academy_staff(academy_id,user_id,email,display_name,role,classroom_ids,is_active,created_by,managed_grant_id)
   values(academy,p_actor_id,g.email,g.display_name,g.role,case when g.scope_type='classrooms' then g.scope_ids else '[]' end,true,g.granted_by,g.id) returning * into s;
 else
  update public.academy_staff set user_id=p_actor_id,is_active=true,managed_grant_id=g.id,updated_at=now_at where academy_id=academy and id=s.id returning * into s;
 end if;
 if g.scope_type='branches' then
  insert into public.academy_staff_branch_assignments(academy_id,staff_id,branch_id,assignment_role,starts_on,status,created_by)
   select academy,s.id,b.id,'support',(now_at at time zone b.timezone)::date,'active',g.granted_by from public.academy_branches b
   where b.academy_id=academy and b.is_active and g.scope_ids @> jsonb_build_array(b.id) and not exists(select 1 from public.academy_staff_branch_assignments a where a.academy_id=academy and a.staff_id=s.id and a.branch_id=b.id and a.status in('active','paused'));
 end if;
 update public.academy_role_grants set user_id=p_actor_id,status='active',accepted_at=coalesce(accepted_at,now_at),updated_at=now_at
  where academy_id=academy and id=g.id returning * into g;
 -- Matching-email autoacceptance reconciles every pending token for this same
 -- explicit grant; later resend cannot reset an already-accepted grant.
 update public.academy_access_invitations set staff_grant_id=g.id,status='accepted',accepted_by=p_actor_id,accepted_at=coalesce(accepted_at,now_at),
  delivery_attempt_id=null,delivery_lease_until=null,updated_at=now_at
  where academy_id=academy and invite_kind='staff' and status='pending' and token_expires_at>now_at
   and lower(trim(email))=email_value and(staff_grant_id=g.id or(staff_grant_id is null and role=g.role));
 if iv.id is not null then select * into iv from public.academy_access_invitations where academy_id=academy and id=iv.id;end if;
 if not was_active or iv.id is not null then
  insert into public.academy_access_audit_logs(academy_id,actor_user_id,target_user_id,target_email,action,role,previous_status,next_status,scope_type,scope_ids,metadata)
   values(academy,p_actor_id,p_actor_id,g.email,'staff.accepted',g.role,case when was_active then 'active' else 'invited' end,'active',g.scope_type,g.scope_ids,jsonb_build_object('grant_id',g.id,'invitation_id',iv.id,'staff_id',s.id));
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
   values(academy,p_actor_id,'access.invitation_accepted',case when iv.id is null then 'academy_role_grant' else 'academy_access_invitation' end,coalesce(iv.id,g.id)::text,jsonb_build_object('invite_kind','staff','grant_id',g.id));
 end if;
 perform public.academy_current_authorities(academy,p_actor_id);
 if g.expires_at is not null and g.expires_at<=clock_timestamp() then raise exception using errcode='23505',message='Staff access expired during activation';end if;
 return jsonb_build_object('grant',to_jsonb(g),'staff_profile',to_jsonb(s),'invitation',case when iv.id is not null then to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id' end,'replayed',replayed);
end;$$;
revoke all on function public.academy_staff_accept_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_staff_accept_access(uuid,uuid,text) to service_role;

create or replace function public.academy_staff_invitation_delivery(p_academy_id uuid,p_actor_id uuid,p_invitation_id uuid,p_token_hash text,p_action text,p_attempt_id uuid default null,p_sent boolean default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;g public.academy_role_grants;gid uuid;attempt uuid;now_at timestamptz;result jsonb;scopes jsonb;
 ticket public.academy_staff_command_receipts;finished public.academy_staff_command_receipts;payload jsonb;updated boolean;
begin
 if p_action not in('claim','finish') or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Choose a valid delivery attempt';end if;
 if p_action='claim' then
  perform 1 from auth.users where id=p_actor_id for share;
  perform pg_advisory_xact_lock(hashtextextended('academy:staff:'||p_academy_id::text,0));
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id;
  if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
  gid:=public.academy_staff_invitation_target(p_academy_id,iv);
  scopes:=public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
  select * into g from public.academy_role_grants where academy_id=p_academy_id and id=gid;
  if g.status not in('invited','active') or lower(trim(g.email))<>lower(trim(iv.email)) then raise exception using errcode='23505',message='Review the current staff grant before sending';end if;
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id for update;
  now_at:=clock_timestamp();
  if iv.status<>'pending' or iv.token_hash<>p_token_hash or iv.token_expires_at<=now_at or iv.delivery_status='sent'
   or(iv.delivery_lease_until is not null and iv.delivery_lease_until>now_at) then
   return jsonb_build_object('claimed',false,'invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id');end if;
  attempt:=gen_random_uuid();
  update public.academy_access_invitations set delivery_attempt_id=attempt,delivery_actor_id=p_actor_id,delivery_lease_until=now_at+interval '2 minutes',
   delivery_status='queued',delivery_error=null,updated_at=now_at where academy_id=p_academy_id and id=p_invitation_id returning * into iv;
  perform public.academy_staff_invitation_authorize(p_academy_id,p_actor_id,gid);
  insert into public.academy_staff_command_receipts(academy_id,actor_id,request_key,action,payload,protected_scopes,result)
   values(p_academy_id,p_actor_id,'delivery:'||attempt::text,'staff_invitation_delivery_claim',jsonb_build_object('invitation_id',iv.id,'token_hash',p_token_hash),scopes,jsonb_build_object('attempt_id',attempt,'lease_until',iv.delivery_lease_until));
  return jsonb_build_object('claimed',true,'attempt_id',attempt,'invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id');
 end if;
 if p_attempt_id is null or p_sent is null then raise exception using errcode='22023',message='Delivery receipt is required';end if;
 payload:=jsonb_build_object('invitation_id',p_invitation_id,'token_hash',p_token_hash,'sent',p_sent);
 select * into ticket from public.academy_staff_command_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key='delivery:'||p_attempt_id::text for update;
 if not found or ticket.action<>'staff_invitation_delivery_claim' or ticket.payload<>payload-'sent' then raise exception using errcode='42501',message='Delivery ticket belongs to another request';end if;
 select * into finished from public.academy_staff_command_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key='delivery-finish:'||p_attempt_id::text for update;
 if found then
  if finished.payload<>payload then raise exception using errcode='23505',message='Delivery receipt conflicts with the confirmed result';end if;
  return finished.result||jsonb_build_object('replayed',true);end if;
 -- Completion records evidence for the exact previously-authorized ticket.
 -- It does not grant access or require a manager's lease to survive provider IO.
 update public.academy_access_invitations set delivery_status=case when p_sent then 'sent' else 'failed' end,
  delivery_error=case when p_sent then null else 'Email delivery could not be confirmed. Retry this invitation.' end,
  sent_at=case when p_sent then clock_timestamp() else sent_at end,delivery_lease_until=null,updated_at=clock_timestamp()
  where academy_id=p_academy_id and id=p_invitation_id and invite_kind='staff' and status='pending' and token_hash=p_token_hash
   and delivery_attempt_id=p_attempt_id and delivery_actor_id=p_actor_id returning * into iv;
 updated:=found;
 if not updated then select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id;
  if not found then raise exception using errcode='P0002',message='Invitation no longer exists';end if;end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'access.invitation_delivery','academy_access_invitation',iv.id::text,jsonb_build_object('invite_kind','staff','delivery_status',iv.delivery_status,'attempt_id',p_attempt_id,'provider_accepted',p_sent,'updated',updated));
 result:=jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','updated',updated,'replayed',false);
 insert into public.academy_staff_command_receipts(academy_id,actor_id,request_key,action,payload,protected_scopes,result)
  values(p_academy_id,p_actor_id,'delivery-finish:'||p_attempt_id::text,'staff_invitation_delivery_finish',payload,ticket.protected_scopes,result);
 return result;
end;$$;
revoke all on function public.academy_staff_invitation_delivery(uuid,uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.academy_staff_invitation_delivery(uuid,uuid,uuid,text,text,uuid,boolean) to service_role;

create or replace function public.academy_staff_invitation_visible(p_academy uuid,p_authorities jsonb,p_invitation public.academy_access_invitations)
returns boolean language plpgsql set search_path=public as $$
declare gid uuid;g public.academy_role_grants;s public.academy_staff;scopes jsonb;scope jsonb;
begin
 if p_invitation.academy_id<>p_academy or p_invitation.invite_kind<>'staff' then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_authorities) a where a->>'role' in('owner','admin','center_admin') and a->>'scope_type'='academy'
  and(a->>'expires_at' is null or(a->>'expires_at')::timestamptz>clock_timestamp())) then return true;end if;
 begin gid:=public.academy_staff_invitation_target(p_academy,p_invitation);
  exception when sqlstate '23505' or sqlstate 'P0002' then return false;end;
 select * into g from public.academy_role_grants where academy_id=p_academy and id=gid;
 scopes:=jsonb_build_array(jsonb_build_object('type',g.scope_type,'ids',g.scope_ids));
 for s in select * from public.academy_staff where academy_id=p_academy and(managed_grant_id=g.id or(managed_grant_id is null and lower(trim(email))=lower(trim(g.email)))) loop
  scopes:=scopes||jsonb_build_array(public.academy_staff_profile_scope(p_academy,s.id));end loop;
 for scope in select value from jsonb_array_elements(scopes) loop
  if not public.academy_staff_scope_covers(p_academy,p_authorities,scope) then return false;end if;end loop;
 return true;
end;$$;
revoke all on function public.academy_staff_invitation_visible(uuid,jsonb,public.academy_access_invitations) from public,anon,authenticated,service_role;

create or replace function public.academy_staff_invitation_directory(p_academy_id uuid,p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare auths jsonb;final_auths jsonb;rows jsonb;page jsonb;iv public.academy_access_invitations;
 page_limit integer:=coalesce((p_payload->>'limit')::integer,300);before_time timestamptz:=(p_payload->>'before_time')::timestamptz;before_id uuid:=(p_payload->>'before_id')::uuid;more boolean;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or page_limit<1 or page_limit>500 or(before_time is null)<>(before_id is null) then raise exception using errcode='22023',message='Choose a valid invitation page';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 -- A mixed lower-role source never gains the higher source's staff permission.
 with eligible as (select i.* from public.academy_access_invitations i where i.academy_id=p_academy_id and i.invite_kind='staff'
  and(before_time is null or(i.created_at,i.id)<(before_time,before_id)) and public.academy_staff_invitation_visible(p_academy_id,auths,i)
  order by i.created_at desc,i.id desc limit page_limit+1)
 select coalesce(jsonb_agg(to_jsonb(eligible) order by created_at desc,id desc),'[]') into rows from eligible;
 more:=jsonb_array_length(rows)>page_limit;
 select coalesce(jsonb_agg(value order by ordinal),'[]') into page from jsonb_array_elements(rows) with ordinality x(value,ordinal) where ordinal<=page_limit;
 final_auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 for iv in select * from jsonb_populate_recordset(null::public.academy_access_invitations,page) loop
  if not public.academy_staff_invitation_visible(p_academy_id,final_auths,iv) then raise exception using errcode='42501',message='Invitation access changed';end if;end loop;
 return jsonb_build_object('invitations',(select coalesce(jsonb_agg(x-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id'),'[]') from jsonb_array_elements(page) x),
  'has_more',more,'cursor',case when more then jsonb_build_object('before_time',page->(page_limit-1)->>'created_at','before_id',page->(page_limit-1)->>'id') else null end);
end;$$;
revoke all on function public.academy_staff_invitation_directory(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_staff_invitation_directory(uuid,uuid,jsonb) to service_role;

commit;
