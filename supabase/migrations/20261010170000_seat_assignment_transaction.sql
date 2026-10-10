-- Install with reviewed retry-aware consumers. No live catalogue is used for a
-- captured seat. Financial/legacy deletion and reconciliation remain release gates.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.seat_assignment_receipts (
  seat_id uuid primary key references public.seat_licenses(id) on delete restrict,
  buyer_tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_id uuid not null references public.users(id) on delete restrict,
  beneficiary_id uuid not null references public.users(id) on delete restrict,
  beneficiary_tenant_id uuid not null references public.tenants(id) on delete restrict,
  requested_email text not null,
  claim_source text not null check(claim_source in ('direct','voucher')),
  voucher_id uuid references public.partner_vouchers(id) on delete restrict,
  purchased_terms jsonb not null,
  result jsonb not null,
  committed_at timestamptz not null default now(),
  check((claim_source='direct' and voucher_id is null) or (claim_source='voucher' and voucher_id is not null))
);
alter table public.seat_assignment_receipts enable row level security;
revoke all on public.seat_assignment_receipts from public,anon,authenticated,service_role;
grant select on public.seat_assignment_receipts to service_role;
-- Existing UI uses Edge commands for mutation. Keep membership-scoped reads;
-- owner/admin RLS must not let a browser manufacture or reassign paid inventory.
revoke insert,update,delete,truncate,references,trigger on public.seat_licenses from anon,authenticated;

create function public.assert_seat_assignment_actor(p_actor uuid,p_tenant uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.assert_payment_checkout_actor(p_actor,p_tenant);
  perform 1 from public.tenant_memberships where user_id=p_actor and tenant_id=p_tenant
    and status='active' and lower(trim(role)) in ('owner','admin') for share;
  if not found then raise exception using errcode='42501',message='Seat management authority is unavailable'; end if;
  if exists(select 1 from public.partner_center_profiles where tenant_id=p_tenant) then
    perform public.assert_center_checkout_actor(p_actor,p_tenant);
  end if;
end; $$;
revoke all on function public.assert_seat_assignment_actor(uuid,uuid) from public,anon,authenticated,service_role;

-- Caller holds buyer/beneficiary tenant locks in UUID order. This private command
-- is shared with the voucher consumer; receipt, inventory and grants commit together.
create function public.commit_seat_assignment(p_actor uuid,p_buyer uuid,p_seat uuid,p_beneficiary uuid,
  p_target uuid,p_email text,p_voucher uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare seat public.seat_licenses%rowtype; receipt public.seat_assignment_receipts%rowtype;
  purchase public.payments%rowtype; financial public.payment_fulfillment_receipts%rowtype;
  terms jsonb; targets uuid[]; target uuid; days integer; old_end timestamptz;
  old_active boolean; old_found boolean; grant_end timestamptz; seat_end timestamptz;
  outcome jsonb; grant_value jsonb; expected_quantity integer;
begin
  select * into seat from public.seat_licenses where id=p_seat and tenant_id=p_buyer for update;
  if not found then raise exception using errcode='P0002',message='Seat is unavailable'; end if;
  select * into receipt from public.seat_assignment_receipts where seat_id=p_seat;
  if found then
    if (receipt.beneficiary_id,receipt.beneficiary_tenant_id,receipt.requested_email,receipt.voucher_id)
      is distinct from (p_beneficiary,p_target,p_email,p_voucher) then
      raise exception using errcode='23505',message='Seat is already claimed by another purchase intent';
    end if;
    if seat.status<>'active' then raise exception using errcode='23505',message='Committed assignment is unavailable; review its receipt'; end if;
    return receipt.result||jsonb_build_object('deduped',true);
  end if;
  if seat.status<>'unassigned' or seat.assigned_user_id is not null or seat.assigned_tenant_id is not null
    or seat.assigned_at is not null then
    raise exception using errcode='22023',message='Legacy seat assignment requires reconciliation';
  end if;
  if seat.expires_at<=now() then raise exception using errcode='22023',message='Seat assignment window has ended'; end if;
  if exists(select 1 from public.partner_vouchers where seat_license_id=p_seat
    and id is distinct from p_voucher) then
    raise exception using errcode='23505',message='Seat is reserved for a voucher';
  end if;
  select * into purchase from public.payments where id=seat.payment_id;
  select * into financial from public.payment_fulfillment_receipts where payment_id=seat.payment_id;
  if financial.payment_id is null or financial.purchase_type<>'seat_pack'
    or purchase.status not in ('paid','success','completed')
    or (purchase.tenant_id,purchase.user_id,purchase.plan_id,purchase.product_id)
      is distinct from (seat.tenant_id,seat.purchaser_id,seat.plan_id,seat.product_id)
    or (financial.tenant_id,financial.user_id) is distinct from (purchase.tenant_id,purchase.user_id) then
    raise exception using errcode='22023',message='Seat purchase evidence requires reconciliation';
  end if;
  expected_quantity:=(financial.result->>'seats_created')::integer;
  if expected_quantity is null or expected_quantity not between 1 and 500
    or (select count(*) from public.seat_licenses where payment_id=seat.payment_id)<>expected_quantity then
    raise exception using errcode='22023',message='Seat inventory differs from its financial receipt';
  end if;
  terms:=purchase.entitlement_terms;
  if jsonb_typeof(terms) is distinct from 'object' or not(terms ? 'duration_days')
    or nullif(terms->>'source_plan_id','')::uuid is distinct from seat.plan_id
    or seat.metadata->'entitlement_terms' is distinct from terms
    or jsonb_typeof(terms->'included_product_ids') is distinct from 'array'
    or jsonb_array_length(terms->'included_product_ids')>100
    or jsonb_typeof(terms->'limits') is distinct from 'object' then
    raise exception using errcode='22023',message='Seat purchased terms are invalid';
  end if;
  days:=(terms->>'duration_days')::integer;
  if days is not null and days not between 1 and 36500 then
    raise exception using errcode='22023',message='Seat purchased duration is invalid';
  end if;
  select array_agg(distinct id order by id) into targets from (
    select seat.product_id as id union all
    select value::uuid from jsonb_array_elements_text(terms->'included_product_ids')
  ) t;
  if exists(select 1 from unnest(targets) as requested(product_id) where requested.product_id is null
    or not exists(select 1 from public.products p where p.id=requested.product_id)) then
    raise exception using errcode='22023',message='Seat purchased products are unavailable';
  end if;
  if exists(select 1 from jsonb_each(terms->'limits') kv where length(kv.key)>64 or case
    when jsonb_typeof(kv.value)<>'number' then true
    else (kv.value::text)::numeric<0 or (kv.value::text)::numeric>2147483647
      or (kv.value::text)::numeric<>trunc((kv.value::text)::numeric) end) then
    raise exception using errcode='22023',message='Seat purchased limits are invalid';
  end if;
  grant_value:=jsonb_build_object('plan_id',seat.plan_id,'seat_id',seat.id,'payment_id',purchase.id,'limits',terms->'limits');
  foreach target in array targets loop
    select ends_at,is_active into old_end,old_active from public.entitlements
      where tenant_id=p_target and resource_type='product' and resource_id=target for update;
    old_found:=found;
    grant_end:=case when days is null or (old_found and old_active and old_end is null) then null
      else greatest(now(),case when old_active then coalesce(old_end,now()) else now() end)+make_interval(days=>days) end;
    -- Preserve the published seat summary: latest finite granted product end.
    -- Lifetime access remains unbounded on its entitlement and is never shortened.
    if grant_end is not null then seat_end:=greatest(seat_end,grant_end); end if;
    insert into public.entitlements(user_id,tenant_id,resource_type,resource_id,is_active,starts_at,ends_at,source,value)
      values(p_beneficiary,p_target,'product',target,true,now(),grant_end,'seat',grant_value)
      on conflict(tenant_id,resource_type,resource_id) do update set user_id=excluded.user_id,is_active=true,
        starts_at=excluded.starts_at,ends_at=excluded.ends_at,source=excluded.source,value=excluded.value;
  end loop;
  update public.seat_licenses set assigned_user_id=p_beneficiary,assigned_tenant_id=p_target,status='active',
    assigned_at=now(),starts_at=now(),ends_at=seat_end where id=p_seat returning * into seat;
  outcome:=jsonb_build_object('ok',true,'state','assigned','deduped',false,'seat',to_jsonb(seat),
    'grant',jsonb_build_object('product_ids',to_jsonb(targets),'starts_at',seat.starts_at,'ends_at',seat.ends_at));
  insert into public.seat_assignment_receipts(seat_id,buyer_tenant_id,actor_id,beneficiary_id,beneficiary_tenant_id,
    requested_email,claim_source,voucher_id,purchased_terms,result)
  values(p_seat,p_buyer,p_actor,p_beneficiary,p_target,p_email,case when p_voucher is null then 'direct' else 'voucher' end,
    p_voucher,terms,outcome);
  return outcome;
end; $$;
revoke all on function public.commit_seat_assignment(uuid,uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.assign_purchased_seat(p_actor uuid,p_buyer uuid,p_seat uuid,p_email text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='15s' as $$
declare receipt public.seat_assignment_receipts%rowtype; recipient uuid; target uuid;
  recipient_email text:=lower(trim(p_email)); ids uuid[];
begin
  if p_actor is null or p_buyer is null or p_seat is null or recipient_email is null or recipient_email='' or length(recipient_email)>320 then
    raise exception using errcode='22023',message='Valid seat and recipient email are required';
  end if;
  -- A nonlocking scope check avoids private receipt/account enumeration. The
  -- locked admission below remains authoritative for this transaction.
  if not exists(select 1 from public.users u join public.tenant_memberships m on m.user_id=u.id
    where u.id=p_actor and u.is_active=true and m.tenant_id=p_buyer and m.status='active'
      and lower(trim(m.role)) in ('owner','admin')) then
    raise exception using errcode='42501',message='Seat management authority is unavailable';
  end if;
  perform 1 from public.seat_licenses where id=p_seat and tenant_id=p_buyer;
  if not found then raise exception using errcode='P0002',message='Seat is unavailable'; end if;
  select * into receipt from public.seat_assignment_receipts where seat_id=p_seat and buyer_tenant_id=p_buyer;
  if found then
    if receipt.buyer_tenant_id<>p_buyer or receipt.requested_email<>recipient_email or receipt.claim_source<>'direct' then
      raise exception using errcode='23505',message='Seat is already claimed by another purchase intent';
    end if;
    recipient:=receipt.beneficiary_id;target:=receipt.beneficiary_tenant_id;
  else
    select array_agg(id) into ids from public.users where lower(trim(users.email))=recipient_email and is_active=true;
    if coalesce(cardinality(ids),0)<>1 then raise exception using errcode='22023',message='Recipient account is unavailable or ambiguous'; end if;
    recipient:=ids[1];
    select array_agg(m.tenant_id) into ids from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
      where m.user_id=recipient and m.status='active' and lower(trim(m.role))='owner' and t.type='personal';
    if coalesce(cardinality(ids),0)<>1 then raise exception using errcode='22023',message='Recipient personal account requires review'; end if;
    target:=ids[1];
  end if;
  -- Lock tenants before domain rows. Two managers renewing one recipient, and
  -- reciprocal buyer/recipient scopes, cannot lose time or invert tenant locks.
  perform 1 from public.tenants where id in (p_buyer,target) order by id for update;
  perform public.assert_seat_assignment_actor(p_actor,p_buyer);
  perform public.assert_payment_checkout_actor(recipient,target);
  perform 1 from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
    where m.user_id=recipient and m.tenant_id=target and m.status='active' and lower(trim(m.role))='owner' and t.type='personal'
    for share of m;
  if not found then raise exception using errcode='42501',message='Recipient account is unavailable'; end if;
  if receipt.seat_id is null then
    perform 1 from public.users where id=recipient and lower(trim(users.email))=recipient_email and is_active=true for share;
    if not found then raise exception using errcode='42501',message='Recipient account changed; retry the original assignment'; end if;
  end if;
  return public.commit_seat_assignment(p_actor,p_buyer,p_seat,recipient,target,recipient_email);
end; $$;
revoke all on function public.assign_purchased_seat(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.assign_purchased_seat(uuid,uuid,uuid,text) to service_role;

create function public.enforce_purchased_seat_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.payment_fulfillment_receipts where payment_id=old.payment_id)
    or exists(select 1 from public.seat_assignment_receipts where seat_id=old.id) then
    if tg_op='DELETE' then raise exception using errcode='23514',message='Purchased seat evidence must be retained'; end if;
    if (old.id,old.tenant_id,old.plan_id,old.product_id,old.purchaser_id,old.payment_id,old.expires_at,old.metadata->'entitlement_terms')
      is distinct from (new.id,new.tenant_id,new.plan_id,new.product_id,new.purchaser_id,new.payment_id,new.expires_at,new.metadata->'entitlement_terms') then
      raise exception using errcode='23514',message='Purchased seat identity is immutable';
    end if;
  end if;
  if exists(select 1 from public.seat_assignment_receipts where seat_id=old.id)
    and (old.assigned_user_id,old.assigned_tenant_id,old.assigned_at,old.starts_at,old.ends_at)
      is distinct from (new.assigned_user_id,new.assigned_tenant_id,new.assigned_at,new.starts_at,new.ends_at) then
    raise exception using errcode='23514',message='Committed seat assignment is immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger purchased_seat_identity before update or delete on public.seat_licenses
  for each row execute function public.enforce_purchased_seat_identity();
revoke all on function public.enforce_purchased_seat_identity() from public,anon,authenticated,service_role;
commit;
