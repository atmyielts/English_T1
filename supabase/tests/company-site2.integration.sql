-- Marketing engine: lead tracking columns and the anonymous check counter.
\set ON_ERROR_STOP on
\i /work/migration.sql

do $$
declare
  lead_id uuid;
begin
  insert into public.company_leads (name, company, phone, source, utm_source, utm_campaign, landing_path, referrer_host, preferred_day, preferred_slot, preferred_channel, check_result)
  values ('Test Person', 'Test Company', '+998900000000', 'check', 'telegram', 'spring', '/for/hotels', 'example.com', '2030-01-15', 'morning', 'telegram', '{"overall":{"level":"b1","score":52}}'::jsonb)
  returning id into lead_id;
  if (select check_result->'overall'->>'level' from public.company_leads where id = lead_id) <> 'b1' then
    raise exception 'check_result was not stored';
  end if;

  begin
    insert into public.company_leads (name, company, preferred_slot) values ('Bad Slot', 'Test Company', 'midnight');
    raise exception 'a preferred_slot outside the list was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_leads (name, company, preferred_channel) values ('Bad Channel', 'Test Company', 'pigeon');
    raise exception 'a preferred_channel outside the list was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_leads (name, company, utm_source) values ('Long Utm', 'Test Company', repeat('x', 121));
    raise exception 'an over-long utm_source was accepted';
  exception when check_violation then null;
  end;

  insert into public.company_check_runs (kind, ip_hash, level) values ('score', 'abc', 'b1');
  begin
    insert into public.company_check_runs (kind, ip_hash) values ('peek', 'abc');
    raise exception 'an unknown check run kind was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_check_runs (kind, ip_hash, level) values ('score', 'abc', 'z9');
    raise exception 'an unknown level was accepted';
  exception when check_violation then null;
  end;

  if not (select relrowsecurity from pg_class where oid = 'public.company_check_runs'::regclass) then
    raise exception 'company_check_runs has no row level security';
  end if;
  if has_table_privilege('anon', 'public.company_check_runs', 'select') or has_table_privilege('authenticated', 'public.company_check_runs', 'select') then
    raise exception 'company_check_runs must not be readable by clients';
  end if;
end
$$;

select 'company site2: ok';
