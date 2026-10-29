-- Company English training: role-play sessions, writing checks with 90-day
-- purge, glossary uniqueness, lockdown and progress upserts.
\set ON_ERROR_STOP 1
insert into public.users(id) values ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2');
\i /work/migration.sql

do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000b1';
  org uuid;
  dept uuid;
  member uuid;
  session uuid;
  purged integer;
begin
  insert into public.company_orgs(name, status, seats_limit) values ('Silk Road Hotels', 'active', 5) returning id into org;
  insert into public.company_departments(org_id, name) values (org, 'Front office') returning id into dept;
  insert into public.company_members(org_id, user_id, role, status, department_id, job_role) values (org, learner, 'employee', 'active', dept, 'hospitality') returning id into member;

  -- Role-play: at most 12 learner turns, feedback stored with a score.
  insert into public.company_roleplay_sessions(org_id, member_id, user_id, scenario_code, track_code, turns)
    values (org, member, learner, 'hospitality-rp-room-not-ready', 'hospitality', '[{"role":"ai","text":"Good morning."}]') returning id into session;
  update public.company_roleplay_sessions set learner_turns = 12, status = 'ended', score = 74, feedback = '{"score":74}' where id = session;
  begin
    update public.company_roleplay_sessions set learner_turns = 13 where id = session;
    raise exception 'thirteen turns accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.company_roleplay_sessions(org_id, member_id, scenario_code, track_code, turns) values (org, member, 'x', 'hospitality', '{}');
    raise exception 'object turns accepted';
  exception when check_violation then null;
  end;
  assert (select updated_at >= created_at from public.company_roleplay_sessions where id = session), 'updated_at trigger';

  -- Writing checks older than 90 days are purged; newer ones stay.
  insert into public.company_writing_checks(org_id, member_id, user_id, draft, result, score, created_at) values
    (org, member, learner, 'Dear Mr Hoffmann, sorry for wait.', '{"corrected":"Dear Mr Hoffmann, sorry for the wait."}', 70, now() - interval '91 days'),
    (org, member, learner, 'Dear Ms Tanaka, thank you for booking.', '{"corrected":"Dear Ms Tanaka, thank you for your booking."}', 85, now() - interval '10 days');
  begin
    insert into public.company_writing_checks(org_id, member_id, draft) values (org, member, repeat('a', 5001));
    raise exception 'long draft accepted';
  exception when check_violation then null;
  end;
  -- An unfinished role-play from yesterday is closed by the same job.
  insert into public.company_roleplay_sessions(org_id, member_id, scenario_code, track_code, created_at) values (org, member, 'hospitality-rp-phone-booking', 'hospitality', now() - interval '2 days');
  purged := public.company_purge_training_drafts();
  assert purged = 1, 'purged ' || purged;
  assert (select count(*) from public.company_writing_checks where org_id = org) = 1, 'recent draft kept';
  assert (select count(*) from public.company_roleplay_sessions where status = 'active') = 0, 'stale role-play closed';

  -- Glossary terms are unique per workspace regardless of case and spaces.
  insert into public.company_glossary_terms(org_id, term, meaning, ru, uz, department_id) values (org, 'Late check-out', 'Leaving the room after 12:00 for a fee', 'Поздний выезд', 'Kech chiqish', dept);
  begin
    insert into public.company_glossary_terms(org_id, term, meaning) values (org, '  late CHECK-OUT ', 'Duplicate');
    raise exception 'duplicate term accepted';
  exception when unique_violation then null;
  end;
  -- Deleting the department keeps the term for everyone.
  delete from public.company_departments where id = dept;
  assert (select department_id is null from public.company_glossary_terms where org_id = org), 'term kept without department';

  -- Lesson progress: one row per member and lesson (the function updates it in place).
  insert into public.company_lesson_progress(org_id, member_id, user_id, track_code, lesson_code, status, score, minutes, attempts)
    values (org, member, learner, 'hospitality', 'hospitality-f1', 'started', 40, 8, 1);
  begin
    insert into public.company_lesson_progress(org_id, member_id, track_code, lesson_code) values (org, member, 'hospitality', 'hospitality-f1');
    raise exception 'duplicate progress accepted';
  exception when unique_violation then null;
  end;
  insert into public.company_assignments(org_id, track_code, target_level, due_date, member_id) values (org, 'hospitality', 'b1', current_date + 30, member);

  -- Removing the member removes their practice records.
  delete from public.company_members where id = member;
  assert (select count(*) from public.company_roleplay_sessions where org_id = org) = 0, 'sessions cascade';
  assert (select count(*) from public.company_writing_checks where org_id = org) = 0, 'checks cascade';
end
$$;

do $$
begin
  assert not has_table_privilege('authenticated', 'public.company_roleplay_sessions', 'select'), 'authenticated roleplay';
  assert not has_table_privilege('anon', 'public.company_writing_checks', 'select'), 'anon writing';
  assert not has_table_privilege('authenticated', 'public.company_glossary_terms', 'insert'), 'authenticated glossary';
  assert has_table_privilege('service_role', 'public.company_glossary_terms', 'insert'), 'service role glossary';
  assert not has_function_privilege('authenticated', 'public.company_purge_training_drafts()', 'execute'), 'purge execute';
  assert (select bool_and(relrowsecurity) from pg_class where relname in ('company_roleplay_sessions','company_writing_checks','company_glossary_terms') and relkind = 'r'), 'rls on';
end
$$;
select 'company training: ok';
