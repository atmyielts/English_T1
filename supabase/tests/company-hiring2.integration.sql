-- Company English hiring, second layer: candidates, personal links, notes, share links, the
-- backfill of older attempts, anonymising one person, nightly retention and the rate limit.
\set ON_ERROR_STOP 1
insert into public.users(id) values ('00000000-0000-4000-8000-0000000000c1');
\i /work/migration.sql

do $$
declare
  hr constant uuid := '00000000-0000-4000-8000-0000000000c1';
  org uuid;
  other_org uuid;
  test uuid;
  candidate uuid;
  second_candidate uuid;
  attempt uuid;
  old_attempt uuid;
  old_candidate uuid;
  fresh_attempt uuid;
  failed boolean;
  moved integer;
begin
  insert into public.company_orgs(name, status, tests_limit) values ('Silk Road Hotels', 'active', 50) returning id into org;
  insert into public.company_orgs(name, status, tests_limit) values ('Other Company', 'active', 50) returning id into other_org;
  insert into public.company_assessments(org_id, kind, title, job_role, skills, min_level, link_token_hash, settings, created_by)
  values (org, 'hiring', 'Front desk', 'hospitality', array['grammar','speaking'], 'b1', repeat('a', 64), '{"skill_minimums":{"speaking":"b1"}}', hr)
  returning id into test;

  -- An invited candidate: the personal link is stored as a hash and is unique.
  insert into public.company_candidates(org_id, assessment_id, name, email, phone, source, invite_token_hash, invited_at, created_by)
  values (org, test, 'Aziza Rakhimova', 'aziza@mail.uz', '+998 90 123 45 67', 'invite', repeat('b', 64), now(), hr)
  returning id into candidate;
  failed := false;
  begin
    insert into public.company_candidates(org_id, assessment_id, name, invite_token_hash) values (org, test, 'Another Person', repeat('b', 64));
  exception when unique_violation then failed := true; end;
  assert failed, 'a personal link is unique';

  -- The same email cannot be on the same test twice.
  failed := false;
  begin
    insert into public.company_candidates(org_id, assessment_id, name, email) values (org, test, 'Aziza Again', 'aziza@mail.uz');
  exception when unique_violation then failed := true; end;
  assert failed, 'one row per email per test';
  insert into public.company_candidates(org_id, assessment_id, name, phone) values (org, test, 'Phone Only', '+998 91 000 00 00') returning id into second_candidate;

  -- Stages are limited to the pipeline's.
  failed := false;
  begin
    update public.company_candidates set stage = 'maybe' where id = candidate;
  exception when check_violation then failed := true; end;
  assert failed, 'unknown stage refused';
  update public.company_candidates set stage = 'interview', furthest_stage = 'interview' where id = candidate;

  -- A candidate's attempt, notes and a feedback link.
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, candidate_phone, access_token_hash, deadline_at, status, submitted_at, overall_level, overall_score, skill_results, answers, ai_feedback, integrity, notes, certificate_code)
  values (org, test, 'Aziza Rakhimova', 'aziza@mail.uz', '+998 90 123 45 67', repeat('c', 64), now() + interval '1 hour', 'graded', now(), 'b1', 55,
    '{"grammar":{"score":60,"level":"b1","source":"auto"},"speaking":{"score":50,"level":"b1","source":"ai"}}', '{"w-1":"I am Aziza from Tashkent"}', '{"speaking":{"summary":"Clear"}}', '{"ip_hash":"abc","user_agent":"x","tab_hidden":2}', 'Strong', 'ABCDEFGHJK')
  returning id into attempt;
  update public.company_candidates set attempt_id = attempt where id = candidate;
  failed := false;
  begin
    update public.company_candidates set attempt_id = attempt where id = second_candidate;
  exception when unique_violation then failed := true; end;
  assert failed, 'an attempt belongs to one candidate';
  insert into public.company_candidate_notes(org_id, candidate_id, author, kind, body) values (org, candidate, hr, 'note', 'Great on the phone');
  insert into public.company_share_links(org_id, assessment_id, candidate_id, kind, key_hash, expires_at, created_by) values (org, test, candidate, 'feedback', repeat('d', 64), now() + interval '30 days', hr);
  failed := false;
  begin
    insert into public.company_share_links(org_id, assessment_id, kind, key_hash, expires_at) values (org, test, 'feedback', repeat('e', 64), now() + interval '1 day');
  exception when check_violation then failed := true; end;
  assert failed, 'a feedback link names its candidate';
  insert into public.company_share_links(org_id, assessment_id, kind, key_hash, expires_at, include_contacts) values (org, test, 'report', repeat('f', 64), now() + interval '14 days', false);

  -- Anonymising removes the person and keeps the scores. Repeating it does nothing.
  assert public.company_hiring_anonymise_candidate(candidate), 'anonymised';
  assert not public.company_hiring_anonymise_candidate(candidate), 'second anonymise is a no-op';
  assert (select name is null and email is null and phone is null and invite_token_hash is null and interview_kit is null and anonymised_at is not null and stage = 'interview' from public.company_candidates where id = candidate), 'candidate has no personal data';
  assert (select candidate_name is null and candidate_email is null and candidate_phone is null and access_token_hash is null and notes is null and answers = '{}'::jsonb and ai_feedback = '{}'::jsonb and certificate_code is null from public.company_attempts where id = attempt), 'attempt has no personal data';
  assert (select overall_score = 55 and overall_level = 'b1' and skill_results -> 'speaking' ->> 'level' = 'b1' from public.company_attempts where id = attempt), 'scores stay';
  assert (select not (integrity ? 'ip_hash') and not (integrity ? 'user_agent') and (integrity ->> 'tab_hidden') = '2' and (integrity ->> 'anonymised') = 'true' from public.company_attempts where id = attempt), 'network data removed, signals kept';
  assert not exists (select 1 from public.company_candidate_notes where candidate_id = candidate), 'notes gone';
  assert not exists (select 1 from public.company_share_links where candidate_id = candidate), 'feedback links gone';
  assert exists (select 1 from public.company_share_links where key_hash = repeat('f', 64)), 'the manager report link stays';

  -- Retention: nothing happens until a workspace asks.
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, deadline_at, started_at, submitted_at, status, overall_level, overall_score)
  values (org, test, 'Old Candidate', 'old@mail.uz', now() - interval '20 months', now() - interval '20 months', now() - interval '20 months', 'graded', 'a2', 40) returning id into old_attempt;
  insert into public.company_candidates(org_id, assessment_id, attempt_id, name, email, created_at, stage_at) values (org, test, old_attempt, 'Old Candidate', 'old@mail.uz', now() - interval '20 months', now() - interval '20 months') returning id into old_candidate;
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, deadline_at, started_at, submitted_at, status) values (org, test, 'Recent One', 'recent@mail.uz', now(), now() - interval '2 days', now() - interval '2 days', 'submitted') returning id into fresh_attempt;
  -- An earlier try by a person with a newer one: no candidate row points to it.
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, deadline_at, started_at, submitted_at, status) values (org, test, 'Old Try', 'try@mail.uz', now() - interval '20 months', now() - interval '20 months', now() - interval '20 months', 'expired');
  -- Someone mid-test, even with an old invitation, is left alone.
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, deadline_at, started_at, status) values (org, test, 'Running Now', 'running@mail.uz', now() + interval '1 hour', now() - interval '20 months', 'started');
  insert into public.company_candidates(org_id, assessment_id, attempt_id, name, email, created_at, stage_at) select org, test, id, 'Running Now', 'running@mail.uz', now() - interval '20 months', now() - interval '20 months' from public.company_attempts where candidate_email = 'running@mail.uz';
  moved := public.company_hiring_apply_retention();
  assert moved = 0, 'no setting, no deletion';
  assert (select name = 'Old Candidate' from public.company_candidates where id = old_candidate), 'kept without a setting';

  insert into public.company_hiring_settings(org_id, retention_months, updated_by) values (org, 12, hr);
  failed := false;
  begin
    update public.company_hiring_settings set retention_months = 0 where org_id = org;
  exception when check_violation then failed := true; end;
  assert failed, 'retention period has a floor';
  moved := public.company_hiring_apply_retention();
  assert moved = 1, format('one candidate past the period, got %s', moved);
  assert (select name is null and anonymised_at is not null from public.company_candidates where id = old_candidate), 'old candidate anonymised';
  assert (select candidate_name is null and overall_score = 40 from public.company_attempts where id = old_attempt), 'old attempt scrubbed, score kept';
  assert (select candidate_name = 'Recent One' from public.company_attempts where id = fresh_attempt), 'recent attempt kept';
  assert (select candidate_name is null from public.company_attempts where candidate_email is null and status = 'expired'), 'an old try with no candidate row is scrubbed';
  assert exists (select 1 from public.company_attempts where candidate_email = 'running@mail.uz' and candidate_name = 'Running Now'), 'a running test is left alone';
  assert exists (select 1 from public.company_candidates where email = 'running@mail.uz' and anonymised_at is null), 'a running candidate is left alone';

  -- Rate limit: counts per bucket within a window.
  assert public.company_hiring_hit('share:abc', 2, 3600), 'first hit';
  assert public.company_hiring_hit('share:abc', 2, 3600), 'second hit';
  assert not public.company_hiring_hit('share:abc', 2, 3600), 'third hit is over the limit';
  assert public.company_hiring_hit('share:def', 2, 3600), 'another address has its own count';

  -- Account closure erases that address from candidate rows too.
  insert into auth.users(id, email, email_confirmed_at) values (hr, 'phone-person@mail.uz', now());
  update public.company_candidates set email = 'phone-person@mail.uz' where id = second_candidate;
  perform public.company_hiring_erase_account(hr);
  assert (select name is null and anonymised_at is not null from public.company_candidates where id = second_candidate), 'erasure anonymises the candidate';
  assert 'company_hiring_erase_account' = any(public.account_erasure_service_hooks()), 'erasure hook registered';

  -- Deleting a workspace takes everything with it.
  delete from public.company_orgs where id = org;
  assert not exists (select 1 from public.company_candidates where org_id = org), 'candidates gone with the workspace';
  assert not exists (select 1 from public.company_hiring_settings where org_id = org), 'settings gone with the workspace';
  assert not exists (select 1 from public.company_share_links where org_id = org), 'links gone with the workspace';
  assert exists (select 1 from public.company_orgs where id = other_org), 'other workspaces untouched';
end
$$;

-- A brand-new table is locked to the function.
do $$
declare t text;
begin
  foreach t in array array['company_candidates','company_candidate_notes','company_share_links','company_hiring_settings','company_hiring_hits'] loop
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), t || ' has RLS';
    assert not has_table_privilege('anon', format('public.%I', t), 'select'), t || ' closed to anon';
    assert not has_table_privilege('authenticated', format('public.%I', t), 'select'), t || ' closed to authenticated';
    assert has_table_privilege('service_role', format('public.%I', t), 'select'), t || ' open to the function';
  end loop;
  assert not has_function_privilege('anon', 'public.company_hiring_hit(text, integer, integer)', 'execute'), 'rate limit closed to anon';
  assert not has_function_privilege('anon', 'public.company_hiring_anonymise_candidate(uuid)', 'execute'), 'anonymise closed to anon';
  assert has_function_privilege('service_role', 'public.company_hiring_anonymise_candidate(uuid)', 'execute'), 'anonymise open to the function';
end
$$;

-- Attempts from before this layer become candidates when the migration runs again.
do $$
declare
  org uuid;
  test uuid;
begin
  insert into public.company_orgs(name, status, tests_limit) values ('Backfill Co', 'active', 50) returning id into org;
  insert into public.company_assessments(org_id, kind, title, skills, link_token_hash) values (org, 'hiring', 'Older test', array['grammar'], repeat('9', 64)) returning id into test;
  insert into public.company_attempts(org_id, assessment_id, candidate_name, candidate_email, deadline_at, started_at, status, decision) values
    (org, test, 'Two Tries', 'two@mail.uz', now(), now() - interval '2 days', 'expired', null),
    (org, test, 'Two Tries', 'two@mail.uz', now(), now() - interval '1 day', 'graded', 'shortlist'),
    (org, test, 'Rejected One', 'no@mail.uz', now(), now() - interval '1 day', 'graded', 'reject');
end
$$;
\i /work/migration.sql
do $$
begin
  assert (select count(*) from public.company_candidates c join public.company_assessments a on a.id = c.assessment_id where a.title = 'Older test') = 2, 'one candidate per person';
  assert (select stage = 'reviewing' and furthest_stage = 'reviewing' from public.company_candidates where email = 'two@mail.uz'), 'shortlisted counts as reviewing';
  assert (select a.status = 'graded' from public.company_candidates c join public.company_attempts a on a.id = c.attempt_id where c.email = 'two@mail.uz'), 'attached to the try that counted';
  assert (select stage = 'rejected' from public.company_candidates where email = 'no@mail.uz'), 'rejected stays rejected';
end
$$;

select 'company hiring2: ok';
