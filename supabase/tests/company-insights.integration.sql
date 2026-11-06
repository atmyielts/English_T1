-- Company English insights: challenges, sessions, attendance, the activity summary, lockdown.
\set ON_ERROR_STOP 1
insert into public.users(id) values
  ('00000000-0000-4000-8000-0000000000b1'), ('00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000b3');
\i /work/migration.sql

do $$
declare
  org uuid;
  other uuid;
  dept uuid;
  sharing uuid;
  private uuid;
  stranger uuid;
  session uuid;
  summary jsonb;
  failed boolean;
begin
  insert into public.company_orgs(name, status) values ('Acme', 'active') returning id into org;
  insert into public.company_orgs(name, status) values ('Other', 'active') returning id into other;
  insert into public.company_departments(org_id, name) values (org, 'Sales') returning id into dept;
  insert into public.company_members(org_id, user_id, role, status, department_id, consent_at)
    values (org, '00000000-0000-4000-8000-0000000000b1', 'employee', 'active', dept, now()) returning id into sharing;
  insert into public.company_members(org_id, user_id, role, status, department_id)
    values (org, '00000000-0000-4000-8000-0000000000b2', 'employee', 'active', dept) returning id into private;
  insert into public.company_members(org_id, user_id, role, status, consent_at)
    values (other, '00000000-0000-4000-8000-0000000000b3', 'employee', 'active', now()) returning id into stranger;

  -- Two days of activity for the sharing member (Tashkent dates), one for the private one, one in another workspace.
  insert into public.company_activity(org_id, member_id, user_id, kind, minutes, points, created_at) values
    (org, sharing, '00000000-0000-4000-8000-0000000000b1', 'lesson', 15, 20, '2026-10-05 08:00+05'),
    (org, sharing, '00000000-0000-4000-8000-0000000000b1', 'roleplay', 10, 15, '2026-10-05 09:00+05'),
    (org, sharing, '00000000-0000-4000-8000-0000000000b1', 'lesson', 20, 25, '2026-10-12 23:30+05'),
    (org, private, '00000000-0000-4000-8000-0000000000b2', 'lesson', 30, 40, '2026-10-06 10:00+05'),
    (other, stranger, '00000000-0000-4000-8000-0000000000b3', 'lesson', 50, 60, '2026-10-06 10:00+05'),
    (org, sharing, '00000000-0000-4000-8000-0000000000b1', 'lesson', 99, 99, '2026-11-02 10:00+05');

  summary := public.company_activity_summary(org, '2026-10-01 00:00+05', '2026-11-01 00:00+05', array[sharing, private, stranger]);
  -- Only the sharing member counts: the private one has no consent, the stranger is in another workspace.
  assert jsonb_array_length(summary -> 'members') = 1, 'one member: ' || summary::text;
  assert (summary -> 'members' -> 0 ->> 'member_id')::uuid = sharing, 'sharing member';
  assert (summary -> 'members' -> 0 ->> 'minutes')::int = 45, 'minutes in range';
  assert (summary -> 'members' -> 0 ->> 'points')::int = 60, 'points';
  assert (summary -> 'members' -> 0 ->> 'lessons')::int = 2, 'lessons';
  assert (summary -> 'members' -> 0 ->> 'events')::int = 3, 'events';
  assert (summary -> 'members' -> 0 ->> 'days')::int = 2, 'active days';
  -- Weeks start on Monday in Tashkent: 5 Oct 2026 is a Monday, 12 Oct 23:30 is still that Monday's week of the 12th.
  assert jsonb_array_length(summary -> 'weeks') = 2, 'two weeks: ' || (summary -> 'weeks')::text;
  assert summary -> 'weeks' -> 0 ->> 'week' = '2026-10-05', 'first week';
  assert summary -> 'weeks' -> 1 ->> 'week' = '2026-10-12', 'second week';
  assert (summary -> 'weeks' -> 0 ->> 'learners')::int = 1, 'learners per week';
  assert (summary -> 'kinds' -> 'lesson' ->> 'events')::int = 2, 'lesson events';
  assert (summary -> 'kinds' -> 'roleplay' ->> 'minutes')::int = 10, 'roleplay minutes';

  -- Members outside the list are not counted; an empty list gives an empty summary.
  summary := public.company_activity_summary(org, '2026-10-01 00:00+05', '2026-11-01 00:00+05', array[private]);
  assert jsonb_array_length(summary -> 'members') = 0, 'no consent, nothing counted';
  summary := public.company_activity_summary(org, '2026-10-01 00:00+05', '2026-11-01 00:00+05', '{}'::uuid[]);
  assert summary = '{"members": [], "weeks": [], "kinds": {}}'::jsonb, 'empty: ' || summary::text;

  -- Challenges: dates and metric are checked.
  insert into public.company_challenges(org_id, title, metric, starts_on, ends_on, department_ids)
    values (org, 'October sprint', 'minutes', '2026-10-01', '2026-10-31', array[dept]);
  failed := false;
  begin
    insert into public.company_challenges(org_id, title, starts_on, ends_on) values (org, 'Backwards', '2026-10-10', '2026-10-01');
  exception when check_violation then failed := true;
  end;
  assert failed, 'end before start refused';
  failed := false;
  begin
    insert into public.company_challenges(org_id, title, starts_on, ends_on) values (org, 'Too long', '2026-01-01', '2026-06-01');
  exception when check_violation then failed := true;
  end;
  assert failed, 'over 92 days refused';
  failed := false;
  begin
    insert into public.company_challenges(org_id, title, metric, starts_on, ends_on) values (org, 'Odd', 'likes', '2026-10-01', '2026-10-02');
  exception when check_violation then failed := true;
  end;
  assert failed, 'unknown metric refused';

  -- Sessions: https links only, and attendance once per person.
  insert into public.company_sessions(org_id, title, starts_at, duration_minutes, link, department_ids)
    values (org, 'Phone English', '2026-10-20 15:00+05', 90, 'https://meet.example/abc', array[dept]) returning id into session;
  failed := false;
  begin
    insert into public.company_sessions(org_id, title, starts_at, link) values (org, 'Bad link', now(), 'javascript:alert(1)');
  exception when check_violation then failed := true;
  end;
  assert failed, 'non-https link refused';
  insert into public.company_session_attendance(session_id, org_id, member_id, user_id) values (session, org, sharing, '00000000-0000-4000-8000-0000000000b1');
  failed := false;
  begin
    insert into public.company_session_attendance(session_id, org_id, member_id) values (session, org, sharing);
  exception when unique_violation then failed := true;
  end;
  assert failed, 'attendance is unique per person';
  update public.company_sessions set title = 'Phone English (B1)' where id = session;
  assert (select updated_at >= created_at from public.company_sessions where id = session), 'updated_at trigger';

  -- Deleting a session takes its attendance with it.
  delete from public.company_sessions where id = session;
  assert not exists (select 1 from public.company_session_attendance where session_id = session), 'attendance cascades';
end
$$;

-- Signed-in users and the public cannot reach the new tables or the summary directly.
do $$
begin
  assert not has_table_privilege('authenticated', 'public.company_challenges', 'select'), 'authenticated challenges';
  assert not has_table_privilege('anon', 'public.company_sessions', 'select'), 'anon sessions';
  assert not has_table_privilege('authenticated', 'public.company_session_attendance', 'insert'), 'authenticated attendance';
  assert has_table_privilege('service_role', 'public.company_session_attendance', 'insert'), 'service role attendance';
  assert not has_function_privilege('authenticated', 'public.company_activity_summary(uuid, timestamptz, timestamptz, uuid[])', 'execute'), 'summary execute';
  assert has_function_privilege('service_role', 'public.company_activity_summary(uuid, timestamptz, timestamptz, uuid[])', 'execute'), 'service role summary';
  assert (select bool_and(relrowsecurity) from pg_class where relname in ('company_challenges', 'company_sessions', 'company_session_attendance') and relkind = 'r'), 'rls on';
end
$$;
select 'company insights: ok';
