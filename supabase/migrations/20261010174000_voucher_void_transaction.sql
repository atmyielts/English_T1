-- Close unused stock atomically. Voiding does not refund funding, restore stock,
-- remove seat reservations or rewrite the original purchase/claim evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.voucher_void_receipts (
  voucher_id uuid primary key references public.partner_vouchers(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_id uuid not null references public.users(id) on delete restrict,
  exam_token_id uuid unique references public.exam_tokens(id) on delete restrict,
  reason text not null check(length(reason) between 1 and 500),
  result jsonb not null,
  committed_at timestamptz not null default now()
);
alter table public.voucher_void_receipts enable row level security;
revoke all on public.voucher_void_receipts from public,anon,authenticated,service_role;
grant select on public.voucher_void_receipts to service_role;

create function public.void_unused_voucher(p_actor uuid,p_tenant uuid,p_voucher uuid,p_reason text default 'voided_by_center') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
set lock_timeout='3s' set statement_timeout='15s' as $$
declare voucher public.partner_vouchers%rowtype; token public.exam_tokens%rowtype;
  receipt public.voucher_void_receipts%rowtype; outcome jsonb;
  reason text:=coalesce(nullif(trim(p_reason),''),'voided_by_center');
begin
  if p_actor is null or p_tenant is null or p_voucher is null or length(reason)>500 then
    raise exception using errcode='22023',message='Valid voucher closure is required';
  end if;
  -- Same tenant-before-inventory order as issuance, redemption and admission.
  perform 1 from public.tenants where id=p_tenant for update;
  perform public.assert_center_checkout_actor(p_actor,p_tenant);
  select * into voucher from public.partner_vouchers where id=p_voucher and tenant_id=p_tenant for update;
  if not found then raise exception using errcode='P0002',message='Voucher is unavailable'; end if;
  select * into receipt from public.voucher_void_receipts where voucher_id=voucher.id;
  if found then
    if voucher.status<>'void' then raise exception using errcode='23505',message='Voucher closure requires review'; end if;
    return receipt.result||jsonb_build_object('deduped',true);
  end if;
  if voucher.status<>'unused' or voucher.redeemed_by is not null or voucher.redeemed_at is not null or voucher.uses_count<>0
    or exists(select 1 from public.voucher_redemption_receipts where voucher_id=voucher.id)
    or exists(select 1 from public.exam_admission_receipts where voucher_id=voucher.id) then
    raise exception using errcode='23505',message='Only unused unclaimed vouchers can be voided';
  end if;
  if voucher.exam_token_id is not null then
    select * into token from public.exam_tokens where id=voucher.exam_token_id for update;
    if not found or token.tenant_id<>p_tenant or token.experience_id is distinct from voucher.experience_id
      or token.token_code<>voucher.code or token.status<>'active' or token.claimed_by is not null or token.claimed_at is not null or token.uses_count<>0
      or exists(select 1 from public.partner_vouchers where exam_token_id=token.id and id<>voucher.id)
      or exists(select 1 from public.sessions where token_id=token.id)
      or exists(select 1 from public.exam_registrations where token_id=token.id)
      or exists(select 1 from public.exam_admission_receipts where token_id=token.id) then
      raise exception using errcode='23505',message='Linked exam code requires review';
    end if;
    update public.exam_tokens set status='disabled' where id=token.id;
  end if;
  update public.partner_vouchers set status='void',metadata=coalesce(metadata,'{}'::jsonb)||
    jsonb_build_object('reason',reason,'voided_by',p_actor,'voided_at',now())
    where id=voucher.id returning * into voucher;
  outcome:=jsonb_build_object('ok',true,'state','void','deduped',false,'voucher',to_jsonb(voucher));
  insert into public.voucher_void_receipts(voucher_id,tenant_id,actor_id,exam_token_id,reason,result)
    values(voucher.id,p_tenant,p_actor,voucher.exam_token_id,reason,outcome);
  return outcome;
end; $$;
revoke all on function public.void_unused_voucher(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_unused_voucher(uuid,uuid,uuid,text) to service_role;

create function public.enforce_voucher_void_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='partner_vouchers' and exists(select 1 from public.voucher_void_receipts where voucher_id=old.id) then
    if tg_op='DELETE' or to_jsonb(old) is distinct from to_jsonb(new) then
      raise exception using errcode='23514',message='Voided voucher evidence is immutable';
    end if;
  elsif tg_table_name='exam_tokens' and exists(select 1 from public.voucher_void_receipts where exam_token_id=old.id) then
    if tg_op='DELETE' or (old.id,old.tenant_id,old.experience_id,old.token_code,old.expires_at,old.created_by,old.claimed_by,old.claimed_at,
      old.uses_count,old.max_uses,old.metadata) is distinct from
      (new.id,new.tenant_id,new.experience_id,new.token_code,new.expires_at,new.created_by,new.claimed_by,new.claimed_at,
       new.uses_count,new.max_uses,new.metadata) or new.status<>'disabled' then
      raise exception using errcode='23514',message='Voided exam code evidence is immutable';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger voucher_void_identity before update or delete on public.partner_vouchers
  for each row execute function public.enforce_voucher_void_identity();
create trigger exam_token_void_identity before update or delete on public.exam_tokens
  for each row execute function public.enforce_voucher_void_identity();
revoke all on function public.enforce_voucher_void_identity() from public,anon,authenticated,service_role;
commit;
