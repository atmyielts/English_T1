-- Serialize invoice commands on their invoice row. Payment balance checks and
-- settlement, cancellation, and the staff activation click are one transaction.
-- Existing tables and clients remain compatible; only the service-role API may call.
create or replace function public.company_invoice_command(
  p_invoice uuid, p_actor uuid, p_action text, p_input jsonb, p_now timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv public.company_invoices%rowtype;
  org public.company_orgs%rowtype;
  contract public.company_contracts%rowtype;
  payment_id uuid;
  amount bigint;
  paid bigint;
  paid_day date;
  day date := (p_now at time zone 'Asia/Tashkent')::date;
  seats integer;
  tests integer;
  used integer;
  ends timestamptz;
  next_doc integer;
  doc_year integer;
  granted boolean := false;
begin
  select * into inv from public.company_invoices where id = p_invoice for update;
  if not found then return jsonb_build_object('code','invoice_not_found','message','Invoice not found.','status',404); end if;

  if p_action = 'payment' then
    if inv.status = 'void' then return jsonb_build_object('code','invoice_void','message','This invoice was cancelled.','status',409); end if;
    if p_input->>'key' is not null then
      select id into payment_id from public.company_invoice_payments where invoice_id = inv.id and client_key = p_input->>'key';
      if found then return jsonb_build_object('invoice',to_jsonb(inv),'duplicate',true); end if;
    end if;
    amount := (p_input->>'amount')::bigint;
    paid_day := coalesce((p_input->>'paid_on')::date, day);
    if amount is null or amount <= 0 or amount > 10000000000000 then return jsonb_build_object('code','invalid_field','message','Enter a valid payment amount.','status',400,'field','amount'); end if;
    if paid_day > day then return jsonb_build_object('code','payment_in_future','message','A payment cannot be dated in the future.','status',400,'field','paid_on'); end if;
    select coalesce(sum(p.amount),0) into paid from public.company_invoice_payments p where invoice_id = inv.id;
    if amount > inv.total - paid then return jsonb_build_object('code','payment_too_large','message','The payment exceeds the remaining balance.','status',409,'field','amount','balance',inv.total-paid); end if;
    insert into public.company_invoice_payments(invoice_id,org_id,amount,paid_on,reference,client_key,created_by)
      values(inv.id,inv.org_id,amount,paid_day,p_input->>'reference',p_input->>'key',p_actor) returning id into payment_id;
    paid := paid + amount;
    select max(p.paid_on) into paid_day from public.company_invoice_payments p where invoice_id = inv.id;
    update public.company_invoices set paid_amount = paid,
      status = case when paid >= inv.total and inv.total > 0 then 'paid' else 'partial' end,
      paid_on = case when paid >= inv.total and inv.total > 0 then paid_day else null end
      where id = inv.id returning * into inv;
    return jsonb_build_object('invoice',to_jsonb(inv),'payment',payment_id,'duplicate',false);

  elsif p_action = 'remove_payment' then
    delete from public.company_invoice_payments where id = (p_input->>'payment')::uuid and invoice_id = inv.id returning id, company_invoice_payments.amount into payment_id, amount;
    if not found then return jsonb_build_object('code','payment_not_found','message','Payment not found.','status',404); end if;
    select coalesce(sum(p.amount),0), max(p.paid_on) into paid, paid_day from public.company_invoice_payments p where invoice_id = inv.id;
    update public.company_invoices set paid_amount = paid,
      status = case when inv.status = 'void' then 'void' when paid >= inv.total and inv.total > 0 then 'paid' when paid > 0 then 'partial' else 'issued' end,
      paid_on = case when paid >= inv.total and inv.total > 0 then paid_day else null end
      where id = inv.id returning * into inv;
    return jsonb_build_object('invoice',to_jsonb(inv),'payment',payment_id,'amount',amount);

  elsif p_action = 'void' then
    if inv.status = 'void' then return jsonb_build_object('invoice',to_jsonb(inv),'duplicate',true); end if;
    if exists(select 1 from public.company_invoice_payments where invoice_id = inv.id) then return jsonb_build_object('code','invoice_has_payments','message','Remove the payments before cancelling this invoice.','status',409); end if;
    update public.company_invoices set status = 'void' where id = inv.id returning * into inv;
    return jsonb_build_object('invoice',to_jsonb(inv),'duplicate',false);

  elsif p_action = 'act' then
    if inv.status = 'void' then return jsonb_build_object('code','invoice_void','message','This invoice was cancelled.','status',409); end if;
    paid_day := coalesce((p_input->>'act_date')::date, inv.act_date, day);
    if inv.act_number is null then
      doc_year := extract(year from paid_day)::integer;
      insert into public.company_doc_counters(kind,year,last) values('act',doc_year,1)
        on conflict(kind,year) do update set last = public.company_doc_counters.last + 1
        returning last into next_doc;
      inv.act_number := 'A-' || doc_year || '-' || lpad(next_doc::text,5,'0');
    end if;
    update public.company_invoices set act_number = inv.act_number, act_date = paid_day where id = inv.id returning * into inv;
    return jsonb_build_object('invoice',to_jsonb(inv));

  elsif p_action = 'activate' then
    if inv.status <> 'paid' then return jsonb_build_object('code','invoice_unpaid','message','Record the full payment before activating seats.','status',409); end if;
    if inv.activated_at is not null then return jsonb_build_object('invoice',to_jsonb(inv),'duplicate',true); end if;
    select * into org from public.company_orgs where id = inv.org_id for update;
    if org.status = 'closed' then return jsonb_build_object('code','org_closed','message','This workspace is closed.','status',409); end if;
    if inv.contract_id is not null then select * into contract from public.company_contracts where id = inv.contract_id and org_id = org.id; end if;
    seats := case when p_input ? 'seats_limit' then (p_input->>'seats_limit')::integer else coalesce(contract.seats,org.seats_limit) end;
    select count(*) into used from public.company_members where org_id = org.id and seat and status <> 'removed';
    if seats < used then return jsonb_build_object('code','seats_below_used','message','Turn off seats before reducing the limit.','status',409,'field','seats_limit','used',used); end if;
    -- A contract's tests are granted once: a later invoice on it (an instalment) keeps the limit.
    -- Read after the org lock, so two invoices of one contract activated together see each other.
    granted := contract.id is not null and exists(select 1 from public.company_invoices i where i.contract_id = contract.id and i.id <> inv.id and i.activated_at is not null);
    tests := case when p_input ? 'tests_limit' then (p_input->>'tests_limit')::integer when contract.id is not null and not granted then case when contract.tests is null then null else org.tests_used + contract.tests end else org.tests_limit end;
    ends := case when p_input ? 'contract_ends_at' then (p_input->>'contract_ends_at')::timestamptz when contract.end_date is not null then ((contract.end_date + time '23:59:59') at time zone 'Asia/Tashkent') else org.contract_ends_at end;
    if ends is not null and ends <= p_now then return jsonb_build_object('code','contract_end_past','message','Choose a contract end in the future.','status',400,'field','contract_ends_at'); end if;
    if seats is null or seats < 0 or seats > 100000 or tests < 0 then return jsonb_build_object('code','invalid_field','message','Enter a valid plan limit.','status',400); end if;
    update public.company_orgs set status = 'active', seats_limit = seats, tests_limit = tests, contract_ends_at = ends where id = org.id;
    update public.company_invoices set activated_at = p_now, activated_by = p_actor where id = inv.id returning * into inv;
    return jsonb_build_object('invoice',to_jsonb(inv),'duplicate',false);
  end if;
  return jsonb_build_object('code','invalid_field','message','Unknown invoice action.','status',400);
end;
$$;
revoke all on function public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz) to service_role;
