-- Parent delivery rechecks consent and the verified destination at dispatch.
-- A claimed external delivery is never automatically retried after ambiguity.
begin;
create or replace function public.academy_guardian_delivery_claim(p_notification_id uuid)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare n public.academy_notifications;initial public.academy_notifications;r public.academy_student_guardian_relationships;g public.academy_guardians;initial_user uuid;
 pref public.academy_guardian_notification_preferences;destination text;reason text;token uuid;local_now timestamp;until_time timestamp;defer_until timestamptz;override_allowed boolean;
begin
 select * into n from public.academy_notifications where id=p_notification_id;
 if not found or n.guardian_id is null or n.relationship_id is null then raise exception using errcode='22023',message='A parent notification is required';end if;
 initial:=n;
 select * into g from public.academy_guardians where academy_id=n.academy_id and id=n.guardian_id;
 initial_user:=g.user_id;
 if g.user_id is not null then
  perform 1 from auth.users where id=g.user_id and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
  if not found then reason:='parent_account_unavailable';end if;
  perform 1 from public.users where id=g.user_id and is_active for share;
  if not found then reason:='parent_account_unavailable';end if;
 end if;
 perform 1 from public.tenants where id=n.academy_id and(type='team' or metadata->>'service_family'='academy' or metadata->>'academy_service'='true' or metadata->>'center_owned'='true') for share;
 if not found then reason:='parent_academy_unavailable';end if;
 perform 1 from public.academy_contacts where academy_id=n.academy_id and id=n.contact_id and status in('active','trial','paused') for share;
 if not found then reason:='parent_student_unavailable';end if;
 select * into g from public.academy_guardians where academy_id=n.academy_id and id=n.guardian_id for share;
 select * into r from public.academy_student_guardian_relationships where academy_id=n.academy_id and id=n.relationship_id for share;
 perform 1 from public.academy_guardian_notification_preferences where academy_id=n.academy_id and guardian_id=n.guardian_id and event_type in(coalesce(n.event_key,n.type),'*') order by id for share;
 select * into pref from public.academy_guardian_notification_preferences where academy_id=n.academy_id and guardian_id=n.guardian_id and event_type in(coalesce(n.event_key,n.type),'*') order by(event_type=coalesce(n.event_key,n.type)) desc limit 1;
 select * into n from public.academy_notifications where id=p_notification_id for update;
 if row(n.academy_id,n.contact_id,n.guardian_id,n.relationship_id,n.channel,n.event_key,n.type,n.critical_override,n.title,n.body)
  is distinct from row(initial.academy_id,initial.contact_id,initial.guardian_id,initial.relationship_id,initial.channel,initial.event_key,initial.type,initial.critical_override,initial.title,initial.body)
  or g.user_id is distinct from initial_user then raise exception using errcode='23505',message='Parent delivery changed while awaiting current consent';end if;
 if n.status<>'queued' or n.scheduled_at>clock_timestamp() then return jsonb_build_object('outcome','unchanged','notification_id',n.id);end if;
 if g.id is null or g.status<>'verified' or r.id is null or r.guardian_id is distinct from g.id or r.contact_id is distinct from n.contact_id
  or r.status<>'active' or r.consent_status<>'granted' or(r.consent_expires_at is not null and r.consent_expires_at<=clock_timestamp()) then reason:='parent_consent_unavailable';end if;
 if not public.academy_guardian_notification_visible(to_jsonb(r),coalesce(n.event_key,n.type)) then reason:='parent_domain_not_shared';end if;
 override_allowed:=n.critical_override and coalesce(pref.allow_critical_override,true);
 if not override_allowed and(not coalesce(pref.enabled,true) or not coalesce((to_jsonb(pref)->>(n.channel||'_enabled'))::boolean,n.channel in('inapp','telegram'))) then reason:='parent_channel_disabled';end if;
 if n.channel='telegram' then
  if g.telegram_verified_at is null or g.telegram_user_id is null or g.telegram_chat_id is distinct from g.telegram_user_id then reason:='parent_telegram_not_verified';end if;
  destination:=g.telegram_chat_id;
 elsif n.channel='email' then
  if g.user_id is null or not exists(select 1 from auth.users a where a.id=g.user_id and a.email_confirmed_at is not null and lower(trim(a.email))=lower(trim(g.email)) and a.deleted_at is null) then reason:='parent_email_not_verified';end if;
  destination:=g.email;
 elsif n.channel='sms' then reason:='parent_sms_not_configured';
 elsif n.channel<>'inapp' then reason:='parent_channel_unavailable';end if;
 if reason is not null then
  update public.academy_notifications set status='skipped',error=reason,claim_token=null,claimed_at=null,attempts=attempts+1 where id=n.id;
  insert into public.academy_notification_delivery_attempts(academy_id,notification_id,attempt_number,channel,provider,status,error_code)
   values(n.academy_id,n.id,n.attempts+1,n.channel,'parent_consent','skipped',reason);
  return jsonb_build_object('outcome','skipped','notification_id',n.id);
 end if;
 if not override_allowed and pref.quiet_hours_start is not null and pref.quiet_hours_end is not null then
  if not exists(select 1 from pg_timezone_names where name=pref.timezone) then raise exception using errcode='22023',message='Invalid parent notification timezone';end if;
  local_now:=clock_timestamp() at time zone pref.timezone;
  if(pref.quiet_hours_start<pref.quiet_hours_end and local_now::time>=pref.quiet_hours_start and local_now::time<pref.quiet_hours_end)
   or(pref.quiet_hours_start>=pref.quiet_hours_end and(local_now::time>=pref.quiet_hours_start or local_now::time<pref.quiet_hours_end)) then
   until_time:=local_now::date+pref.quiet_hours_end;
   if until_time<=local_now then until_time:=until_time+interval '1 day';end if;
   defer_until:=until_time at time zone pref.timezone;
   update public.academy_notifications set scheduled_at=defer_until where id=n.id;
   return jsonb_build_object('outcome','deferred','notification_id',n.id,'deliver_at',defer_until);
  end if;
 end if;
 token:=gen_random_uuid();
 update public.academy_notifications set status='processing',claim_token=token,claimed_at=clock_timestamp(),last_attempt_at=clock_timestamp(),attempts=attempts+1,target=destination,
  policy_decision=jsonb_build_object('parent_consent_checked_at',clock_timestamp(),'relationship_id',r.id) where id=n.id;
 return jsonb_build_object('outcome','send','notification_id',n.id,'claim_token',token,'channel',n.channel,'target',destination,'title',n.title,'body',n.body);
end;$$;
revoke all on function public.academy_guardian_delivery_claim(uuid) from public,anon,authenticated;
grant execute on function public.academy_guardian_delivery_claim(uuid) to service_role;

create or replace function public.academy_guardian_delivery_complete(p_notification_id uuid,p_claim_token uuid,p_outcome text,p_provider_id text default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
declare n public.academy_notifications;final_status text;
begin
 if p_outcome not in('sent','failed','unknown','unconfigured') then raise exception using errcode='22023',message='Invalid parent delivery outcome';end if;
 select * into n from public.academy_notifications where id=p_notification_id for update;
 if n.id is null or n.guardian_id is null then raise exception using errcode='22023',message='A parent notification is required';end if;
 if n.claim_token is distinct from p_claim_token or p_claim_token is null then raise exception using errcode='23505',message='Parent delivery claim changed';end if;
 if n.status<>'processing' then return jsonb_build_object('notification_id',n.id,'status',n.status,'replayed',true);end if;
 final_status:=case p_outcome when 'sent' then 'sent' when 'unknown' then 'failed' when 'unconfigured' then 'skipped' else 'failed' end;
 update public.academy_notifications set status=final_status,sent_at=case when p_outcome='sent' then clock_timestamp() end,
  error=case when p_outcome<>'sent' then 'parent_delivery_'||p_outcome end,
  policy_decision=policy_decision||jsonb_build_object('requires_review',p_outcome='unknown') where id=n.id;
 insert into public.academy_notification_delivery_attempts(academy_id,notification_id,attempt_number,channel,provider,status,error_code,provider_message_id)
  values(n.academy_id,n.id,n.attempts,n.channel,'parent_'||n.channel,case when p_outcome='sent' then 'sent' when p_outcome='unconfigured' then 'skipped' else 'failed' end,
   case when p_outcome<>'sent' then p_outcome end,left(p_provider_id,200));
 return jsonb_build_object('notification_id',n.id,'status',final_status,'replayed',false);
end;$$;
revoke all on function public.academy_guardian_delivery_complete(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.academy_guardian_delivery_complete(uuid,uuid,text,text) to service_role;
commit;
