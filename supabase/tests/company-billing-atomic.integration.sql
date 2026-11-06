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
  assert not has_function_privilege('authenticated','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');
  assert not has_function_privilege('anon','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');
  assert has_function_privilege('service_role','public.company_invoice_command(uuid,uuid,text,jsonb,timestamptz)','execute');
end;
$$;
select 'company billing-atomic: ok';
