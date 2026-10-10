-- Install only with the reviewed voucher-redeem consumer. Legacy vouchers without
-- purchase evidence require reconciliation; never infer their sold access terms.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.voucher_redemption_receipts (
  voucher_id uuid primary key references public.partner_vouchers(id) on delete restrict,
  center_tenant_id uuid not null references public.tenants(id) on delete restrict,
  beneficiary_id uuid not null references public.users(id) on delete restrict,
  beneficiary_tenant_id uuid not null references public.tenants(id) on delete restrict,
  purchased_terms jsonb not null,
  result jsonb not null,
  committed_at timestamptz not null default now()
);
alter table public.voucher_redemption_receipts enable row level security;
revoke all on public.voucher_redemption_receipts from public,anon,authenticated,service_role;
grant select on public.voucher_redemption_receipts to service_role;

create function public.redeem_purchased_voucher(p_actor uuid,p_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='20s' as $$
declare voucher public.partner_vouchers%rowtype; receipt public.voucher_redemption_receipts%rowtype;
  issuance public.voucher_issue_receipts%rowtype; target uuid; ids uuid[]; academy uuid;
  classroom public.academy_classrooms%rowtype; beneficiary_email text; full_name text; original_scope jsonb;
  terms jsonb; targets uuid[]; product uuid; days integer; old_end timestamptz; old_active boolean;
  old_found boolean; ends timestamptz; primary_end timestamptz; grant_result jsonb; outcome jsonb;
  legacy_start timestamptz; legacy_end timestamptz;
  student public.partner_center_students%rowtype; contact public.academy_contacts%rowtype;
begin
  if p_actor is null or p_code is null or p_code !~ '^[A-Z0-9-]{6,90}$' then
    raise exception using errcode='22023',message='Valid voucher reference is required';
  end if;
  -- The beneficiary comes exclusively from verified bearer identity at the Edge.
  -- Never accept a caller-selected destination or fall back to a business tenant.
  select * into voucher from public.partner_vouchers where code=p_code;
  if not found then raise exception using errcode='P0002',message='Voucher is unavailable'; end if;
  original_scope:=jsonb_build_array(voucher.id,voucher.tenant_id,voucher.classroom_id);
  select * into receipt from public.voucher_redemption_receipts where voucher_id=voucher.id;
  if found then
    if receipt.beneficiary_id<>p_actor then raise exception using errcode='42501',message='Voucher is unavailable for this account'; end if;
    target:=receipt.beneficiary_tenant_id;
  else
    select array_agg(m.tenant_id) into ids from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
      where m.user_id=p_actor and m.status='active' and lower(trim(m.role))='owner' and t.type='personal';
    if coalesce(cardinality(ids),0)<>1 then raise exception using errcode='22023',message='Personal account requires review'; end if;
    target:=ids[1];
  end if;
  select academy_id into academy from public.academy_classrooms where id=voucher.classroom_id;
  perform 1 from public.tenants where id in (voucher.tenant_id,target,academy) order by id for update;
  perform public.assert_payment_checkout_actor(p_actor,target);
  perform 1 from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id
    where m.user_id=p_actor and m.tenant_id=target and m.status='active' and lower(trim(m.role))='owner' and t.type='personal'
    for share of m;
  if not found then raise exception using errcode='42501',message='Personal account is unavailable'; end if;
  select nullif(lower(trim(a.email)),'') into beneficiary_email from auth.users a where a.id=p_actor and a.email_confirmed_at is not null for share;
  select nullif(trim(to_jsonb(u)->>'full_name'),'') into full_name from public.users u where u.id=p_actor;
  select * into voucher from public.partner_vouchers where code=p_code for update;
  if not found or original_scope is distinct from jsonb_build_array(voucher.id,voucher.tenant_id,voucher.classroom_id) then
    raise exception using errcode='23505',message='Voucher scope changed; retry its original reference';
  end if;
  select * into receipt from public.voucher_redemption_receipts where voucher_id=voucher.id;
  if found then
    if (receipt.beneficiary_id,receipt.beneficiary_tenant_id,voucher.redeemed_by,voucher.status)
      is distinct from (p_actor,target,p_actor,'redeemed'::text) then
      raise exception using errcode='23505',message='Committed voucher requires review';
    end if;
    return receipt.result||jsonb_build_object('deduped',true);
  end if;
  -- An already redeemed legacy voucher can confirm its recorded grant to its
  -- original beneficiary. This read-only replay never renews access, debits a
  -- wallet, or manufactures a purchased financial receipt. Require corroborating
  -- access in this personal tenant, rather than trusting editable metadata alone.
  if voucher.status='redeemed' and voucher.redeemed_by=p_actor and voucher.redeemed_at is not null
    and voucher.access_kind in('subscription','seat') and voucher.metadata->'purchased_terms' is null
    and not exists(select 1 from public.voucher_issue_receipts where batch_id=voucher.batch_id) then
    grant_result:=voucher.metadata->'grant';
    if jsonb_typeof(grant_result) is distinct from 'object'
      or jsonb_typeof(grant_result->'product_ids') is distinct from 'array'
      or jsonb_typeof(grant_result->'starts_at') is distinct from 'string'
      or not(grant_result ? 'ends_at')
      or jsonb_typeof(grant_result->'ends_at') not in('string','null') then
      raise exception using errcode='22023',message='Legacy voucher confirmation requires review';
    end if;
    begin
      select array_agg(value::uuid order by value::uuid) into targets from jsonb_array_elements_text(grant_result->'product_ids');
      legacy_start:=(grant_result->>'starts_at')::timestamptz;
      legacy_end:=(grant_result->>'ends_at')::timestamptz;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='22023',message='Legacy voucher confirmation requires review';
    end;
    if coalesce(cardinality(targets),0) not between 1 and 101
      or (select count(distinct p) from unnest(targets) p)<>cardinality(targets)
      or not(voucher.product_id=any(targets)) or not isfinite(legacy_start)
      or legacy_start>voucher.redeemed_at
      or (legacy_end is not null and (not isfinite(legacy_end) or legacy_end<=legacy_start)) then
      raise exception using errcode='22023',message='Legacy voucher confirmation requires review';
    end if;
    perform 1 from public.entitlements e where e.tenant_id=target and e.resource_type='product'
      and e.resource_id=any(targets) order by e.id for share;
    foreach product in array targets loop
      if not exists(select 1 from public.entitlements e where e.tenant_id=target and e.user_id=p_actor
        and e.resource_type='product' and e.resource_id=product and e.starts_at<=legacy_start
        and (e.ends_at is null or (legacy_end is not null and e.ends_at>=legacy_end))) then
        raise exception using errcode='22023',message='Legacy voucher confirmation requires review';
      end if;
    end loop;
    return jsonb_build_object('ok',true,'state','redeemed','deduped',true,'legacy_confirmation',true,
      'voucher_id',voucher.id,'beneficiary_id',p_actor,'beneficiary_tenant_id',target,'redeemed_at',voucher.redeemed_at,
      'grant',jsonb_build_object('product_ids',to_jsonb(targets),'starts_at',legacy_start,'ends_at',legacy_end));
  end if;
  if voucher.status<>'unused' or voucher.redeemed_by is not null or voucher.redeemed_at is not null or voucher.uses_count<>0
    or voucher.expires_at<=now() or voucher.access_kind not in ('subscription','seat') then
    raise exception using errcode='22023',message='Voucher is unavailable or requires reconciliation';
  end if;
  if nullif(lower(trim(voucher.assigned_email)),'') is not null
    and (beneficiary_email is null or beneficiary_email<>lower(trim(voucher.assigned_email))) then
    raise exception using errcode='42501',message='Voucher is assigned to another verified account';
  end if;
  perform 1 from public.partner_center_profiles where tenant_id=voucher.tenant_id and status='active' for share;
  if not found then raise exception using errcode='42501',message='Center is unavailable'; end if;
  select * into issuance from public.voucher_issue_receipts where batch_id=voucher.batch_id;
  if not found or issuance.tenant_id<>voucher.tenant_id
    or not exists(select 1 from public.partner_voucher_batches where id=voucher.batch_id and status='active') then
    raise exception using errcode='22023',message='Voucher purchase evidence requires reconciliation';
  end if;
  terms:=voucher.metadata->'purchased_terms';
  perform public.validate_voucher_access_terms(terms,voucher.product_id,voucher.plan_id);
  if voucher.access_kind='seat' then
    if not exists(select 1 from public.voucher_seat_reservations where seat_id=voucher.seat_license_id
      and voucher_id=voucher.id and batch_id=voucher.batch_id and tenant_id=voucher.tenant_id and purchased_terms=terms) then
      raise exception using errcode='22023',message='Voucher seat reservation requires review';
    end if;
    outcome:=public.commit_seat_assignment(p_actor,voucher.tenant_id,voucher.seat_license_id,p_actor,target,coalesce(beneficiary_email,''),voucher.id);
    grant_result:=outcome->'grant';
  else
    if terms is distinct from issuance.purchased_terms then raise exception using errcode='22023',message='Voucher purchase terms require review'; end if;
    days:=(terms->>'duration_days')::integer;
    select array_agg(distinct id order by id) into targets from (
      select voucher.product_id as id union all select value::uuid from jsonb_array_elements_text(terms->'included_product_ids')
    ) products;
    foreach product in array targets loop
      select ends_at,is_active into old_end,old_active from public.entitlements
        where tenant_id=target and resource_type='product' and resource_id=product for update;
      old_found:=found;
      ends:=case when days is null or (old_found and old_active and old_end is null) then null
        else greatest(now(),case when old_active then coalesce(old_end,now()) else now() end)+make_interval(days=>days) end;
      if product=voucher.product_id then primary_end:=ends; end if;
      insert into public.entitlements(user_id,tenant_id,resource_type,resource_id,is_active,starts_at,ends_at,source,value)
        values(p_actor,target,'product',product,true,now(),ends,'partner_voucher',jsonb_build_object('plan_id',voucher.plan_id,'voucher_id',voucher.id,'limits',terms->'limits'))
        on conflict(tenant_id,resource_type,resource_id) do update set user_id=excluded.user_id,is_active=true,
          starts_at=excluded.starts_at,ends_at=excluded.ends_at,source=excluded.source,value=excluded.value;
    end loop;
    grant_result:=jsonb_build_object('product_ids',to_jsonb(targets),'starts_at',now(),'ends_at',primary_end);
  end if;

  -- Match the signed-in account or its verified email only. Unverified profile
  -- phone/name must never take over another student or an academy contact.
  select * into student from public.partner_center_students where tenant_id=voucher.tenant_id and user_id=p_actor for update;
  if not found and beneficiary_email is not null then
    select * into student from public.partner_center_students where tenant_id=voucher.tenant_id and lower(email)=beneficiary_email for update;
    if found and student.user_id is not null and student.user_id<>p_actor then
      raise exception using errcode='23505',message='Student identity requires review';
    end if;
  end if;
  if student.id is null then
    insert into public.partner_center_students(tenant_id,user_id,full_name,email,status,source_voucher_id,last_activity_at,metadata)
      values(voucher.tenant_id,p_actor,coalesce(full_name,voucher.assigned_name),beneficiary_email,'active',voucher.id,now(),jsonb_build_object('redeemed_via','voucher-redeem'));
  else
    update public.partner_center_students set user_id=p_actor,status='active',source_voucher_id=voucher.id,last_activity_at=now()
      where id=student.id;
  end if;
  if voucher.classroom_id is not null then
    select * into classroom from public.academy_classrooms where id=voucher.classroom_id and academy_id=academy and is_active=true for share;
    if not found or not exists(select 1 from public.tenants where id=academy
      and metadata @> jsonb_build_object('parent_center_id',voucher.tenant_id,'service_family','academy')) then
      raise exception using errcode='22023',message='Voucher classroom requires review';
    end if;
    if (select count(*) from public.academy_contacts where academy_id=academy and user_id=p_actor)>1 then
      raise exception using errcode='23505',message='Academy identity requires review';
    end if;
    select * into contact from public.academy_contacts where academy_id=academy and user_id=p_actor for update;
    if not found and beneficiary_email is not null then
      select * into contact from public.academy_contacts where academy_id=academy and lower(academy_contacts.email)=beneficiary_email for update;
      if found and contact.user_id is not null and contact.user_id<>p_actor then
        raise exception using errcode='23505',message='Academy identity requires review';
      end if;
    end if;
    if contact.id is null then
      insert into public.academy_contacts(academy_id,user_id,first_name,email,status,last_activity_at,metadata)
        values(academy,p_actor,coalesce(full_name,voucher.assigned_name,''),beneficiary_email,'active',now(),jsonb_build_object('source','partner_voucher_redeem')) returning * into contact;
    else
      update public.academy_contacts set user_id=p_actor,status='active',last_activity_at=now() where id=contact.id;
    end if;
    insert into public.academy_classroom_memberships(academy_id,classroom_id,contact_id,role,metadata)
      values(academy,classroom.id,contact.id,'student',jsonb_build_object('source','partner_voucher_redeem','voucher_id',voucher.id))
      on conflict(classroom_id,contact_id) do nothing;
  end if;
  update public.partner_vouchers set status='redeemed',redeemed_by=p_actor,redeemed_at=now(),uses_count=1,
    metadata=metadata||jsonb_build_object('redeemed_via','voucher-redeem','grant',grant_result) where id=voucher.id;
  outcome:=jsonb_build_object('ok',true,'state','redeemed','deduped',false,'voucher_id',voucher.id,
    'beneficiary_id',p_actor,'beneficiary_tenant_id',target,'redeemed_at',now(),'grant',grant_result);
  insert into public.voucher_redemption_receipts(voucher_id,center_tenant_id,beneficiary_id,beneficiary_tenant_id,purchased_terms,result)
    values(voucher.id,voucher.tenant_id,p_actor,target,terms,outcome);
  return outcome;
end; $$;
revoke all on function public.redeem_purchased_voucher(uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_purchased_voucher(uuid,text) to service_role;

create function public.enforce_voucher_redemption_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.voucher_redemption_receipts where voucher_id=old.id) then
    if tg_op='DELETE' or (old.tenant_id,old.code,old.access_kind,old.batch_id,old.product_id,old.plan_id,
      old.seat_license_id,old.classroom_id,old.redeemed_by,old.redeemed_at,old.uses_count,old.metadata->'purchased_terms')
      is distinct from (new.tenant_id,new.code,new.access_kind,new.batch_id,new.product_id,new.plan_id,
      new.seat_license_id,new.classroom_id,new.redeemed_by,new.redeemed_at,new.uses_count,new.metadata->'purchased_terms') then
      raise exception using errcode='23514',message='Voucher redemption evidence is immutable';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger voucher_redemption_identity before update or delete on public.partner_vouchers
  for each row execute function public.enforce_voucher_redemption_identity();
revoke all on function public.enforce_voucher_redemption_identity() from public,anon,authenticated,service_role;
commit;
