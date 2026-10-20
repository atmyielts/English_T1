begin;
alter table public.academy_subscription_freezes add column if not exists resumed_on date,add column if not exists preserved_days integer check(preserved_days>=0),add column if not exists original_subscription_end date;
CREATE OR REPLACE FUNCTION public.academy_manage_subscription(p_academy_id uuid, p_subscription_id uuid, p_actor_id uuid, p_action text, p_payload jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub public.academy_subscriptions%rowtype;
  v_freeze public.academy_subscription_freezes%rowtype;
  v_action text := lower(trim(p_action));
  v_reason text := nullif(trim(p_payload->>'reason'), '');
  v_starts_on date;
  v_ends_on date;
  v_renewal jsonb;
  v_today date;v_preserved integer:=0;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  select * into v_sub from public.academy_subscriptions
    where academy_id=p_academy_id and id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;

  select (clock_timestamp() at time zone coalesce((select timezone from public.academy_branches where id=v_sub.branch_id and academy_id=p_academy_id),'UTC'))::date into v_today;
  if exists(select 1 from public.domain_event_outbox where idempotency_key='subscription.command:'||p_idempotency_key and aggregate_id=v_sub.id and payload->>'academy_id'=p_academy_id::text) then
    select * into v_freeze from public.academy_subscription_freezes
      where academy_id=p_academy_id and idempotency_key=p_idempotency_key;
    select to_jsonb(s) into v_renewal from public.academy_subscriptions s
      where s.academy_id=p_academy_id and s.idempotency_key=p_idempotency_key;
    return jsonb_build_object(
      'subscription',to_jsonb(v_sub),
      'freeze',case when v_freeze.id is null then null else to_jsonb(v_freeze) end,
      'renewal',v_renewal
    );
  end if;

  if v_action='freeze' then
    if v_sub.status not in ('active','overdue') then raise exception 'Only an active or overdue subscription can be frozen'; end if;
    if v_reason is null then raise exception 'Freeze reason is required'; end if;
    v_starts_on:=coalesce(nullif(p_payload->>'starts_on','')::date,v_today);
    v_ends_on:=nullif(p_payload->>'ends_on','')::date;
    if v_ends_on is null or v_ends_on<v_starts_on then raise exception 'A valid freeze end date is required'; end if;
    if v_starts_on<>v_today then raise exception using errcode='22023',message='Start the vacation pause today in the branch timezone';end if;
    if exists(select 1 from public.academy_subscription_freezes where academy_id=p_academy_id and subscription_id=v_sub.id and status in('active','scheduled')) then raise exception using errcode='23505',message='This subscription already has an open pause';end if;
    insert into public.academy_subscription_freezes(
      academy_id,subscription_id,starts_on,ends_on,reason,status,idempotency_key,created_by
    ) values(
      p_academy_id,v_sub.id,v_starts_on,v_ends_on,v_reason,
      case when v_starts_on<=v_today then 'active' else 'scheduled' end,p_idempotency_key,p_actor_id
    ) returning * into v_freeze;
    if v_starts_on<=v_today then
      update public.academy_subscriptions set status='paused',updated_by=p_actor_id,updated_at=now()
        where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
    end if;
  elsif v_action='resume' then
    if v_sub.status<>'paused' then raise exception 'Only a paused subscription can be resumed'; end if;
    select coalesce(sum(greatest(v_today-greatest(starts_on,v_sub.starts_on),0)),0) into v_preserved from public.academy_subscription_freezes
      where academy_id=p_academy_id and subscription_id=v_sub.id and status='active';
    update public.academy_subscription_freezes set status='completed',resumed_on=v_today,preserved_days=greatest(v_today-greatest(starts_on,v_sub.starts_on),0),original_subscription_end=v_sub.ends_on
      where academy_id=p_academy_id and subscription_id=v_sub.id and status='active';
    update public.academy_subscription_freezes set status='cancelled'
      where academy_id=p_academy_id and subscription_id=v_sub.id and status='scheduled';
    update public.academy_subscriptions set status='active',ends_on=case when ends_on is null then null else ends_on+v_preserved end,updated_by=p_actor_id,updated_at=now()
      where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
  elsif v_action='cancel' then
    if v_sub.status not in ('draft','active','paused','overdue') then raise exception 'Subscription is already terminal'; end if;
    if v_reason is null then raise exception 'Cancellation reason is required'; end if;
    update public.academy_subscription_freezes set status='cancelled'
      where academy_id=p_academy_id and subscription_id=v_sub.id and status in ('scheduled','active');
    update public.academy_subscriptions set status='cancelled',cancelled_at=now(),cancellation_reason=v_reason,
      auto_renew=false,updated_by=p_actor_id,updated_at=now()
      where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
  elsif v_action='complete' then
    if v_sub.status not in ('active','paused','overdue') then raise exception 'Subscription cannot be completed in its current status'; end if;
    update public.academy_subscriptions set status='completed',completed_at=now(),auto_renew=false,
      updated_by=p_actor_id,updated_at=now()
      where academy_id=p_academy_id and id=v_sub.id returning * into v_sub;
  elsif v_action='renew' then
    v_starts_on:=coalesce(nullif(p_payload->>'starts_on','')::date,coalesce(v_sub.ends_on+1,v_today));
    v_ends_on:=nullif(p_payload->>'ends_on','')::date;
    v_renewal:=public.academy_create_subscription(
      p_academy_id,v_sub.contact_id,p_actor_id,
      jsonb_build_object(
        'pricing_plan_id',v_sub.pricing_plan_id,'branch_id',v_sub.branch_id,'classroom_id',v_sub.classroom_id,
        'status','active','starts_on',v_starts_on,'ends_on',v_ends_on,'billing_cycle',v_sub.billing_cycle,
        'billing_anchor_day',v_sub.billing_anchor_day,'list_amount',v_sub.list_amount,'discount_amount',v_sub.discount_amount,
        'discount_type','negotiated','discount_reason',coalesce(v_reason,'Renewed agreement terms'),
        'auto_renew',v_sub.auto_renew,'renewal_notice_days',v_sub.renewal_notice_days,
        'metadata',jsonb_build_object('renewed_from_subscription_id',v_sub.id)
      ),p_idempotency_key
    );
  else
    raise exception 'Invalid subscription action';
  end if;

  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,classroom_id,metadata)
  values(p_academy_id,p_actor_id,'subscription.'||v_action,'academy_subscription',v_sub.id::text,v_sub.contact_id,v_sub.classroom_id,
    jsonb_build_object('reason',v_reason,'preserved_days',v_preserved,'previous_ends_on',v_sub.ends_on-v_preserved,'renewal_subscription_id',v_renewal->>'id'));
  insert into public.domain_event_outbox(event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key)
  values('subscription.'||v_action,'v1','academy_subscription',v_sub.id,p_actor_id,
    jsonb_build_object('academy_id',p_academy_id,'contact_id',v_sub.contact_id,'subscription_id',v_sub.id,'renewal',v_renewal),
    'subscription.command:'||p_idempotency_key);
  return jsonb_build_object('subscription',to_jsonb(v_sub),'freeze',case when v_freeze.id is null then null else to_jsonb(v_freeze) end,'renewal',v_renewal);
end; $function$;
revoke all on function public.academy_manage_subscription(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_manage_subscription(uuid,uuid,uuid,text,jsonb,text) to service_role;
commit;
