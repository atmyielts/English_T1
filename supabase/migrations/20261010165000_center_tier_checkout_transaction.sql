begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create function public.assert_center_checkout_actor(p_user_id uuid,p_tenant_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.assert_payment_checkout_actor(p_user_id,p_tenant_id);
  perform 1 from public.tenant_memberships where user_id=p_user_id and tenant_id=p_tenant_id
    and status='active' and lower(trim(role)) in ('owner','admin') for share;
  if not found then raise exception using errcode='42501',message='Center billing authority is unavailable'; end if;
  perform 1 from public.partner_center_profiles where tenant_id=p_tenant_id and status='active' for share;
  if not found then raise exception using errcode='42501',message='Center is unavailable'; end if;
end; $$;
revoke all on function public.assert_center_checkout_actor(uuid,uuid) from public,anon,authenticated,service_role;

create function public.create_center_tier_checkout(p_user_id uuid,p_request_key text,p_intent jsonb,
  p_tenant_id uuid,p_tier text,p_billing text,p_provider_metadata jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='15s' as $$
declare reply jsonb; profile public.partner_center_profiles%rowtype; plan public.plans%rowtype;
  payment public.payments%rowtype; existing public.partner_center_tier_change_requests%rowtype;
  order_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); legacy_id uuid;
  snapshot jsonb; terms jsonb; purchase_metadata jsonb; original_tier text;
begin
  if p_user_id is null or p_request_key is null then raise exception using errcode='22023',message='Invalid checkout identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-checkout:'||p_user_id::text||':'||p_request_key,0));
  reply:=public.payment_checkout_replay(p_user_id,p_request_key,p_intent);
  if reply->>'state'<>'absent' then return reply; end if;
  if p_intent->>'purchase_type' is distinct from 'center_tier_upgrade'
    or p_intent->>'tenant_id' is distinct from p_tenant_id::text
    or p_intent->>'requested_tier' is distinct from p_tier or p_intent->>'billing_period' is distinct from p_billing
    or p_tier is null or p_tier not in ('growth','premium','exclusive')
    or p_billing is null or p_billing not in ('monthly','annual')
    or coalesce((p_intent->>'apply_credit')::boolean,false) or (p_intent->>'credit_amount' is not null and p_intent->>'credit_amount'<>'0')
    or p_intent->>'coupon_code' is not null or p_intent->>'referral_code' is not null
    or p_intent->>'referral_attribution_id' is not null then
    raise exception using errcode='22023',message='Invalid center tier purchase';
  end if;
  -- Serialize with fulfillment before profile changes, and retain admission until
  -- this financial transaction commits. No HTTP request is made under these locks.
  perform 1 from public.tenants where id=p_tenant_id for update;
  perform public.assert_center_checkout_actor(p_user_id,p_tenant_id);
  select * into profile from public.partner_center_profiles where tenant_id=p_tenant_id for update;
  original_tier:=lower(trim(profile.package_tier));
  if original_tier is null or original_tier not in ('starter','growth','premium','exclusive')
    or array_position(array['starter','growth','premium','exclusive'],p_tier)
      <array_position(array['starter','growth','premium','exclusive'],original_tier) then
    raise exception using errcode='22023',message='Center tier change requires review';
  end if;
  -- Exactly one active server-priced catalogue entry. Ambiguous catalogue entries
  -- are refused rather than selecting an arbitrary plan. Legacy plan IDs narrow it.
  select * into strict plan from public.plans where product_id='00000000-0000-4000-8000-000000000701'::uuid
    and is_active=true and metadata->>'is_center_tier_plan'='true'
    and metadata->>'center_tier'=p_tier and metadata->>'billing_period'=p_billing
    and (p_intent->>'plan_id' is null or id=(p_intent->>'plan_id')::uuid);
  if plan.amount is null or plan.amount not between 1000 and 2000000000 or upper(plan.currency) is distinct from 'UZS'
    or plan.duration_days is null or plan.duration_days not between 1 and 36500 then
    raise exception using errcode='22023',message='Center tier catalogue terms are invalid';
  end if;
  snapshot:=to_jsonb(plan)||jsonb_build_object('captured_at',now());
  terms:=jsonb_build_object('source_plan_id',plan.id,'duration_days',plan.duration_days,
    'included_product_ids','[]'::jsonb,'limits','{}'::jsonb,'captured_at',now());
  legacy_id:=nullif(p_intent->>'tier_change_request_id','')::uuid;
  if legacy_id is not null then
    -- Compatibility for the installed older office's pre-created request. Never
    -- attach another payer's request or overwrite a previously linked payment.
    select * into existing from public.partner_center_tier_change_requests where id=legacy_id for update;
    if not found or (existing.tenant_id,existing.requested_by,existing.requested_tier,existing.billing_period,
      existing.amount,existing.currency,existing.status,existing.payment_id) is distinct from
      (p_tenant_id,p_user_id,p_tier,p_billing,plan.amount,'UZS'::text,'pending_payment'::text,null::uuid) then
      raise exception using errcode='22023',message='Legacy center tier request requires review';
    end if;
    request_id:=existing.id;
  else
    insert into public.partner_center_tier_change_requests(id,tenant_id,previous_tier,requested_tier,billing_period,
      amount,currency,status,requested_by,expires_at,metadata)
    values(request_id,p_tenant_id,original_tier,p_tier,p_billing,plan.amount,'UZS','pending_payment',p_user_id,
      now()+interval '7 days',jsonb_build_object('source','atomic_center_checkout','plan_id',plan.id,'plan_name',plan.name,
        'duration_days',plan.duration_days));
  end if;
  purchase_metadata:=jsonb_build_object('purchase_type','center_tier_upgrade','center_office',true,'center_tenant_id',p_tenant_id,
    'requested_tier',p_tier,'previous_tier',original_tier,'billing_period',p_billing,'tier_change_request_id',request_id,
    'checkout_idempotency_key',p_request_key,'click_service_id',p_provider_metadata->>'click_service_id',
    'click_merchant_id',p_provider_metadata->>'click_merchant_id');
  insert into public.payments(id,provider,provider_transaction_id,checkout_idempotency_key,user_id,tenant_id,product_id,plan_id,
    amount,currency,status,purchase_type,original_amount,discount_amount,credit_amount,referral_discount_amount,
    plan_snapshot,entitlement_terms,metadata,provider_payload,fiscalization_status)
  values(order_id,'click',order_id::text,p_request_key,p_user_id,p_tenant_id,plan.product_id,plan.id,plan.amount,'UZS','pending',
    'center_tier_upgrade',plan.amount,0,0,0,snapshot,terms,purchase_metadata,jsonb_build_object('stage','atomic_center_checkout_created'),'not_configured');
  update public.partner_center_tier_change_requests set payment_id=order_id,
    metadata=partner_center_tier_change_requests.metadata||jsonb_build_object('click_transaction_id',order_id::text),updated_at=now()
    where id=request_id;
  insert into public.payment_checkout_requests(user_id,request_key,intent,payment_id) values(p_user_id,p_request_key,p_intent,order_id);
  select * into payment from public.payments where id=order_id;
  return jsonb_build_object('ok',true,'state','created','payment',to_jsonb(payment));
end; $$;
revoke all on function public.create_center_tier_checkout(uuid,text,jsonb,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_center_tier_checkout(uuid,text,jsonb,uuid,text,text,jsonb) to service_role;

create function public.enforce_center_tier_purchase_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if old.payment_id is not null and exists(select 1 from public.payment_checkout_requests where payment_id=old.payment_id) then
    if (old.id,old.tenant_id,old.requested_by,old.requested_tier,old.billing_period,old.amount,old.currency,old.payment_id)
      is distinct from (new.id,new.tenant_id,new.requested_by,new.requested_tier,new.billing_period,new.amount,new.currency,new.payment_id) then
      raise exception using errcode='23514',message='Center purchased identity is immutable';
    end if;
  end if;
  return new;
end; $$;
create trigger center_tier_purchase_identity before update on public.partner_center_tier_change_requests
  for each row execute function public.enforce_center_tier_purchase_identity();
revoke all on function public.enforce_center_tier_purchase_identity() from public,anon,authenticated,service_role;
commit;
