-- Install before the Click Edge release. The background worker is disabled until
-- that release is verified. Old paid rows are never automatically re-granted.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create table public.payment_fulfillment_jobs (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  state text not null check (state in ('pending','retry','fulfilled','reconciliation','legacy_completed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index payment_fulfillment_due_idx on public.payment_fulfillment_jobs(next_attempt_at)
  where state in ('pending','retry');
create table public.payment_fulfillment_receipts (
  payment_id uuid primary key references public.payments(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  purchase_type text not null,
  result jsonb not null,
  committed_at timestamptz not null default now()
);
create table public.payment_fulfillment_config (
  singleton boolean primary key default true check (singleton),
  worker_enabled boolean not null default false
);
insert into public.payment_fulfillment_config default values;
alter table public.payment_fulfillment_jobs enable row level security;
alter table public.payment_fulfillment_receipts enable row level security;
alter table public.payment_fulfillment_config enable row level security;
revoke all on public.payment_fulfillment_jobs, public.payment_fulfillment_receipts,
  public.payment_fulfillment_config from public, anon, authenticated, service_role;
grant select on public.payment_fulfillment_jobs, public.payment_fulfillment_receipts,
  public.payment_fulfillment_config to service_role;

-- Capture the finite baseline once. Completion markers from the old implementation
-- are preserved as legacy evidence; they are deliberately not new atomic receipts.
insert into public.payment_fulfillment_jobs(payment_id,state,completed_at,last_error_code)
select id, case when grant_completed_at is not null then 'legacy_completed' else 'reconciliation' end,
  grant_completed_at, case when grant_completed_at is null then 'legacy_payment_requires_review' end
from public.payments where status in ('paid','success','completed');

create function public.enqueue_payment_fulfillment() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.status in ('paid','success','completed') then
    insert into public.payment_fulfillment_jobs(payment_id,state)
      values(new.id,'pending') on conflict(payment_id) do nothing;
  end if;
  return new;
end; $$;
create trigger payments_enqueue_fulfillment after insert or update of status on public.payments
  for each row execute function public.enqueue_payment_fulfillment();
revoke all on function public.enqueue_payment_fulfillment() from public,anon,authenticated,service_role;

-- Keep the fulfilment specification as immutable as the Click amount. Updating
-- provider reconciliation metadata cannot replace the purchased terms or owner.
create function public.enforce_payment_fulfillment_terms() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.provider in ('click','platform_credit') and (
    (old.provider,old.user_id,old.tenant_id,old.product_id,old.plan_id,old.amount,old.currency,
      old.purchase_type,old.entitlement_terms,old.plan_snapshot,old.credit_amount,
      old.original_amount,old.discount_amount,old.referral_discount_amount,old.referral_attribution_id,old.coupon_id)
      is distinct from
    (new.provider,new.user_id,new.tenant_id,new.product_id,new.plan_id,new.amount,new.currency,
      new.purchase_type,new.entitlement_terms,new.plan_snapshot,new.credit_amount,
      new.original_amount,new.discount_amount,new.referral_discount_amount,new.referral_attribution_id,new.coupon_id)
    or (select jsonb_object_agg(k,old.metadata->k) from unnest(array['experience_id','quantity','expires_in_days',
      'seat_count','seat_plan_id','requested_tier','center_tier','billing_period','tier_change_request_id','academy_payment_id','academy_id','offer_id','contact_id']) k)
      is distinct from
      (select jsonb_object_agg(k,new.metadata->k) from unnest(array['experience_id','quantity','expires_in_days',
      'seat_count','seat_plan_id','requested_tier','center_tier','billing_period','tier_change_request_id','academy_payment_id','academy_id','offer_id','contact_id']) k)
  ) then raise exception using errcode='23514',message='Payment fulfillment terms are immutable'; end if;
  return new;
end; $$;
create trigger payments_fulfillment_terms before update on public.payments
  for each row execute function public.enforce_payment_fulfillment_terms();
revoke all on function public.enforce_payment_fulfillment_terms() from public,anon,authenticated,service_role;

-- Execute only through this service-only command. Lock order: payment, job,
-- tenant, domain records, credit reservation, attribution. Different payments in
-- one tenant serialize, including absent entitlement rows and concurrent renewals.
create function public.fulfill_paid_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
set lock_timeout = '3s' set statement_timeout = '15s' as $$
declare
  p public.payments%rowtype;
  j public.payment_fulfillment_jobs%rowtype;
  r public.payment_fulfillment_receipts%rowtype;
  terms jsonb; meta jsonb; value jsonb := '{}'::jsonb;
  kind text; days integer; qty integer; product uuid; source_plan uuid;
  targets uuid[]; expires timestamptz; previous_end timestamptz;
  old_active boolean; old_found boolean; code text;
  i integer; retries integer; outcome jsonb := '{}'::jsonb;
  cp public.partner_center_profiles%rowtype;
  sub public.partner_center_tier_subscriptions%rowtype;
  center_request public.partner_center_tier_change_requests%rowtype;
  tier text; billing text; previous_tier text;
  ap public.academy_payments%rowtype;
  credit public.platform_credit_ledger%rowtype;
  attribution public.referral_attributions%rowtype;
  program public.referral_programs%rowtype;
  reward public.referral_rewards%rowtype;
  base numeric; credit_amount integer; cash_amount integer;
  error_code text;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found then return jsonb_build_object('ok',false,'state','not_found'); end if;
  if p.status not in ('paid','success','completed') then
    return jsonb_build_object('ok',false,'state','not_paid');
  end if;
  select * into r from public.payment_fulfillment_receipts where payment_id=p.id;
  if found then return jsonb_build_object('ok',true,'state','fulfilled','deduped',true,'result',r.result); end if;
  insert into public.payment_fulfillment_jobs(payment_id,state) values(p.id,'pending') on conflict do nothing;
  select * into j from public.payment_fulfillment_jobs where payment_id=p.id for update;
  if j.state='legacy_completed' or p.grant_completed_at is not null then
    update public.payment_fulfillment_jobs set state='legacy_completed',completed_at=p.grant_completed_at where payment_id=p.id;
    return jsonb_build_object('ok',true,'state','legacy_completed','deduped',true);
  end if;
  if j.state='reconciliation' or p.granted_at is not null then
    update public.payment_fulfillment_jobs set state='reconciliation',last_error_code='legacy_payment_requires_review' where payment_id=p.id;
    return jsonb_build_object('ok',false,'state','reconciliation');
  end if;

  -- The exception subtransaction rolls back ALL domain writes, including credit,
  -- coupon and referral effects. Only the durable retry record survives failure.
  begin
    if p.tenant_id is null or p.user_id is null then raise exception 'missing_payment_owner'; end if;
    perform 1 from public.tenants where id=p.tenant_id for update;
    if not found then raise exception 'missing_payment_tenant'; end if;
    meta := coalesce(p.metadata,'{}'::jsonb);
    kind := coalesce(nullif(lower(btrim(p.purchase_type)),''),nullif(lower(btrim(meta->>'purchase_type')),''),'plan');
    -- Payment terms are captured at checkout. Never silently replace missing or
    -- malformed finite terms with lifetime access or today's edited catalogue.
    terms := p.entitlement_terms;
    if terms is null and p.plan_snapshot is not null then
      terms := jsonb_build_object('duration_days',p.plan_snapshot->'duration_days',
        'source_plan_id',p.plan_snapshot->'id',
        'included_product_ids',coalesce(p.plan_snapshot#>'{metadata,included_product_ids}','[]'::jsonb),
        'limits',coalesce(p.plan_snapshot#>'{metadata,limits}','{}'::jsonb));
    end if;
    days := null;
    if terms->>'duration_days' is not null then
      days := (terms->>'duration_days')::integer;
      if days < 1 or days > 36500 then raise exception 'invalid_payment_duration'; end if;
    end if;
    source_plan := coalesce(nullif(terms->>'source_plan_id','')::uuid,p.plan_id);

    if kind='token_pack' then
      qty := (meta->>'quantity')::integer;
      days := (meta->>'expires_in_days')::integer;
      if qty is null or qty not between 1 and 500 or days is null or days not between 1 and 30
        or nullif(meta->>'experience_id','') is null then raise exception 'invalid_token_terms'; end if;
      expires := now()+make_interval(days=>days);
      for i in 1..qty loop
        retries := 0;
        loop
          -- UUID randomness is generated by PostgreSQL, never Math.random().
          code := upper(replace(gen_random_uuid()::text,'-',''));
          insert into public.exam_tokens(tenant_id,experience_id,token_code,status,expires_at,
            max_uses,uses_count,created_by,metadata)
          values(p.tenant_id,(meta->>'experience_id')::uuid,code,'active',expires,1,0,p.user_id,
            jsonb_build_object('payment_id',p.id,'purchase_type','token_pack'))
          on conflict(token_code) do nothing;
          exit when found;
          retries := retries+1;
          if retries>=8 then raise exception 'token_generation_failed'; end if;
        end loop;
      end loop;
      outcome := jsonb_build_object('tokens_created',qty,'expires_at',expires);
      meta := meta||jsonb_build_object('tokens_created',qty);
    elsif kind='seat_pack' then
      qty := coalesce(meta->>'seat_count',meta->>'quantity')::integer;
      if qty is null or qty not between 1 and 500 or terms is null or p.product_id is null
        or source_plan is null then raise exception 'invalid_seat_terms'; end if;
      if nullif(meta->>'seat_plan_id','') is not null and (meta->>'seat_plan_id')::uuid<>source_plan then
        raise exception 'seat_plan_mismatch';
      end if;
      -- Inventory has a 30-day assignment window, distinct from the captured
      -- learner access duration. Preserve that existing commercial behavior.
      expires := now()+interval '30 days';
      insert into public.seat_licenses(tenant_id,plan_id,product_id,purchaser_id,status,expires_at,payment_id,metadata)
        select p.tenant_id,source_plan,p.product_id,p.user_id,'unassigned',expires,p.id,
          jsonb_build_object('purchase_type','seat_pack','entitlement_terms',terms) from generate_series(1,qty);
      outcome := jsonb_build_object('seats_created',qty,'expires_at',expires);
    elsif kind='center_wallet_topup' then
      base := coalesce(p.original_amount,p.amount);
      if base<=0 or p.amount<>base or coalesce(p.credit_amount,0)<>0
        or upper(p.currency)<>'UZS' or coalesce(p.discount_amount,0)<>0
        or coalesce(p.referral_discount_amount,0)<>0 then raise exception 'invalid_wallet_terms'; end if;
      -- Honor an existing top-up only if its immutable financial identity agrees.
      if exists(select 1 from public.partner_wallet_ledger where payment_id=p.id and entry_kind='topup') then
        raise exception 'wallet_payment_requires_review';
      end if;
      insert into public.partner_wallet_ledger(tenant_id,user_id,entry_kind,status,amount,currency,payment_id,created_by,metadata)
        values(p.tenant_id,p.user_id,'topup','posted',base::integer,upper(p.currency),p.id,p.user_id,
          jsonb_build_object('source','click','click_payment_id',p.id,'click_transaction_id',p.provider_transaction_id));
      outcome := jsonb_build_object('wallet_amount',base,'currency',upper(p.currency));
      meta := meta||jsonb_build_object('center_wallet_topup_posted',true,'center_wallet_topup_posted_at',now());
    elsif kind='center_tier_upgrade' then
      tier := lower(coalesce(p.plan_snapshot#>>'{metadata,center_tier}',''));
      if p.plan_snapshot#>>'{metadata,is_center_tier_plan}' is distinct from 'true'
        or coalesce(meta->>'requested_tier',meta->>'center_tier') is distinct from tier then
        raise exception 'tier_plan_mismatch';
      end if;
      if tier not in ('growth','premium','exclusive') or terms is null or days is null then raise exception 'invalid_tier_terms'; end if;
      select * into cp from public.partner_center_profiles where tenant_id=p.tenant_id for update;
      if not found then raise exception 'missing_center_profile'; end if;
      if nullif(meta->>'tier_change_request_id','') is not null then
        select * into center_request from public.partner_center_tier_change_requests
          where id=(meta->>'tier_change_request_id')::uuid for update;
        if not found or (center_request.tenant_id,center_request.requested_by,center_request.requested_tier,
          center_request.billing_period,center_request.amount,center_request.currency) is distinct from
          (p.tenant_id,p.user_id,tier,p.plan_snapshot#>>'{metadata,billing_period}',coalesce(p.original_amount,p.amount),p.currency)
          or center_request.status not in ('pending_payment','paid')
          or (center_request.payment_id is not null and center_request.payment_id<>p.id) then raise exception 'tier_request_mismatch'; end if;
      elsif exists(select 1 from public.payment_checkout_requests where payment_id=p.id) then
        raise exception 'captured_tier_request_missing';
      end if;
      previous_tier := cp.package_tier;
      if array_position(array['starter','growth','premium','exclusive'],tier)
        <array_position(array['starter','growth','premium','exclusive'],previous_tier) then raise exception 'tier_downgrade_requires_review'; end if;
      select * into sub from public.partner_center_tier_subscriptions where tenant_id=p.tenant_id for update;
      previous_end := case when found and sub.status='active' and sub.current_tier=tier then sub.current_period_end end;
      expires := greatest(now(),coalesce(previous_end,now()))+make_interval(days=>days);
      billing := p.plan_snapshot#>>'{metadata,billing_period}';
      if billing not in ('annual','monthly') or billing is null
        or meta->>'billing_period' is distinct from billing then raise exception 'tier_billing_mismatch'; end if;
      update public.partner_center_profiles set package_tier=tier,
        powered_by_schood=case when tier='growth' then true else powered_by_schood end,
        wallet_settings=coalesce(wallet_settings,'{}'::jsonb)||jsonb_build_object('upgraded_by_payment_id',p.id,
          'tier_period_end',expires,'tier_billing_period',billing) where tenant_id=p.tenant_id;
      insert into public.partner_center_tier_subscriptions(tenant_id,current_tier,status,billing_period,current_period_start,
        current_period_end,payment_id,amount,currency,metadata)
      values(p.tenant_id,tier,'active',billing,now(),expires,p.id,p.amount,p.currency,
        jsonb_build_object('source','click','previous_tier',previous_tier,'plan_id',p.plan_id))
      on conflict(tenant_id) do update set current_tier=excluded.current_tier,status=excluded.status,
        billing_period=excluded.billing_period,current_period_start=excluded.current_period_start,
        current_period_end=excluded.current_period_end,payment_id=excluded.payment_id,amount=excluded.amount,
        currency=excluded.currency,metadata=excluded.metadata;
      if nullif(meta->>'tier_change_request_id','') is not null then
        update public.partner_center_tier_change_requests set status='applied',payment_id=p.id,applied_at=now(),
          metadata=metadata||jsonb_build_object('applied_tier',tier,'applied_period_end',expires)
          where id=(meta->>'tier_change_request_id')::uuid and tenant_id=p.tenant_id
            and requested_tier=tier and (payment_id is null or payment_id=p.id);
        if not found then raise exception 'tier_request_mismatch'; end if;
      end if;
      outcome := jsonb_build_object('tier',tier,'expires_at',expires);
      meta := meta||jsonb_build_object('center_tier_applied',tier,'center_tier_period_end',expires);
    elsif kind='academy_tuition' then
      if not exists(select 1 from public.academy_payment_purchase_terms where platform_payment_id=p.id) then
        update public.payment_fulfillment_jobs set state='reconciliation',last_error_code='academy_snapshot_missing' where payment_id=p.id;
        update public.payments set grant_error='Payment received; access activation needs review.' where id=p.id;
        return jsonb_build_object('ok',false,'state','reconciliation');
      end if;
      select * into ap from public.academy_payments where id=(meta->>'academy_payment_id')::uuid for update;
      if not found or ap.academy_id<>p.tenant_id or ap.amount<>p.amount or upper(ap.currency)<>upper(p.currency)
        or ap.metadata->>'platform_payment_id' is distinct from p.id::text then raise exception 'academy_payment_mismatch'; end if;
      -- A separately pre-marked paid row may have skipped the old grant procedure.
      if ap.status='paid' then raise exception 'academy_payment_requires_review'; end if;
      if ap.status<>'pending' then raise exception 'academy_payment_not_pending'; end if;
      outcome := public.apply_academy_payment_purchase(ap.id,p.user_id);
      if outcome->>'ok' is distinct from 'true' or coalesce((outcome->>'created_entitlements')::integer,0)<1 then
        raise exception 'academy_grant_missing';
      end if;
      update public.academy_payments set provider=p.provider,provider_transaction_id=p.provider_transaction_id,
        metadata=metadata||jsonb_build_object('platform_payment_status',p.status,'platform_grant_completed_at',now(),'platform_grant_error',null) where id=ap.id;
    elsif kind in ('plan','subscription','') then
      if p.product_id is null or terms is null or jsonb_typeof(terms)<>'object'
        or not (terms ? 'duration_days') then raise exception 'missing_product_terms'; end if;
      if source_plan is not null then value := jsonb_build_object('plan_id',source_plan); end if;
      if jsonb_typeof(terms->'limits')='object' and terms->'limits'<>'{}'::jsonb then
        value := value||jsonb_build_object('limits',terms->'limits');
      end if;
      select array_agg(distinct x order by x) into targets from (
        select p.product_id x union select v::uuid from jsonb_array_elements_text(coalesce(terms->'included_product_ids','[]'::jsonb)) v
      ) products;
      foreach product in array targets loop
        select ends_at,is_active into previous_end,old_active from public.entitlements
          where tenant_id=p.tenant_id and resource_type='product' and resource_id=product for update;
        old_found := found;
        expires := case when days is null or (old_found and old_active and previous_end is null) then null
          else greatest(now(),case when old_active then coalesce(previous_end,now()) else now() end)+make_interval(days=>days) end;
        insert into public.entitlements(user_id,tenant_id,resource_type,resource_id,is_active,starts_at,ends_at,source,value)
          values(p.user_id,p.tenant_id,'product',product,true,now(),expires,'click',value)
          on conflict(tenant_id,resource_type,resource_id) do update set user_id=excluded.user_id,is_active=true,
            starts_at=case when public.entitlements.is_active then public.entitlements.starts_at else excluded.starts_at end,
            ends_at=excluded.ends_at,source=excluded.source,
            value=case when public.entitlements.is_active and public.entitlements.ends_at is null and days is not null
              then public.entitlements.value else excluded.value end;
      end loop;
      outcome := jsonb_build_object('product_ids',targets,'duration_days',days);
    else
      raise exception 'unsupported_purchase_type';
    end if;

    if p.coupon_id is not null then
      insert into public.coupon_redemptions(coupon_id,payment_id,context_id,user_id,tenant_id,status,redeemed_at,snapshot,metadata)
      values(p.coupon_id,p.id,p.id::text,p.user_id,p.tenant_id,'applied',now(),jsonb_build_object('coupon_id',p.coupon_id,
        'coupon_code',p.coupon_code,'plan_id',p.plan_id,'product_id',p.product_id,'original_amount',p.original_amount,
        'discount_amount',p.discount_amount,'final_amount',p.amount,'currency',p.currency),
        jsonb_build_object('provider',p.provider,'provider_transaction_id',p.provider_transaction_id))
      on conflict(coupon_id,user_id,context_id) where context_id is not null do nothing;
    end if;
    if coalesce(p.credit_amount,0)>0 then
      select * into credit from public.platform_credit_ledger where payment_id=p.id and entry_kind='reserve' for update;
      if not found or credit.status not in ('reserved','consumed') or credit.amount<>p.credit_amount
        or credit.user_id<>p.user_id or credit.tenant_id is distinct from p.tenant_id
        or upper(credit.currency)<>upper(p.currency) then raise exception 'credit_reservation_mismatch'; end if;
      update public.platform_credit_ledger set status='consumed' where id=credit.id;
    end if;

    if p.referral_attribution_id is not null and kind<>'center_wallet_topup' then
      select * into attribution from public.referral_attributions where id=p.referral_attribution_id for update;
      if found and attribution.referred_user_id=p.user_id and attribution.referrer_user_id<>p.user_id
        and attribution.status in ('pending','converted') then
        select * into program from public.referral_programs where id=attribution.program_id;
        base := coalesce(p.original_amount,p.amount,0);
        if found and program.status='active' and upper(program.currency)=upper(p.currency)
          and base>=coalesce(program.min_purchase_amount,0)
          and kind=any(program.eligible_purchase_types)
          and (not program.first_purchase_only or (
            (attribution.converted_payment_id is null or attribution.converted_payment_id=p.id)
            and not exists(select 1 from public.payments other where other.user_id=p.user_id
              and other.status in ('paid','success','completed') and (other.created_at,other.id)<(p.created_at,p.id)))) then
          credit_amount := least(base,greatest(0,case when program.referrer_credit_type='percent'
            then floor(base*least(program.referrer_credit_value,100)/100+0.5)
            else coalesce(program.referrer_credit_value,0) end))::integer;
          if program.referrer_credit_cap is not null then credit_amount:=least(credit_amount,program.referrer_credit_cap); end if;
          cash_amount := case when program.cash_payouts_enabled then least(base,greatest(0,
            case when program.referrer_cash_type='percent' then floor(base*least(program.referrer_cash_value,100)/100+0.5)
            else coalesce(program.referrer_cash_value,0) end))::integer else 0 end;
          if program.referrer_cash_cap is not null then cash_amount:=least(cash_amount,program.referrer_cash_cap); end if;
          if credit_amount>0 or cash_amount>0 then
            insert into public.referral_rewards(attribution_id,program_id,referrer_user_id,referred_user_id,payment_id,
              status,credit_amount,cash_amount,cash_status,currency,issued_at,metadata)
            values(attribution.id,program.id,attribution.referrer_user_id,p.user_id,p.id,'issued',credit_amount,cash_amount,
              case when cash_amount>0 then 'available' else 'none' end,upper(p.currency),now(),
              jsonb_build_object('purchase_type',kind,'payment_original_amount',p.original_amount,'payment_amount',p.amount))
            on conflict(attribution_id,payment_id) do nothing;
            select * into reward from public.referral_rewards where attribution_id=attribution.id and payment_id=p.id;
            if reward.status<>'reversed' then
              if reward.credit_amount>0 then
                insert into public.platform_credit_ledger(user_id,tenant_id,currency,amount,entry_kind,status,payment_id,reward_id,metadata)
                values(reward.referrer_user_id,p.tenant_id,reward.currency,reward.credit_amount,'grant','posted',p.id,reward.id,
                  jsonb_build_object('attribution_id',attribution.id,'referred_user_id',p.user_id)) on conflict do nothing;
              end if;
              update public.referral_attributions set status='converted',converted_payment_id=p.id,converted_at=now() where id=attribution.id;
            end if;
          end if;
        end if;
      end if;
    end if;

    insert into public.payment_fulfillment_receipts(payment_id,tenant_id,user_id,purchase_type,result)
      values(p.id,p.tenant_id,p.user_id,kind,outcome);
    update public.payments set granted_at=now(),grant_completed_at=now(),grant_error=null,metadata=meta where id=p.id;
    update public.payment_fulfillment_jobs set state='fulfilled',completed_at=now(),attempts=attempts+1,last_error_code=null where payment_id=p.id;
    return jsonb_build_object('ok',true,'state','fulfilled','deduped',false,'result',outcome);
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate;
    -- Do not expose SQL messages or private row values to a customer or provider.
    update public.payment_fulfillment_jobs set state=case when attempts>=11 then 'reconciliation' else 'retry' end,
      attempts=attempts+1,last_error_code=error_code,
      next_attempt_at=now()+make_interval(secs=>least(86400,30*power(2,least(attempts,11))::integer)) where payment_id=p.id;
    update public.payments set grant_error='Payment received; access activation is pending.' where id=p.id;
    if kind='academy_tuition' then
      update public.academy_payments academy_record set metadata=academy_record.metadata||jsonb_build_object('platform_payment_status',p.status,
        'platform_grant_error','Payment received; access activation is pending.')
        from public.academy_payment_purchase_terms purchased
        where purchased.platform_payment_id=p.id and academy_record.id=purchased.academy_payment_id;
    end if;
    return jsonb_build_object('ok',false,'state',case when j.attempts>=11 then 'reconciliation' else 'retry' end);
  end;
end; $$;
revoke all on function public.fulfill_paid_payment(uuid) from public,anon,authenticated;
grant execute on function public.fulfill_paid_payment(uuid) to service_role;

create function public.retry_payment_fulfillment(p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='25s' as $$
declare item record; reply jsonb; attempted integer:=0; fulfilled integer:=0;
begin
  if not (select worker_enabled from public.payment_fulfillment_config where singleton) then
    return jsonb_build_object('enabled',false,'attempted',0);
  end if;
  -- Lock payments first, like the interactive command, never jobs first.
  for item in select p.id from public.payments p join public.payment_fulfillment_jobs j on j.payment_id=p.id
    where j.state in ('pending','retry') and j.next_attempt_at<=now()
      and p.status in ('paid','success','completed') order by j.next_attempt_at,p.id
    limit greatest(1,least(coalesce(p_limit,5),5)) for update of p skip locked
  loop
    reply:=public.fulfill_paid_payment(item.id); attempted:=attempted+1;
    if reply->>'ok'='true' then fulfilled:=fulfilled+1; end if;
  end loop;
  return jsonb_build_object('enabled',true,'attempted',attempted,'fulfilled',fulfilled);
end; $$;
revoke all on function public.retry_payment_fulfillment(integer) from public,anon,authenticated;
grant execute on function public.retry_payment_fulfillment(integer) to service_role;

-- Scheduling installs a dormant worker. Enable only after the reviewed Edge
-- deployment and production canary; a database owner controls the one flag.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('payment-fulfillment-v1','* * * * *',
      'select public.retry_payment_fulfillment(5);');
  end if;
end; $$;
commit;
