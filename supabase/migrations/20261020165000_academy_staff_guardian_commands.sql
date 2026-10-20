begin;
create table public.academy_staff_guardian_receipts(
 academy_id uuid not null references public.tenants(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete cascade,
 request_key text not null check(length(request_key) between 1 and 180),
 command text not null,payload jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(academy_id,actor_id,request_key)
);
alter table public.academy_staff_guardian_receipts enable row level security;
revoke all on public.academy_staff_guardian_receipts from public,anon,authenticated;
grant all on public.academy_staff_guardian_receipts to service_role;

create or replace function public.academy_staff_guardian_command(p_academy_id uuid,p_actor_id uuid,p_command text,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='25s' as $$
declare auths jsonb;scope jsonb;cap text;relation_id uuid;guardian_id_value uuid;contact_value uuid;initial_guardian_user uuid;
 r public.academy_student_guardian_relationships;g public.academy_guardians;initial_r public.academy_student_guardian_relationships;
 previous public.academy_staff_guardian_receipts;result jsonb;saved jsonb;event_value text;channel_value text;target_value uuid;reason_value text;locale_value text;zone text;field text;
begin
 if p_command not in('create_guardian_relationship','issue_guardian_link','revoke_guardian_relationship','upsert_guardian_preferences','send_guardian_message','queue_guardian_notification')
  or jsonb_typeof(p_payload) is distinct from 'object' or coalesce(length(trim(p_request_key)),0) not between 1 and 180 then raise exception using errcode='22023',message='Review the parent action and retry key';end if;
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 cap:=case when p_command in('send_guardian_message','queue_guardian_notification') then 'communicateGuardians' else 'manageGuardians' end;
 perform pg_advisory_xact_lock(hashtextextended('staff-parent-command:'||p_academy_id::text||':'||p_actor_id::text||':'||p_request_key,0));
 if p_command='create_guardian_relationship' then contact_value:=nullif(p_payload->>'contact_id','')::uuid;
 else
  relation_id:=nullif(p_payload->>'relationship_id','')::uuid;
  guardian_id_value:=nullif(p_payload->>'guardian_id','')::uuid;
  if relation_id is null and p_command='upsert_guardian_preferences' then
   -- Preferences apply to the guardian's entire institution. Academy-wide
   -- management is required to avoid changing another branch's preferences.
   if not public.academy_command_covers(auths,cap,'{"kind":"academy"}') then raise exception using errcode='42501',message='Current access does not cover these shared parent preferences';end if;
   select id into relation_id from public.academy_student_guardian_relationships where academy_id=p_academy_id and guardian_id=guardian_id_value order by id limit 1;
  end if;
  select * into initial_r from public.academy_student_guardian_relationships where academy_id=p_academy_id and id=relation_id;
  if initial_r.id is null then raise exception using errcode='42501',message='This parent relationship is not available';end if;
  contact_value:=initial_r.contact_id;
  select * into g from public.academy_guardians where academy_id=p_academy_id and id=initial_r.guardian_id;
  initial_guardian_user:=g.user_id;
  if g.user_id is not null and p_command in('send_guardian_message','queue_guardian_notification','issue_guardian_link') then perform public.academy_guardian_assert_actor(g.user_id);end if;
 end if;
 scope:=public.academy_command_resource(p_academy_id,'contact',contact_value);
 if not public.academy_command_covers(auths,cap,scope) then raise exception using errcode='42501',message='Current access does not cover this student';end if;
 if p_command<>'create_guardian_relationship' then
  select * into g from public.academy_guardians where academy_id=p_academy_id and id=initial_r.guardian_id for share;
  select * into r from public.academy_student_guardian_relationships where academy_id=p_academy_id and id=relation_id for update;
  if g.user_id is distinct from initial_guardian_user then raise exception using errcode='23505',message='The parent account binding changed';end if;
  if row(r.contact_id,r.guardian_id) is distinct from row(initial_r.contact_id,initial_r.guardian_id) then raise exception using errcode='23505',message='The parent relationship changed';end if;
  if p_command in('send_guardian_message','queue_guardian_notification') and(r.status<>'active' or r.consent_status<>'granted' or g.status<>'verified'
    or(r.consent_expires_at is not null and r.consent_expires_at<=clock_timestamp())) then raise exception using errcode='42501',message='Current parent consent is required';end if;
  if p_command='issue_guardian_link' and r.status not in('pending','active') then raise exception using errcode='42501',message='This parent relationship cannot receive an invitation';end if;
  if p_command='send_guardian_message' and not r.can_view_messages then raise exception using errcode='42501',message='Parent messages are not shared';end if;
 end if;
 select * into previous from public.academy_staff_guardian_receipts where academy_id=p_academy_id and actor_id=p_actor_id and request_key=p_request_key;
 if found then
  if previous.command<>p_command or previous.payload is distinct from p_payload then raise exception using errcode='23505',message='This retry key belongs to another parent action';end if;
  return previous.result||'{"replayed":true}';
 end if;
 if p_command='create_guardian_relationship' then
  if coalesce(length(trim(p_payload->>'full_name')),0) not between 1 and 180 or(nullif(trim(p_payload->>'phone'),'') is null and nullif(trim(p_payload->>'email'),'') is null)
   or coalesce(p_payload->>'relationship_type','') not in('mother','father','guardian','sponsor','emergency_contact','other') then raise exception using errcode='22023',message='Choose a parent name, contact and relationship';end if;
  result:=public.academy_create_guardian_relationship(p_academy_id,p_actor_id,p_payload-'user_id'-'telegram_user_id'-'telegram_chat_id');
  relation_id:=(result->'relationship'->>'id')::uuid;
 elsif p_command='issue_guardian_link' then
  if coalesce(p_payload->>'purpose','telegram_guardian_link') not in('telegram_guardian_link','web_guardian_link') then raise exception using errcode='22023',message='Choose a valid invitation type';end if;
  result:=jsonb_build_object('link',public.academy_issue_guardian_link(p_academy_id,r.id,p_actor_id,clock_timestamp()+make_interval(hours=>least(greatest(coalesce((p_payload->>'expires_in_hours')::integer,72),1),720)),coalesce(p_payload->>'purpose','telegram_guardian_link')));
 elsif p_command='revoke_guardian_relationship' then
  reason_value:=trim(p_payload->>'reason');if coalesce(length(reason_value),0) not between 1 and 1000 then raise exception using errcode='22023',message='A revocation reason is required';end if;
  result:=jsonb_build_object('relationship',public.academy_revoke_guardian_relationship(p_academy_id,r.id,p_actor_id,reason_value));
 elsif p_command='send_guardian_message' then
  if coalesce(length(trim(p_payload->>'body')),0) not between 1 and 5000 then raise exception using errcode='22023',message='Write a message of up to 5,000 characters';end if;
  insert into public.academy_guardian_messages(academy_id,relationship_id,direction,sender_user_id,body,status,channel)
   values(p_academy_id,r.id,'academy_to_guardian',p_actor_id,trim(p_payload->>'body'),'sent','inapp') returning id,to_jsonb(academy_guardian_messages) into target_value,saved;
  result:=jsonb_build_object('message',saved);
 elsif p_command='upsert_guardian_preferences' then
  if guardian_id_value is distinct from g.id or not public.academy_command_covers(auths,cap,'{"kind":"academy"}') then raise exception using errcode='42501',message='Current access does not cover shared parent preferences';end if;
  event_value:=coalesce(nullif(trim(p_payload->>'event_type'),''),'*');locale_value:=coalesce(nullif(p_payload->>'locale',''),'uz');zone:=coalesce(nullif(p_payload->>'timezone',''),'Asia/Tashkent');
  if length(event_value)>80 or locale_value not in('uz','ru','en') or not exists(select 1 from pg_timezone_names where name=zone) then raise exception using errcode='22023',message='Choose a valid notification type, language and timezone';end if;
  foreach field in array array['enabled','inapp_enabled','telegram_enabled','email_enabled','sms_enabled','allow_critical_override'] loop
   if p_payload?field and jsonb_typeof(p_payload->field)<>'boolean' then raise exception using errcode='22023',message='Notification switches must be yes or no';end if;
  end loop;
  insert into public.academy_guardian_notification_preferences(academy_id,guardian_id,event_type,enabled,inapp_enabled,telegram_enabled,email_enabled,sms_enabled,locale,timezone,quiet_hours_start,quiet_hours_end,allow_critical_override)
   values(p_academy_id,g.id,event_value,coalesce((p_payload->>'enabled')::boolean,true),coalesce((p_payload->>'inapp_enabled')::boolean,true),coalesce((p_payload->>'telegram_enabled')::boolean,true),coalesce((p_payload->>'email_enabled')::boolean,false),coalesce((p_payload->>'sms_enabled')::boolean,false),locale_value,zone,nullif(p_payload->>'quiet_hours_start','')::time,nullif(p_payload->>'quiet_hours_end','')::time,coalesce((p_payload->>'allow_critical_override')::boolean,true))
   on conflict(academy_id,guardian_id,event_type) do update set enabled=excluded.enabled,inapp_enabled=excluded.inapp_enabled,telegram_enabled=excluded.telegram_enabled,email_enabled=excluded.email_enabled,sms_enabled=excluded.sms_enabled,locale=excluded.locale,timezone=excluded.timezone,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,allow_critical_override=excluded.allow_critical_override,updated_at=clock_timestamp()
   returning id,to_jsonb(academy_guardian_notification_preferences) into target_value,saved;
  result:=jsonb_build_object('preference',saved);
 else
  event_value:=trim(p_payload->>'event_key');channel_value:=coalesce(p_payload->>'channel','telegram');
  if not public.academy_guardian_notification_visible(to_jsonb(r),event_value) then raise exception using errcode='42501',message='This notification is not shared with this parent';end if;
  if channel_value not in('inapp','telegram','email','sms') or coalesce(length(trim(p_payload->>'body')),0) not between 1 and 5000
    or coalesce(length(trim(p_payload->>'dedupe_key')),0) not between 1 and 180 then raise exception using errcode='22023',message='Choose a channel, message and notification key';end if;
  -- Destination, current preferences, verified channel and quiet hours are
  -- decided by the dispatch claim, never trusted from browser payloads.
  insert into public.academy_notifications(academy_id,contact_id,guardian_id,relationship_id,event_key,dedupe_key,channel,type,title,body,status,scheduled_at,critical_override)
   values(p_academy_id,r.contact_id,r.guardian_id,r.id,event_value,trim(p_payload->>'dedupe_key'),channel_value,event_value,nullif(trim(p_payload->>'title'),''),trim(p_payload->>'body'),'queued',coalesce(nullif(p_payload->>'scheduled_at','')::timestamptz,clock_timestamp()),coalesce((p_payload->>'critical')::boolean,false))
   on conflict(academy_id,dedupe_key) where dedupe_key is not null do nothing returning id,to_jsonb(academy_notifications) into target_value,saved;
  if not found then
   select id,to_jsonb(n) into target_value,saved from public.academy_notifications n where academy_id=p_academy_id and dedupe_key=trim(p_payload->>'dedupe_key') for update;
   if saved->>'relationship_id'<>r.id::text or saved->>'channel'<>channel_value or saved->>'body'<>trim(p_payload->>'body') or saved->>'event_key'<>event_value or saved->>'title' is distinct from nullif(trim(p_payload->>'title'),'') or(saved->>'critical_override')::boolean is distinct from coalesce((p_payload->>'critical')::boolean,false) then raise exception using errcode='23505',message='Notification key belongs to another message';end if;
  end if;
  result:=jsonb_build_object('notification',saved,'deduplicated',false);
 end if;
 -- Expiry can occur during a blocked write even while row locks are held.
 auths:=public.academy_current_authorities(p_academy_id,p_actor_id);
 if not public.academy_command_covers(auths,cap,scope) then raise exception using errcode='42501',message='Current access expired';end if;
 if p_command='upsert_guardian_preferences' and not public.academy_command_covers(auths,cap,'{"kind":"academy"}') then raise exception using errcode='42501',message='Shared parent preference authority expired';end if;
 if p_command in('send_guardian_message','queue_guardian_notification') and r.consent_expires_at<=clock_timestamp() then raise exception using errcode='42501',message='Parent consent expired';end if;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)
  values(p_academy_id,p_actor_id,'staff.'||p_command,'guardian_command',coalesce(target_value,relation_id)::text,contact_value,jsonb_build_object('relationship_id',relation_id));
 result:=result||jsonb_build_object('actor_id',p_actor_id,'replayed',false);
 insert into public.academy_staff_guardian_receipts(academy_id,actor_id,request_key,command,payload,result) values(p_academy_id,p_actor_id,p_request_key,p_command,p_payload,result);
 return result;
end;$$;
revoke all on function public.academy_staff_guardian_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_staff_guardian_command(uuid,uuid,text,jsonb,text) to service_role;
commit;
