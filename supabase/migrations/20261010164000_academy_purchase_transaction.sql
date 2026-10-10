begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- The purchased specification is private and immutable to application roles.
-- Offer/grant IDs are historical values: deleting catalogue entries must not
-- erase an already purchased contract. Account/contact retention needs review.
create table public.academy_payment_purchase_terms (
  academy_payment_id uuid primary key references public.academy_payments(id) on delete restrict,
  platform_payment_id uuid not null unique references public.payments(id) on delete restrict,
  academy_id uuid not null references public.tenants(id) on delete restrict,
  contact_id uuid not null references public.academy_contacts(id) on delete restrict,
  contact_user_id uuid references public.users(id) on delete restrict,
  payer_user_id uuid not null references public.users(id) on delete restrict,
  offer_id uuid not null,
  amount integer not null check(amount between 1000 and 2000000000),
  currency text not null check(currency='UZS'),
  offer_snapshot jsonb not null,
  grants jsonb not null check(jsonb_typeof(grants)='array' and jsonb_array_length(grants) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.academy_payment_purchase_terms enable row level security;
revoke all on public.academy_payment_purchase_terms from public,anon,authenticated,service_role;
grant select on public.academy_payment_purchase_terms to service_role;

create function public.assert_academy_checkout_actor(p_user_id uuid,p_academy_id uuid,p_contact_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare contact_user uuid; parent_id text; permitted boolean;
begin
  perform 1 from public.users where id=p_user_id and is_active=true for share;
  if not found then raise exception using errcode='42501',message='Checkout account is unavailable'; end if;
  select metadata->>'parent_center_id' into parent_id from public.tenants where id=p_academy_id for share;
  if not found then raise exception using errcode='42501',message='Academy is unavailable'; end if;
  select user_id into contact_user from public.academy_contacts where id=p_contact_id and academy_id=p_academy_id for share;
  if not found then raise exception using errcode='42501',message='Academy contact is unavailable'; end if;
  if contact_user=p_user_id then return; end if;
  -- Preserve the published finance roles; arbitrary membership is insufficient.
  perform 1 from public.tenant_memberships where user_id=p_user_id and tenant_id=p_academy_id
    and status='active' and lower(replace(replace(trim(role),'-','_'),' ','_')) in ('owner','admin','center_admin') for share;
  permitted:=found;
  if not permitted and parent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform 1 from public.tenant_memberships where user_id=p_user_id and tenant_id=parent_id::uuid
      and status='active' and lower(replace(replace(trim(role),'-','_'),' ','_')) in ('owner','admin','center_admin') for share;
    permitted:=found;
  end if;
  if not permitted then raise exception using errcode='42501',message='Academy finance access is unavailable'; end if;
end; $$;
revoke all on function public.assert_academy_checkout_actor(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.payment_checkout_replay(p_user_id uuid,p_request_key text,p_intent jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='10s' as $$
declare request public.payment_checkout_requests%rowtype; payment public.payments%rowtype; contact uuid;
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
    if payment.purchase_type='academy_tuition' then
      select contact_id into contact from public.academy_payment_purchase_terms where platform_payment_id=payment.id;
      if not found then raise exception using errcode='23514',message='Academy purchase terms are unavailable'; end if;
      perform public.assert_academy_checkout_actor(p_user_id,payment.tenant_id,contact);
    elsif payment.purchase_type in ('center_tier_upgrade','center_wallet_topup') or (payment.purchase_type in ('token_pack','seat_pack')
      and exists(select 1 from public.partner_center_profiles where tenant_id=payment.tenant_id)) then
      perform public.assert_center_checkout_actor(p_user_id,payment.tenant_id);
    else perform public.assert_payment_checkout_actor(p_user_id,payment.tenant_id); end if;
    if request.intent is distinct from p_intent then return jsonb_build_object('ok',false,'state','conflict'); end if;
    return jsonb_build_object('ok',true,'state','existing','payment',to_jsonb(payment));
  end if;
  select * into payment from public.payments where user_id=p_user_id and checkout_idempotency_key=p_request_key limit 1;
  if found then
    if payment.purchase_type='academy_tuition' then
      select ap.contact_id into contact from public.academy_payments ap
        where ap.id=nullif(payment.metadata->>'academy_payment_id','')::uuid and ap.academy_id=payment.tenant_id;
      perform public.assert_academy_checkout_actor(p_user_id,payment.tenant_id,contact);
    elsif payment.purchase_type in ('center_tier_upgrade','center_wallet_topup') or (payment.purchase_type in ('token_pack','seat_pack')
      and exists(select 1 from public.partner_center_profiles where tenant_id=payment.tenant_id)) then
      perform public.assert_center_checkout_actor(p_user_id,payment.tenant_id);
    else perform public.assert_payment_checkout_actor(p_user_id,payment.tenant_id); end if;
    return jsonb_build_object('ok',false,'state','legacy_review','transaction_id',payment.id);
  end if;
  return jsonb_build_object('ok',true,'state','absent');
end; $$;
revoke all on function public.payment_checkout_replay(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_checkout_replay(uuid,text,jsonb) to service_role;

create function public.create_academy_payment_checkout(p_user_id uuid,p_request_key text,p_intent jsonb,
  p_academy_id uuid,p_offer_id uuid,p_contact_id uuid,p_provider_metadata jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='15s' as $$
declare reply jsonb; offer jsonb; raw_grants jsonb; grants jsonb:='[]'::jsonb; item jsonb; duration integer;
  contact public.academy_contacts%rowtype; payment public.payments%rowtype;
  platform_id uuid:=gen_random_uuid(); academy_payment_id uuid:=gen_random_uuid(); source text; amount integer; currency text;
begin
  if p_user_id is null or p_request_key is null then raise exception using errcode='22023',message='Invalid checkout identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-checkout:'||p_user_id::text||':'||p_request_key,0));
  reply:=public.payment_checkout_replay(p_user_id,p_request_key,p_intent);
  if reply->>'state'<>'absent' then return reply; end if;
  if p_intent->>'purchase_type' is distinct from 'academy_tuition'
    or p_intent->>'academy_id' is distinct from p_academy_id::text
    or p_intent->>'offer_id' is distinct from p_offer_id::text
    or p_intent->>'contact_id' is distinct from p_contact_id::text then
    raise exception using errcode='22023',message='Invalid Academy purchase';
  end if;
  -- Contacts do not require a tenant membership. Resolve self-payment exactly;
  -- ambiguous linked contacts are refused, never chosen with LIMIT 1.
  if p_contact_id is null then
    select * into strict contact from public.academy_contacts where academy_id=p_academy_id and user_id=p_user_id for share;
  else select * into contact from public.academy_contacts where id=p_contact_id and academy_id=p_academy_id for share;
    if not found then raise exception using errcode='42501',message='Academy contact is unavailable'; end if;
  end if;
  perform public.assert_academy_checkout_actor(p_user_id,p_academy_id,contact.id);
  source:=case when contact.user_id=p_user_id then 'student_portal' else 'academy_office' end;
  -- One MVCC statement captures the offer AND its grant set. No later catalogue
  -- read can change the purchased amount, duration, quantities or resources.
  select jsonb_build_object('id',o.id,'name',o.name,'type',o.type,'price_amount',o.price_amount,'currency',upper(o.currency),
    'duration_days',o.duration_days,'classroom_id',o.classroom_id),
    coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at,g.id) from public.academy_offer_grants g where g.offer_id=o.id),'[]'::jsonb)
    into offer,raw_grants from public.academy_offers o where o.id=p_offer_id and o.academy_id=p_academy_id and o.is_active=true;
  if not found then raise exception using errcode='22023',message='Academy offer is unavailable'; end if;
  amount:=(offer->>'price_amount')::integer; currency:=offer->>'currency';
  if amount not between 1000 and 2000000000 or currency<>'UZS' or jsonb_array_length(raw_grants) not between 1 and 1000 then
    raise exception using errcode='22023',message='Academy offer is not purchasable';
  end if;
  for item in select value from jsonb_array_elements(raw_grants) loop
    duration:=coalesce((item->>'duration_days')::integer,(offer->>'duration_days')::integer);
    if item->>'academy_id' is distinct from p_academy_id::text or (duration is not null and duration not between 1 and 36500)
      or (item->>'quantity' is not null and (item->>'quantity')::integer not between 1 and 1000000)
      or (item->>'grant_type' in ('mock_tests','writing_credits') and item->>'quantity' is null)
      or (item->>'grant_type'='capability' and coalesce(length(trim(item->>'capability_key')),0) not between 1 and 128)
      or (item->>'grant_type'='product_access' and (item->>'resource_type' is distinct from 'product' or not exists(
        select 1 from public.products where id=(item->>'resource_id')::uuid)))
      or (item->>'grant_type'='classroom_access' and (item->>'resource_type' is distinct from 'classroom' or not exists(
        select 1 from public.academy_classrooms where id=(item->>'resource_id')::uuid and academy_id=p_academy_id and is_active=true))) then
      raise exception using errcode='22023',message='Academy grant configuration is invalid';
    end if;
    grants:=grants||jsonb_build_array(jsonb_build_object('id',item->>'id','grant_type',item->>'grant_type',
      'resource_type',item->>'resource_type','resource_id',item->>'resource_id','capability_key',item->>'capability_key',
      'quantity',(item->>'quantity')::integer,'duration_days',duration,'metadata',item->'metadata'));
  end loop;
  insert into public.academy_payments(id,academy_id,contact_id,offer_id,provider,provider_transaction_id,amount,currency,status,metadata,created_by)
    values(academy_payment_id,p_academy_id,contact.id,p_offer_id,'click','click-'||platform_id::text,amount,currency,'pending',
      jsonb_build_object('source',source,'initiated_by',p_user_id,'platform_payment_id',platform_id),p_user_id);
  insert into public.payments(id,provider,provider_transaction_id,checkout_idempotency_key,user_id,tenant_id,amount,currency,status,
    purchase_type,original_amount,discount_amount,credit_amount,referral_discount_amount,plan_snapshot,entitlement_terms,metadata,provider_payload,fiscalization_status)
    values(platform_id,'click',platform_id::text,p_request_key,p_user_id,p_academy_id,amount,currency,'pending','academy_tuition',
      amount,0,0,0,offer,jsonb_build_object('academy_offer_id',p_offer_id,'duration_days',offer->'duration_days'),
      jsonb_build_object('source',source,'purchase_type','academy_tuition','academy_id',p_academy_id,'academy_payment_id',academy_payment_id,
        'offer_id',p_offer_id,'contact_id',contact.id,'classroom_id',offer->'classroom_id','checkout_idempotency_key',p_request_key,
        'click_service_id',p_provider_metadata->>'click_service_id','click_merchant_id',p_provider_metadata->>'click_merchant_id'),
      jsonb_build_object('stage','atomic_academy_checkout_created'),'not_configured');
  insert into public.academy_payment_purchase_terms(academy_payment_id,platform_payment_id,academy_id,contact_id,contact_user_id,
    payer_user_id,offer_id,amount,currency,offer_snapshot,grants)
    values(academy_payment_id,platform_id,p_academy_id,contact.id,contact.user_id,p_user_id,p_offer_id,amount,currency,offer,grants);
  insert into public.payment_checkout_requests(user_id,request_key,intent,payment_id) values(p_user_id,p_request_key,p_intent,platform_id);
  select * into payment from public.payments where id=platform_id;
  return jsonb_build_object('ok',true,'state','created','payment',to_jsonb(payment));
end; $$;
revoke all on function public.create_academy_payment_checkout(uuid,text,jsonb,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_academy_payment_checkout(uuid,text,jsonb,uuid,uuid,uuid,jsonb) to service_role;

create function public.enforce_academy_purchase_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.academy_payment_purchase_terms where academy_payment_id=old.id) then
    if (old.id,old.academy_id,old.contact_id,old.provider,old.amount,old.currency)
      is distinct from (new.id,new.academy_id,new.contact_id,new.provider,new.amount,new.currency)
      or old.metadata->>'platform_payment_id' is distinct from new.metadata->>'platform_payment_id'
      or (old.offer_id is distinct from new.offer_id and not (new.offer_id is null and
        not exists(select 1 from public.academy_offers where id=old.offer_id))) then
      raise exception using errcode='23514',message='Academy purchased identity is immutable';
    end if;
  end if;
  return new;
end; $$;
create trigger academy_payments_purchase_identity before update on public.academy_payments
  for each row execute function public.enforce_academy_purchase_identity();
revoke all on function public.enforce_academy_purchase_identity() from public,anon,authenticated,service_role;

-- Retain the installed non-Click settlement implementation, including any
-- published changes, behind a private copy. Replace the SAME public function OID
-- so already compiled callers cannot bypass the new Click settlement guard.
do $$ declare definition text; original_owner name; definer boolean; begin
  select roles.rolname,routine.prosecdef into original_owner,definer from pg_proc routine
    join pg_roles roles on roles.oid=routine.proowner where routine.oid='public.apply_academy_payment(uuid,uuid)'::regprocedure;
  if not definer or original_owner in ('anon','authenticated','service_role') then raise exception 'Academy function ownership requires review'; end if;
  definition:=pg_get_functiondef('public.apply_academy_payment(uuid,uuid)'::regprocedure);
  if position('FUNCTION public.apply_academy_payment(' in definition)=0 then raise exception 'Academy function identity requires review'; end if;
  execute replace(definition,'FUNCTION public.apply_academy_payment(','FUNCTION public.apply_academy_payment_legacy(');
  -- The public wrapper retains its original owner. Execute the private copy in
  -- that wrapper's role, rather than escalating the old body to migration owner.
  alter function public.apply_academy_payment_legacy(uuid,uuid) security invoker;
  revoke all on function public.apply_academy_payment_legacy(uuid,uuid) from public,anon,authenticated,service_role;
  execute format('grant execute on function public.apply_academy_payment_legacy(uuid,uuid) to %I',original_owner);
end; $$;
revoke all on function public.apply_academy_payment_legacy(uuid,uuid) from public,anon,authenticated,service_role;

create function public.apply_academy_payment_purchase(p_payment_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ap public.academy_payments%rowtype; p public.payments%rowtype; terms public.academy_payment_purchase_terms%rowtype;
  item jsonb; contact_user uuid; count integer:=0; expires timestamptz;
begin
  -- Match the fulfillment lock order: platform payment before Academy payment.
  select * into terms from public.academy_payment_purchase_terms where academy_payment_id=p_payment_id;
  if not found then raise exception 'Academy purchase terms require reconciliation'; end if;
  select * into p from public.payments where id=terms.platform_payment_id for update;
  select * into ap from public.academy_payments where id=p_payment_id for update;
  if p.id is null or ap.id is null or p.status not in ('paid','success','completed')
    or p.provider<>'click' or p.purchase_type<>'academy_tuition' or p.user_id<>terms.payer_user_id
    or p.tenant_id<>terms.academy_id or ap.academy_id<>terms.academy_id or ap.contact_id<>terms.contact_id
    or p.amount<>terms.amount or ap.amount<>terms.amount or p.currency<>terms.currency or ap.currency<>terms.currency
    or p.metadata->>'academy_payment_id' is distinct from ap.id::text
    or ap.metadata->>'platform_payment_id' is distinct from p.id::text then raise exception 'Academy settlement identity mismatch'; end if;
  if ap.status='paid' then
    if exists(select 1 from public.payment_fulfillment_receipts where payment_id=p.id) then
      return jsonb_build_object('ok',true,'already_paid',true,'created_entitlements',0);
    end if;
    raise exception 'Academy payment requires reconciliation';
  end if;
  if ap.status<>'pending' then raise exception 'Academy payment is not pending'; end if;
  select user_id into contact_user from public.academy_contacts where id=terms.contact_id and academy_id=terms.academy_id for share;
  if not found or contact_user is distinct from terms.contact_user_id then raise exception 'Academy contact identity requires reconciliation'; end if;
  for item in select value from jsonb_array_elements(terms.grants) loop
    expires:=case when item->>'duration_days' is not null then now()+make_interval(days=>(item->>'duration_days')::integer) else null end;
    insert into public.academy_entitlements(academy_id,contact_id,user_id,offer_id,payment_id,payment_grant_key,grant_type,
      resource_type,resource_id,capability_key,quantity,remaining,starts_at,expires_at,status,source,metadata)
      values(terms.academy_id,terms.contact_id,terms.contact_user_id,ap.offer_id,ap.id,item->>'id',item->>'grant_type',
        nullif(item->>'resource_type',''),(item->>'resource_id')::uuid,nullif(item->>'capability_key',''),
        (item->>'quantity')::integer,(item->>'quantity')::integer,now(),expires,'active','payment',
        coalesce(item->'metadata','{}'::jsonb)||jsonb_build_object('offer_grant_id',item->>'id','payment_id',ap.id,
          'purchased_offer_id',terms.offer_id,'platform_payment_id',p.id)) on conflict(payment_id,payment_grant_key) do nothing;
    if not found then raise exception 'Academy grant requires reconciliation'; end if;
    count:=count+1;
  end loop;
  update public.academy_payments set status='paid',metadata=metadata||jsonb_build_object('processed_at',now(),'processed_by',p_actor_id),updated_at=now() where id=ap.id;
  return jsonb_build_object('ok',true,'already_paid',false,'payment_id',ap.id,'created_entitlements',count);
end; $$;
revoke all on function public.apply_academy_payment_purchase(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.apply_academy_payment(p_payment_id uuid,p_actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ap public.academy_payments%rowtype;
begin
  select * into ap from public.academy_payments where id=p_payment_id;
  if not found then raise exception 'Academy payment is unavailable'; end if;
  if lower(ap.provider)='click' then raise exception 'Click settlement requires the atomic fulfillment command'; end if;
  return public.apply_academy_payment_legacy(p_payment_id,p_actor_id);
end; $$;
revoke all on function public.apply_academy_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_academy_payment(uuid,uuid) to service_role;
commit;
