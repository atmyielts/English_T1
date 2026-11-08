\set ON_ERROR_STOP 1
\i /work/migration.sql

create function public.company_test_activation_failure() returns trigger language plpgsql as $$
begin
  if new.name = 'Fail activation for test' and new.seats_limit = 7 then raise exception 'simulated workspace write failure'; end if;
  return new;
end;
$$;
create trigger company_test_activation_failure before update on public.company_orgs for each row execute function public.company_test_activation_failure();

do $$
declare
  actor uuid := '00000000-0000-4000-8000-0000000000c1';
  org uuid;
  invoice uuid;
  other_invoice uuid;
  answer jsonb;
  payment uuid;
  blocked boolean := false;
  at_time timestamptz := '2026-11-07T07:00:00Z';
begin
  insert into public.users(id) values (actor);
  insert into public.company_orgs(name,status,seats_limit) values ('Atomic billing','active',2) returning id into org;
  insert into public.company_invoices(org_id,number,issue_date,total) values (org,'ATOMIC-1','2026-11-07',100) returning id into invoice;
  answer := public.company_invoice_command(invoice,actor,'payment','{"amount":60,"key":"atomic-payment-1"}',at_time);
  assert answer->'invoice'->>'status' = 'partial', 'payment settles in the same command';
  payment := (answer->>'payment')::uuid;
  answer := public.company_invoice_command(invoice,actor,'payment','{"amount":60,"key":"atomic-payment-1"}',at_time);
  assert (answer->>'duplicate')::boolean, 'retry is idempotent';
  answer := public.company_invoice_command(invoice,actor,'payment','{"amount":60,"key":"atomic-payment-2"}',at_time);
  assert answer->>'code' = 'payment_too_large', 'a different form cannot exceed the actual balance';
  assert (select count(*) from public.company_invoice_payments where invoice_id = invoice) = 1;
  answer := public.company_invoice_command(invoice,actor,'void','{}',at_time);
  assert answer->>'code' = 'invoice_has_payments', 'cancellation checks payment rows under the same lock';
  answer := public.company_invoice_command(invoice,actor,'remove_payment',jsonb_build_object('payment',payment),at_time);
  assert answer->'invoice'->>'status' = 'issued';
  assert (answer->'invoice'->>'paid_amount')::bigint = 0;
  answer := public.company_invoice_command(invoice,actor,'void','{}',at_time);
  assert answer->'invoice'->>'status' = 'void';
  answer := public.company_invoice_command(invoice,actor,'payment','{"amount":100}',at_time);
  assert answer->>'code' = 'invoice_void';

  insert into public.company_invoices(org_id,number,issue_date,total) values (org,'ATOMIC-2','2026-11-07',100) returning id into other_invoice;
  perform public.company_invoice_command(other_invoice,actor,'payment','{"amount":100}',at_time);
  update public.company_orgs set name = 'Fail activation for test' where id = org;
  begin
    perform public.company_invoice_command(other_invoice,actor,'activate','{"seats_limit":7}',at_time);
  exception when raise_exception then blocked := true;
  end;
  assert blocked, 'the simulated workspace update failed';
  assert (select activated_at is null from public.company_invoices where id = other_invoice), 'failed activation does not consume the staff click';
  assert (select seats_limit from public.company_orgs where id = org) = 2, 'failed activation changes neither row';
  update public.company_orgs set name = 'Activation retry' where id = org;
  answer := public.company_invoice_command(other_invoice,actor,'activate','{"seats_limit":7}',at_time);
  assert not (answer->>'duplicate')::boolean;
  assert (select seats_limit from public.company_orgs where id = org) = 7, 'retry can activate after a failure';
  answer := public.company_invoice_command(other_invoice,actor,'activate','{"seats_limit":9}',at_time);
  assert (answer->>'duplicate')::boolean;
  assert (select seats_limit from public.company_orgs where id = org) = 7, 'duplicate click does not replace the plan';
  -- A contract's tests are granted once: a second invoice on it keeps the limit.
  declare
    contract uuid;
    first_inv uuid;
    second_inv uuid;
    renewal_blocked boolean := false;
  begin
    update public.company_orgs set tests_used = 0, tests_limit = 10 where id = org;
    insert into public.company_contracts(org_id,title,status,seats,tests,start_date,end_date) values (org,'Instalments','signed',7,100,'2026-11-01','2027-10-31') returning id into contract;
    insert into public.company_invoices(org_id,contract_id,number,issue_date,total) values (org,contract,'ATOMIC-3','2026-11-07',100) returning id into first_inv;
    insert into public.company_invoices(org_id,contract_id,number,issue_date,total) values (org,contract,'ATOMIC-4','2026-11-07',100) returning id into second_inv;
    perform public.company_invoice_command(first_inv,actor,'payment','{"amount":100}',at_time);
    perform public.company_invoice_command(second_inv,actor,'payment','{"amount":100}',at_time);
    answer := public.company_invoice_command(first_inv,actor,'activate','{}',at_time);
    assert not (answer->>'duplicate')::boolean;
    assert (select tests_limit from public.company_orgs where id = org) = 100, 'the first invoice grants the contract tests';
    update public.company_orgs set tests_used = 80 where id = org;
    answer := public.company_invoice_command(second_inv,actor,'activate','{}',at_time);
    assert not (answer->>'duplicate')::boolean;
    assert (select tests_limit from public.company_orgs where id = org) = 100, 'a second invoice on the contract does not grant its tests again';
    assert (select contract_ends_at from public.company_orgs where id = org) = (('2027-10-31'::date + time '23:59:59') at time zone 'Asia/Tashkent'), 'the default end is the contract end';

    -- One open renewal per contract; a lost one does not block the next.
    insert into public.company_contracts(org_id,title,renewed_from) values (org,'Renewal one',contract);
    begin
      insert into public.company_contracts(org_id,title,renewed_from) values (org,'Renewal two',contract);
    exception when unique_violation then renewal_blocked := true;
    end;
    assert renewal_blocked, 'a second open renewal of one contract is refused';
    update public.company_contracts set status = 'lost' where renewed_from = contract;
    insert into public.company_contracts(org_id,title,renewed_from) values (org,'Renewal three',contract);
  end;

  assert not has_function_privilege('authenticated','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');
  assert not has_function_privilege('anon','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');
  assert has_function_privilege('service_role','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');
end;
$$;
select 'company billing-atomic: ok';
