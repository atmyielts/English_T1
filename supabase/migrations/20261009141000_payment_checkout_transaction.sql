-- Checkout and credit reservation commit together. This ledger spans providers,
-- so replay never re-prices a credit-covered order as a fresh Click purchase.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.payment_checkout_requests (
  user_id uuid not null references public.users(id) on delete restrict,
  request_key text not null check (length(request_key) between 8 and 128),
  intent jsonb not null check (jsonb_typeof(intent)='object' and octet_length(intent::text)<=8192),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(user_id,request_key)
);
alter table public.payment_checkout_requests enable row level security;
revoke all on public.payment_checkout_requests from public,anon,authenticated,service_role;
grant select on public.payment_checkout_requests to service_role;

create function public.assert_payment_checkout_actor(p_user_id uuid,p_tenant_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  -- Hold the admission rows until checkout commits. A concurrent revocation
  -- cannot silently overtake an already admitted checkout inside this command.
  perform 1 from public.users where id=p_user_id and is_active=true for share;
  if not found then raise exception using errcode='42501',message='Checkout account is unavailable'; end if;
  perform 1 from public.tenant_memberships where user_id=p_user_id and tenant_id=p_tenant_id and status='active' for share;
  if not found then raise exception using errcode='42501',message='Checkout membership is unavailable'; end if;
end; $$;
revoke all on function public.assert_payment_checkout_actor(uuid,uuid) from public,anon,authenticated,service_role;

create function public.payment_checkout_replay(p_user_id uuid,p_request_key text,p_intent jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='10s' as $$
declare request public.payment_checkout_requests%rowtype; payment public.payments%rowtype;
begin
  if p_user_id is null or p_request_key is null or length(p_request_key) not between 8 and 128
    or p_intent is null or jsonb_typeof(p_intent)<>'object' or octet_length(p_intent::text)>8192 then
    raise exception using errcode='22023',message='Invalid checkout identity';
  end if;
  perform 1 from public.users where id=p_user_id and is_active=true for share;
  if not found then raise exception using errcode='42501',message='Checkout account is unavailable'; end if;
  select * into request from public.payment_checkout_requests where user_id=p_user_id and request_key=p_request_key;
  if found then
    select * into payment from public.payments where id=request.payment_id;
    if not found then raise exception using errcode='23514',message='Checkout order is unavailable'; end if;
    perform public.assert_payment_checkout_actor(p_user_id,payment.tenant_id);
    if request.intent is distinct from p_intent then
      return jsonb_build_object('ok',false,'state','conflict');
    end if;
    return jsonb_build_object('ok',true,'state','existing','payment',to_jsonb(payment));
  end if;
  -- Old keys have no complete intention snapshot. Refuse a duplicate purchase;
  -- do not guess its terms, retroactively grant it or replace its financial row.
  select * into payment from public.payments where user_id=p_user_id and checkout_idempotency_key=p_request_key limit 1;
  if found then
    perform public.assert_payment_checkout_actor(p_user_id,payment.tenant_id);
    return jsonb_build_object('ok',false,'state','legacy_review','transaction_id',payment.id);
  end if;
  return jsonb_build_object('ok',true,'state','absent');
end; $$;
revoke all on function public.payment_checkout_replay(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_checkout_replay(uuid,text,jsonb) to service_role;

create function public.create_payment_checkout(p_user_id uuid,p_request_key text,p_intent jsonb,p_order jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='15s' as $$
declare reply jsonb; payment public.payments%rowtype; reservation jsonb; reservation_row public.platform_credit_ledger%rowtype;
begin
  -- One caller creates the request; competitors must replay that transaction's
  -- committed result, even if their earlier price/balance observations differ.
  if p_user_id is null or p_request_key is null then
    raise exception using errcode='22023',message='Invalid checkout identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-checkout:'||p_user_id::text||':'||p_request_key,0));
  reply:=public.payment_checkout_replay(p_user_id,p_request_key,p_intent);
  if reply->>'state'<>'absent' then return reply; end if;
  if p_order is null or jsonb_typeof(p_order)<>'object' then
    raise exception using errcode='22023',message='Invalid checkout order';
  end if;
  payment:=jsonb_populate_record(null::public.payments,p_order);
  perform public.assert_payment_checkout_actor(p_user_id,payment.tenant_id);
  if payment.user_id is distinct from p_user_id or payment.tenant_id is null
    or payment.provider is null or payment.provider not in ('click','platform_credit')
    or payment.purchase_type is null or payment.purchase_type not in ('plan','subscription','token_pack','seat_pack','center_wallet_topup','center_tier_upgrade')
    or payment.amount is null or payment.amount<0 or payment.original_amount is null or payment.original_amount<=0
    or payment.discount_amount is null or payment.discount_amount<0 or payment.credit_amount is null or payment.credit_amount<0
    or payment.referral_discount_amount is null or payment.referral_discount_amount<0 or payment.referral_discount_amount>payment.discount_amount
    or payment.original_amount::bigint<>payment.amount::bigint+payment.discount_amount::bigint+payment.credit_amount::bigint
    or payment.currency is null or payment.currency !~ '^[A-Z]{3}$'
    or (payment.provider='click' and (payment.currency<>'UZS' or payment.amount not between 1000 and 2000000000))
    or (payment.provider='platform_credit' and payment.amount<>0) then
    raise exception using errcode='22023',message='Invalid checkout terms';
  end if;
  payment.id:=gen_random_uuid();
  payment.provider_transaction_id:=case when payment.provider='platform_credit' then 'credit-'||payment.id::text else payment.id::text end;
  -- Whitelisted server-priced fields only. A supplied settlement/completion
  -- marker, UUID or provider reference cannot enter the durable order.
  insert into public.payments(id,provider,provider_transaction_id,checkout_idempotency_key,user_id,tenant_id,
    product_id,plan_id,amount,currency,status,purchase_type,original_amount,discount_amount,credit_amount,
    referral_discount_amount,referral_attribution_id,coupon_id,coupon_code,plan_snapshot,entitlement_terms,
    metadata,provider_payload,fiscalization_status)
  values(payment.id,payment.provider,payment.provider_transaction_id,p_request_key,p_user_id,payment.tenant_id,
    payment.product_id,payment.plan_id,payment.amount,payment.currency,'pending',payment.purchase_type,
    payment.original_amount,payment.discount_amount,payment.credit_amount,payment.referral_discount_amount,
    payment.referral_attribution_id,payment.coupon_id,payment.coupon_code,coalesce(payment.plan_snapshot,'{}'::jsonb),
    coalesce(payment.entitlement_terms,'{}'::jsonb),coalesce(payment.metadata,'{}'::jsonb),
    jsonb_build_object('stage','atomic_checkout_created'),case when payment.provider='click' then 'not_configured' else 'not_required' end);
  if payment.credit_amount>0 then
    reservation:=public.reserve_platform_credit(p_user_id,payment.tenant_id,payment.credit_amount,payment.currency,payment.id,
      jsonb_build_object('provider',payment.provider,'purchase_type',payment.purchase_type));
    select * into reservation_row from public.platform_credit_ledger where payment_id=payment.id and entry_kind='reserve';
    if reservation->>'ok' is distinct from 'true' or not found
      or (reservation_row.user_id,reservation_row.tenant_id,reservation_row.amount,reservation_row.currency,reservation_row.status)
        is distinct from (p_user_id,payment.tenant_id,payment.credit_amount,payment.currency,'reserved'::text) then
      raise exception using errcode='23514',message='Checkout credit reservation is unavailable';
    end if;
  end if;
  -- Paid state (and its durable fulfillment job) becomes visible only with the
  -- matching reservation. No failed credit attempt leaves a payable orphan.
  if payment.provider='platform_credit' then update public.payments set status='paid' where id=payment.id; end if;
  insert into public.payment_checkout_requests(user_id,request_key,intent,payment_id) values(p_user_id,p_request_key,p_intent,payment.id);
  select * into payment from public.payments where id=payment.id;
  return jsonb_build_object('ok',true,'state','created','payment',to_jsonb(payment));
end; $$;
revoke all on function public.create_payment_checkout(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_payment_checkout(uuid,text,jsonb,jsonb) to service_role;
commit;
