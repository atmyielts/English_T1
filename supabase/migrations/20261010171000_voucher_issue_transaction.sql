begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.voucher_issue_receipts (
  batch_id uuid primary key references public.partner_voucher_batches(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_id uuid not null references public.users(id) on delete restrict,
  request_key uuid not null,
  request jsonb not null,
  purchased_terms jsonb not null,
  funding jsonb not null,
  result jsonb not null,
  committed_at timestamptz not null default now(),
  unique(actor_id,request_key)
);
create table public.voucher_seat_reservations (
  seat_id uuid primary key references public.seat_licenses(id) on delete restrict,
  voucher_id uuid not null unique references public.partner_vouchers(id) on delete restrict,
  batch_id uuid not null references public.partner_voucher_batches(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  purchased_terms jsonb not null,
  committed_at timestamptz not null default now()
);
create table public.voucher_issue_cancellations (
  actor_id uuid not null references public.users(id) on delete restrict,
  request_key uuid not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  request jsonb not null,
  canceled_at timestamptz not null default now(),
  primary key(actor_id,request_key)
);
alter table public.voucher_issue_receipts enable row level security;
alter table public.voucher_seat_reservations enable row level security;
alter table public.voucher_issue_cancellations enable row level security;
revoke all on public.voucher_issue_receipts,public.voucher_seat_reservations,public.voucher_issue_cancellations from public,anon,authenticated,service_role;
grant select on public.voucher_issue_receipts,public.voucher_seat_reservations,public.voucher_issue_cancellations to service_role;
-- Financial configuration and inventory require authenticated server commands.
-- Existing membership-scoped reads remain available. No browser can select a
-- cheaper commercial agreement, fund itself or manufacture an inventory batch.
revoke insert,update,delete,truncate,references,trigger on public.partner_center_profiles,
  public.partner_wallet_ledger,public.partner_voucher_batches,public.partner_vouchers from anon,authenticated;

create function public.validate_voucher_access_terms(p_terms jsonb,p_product uuid,p_plan uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare days integer;
begin
  if jsonb_typeof(p_terms) is distinct from 'object' or not(p_terms ? 'duration_days')
    or nullif(p_terms->>'source_plan_id','')::uuid is distinct from p_plan
    or jsonb_typeof(p_terms->'included_product_ids') is distinct from 'array'
    or jsonb_array_length(p_terms->'included_product_ids')>100
    or jsonb_typeof(p_terms->'limits') is distinct from 'object'
    or p_product is null or not exists(select 1 from public.products where id=p_product) then
    raise exception using errcode='22023',message='Voucher purchased access terms require review';
  end if;
  days:=(p_terms->>'duration_days')::integer;
  if days is not null and days not between 1 and 36500 then
    raise exception using errcode='22023',message='Voucher purchased duration requires review';
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_terms->'included_product_ids') requested(id)
    where requested.id is null or not exists(select 1 from public.products p where p.id=requested.id::uuid))
    or exists(select 1 from jsonb_each(p_terms->'limits') kv where length(kv.key)>64 or case
      when jsonb_typeof(kv.value)<>'number' then true
      else (kv.value::text)::numeric<0 or (kv.value::text)::numeric>2147483647
        or (kv.value::text)::numeric<>trunc((kv.value::text)::numeric) end) then
    raise exception using errcode='22023',message='Voucher purchased products or limits require review';
  end if;
end; $$;
revoke all on function public.validate_voucher_access_terms(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function public.issue_purchased_vouchers(p_actor uuid,p_tenant uuid,p_key uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='20s' as $$
declare profile public.partner_center_profiles%rowtype; saved public.voucher_issue_receipts%rowtype;
  plan public.plans%rowtype; experience public.experiences%rowtype; seat public.seat_licenses%rowtype;
  batch public.partner_voucher_batches%rowtype; item public.partner_vouchers%rowtype;
  kind text:=p_request->>'access_kind'; qty integer; cap integer; prefix text; expires timestamptz;
  product uuid; resource uuid; plan_id uuid; experience_id uuid; classroom uuid; academy uuid;
  terms jsonb; pricing_key text; raw_price jsonb; unit_price bigint; total bigint; balance numeric;
  model text; funding_currency text; seat_ids uuid[]; vouchers jsonb:='[]'::jsonb; token_id uuid;
  roster jsonb; assigned jsonb; recipient_name text; recipient_email text; recipient_phone text;
  student_id uuid; roster_ids uuid[]; key uuid:=coalesce(p_key,gen_random_uuid());
  batch_id uuid:=gen_random_uuid(); batch_code text; code text; funding jsonb; outcome jsonb;
begin
  if p_actor is null or p_tenant is null or jsonb_typeof(p_request) is distinct from 'object'
    or pg_column_size(p_request)>262144 then
    raise exception using errcode='22023',message='Invalid voucher purchase';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('voucher-issue:'||p_actor::text||':'||key::text,0));
  perform 1 from public.tenants where id=p_tenant for update;
  perform public.assert_center_checkout_actor(p_actor,p_tenant);
  select * into profile from public.partner_center_profiles where tenant_id=p_tenant for update;
  if exists(select 1 from public.voucher_issue_cancellations where actor_id=p_actor and request_key=key) then
    raise exception using errcode='23505',message='Voucher purchase reference is closed; do not reopen it';
  end if;
  select * into saved from public.voucher_issue_receipts where actor_id=p_actor and request_key=key;
  if found then
    if saved.tenant_id<>p_tenant or saved.request is distinct from p_request then
      raise exception using errcode='23505',message='Voucher purchase key belongs to another intent';
    end if;
    if not exists(select 1 from public.partner_voucher_batches where id=saved.batch_id and status='active') then
      raise exception using errcode='23505',message='Committed voucher batch requires review';
    end if;
    return saved.result||jsonb_build_object('deduped',true);
  end if;
  if kind is null or kind not in ('mock_exam','subscription','seat') then
    raise exception using errcode='22023',message='Unsupported voucher purchase';
  end if;
  qty:=(p_request->>'quantity')::integer;
  cap:=case profile.package_tier when 'starter' then 50 when 'growth' then 300 when 'premium' then 500 when 'exclusive' then 1000 else 0 end;
  if profile.wallet_settings#>'{capability_overrides,max_voucher_batch_quantity}' is not null then
    cap:=(profile.wallet_settings#>>'{capability_overrides,max_voucher_batch_quantity}')::integer;
  end if;
  if cap not between 1 and 1000 or qty is null or qty not between 1 and least(cap,1000) then
    raise exception using errcode='22023',message='Voucher quantity exceeds configured limits';
  end if;
  prefix:=coalesce(nullif(upper(trim(p_request->>'prefix')),''),'SCH-'||left(upper(profile.slug),24));
  if length(prefix)>40 or prefix !~ '^[A-Z0-9-]+$' then
    raise exception using errcode='22023',message='Voucher prefix is invalid';
  end if;
  if p_request->>'expires_at' is not null then expires:=(p_request->>'expires_at')::timestamptz;
  else
    cap:=coalesce((p_request->>'expires_in_days')::integer,30);
    if cap not between 1 and 365 then raise exception using errcode='22023',message='Voucher expiry is invalid'; end if;
    expires:=now()+make_interval(days=>cap);
  end if;
  if expires is null or not isfinite(expires) or expires<=now() or expires>now()+interval '365 days' then
    raise exception using errcode='22023',message='Voucher expiry is invalid';
  end if;
  roster:=coalesce(p_request->'assigned_students','[]'::jsonb);
  if jsonb_typeof(roster) is distinct from 'array' or jsonb_array_length(roster)>qty then
    raise exception using errcode='22023',message='Voucher roster is invalid';
  end if;
  for assigned in select value from jsonb_array_elements(roster) loop
    if jsonb_typeof(assigned) is distinct from 'object'
      or exists(select 1 from jsonb_each(assigned) kv where kv.key not in ('name','email','phone')
        or jsonb_typeof(kv.value) not in ('string','null'))
      or length(coalesce(assigned->>'name',''))>200 or length(coalesce(assigned->>'email',''))>320
      or length(coalesce(assigned->>'phone',''))>80 then
      raise exception using errcode='22023',message='Voucher roster is invalid';
    end if;
  end loop;
  classroom:=nullif(p_request->>'classroom_id','')::uuid;
  if classroom is not null then
    select c.academy_id into academy from public.academy_classrooms c join public.tenants t on t.id=c.academy_id
      where c.id=classroom and c.is_active=true and t.metadata @> jsonb_build_object('parent_center_id',p_tenant::text,'service_family','academy')
      for share of c,t;
    if not found then raise exception using errcode='42501',message='Classroom is outside this active center'; end if;
  end if;
  model:=profile.commercial_model;
  if model not in ('prepaid_wallet','wholesale','revenue_share') or model is null then
    raise exception using errcode='22023',message='Voucher commercial agreement requires review';
  end if;
  if p_request->>'source_model' is not null and p_request->>'source_model'<>model then
    raise exception using errcode='42501',message='Voucher funding cannot override the configured agreement';
  end if;
  if kind='mock_exam' then
    experience_id:=nullif(p_request->>'experience_id','')::uuid;
    select * into experience from public.experiences where id=experience_id and is_active=true for share;
    if not found or experience.price_amount is null or experience.price_amount<=0 then
      raise exception using errcode='22023',message='Mock experience is not priced or active';
    end if;
    if not coalesce((experience.metadata#>'{ticketing,eligible}'='true'::jsonb and experience.metadata#>>'{ticketing,mode}'='single_sitting'),false)
      and not exists(select 1 from public.products p where p.id=experience.product_id
        and lower(trim(p.metadata->>'slug')) in ('ielts-academic-simulator','ielts-simulator','toefl-ibt-simulator','sat-exam-simulator','sat-simulator','itep-simulator')
        and (lower(trim(coalesce(experience.metadata->>'catalog',experience.metadata->>'kind',experience.metadata->>'type',''))) in ('full_test','mock_test','mock_exam')
          or lower(trim(coalesce(experience.metadata->>'format',experience.metadata->>'exam_format',''))) in ('academic','digital_sat')
          or lower(experience.name) like '%mock%' or lower(experience.name) like '%full test%' or lower(experience.name) like '%practice test%')) then
      raise exception using errcode='22023',message='Experience is not ticket eligible';
    end if;
    product:=experience.product_id; resource:=experience_id; unit_price:=experience.price_amount;
    funding_currency:=upper(experience.price_currency);
    terms:=jsonb_build_object('experience_id',experience_id,'product_id',product,'max_uses',1);
  elsif kind='subscription' then
    plan_id:=nullif(p_request->>'plan_id','')::uuid;
    select * into plan from public.plans where id=plan_id and is_active=true for share;
    if not found or plan.amount is null or plan.amount<0 then
      raise exception using errcode='22023',message='Subscription plan is unavailable';
    end if;
    product:=plan.product_id;resource:=plan_id;unit_price:=plan.amount;funding_currency:=upper(plan.currency);
    terms:=jsonb_build_object('source_plan_id',plan_id,'duration_days',plan.duration_days,
      'included_product_ids',coalesce(plan.metadata->'included_product_ids','[]'::jsonb),'limits',coalesce(plan.metadata->'limits','{}'::jsonb));
    perform public.validate_voucher_access_terms(terms,product,plan_id);
  else
    plan_id:=nullif(p_request->>'plan_id','')::uuid;
    -- Lock, validate and reserve the same exact inventory; never query it twice.
    select array_agg(id order by id) into seat_ids from (
      select s.id from public.seat_licenses s where s.tenant_id=p_tenant and s.plan_id=nullif(p_request->>'plan_id','')::uuid
        and s.status='unassigned' and s.assigned_user_id is null and s.assigned_tenant_id is null
        and s.expires_at>now() and not exists(select 1 from public.voucher_seat_reservations r where r.seat_id=s.id)
        and not exists(select 1 from public.partner_vouchers v where v.seat_license_id=s.id and v.status in ('unused','redeemed'))
      order by s.id limit qty for update of s
    ) available;
    if coalesce(cardinality(seat_ids),0)<>qty then raise exception using errcode='22023',message='Purchased seat inventory is unavailable'; end if;
    foreach token_id in array seat_ids loop
      select * into seat from public.seat_licenses where id=token_id;
      if not exists(select 1 from public.payments p join public.payment_fulfillment_receipts r on r.payment_id=p.id
        where p.id=seat.payment_id and p.status in ('paid','success','completed') and r.purchase_type='seat_pack'
        and (p.tenant_id,p.user_id,p.plan_id,p.product_id)=(seat.tenant_id,seat.purchaser_id,seat.plan_id,seat.product_id)
        and (r.tenant_id,r.user_id)=(p.tenant_id,p.user_id) and p.entitlement_terms=seat.metadata->'entitlement_terms'
        and (r.result->>'seats_created')::integer=(select count(*) from public.seat_licenses where payment_id=p.id)) then
        raise exception using errcode='22023',message='Seat financial evidence requires reconciliation';
      end if;
      perform public.validate_voucher_access_terms(seat.metadata->'entitlement_terms',seat.product_id,seat.plan_id);
      if product is not null and product<>seat.product_id then raise exception using errcode='22023',message='Seat catalogue identity differs'; end if;
      product:=seat.product_id;
      if expires>seat.expires_at then expires:=seat.expires_at; end if;
    end loop;
    unit_price:=0;funding_currency:='UZS';terms:=jsonb_build_object('seat_ids',to_jsonb(seat_ids),'source_plan_id',plan_id);
  end if;
  perform 1 from public.products where id=product and status='active' for share;
  if not found or funding_currency is null or funding_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='22023',message='Voucher product or currency is unavailable';
  end if;
  if kind<>'seat' then
    foreach pricing_key in array array[kind||':'||resource::text,kind||':'||product::text,resource::text,product::text,kind] loop
      raw_price:=profile.wholesale_pricing->pricing_key;
      if raw_price is not null then
        if jsonb_typeof(raw_price) not in ('number','string') or (raw_price#>>'{}') !~ '^[0-9]+$' then
          raise exception using errcode='22023',message='Wholesale price requires review';
        end if;
        unit_price:=(raw_price#>>'{}')::bigint;exit;
      end if;
    end loop;
  end if;
  total:=unit_price*qty;
  if unit_price not between 0 and 2000000000 or total not between 0 and 2000000000 then
    raise exception using errcode='22023',message='Voucher funding amount exceeds supported limits';
  end if;
  if model='prepaid_wallet' and total>0 then
    select coalesce(sum(case when entry_kind in ('topup','credit','commission','refund','adjustment') and status='posted' then amount
      when entry_kind='debit' and status in ('posted','reserved') then -amount else 0 end),0)
      into balance from public.partner_wallet_ledger where tenant_id=p_tenant and upper(partner_wallet_ledger.currency)=funding_currency;
    if balance<total then raise exception using errcode='22023',message='Insufficient partner wallet balance'; end if;
  end if;
  funding:=jsonb_build_object('source_model',model,'unit_price',unit_price,'quantity',qty,'total_amount',total,'currency',funding_currency,
    'commercial_model',profile.commercial_model,'wholesale_pricing',profile.wholesale_pricing);
  batch_code:=prefix||'-'||upper(replace(gen_random_uuid()::text,'-',''));
  insert into public.partner_voucher_batches(id,tenant_id,batch_code,access_kind,product_id,experience_id,plan_id,
    classroom_id,quantity,expires_at,prefix,source_model,created_by,metadata)
  values(batch_id,p_tenant,batch_code,kind,product,experience_id,plan_id,classroom,qty,expires,prefix,model,p_actor,
    jsonb_build_object('unit_price',unit_price,'total_amount',total,'currency',funding_currency,'assigned_students',jsonb_array_length(roster),
      'purchased_terms',terms,'funding',funding)) returning * into batch;
  for i in 1..qty loop
    code:=prefix||'-'||upper(replace(gen_random_uuid()::text,'-',''));token_id:=null;
    if kind='mock_exam' then
      insert into public.exam_tokens(tenant_id,experience_id,token_code,status,expires_at,max_uses,uses_count,created_by,metadata)
      values(p_tenant,experience_id,code,'active',expires,1,0,p_actor,
        jsonb_build_object('source','partner_voucher','batch_id',batch_id,'classroom_id',classroom,'purchased_terms',terms)) returning id into token_id;
    end if;
    assigned:=coalesce(roster->(i-1),'{}'::jsonb);
    recipient_name:=nullif(trim(assigned->>'name'),'');recipient_email:=nullif(lower(trim(assigned->>'email')),'');recipient_phone:=nullif(trim(assigned->>'phone'),'');
    insert into public.partner_vouchers(tenant_id,batch_id,code,access_kind,product_id,experience_id,plan_id,exam_token_id,
      seat_license_id,classroom_id,status,expires_at,assigned_name,assigned_email,assigned_phone,metadata)
    values(p_tenant,batch_id,code,kind,product,experience_id,plan_id,token_id,case when kind='seat' then seat_ids[i] else null end,
      classroom,'unused',expires,recipient_name,recipient_email,recipient_phone,
      jsonb_build_object('batch_code',batch_code,'purchased_terms',case when kind='seat' then
        (select metadata->'entitlement_terms' from public.seat_licenses where id=seat_ids[i]) else terms end)) returning * into item;
    if kind='seat' then
      insert into public.voucher_seat_reservations(seat_id,voucher_id,batch_id,tenant_id,purchased_terms)
        values(seat_ids[i],item.id,batch_id,p_tenant,item.metadata->'purchased_terms');
    end if;
    if recipient_name is not null or recipient_email is not null or recipient_phone is not null then
      select array_agg(id) into roster_ids from public.partner_center_students where tenant_id=p_tenant
        and ((recipient_email is not null and lower(email)=recipient_email) or (recipient_email is null and recipient_phone is not null and phone=recipient_phone));
      if coalesce(cardinality(roster_ids),0)>1 then raise exception using errcode='22023',message='Roster identity requires review'; end if;
      student_id:=roster_ids[1];
      if student_id is null then
        insert into public.partner_center_students(tenant_id,full_name,email,phone,status,source_voucher_id,created_by,metadata)
        values(p_tenant,recipient_name,recipient_email,recipient_phone,'invited',item.id,p_actor,jsonb_build_object('invite_source','voucher_batch_roster','batch_id',batch_id));
      else
        update public.partner_center_students set full_name=coalesce(recipient_name,full_name),email=coalesce(recipient_email,email),
          phone=coalesce(recipient_phone,phone),source_voucher_id=item.id where id=student_id;
      end if;
    end if;
    vouchers:=vouchers||jsonb_build_array(to_jsonb(item));
  end loop;
  if model='prepaid_wallet' and total>0 then
    insert into public.partner_wallet_ledger(tenant_id,user_id,entry_kind,status,amount,currency,voucher_batch_id,created_by,metadata)
    values(p_tenant,p_actor,'debit','posted',total,funding_currency,batch_id,p_actor,jsonb_build_object('access_kind',kind,'quantity',qty,'unit_price',unit_price,'request_key',key));
  end if;
  outcome:=jsonb_build_object('ok',true,'state','issued','deduped',false,'request_key',key,'batch',to_jsonb(batch),'vouchers',vouchers);
  insert into public.voucher_issue_receipts(batch_id,tenant_id,actor_id,request_key,request,purchased_terms,funding,result)
    values(batch_id,p_tenant,p_actor,key,p_request,terms,funding,outcome);
  return outcome;
end; $$;
revoke all on function public.issue_purchased_vouchers(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.issue_purchased_vouchers(uuid,uuid,uuid,jsonb) to service_role;

-- A canceled key is durable. Racing issue/cancel calls use the same advisory
-- lock, so cancellation cannot claim absence while a late request creates stock.
-- This closes only uncommitted intents; it never voids a paid batch or grants.
create function public.cancel_uncreated_voucher_issue(p_actor uuid,p_tenant uuid,p_key uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='20s' as $$
declare saved public.voucher_issue_receipts%rowtype; canceled public.voucher_issue_cancellations%rowtype;
begin
  if p_actor is null or p_tenant is null or p_key is null or jsonb_typeof(p_request) is distinct from 'object'
    or pg_column_size(p_request)>262144 then
    raise exception using errcode='22023',message='Invalid voucher purchase reference';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('voucher-issue:'||p_actor::text||':'||p_key::text,0));
  perform 1 from public.tenants where id=p_tenant for update;
  perform public.assert_center_checkout_actor(p_actor,p_tenant);
  select * into saved from public.voucher_issue_receipts where actor_id=p_actor and request_key=p_key;
  if found then
    if saved.tenant_id<>p_tenant or saved.request is distinct from p_request then
      raise exception using errcode='23505',message='Voucher purchase key belongs to another intent';
    end if;
    if not exists(select 1 from public.partner_voucher_batches where id=saved.batch_id and status='active') then
      raise exception using errcode='23505',message='Committed voucher batch requires review';
    end if;
    return saved.result||jsonb_build_object('deduped',true);
  end if;
  select * into canceled from public.voucher_issue_cancellations where actor_id=p_actor and request_key=p_key;
  if found then
    if canceled.tenant_id<>p_tenant or canceled.request is distinct from p_request then
      raise exception using errcode='23505',message='Voucher purchase key belongs to another intent';
    end if;
  else
    insert into public.voucher_issue_cancellations(actor_id,request_key,tenant_id,request)
      values(p_actor,p_key,p_tenant,p_request);
  end if;
  return jsonb_build_object('ok',true,'state','canceled','request_key',p_key);
end; $$;
revoke all on function public.cancel_uncreated_voucher_issue(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cancel_uncreated_voucher_issue(uuid,uuid,uuid,jsonb) to service_role;

create function public.enforce_voucher_purchase_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='partner_voucher_batches' then
    if exists(select 1 from public.voucher_issue_receipts where batch_id=old.id) then
      if tg_op='DELETE' then raise exception using errcode='23514',message='Voucher purchase evidence must be retained'; end if;
      if (old.id,old.tenant_id,old.access_kind,old.product_id,old.experience_id,old.plan_id,old.classroom_id,
          old.quantity,old.expires_at,old.prefix,old.source_model,old.payment_id,old.created_by,old.batch_code,
          old.metadata->'purchased_terms',old.metadata->'funding') is distinct from
        (new.id,new.tenant_id,new.access_kind,new.product_id,new.experience_id,new.plan_id,new.classroom_id,
          new.quantity,new.expires_at,new.prefix,new.source_model,new.payment_id,new.created_by,new.batch_code,
          new.metadata->'purchased_terms',new.metadata->'funding') then
        raise exception using errcode='23514',message='Voucher purchase identity is immutable';
      end if;
    end if;
  elsif tg_table_name='partner_vouchers' then
    if exists(select 1 from public.voucher_issue_receipts where batch_id=old.batch_id) then
      if tg_op='DELETE' then raise exception using errcode='23514',message='Voucher inventory evidence must be retained'; end if;
      if (old.id,old.tenant_id,old.batch_id,old.code,old.access_kind,old.product_id,old.experience_id,old.plan_id,
          old.exam_token_id,old.seat_license_id,old.classroom_id,old.max_uses,old.expires_at,old.source_payment_id,
          old.metadata->'purchased_terms') is distinct from
        (new.id,new.tenant_id,new.batch_id,new.code,new.access_kind,new.product_id,new.experience_id,new.plan_id,
          new.exam_token_id,new.seat_license_id,new.classroom_id,new.max_uses,new.expires_at,new.source_payment_id,
          new.metadata->'purchased_terms') then
        raise exception using errcode='23514',message='Voucher inventory identity is immutable';
      end if;
    end if;
  else
    if old.entry_kind='debit' and exists(select 1 from public.voucher_issue_receipts where batch_id=old.voucher_batch_id) then
      if tg_op='DELETE' then raise exception using errcode='23514',message='Voucher funding evidence must be retained'; end if;
      if (old.id,old.tenant_id,old.user_id,old.entry_kind,old.amount,old.currency,old.voucher_batch_id,old.created_by)
        is distinct from (new.id,new.tenant_id,new.user_id,new.entry_kind,new.amount,new.currency,new.voucher_batch_id,new.created_by) then
        raise exception using errcode='23514',message='Voucher funding identity is immutable';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger voucher_batch_purchase_identity before update or delete on public.partner_voucher_batches
  for each row execute function public.enforce_voucher_purchase_identity();
create trigger voucher_inventory_purchase_identity before update or delete on public.partner_vouchers
  for each row execute function public.enforce_voucher_purchase_identity();
create trigger voucher_debit_purchase_identity before update or delete on public.partner_wallet_ledger
  for each row execute function public.enforce_voucher_purchase_identity();
revoke all on function public.enforce_voucher_purchase_identity() from public,anon,authenticated,service_role;

-- Admission must also cover legacy/manual ledger writers that do not take the
-- center lock themselves. A BEFORE trigger computes their exact signed delta
-- under that lock. Positive recovery credits may repair existing debt; an
-- additional debit or credit reversal cannot make the balance negative.
create function public.guard_partner_wallet_balance() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope uuid; code text; old_delta numeric:=0; new_delta numeric:=0; balance numeric;
begin
  perform 1 from public.tenants where id in
    (case when tg_op<>'INSERT' then old.tenant_id end,case when tg_op<>'DELETE' then new.tenant_id end)
    order by id for update;
  if tg_op<>'INSERT' then
    old_delta:=case when old.entry_kind in ('topup','credit','commission','refund','adjustment') and old.status='posted' then old.amount
      when old.entry_kind='debit' and old.status in ('posted','reserved') then -old.amount else 0 end;
  end if;
  if tg_op<>'DELETE' then
    new_delta:=case when new.entry_kind in ('topup','credit','commission','refund','adjustment') and new.status='posted' then new.amount
      when new.entry_kind='debit' and new.status in ('posted','reserved') then -new.amount else 0 end;
  end if;
  for scope,code in select distinct candidate_tenant,candidate_currency from (values
    (case when tg_op<>'INSERT' then old.tenant_id end,case when tg_op<>'INSERT' then upper(old.currency) end),
    (case when tg_op<>'DELETE' then new.tenant_id end,case when tg_op<>'DELETE' then upper(new.currency) end)) scopes(candidate_tenant,candidate_currency)
    where candidate_tenant is not null loop
    select coalesce(sum(case when entry_kind in ('topup','credit','commission','refund','adjustment') and status='posted' then amount
      when entry_kind='debit' and status in ('posted','reserved') then -amount else 0 end),0) into balance
      from public.partner_wallet_ledger where tenant_id=scope and upper(currency)=code;
    if (case when tg_op<>'DELETE' and new.tenant_id=scope and upper(new.currency)=code then new_delta else 0 end)
      -(case when tg_op<>'INSERT' and old.tenant_id=scope and upper(old.currency)=code then old_delta else 0 end)<0
      and balance+(case when tg_op<>'DELETE' and new.tenant_id=scope and upper(new.currency)=code then new_delta else 0 end)
        -(case when tg_op<>'INSERT' and old.tenant_id=scope and upper(old.currency)=code then old_delta else 0 end)<0 then
      raise exception using errcode='22023',message='Partner wallet mutation exceeds available funds';
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger partner_wallet_balance_guard before insert or update or delete on public.partner_wallet_ledger
  for each row execute function public.guard_partner_wallet_balance();
revoke all on function public.guard_partner_wallet_balance() from public,anon,authenticated,service_role;
commit;
