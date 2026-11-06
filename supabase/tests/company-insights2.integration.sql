-- Company English analytics: requirements, snapshots (numbers checked against what the app computes),
-- the frozen-row guard, risk action locks, spend, saved views, challenge and session depth, lockdown.
\set ON_ERROR_STOP 1
insert into public.users(id) values
  ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2'), ('00000000-0000-4000-8000-0000000000c3'), ('00000000-0000-4000-8000-0000000000c4');
\i /work/migration.sql

do $$
declare
  org uuid;
  other uuid;
  sales uuid;
  front uuid;
  anna uuid;
  boris uuid;
  chen uuid;
  owner_member uuid;
  test uuid;
  snapshot jsonb;
  dept jsonb;
  snap uuid;
  failed boolean;
  added integer;
begin
  insert into public.company_orgs(name, status, created_at) values ('Acme', 'active', '2026-01-01 00:00+05') returning id into org;
  insert into public.company_orgs(name, status, created_at) values ('Paused', 'suspended', '2026-01-01 00:00+05') returning id into other;
  insert into public.company_departments(org_id, name) values (org, 'Sales') returning id into sales;
  insert into public.company_departments(org_id, name) values (org, 'Front') returning id into front;
  insert into public.company_members(org_id, user_id, role, status, consent_at) values (org, '00000000-0000-4000-8000-0000000000c4', 'owner', 'active', '2026-01-02 00:00+05') returning id into owner_member;
  insert into public.company_members(org_id, user_id, role, status, department_id, job_role, consent_at, level, level_score)
    values (org, '00000000-0000-4000-8000-0000000000c1', 'employee', 'active', sales, 'sales', '2026-01-02 00:00+05', 'b1', 55) returning id into anna;
  insert into public.company_members(org_id, user_id, role, status, department_id, job_role, level, level_score, level_at)
    values (org, '00000000-0000-4000-8000-0000000000c2', 'employee', 'active', sales, 'sales', 'a2', 40, '2026-09-10 00:00+05') returning id into boris;
  insert into public.company_members(org_id, user_id, role, status, department_id, job_role, consent_at)
    values (org, '00000000-0000-4000-8000-0000000000c3', 'employee', 'active', front, 'hospitality', '2026-01-02 00:00+05') returning id into chen;

  -- Requirements: one per scope, the whole company counts as a scope too, and a level must be a level.
  insert into public.company_level_requirements(org_id, job_role, level, skills, due_date) values (org, 'sales', 'b1', '{"speaking": "b1"}', '2026-09-15');
  insert into public.company_level_requirements(org_id, level) values (org, 'a2');
  failed := false;
  begin
    insert into public.company_level_requirements(org_id, job_role, level) values (org, 'sales', 'b2');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'one requirement per job role';
  failed := false;
  begin
    insert into public.company_level_requirements(org_id, level) values (org, 'b2');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'one requirement for the whole company';
  insert into public.company_level_requirements(org_id, job_role, department_id, level) values (org, 'sales', sales, 'a1');
  delete from public.company_level_requirements where org_id = org and department_id = sales;
  failed := false;
  begin
    insert into public.company_level_requirements(org_id, level) values (other, 'z9');
  exception when check_violation then failed := true;
  end;
  assert failed, 'unknown level refused';

  insert into public.company_assessments(org_id, kind, title) values (org, 'progress', 'Progress test') returning id into test;
  -- Anna: A2 in August, B1 in September (moved up). Her speaking is B1 at the last test.
  insert into public.company_attempts(org_id, assessment_id, member_id, status, deadline_at, graded_at, overall_level, overall_score, skill_results) values
    (org, test, anna, 'graded', now(), '2026-08-05 10:00+05', 'a2', 40, '{"speaking": {"score": 40, "level": "a2"}}'),
    (org, test, anna, 'graded', now(), '2026-09-20 10:00+05', 'b1', 55, '{"speaking": {"score": 52, "level": "b1"}}'),
  -- A retest after the month ends must not count for September.
    (org, test, anna, 'graded', now(), '2026-10-05 10:00+05', 'b2', 70, '{"speaking": {"score": 70, "level": "b2"}}');
  -- A candidate, shortlisted in September.
  insert into public.company_attempts(org_id, assessment_id, status, deadline_at, graded_at, overall_level, overall_score, decision, candidate_name)
    values (org, test, 'graded', now(), '2026-09-21 10:00+05', 'b1', 50, 'shortlist', 'Kamola');
  insert into public.company_activity(org_id, member_id, kind, minutes, points, created_at) values
    (org, anna, 'lesson', 30, 40, '2026-09-10 10:00+05'),
    (org, anna, 'lesson', 15, 20, '2026-09-30 23:30+05'),
    (org, anna, 'lesson', 99, 99, '2026-10-01 00:30+05'),
    -- Boris has not agreed to share: never counted.
    (org, boris, 'lesson', 500, 500, '2026-09-10 10:00+05');
  insert into public.company_training_spend(org_id, spent_on, amount, currency, category) values
    (org, '2026-09-01', 1000000, 'UZS', 'schood'), (org, '2026-09-30', 500000.50, 'UZS', 'trainer'), (org, '2026-10-01', 7, 'UZS', 'other'), (org, '2026-09-15', 100, 'USD', 'other');

  snapshot := public.company_snapshot_data(org, '2026-09', '2026-10-02');
  assert snapshot -> 'period' ->> 'to' = '2026-09-30', 'period end: ' || (snapshot -> 'period')::text;
  assert (snapshot -> 'people' ->> 'people')::int = 4, 'people';
  assert (snapshot -> 'people' ->> 'learners')::int = 3, 'owner is not a learner';
  assert (snapshot -> 'people' ->> 'sharing')::int = 3, 'sharing';
  -- Anna has a test by then, Boris a stored level set before the month ended, Chen nothing.
  assert (snapshot -> 'people' ->> 'tested')::int = 2, 'tested: ' || (snapshot -> 'people')::text;
  assert (snapshot -> 'levels' ->> 'b1')::int = 1, 'Anna is B1 at the end of September, not B2: ' || (snapshot -> 'levels')::text;
  assert (snapshot -> 'levels' ->> 'a2')::int = 1, 'Boris';
  assert (snapshot -> 'levels' ->> 'none')::int = 1, 'Chen';
  assert (snapshot ->> 'avg_score')::numeric = 47.5, 'average of 55 and 40: ' || (snapshot ->> 'avg_score');
  -- Anna meets sales B1 with speaking B1; Boris does not (and is overdue); Chen answers to the company-wide A2 and has no level.
  assert (snapshot -> 'compliance' ->> 'with_requirement')::int = 3, 'answering: ' || (snapshot -> 'compliance')::text;
  assert (snapshot -> 'compliance' ->> 'meets')::int = 1, 'meets';
  assert (snapshot -> 'compliance' ->> 'overdue')::int = 1, 'overdue is the sales bar';
  assert (snapshot -> 'activity' ->> 'minutes')::int = 45, 'Tashkent month, sharers only: ' || (snapshot -> 'activity')::text;
  assert (snapshot -> 'activity' ->> 'lessons')::int = 2, 'lessons';
  assert (snapshot -> 'activity' ->> 'active')::int = 1, 'active';
  assert (snapshot -> 'movement' ->> 'up')::int = 1, 'moved up: ' || (snapshot -> 'movement')::text;
  assert (snapshot -> 'movement' ->> 'levels_gained')::int = 1, 'levels gained';
  assert (snapshot -> 'movement' ->> 'first')::int = 0, 'nobody first tested in September';
  assert (snapshot -> 'hiring' ->> 'graded')::int = 1, 'candidate graded';
  assert (snapshot -> 'hiring' ->> 'shortlisted')::int = 1, 'candidate shortlisted';
  assert jsonb_array_length(snapshot -> 'spend') = 2, 'two currencies';
  assert (snapshot -> 'spend' -> 1 ->> 'currency') = 'UZS', 'ordered';
  assert (snapshot -> 'spend' -> 1 ->> 'total')::numeric = 1500000.50, 'only spend inside the month: ' || (snapshot -> 'spend')::text;
  select e into dept from jsonb_array_elements(snapshot -> 'departments') e where e ->> 'name' = 'Sales';
  assert (dept ->> 'people')::int = 2 and (dept ->> 'meets')::int = 1 and (dept ->> 'moved_up')::int = 1 and (dept ->> 'minutes')::int = 45, 'sales row: ' || dept::text;
  assert jsonb_array_length(snapshot -> 'departments') = 3, 'two departments and the no-department row: ' || (snapshot -> 'departments')::text;

  -- First tested inside the month, then retested: counts as first and as moved up.
  insert into public.company_attempts(org_id, assessment_id, member_id, status, deadline_at, graded_at, overall_level, overall_score) values
    (org, test, chen, 'graded', now(), '2026-09-03 10:00+05', 'a1', 20), (org, test, chen, 'graded', now(), '2026-09-25 10:00+05', 'a2', 36);
  snapshot := public.company_snapshot_data(org, '2026-09', '2026-10-02');
  assert (snapshot -> 'movement' ->> 'first')::int = 1, 'first tested: ' || (snapshot -> 'movement')::text;
  assert (snapshot -> 'movement' ->> 'up')::int = 2, 'both moved up';
  assert (snapshot -> 'compliance' ->> 'meets')::int = 2, 'Chen reaches the company-wide A2';

  -- The nightly job: last month, once, open workspaces only, whatever day it runs.
  added := public.company_take_monthly_snapshots('2026-10-01 03:40+05');
  assert added = 1, 'one open workspace: ' || added;
  assert public.company_take_monthly_snapshots('2026-10-02 03:40+05') = 0, 'nothing new the next night';
  select id into snap from public.company_insight_snapshots where org_id = org and period = '2026-09' and kind = 'monthly';
  assert snap is not null and (select source from public.company_insight_snapshots where id = snap) = 'cron', 'saved by the job';
  assert not exists (select 1 from public.company_insight_snapshots where org_id = other), 'a paused workspace is skipped';

  -- A snapshot's numbers cannot change; its narrative can be added.
  failed := false;
  begin
    update public.company_insight_snapshots set data = '{}' where id = snap;
  exception when raise_exception then failed := true;
  end;
  assert failed, 'frozen numbers';
  update public.company_insight_snapshots set narratives = '{"en": {"headline": "ok"}}' where id = snap;
  assert (select narratives -> 'en' ->> 'headline' from public.company_insight_snapshots where id = snap) = 'ok', 'narrative added';
  -- One monthly per month; on-demand once a day.
  failed := false;
  begin
    insert into public.company_insight_snapshots(org_id, period, kind, taken_on, data) values (org, '2026-09', 'monthly', '2026-10-09', '{}');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'one monthly snapshot';
  insert into public.company_insight_snapshots(org_id, period, kind, taken_on, data) values (org, '2026-09', 'manual', '2026-10-09', '{}');
  failed := false;
  begin
    insert into public.company_insight_snapshots(org_id, period, kind, taken_on, data) values (org, '2026-09', 'manual', '2026-10-09', '{}');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'on-demand once a day';
  failed := false;
  begin
    insert into public.company_insight_snapshots(org_id, period, kind, taken_on, data) values (org, '2026-13', 'manual', '2026-10-09', '{}');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a month must be a month';

  -- Risk actions: the unique row stops a double assign. Deleting the person removes them.
  insert into public.company_risk_actions(org_id, member_id, kind, reason, day) values (org, chen, 'assign', 'one_click', '2026-10-05');
  failed := false;
  begin
    insert into public.company_risk_actions(org_id, member_id, kind, reason, day) values (org, chen, 'assign', 'one_click', '2026-10-05');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'assign once a day';

  -- Spend must be a real amount in a known currency.
  failed := false;
  begin
    insert into public.company_training_spend(org_id, spent_on, amount, currency) values (org, '2026-09-01', -1, 'UZS');
  exception when check_violation then failed := true;
  end;
  assert failed, 'no negative spend';
  failed := false;
  begin
    insert into public.company_training_spend(org_id, spent_on, amount, currency) values (org, '2026-09-01', 1, 'XXX');
  exception when check_violation then failed := true;
  end;
  assert failed, 'known currency';

  -- Saved views: names are unique per workspace whatever the case.
  insert into public.company_saved_views(org_id, name, config) values (org, 'Team', '{"rows": "department"}');
  insert into public.company_saved_views(org_id, name, config) values (other, 'Team', '{"rows": "department"}');
  failed := false;
  begin
    insert into public.company_saved_views(org_id, name, config) values (org, 'TEAM', '{"rows": "department"}');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'view names unique per workspace';
  update public.company_saved_views set name = 'Teams' where org_id = org and name = 'Team';
  assert (select updated_at >= created_at from public.company_saved_views where org_id = org), 'updated_at trigger';

  -- Challenges: the new metric and teams, and the existing rows keep working.
  insert into public.company_challenges(org_id, title, metric, starts_on, ends_on, mode, teams, template, prize)
    values (org, 'Cup', 'active_days', '2026-10-01', '2026-10-31', 'teams', '[{"id": "team-1", "name": "A", "department_ids": []}]', 'department_cup', 'Books');
  assert (select mode from public.company_challenges where title = 'Cup') = 'teams', 'team mode';
  failed := false;
  begin
    insert into public.company_challenges(org_id, title, metric, starts_on, ends_on) values (org, 'Odd', 'likes', '2026-10-01', '2026-10-02');
  exception when check_violation then failed := true;
  end;
  assert failed, 'an unknown metric is still refused';
  failed := false;
  begin
    insert into public.company_challenges(org_id, title, starts_on, ends_on, mode) values (org, 'Odd', '2026-10-01', '2026-10-02', 'chaos');
  exception when check_violation then failed := true;
  end;
  assert failed, 'unknown mode refused';

  -- Sessions: a series and trainer notes with a length limit.
  insert into public.company_sessions(org_id, title, starts_at, series_id, trainer_notes) values (org, 'Weekly', '2026-11-20 15:00+05', gen_random_uuid(), 'Notes');
  failed := false;
  begin
    insert into public.company_sessions(org_id, title, starts_at, trainer_notes) values (org, 'Long', now(), repeat('x', 4001));
  exception when check_violation then failed := true;
  end;
  assert failed, 'trainer notes limited';

  -- Removing a member takes their risk actions with them; deleting the workspace, everything.
  delete from public.company_members where id = chen;
  assert not exists (select 1 from public.company_risk_actions where member_id = chen), 'risk actions cascade';
  delete from public.company_orgs where id = org;
  assert not exists (select 1 from public.company_level_requirements where org_id = org), 'requirements cascade';
  assert not exists (select 1 from public.company_insight_snapshots where org_id = org), 'snapshots cascade';
  assert not exists (select 1 from public.company_training_spend where org_id = org), 'spend cascades';
end
$$;

-- Only the function reaches any of it.
do $$
declare
  t text;
begin
  foreach t in array array['company_level_requirements','company_risk_actions','company_training_spend','company_saved_views','company_insight_snapshots'] loop
    assert (select relrowsecurity from pg_class where relname = t and relkind = 'r'), 'rls on ' || t;
    assert not has_table_privilege('anon', 'public.' || t, 'select'), 'anon cannot read ' || t;
    assert not has_table_privilege('authenticated', 'public.' || t, 'select'), 'authenticated cannot read ' || t;
    assert has_table_privilege('service_role', 'public.' || t, 'select'), 'service role reads ' || t;
  end loop;
  assert not has_function_privilege('authenticated', 'public.company_snapshot_data(uuid, text, date)', 'execute'), 'signed-in users cannot read snapshots';
  assert not has_function_privilege('anon', 'public.company_take_monthly_snapshots(timestamptz)', 'execute'), 'the public cannot take snapshots';
  assert has_function_privilege('service_role', 'public.company_snapshot_data(uuid, text, date)', 'execute'), 'service role reads snapshots';
end
$$;
select 'company insights2: ok';
