-- Connect: notices dedupe per person, the rate-limit counter, the nightly tidy-up,
-- table constraints, the lockdown and that a closed account takes its rows with it.
\set ON_ERROR_STOP on
\i /work/migration.sql

insert into public.users (id, role) values ('00000000-0000-4000-8000-0000000000c1', 'user'), ('00000000-0000-4000-8000-0000000000c2', 'user');
insert into public.company_orgs (id, name) values ('00000000-0000-4000-8000-0000000000a1', 'Connect Org');
insert into public.company_members (id, org_id, user_id, role, status) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'owner', 'active'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', 'employee', 'active');

do $$
declare
  v_count integer;
  v_ok boolean;
  v_table text;
begin
  -- One notice per person and key, however often the event is generated.
  insert into public.company_notices (org_id, member_id, kind, dedupe_key, link)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'test_todo', 'test_todo:x', '/w/x/me');
  insert into public.company_notices (org_id, member_id, kind, dedupe_key)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'test_todo', 'test_todo:x')
  on conflict (member_id, dedupe_key) do nothing;
  select count(*) into v_count from public.company_notices;
  assert v_count = 1, 'a duplicate notice was stored';

  -- A link leaves the app only by mistake: the table refuses it.
  begin
    insert into public.company_notices (org_id, member_id, kind, dedupe_key, link)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'x', 'bad', '//evil.example');
    raise exception 'outside link accepted';
  exception when check_violation then null;
  end;

  -- The counter allows up to the limit in one window.
  v_ok := public.company_connect_hit('t', 2, 3600);
  assert v_ok, 'first hit refused';
  v_ok := public.company_connect_hit('t', 2, 3600);
  assert v_ok, 'second hit refused';
  v_ok := public.company_connect_hit('t', 2, 3600);
  assert not v_ok, 'third hit allowed';

  -- Key hashes are unique and a scope must be known.
  insert into public.company_api_keys (org_id, name, key_hash, key_prefix) values ('00000000-0000-4000-8000-0000000000a1', 'k', 'h1', 'scl_abc');
  begin
    insert into public.company_api_keys (org_id, name, key_hash, key_prefix) values ('00000000-0000-4000-8000-0000000000a1', 'k2', 'h1', 'scl_abc');
    raise exception 'duplicate key hash accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.company_api_keys (org_id, name, key_hash, key_prefix, scope) values ('00000000-0000-4000-8000-0000000000a1', 'k3', 'h3', 'scl_abc', 'admin');
    raise exception 'unknown scope accepted';
  exception when check_violation then null;
  end;

  -- Webhooks are https only and one event reaches one webhook once.
  begin
    insert into public.company_webhooks (org_id, url, secret) values ('00000000-0000-4000-8000-0000000000a1', 'http://x.example', repeat('s', 32));
    raise exception 'plain http accepted';
  exception when check_violation then null;
  end;
  insert into public.company_webhooks (id, org_id, url, secret, events) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', 'https://x.example/hook', repeat('s', 32), array['test.graded']);
  insert into public.company_webhook_deliveries (org_id, webhook_id, event, event_id) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1', 'test.graded', 'e1');
  begin
    insert into public.company_webhook_deliveries (org_id, webhook_id, event, event_id) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1', 'test.graded', 'e1');
    raise exception 'duplicate delivery accepted';
  exception when unique_violation then null;
  end;

  -- The logo column takes PNG or JPEG data only; a colour is lower-case hex.
  begin
    insert into public.company_brand (org_id, logo_data_url) values ('00000000-0000-4000-8000-0000000000a1', 'data:image/svg+xml;base64,PHN2Zz4=');
    raise exception 'svg logo accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_brand (org_id, brand_color) values ('00000000-0000-4000-8000-0000000000a1', 'red');
    raise exception 'colour name accepted';
  exception when check_violation then null;
  end;
  insert into public.company_brand (org_id, display_name, brand_color, logo_data_url) values ('00000000-0000-4000-8000-0000000000a1', 'Connect', '#123456', 'data:image/png;base64,AAAA');

  -- The tidy-up removes what has aged out and keeps the rest.
  insert into public.company_notices (org_id, member_id, kind, dedupe_key, read_at, created_at)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'old', 'old:read', now() - interval '200 days', now() - interval '200 days');
  insert into public.company_notices (org_id, member_id, kind, dedupe_key, push_state, created_at)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'stuck', 'stuck:1', 'sending', now() - interval '2 hours');
  insert into public.company_webhook_deliveries (org_id, webhook_id, event, event_id, status, created_at)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1', 'test.graded', 'old', 'sent', now() - interval '40 days');
  perform public.company_connect_purge();
  assert not exists (select 1 from public.company_notices where dedupe_key = 'old:read'), 'old read notice kept';
  assert exists (select 1 from public.company_notices where dedupe_key = 'test_todo:x'), 'recent notice removed';
  assert (select push_state from public.company_notices where dedupe_key = 'stuck:1') is null, 'stuck push not released';
  assert not exists (select 1 from public.company_webhook_deliveries where event_id = 'old'), 'old delivery kept';

  -- The job's wake-up does nothing without pg_net or the secret table.
  assert public.company_connect_tick() is null, 'tick did something without pg_net';

  -- Nobody but the function reaches these tables.
  foreach v_table in array array['company_notices','company_connect_settings','company_connect_prefs','company_api_keys','company_webhooks','company_webhook_deliveries','company_brand','company_connect_hits'] loop
    assert not has_table_privilege('anon', format('public.%I', v_table), 'select'), v_table || ' readable by anon';
    assert not has_table_privilege('authenticated', format('public.%I', v_table), 'select'), v_table || ' readable by authenticated';
    assert has_table_privilege('service_role', format('public.%I', v_table), 'select'), v_table || ' not readable by the function';
    assert (select relrowsecurity from pg_class where oid = format('public.%I', v_table)::regclass), v_table || ' has no RLS';
  end loop;
  assert not has_function_privilege('anon', 'public.company_connect_hit(text, integer, integer)', 'execute'), 'anon may count hits';

  -- UTC midnight lies inside a Tashkent day and must not create another allowance.
  assert public.company_connect_day_hit('local-day-test',1,'2026-11-06 23:59:00+00'), 'first daily hit refused';
  assert not public.company_connect_day_hit('local-day-test',1,'2026-11-07 00:01:00+00'), 'daily cap reset at UTC midnight';
  assert public.company_connect_day_hit('local-day-test',1,'2026-11-07 19:00:00+00'), 'new Tashkent day did not reset';
  assert not has_function_privilege('anon', 'public.company_connect_day_hit(text,integer,timestamptz)', 'execute'), 'anon may reserve a daily hit';
  assert not has_function_privilege('authenticated', 'public.company_claim_push_notice(uuid,uuid,uuid,integer,timestamptz)', 'execute'), 'authenticated may reserve a push';

  insert into public.company_notices(id,org_id,member_id,kind,dedupe_key) values
    ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','test_todo','claim1'),
    ('00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','test_todo','claim2');
  assert public.company_claim_push_notice('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000e1',1,now()), 'first push not reserved';
  assert not public.company_claim_push_notice('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000e2',1,now()), 'in-flight push did not use the daily allowance';
  assert not public.company_claim_push_notice('00000000-0000-4000-8000-0000000000a9','00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000e2',20,now()), 'reservation crossed workspace';
  update public.company_notices set push_state='sent',pushed_at=now()-interval '2 days' where id='00000000-0000-4000-8000-0000000000e1';
  assert public.company_claim_push_notice('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000e2',1,now()), 'past-day pushes consumed current allowance';

  -- Deleting the member row (account closure) takes their notices and choices.
  insert into public.company_connect_prefs (member_id, org_id, telegram_opt_in) values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', true);
  delete from public.company_members where id = '00000000-0000-4000-8000-0000000000b2';
  assert not exists (select 1 from public.company_notices where member_id = '00000000-0000-4000-8000-0000000000b2'), 'notices outlived the member';
  assert not exists (select 1 from public.company_connect_prefs where member_id = '00000000-0000-4000-8000-0000000000b2'), 'choices outlived the member';
end
$$;

select 'company connect2: ok';
