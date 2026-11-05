-- Integration test for 20261030200000_schood_ai_learner.sql, run after the core
-- migrations on an isolated database (scripts/test-schood-ai-learner-db.mjs).
-- Every check raises on failure; the last line is the success marker.
insert into public.users (id) values
  ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000b3'),
  ('00000000-0000-4000-8000-0000000000b4'), ('00000000-0000-4000-8000-0000000000b5')
on conflict (id) do nothing;

do $$
declare
  v_table text;
  v_ws uuid;
  v_out jsonb;
  v_now timestamptz := now();
  v_parent uuid := '00000000-0000-4000-8000-0000000000b1';
  v_failed boolean;
begin
  -- RLS on, nothing for browsers.
  foreach v_table in array array['ai_learner_consents', 'ai_learner_family_links', 'ai_learner_activity', 'ai_learner_records', 'ai_learner_briefs', 'ai_learner_snapshots', 'ai_learner_telegram', 'ai_learner_duels'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then raise exception '% has no RLS', v_table; end if;
    if has_table_privilege('anon', 'public.' || v_table, 'select') or has_table_privilege('authenticated', 'public.' || v_table, 'select')
      or has_table_privilege('authenticated', 'public.' || v_table, 'insert') then raise exception '% is open to browsers', v_table; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.ai_learner_family_accept(text, uuid, timestamptz, integer)', 'execute')
    or has_function_privilege('anon', 'public.ai_learner_family_invite(uuid, uuid, text, text, text, timestamptz, text, timestamptz, integer)', 'execute') then
    raise exception 'family functions are open to browsers';
  end if;

  -- Family: up to 3 children, counting open invites.
  select id into v_ws from public.ai_ensure_personal_workspace(v_parent, 'Family');
  for i in 1..3 loop
    v_out := public.ai_learner_family_invite(v_ws, v_parent, 'Child ' || i, lpad(to_hex(i), 64, '0'), 'AB' || i, v_now + interval '7 days', 'v1', v_now, 3);
    if (v_out->>'ok')::boolean is not true then raise exception 'invite % refused: %', i, v_out; end if;
  end loop;
  v_out := public.ai_learner_family_invite(v_ws, v_parent, 'Fourth', lpad('ff', 64, '0'), 'ZZ', v_now + interval '7 days', 'v1', v_now, 3);
  if v_out->>'code' is distinct from 'limit' then raise exception 'a fourth open invite must be refused: %', v_out; end if;

  v_out := public.ai_learner_family_accept(lpad(to_hex(1), 64, '0'), v_parent, v_now, 3);
  if v_out->>'code' is distinct from 'own_invite' then raise exception 'a parent cannot accept their own invite: %', v_out; end if;
  v_out := public.ai_learner_family_accept(lpad(to_hex(1), 64, '0'), '00000000-0000-4000-8000-0000000000b2', v_now, 3);
  if (v_out->>'ok')::boolean is not true or (v_out->>'parent_id')::uuid <> v_parent then raise exception 'accept failed: %', v_out; end if;
  v_out := public.ai_learner_family_accept(lpad(to_hex(1), 64, '0'), '00000000-0000-4000-8000-0000000000b3', v_now, 3);
  if v_out->>'code' is distinct from 'not_found' then raise exception 'a used code must not work again: %', v_out; end if;
  v_out := public.ai_learner_family_accept(lpad(to_hex(2), 64, '0'), '00000000-0000-4000-8000-0000000000b2', v_now, 3);
  if v_out->>'code' is distinct from 'already_linked' then raise exception 'the same child twice: %', v_out; end if;
  v_out := public.ai_learner_family_accept(lpad(to_hex(3), 64, '0'), '00000000-0000-4000-8000-0000000000b3', v_now + interval '8 days', 3);
  if v_out->>'code' is distinct from 'expired' then raise exception 'an old invite must expire: %', v_out; end if;
  if (select count(*) from public.ai_learner_family_links where parent_id = v_parent and status = 'active') <> 1 then raise exception 'one active link expected'; end if;
  if exists (select 1 from public.ai_learner_family_links where status <> 'invited' and invite_hash is not null) then raise exception 'used invites keep no hash'; end if;

  -- A brief inside quiet hours is refused; a weekday only for the parent brief.
  v_failed := false;
  begin insert into public.ai_learner_briefs (user_id, kind, send_time) values (v_parent, 'daily', '23:00'); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'quiet hours must be refused'; end if;
  v_failed := false;
  begin insert into public.ai_learner_briefs (user_id, kind, send_time, weekday) values (v_parent, 'daily', '08:30', 1); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'a daily brief has no weekday'; end if;
  insert into public.ai_learner_briefs (user_id, kind, send_time, weekday, next_due_at) values (v_parent, 'parent', '10:00', 0, v_now);

  -- One brief record per learner and day; summaries stay small.
  insert into public.ai_learner_records (user_id, workspace_id, kind, day) values (v_parent, v_ws, 'brief', current_date);
  v_failed := false;
  begin insert into public.ai_learner_records (user_id, workspace_id, kind, day) values (v_parent, v_ws, 'brief', current_date); exception when unique_violation then v_failed := true; end;
  if not v_failed then raise exception 'two briefs on one day'; end if;
  v_failed := false;
  begin insert into public.ai_learner_activity (user_id, workspace_id, feature, kind, summary) values (v_parent, v_ws, 'L2', 'mistake', jsonb_build_object('text', repeat('x', 5000))); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'activity summaries are bounded'; end if;
  v_failed := false;
  begin insert into public.ai_learner_records (user_id, workspace_id, kind) values (v_parent, v_ws, 'secret_notes'); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'unknown record kinds are refused'; end if;
  v_failed := false;
  begin insert into public.ai_learner_duels (duel_id, code, creator_id, workspace_id, topic) values (gen_random_uuid(), 'bad', v_parent, v_ws, 'x'); exception when check_violation then v_failed := true; end;
  if not v_failed then raise exception 'duel codes are checked'; end if;

  -- 180-day retention: old records and activity go, an active study plan stays.
  insert into public.ai_learner_records (user_id, workspace_id, kind, status, updated_at) values
    (v_parent, v_ws, 'writing', 'ready', now() - interval '200 days'),
    (v_parent, v_ws, 'plan', 'active', now() - interval '200 days'),
    (v_parent, v_ws, 'reading', 'ready', now() - interval '10 days');
  insert into public.ai_learner_activity (user_id, workspace_id, feature, kind, created_at) values (v_parent, v_ws, 'L3', 'writing', now() - interval '200 days');
  v_out := public.ai_learner_purge_old(180);
  if (v_out->>'records')::int <> 1 or (v_out->>'activity')::int <> 1 then raise exception 'retention purge: %', v_out; end if;
  if not exists (select 1 from public.ai_learner_records where user_id = v_parent and kind = 'plan' and status = 'active') then raise exception 'an active plan must stay'; end if;
  if has_function_privilege('authenticated', 'public.ai_learner_purge_old(integer, integer, timestamptz)', 'execute') then raise exception 'purge is open to browsers'; end if;
  -- The account erasure registry knows the learner tables keyed on user_id.
  if not (array['ai_learner_consents', 'ai_learner_activity', 'ai_learner_records', 'ai_learner_briefs', 'ai_learner_snapshots', 'ai_learner_telegram'] <@ public.account_personal_erasure_tables()) then
    raise exception 'erasure registry misses learner tables: %', public.account_personal_erasure_tables();
  end if;

  -- Deleting the person removes their learner data.
  insert into public.ai_learner_consents (user_id, age_band, text_version) values ('00000000-0000-4000-8000-0000000000b5', 'adult', 'v1');
  delete from public.users where id = '00000000-0000-4000-8000-0000000000b5';
  if exists (select 1 from public.ai_learner_consents where user_id = '00000000-0000-4000-8000-0000000000b5') then raise exception 'consent outlived the account'; end if;
end $$;

-- Account closure through auth.users (the fixture's stand-in for the closure
-- transaction): learner rows keyed on user_id go, and the hook removes family links,
-- AI duels and guardian references; other people's rows stay.
insert into public.users (id) values ('00000000-0000-4000-8000-0000000000c7'), ('00000000-0000-4000-8000-0000000000c8') on conflict (id) do nothing;
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000c7'), ('00000000-0000-4000-8000-0000000000c8') on conflict (id) do nothing;
do $$
declare
  v_parent constant uuid := '00000000-0000-4000-8000-0000000000c7';
  v_child constant uuid := '00000000-0000-4000-8000-0000000000c8';
  v_ws uuid := (public.ai_ensure_personal_workspace(v_parent, 'Closing family')).id;
  v_child_ws uuid := (public.ai_ensure_personal_workspace(v_child, 'Child')).id;
  v_out jsonb;
begin
  assert 'learner_erase_account' = any(public.account_erasure_service_hooks()), 'the learner hook is registered';
  v_out := public.ai_learner_family_invite(v_ws, v_parent, 'Kid', lpad('c7', 64, '0'), 'C7', now() + interval '7 days', 'v1', now(), 3);
  v_out := public.ai_learner_family_accept(lpad('c7', 64, '0'), v_child, now(), 3);
  assert (v_out->>'ok')::boolean, 'linked';
  insert into public.ai_learner_consents (user_id, age_band, guardian_confirmed, guardian_user_id, text_version) values (v_child, '13_17', true, v_parent, 'v1');
  insert into public.ai_learner_records (user_id, workspace_id, kind) values (v_parent, v_ws, 'writing'), (v_child, v_child_ws, 'reading');
  insert into public.ai_learner_activity (user_id, workspace_id, feature, kind) values (v_parent, v_ws, 'P1', 'parent_brief');
  insert into public.ai_learner_duels (duel_id, code, creator_id, workspace_id, topic) values (gen_random_uuid(), 'ABCDEFGHJK', v_parent, v_child_ws, 'travel');
  update auth.users set deleted_at = now() where id = v_parent;
  assert exists (select 1 from public.account_closure_receipts where user_id = v_parent), 'closed';
  assert not exists (select 1 from public.ai_learner_records where user_id = v_parent), 'their records are gone';
  assert not exists (select 1 from public.ai_learner_activity where user_id = v_parent), 'their activity is gone';
  assert not exists (select 1 from public.ai_learner_family_links where parent_id = v_parent or child_id = v_parent), 'family links are gone';
  assert not exists (select 1 from public.ai_learner_duels where creator_id = v_parent), 'their duels are gone';
  assert (select guardian_user_id is null and not guardian_confirmed from public.ai_learner_consents where user_id = v_child), 'the child loses the guardian link';
  assert exists (select 1 from public.ai_learner_records where user_id = v_child), 'the child keeps their own records';
  -- Running the hook again changes nothing.
  assert (public.learner_erase_account(v_parent)->>'family_links')::int = 0, 'idempotent';
end $$;

select 'schood ai learner: ok';
