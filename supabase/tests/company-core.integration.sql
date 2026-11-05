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
  seat_product constant uuid := 'c0a1e5d2-7b3f-4a86-9c14-5e2f8d6b1a07';
  employee constant uuid := '00000000-0000-4000-8000-0000000000a1';
  buyer constant uuid := '00000000-0000-4000-8000-0000000000a2';
  org uuid;
  other uuid;
  result text;
  own_end timestamptz := now() + interval '10 days';
begin
  assert (select metadata->>'hidden' = 'true' and status = 'active' from public.products where id = seat_product), 'hidden seat product';
  insert into public.company_orgs(name, status, seats_limit, contract_ends_at) values ('Acme', 'active', 5, now() + interval '90 days') returning id into org;
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, employee, 'employee', 'active', true);

  -- A seat grants its own row until the contract ends.
  result := public.company_sync_english_access(employee);
  assert result = 'granted', 'granted: ' || result;
  assert (select is_active and source = 'company' and ends_at > now() + interval '80 days' from public.entitlements where user_id = employee and resource_id = seat_product), 'company row';
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

  -- An ended contract no longer counts, even if nothing changed the status.
  update public.company_orgs set contract_ends_at = now() - interval '1 day' where id = org;
  assert public.company_sync_english_access(employee) = 'revoked', 'ended contract revokes';
  update public.company_orgs set contract_ends_at = now() + interval '90 days' where id = org;
  perform public.company_sync_english_access(employee);

  -- A learner's own purchase of the same skills is a different row, and is never touched:
  -- not when seated, not on a contract change, not when a Click renewal rewrites it, not on removal.
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, ends_at, source, value)
    values (buyer, '10000000-0000-4000-8000-000000000002', 'product', bundle, own_end, 'click', '{"order":"x"}');
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, buyer, 'employee', 'active', true);
  assert public.company_sync_english_access(buyer) = 'granted', 'seat alongside a purchase';
  assert (select count(*) from public.entitlements where user_id = buyer) = 2, 'two separate rows';
  update public.company_orgs set contract_ends_at = now() + interval '1 day' where id = org;
  perform public.company_sync_org_access(org);
  update public.entitlements set ends_at = own_end + interval '30 days', source = 'click', value = '{"order":"y"}' where user_id = buyer and resource_id = bundle;
  update public.company_members set status = 'removed', seat = false where user_id = buyer;
  assert public.company_sync_english_access(buyer) = 'revoked', 'seat revoked';
  assert (select is_active and source = 'click' and ends_at > now() + interval '39 days' and value->>'order' = 'y' from public.entitlements where user_id = buyer and resource_id = bundle), 'purchase untouched';
  assert (select not is_active from public.entitlements where user_id = buyer and resource_id = seat_product), 'seat row off';
  update public.company_orgs set contract_ends_at = now() + interval '90 days' where id = org;

  -- A grant left on another tenant is switched off when the person's tenant changes.
  update public.tenant_memberships set status = 'left' where user_id = employee;
  insert into public.tenant_memberships(tenant_id, user_id, status) values ('10000000-0000-4000-8000-000000000003', employee, 'active');
  assert public.company_sync_english_access(employee) = 'granted', 'granted on new tenant';
  assert (select count(*) from public.entitlements where user_id = employee and is_active) = 1, 'one live grant';

  -- Someone without a seat gets nothing.
  assert public.company_sync_english_access('00000000-0000-4000-8000-0000000000a3') = 'none', 'no seat';

  -- Test quota: reserve until the limit, then refuse.
  update public.company_orgs set tests_limit = 2, tests_used = 0 where id = org;
  assert public.company_reserve_test(org), 'first test';
  assert public.company_reserve_test(org), 'second test';
  assert not public.company_reserve_test(org), 'quota reached';
  update public.company_orgs set tests_limit = null where id = org;
  assert public.company_reserve_test(org), 'unlimited';
  update public.company_orgs set contract_ends_at = now() - interval '1 day' where id = org;
  assert not public.company_reserve_test(org), 'ended contract cannot test';
  update public.company_orgs set contract_ends_at = null, status = 'suspended' where id = org;
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
-- Last owner leaving: the oldest admin takes over; closure scrubs what user_id cannot reach.
do $$
declare
  owner_user constant uuid := '00000000-0000-4000-8000-0000000000b1';
  admin_user constant uuid := '00000000-0000-4000-8000-0000000000b2';
  org uuid;
  lonely uuid;
begin
  insert into public.users(id) values (owner_user), (admin_user);
  insert into auth.users(id, email, email_confirmed_at) values (owner_user, 'Owner@Example.uz', now());
  insert into public.company_orgs(name, billing_email) values ('Succession', 'owner@example.uz') returning id into org;
  insert into public.company_orgs(name) values ('Lonely') returning id into lonely;
  insert into public.company_members(org_id, user_id, role, status, joined_at) values
    (org, owner_user, 'owner', 'active', now() - interval '3 days'),
    (org, admin_user, 'admin', 'active', now() - interval '2 days'),
    (lonely, owner_user, 'owner', 'active', now());
  insert into public.company_members(org_id, email, role, status) values (lonely, 'owner@example.uz', 'employee', 'invited');
  insert into public.company_leads(name, company, email, phone, need) values ('Owner', 'Succession', 'OWNER@example.uz', '+998', 'details');
  insert into public.company_audit(org_id, actor, action, details) values (org, owner_user, 'member.invited', '{"email":"owner@example.uz","role":"owner"}');
  insert into public.company_assessments(id, org_id, kind, title) values ('20000000-0000-4000-8000-000000000001', org, 'hiring', 'Desk');
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, candidate_phone, deadline_at, overall_score)
    values (org, '20000000-0000-4000-8000-000000000001', 'Owner', 'owner@example.uz', '+998', now(), 60);

  -- What the erasure registry does first.
  delete from public.company_members where user_id = owner_user;
  assert (select role from public.company_members where user_id = admin_user) = 'owner', 'admin promoted';
  assert not exists (select 1 from public.company_members where org_id = lonely and role = 'owner'), 'no admin: stays ownerless';

  perform public.company_erase_account(owner_user);
  assert (select billing_email is null from public.company_orgs where id = org), 'billing scrubbed';
  assert (select name = '-' and email is null and phone is null and need is null from public.company_leads where company = 'Succession'), 'lead scrubbed';
  assert (select actor is null and not (details ? 'email') and details->>'role' = 'owner' from public.company_audit where org_id = org), 'audit scrubbed';
  assert not exists (select 1 from public.company_members where org_id = lonely), 'invitation gone';
  assert (select candidate_name is null and candidate_email is null and candidate_phone is null and overall_score = 60 from public.company_attempts where org_id = org), 'candidate contact gone, score kept';
  assert 'company_erase_account' = any(public.account_erasure_service_hooks()), 'hook registered';
  assert not has_function_privilege('authenticated', 'public.company_erase_account(uuid)', 'execute'), 'hook not callable';
end
$$;
select 'company core: ok';
