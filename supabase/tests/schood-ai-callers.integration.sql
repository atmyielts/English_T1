-- System and anonymous routes (20261030160000) and notification preferences
-- (20261030170000): a workspace pays with no member, fixed-window rate limits,
-- the system secret and its invoker, muted kinds and quiet hours.
do $$
declare
  owner constant uuid := '00000000-0000-4000-8000-0000000000b2';
  t0 constant timestamptz := '2026-11-04T07:00:00Z';
  centre uuid;
  r jsonb;
  raised boolean;
begin
  -- A centre pays for a visitor: no member, no budget, no user on the ledger.
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Widget centre', owner) returning id into centre;
  perform public.ai_credit_grant(centre, 10, 'pack', 'widget-pack');
  r := public.ai_credit_charge(centre, null, 2, 'admissions.reply', 'widget-1', 0, null, t0);
  assert r->>'ok' = 'true', format('workspace pays: %s', r);
  assert (select bool_and(user_id is null) and sum(delta) = -2 from public.ai_credit_ledger where reference = 'widget-1'), 'no user on the ledger';
  r := public.ai_credit_charge(centre, '00000000-0000-4000-8000-0000000000a4', 2, 'admissions.reply', 'widget-2', 0, null, t0);
  assert r->>'code' = 'not_member', 'a named person must still be a member';
  r := public.ai_credit_charge(centre, null, 50, 'admissions.reply', 'widget-3', 0, null, t0);
  assert r->>'code' = 'insufficient_credits', 'the pool is the limit';
  perform public.ai_credit_refund((select charge_id from public.ai_credit_ledger where reference = 'widget-1' limit 1));
  assert (select pack_balance from public.ai_credit_accounts where workspace_id = centre) = 10, 'refund with no member';

  -- Fixed windows, all or nothing.
  assert (public.ai_rate_take('anon:test:a', 3, 60, t0))->>'ok' = 'true';
  assert (public.ai_rate_take('anon:test:a', 3, 60, t0 + interval '10 seconds'))->>'remaining' = '1';
  assert (public.ai_rate_take('anon:test:a', 3, 60, t0 + interval '20 seconds'))->>'ok' = 'true';
  r := public.ai_rate_take('anon:test:a', 3, 60, t0 + interval '30 seconds');
  assert r->>'ok' = 'false' and (r->>'retry_at')::timestamptz = t0 + interval '60 seconds', format('full: %s', r);
  assert (public.ai_rate_take('anon:test:b', 3, 60, t0))->>'ok' = 'true', 'buckets are separate';
  assert (public.ai_rate_take('anon:test:a', 3, 60, t0 + interval '61 seconds'))->>'ok' = 'true', 'a new window';
  assert public.ai_rate_prune(t0 + interval '3 days') = 3, 'old windows pruned';
  raised := false;
  begin perform public.ai_rate_take('anon:test:a', 0, 60, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'limits are positive';

  -- The system secret exists once; the invoker refuses anything but area/action.
  assert (select count(*) from public.internal_runtime_secrets where key = 'schood_ai_system_secret' and length(secret) = 64) = 1, 'system secret created once';
  raised := false;
  begin perform public.invoke_schood_ai_system('admin/settings'); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'never the admin area';
  raised := false;
  begin perform public.invoke_schood_ai_system('engage/system-deliver', '[]'); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'the body is an object';

  -- Notification preferences: muted kinds and whole areas, then quiet hours and the budget.
  insert into public.ai_notify_prefs (user_id, time_zone, muted, delivery, preferred_hour) values (owner, 'Europe/Moscow', array['engage'], array['web'], 19);
  r := public.ai_notify(owner, 'engage.winback', true, t0);
  assert r->>'reason' = 'muted' and (r->>'retry_at')::timestamptz = '2026-11-05T05:00:00Z', format('muted: %s', r);
  assert (public.ai_notify(owner, 'coach.ielts', true, t0))->>'allowed' = 'true', 'other kinds still go';
  assert (public.ai_notify(owner, 'coach.ielts', false, '2026-11-04T20:00:00Z'))->>'reason' = 'quiet_hours', '23:00 in Moscow';
  assert (select delivery = array['web'] and preferred_hour = 19 from public.ai_notify_prefs where user_id = owner), 'preferences kept';
  raised := false;
  begin update public.ai_notify_prefs set delivery = array['sms'] where user_id = owner; exception when check_violation then raised := true; end;
  assert raised, 'only telegram and web';
end $$;

set role service_role;
do $$
begin
  begin insert into public.ai_rate_limits (bucket, window_start) values ('x', now()); raise exception 'service role wrote a rate window'; exception when insufficient_privilege then null; end;
  perform public.ai_rate_take('anon:test:service', 5, 60, now());
  begin perform public.invoke_schood_ai_system('engage/system-deliver'); raise exception 'service role invoked a system route'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform public.ai_rate_take('anon:test:anon', 5, 60, now()); raise exception 'anon took a rate slot'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'schood ai callers: ok';
