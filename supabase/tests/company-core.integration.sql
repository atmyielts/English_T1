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
  insert into public.company_audit(org_id, action, target, details)
    select org, 'member.updated', id::text, '{"full_name":{"from":"Old Name","to":"New Name"},"role":{"from":"admin","to":"owner"}}'::jsonb
    from public.company_members where user_id = owner_user and org_id = org;
  insert into public.company_leads(name, company, notes) values ('Someone Else', 'Note Co', 'Called owner@example.uz, not joannowner@example.uz');
  insert into public.company_assessments(id, org_id, kind, title) values ('20000000-0000-4000-8000-000000000001', org, 'hiring', 'Desk');
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, candidate_phone, deadline_at, overall_score)
    values (org, '20000000-0000-4000-8000-000000000001', 'Owner', 'owner@example.uz', '+998', now(), 60);

  -- What the erasure registry does first.
  delete from public.company_members where user_id = owner_user;
  assert (select role from public.company_members where user_id = admin_user) = 'owner', 'admin promoted';
  assert not exists (select 1 from public.company_members where org_id = lonely and role = 'owner'), 'no admin: stays ownerless';

  assert (select not (details ? 'full_name') and details ? 'role' from public.company_audit where action = 'member.updated' and org_id = org), 'name gone from audit about the person';
  perform public.company_erase_account(owner_user);
  assert (select notes = 'called [erased], not joannowner@example.uz' from public.company_leads where company = 'Note Co'), 'address gone from a note about someone else';
  assert (select billing_email is null from public.company_orgs where id = org), 'billing scrubbed';
  assert (select name = '-' and email is null and phone is null and need is null from public.company_leads where company = 'Succession'), 'lead scrubbed';
  assert (select actor is null and not (details ? 'email') and details->>'role' = 'owner' from public.company_audit where org_id = org and action = 'member.invited'), 'audit scrubbed';
  assert not exists (select 1 from public.company_members where org_id = lonely), 'invitation gone';
  assert (select candidate_name is null and candidate_email is null and candidate_phone is null and overall_score = 60 from public.company_attempts where org_id = org), 'candidate contact gone, score kept';
  assert 'company_erase_account' = any(public.account_erasure_service_hooks()), 'hook registered';
  assert not has_function_privilege('authenticated', 'public.company_erase_account(uuid)', 'execute'), 'hook not callable';
end
$$;
-- Closure scrubs by value, on address boundaries, and survives odd jsonb. It runs the way the
-- real closure does: from a BEFORE UPDATE trigger, while the same UPDATE writes the obfuscated email.
alter table auth.users add column if not exists deleted_at timestamptz;
create function public.test_closure_hook() returns trigger language plpgsql as $f$
  begin
    if old.deleted_at is null and new.deleted_at is not null then perform public.company_erase_account(old.id); end if;
    return new;
  end;
$f$;
create trigger test_closure before update of deleted_at on auth.users for each row execute function public.test_closure_hook();
do $$
declare
  ann constant uuid := '00000000-0000-4000-8000-0000000000c1';
  dot constant uuid := '00000000-0000-4000-8000-0000000000c2';
  org uuid;
  text_of text;
begin
  insert into public.users(id) values (ann), (dot);
  insert into auth.users(id, email, email_confirmed_at) values (ann, 'Ann@Corp.Test', now()), (dot, 'a.b+tag@corp.test', now());
  insert into public.company_orgs(name, billing_email) values ('Scrub Co', 'ANN@corp.test') returning id into org;
  insert into public.company_leads(name, company, email, job_title, need) values ('Ann', 'Scrub Co', 'ann@corp.test', 'Head of HR', 'details');
  insert into public.company_audit(org_id, action, details) values
    (org, 'member.joined', '{"via":"personal","access":"granted","invited_email":"ann@corp.test"}'),
    (org, 'staff.org_updated', '{"billing_email":{"from":"ann@corp.test","to":"finance@corp.test"},"synced":1}'),
    (null, 'lead.note', '{"body":"Called ANN@corp.test, she says yes."}'),
    (org, 'member.updated', '{"email":{"from":"ann@corp.test","to":"e2@corp.test"},"full_name":{"from":"Ann A","to":"A"},"role":{"from":"admin","to":"owner"}}'),
    (org, 'member.imported', '{"list":["keep",{"who":["x","mailto:ann@corp.test"],"n":1,"ok":true,"none":null}]}'),
    (org, 'member.removed', '{"name":"Jo Ann","email":"joann@corp.test","access":"revoked"}'),
    (org, 'member.removed', '{"name":"Other","email":"ann@corp.test.uk"}'),
    (org, 'member.removed', '{"name":"Third","email":"a.ann@corp.test"}'),
    (org, 'odd.scalar', '"ann@corp.test"'),
    (org, 'odd.array', '["ann@corp.test", 1, null, true, {"a":[]}, []]'),
    (org, 'odd.number', '42'),
    (org, 'odd.null', 'null'),
    (org, 'odd.key', '{"ann@corp.test":1,"keep":"annxcorp.test"}'),
    (org, 'odd.deep', ('{"a":' || repeat('[', 80) || '"ann@corp.test"' || repeat(']', 80) || '}')::jsonb),
    (org, 'odd.lookalike', '{"body":"annXcorp.test and ann@corpXtest are not the address"}'),
    (org, 'dot.address', '{"note":"a.b+tag@corp.test wrote","other":"axb+tag@corp.test","third":"a.bbtag@corp.test"}');

  -- The same statement as the provider's SoftDeleteUser: the new email and deleted_at together.
  update auth.users set email = 'obfuscated-hash', deleted_at = now() where id = ann;
  assert (select billing_email is null from public.company_orgs where id = org), 'closure read the real address: billing';
  assert (select email is null and job_title is null and need is null from public.company_leads where company = 'Scrub Co'), 'lead scrubbed, job title too';
  assert (select details->>'invited_email' = '[erased]' and details->>'access' = 'granted' and details->>'via' = 'personal' from public.company_audit where action = 'member.joined' and org_id = org), 'invited_email scrubbed, the rest stays';
  assert (select details#>>'{billing_email,from}' = '[erased]' and details#>>'{billing_email,to}' = 'finance@corp.test' and (details->>'synced')::int = 1 from public.company_audit where action = 'staff.org_updated' and org_id = org), 'billing_email.from scrubbed, to stays';
  assert (select details->>'body' = '[erased]' from public.company_audit where action = 'lead.note' and org_id is null), 'note body replaced';
  assert (select not (details ? 'email') and not (details ? 'full_name') and details#>>'{role,to}' = 'owner' from public.company_audit where action = 'member.updated' and org_id = org), 'matching row loses the name keys';
  assert (select details = '{"list":["keep",{"who":["x","[erased]"],"n":1,"ok":true,"none":null}]}'::jsonb from public.company_audit where action = 'member.imported' and org_id = org), 'nested scrub keeps the shape';
  assert (select details = '{"name":"Jo Ann","email":"joann@corp.test","access":"revoked"}'::jsonb from public.company_audit where details->>'name' = 'Jo Ann'), 'joann untouched';
  assert (select details = '{"name":"Other","email":"ann@corp.test.uk"}'::jsonb from public.company_audit where details->>'name' = 'Other'), 'longer domain untouched';
  assert (select details = '{"name":"Third","email":"a.ann@corp.test"}'::jsonb from public.company_audit where details->>'name' = 'Third'), 'longer local part untouched';
  assert (select details = '"[erased]"'::jsonb from public.company_audit where action = 'odd.scalar'), 'scalar at the top';
  assert (select details = '["[erased]", 1, null, true, {"a":[]}, []]'::jsonb from public.company_audit where action = 'odd.array'), 'array at the top';
  assert (select details = '42'::jsonb from public.company_audit where action = 'odd.number'), 'number kept';
  assert (select details = 'null'::jsonb from public.company_audit where action = 'odd.null'), 'json null kept';
  assert (select details = '{"[erased]":1,"keep":"annxcorp.test"}'::jsonb from public.company_audit where action = 'odd.key'), 'an address as a key';
  select details::text into text_of from public.company_audit where action = 'odd.deep';
  assert strpos(lower(text_of), 'ann@corp') = 0, 'very deep nesting scrubbed';
  assert (select details = '{"body":"annXcorp.test and ann@corpXtest are not the address"}'::jsonb from public.company_audit where action = 'odd.lookalike'), 'dots in the address are literal';

  -- Regex characters in the address match only themselves.
  update auth.users set email = 'obfuscated-hash-2', deleted_at = now() where id = dot;
  assert (select details = '{"note":"[erased]","other":"axb+tag@corp.test","third":"a.bbtag@corp.test"}'::jsonb from public.company_audit where action = 'dot.address'), 'dot and plus are literal';
  assert not has_function_privilege('service_role', 'public.company_scrub_jsonb(jsonb, text, integer)', 'execute'), 'walker revoked from service_role';
  assert not has_function_privilege('authenticated', 'public.company_scrub_jsonb(jsonb, text, integer)', 'execute'), 'walker revoked from authenticated';
  assert not has_function_privilege('anon', 'public.company_scrub_jsonb(jsonb, text, integer)', 'execute'), 'walker revoked from anon';
end
$$;
drop trigger test_closure on auth.users;
drop function public.test_closure_hook();
-- The nightly repair: revokes what no seat backs, grants what a seat lacks, leaves purchases alone.
create function public.test_entitlement_refuses() returns trigger language plpgsql as $f$
  begin
    if current_setting('test.refuse', true) = 'on' and new.user_id = '00000000-0000-4000-8000-0000000000d2' and old.is_active then raise exception 'refused'; end if;
    return new;
  end;
$f$;
create trigger test_refuses before update on public.entitlements for each row execute function public.test_entitlement_refuses();
do $$
declare
  seat_product constant uuid := 'c0a1e5d2-7b3f-4a86-9c14-5e2f8d6b1a07';
  bundle constant uuid := '3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa';
  stale constant uuid := '00000000-0000-4000-8000-0000000000d1';
  missing constant uuid := '00000000-0000-4000-8000-0000000000d2';
  expired constant uuid := '00000000-0000-4000-8000-0000000000d3';
  healthy constant uuid := '00000000-0000-4000-8000-0000000000d4';
  no_tenant constant uuid := '00000000-0000-4000-8000-0000000000d5';
  lapsed constant uuid := '00000000-0000-4000-8000-0000000000d6';
  t_stale constant uuid := '10000000-0000-4000-8000-0000000000d1';
  t_missing constant uuid := '10000000-0000-4000-8000-0000000000d2';
  t_expired constant uuid := '10000000-0000-4000-8000-0000000000d3';
  t_healthy constant uuid := '10000000-0000-4000-8000-0000000000d4';
  t_lapsed constant uuid := '10000000-0000-4000-8000-0000000000d6';
  org uuid;
  ended uuid;
  outcome jsonb;
  extra uuid;
  i integer;
begin
  update public.company_members set seat = false where seat;
  perform public.company_reconcile_english_access();
  insert into public.users(id) values (stale), (missing), (expired), (healthy), (no_tenant), (lapsed);
  insert into public.tenants(id) values (t_stale), (t_missing), (t_expired), (t_healthy), (t_lapsed);
  insert into public.tenant_memberships(tenant_id, user_id, status) values (t_stale, stale, 'active'), (t_missing, missing, 'active'), (t_expired, expired, 'active'), (t_healthy, healthy, 'active'), (t_lapsed, lapsed, 'active');
  insert into public.company_orgs(name, status, seats_limit) values ('Repair', 'active', 50) returning id into org;
  insert into public.company_orgs(name, status, seats_limit, contract_ends_at) values ('Ended', 'active', 50, now() - interval '1 day') returning id into ended;
  -- Removed while the sync was down: the row is still on, and a purchase next to it stays.
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, stale, 'employee', 'removed', false);
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, source) values (stale, t_stale, 'product', seat_product, 'company');
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, source) values (stale, t_stale, 'product', bundle, 'click');
  -- Seated while the sync was down: no row at all.
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, missing, 'employee', 'active', true);
  -- Seated with a row whose end date has passed.
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, expired, 'employee', 'active', true);
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, ends_at, source) values (expired, t_expired, 'product', seat_product, now() - interval '1 hour', 'company');
  -- Already right: nothing to do.
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, healthy, 'employee', 'active', true);
  assert public.company_sync_english_access(healthy) = 'granted', 'healthy grant';
  -- Nothing can be granted without a tenant, and they do not count as failures.
  insert into public.company_members(org_id, user_id, role, status, seat) values (org, no_tenant, 'employee', 'active', true);
  -- The contract ended while the row was on.
  insert into public.company_members(org_id, user_id, role, status, seat) values (ended, lapsed, 'employee', 'active', true);
  insert into public.entitlements(user_id, tenant_id, resource_type, resource_id, source) values (lapsed, t_lapsed, 'product', seat_product, 'company');

  outcome := public.company_reconcile_english_access();
  assert outcome = '{"revoked":2,"granted":2,"failed":0}'::jsonb, 'outcome: ' || outcome::text;
  assert (select not is_active from public.entitlements where user_id = stale and resource_id = seat_product), 'stale row revoked';
  assert (select is_active and source = 'click' from public.entitlements where user_id = stale and resource_id = bundle), 'purchase untouched';
  assert (select is_active and source = 'company' from public.entitlements where user_id = missing and resource_id = seat_product), 'missing row granted';
  assert (select is_active and (ends_at is null or ends_at > now()) from public.entitlements where user_id = expired and resource_id = seat_product), 'ended row renewed';
  assert not exists (select 1 from public.entitlements where user_id = no_tenant), 'no tenant, no row';
  assert (select not is_active from public.entitlements where user_id = lapsed and resource_id = seat_product), 'ended contract revoked';
  assert public.company_reconcile_english_access() = '{"revoked":0,"granted":0,"failed":0}'::jsonb, 'a second pass finds nothing';

  -- The batch is bounded: the rest waits for the next pass.
  for i in 1..5 loop
    extra := ('00000000-0000-4000-8000-0000000e' || lpad(i::text, 4, '0'))::uuid;
    insert into public.users(id) values (extra);
    insert into public.tenants(id) values (extra);
    insert into public.tenant_memberships(tenant_id, user_id, status) values (extra, extra, 'active');
    insert into public.company_members(org_id, user_id, role, status, seat) values (org, extra, 'employee', 'active', true);
  end loop;
  outcome := public.company_reconcile_english_access(2);
  assert (outcome->>'granted')::int = 2, 'batch of two: ' || outcome::text;
  assert (select count(*) from public.entitlements where resource_id = seat_product and is_active and user_id::text like '00000000-0000-4000-8000-0000000e%') = 2, 'two granted';
  assert (public.company_reconcile_english_access()->>'granted')::int = 3, 'the rest next pass';

  -- One bad row does not stop the others.
  perform set_config('test.refuse', 'on', true);
  update public.company_members set status = 'removed', seat = false where user_id in (missing, expired);
  outcome := public.company_reconcile_english_access();
  assert outcome = '{"revoked":1,"granted":0,"failed":1}'::jsonb, 'bad row: ' || outcome::text;
  assert (select not is_active from public.entitlements where user_id = expired and resource_id = seat_product), 'the other row still revoked';
  perform set_config('test.refuse', 'off', true);
  assert (public.company_reconcile_english_access()->>'revoked')::int = 1, 'the bad row is picked up again';

  assert not has_function_privilege('authenticated', 'public.company_reconcile_english_access(integer)', 'execute'), 'repair not callable by users';
  assert not has_function_privilege('anon', 'public.company_reconcile_english_access(integer)', 'execute'), 'repair not callable by anon';
  assert has_function_privilege('service_role', 'public.company_reconcile_english_access(integer)', 'execute'), 'repair callable by the service';
end
$$;
drop trigger test_refuses on public.entitlements;
drop function public.test_entitlement_refuses();
select 'company core: ok';
