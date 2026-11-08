-- Company English coach: the deck's one-card-per-phrase rule, the log that counts each
-- event once, kudos limits, cascades and lockdown.
\set ON_ERROR_STOP 1
insert into public.users(id) values ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2');
-- The registry account closure reads, as production has it.
create or replace function public.account_personal_erasure_tables() returns text[] language sql immutable as $$ select array['sample_table']::text[]; $$;
\i /work/migration.sql

do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000b1';
  colleague constant uuid := '00000000-0000-4000-8000-0000000000b2';
  org uuid;
  member uuid;
  peer uuid;
  card uuid;
  counted integer;
begin
  insert into public.company_orgs(name, status, seats_limit) values ('Silk Road Hotels', 'active', 5) returning id into org;
  insert into public.company_members(org_id, user_id, role, status, job_role, seat) values (org, learner, 'employee', 'active', 'hospitality', true) returning id into member;
  insert into public.company_members(org_id, user_id, role, status, job_role, seat) values (org, colleague, 'employee', 'active', 'sales', true) returning id into peer;

  -- Settings: defaults, and an upsert that names only one column leaves the others alone.
  insert into public.company_coach_settings(member_id, org_id, user_id, weekly_goal) values (member, org, learner, 5);
  insert into public.company_coach_settings(member_id, org_id, user_id, kudos_opt_in) values (member, org, learner, true)
    on conflict (member_id) do update set kudos_opt_in = excluded.kudos_opt_in;
  assert (select weekly_goal from public.company_coach_settings where member_id = member) = 5, 'goal kept';
  assert (select rest_days from public.company_coach_settings where member_id = member) = '{0,6}'::integer[], 'rest day default';
  assert (select daily_minutes from public.company_coach_settings where member_id = member) = 10, 'plan default';
  begin
    update public.company_coach_settings set weekly_goal = 8 where member_id = member;
    raise exception 'goal of 8 accepted';
  exception when check_violation then null;
  end;
  begin
    update public.company_coach_settings set daily_minutes = 7 where member_id = member;
    raise exception 'seven minutes accepted';
  exception when check_violation then null;
  end;

  -- One card per phrase per person: the bulk sync's upsert leaves an existing card alone.
  insert into public.company_coach_cards(org_id, member_id, user_id, source, front, front_key, reps, stability, due_on)
    values (org, member, learner, 'own', 'Good morning', 'good morning', 4, 12.5, current_date + 3) returning id into card;
  insert into public.company_coach_cards(org_id, member_id, user_id, source, front, front_key)
    values (org, member, learner, 'lesson', 'GOOD MORNING', 'good morning') on conflict (member_id, front_key) do nothing;
  assert (select count(*) from public.company_coach_cards where member_id = member) = 1, 'one card';
  assert (select reps from public.company_coach_cards where id = card) = 4, 'progress kept';
  insert into public.company_coach_cards(org_id, member_id, front, front_key) values (org, peer, 'Good morning', 'good morning');
  begin
    insert into public.company_coach_cards(org_id, member_id, front, front_key) values (org, member, 'Good morning', 'good morning');
    raise exception 'duplicate card accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.company_coach_cards(org_id, member_id, front, front_key, source) values (org, member, 'x', 'x', 'telepathy');
    raise exception 'unknown source accepted';
  exception when check_violation then null;
  end;
  begin
    update public.company_coach_cards set difficulty = 11 where id = card;
    raise exception 'difficulty 11 accepted';
  exception when check_violation then null;
  end;

  -- updated_at moves on an update (now() is fixed inside this block, so set an old value first).
  alter table public.company_coach_cards disable trigger company_coach_cards_updated_at;
  update public.company_coach_cards set updated_at = '2020-01-01' where id = card;
  alter table public.company_coach_cards enable trigger company_coach_cards_updated_at;
  update public.company_coach_cards set suspended = true where id = card;
  assert (select updated_at from public.company_coach_cards where id = card) > '2020-01-02', 'trigger ran';

  -- The log counts an event once, per person, kind, day and reference.
  insert into public.company_coach_log(org_id, member_id, user_id, day, kind, ref, score) values (org, member, learner, current_date, 'review', 'c:1', 75)
    on conflict (member_id, day, kind, ref) do nothing;
  insert into public.company_coach_log(org_id, member_id, user_id, day, kind, ref, score) values (org, member, learner, current_date, 'review', 'c:1', 75)
    on conflict (member_id, day, kind, ref) do nothing;
  get diagnostics counted = row_count;
  assert counted = 0, 'second event ignored';
  insert into public.company_coach_log(org_id, member_id, day, kind, ref) values (org, member, current_date + 1, 'review', 'c:1');
  insert into public.company_coach_log(org_id, member_id, day, kind, ref) values (org, member, current_date, 'shadow', 'c:1');
  assert (select count(*) from public.company_coach_log where member_id = member) = 3, 'other days and kinds count';
  begin
    insert into public.company_coach_log(org_id, member_id, day, kind, ref) values (org, member, current_date, 'gossip', 'x');
    raise exception 'unknown log kind accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_coach_log(org_id, member_id, day, kind, ref, score) values (org, member, current_date, 'shadow', 'y', 101);
    raise exception 'score 101 accepted';
  exception when check_violation then null;
  end;

  -- A plan per day, the first stored wins.
  insert into public.company_coach_plans(member_id, org_id, user_id, day, items) values (member, org, learner, current_date, '[{"type":"review"}]');
  insert into public.company_coach_plans(member_id, org_id, user_id, day, items) values (member, org, learner, current_date, '[]') on conflict (member_id, day) do nothing;
  assert (select jsonb_array_length(items) from public.company_coach_plans where member_id = member) = 1, 'first plan kept';
  begin
    insert into public.company_coach_plans(member_id, org_id, day, items) values (member, org, current_date + 1, '{}');
    raise exception 'plan items must be a list';
  exception when check_violation then null;
  end;

  -- Kudos: once per pair per day; a badge once per person.
  insert into public.company_coach_kudos(org_id, from_member, to_member, message, day) values (org, member, peer, 'great_call', current_date);
  begin
    insert into public.company_coach_kudos(org_id, from_member, to_member, message, day) values (org, member, peer, 'keep_going', current_date);
    raise exception 'second kudos in a day accepted';
  exception when unique_violation then null;
  end;
  insert into public.company_coach_kudos(org_id, from_member, to_member, message, day) values (org, member, peer, 'keep_going', current_date + 1);
  insert into public.company_coach_kudos(org_id, from_member, kind, badge, day) values (org, member, 'badge', 'streak_7', current_date);
  begin
    insert into public.company_coach_kudos(org_id, from_member, kind, badge, day) values (org, member, 'badge', 'streak_7', current_date + 1);
    raise exception 'second share of a badge accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.company_coach_kudos(org_id, from_member, kind, day) values (org, member, 'kudos', current_date + 2);
    raise exception 'kudos without a person accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_coach_kudos(org_id, from_member, to_member, message, note, day) values (org, member, peer, 'keep_going', repeat('x', 141), current_date + 3);
    raise exception 'long note accepted';
  exception when check_violation then null;
  end;

  -- HR's switch.
  insert into public.company_coach_org(org_id, kudos_off, updated_by) values (org, true, learner)
    on conflict (org_id) do update set kudos_off = excluded.kudos_off;
  assert (select kudos_off from public.company_coach_org where org_id = org), 'switch stored';

  -- Removing a member removes their practice and their kudos, sent and received.
  delete from public.company_members where id = peer;
  assert (select count(*) from public.company_coach_cards where member_id = peer) = 0, 'cards cascade';
  assert (select count(*) from public.company_coach_kudos where kind = 'kudos') = 0, 'kudos cascade';
  delete from public.company_members where id = member;
  assert (select count(*) from public.company_coach_log where org_id = org) = 0, 'log cascades';
  assert (select count(*) from public.company_coach_plans where org_id = org) = 0, 'plans cascade';
  assert (select count(*) from public.company_coach_settings where org_id = org) = 0, 'settings cascade';
  assert (select count(*) from public.company_coach_kudos where org_id = org) = 0, 'badges cascade';
  delete from public.company_orgs where id = org;
  assert (select count(*) from public.company_coach_org) = 0, 'switch cascades';
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['company_coach_settings','company_coach_cards','company_coach_log','company_coach_plans','company_coach_kudos','company_coach_org'] loop
    assert not has_table_privilege('authenticated', format('public.%I', t), 'select'), t || ' authenticated select';
    assert not has_table_privilege('anon', format('public.%I', t), 'select'), t || ' anon select';
    assert not has_table_privilege('authenticated', format('public.%I', t), 'insert'), t || ' authenticated insert';
    assert has_table_privilege('service_role', format('public.%I', t), 'insert'), t || ' service role';
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), t || ' rls';
  end loop;
end
$$;

-- Closing an account clears these tables, and what the registry already held stays.
do $$
begin
  assert public.account_personal_erasure_tables() @> array['sample_table','company_coach_settings','company_coach_cards','company_coach_log','company_coach_plans'], 'erasure registry';
end
$$;
select 'company coach2: ok';
