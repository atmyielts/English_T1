-- Company English core: seat → English access, test quota, AI cap, lockdown.
\set ON_ERROR_STOP 1
insert into public.users(id) values
  ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2'), ('00000000-0000-4000-8000-0000000000a3');
insert into public.tenants(id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002'), ('10000000-0000-4000-8000-000000000003');
insert into public.tenant_memberships(tenant_id, user_id, status) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'active'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2', 'active'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a3', 'active');
\i /work/migration.sql

do $$
declare
  bundle constant uuid := '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa';
  employee constant uuid := '00000000-0000-4000-8000-0000000000a1';
  buyer constant uuid := '00000000-0000-4000-8000-0000000000a2';
  org uuid;
  other uuid;
  result text;
begin
  insert into public.company_orgs(name, status, seats_limit, contract_ends_at) values ('Acme', 'active', 5, now() + interval '90 days') returning id into org;
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, employee, 'employee', 'active', true);

  -- A seat grants the All Skills bundle until the contract ends.
  result := public.company_sync_english_access(employee);
  assert result = 'granted', 'granted: ' || result;
  assert (select is_active and source = 'company' and ends_at > now() + interval '80 days' from public.entitlements where user_id = employee and resource_id = bundle), 'company row';
  assert public.company_sync_english_access(employee) = 'updated', 'idempotent';
  assert (select count(*) from public.entitlements where user_id = employee) = 1, 'one row';

  -- A second workspace without an end date makes the access open-ended.
  insert into public.company_orgs(name, status, seats_limit) values ('Beta', 'active', 5) returning id into other;
  insert into public.company_members(org_id, user_id, role, status, seat) values (other, employee, 'employee', 'active', true);
  perform public.company_sync_english_access(employee);
  assert (select ends_at is null from public.entitlements where user_id = employee), 'open-ended';
  update public.company_members set seat = false where org_id = other;
  perform public.company_sync_english_access(employee);
  assert (select ends_at is not null from public.entitlements where user_id = employee), 'back to contract end';

  -- The workspace being suspended revokes it; reactivating restores it.
  update public.company_orgs set status = 'suspended' where id = org;
  assert public.company_sync_org_access(org) = 1, 'org sync count';
  assert (select not is_active from public.entitlements where user_id = employee), 'revoked when suspended';
  update public.company_orgs set status = 'active' where id = org;
  perform public.company_sync_english_access(employee);
  assert (select is_active from public.entitlements where user_id = employee), 'restored when active';

  -- A learner's own longer purchase is left alone.
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, ends_at, source)
    values (buyer, '10000000-0000-4000-8000-000000000002', 'product', bundle, now() + interval '365 days', 'click');
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, buyer, 'employee', 'active', true);
  assert public.company_sync_english_access(buyer) = 'own_covers', 'own covers';
  -- A shorter own purchase is taken over and given back when the seat goes.
  update public.entitlements set ends_at = now() + interval '10 days' where user_id = buyer;
  assert public.company_sync_english_access(buyer) = 'taken_over', 'taken over';
  assert (select source = 'company' and value ? 'company_previous' from public.entitlements where user_id = buyer), 'previous kept';
  update public.company_members set status = 'removed', seat = false where user_id = buyer;
  assert public.company_sync_english_access(buyer) = 'restored', 'restored';
  assert (select source = 'click' and is_active and ends_at < now() + interval '11 days' and not (value ? 'company_previous') from public.entitlements where user_id = buyer), 'own row back';

  -- Someone without a seat gets nothing.
  assert public.company_sync_english_access('00000000-0000-4000-8000-0000000000a3') = 'none', 'no seat';

  -- Test quota: reserve until the limit, then refuse.
  update public.company_orgs set tests_limit = 2, tests_used = 0 where id = org;
  assert public.company_reserve_test(org), 'first test';
  assert public.company_reserve_test(org), 'second test';
  assert not public.company_reserve_test(org), 'quota reached';
  update public.company_orgs set tests_limit = null where id = org;
  assert public.company_reserve_test(org), 'unlimited';
  update public.company_orgs set status = 'suspended' where id = org;
  assert not public.company_reserve_test(org), 'suspended cannot test';

  -- AI cap per day.
  assert public.company_consume_ai(other, 2), 'ai 1';
  assert public.company_consume_ai(other, 2), 'ai 2';
  assert not public.company_consume_ai(other, 2), 'ai capped';
  assert not public.company_consume_ai(other, 0), 'zero cap';
end
$$;

-- Signed-in users and the public cannot read company tables or call the functions directly.
do $$
begin
  assert not has_table_privilege('authenticated', 'public.company_members', 'select'), 'authenticated select';
  assert not has_table_privilege('anon', 'public.company_attempts', 'select'), 'anon select';
  assert not has_function_privilege('authenticated', 'public.company_sync_english_access(uuid)', 'execute'), 'sync execute';
  assert not has_function_privilege('anon', 'public.company_reserve_test(uuid)', 'execute'), 'reserve execute';
  assert (select bool_and(relrowsecurity) from pg_class where relname like 'company\_%' and relkind = 'r'), 'rls on every table';
end
$$;
select 'company core: ok';
