-- Company English operations: contracts, invoices, payments, counters, saved filters, requests, manager departments.
\set ON_ERROR_STOP 1
insert into public.users(id) values
  ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2');
\i /work/migration.sql

do $$
declare
  owner_user constant uuid := '00000000-0000-4000-8000-0000000000c1';
  employee_user constant uuid := '00000000-0000-4000-8000-0000000000c2';
  org uuid;
  employee_row uuid;
  department uuid;
  contract uuid;
  invoice uuid;
  blocked boolean;
  stored_updated timestamptz;
begin
  insert into public.company_orgs(name, status, seats_limit) values ('Silk Road Hotels', 'active', 2) returning id into org;
  insert into public.company_members(org_id, user_id, role, status) values (org, owner_user, 'owner', 'active');
  insert into public.company_members(org_id, user_id, role, status) values (org, employee_user, 'employee', 'active') returning id into employee_row;
  insert into public.company_departments(org_id, name) values (org, 'Front office') returning id into department;

  -- New member columns.
  update public.company_members set last_seen_at = now(), locale = 'uz' where id = employee_row;
  blocked := false;
  begin
    update public.company_members set locale = 'fr' where id = employee_row;
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'member locale is checked';

  -- Contracts: UZS only, dates in order.
  insert into public.company_contracts(org_id, title, seats, price_per_seat, term_months) values (org, 'First year', 20, 100000, 12) returning id into contract;
  blocked := false;
  begin
    insert into public.company_contracts(org_id, title, currency) values (org, 'Dollars', 'USD');
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'only UZS contracts';
  blocked := false;
  begin
    insert into public.company_contracts(org_id, title, start_date, end_date) values (org, 'Backwards', '2027-02-01', '2027-01-01');
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'contract dates are ordered';

  -- The updated_at trigger is attached.
  update public.company_contracts set updated_at = '2000-01-01' where id = contract;
  select updated_at into stored_updated from public.company_contracts where id = contract;
  assert stored_updated > '2001-01-01', 'updated_at trigger on contracts';

  -- Invoice numbers and act numbers are unique.
  insert into public.company_invoices(org_id, contract_id, number, issue_date, total) values (org, contract, 'S-2026-00001', '2026-11-06', 100) returning id into invoice;
  blocked := false;
  begin
    insert into public.company_invoices(org_id, number, issue_date) values (org, 'S-2026-00001', '2026-11-06');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'invoice numbers are unique';
  update public.company_invoices set act_number = 'A-2026-00001' where id = invoice;
  insert into public.company_invoices(org_id, number, issue_date, act_number) values (org, 'S-2026-00002', '2026-11-06', null);
  blocked := false;
  begin
    insert into public.company_invoices(org_id, number, issue_date, act_number) values (org, 'S-2026-00003', '2026-11-06', 'A-2026-00001');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'act numbers are unique';

  -- A workspace with financial documents cannot be deleted by accident.
  blocked := false;
  begin
    delete from public.company_orgs where id = org;
  exception when foreign_key_violation then
    blocked := true;
  end;
  assert blocked, 'documents keep their workspace';

  -- Payments: positive, and the same form key lands once.
  insert into public.company_invoice_payments(invoice_id, org_id, amount, paid_on, client_key) values (invoice, org, 50, '2026-11-06', 'form-1');
  blocked := false;
  begin
    insert into public.company_invoice_payments(invoice_id, org_id, amount, paid_on, client_key) values (invoice, org, 50, '2026-11-06', 'form-1');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'one payment per form key';
  blocked := false;
  begin
    insert into public.company_invoice_payments(invoice_id, org_id, amount, paid_on) values (invoice, org, 0, '2026-11-06');
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'payments are positive';

  -- Schood's details are one row.
  insert into public.company_billing_settings(legal_name) values ('Staff entered');
  blocked := false;
  begin
    insert into public.company_billing_settings(id, legal_name) values (false, 'Second');
  exception when check_violation then
    blocked := true;
  end;
  assert blocked, 'one row of seller details';

  -- Counters move by compare and swap.
  insert into public.company_doc_counters(kind, year) values ('invoice', 2026) on conflict do nothing;
  update public.company_doc_counters set last = 1 where kind = 'invoice' and year = 2026 and last = 0;
  assert (select last from public.company_doc_counters where kind = 'invoice' and year = 2026) = 1, 'counter moves';

  -- Saved filters: one name per person.
  insert into public.company_saved_filters(org_id, user_id, name) values (org, owner_user, 'No seat');
  blocked := false;
  begin
    insert into public.company_saved_filters(org_id, user_id, name) values (org, owner_user, ' no seat ');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'one saved filter per name';

  -- One open request of each kind per person; a decided one does not count.
  insert into public.company_member_requests(org_id, member_id, user_id, kind) values (org, employee_row, employee_user, 'seat');
  blocked := false;
  begin
    insert into public.company_member_requests(org_id, member_id, user_id, kind) values (org, employee_row, employee_user, 'seat');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'one open seat request';
  update public.company_member_requests set status = 'declined' where member_id = employee_row;
  insert into public.company_member_requests(org_id, member_id, user_id, kind) values (org, employee_row, employee_user, 'seat');

  -- Manager departments go with the department.
  insert into public.company_manager_departments(org_id, member_id, department_id) values (org, employee_row, department);
  insert into public.company_manager_departments(org_id, member_id, department_id) values (org, employee_row, department) on conflict do nothing;
  assert (select count(*) from public.company_manager_departments where member_id = employee_row) = 1, 'one row per department';
  delete from public.company_departments where id = department;
  assert (select count(*) from public.company_manager_departments where member_id = employee_row) = 0, 'gone with the department';

  -- No access except through the function.
  assert not has_table_privilege('anon', 'public.company_invoices', 'select'), 'anon has no invoices';
  assert not has_table_privilege('authenticated', 'public.company_contracts', 'select'), 'authenticated has no contracts';
  assert not has_table_privilege('authenticated', 'public.company_billing_settings', 'select'), 'authenticated has no seller details';
  assert has_table_privilege('service_role', 'public.company_saved_filters', 'insert'), 'service role reaches saved filters';
  assert (select relrowsecurity from pg_class where oid = 'public.company_member_requests'::regclass), 'RLS on requests';
end
$$;

select 'company ops2: ok';
