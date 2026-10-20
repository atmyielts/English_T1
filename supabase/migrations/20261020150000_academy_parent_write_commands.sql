-- Parent commands hold current account/child/consent locks through the write,
-- audit and retry receipt. Existing parent reads and older pages remain valid.
begin;
set local lock_timeout='5s';

create table public.academy_parent_command_receipts(
 actor_id uuid not null references public.users(id) on delete cascade,
 request_key text not null check(length(request_key) between 1 and 180),
 command text not null, relationship_id uuid not null,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor_id,request_key)
);
alter table public.academy_parent_command_receipts enable row level security;
revoke all on public.academy_parent_command_receipts from public,anon,authenticated;
grant all on public.academy_parent_command_receipts to service_role;

create or replace function public.academy_parent_write_command(p_actor_id uuid,p_command text,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare graph jsonb; r public.academy_student_guardian_relationships; g public.academy_guardians; c public.academy_contacts;
 previous public.academy_parent_command_receipts; result jsonb; saved jsonb; target uuid; class_id uuid; charge_id uuid;
 message_text text; event_value text; relation_id uuid; field text; locale_value text; zone text;
begin
 if p_command not in('guardian_send_message','guardian_service_request_create','guardian_update_preferences')
  or jsonb_typeof(p_payload) is distinct from 'object' or nullif(trim(p_request_key),'') is null or length(p_request_key)>180 then
  raise exception using errcode='22023',message='Review the parent command and retry key';end if;
 perform public.academy_guardian_assert_actor(p_actor_id);
 -- Serialize an actor's retry identity before inspecting the receipt. Payloads
 -- exclude transport fields; the same key can never silently change the target.
 perform pg_advisory_xact_lock(hashtextextended('parent-command:'||p_actor_id::text||':'||p_request_key,0));
 relation_id:=nullif(p_payload->>'relationship_id','')::uuid;
 if relation_id is null and p_command='guardian_update_preferences' then
  select a.id into relation_id from public.academy_student_guardian_relationships a join public.academy_guardians b on b.id=a.guardian_id and b.academy_id=a.academy_id
   where b.id=nullif(p_payload->>'guardian_id','')::uuid and b.user_id=p_actor_id and b.status='verified'
    and a.status='active' and a.consent_status='granted' and(a.consent_expires_at is null or a.consent_expires_at>clock_timestamp()) order by a.id limit 1;
 end if;
 graph:=public.academy_guardian_relationship_for_actor(p_actor_id,relation_id);
 r:=jsonb_populate_record(null::public.academy_student_guardian_relationships,graph->'relationship');
 g:=jsonb_populate_record(null::public.academy_guardians,graph->'guardian');
 c:=jsonb_populate_record(null::public.academy_contacts,graph->'contact');
 if p_command='guardian_send_message' and not r.can_message_academy then raise exception using errcode='42501',message='Parent messaging is not authorized';end if;
 if p_command='guardian_update_preferences' and nullif(p_payload->>'guardian_id','')::uuid is distinct from g.id then raise exception using errcode='42501',message='Choose your own parent preferences';end if;
 select * into previous from public.academy_parent_command_receipts where actor_id=p_actor_id and request_key=p_request_key;
 if found then
  if previous.command<>p_command or previous.relationship_id<>r.id or previous.payload is distinct from p_payload then raise exception using errcode='23505',message='This retry key belongs to another parent command';end if;
  return previous.result||jsonb_build_object('replayed',true);
 end if;
 if p_command='guardian_send_message' then
  message_text:=trim(p_payload->>'body');
  if coalesce(length(message_text),0) not between 1 and 5000 then raise exception using errcode='22023',message='Write a message of up to 5,000 characters';end if;
  insert into public.academy_guardian_messages(academy_id,relationship_id,direction,sender_user_id,body,status,channel)
   values(r.academy_id,r.id,'guardian_to_academy',p_actor_id,message_text,'sent','inapp')
   returning id,to_jsonb(academy_guardian_messages)-'metadata'-'provider_message_id' into target,saved;
  result:=jsonb_build_object('message',saved);
 elsif p_command='guardian_service_request_create' then
  if coalesce(p_payload->>'request_type','') not in('make_up','freeze','transfer','refund','schedule_change','document','support','other')
   or coalesce(length(trim(p_payload->>'subject')),0) not between 1 and 200 or coalesce(length(trim(p_payload->>'details')),0) not between 1 and 5000 then
   raise exception using errcode='22023',message='Choose a request type, subject and details';end if;
  class_id:=nullif(p_payload->>'classroom_id','')::uuid;charge_id:=nullif(p_payload->>'charge_id','')::uuid;
  if class_id is not null then
   perform 1 from public.academy_classrooms where academy_id=r.academy_id and id=class_id for share;
   perform 1 from public.academy_classroom_memberships where academy_id=r.academy_id and classroom_id=class_id and contact_id=r.contact_id and role='student' and status in('active','paused','completed') for share;
   if not found then raise exception using errcode='42501',message='This group is not linked to your child';end if;
  end if;
  if charge_id is not null then
   if not r.can_view_payments then raise exception using errcode='42501',message='Payment information is not shared';end if;
   perform 1 from public.academy_charges where academy_id=r.academy_id and contact_id=r.contact_id and id=charge_id for share;
   if not found then raise exception using errcode='42501',message='This payment is not linked to your child';end if;
  end if;
  insert into public.academy_service_requests(academy_id,branch_id,requester_kind,requester_user_id,contact_id,guardian_id,classroom_id,charge_id,request_type,subject,details,desired_date,sla_due_at,metadata)
   values(r.academy_id,c.primary_branch_id,'guardian',p_actor_id,r.contact_id,r.guardian_id,class_id,charge_id,p_payload->>'request_type',trim(p_payload->>'subject'),trim(p_payload->>'details'),nullif(p_payload->>'desired_date','')::date,clock_timestamp()+interval '2 days',jsonb_build_object('source','guardian_portal','relationship_id',r.id))
   returning id,to_jsonb(academy_service_requests)-'metadata'-'assigned_to'-'resolved_by' into target,saved;
  insert into public.academy_service_request_events(academy_id,request_id,event_type,to_status,actor_user_id,note,visible_to_requester)
   values(r.academy_id,target,'submitted','submitted',p_actor_id,'Submitted by guardian',true);
  result:=jsonb_build_object('request',saved);
 else
  event_value:=coalesce(nullif(trim(p_payload->>'event_type'),''),'*');
  if length(event_value)>80 or(event_value<>'*' and not public.academy_guardian_notification_visible(to_jsonb(r),event_value)) then
   raise exception using errcode='22023',message='Choose a notification type shared with you';end if;
  locale_value:=coalesce(nullif(p_payload->>'locale',''),'uz');zone:=coalesce(nullif(p_payload->>'timezone',''),'Asia/Tashkent');
  if locale_value not in('uz','ru','en') or not exists(select 1 from pg_timezone_names where name=zone) then raise exception using errcode='22023',message='Choose a valid language and timezone';end if;
  foreach field in array array['enabled','inapp_enabled','telegram_enabled','email_enabled','sms_enabled','allow_critical_override'] loop
   if p_payload?field and jsonb_typeof(p_payload->field)<>'boolean' then raise exception using errcode='22023',message='Notification switches must be yes or no';end if;
  end loop;
  insert into public.academy_guardian_notification_preferences(academy_id,guardian_id,event_type,enabled,inapp_enabled,telegram_enabled,email_enabled,sms_enabled,locale,timezone,quiet_hours_start,quiet_hours_end,allow_critical_override)
   values(r.academy_id,g.id,event_value,coalesce((p_payload->>'enabled')::boolean,true),coalesce((p_payload->>'inapp_enabled')::boolean,true),coalesce((p_payload->>'telegram_enabled')::boolean,true),coalesce((p_payload->>'email_enabled')::boolean,false),coalesce((p_payload->>'sms_enabled')::boolean,false),locale_value,zone,nullif(p_payload->>'quiet_hours_start','')::time,nullif(p_payload->>'quiet_hours_end','')::time,coalesce((p_payload->>'allow_critical_override')::boolean,true))
   on conflict(academy_id,guardian_id,event_type) do update set enabled=excluded.enabled,inapp_enabled=excluded.inapp_enabled,telegram_enabled=excluded.telegram_enabled,email_enabled=excluded.email_enabled,sms_enabled=excluded.sms_enabled,locale=excluded.locale,timezone=excluded.timezone,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,allow_critical_override=excluded.allow_critical_override,updated_at=clock_timestamp()
   returning id,to_jsonb(academy_guardian_notification_preferences) into target,saved;
  result:=jsonb_build_object('preference',saved);
 end if;
 -- Check clock expiry again after all potentially blocking writes. A failure
 -- rolls back the business record, request event, audit and receipt together.
 perform public.academy_guardian_relationship_for_actor(p_actor_id,r.id);
 insert into public.academy_audit_events(academy_id,actor_user_id,actor_role,action,target_type,target_id,contact_id,metadata)
  values(r.academy_id,p_actor_id,'guardian',p_command,'parent_command',target::text,r.contact_id,jsonb_build_object('relationship_id',r.id));
 result:=result||jsonb_build_object('actor_id',p_actor_id,'relationship_id',r.id,'replayed',false);
 insert into public.academy_parent_command_receipts(actor_id,request_key,command,relationship_id,payload,result) values(p_actor_id,p_request_key,p_command,r.id,p_payload,result);
 return result;
end;$$;
revoke all on function public.academy_parent_write_command(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_parent_write_command(uuid,text,jsonb,text) to service_role;
commit;
