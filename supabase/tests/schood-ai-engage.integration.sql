-- Schood AI engage (20261030800000): XP from verified learning only, the daily cap,
-- local days, league groups of 30 and settling once, freezes once a week, squads of
-- five, journey chapters closed once, the outbox claim, who is due, boards, append-only
-- XP and audit, account deletion, and browser isolation. Plain SQL so it runs on PGlite
-- and on a real Postgres (scripts/test-schood-ai-engage-db.mjs).
do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  friend constant uuid := '00000000-0000-4000-8000-0000000000a3';
  owner constant uuid := '00000000-0000-4000-8000-0000000000a1';
  t0 constant timestamptz := '2026-11-02T06:00:00Z'; -- Monday 11:00 in Tashkent
  r jsonb;
  g uuid; g2 uuid;
  ok boolean;
  s uuid;
  j public.ai_engage_journeys;
  f public.ai_engage_freeze_buys;
  centre uuid;
  raised boolean;
  n integer;
begin
  -- The XP rule equals engage/rules.ts eventXp (the same table as rules.test.ts XP_CASES).
  assert public.ai_engage_event_xp('turn_scored', 5, true) = 15, 'turn 5 min';
  assert public.ai_engage_event_xp('check_passed', 0, true) = 5, 'check';
  assert public.ai_engage_event_xp('drill_finished', 10, true) = 30, 'drill';
  assert public.ai_engage_event_xp('mock_finished', 45, true) = 90, 'mock, minutes capped at 30';
  assert public.ai_engage_event_xp('outcome_recorded', 0, true) = 50, 'outcome';
  assert public.ai_engage_event_xp('check_failed', 0, false) = 0, 'a failed check earns nothing';
  assert public.ai_engage_event_xp('lesson_viewed', 0, false) = 0, 'opening earns nothing';
  assert public.ai_engage_event_xp('goal_set', 0, false) = 0, 'setting a goal earns nothing';
  assert public.ai_engage_event_xp('turn_scored', 240, true) = 65, 'turn, minutes capped';
  assert public.ai_engage_event_xp('turn_scored', 10, false) = 0, 'unverified rows never earn';

  -- Verified events count once; unverified never; reading twice changes nothing.
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, skill, verified_minutes, created_at) values
    (learner, 'coach', 'turn_scored', true, 'B1', 'ielts.speaking', 5, t0),
    (learner, 'coach', 'check_passed', true, 'B1', 'ielts.reading', 0, t0),
    (learner, 'coach', 'lesson_viewed', false, 'B1', null, 0, t0),
    (learner, 'coach', 'check_failed', false, 'B1', 'ielts.reading', 0, t0),
    (learner, 'engage', 'goal_set', false, 'E1', null, 0, t0);
  r := public.ai_engage_ingest(learner, t0 + interval '1 minute');
  assert (r->>'events')::int = 2 and (r->>'awarded')::int = 20, format('two verified events, 20 XP: %s', r);
  r := public.ai_engage_ingest(learner, t0 + interval '2 minutes');
  assert (r->>'events')::int = 0, 'nothing counted twice';
  assert (select count(*) from public.ai_engage_xp where user_id = learner) = 2, 'one row per verified event';
  assert (select xp from public.ai_engage_days where user_id = learner and day = '2026-11-02') = 20, 'the day has 20 XP';
  assert (select week_start from public.ai_engage_xp where user_id = learner limit 1) = '2026-11-02', 'Tashkent league week (Monday)';

  -- The daily cap: 600 XP a day from learning.
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, skill, verified_minutes, created_at)
    select learner, 'coach', 'mock_finished', true, 'B1', 'ielts.mock', 30, t0 + interval '10 minutes' from generate_series(1, 8);
  perform public.ai_engage_ingest(learner, t0 + interval '20 minutes');
  assert (select sum(xp) from public.ai_engage_xp where user_id = learner and day = '2026-11-02' and source = 'event') = 600, 'capped at 600';
  assert (select events from public.ai_engage_days where user_id = learner and day = '2026-11-02') = 10, 'every verified act still counts as activity';

  -- Local days follow the time zone the person chose in core's notification preferences.
  insert into public.ai_notify_prefs (user_id, time_zone) values (learner, 'Europe/London')
    on conflict (user_id) do update set time_zone = excluded.time_zone;
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes, created_at) values (learner, 'coach', 'turn_scored', true, 'B2', 1, '2026-11-03T23:30:00Z');
  perform public.ai_engage_ingest(learner, '2026-11-04T00:00:00Z');
  assert exists (select 1 from public.ai_engage_days where user_id = learner and day = '2026-11-03'), 'London date, not Tashkent';

  -- Quest bonuses once per key.
  assert public.ai_engage_award_bonus(learner, 'quest', '2026-11-02:minutes_10', 10, '2026-11-02', '2026-11-02'), 'bonus';
  assert not public.ai_engage_award_bonus(learner, 'quest', '2026-11-02:minutes_10', 10, '2026-11-02', '2026-11-02'), 'never twice';
  assert not public.ai_engage_award_bonus(learner, 'quest', '2026-11-02:big', 5000, '2026-11-02', '2026-11-02'), 'bonuses are small';
  assert not public.ai_engage_award_bonus(learner, 'event', 'x:y', 10, '2026-11-02', '2026-11-02'), 'only quests and challenges';

  -- Freezes: one a week, a pending reservation is resumed with the same reference.
  f := public.ai_engage_freeze_reserve(learner, '2026-11-02', '2026-11-02', 'engage.freeze:a2:2026-11-02', 10);
  assert f.id is not null, 'reserved';
  assert (public.ai_engage_freeze_reserve(learner, '2026-11-02', '2026-11-02', 'engage.freeze:a2:2026-11-02', 10)).id = f.id, 'resumed';
  assert (public.ai_engage_freeze_reserve(learner, '2026-11-03', '2026-11-02', 'engage.freeze:other-ref', 10)).id is null, 'one a week';

  -- Leagues: groups of 30, joining counts the week so far, the ingest keeps it current, settled once.
  g := public.ai_engage_league_join(learner, '2026-11-02', 'bronze', 'open');
  assert (select xp from public.ai_engage_league_members where user_id = learner and week_start = '2026-11-02') = 617, 'the week so far: 600 capped + 7 on the London day + the 10 bonus';
  assert public.ai_engage_league_join(learner, '2026-11-02', 'bronze', 'open') = g, 'joining again changes nothing';
  for n in 1..34 loop
    perform public.ai_engage_league_join(('00000000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid, '2026-11-02', 'bronze', 'open');
  end loop;
  assert (select count(*) from public.ai_engage_league_groups where week_start = '2026-11-02') = 2, 'two groups';
  assert (select max(c) from (select count(*) c from public.ai_engage_league_members group by group_id) x) = 30, 'never more than 30';
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes, created_at) values (learner, 'coach', 'turn_scored', true, 'B1', 0, '2026-11-04T10:00:00Z');
  perform public.ai_engage_ingest(learner, '2026-11-04T11:00:00Z');
  assert (select xp from public.ai_engage_league_members where user_id = learner and week_start = '2026-11-02') = 622, 'the ingest adds to this week''s league';
  assert public.ai_engage_league_settle(g, jsonb_build_array(jsonb_build_object('user_id', learner, 'rank', 1, 'outcome', 'promoted'))), 'settled';
  assert not public.ai_engage_league_settle(g, '[]'::jsonb), 'settled once';
  assert (select outcome from public.ai_engage_league_members where user_id = learner) = 'promoted', 'outcome kept';

  -- Journeys: a chapter closes once.
  insert into public.ai_engage_journeys (user_id, journey_key, started_on) values (learner, 'ielts_55_70', '2026-11-02') returning * into j;
  assert (public.ai_engage_journey_advance(j.id, 0, '[{"chapter":1,"at":"2026-11-02T10:00:00Z"}]', null, null)).id = j.id, 'chapter 1 closed';
  assert (public.ai_engage_journey_advance(j.id, 0, '[{"chapter":1,"at":"2026-11-02T10:00:01Z"}]', null, null)).id is null, 'not twice';
  raised := false;
  begin insert into public.ai_engage_journeys (user_id, journey_key, started_on) values (learner, 'ielts_55_70', '2026-11-03'); exception when unique_violation then raised := true; end;
  assert raised, 'one open journey per kind';

  -- Squads: one active squad per person, five members at most, ownership passes on.
  s := public.ai_engage_squad_create('Morning Owls', learner, 'ABCDEFGH', 150, null);
  assert s is not null, 'created';
  assert public.ai_engage_squad_create('Second', learner, 'ABCDEFGJ', 150, null) is null, 'one squad at a time';
  assert public.ai_engage_squad_join(s, friend, 5, null) = 'ok', 'joined';
  assert public.ai_engage_squad_join(s, friend, 5, null) = 'ok', 'joining twice is fine';
  for n in 1..3 loop assert public.ai_engage_squad_join(s, ('00000000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid, 5, null) = 'ok', 'joined'; end loop;
  assert public.ai_engage_squad_join(s, '00000000-0000-4000-8000-000000000110', 5, null) = 'full', 'five at most';
  perform public.ai_engage_squad_create('Other', owner, 'ABCDEFGK', 150, null);
  assert public.ai_engage_squad_join(s, owner, 5, null) = 'already_in_squad', 'one squad per person';
  perform public.ai_engage_squad_leave(s, learner);
  assert (select owner_id from public.ai_engage_squads where id = s) = friend, 'ownership passes to the longest member';

  -- The outbox: due rows claimed once, by priority; expired ones never.
  insert into public.ai_engage_outbox (user_id, channel, kind, priority, dedupe_key, payload, due_at, expires_at) values
    (learner, 'telegram', 'streak_risk', 80, 'dk-1', '{"text":"a"}', t0, t0 + interval '10 hours'),
    (learner, 'telegram', 'checkin_soon', 90, 'dk-2', '{"text":"b"}', t0, t0 + interval '10 hours'),
    (learner, 'telegram', 'league_result', 40, 'dk-3', '{"text":"c"}', t0 + interval '5 hours', t0 + interval '10 hours'),
    (learner, 'telegram', 'winback_2', 65, 'dk-4', '{"text":"d"}', t0 - interval '1 day', t0 - interval '1 hour');
  assert (select array_agg(kind order by priority desc) from public.ai_engage_outbox_claim(learner, 'telegram', t0 + interval '1 hour', 2)) = array['checkin_soon', 'streak_risk'], 'due, by priority';
  assert (select count(*) from public.ai_engage_outbox_claim(learner, 'telegram', t0 + interval '1 hour', 2)) = 0, 'claimed once';
  assert (select status from public.ai_engage_outbox where dedupe_key = 'dk-4') = 'expired', 'stale messages expire';
  raised := false;
  begin insert into public.ai_engage_outbox (user_id, channel, kind, priority, dedupe_key, payload, due_at, expires_at) values (learner, 'telegram', 'streak_risk', 80, 'dk-1', '{}', t0, t0); exception when unique_violation then raised := true; end;
  assert raised, 'the dedupe key queues a message once';
  assert (select count(*) from public.ai_engage_outbox where status = 'claimed' and claimed_at is not null) = 2, 'claims record when';

  -- The deliver job's claim across everyone: due Telegram rows once each, never web ones;
  -- a claim older than ten minutes (a run that died) is handed back.
  update public.ai_engage_outbox set status = 'sent', claim_token = null, claimed_at = null where dedupe_key in ('dk-1', 'dk-2');
  insert into public.ai_engage_outbox (user_id, channel, kind, priority, dedupe_key, payload, due_at, expires_at) values
    (friend, 'telegram', 'squad_nudge', 50, 'dk-5', '{"text":"e"}', t0, t0 + interval '10 hours'),
    (friend, 'web', 'streak_risk', 80, 'dk-6', '{"text":"f"}', t0, t0 + interval '10 hours');
  assert (select array_agg(dedupe_key order by dedupe_key) from public.ai_engage_outbox_claim_due(t0 + interval '6 hours', 10)) = array['dk-3', 'dk-5'], 'every due Telegram row, never a web one';
  assert (select count(*) from public.ai_engage_outbox_claim_due(t0 + interval '6 hours 5 minutes', 10)) = 0, 'a live claim is not handed out again';
  assert (select count(*) from public.ai_engage_outbox_claim_due(t0 + interval '6 hours 11 minutes', 10)) = 2, 'a lapsed claim is handed back';
  assert (select status from public.ai_engage_outbox where dedupe_key = 'dk-6') = 'queued', 'the web inbox keeps its own';

  -- Who is due (core's notification preferences): after their preferred hour (19:00 when none),
  -- outside their quiet hours, once a day, where messages reach them (a linked chat, or the
  -- in-app inbox with chat_id null), never when engage is muted or the limit is zero.
  insert into public.ai_engage_profiles (user_id) values (friend) on conflict do nothing;
  update public.ai_notify_prefs set time_zone = 'Asia/Tashkent' where user_id = learner;
  assert (select count(*) from public.ai_engage_due_users('2026-11-05T10:00:00Z', 100)) = 0, '15:00 local is early';
  create temp table due_check as select * from public.ai_engage_due_users('2026-11-05T14:30:00Z', 100);
  assert (select chat_id from due_check where user_id = learner) = '700100', 'a linked chat';
  assert exists (select 1 from due_check where user_id = friend and chat_id is null), 'the in-app inbox';
  drop table due_check;
  assert not exists (select 1 from public.ai_engage_due_users('2026-11-05T15:00:00Z', 100) d where d.user_id = learner), 'once a day';
  assert not exists (select 1 from public.ai_engage_due_users('2026-11-06T18:00:00Z', 100) d where d.user_id = learner), 'never in quiet hours (23:00)';
  update public.ai_notify_prefs set muted = array['engage'] where user_id = learner;
  insert into public.ai_notify_prefs (user_id, delivery) values (friend, array['telegram']) on conflict (user_id) do update set delivery = excluded.delivery;
  assert not exists (select 1 from public.ai_engage_due_users('2026-11-07T14:30:00Z', 100) d where d.user_id in (learner, friend)), 'muted, or Telegram only without a chat';
  update public.ai_notify_prefs set muted = '{}', daily_limit = 0 where user_id = learner;
  assert not exists (select 1 from public.ai_engage_due_users('2026-11-08T14:30:00Z', 100) d where d.user_id = learner), 'zero a day';
  update public.ai_notify_prefs set daily_limit = 2, preferred_hour = 21 where user_id = learner;
  assert not exists (select 1 from public.ai_engage_due_users('2026-11-09T14:30:00Z', 100) d where d.user_id = learner), 'before the chosen 21:00';
  assert exists (select 1 from public.ai_engage_due_users('2026-11-09T16:05:00Z', 100) d where d.user_id = learner), 'at 21:00';

  -- Boards: weekly XP by region, school and centre students; centres opted in.
  update public.ai_engage_profiles set region = 'samarkand', school = 'school 21' where user_id = learner;
  assert (select user_id from public.ai_engage_board('region', 'samarkand', '2026-11-02', 10)) = learner, 'region';
  assert (select count(*) from public.ai_engage_board('school', 'school 99', '2026-11-02', 10)) = 0, 'other school';
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Registan', owner) returning id into centre;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (centre, owner, 'owner'), (centre, learner, 'student');
  assert (select count(*) from public.ai_engage_board('centre', centre::text, '2026-11-02', 10)) = 1, 'the centre''s students';
  insert into public.ai_engage_centre_league (workspace_id) values (centre);
  assert (select count(*) from public.ai_engage_centre_board('2026-11-02', 5, 10)) = 0, 'five active learners at least';
  assert (select active from public.ai_engage_centre_board('2026-11-02', 1, 10)) = 1, 'one active learner';

  -- Append-only XP and talent audit; constraints that protect people.
  raised := false; begin update public.ai_engage_xp set xp = 500 where user_id = learner; exception when insufficient_privilege then raised := true; end;
  assert raised, 'XP cannot be rewritten';
  raised := false; begin delete from public.ai_engage_xp where user_id = learner; exception when insufficient_privilege then raised := true; end;
  assert raised, 'XP cannot be deleted';
  insert into public.ai_engage_talent_audit (employer_id, action, query, target_user_id) values (owner, 'view', '{}', friend);
  raised := false; begin update public.ai_engage_talent_audit set action = 'search'; exception when insufficient_privilege then raised := true; end;
  assert raised, 'the talent audit cannot be rewritten';
  raised := false; begin insert into public.ai_engage_passport_links (user_id, token_hash, label, item_ids) values (learner, 'plain-token', 'x', array[gen_random_uuid()]); exception when check_violation then raised := true; end;
  assert raised, 'only a token hash is stored';
  raised := false; begin insert into public.ai_engage_profiles (user_id, daily_limit_minutes) values ('00000000-0000-4000-8000-000000000150', 30); exception when check_violation then raised := true; end;
  assert raised, 'a limit always says who set it';

  -- Deleting an account removes their engage rows and clears them from the audit.
  delete from public.users where id = friend;
  assert not exists (select 1 from public.ai_engage_squad_members where user_id = friend), 'squad membership gone';
  assert (select target_user_id from public.ai_engage_talent_audit limit 1) is null, 'the audit keeps the act, not the person';
end $$;

-- Closing an account: every engage table keyed on user_id is in the erasure registry
-- (once, after two runs), and the erasure transaction (a trigger) can delete a closing
-- person's rows, the append-only XP included; direct deletes stay refused.
do $$
declare listed text[] := public.account_personal_erasure_tables();
begin
  assert listed @> array['ai_engage_profiles', 'ai_engage_xp', 'ai_engage_days', 'ai_engage_league_members', 'ai_engage_passports', 'ai_engage_passport_items',
    'ai_engage_passport_links', 'ai_engage_samples', 'ai_engage_sittings', 'ai_engage_certificates', 'ai_engage_talent', 'ai_engage_outbox'], format('registry %s', listed);
  assert (select count(*) from unnest(listed) entry where entry like 'ai_engage_%') = 24, 'each listed once';
  assert not (listed && array['ai_engage_league_groups', 'ai_engage_squads', 'ai_engage_sponsors', 'ai_engage_talent_audit']), 'no personal content there';
  assert exists (select 1 from pg_trigger where tgname = 'account_closed_personal_guard' and tgrelid = 'public.ai_engage_xp'::regclass), 'closed-account guard installed';
  insert into public.ai_engage_passports (user_id, display_name) values ('00000000-0000-4000-8000-0000000000a2', 'Dilnoza') on conflict (user_id) do nothing;
  insert into public.ai_engage_samples (user_id, kind, source, text) values ('00000000-0000-4000-8000-0000000000a2', 'writing', 'engage', 'My first essay about my city and my family.');
end $$;
create temporary table engage_erasure_probe (user_id uuid);
create function pg_temp.engage_erase() returns trigger language plpgsql as $$
declare relation_name text;
begin
  foreach relation_name in array public.account_personal_erasure_tables() loop
    if relation_name like 'ai_%' then execute format('delete from public.%I where user_id = $1', relation_name) using new.user_id; end if;
  end loop;
  return new;
end $$;
create trigger engage_erase after insert on engage_erasure_probe for each row execute function pg_temp.engage_erase();
insert into engage_erasure_probe values ('00000000-0000-4000-8000-0000000000a2');
do $$
declare learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
begin
  assert not exists (select 1 from public.ai_engage_xp where user_id = learner), 'XP erased';
  assert not exists (select 1 from public.ai_engage_days where user_id = learner), 'days erased';
  assert not exists (select 1 from public.ai_engage_league_members where user_id = learner), 'league rows erased';
  assert not exists (select 1 from public.ai_engage_passports where user_id = learner), 'Passport erased';
  assert not exists (select 1 from public.ai_engage_samples where user_id = learner), 'samples erased';
  assert not exists (select 1 from public.ai_engage_profiles where user_id = learner), 'profile erased';
end $$;
drop table engage_erasure_probe;


-- Closing an account through the closure transaction (auth.users, the fixture's stand-in):
-- the registry erases the engage rows, then ai_engage_erase_account hands the squad over and
-- clears the person from the talent audit.
insert into public.users (id) values ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2') on conflict do nothing;
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2') on conflict do nothing;
do $$
declare
  leaver constant uuid := '00000000-0000-4000-8000-0000000000c1';
  friend constant uuid := '00000000-0000-4000-8000-0000000000c2';
  squad uuid;
begin
  assert 'ai_engage_erase_account' = any(public.account_erasure_service_hooks()), 'engage registered its hook';
  insert into public.ai_learning_events (user_id, area, kind, verified, feature, verified_minutes) values (leaver, 'coach', 'turn_scored', true, 'B1', 5);
  perform public.ai_engage_ingest(leaver, now());
  perform public.ai_engage_award_bonus(leaver, 'quest', 'x:closure', 10, current_date, current_date);
  squad := public.ai_engage_squad_create('Leavers', leaver, 'CLSQUADA', 100, null);
  perform public.ai_engage_squad_join(squad, friend, 5, null);
  insert into public.ai_engage_passports (user_id, display_name) values (leaver, 'Leaver');
  insert into public.ai_engage_talent (user_id, candidate_key, consent_version, consented_at) values (leaver, 'cccccccccccccccccccccccc', 'talent-2026-10', now());
  insert into public.ai_engage_talent_audit (employer_id, action, target_user_id) values (friend, 'view', leaver), (leaver, 'search', null);
  -- Audio: an engage recording, a sitting's recording, and a clip another area stored (never engage's to delete).
  insert into public.ai_engage_samples (user_id, kind, source, storage) values
    (leaver, 'voice', 'engage', '{"provider":"s3","bucket":"media","path":"schood-ai/engage/samples/c1/a.webm"}'),
    (leaver, 'voice', 'coach', '{"provider":"s3","bucket":"media","path":"schood-ai/coach/clip.webm"}');
  insert into public.ai_engage_sittings (user_id, exam_key, entitlement_ref, deadline_at, responses) values
    (leaver, 'speaking_b1', 'beta:closure', now() + interval '1 hour', '{"t1":{"storage":{"provider":"s3","bucket":"media","path":"schood-ai/engage/certificates/x/t1.webm"},"duration_ms":30000}}');
end $$;
update auth.users set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000c1';
do $$
declare
  leaver constant uuid := '00000000-0000-4000-8000-0000000000c1';
  friend constant uuid := '00000000-0000-4000-8000-0000000000c2';
begin
  assert not exists (select 1 from public.ai_engage_xp where user_id = leaver), 'XP erased (bonus rows too)';
  assert not exists (select 1 from public.ai_engage_days where user_id = leaver), 'days erased';
  assert not exists (select 1 from public.ai_engage_passports where user_id = leaver), 'Passport erased';
  assert not exists (select 1 from public.ai_engage_talent where user_id = leaver), 'talent profile erased';
  assert (select owner_id from public.ai_engage_squads where invite_code = 'CLSQUADA') = friend, 'the squad passed to the friend';
  assert (select role from public.ai_engage_squad_members m join public.ai_engage_squads s on s.id = m.squad_id where s.invite_code = 'CLSQUADA' and m.user_id = friend) = 'owner', 'with the owner role';
  assert not exists (select 1 from public.ai_engage_talent_audit where target_user_id = leaver or employer_id = leaver), 'cleared from the audit';
  assert (select count(*) from public.ai_engage_talent_audit where action = 'view' and employer_id = friend) >= 1, 'the act stays';
  assert not exists (select 1 from public.ai_engage_samples where user_id = leaver), 'samples erased';
  assert (select array_agg(storage->>'path' order by storage->>'path') from public.ai_engage_media_trash) =
    array['schood-ai/engage/certificates/x/t1.webm', 'schood-ai/engage/samples/c1/a.webm'], 'engage audio queued for deletion, another area''s clip left alone';
  assert (select count(*) from public.ai_engage_media_trash_claim(now(), 10)) = 2, 'the sweep claims them';
  assert (select count(*) from public.ai_engage_media_trash_claim(now(), 10)) = 0, 'once, until the retry time';
end $$;

-- Browsers get nothing; the function's role cannot write XP directly.
set role authenticated;
do $$ begin
  begin perform 1 from public.ai_engage_xp; raise exception 'authenticated read XP'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.ai_engage_passport_links; raise exception 'authenticated read links'; exception when insufficient_privilege then null; end;
  begin perform public.ai_engage_ingest('00000000-0000-4000-8000-0000000000a2', now()); raise exception 'authenticated ingested'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from public.ai_engage_talent; raise exception 'anon read the talent pool'; exception when insufficient_privilege then null; end;
  begin perform public.ai_engage_board('national', null, current_date, 10); raise exception 'anon read a board'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
do $$ begin
  begin insert into public.ai_engage_xp (user_id, source, source_key, xp, day, week_start) values ('00000000-0000-4000-8000-0000000000a2', 'quest', 'x:forged', 100, current_date, current_date); raise exception 'service role wrote XP'; exception when insufficient_privilege then null; end;
  begin update public.ai_engage_days set xp = 99999; raise exception 'service role rewrote a day'; exception when insufficient_privilege then null; end;
  -- What the function is meant to do still works.
  perform public.ai_engage_ingest('00000000-0000-4000-8000-0000000000a2', now());
  perform public.ai_engage_board('national', null, current_date, 10);
  insert into public.ai_engage_passports (user_id, display_name) values ('00000000-0000-4000-8000-0000000000a2', 'Dilnoza') on conflict (user_id) do update set display_name = excluded.display_name;
end $$;
reset role;
select 'schood ai engage: ok';
