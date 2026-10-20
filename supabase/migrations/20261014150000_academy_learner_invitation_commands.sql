-- Student/parent invitation bindings and consent must commit together.
begin;
set local lock_timeout='5s';

create table public.academy_learner_invitation_receipts(
 academy_id uuid not null references public.tenants(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete restrict,
 request_key text not null,action text not null,payload jsonb not null,
 result jsonb not null,created_at timestamptz not null default now(),
 primary key(academy_id,actor_id,request_key)
);
alter table public.academy_learner_invitation_receipts enable row level security;
revoke all on public.academy_learner_invitation_receipts from public,anon,authenticated,service_role;

create or replace function public.academy_guard_learner_invitation_receipt()
returns trigger language plpgsql set search_path=public as $$
begin
 raise exception using errcode='23505',message='Invitation history cannot be changed or deleted';
end;$$;
revoke all on function public.academy_guard_learner_invitation_receipt() from public,anon,authenticated,service_role;
create trigger academy_learner_invitation_receipt_immutable before update or delete on public.academy_learner_invitation_receipts
 for each row execute function public.academy_guard_learner_invitation_receipt();

create or replace function public.academy_guard_guardian_relationship_identity()
returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.id,new.academy_id,new.contact_id,new.guardian_id) is distinct from row(old.id,old.academy_id,old.contact_id,old.guardian_id) then
  raise exception using errcode='23505',message='Create a new parent relationship instead of moving its history';end if;
 return new;
end;$$;
revoke all on function public.academy_guard_guardian_relationship_identity() from public,anon,authenticated,service_role;
create trigger academy_guardian_relationship_identity before update on public.academy_student_guardian_relationships
 for each row execute function public.academy_guard_guardian_relationship_identity();

create or replace function public.academy_guard_learner_invitation_identity()
returns trigger language plpgsql set search_path=public as $$
begin
 if (old.invite_kind in('student','guardian') or new.invite_kind in('student','guardian')) and row(new.id,new.academy_id,new.invite_kind,new.contact_id,new.classroom_id,new.guardian_relationship_id,new.email)
  is distinct from row(old.id,old.academy_id,old.invite_kind,old.contact_id,old.classroom_id,old.guardian_relationship_id,old.email) then
  raise exception using errcode='23505',message='Create a new invitation instead of changing its recipient or student';end if;
 return new;
end;$$;
revoke all on function public.academy_guard_learner_invitation_identity() from public,anon,authenticated,service_role;
create trigger academy_learner_invitation_identity before update on public.academy_access_invitations
 for each row execute function public.academy_guard_learner_invitation_identity();

create or replace function public.academy_learner_invitation_role_has(p_role text,p_kind text)
returns boolean language sql immutable set search_path=public as $$
 select p_role in('owner','admin','center_admin','manager','counselor','branch_manager')
  or(p_kind='guardian' and p_role='parent_liaison');
$$;
revoke all on function public.academy_learner_invitation_role_has(text,text) from public,anon,authenticated,service_role;

create or replace function public.academy_learner_invitation_resources(p_academy uuid,p_kind text,p_contact uuid,p_classroom uuid,p_relationship uuid)
returns jsonb language plpgsql set search_path=public as $$
declare c public.academy_contacts;k public.academy_classrooms;r public.academy_student_guardian_relationships;g public.academy_guardians;members jsonb;
begin
 if p_kind='guardian' then
  select * into r from public.academy_student_guardian_relationships where academy_id=p_academy and id=p_relationship;
  if not found then raise exception using errcode='P0002',message='Parent relationship not found';end if;
  p_contact:=r.contact_id;
  select * into g from public.academy_guardians where academy_id=p_academy and id=r.guardian_id;
  if not found then raise exception using errcode='P0002',message='Parent record not found';end if;
 elsif p_kind='student' then
  select * into k from public.academy_classrooms where academy_id=p_academy and id=p_classroom;
  if not found then raise exception using errcode='P0002',message='Group not found';end if;
 else raise exception using errcode='22023',message='Choose a student or parent invitation';end if;
 select * into c from public.academy_contacts where academy_id=p_academy and id=p_contact;
 if not found then raise exception using errcode='P0002',message='Student record not found';end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',m.classroom_id,'branch_id',a.branch_id) order by m.classroom_id),'[]') into members
  from public.academy_classroom_memberships m join public.academy_classrooms a on a.academy_id=m.academy_id and a.id=m.classroom_id
  where m.academy_id=p_academy and m.contact_id=c.id and m.role='student' and m.status in('active','trial','invited','paused');
 return jsonb_build_object('kind',p_kind,'contact',to_jsonb(c),'classroom',to_jsonb(k),'relationship',to_jsonb(r),'guardian',to_jsonb(g),'memberships',members);
end;$$;
revoke all on function public.academy_learner_invitation_resources(uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_learner_invitation_covers(p_authorities jsonb,p_target jsonb)
returns boolean language sql stable set search_path=public as $$
 select exists(select 1 from jsonb_array_elements(p_authorities) a where public.academy_learner_invitation_role_has(a->>'role',p_target->>'kind')
  and case a->>'scope_type'
   when 'academy' then true
   when 'students' then a->'scope_ids' @> jsonb_build_array(p_target->'contact'->>'id')
   when 'branches' then a->'scope_ids' @> jsonb_build_array(p_target->'contact'->>'primary_branch_id')
    or exists(select 1 from jsonb_array_elements(p_target->'memberships') m where a->'scope_ids' @> jsonb_build_array(m->>'branch_id'))
   when 'classrooms' then exists(select 1 from jsonb_array_elements(p_target->'memberships') m where a->'scope_ids' @> jsonb_build_array(m->>'classroom_id'))
   else false end)
 and (p_target->>'kind'='guardian' or exists(select 1 from jsonb_array_elements(p_authorities) a where public.academy_learner_invitation_role_has(a->>'role','student')
  and case a->>'scope_type'
   when 'academy' then true
   when 'branches' then a->'scope_ids' @> jsonb_build_array(p_target->'classroom'->>'branch_id')
   when 'classrooms' then a->'scope_ids' @> jsonb_build_array(p_target->'classroom'->>'id')
   when 'students' then a->'scope_ids' @> jsonb_build_array(p_target->'contact'->>'id')
    and exists(select 1 from jsonb_array_elements(p_target->'memberships') m where m->>'classroom_id'=p_target->'classroom'->>'id')
   else false end));
$$;
revoke all on function public.academy_learner_invitation_covers(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.academy_learner_invitation_review(p_invitation public.academy_access_invitations)
returns jsonb language plpgsql set search_path=public as $$
declare t jsonb;m public.academy_classroom_memberships;
begin
 t:=public.academy_learner_invitation_resources(p_invitation.academy_id,p_invitation.invite_kind,p_invitation.contact_id,p_invitation.classroom_id,p_invitation.guardian_relationship_id);
 if p_invitation.invite_kind='student' then
  select * into m from public.academy_classroom_memberships where academy_id=p_invitation.academy_id and classroom_id=p_invitation.classroom_id and contact_id=p_invitation.contact_id;
  return jsonb_build_object('invitation_id',p_invitation.id,'academy_id',p_invitation.academy_id,'kind','student','email',lower(trim(p_invitation.email)),
   'contact_id',p_invitation.contact_id,'contact_name',concat_ws(' ',t->'contact'->>'first_name',t->'contact'->>'last_name'),'contact_user_id',t->'contact'->'user_id','contact_email',t->'contact'->'email','contact_status',t->'contact'->'status',
   'classroom_id',p_invitation.classroom_id,'classroom_name',t->'classroom'->>'name','classroom_active',t->'classroom'->'is_active','membership_id',m.id,'membership_user_id',m.user_id,'membership_role',m.role,'membership_status',m.status);
 end if;
 return jsonb_build_object('invitation_id',p_invitation.id,'academy_id',p_invitation.academy_id,'kind','guardian','email',lower(trim(p_invitation.email)),
  'contact_id',t->'contact'->'id','contact_name',concat_ws(' ',t->'contact'->>'first_name',t->'contact'->>'last_name'),'contact_status',t->'contact'->'status','guardian_id',t->'guardian'->'id','guardian_user_id',t->'guardian'->'user_id',
  'guardian_email',t->'guardian'->'email','guardian_status',t->'guardian'->'status','relationship',(t->'relationship')-'updated_at'-'created_at'-'metadata'-'created_by');
end;$$;
revoke all on function public.academy_learner_invitation_review(public.academy_access_invitations) from public,anon,authenticated,service_role;

create or replace function public.academy_learner_accept_invitation(p_actor_id uuid,p_token_hash text,p_review_hash text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;before_review jsonb;review jsonb;email_value text;academy uuid;now_at timestamptz;
 c public.academy_contacts;k public.academy_classrooms;m public.academy_classroom_memberships;r public.academy_student_guardian_relationships;g public.academy_guardians;
 uid uuid;replayed boolean;access_status text;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Choose a valid invitation';end if;
 select lower(trim(email)) into email_value from auth.users where id=p_actor_id and email_confirmed_at is not null for share;
 if not found or nullif(email_value,'') is null then raise exception using errcode='42501',message='Sign in with the verified email that received this invitation';end if;
 select * into iv from public.academy_access_invitations where token_hash=p_token_hash and invite_kind in('student','guardian');
 if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
 academy:=iv.academy_id;
 perform pg_advisory_xact_lock(hashtextextended('academy:learner-invitation:'||academy::text,0));
 perform public.academy_current_authorities(academy,p_actor_id);
 before_review:=public.academy_learner_invitation_review(iv);
 if lower(trim(iv.email))<>email_value then raise exception using errcode='42501',message='Sign in with the verified email that received this invitation';end if;
 if iv.invite_kind='student' then
  select * into c from public.academy_contacts where academy_id=academy and id=iv.contact_id for update;
  select * into k from public.academy_classrooms where academy_id=academy and id=iv.classroom_id for share;
  select * into m from public.academy_classroom_memberships where academy_id=academy and classroom_id=iv.classroom_id and contact_id=iv.contact_id for update;
  if m.id is null or m.role<>'student' then raise exception using errcode='23505',message='Ask the academy to check this group enrollment';end if;
  if (c.user_id is not null and c.user_id<>p_actor_id) or(m.user_id is not null and m.user_id<>p_actor_id) then
   raise exception using errcode='42501',message='This student record belongs to another account';end if;
  if nullif(trim(c.email),'') is not null and lower(trim(c.email))<>email_value then
   raise exception using errcode='23505',message='Ask the academy to check the student email';end if;
  if c.status not in('active','trial','paused') or not k.is_active or m.status not in('invited','active','trial','paused') then
   raise exception using errcode='23505',message='Ask the academy to check this group enrollment';end if;
  uid:=c.user_id;
 else
  -- Relationship keys are immutable. Lock the student, then parent, then its
  -- relationship before the invitation; matching FK writers use the same graph.
  select * into r from public.academy_student_guardian_relationships where academy_id=academy and id=iv.guardian_relationship_id;
  select * into c from public.academy_contacts where academy_id=academy and id=r.contact_id for share;
  select * into g from public.academy_guardians where academy_id=academy and id=r.guardian_id for update;
  select * into r from public.academy_student_guardian_relationships where academy_id=academy and id=iv.guardian_relationship_id for update;
  if g.user_id is not null and g.user_id<>p_actor_id then raise exception using errcode='42501',message='This parent record belongs to another account';end if;
  if lower(trim(g.email)) is distinct from email_value then raise exception using errcode='42501',message='Ask the academy to check the parent email';end if;
  if c.status not in('active','trial','paused') or g.status not in('invited','verified') or r.status not in('pending','active') or r.consent_status not in('pending','granted')
   or(r.consent_expires_at is not null and r.consent_expires_at<=clock_timestamp()) then
   raise exception using errcode='23505',message='Parent access was stopped or needs a new consent request';end if;
  uid:=g.user_id;
 end if;
 if uid is null and (select count(*) from auth.users a join public.users u on u.id=a.id and u.is_active where lower(trim(a.email))=email_value
  and a.email_confirmed_at is not null and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp()))>1 then
  raise exception using errcode='23505',message='Ask the academy to review this account identity';end if;
 select * into iv from public.academy_access_invitations where academy_id=academy and id=iv.id for update;
 if iv.token_hash<>p_token_hash then raise exception using errcode='23505',message='This invitation was replaced';end if;
 replayed:=iv.status='accepted' and iv.accepted_by=p_actor_id;
 if not replayed and iv.status<>'pending' then raise exception using errcode='23505',message='This invitation is no longer pending';end if;
 now_at:=clock_timestamp();
 if not replayed and iv.token_expires_at<=now_at then raise exception using errcode='P0010',message='Invitation has expired';end if;
 review:=public.academy_learner_invitation_review(iv);
 if before_review is distinct from review or not replayed and p_review_hash is distinct from md5(review::text) then
  raise exception using errcode='23505',message='The invitation details changed. Review the link again';end if;
 if replayed then
  if iv.invite_kind='student' and (c.user_id is distinct from p_actor_id or m.user_id is distinct from p_actor_id)
   or iv.invite_kind='guardian' and (g.user_id is distinct from p_actor_id or g.status<>'verified' or r.status<>'active' or r.consent_status<>'granted') then
   raise exception using errcode='23505',message='This access changed after the invitation was accepted';end if;
 else
  if iv.invite_kind='student' then
   update public.academy_contacts set user_id=p_actor_id where academy_id=academy and id=c.id;
   update public.academy_classroom_memberships set user_id=p_actor_id,status=case when status='invited' and c.status<>'paused' then 'active' else status end,
    joined_at=coalesce(joined_at,now_at) where academy_id=academy and id=m.id returning * into m;
  else
   update public.academy_guardians set user_id=p_actor_id,status='verified',updated_at=now_at where academy_id=academy and id=g.id;
   update public.academy_student_guardian_relationships set status='active',consent_status='granted',consented_at=coalesce(consented_at,now_at),updated_at=now_at
    where academy_id=academy and id=r.id returning * into r;
   if before_review->'relationship'->>'consent_status'<>'granted' then
    insert into public.academy_guardian_consents(academy_id,relationship_id,consent_type,policy_version,status,granted_by_user_id,recorded_by_user_id,occurred_at,expires_at,evidence)
     values(academy,r.id,'guardian_access','academy-invitation-v1','granted',p_actor_id,p_actor_id,now_at,r.consent_expires_at,
      jsonb_build_object('invitation_id',iv.id,'review_hash',p_review_hash,'review',review));
   end if;
  end if;
  update public.academy_access_invitations set status='accepted',accepted_by=p_actor_id,accepted_at=now_at,
   delivery_attempt_id=null,delivery_lease_until=null,updated_at=now_at where academy_id=academy and id=iv.id returning * into iv;
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
   values(academy,p_actor_id,'access.invitation_accepted','academy_access_invitation',iv.id::text,
    jsonb_build_object('invite_kind',iv.invite_kind,'contact_id',c.id,'classroom_id',k.id,'relationship_id',r.id));
 end if;
 perform public.academy_current_authorities(academy,p_actor_id);
 if not replayed and iv.token_expires_at<=clock_timestamp() or iv.invite_kind='guardian' and r.consent_expires_at<=clock_timestamp() then
  raise exception using errcode='P0010',message='Invitation or parent consent expired';end if;
 access_status:=case when iv.invite_kind='student' then case when c.status='paused' then 'paused' else m.status end else 'active' end;
 return jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id',
  'replayed',replayed,'access_status',access_status);
end;$$;
revoke all on function public.academy_learner_accept_invitation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.academy_learner_accept_invitation(uuid,text,text) to service_role;

create or replace function public.academy_learner_invitation_status(p_actor_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare iv public.academy_access_invitations;review jsonb;email_value text;state text;result jsonb;sections jsonb:='[]';rel jsonb;uid uuid;
begin
 select lower(trim(email)) into email_value from auth.users where id=p_actor_id and email_confirmed_at is not null for share;
 if not found or nullif(email_value,'') is null then raise exception using errcode='42501',message='Sign in with the verified email that received this invitation';end if;
 select * into iv from public.academy_access_invitations where token_hash=p_token_hash and invite_kind in('student','guardian');
 if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
 perform public.academy_current_authorities(iv.academy_id,p_actor_id);
 if lower(trim(iv.email))<>email_value then raise exception using errcode='42501',message='Sign in with the verified email that received this invitation';end if;
 review:=public.academy_learner_invitation_review(iv);
 if iv.status='accepted' and iv.accepted_by is distinct from p_actor_id then raise exception using errcode='42501',message='This invitation belongs to another account';end if;
 if iv.invite_kind='student' then
  if review->>'contact_user_id' is not null and review->>'contact_user_id'<>p_actor_id::text
   or review->>'membership_user_id' is not null and review->>'membership_user_id'<>p_actor_id::text then
   raise exception using errcode='42501',message='This student record belongs to another account';end if;
  state:=case when coalesce(review->>'contact_status','') not in('active','trial','paused') or review->>'classroom_active' is distinct from 'true'
   or coalesce(review->>'membership_status','') not in('active','trial','invited','paused') or review->>'membership_role' is distinct from 'student'
   or nullif(trim(review->>'contact_email'),'') is not null and lower(trim(review->>'contact_email'))<>email_value
   then 'stopped' when review->>'contact_status'='paused' then 'paused' else review->>'membership_status' end;
  uid:=(review->>'contact_user_id')::uuid;
 else
  if review->>'guardian_user_id' is not null and review->>'guardian_user_id'<>p_actor_id::text then
   raise exception using errcode='42501',message='This parent record belongs to another account';end if;
  if lower(trim(review->>'guardian_email')) is distinct from email_value then raise exception using errcode='42501',message='Ask the academy to check the parent email';end if;
  rel:=review->'relationship';
  uid:=(review->>'guardian_user_id')::uuid;
  state:=case when review->>'contact_status' not in('active','trial','paused') or review->>'guardian_status' not in('invited','verified')
   or rel->>'status' not in('pending','active') or rel->>'consent_status' not in('pending','granted')
   or(rel->>'consent_expires_at')::timestamptz<=clock_timestamp() then 'stopped' else rel->>'status' end;
  sections:=to_jsonb(array(select label from (values
   ('Attendance',coalesce((rel->>'can_view_attendance')::boolean,false)),('Grades',coalesce((rel->>'can_view_grades')::boolean,false)),
   ('Homework',coalesce((rel->>'can_view_homework')::boolean,false)),('Timetable',coalesce((rel->>'can_view_schedule')::boolean,false)),
   ('Payments',coalesce((rel->>'can_view_payments')::boolean,false)),('Messages',coalesce((rel->>'can_view_messages')::boolean,false))) v(label,allowed) where allowed));
 end if;
 if uid is null and (select count(*) from auth.users a join public.users u on u.id=a.id and u.is_active where lower(trim(a.email))=email_value
  and a.email_confirmed_at is not null and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp()))>1 then
  raise exception using errcode='23505',message='Ask the academy to review this account identity';end if;
 result:=to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id';
 result:=result||jsonb_build_object('email',left(split_part(iv.email,'@',1),2)||'***@'||split_part(iv.email,'@',2),'access_status',coalesce(state,'stopped'));
 if iv.status='pending' and iv.token_expires_at<=clock_timestamp() then result:=result||'{"status":"expired"}'::jsonb;end if;
 if iv.status in('pending','accepted') and state<>'stopped' and (iv.status='accepted' or iv.token_expires_at>clock_timestamp()) then
  result:=result||jsonb_build_object('review_hash',md5(review::text),'student_name',review->>'contact_name','classroom_name',review->>'classroom_name','shared_sections',sections);
 end if;
 perform public.academy_current_authorities(iv.academy_id,p_actor_id);
 return jsonb_build_object('invitation',result);
end;$$;
revoke all on function public.academy_learner_invitation_status(uuid,text) from public,anon,authenticated;
grant execute on function public.academy_learner_invitation_status(uuid,text) to service_role;

create or replace function public.academy_learner_invitation_prepare(p_academy_id uuid,p_actor_id uuid,p_action text,p_payload jsonb,p_token_hash text,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;t jsonb;fresh jsonb;auths jsonb;receipt public.academy_learner_invitation_receipts;
 kind text;email_value text;key_value text;identity jsonb;contact uuid;classroom uuid;relationship uuid;uid uuid;protected_ids uuid[];m public.academy_classroom_memberships;
begin
 if p_action not in('create_access_invitation','resend_access_invitation') or jsonb_typeof(p_payload) is distinct from 'object'
  or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Choose a valid invitation';end if;
 key_value:=coalesce(nullif(trim(p_request_key),''),gen_random_uuid()::text);
 if length(key_value)>160 or key_value !~ '^[A-Za-z0-9_.:-]+$' then raise exception using errcode='22023',message='Choose a valid request key';end if;
 identity:=jsonb_build_object('action',p_action,'payload',p_payload,'token_hash',p_token_hash);
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:learner-invitation:'||p_academy_id::text,0));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 select * into receipt from public.academy_learner_invitation_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=key_value;
 if found then
  if receipt.action<>'prepare' or receipt.payload<>identity then raise exception using errcode='23505',message='This request key was used for different invitation details';end if;
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=(receipt.result->'invitation'->>'id')::uuid;
  if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
  t:=public.academy_learner_invitation_resources(p_academy_id,iv.invite_kind,iv.contact_id,iv.classroom_id,iv.guardian_relationship_id);
  if not public.academy_learner_invitation_covers(auths,t) then raise exception using errcode='42501',message='You do not have permission to manage this invitation';end if;
  if iv.status='pending' and iv.token_hash<>p_token_hash then raise exception using errcode='23505',message='This invitation was replaced';end if;
  return jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',true,
   'deliver',iv.status='pending' and iv.delivery_status<>'sent' and iv.token_expires_at>clock_timestamp());
 end if;
 if p_action='resend_access_invitation' then
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=(p_payload->>'invitation_id')::uuid and invite_kind in('student','guardian');
  if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
  if iv.status<>'pending' then raise exception using errcode='23505',message='Only pending invitations can be sent again';end if;
  kind:=iv.invite_kind;email_value:=lower(trim(iv.email));contact:=iv.contact_id;classroom:=iv.classroom_id;relationship:=iv.guardian_relationship_id;
 else
  kind:=p_payload->>'invite_kind';email_value:=lower(trim(p_payload->>'email'));contact:=(p_payload->>'contact_id')::uuid;
  classroom:=(p_payload->>'classroom_id')::uuid;relationship:=(p_payload->>'guardian_relationship_id')::uuid;
 end if;
 if kind is null or kind not in('student','guardian') or email_value is null or length(email_value)>254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception using errcode='22023',message='Choose a student or parent and enter their email';end if;
 t:=public.academy_learner_invitation_resources(p_academy_id,kind,contact,classroom,relationship);
 if not public.academy_learner_invitation_covers(auths,t) then raise exception using errcode='42501',message='You do not have permission to manage this invitation';end if;
 protected_ids:=array(select distinct a.id from auth.users a where a.id in((t->'contact'->>'user_id')::uuid,(t->'guardian'->>'user_id')::uuid)
  or(lower(trim(a.email))=email_value and a.email_confirmed_at is not null));
 perform 1 from auth.users where id=any(protected_ids) order by id for share;
 perform 1 from public.users where id=any(protected_ids) order by id for share;
 perform 1 from public.academy_contacts where academy_id=p_academy_id and id=(t->'contact'->>'id')::uuid for share;
 perform 1 from public.academy_classrooms c where c.academy_id=p_academy_id and(c.id=classroom or exists(select 1 from public.academy_classroom_memberships member where member.academy_id=p_academy_id and member.contact_id=(t->'contact'->>'id')::uuid and member.classroom_id=c.id)) order by c.id for share;
 perform 1 from public.academy_classroom_memberships where academy_id=p_academy_id and contact_id=(t->'contact'->>'id')::uuid order by id for share;
 if kind='guardian' then
  perform 1 from public.academy_guardians where academy_id=p_academy_id and id=(t->'guardian'->>'id')::uuid for share;
  perform 1 from public.academy_student_guardian_relationships where academy_id=p_academy_id and id=relationship for share;
 end if;
 fresh:=public.academy_learner_invitation_resources(p_academy_id,kind,contact,classroom,relationship);
 if not public.academy_learner_invitation_covers(auths,fresh) or fresh->'contact'->>'status' not in('active','trial','paused') then raise exception using errcode='42501',message='You do not have permission to manage this invitation';end if;
 uid:=(case when kind='student' then fresh->'contact'->>'user_id' else fresh->'guardian'->>'user_id' end)::uuid;
 if uid is not null and (not(uid=any(protected_ids)) or not exists(select 1 from auth.users a join public.users u on u.id=a.id and u.is_active where a.id=uid
  and lower(trim(a.email))=email_value and a.email_confirmed_at is not null and a.deleted_at is null and(a.banned_until is null or a.banned_until<=clock_timestamp()))) then
  raise exception using errcode='23505',message='Ask the academy to check the account linked to this record';end if;
 if kind='student' then
  if fresh->'classroom'->>'is_active'<>'true' or nullif(trim(fresh->'contact'->>'email'),'') is not null and lower(trim(fresh->'contact'->>'email'))<>email_value then
   raise exception using errcode='23505',message='Check the student email and group before sending';end if;
  select * into m from public.academy_classroom_memberships where academy_id=p_academy_id and contact_id=contact and classroom_id=classroom for update;
  if m.id is not null and(m.role<>'student' or m.status not in('invited','active','trial','paused') or m.user_id is distinct from uid and m.user_id is not null) then
   raise exception using errcode='23505',message='Ask the academy to check this group enrollment';end if;
  if m.id is null then insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,status,metadata)
   values(p_academy_id,classroom,contact,'student','invited',jsonb_build_object('source','access_invitation','created_by',p_actor_id));end if;
 else
  if lower(trim(fresh->'guardian'->>'email')) is distinct from email_value or fresh->'guardian'->>'status' not in('invited','verified')
   or fresh->'relationship'->>'status' not in('pending','active') or fresh->'relationship'->>'consent_status' not in('pending','granted')
   or(fresh->'relationship'->>'consent_expires_at')::timestamptz<=clock_timestamp() then
   raise exception using errcode='23505',message='Parent access was stopped or needs a new consent request';end if;
 end if;
 if p_action='create_access_invitation' then
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and invite_kind=kind and email=email_value and status='pending'
   and(case when kind='student' then contact_id=contact and classroom_id=classroom else guardian_relationship_id=relationship end) for update;
 else select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=iv.id for update;end if;
 if iv.id is not null and iv.status<>'pending' then raise exception using errcode='23505',message='This invitation is no longer pending';end if;
 if iv.id is null then
  insert into public.academy_access_invitations(academy_id,invite_kind,email,contact_id,classroom_id,guardian_relationship_id,token_hash,token_expires_at,created_by,metadata)
   values(p_academy_id,kind,email_value,case when kind='student' then contact end,case when kind='student' then classroom end,case when kind='guardian' then relationship end,
    p_token_hash,clock_timestamp()+interval '7 days',p_actor_id,'{"source":"academy_workspace","command_version":"learner-v1"}') returning * into iv;
 else
  update public.academy_access_invitations set token_hash=p_token_hash,token_expires_at=clock_timestamp()+interval '7 days',delivery_status='queued',delivery_error=null,
   delivery_attempt_id=null,delivery_actor_id=null,delivery_lease_until=null,resend_count=resend_count+1,last_resent_at=clock_timestamp(),updated_at=clock_timestamp()
   where academy_id=p_academy_id and id=iv.id returning * into iv;
 end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,case when p_action='create_access_invitation' then 'access.invitation_created' else 'access.invitation_resent' end,
   'academy_access_invitation',iv.id::text,jsonb_build_object('invite_kind',kind,'contact_id',fresh->'contact'->>'id','classroom_id',classroom,'relationship_id',relationship));
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not public.academy_learner_invitation_covers(auths,fresh) then raise exception using errcode='42501',message='Your invitation permissions changed';end if;
 insert into public.academy_learner_invitation_receipts(academy_id,actor_id,request_key,action,payload,result)
  values(p_academy_id,p_actor_id,key_value,'prepare',identity,jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id'));
 return jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',false,'deliver',true);
end;$$;
revoke all on function public.academy_learner_invitation_prepare(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.academy_learner_invitation_prepare(uuid,uuid,text,jsonb,text,text) to service_role;

create or replace function public.academy_authorize_learner_invitation(p_academy uuid,p_actor uuid,p_invitation public.academy_access_invitations)
returns jsonb language plpgsql set search_path=public as $$
declare auths jsonb;t jsonb;fresh jsonb;uids uuid[];uid uuid;
begin
 auths:=public.academy_current_authorities(p_academy,p_actor);
 t:=public.academy_learner_invitation_resources(p_academy,p_invitation.invite_kind,p_invitation.contact_id,p_invitation.classroom_id,p_invitation.guardian_relationship_id);
 if not public.academy_learner_invitation_covers(auths,t) then raise exception using errcode='42501',message='You do not have permission to manage this invitation';end if;
 uids:=array(select distinct a.id from auth.users a where a.id in((t->'contact'->>'user_id')::uuid,(t->'guardian'->>'user_id')::uuid)
  or(lower(trim(a.email))=lower(trim(p_invitation.email)) and a.email_confirmed_at is not null));
 perform 1 from auth.users where id=any(uids) order by id for share;
 perform 1 from public.users where id=any(uids) order by id for share;
 perform 1 from public.academy_contacts where academy_id=p_academy and id=(t->'contact'->>'id')::uuid for share;
 perform 1 from public.academy_classrooms c where c.academy_id=p_academy and(c.id=p_invitation.classroom_id or exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy and m.contact_id=(t->'contact'->>'id')::uuid and m.classroom_id=c.id)) order by c.id for share;
 perform 1 from public.academy_classroom_memberships where academy_id=p_academy and contact_id=(t->'contact'->>'id')::uuid order by id for share;
 if p_invitation.invite_kind='guardian' then
  perform 1 from public.academy_guardians where academy_id=p_academy and id=(t->'guardian'->>'id')::uuid for share;
  perform 1 from public.academy_student_guardian_relationships where academy_id=p_academy and id=p_invitation.guardian_relationship_id for share;
 end if;
 fresh:=public.academy_learner_invitation_resources(p_academy,p_invitation.invite_kind,p_invitation.contact_id,p_invitation.classroom_id,p_invitation.guardian_relationship_id);
 auths:=public.academy_current_authorities(p_academy,p_actor);
 if not public.academy_learner_invitation_covers(auths,fresh) then raise exception using errcode='42501',message='Your invitation permissions changed';end if;
 uid:=(case when p_invitation.invite_kind='student' then fresh->'contact'->>'user_id' else fresh->'guardian'->>'user_id' end)::uuid;
 if uid is not null and not(uid=any(uids)) then raise exception using errcode='23505',message='The linked account changed. Check the invitation again';end if;
 return fresh;
end;$$;
revoke all on function public.academy_authorize_learner_invitation(uuid,uuid,public.academy_access_invitations) from public,anon,authenticated,service_role;

create or replace function public.academy_learner_invitation_revoke(p_academy_id uuid,p_actor_id uuid,p_invitation_id uuid,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;receipt public.academy_learner_invitation_receipts;identity jsonb;key_value text;t jsonb;result jsonb;
begin
 perform 1 from auth.users where id=p_actor_id for share;
 perform pg_advisory_xact_lock(hashtextextended('academy:learner-invitation:'||p_academy_id::text,0));
 key_value:=coalesce(nullif(trim(p_request_key),''),gen_random_uuid()::text);
 if length(key_value)>160 or key_value !~ '^[A-Za-z0-9_.:-]+$' then raise exception using errcode='22023',message='Choose a valid request key';end if;
 identity:=jsonb_build_object('invitation_id',p_invitation_id);
 select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id and invite_kind in('student','guardian');
 if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
 t:=public.academy_authorize_learner_invitation(p_academy_id,p_actor_id,iv);
 select * into receipt from public.academy_learner_invitation_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=key_value;
 if found then
  if receipt.action<>'revoke' or receipt.payload<>identity then raise exception using errcode='23505',message='This request key was used for different invitation details';end if;
  return receipt.result||jsonb_build_object('replayed',true);end if;
 select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id for update;
 if iv.status<>'pending' then raise exception using errcode='23505',message='Only pending invitations can be withdrawn';end if;
 -- Withdraw only this pending link. Existing enrollment, account bindings and
 -- any previously granted parent consent are independent records.
 update public.academy_access_invitations set status='revoked',revoked_by=p_actor_id,revoked_at=clock_timestamp(),delivery_attempt_id=null,
  delivery_actor_id=null,delivery_lease_until=null,updated_at=clock_timestamp() where academy_id=p_academy_id and id=p_invitation_id returning * into iv;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'access.invitation_revoked','academy_access_invitation',iv.id::text,jsonb_build_object('invite_kind',iv.invite_kind));
 perform public.academy_authorize_learner_invitation(p_academy_id,p_actor_id,iv);
 result:=jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','replayed',false);
 insert into public.academy_learner_invitation_receipts(academy_id,actor_id,request_key,action,payload,result) values(p_academy_id,p_actor_id,key_value,'revoke',identity,result);
 return result;
end;$$;
revoke all on function public.academy_learner_invitation_revoke(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_learner_invitation_revoke(uuid,uuid,uuid,text) to service_role;

create or replace function public.academy_learner_invitation_delivery(p_academy_id uuid,p_actor_id uuid,p_invitation_id uuid,p_token_hash text,p_action text,p_attempt_id uuid default null,p_sent boolean default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare iv public.academy_access_invitations;ticket public.academy_learner_invitation_receipts;finished public.academy_learner_invitation_receipts;
 t jsonb;attempt uuid;payload jsonb;now_at timestamptz;updated boolean;result jsonb;m public.academy_classroom_memberships;uid uuid;
begin
 if p_action not in('claim','finish') or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Choose a valid delivery attempt';end if;
 if p_action='claim' then
  perform 1 from auth.users where id=p_actor_id for share;
  perform pg_advisory_xact_lock(hashtextextended('academy:learner-invitation:'||p_academy_id::text,0));
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id and invite_kind in('student','guardian');
  if not found then raise exception using errcode='P0002',message='Invitation not found';end if;
  t:=public.academy_authorize_learner_invitation(p_academy_id,p_actor_id,iv);
  if iv.invite_kind='student' then
   select * into m from public.academy_classroom_memberships where academy_id=p_academy_id and classroom_id=iv.classroom_id and contact_id=iv.contact_id;
   if t->'classroom'->>'is_active' is distinct from 'true' or m.id is null or m.role<>'student' or m.status not in('invited','active','trial','paused')
    or m.user_id is not null and m.user_id is distinct from (t->'contact'->>'user_id')::uuid
    or nullif(trim(t->'contact'->>'email'),'') is not null and lower(trim(t->'contact'->>'email'))<>lower(trim(iv.email)) then
    raise exception using errcode='23505',message='Check the student email and group before sending';end if;
  end if;
  uid:=(case when iv.invite_kind='student' then t->'contact'->>'user_id' else t->'guardian'->>'user_id' end)::uuid;
  if uid is not null and not exists(select 1 from auth.users a join public.users u on u.id=a.id and u.is_active
   where a.id=uid and lower(trim(a.email))=lower(trim(iv.email)) and a.email_confirmed_at is not null and a.deleted_at is null
    and(a.banned_until is null or a.banned_until<=clock_timestamp())) then
   raise exception using errcode='23505',message='Ask the academy to check the account linked to this record';end if;
  if t->'contact'->>'status' not in('active','trial','paused') or iv.invite_kind='guardian' and(lower(trim(t->'guardian'->>'email')) is distinct from lower(trim(iv.email))
   or t->'guardian'->>'status' not in('invited','verified') or t->'relationship'->>'status' not in('pending','active')
   or t->'relationship'->>'consent_status' not in('pending','granted') or(t->'relationship'->>'consent_expires_at')::timestamptz<=clock_timestamp()) then
   raise exception using errcode='23505',message='This invitation needs a staff review before sending';end if;
  select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id for update;
  now_at:=clock_timestamp();
  if iv.status<>'pending' or iv.token_hash<>p_token_hash or iv.token_expires_at<=now_at or iv.delivery_status='sent'
   or iv.delivery_lease_until>now_at then
   return jsonb_build_object('claimed',false,'invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id');end if;
  attempt:=gen_random_uuid();
  update public.academy_access_invitations set delivery_attempt_id=attempt,delivery_actor_id=p_actor_id,delivery_lease_until=now_at+interval '2 minutes',delivery_status='queued',delivery_error=null,
   updated_at=now_at where academy_id=p_academy_id and id=p_invitation_id returning * into iv;
  perform public.academy_authorize_learner_invitation(p_academy_id,p_actor_id,iv);
  payload:=jsonb_build_object('invitation_id',iv.id,'token_hash',p_token_hash);
  insert into public.academy_learner_invitation_receipts(academy_id,actor_id,request_key,action,payload,result)
   values(p_academy_id,p_actor_id,'delivery:'||attempt::text,'delivery_claim',payload,jsonb_build_object('attempt_id',attempt,'lease_until',iv.delivery_lease_until));
  return jsonb_build_object('claimed',true,'attempt_id',attempt,'invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id');
 end if;
 if p_attempt_id is null or p_sent is null then raise exception using errcode='22023',message='A delivery result is required';end if;
 payload:=jsonb_build_object('invitation_id',p_invitation_id,'token_hash',p_token_hash,'sent',p_sent);
 select * into ticket from public.academy_learner_invitation_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key='delivery:'||p_attempt_id::text for update;
 if not found or ticket.action<>'delivery_claim' or ticket.payload is distinct from payload-'sent' then raise exception using errcode='42501',message='This delivery belongs to another request';end if;
 select * into finished from public.academy_learner_invitation_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key='delivery-finish:'||p_attempt_id::text for update;
 if found then
  if finished.payload is distinct from payload then raise exception using errcode='23505',message='This delivery result was already recorded differently';end if;
  return finished.result||jsonb_build_object('replayed',true);end if;
 update public.academy_access_invitations set delivery_status=case when p_sent then 'sent' else 'failed' end,
  delivery_error=case when p_sent then null else 'Email delivery could not be confirmed. Retry this invitation.' end,
  sent_at=case when p_sent then clock_timestamp() else sent_at end,delivery_lease_until=null,updated_at=clock_timestamp()
  where academy_id=p_academy_id and id=p_invitation_id and invite_kind in('student','guardian') and status='pending' and token_hash=p_token_hash
   and delivery_attempt_id=p_attempt_id and delivery_actor_id=p_actor_id returning * into iv;
 updated:=found;
 if not updated then select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=p_invitation_id;
  if not found then raise exception using errcode='P0002',message='Invitation no longer exists';end if;end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_academy_id,p_actor_id,'access.invitation_delivery','academy_access_invitation',iv.id::text,
   jsonb_build_object('invite_kind',iv.invite_kind,'attempt_id',p_attempt_id,'provider_accepted',p_sent,'updated',updated));
 result:=jsonb_build_object('invitation',to_jsonb(iv)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id','updated',updated,'replayed',false);
 insert into public.academy_learner_invitation_receipts(academy_id,actor_id,request_key,action,payload,result)
  values(p_academy_id,p_actor_id,'delivery-finish:'||p_attempt_id::text,'delivery_finish',payload,result);
 return result;
end;$$;
revoke all on function public.academy_learner_invitation_delivery(uuid,uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.academy_learner_invitation_delivery(uuid,uuid,uuid,text,text,uuid,boolean) to service_role;

create or replace function public.academy_learner_invitation_contact_allowed(p_academy uuid,p_authorities jsonb,p_kind text,p_contact uuid)
returns boolean language sql stable set search_path=public as $$
 select exists(select 1 from public.academy_contacts c cross join jsonb_array_elements(p_authorities) a
  where c.academy_id=p_academy and c.id=p_contact and public.academy_learner_invitation_role_has(a->>'role',p_kind) and case a->>'scope_type'
   when 'academy' then true
   when 'students' then a->'scope_ids' @> jsonb_build_array(c.id)
   when 'branches' then a->'scope_ids' @> jsonb_build_array(c.primary_branch_id) or exists(select 1 from public.academy_classroom_memberships m
    join public.academy_classrooms k on k.academy_id=m.academy_id and k.id=m.classroom_id where m.academy_id=p_academy and m.contact_id=c.id
     and m.role='student' and m.status in('active','trial','invited','paused') and a->'scope_ids' @> jsonb_build_array(k.branch_id))
   when 'classrooms' then exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy and m.contact_id=c.id
    and m.role='student' and m.status in('active','trial','invited','paused') and a->'scope_ids' @> jsonb_build_array(m.classroom_id))
   else false end);
$$;
revoke all on function public.academy_learner_invitation_contact_allowed(uuid,jsonb,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_learner_invitation_directory(p_academy_id uuid,p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare auths jsonb;rows jsonb;mode text;page_limit integer;after_id uuid;result jsonb;has_more boolean;ids uuid[];contacts uuid[];item jsonb;iv public.academy_access_invitations;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Choose a valid invitation list';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 mode:=coalesce(p_payload->>'mode','invitations');page_limit:=greatest(1,least(300,coalesce((p_payload->>'limit')::integer,100)));after_id:=(p_payload->>'after_id')::uuid;
 if mode='invitations' then
  with eligible as (
   select i.* from public.academy_access_invitations i where i.academy_id=p_academy_id and i.invite_kind in('student','guardian')
    and public.academy_learner_invitation_contact_allowed(p_academy_id,auths,i.invite_kind,coalesce(i.contact_id,
     (select r.contact_id from public.academy_student_guardian_relationships r where r.academy_id=i.academy_id and r.id=i.guardian_relationship_id)))
    and public.academy_learner_invitation_covers(auths,public.academy_learner_invitation_resources(p_academy_id,i.invite_kind,i.contact_id,i.classroom_id,i.guardian_relationship_id))
    and(after_id is null or i.id>after_id) order by i.id limit page_limit+1
  ) select coalesce(jsonb_agg(to_jsonb(e)-'token_hash'-'metadata'-'delivery_attempt_id'-'delivery_lease_until'-'delivery_actor_id' order by id),'[]') into rows from eligible e;
 elsif mode='contacts' then
  select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') into rows from(
   select c.id,c.academy_id,c.first_name,c.last_name,c.email,c.status,c.primary_branch_id from public.academy_contacts c where c.academy_id=p_academy_id
    and c.status in('active','trial','paused') and(after_id is null or c.id>after_id)
    and(public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'student',c.id) or public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'guardian',c.id))
    order by c.id limit page_limit+1) e;
 elsif mode='classrooms' then
  select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') into rows from(
   select c.id,c.academy_id,c.name,c.is_active,c.branch_id from public.academy_classrooms c where c.academy_id=p_academy_id and c.is_active and(after_id is null or c.id>after_id)
    and exists(select 1 from jsonb_array_elements(auths) a where public.academy_learner_invitation_role_has(a->>'role','student') and case a->>'scope_type'
     when 'academy' then true when 'branches' then a->'scope_ids' @> jsonb_build_array(c.branch_id) when 'classrooms' then a->'scope_ids' @> jsonb_build_array(c.id)
     when 'students' then exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.classroom_id=c.id and m.role='student'
      and m.status in('active','trial','invited','paused') and a->'scope_ids' @> jsonb_build_array(m.contact_id)) else false end)
    order by c.id limit page_limit+1) e;
 elsif mode='relationships' then
  select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') into rows from(
   select r.id,r.academy_id,r.contact_id,r.guardian_id,r.relationship_type,r.status from public.academy_student_guardian_relationships r
    join public.academy_contacts c on c.academy_id=r.academy_id and c.id=r.contact_id join public.academy_guardians g on g.academy_id=r.academy_id and g.id=r.guardian_id
    where r.academy_id=p_academy_id and r.status in('pending','active') and r.consent_status in('pending','granted') and(r.consent_expires_at is null or r.consent_expires_at>clock_timestamp())
     and c.status in('active','trial','paused') and g.status in('invited','verified') and(after_id is null or r.id>after_id)
     and public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'guardian',r.contact_id) order by r.id limit page_limit+1) e;
 elsif mode='guardians' then
  select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') into rows from(
   select g.id,g.academy_id,g.full_name,g.email,g.status from public.academy_guardians g where g.academy_id=p_academy_id and g.status in('invited','verified') and(after_id is null or g.id>after_id)
    and exists(select 1 from public.academy_student_guardian_relationships r join public.academy_contacts c on c.academy_id=r.academy_id and c.id=r.contact_id
     where r.academy_id=g.academy_id and r.guardian_id=g.id and r.status in('pending','active') and r.consent_status in('pending','granted')
      and(r.consent_expires_at is null or r.consent_expires_at>clock_timestamp()) and c.status in('active','trial','paused')
      and public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'guardian',r.contact_id)) order by g.id limit page_limit+1) e;
 else raise exception using errcode='22023',message='Choose a valid invitation list';end if;
 ids:=array(select (value->>'id')::uuid from jsonb_array_elements(rows));
 if mode='contacts' then contacts:=ids;
 elsif mode='classrooms' then contacts:=array(select m.contact_id from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.classroom_id=any(ids));
 elsif mode='relationships' then contacts:=array(select r.contact_id from public.academy_student_guardian_relationships r where r.academy_id=p_academy_id and r.id=any(ids));
 elsif mode='guardians' then contacts:=array(select r.contact_id from public.academy_student_guardian_relationships r where r.academy_id=p_academy_id and r.guardian_id=any(ids));
 elsif mode='invitations' then contacts:=array(select coalesce(i.contact_id,r.contact_id) from public.academy_access_invitations i
  left join public.academy_student_guardian_relationships r on r.academy_id=i.academy_id and r.id=i.guardian_relationship_id where i.academy_id=p_academy_id and i.id=any(ids));end if;
 perform 1 from public.academy_contacts where academy_id=p_academy_id and id=any(contacts) order by id for share;
 perform 1 from public.academy_classroom_memberships where academy_id=p_academy_id and contact_id=any(contacts) order by id for share;
 perform 1 from public.academy_classrooms c where c.academy_id=p_academy_id and(mode='classrooms' and c.id=any(ids)
  or exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.contact_id=any(contacts) and m.classroom_id=c.id)) order by c.id for share;
 if mode in('invitations','relationships','guardians') then
  perform 1 from public.academy_guardians g where g.academy_id=p_academy_id and(mode='guardians' and g.id=any(ids)
   or exists(select 1 from public.academy_student_guardian_relationships r where r.academy_id=p_academy_id and r.contact_id=any(contacts) and r.guardian_id=g.id)) order by g.id for share;
  perform 1 from public.academy_student_guardian_relationships where academy_id=p_academy_id and contact_id=any(contacts) order by id for share;
 end if;
 if mode='invitations' then perform 1 from public.academy_access_invitations where academy_id=p_academy_id and id=any(ids) order by id for share;end if;
 for item in select value from jsonb_array_elements(rows) loop
  if mode='invitations' then
   select * into iv from public.academy_access_invitations where academy_id=p_academy_id and id=(item->>'id')::uuid;
   if not public.academy_learner_invitation_covers(auths,public.academy_learner_invitation_resources(p_academy_id,iv.invite_kind,iv.contact_id,iv.classroom_id,iv.guardian_relationship_id)) then
    raise exception using errcode='42501',message='The invitation list changed. Refresh it';end if;
  elsif mode='contacts' and not(public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'student',(item->>'id')::uuid)
    or public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'guardian',(item->>'id')::uuid)) then
   raise exception using errcode='42501',message='The student list changed. Refresh it';
  elsif mode='relationships' and not public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'guardian',(item->>'contact_id')::uuid) then
   raise exception using errcode='42501',message='The parent list changed. Refresh it';
  elsif mode='classrooms' and not exists(select 1 from public.academy_classrooms c cross join jsonb_array_elements(auths) a
   where c.academy_id=p_academy_id and c.id=(item->>'id')::uuid and c.is_active and public.academy_learner_invitation_role_has(a->>'role','student') and case a->>'scope_type'
    when 'academy' then true when 'branches' then a->'scope_ids' @> jsonb_build_array(c.branch_id) when 'classrooms' then a->'scope_ids' @> jsonb_build_array(c.id)
    when 'students' then exists(select 1 from public.academy_classroom_memberships m where m.academy_id=p_academy_id and m.classroom_id=c.id and m.role='student'
     and m.status in('active','trial','invited','paused') and a->'scope_ids' @> jsonb_build_array(m.contact_id)) else false end) then
   raise exception using errcode='42501',message='The group list changed. Refresh it';
  elsif mode='guardians' and not exists(select 1 from public.academy_guardians g join public.academy_student_guardian_relationships r on r.academy_id=g.academy_id and r.guardian_id=g.id
   join public.academy_contacts c on c.academy_id=r.academy_id and c.id=r.contact_id where g.academy_id=p_academy_id and g.id=(item->>'id')::uuid
    and g.status in('invited','verified') and r.status in('pending','active') and r.consent_status in('pending','granted') and(r.consent_expires_at is null or r.consent_expires_at>clock_timestamp())
    and c.status in('active','trial','paused') and public.academy_learner_invitation_contact_allowed(p_academy_id,auths,'guardian',r.contact_id)) then
   raise exception using errcode='42501',message='The parent list changed. Refresh it';
  end if;
 end loop;
 has_more:=jsonb_array_length(rows)>page_limit;
 if has_more then select jsonb_agg(value order by ord) into rows from jsonb_array_elements(rows) with ordinality p(value,ord) where ord<=page_limit;end if;
 result:=jsonb_build_object(mode,rows,'has_more',has_more,'cursor',case when has_more then jsonb_build_object('after_id',rows->(jsonb_array_length(rows)-1)->>'id') end);
 -- Reads never reuse another request's cached display role. A lease that
 -- expires while building the page cannot publish the protected result.
 if auths is distinct from public.academy_current_authorities(p_academy_id,p_actor_id) then raise exception using errcode='42501',message='Your invitation permissions changed';end if;
 return result;
end;$$;
revoke all on function public.academy_learner_invitation_directory(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_learner_invitation_directory(uuid,uuid,jsonb) to service_role;

commit;
