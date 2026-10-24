-- D4: consented homework mistakes feed the learner's Schood English loop
-- (20261025210000_academy_homework_mistake_feed.sql). Runs inside one
-- transaction and rolls back.
begin;
do $fixture$
declare
  owner_user uuid := gen_random_uuid(); student uuid := gen_random_uuid(); parent_user uuid := gen_random_uuid(); other_user uuid := gen_random_uuid();
  academy uuid := gen_random_uuid(); branch uuid := gen_random_uuid(); classroom uuid := gen_random_uuid(); child uuid := gen_random_uuid();
  assignment uuid := gen_random_uuid();
  academy_b uuid := gen_random_uuid(); branch_b uuid := gen_random_uuid(); classroom_b uuid := gen_random_uuid(); child_b uuid := gen_random_uuid();
  assignment_b uuid := gen_random_uuid();
  guardian uuid := gen_random_uuid(); relationship uuid := gen_random_uuid();
  lang uuid; sub_id uuid; sub_b uuid; m_articles uuid; m_articles2 uuid; m_math uuid; m_cyrillic uuid; m_vocab uuid; m_b uuid; m_late uuid;
  own_error uuid; result jsonb; n integer; e public.learner_language_errors;
begin
  insert into public.languages(code, name) values ('en', 'English') on conflict (code) do nothing;
  select id into lang from public.languages where code = 'en';

  insert into auth.users(id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  select id, id || '@example.invalid', 'authenticated', 'authenticated', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Feed fixture"}'
  from unnest(array[owner_user, student, parent_user, other_user]) id;
  insert into public.tenants(id, name, slug, type, created_by) values
    (academy, 'Feed fixture Academy', academy::text, 'team', owner_user),
    (academy_b, 'Other Centre', academy_b::text, 'team', owner_user);
  insert into public.tenant_memberships(tenant_id, user_id, role, status) values (academy, owner_user, 'owner', 'active'), (academy_b, owner_user, 'owner', 'active');
  insert into public.academy_branches(id, academy_id, branch_key, name, timezone, is_default) values
    (branch, academy, 'feed', 'Feed branch', 'Asia/Tashkent', true), (branch_b, academy_b, 'feed', 'Feed branch', 'Asia/Tashkent', true);
  insert into public.academy_classrooms(id, academy_id, branch_id, name, created_by) values
    (classroom, academy, branch, 'Feed class', owner_user), (classroom_b, academy_b, branch_b, 'Other class', owner_user);
  insert into public.academy_contacts(id, academy_id, primary_branch_id, user_id, first_name, email, status, created_by) values
    (child, academy, branch, student, 'Aziza', student || '@example.invalid', 'active', owner_user),
    (child_b, academy_b, branch_b, student, 'Aziza', student || '@example.invalid', 'active', owner_user);
  insert into public.academy_classroom_memberships(academy_id, classroom_id, contact_id, role, status)
  values (academy, classroom, child, 'student', 'active'), (academy_b, classroom_b, child_b, 'student', 'active');
  insert into public.academy_assignments(id, academy_id, classroom_id, title, status, attempts_allowed, allow_late_submission, max_score, due_at, created_by) values
    (assignment, academy, classroom, 'Secret unit title', 'active', 1, true, 10, now() + interval '1 day', owner_user),
    (assignment_b, academy_b, classroom_b, 'Other unit', 'active', 1, true, 10, now() + interval '1 day', owner_user);
  sub_id := (public.academy_assignment_written_command(academy, student, assignment,
    '{"submission_content":"I have car.","metadata":{"response_kind":"text","source":"web"}}')->>'id')::uuid;
  sub_b := (public.academy_assignment_written_command(academy_b, student, assignment_b,
    '{"submission_content":"She go home.","metadata":{"response_kind":"text","source":"web"}}')->>'id')::uuid;

  -- The learner's own English mistake, which homework must never touch.
  insert into public.learner_language_errors(user_id, language_id, service_key, skill_key, subskill_key, error_type)
  values (student, lang, 'writing', 'grammar', 'grammar.articles', 'I have car → I have a car') returning id into own_error;

  -- 1. Off by default: mistakes stay inside the centre.
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, explanation, source)
  values (academy, child, classroom, assignment, sub_id, 'grammar.articles', 'I have car', 'I have a car', 'Use a before a singular noun.', 'teacher')
  returning id into m_articles;
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, source)
  values (academy, child, classroom, assignment, sub_id, 'math.arithmetic', '2 + 2 = 5', '2 + 2 = 4', 'teacher') returning id into m_math;
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, source)
  values (academy, child, classroom, assignment, sub_id, 'grammar.agreement', 'Она пошли', 'Она пошла', 'teacher') returning id into m_cyrillic;
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, source)
  values (academy, child, classroom, assignment, sub_id, 'vocabulary.word_choice', 'make a photo', null, 'ai') returning id into m_vocab;
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, source)
  values (academy_b, child_b, classroom_b, assignment_b, sub_b, 'grammar.agreement', 'She go', 'She goes', 'teacher') returning id into m_b;
  if exists (select 1 from public.learner_language_errors where user_id = student and service_key = 'academy_homework')
     or exists (select 1 from public.learner_review_items where user_id = student and item_key like 'homework:%')
     or exists (select 1 from public.academy_homework_mistake_feed where user_id = student) then
    raise exception 'Mistakes were copied without consent';
  end if;
  if public.academy_homework_feed_state(academy, child)->>'status' <> 'off' then raise exception 'Consent should start off'; end if;

  -- 2. Only a learner of the centre can turn it on, and only when 18 or older.
  begin
    perform public.academy_homework_feed_learner_command(student, academy, true, false, 'fixture');
    raise exception 'An unconfirmed (possibly under-18) learner turned it on';
  exception when raise_exception then
    if sqlerrm not like '%parent or guardian%' then raise; end if;
  end;
  begin
    perform public.academy_homework_feed_learner_command(other_user, academy, true, true, 'fixture');
    raise exception 'A non-learner turned it on';
  exception when insufficient_privilege then null;
  end;

  -- 3. Turning it on copies open English mistakes only, with a timestamp.
  result := public.academy_homework_feed_learner_command(student, academy, true, true, 'academy_web');
  if result->'consents'->0->>'status' <> 'granted' or (result->'consents'->0->>'copied')::int <> 2 then
    raise exception 'Grant should copy the articles and vocabulary mistakes: %', result;
  end if;
  if not exists (select 1 from public.academy_homework_feed_consents where academy_id = academy and contact_id = child and status = 'granted'
      and granted_at is not null and granted_by_role = 'learner' and learner_confirmed_adult and granted_by_user_id = student) then
    raise exception 'Consent was not stored with its timestamp';
  end if;
  if not exists (select 1 from public.academy_homework_feed_consent_events where contact_id = child and action = 'granted' and actor_role = 'learner')
     or not exists (select 1 from public.academy_audit_events where academy_id = academy and action = 'homework.mistake_feed_granted') then
    raise exception 'Grant was not recorded';
  end if;
  select * into e from public.learner_language_errors where user_id = student and service_key = 'academy_homework' and subskill_key = 'grammar.articles';
  if e.id is null or e.error_type <> 'I have car → I have a car' or e.mastery_status <> 'open' or e.error_frequency <> 1 or e.language_id <> lang then
    raise exception 'Articles mistake was not mapped for Today: %', to_jsonb(e);
  end if;
  if not exists (select 1 from public.learner_review_items where user_id = student and item_key = 'homework:' || m_articles
      and kind = 'grammar' and payload->>'prompt' = 'I have car' and payload->'accepted' = '["I have a car"]'::jsonb
      and payload->>'explanation' = 'Use a before a singular noun.' and payload->>'source_title' = 'Homework · Feed fixture Academy'
      and next_due_at <= now() and box = 1) then
    raise exception 'Articles mistake was not queued for Review';
  end if;
  if exists (select 1 from public.learner_review_items r where r.user_id = student and r.payload::text like '%Secret unit title%') then
    raise exception 'Assignment titles must stay inside the centre';
  end if;
  if exists (select 1 from public.academy_homework_mistake_feed where mistake_id in (m_math, m_cyrillic, m_b)) then
    raise exception 'Maths, other-script or other-centre mistakes were copied';
  end if;
  if not exists (select 1 from public.learner_language_errors where user_id = student and service_key = 'academy_homework' and subskill_key = 'vocabulary.word_choice'
      and skill_key = 'vocabulary' and error_type = 'make a photo')
     or exists (select 1 from public.learner_review_items where item_key = 'homework:' || m_vocab) then
    raise exception 'A mistake without a correction should be tracked but not asked in Review';
  end if;

  -- 4. New mistakes flow while consent is on; the same mistake counts twice on one row.
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, source)
  values (academy, child, classroom, assignment, sub_id, 'grammar.articles', 'I have car', 'I have a car', 'ai') returning id into m_articles2;
  if (select error_frequency from public.learner_language_errors where id = e.id) <> 2
     or (select count(*) from public.learner_review_items where user_id = student and item_key like 'homework:%') <> 2 then
    raise exception 'A new mistake did not flow in';
  end if;

  -- 5. Practised in Schood English, then made again at the centre: reopened.
  update public.learner_language_errors set mastery_status = 'improving' where id = e.id;
  update public.academy_homework_mistakes set status = 'corrected', resolved_at = now() where id = m_articles2;
  if (select error_frequency from public.learner_language_errors where id = e.id) <> 1
     or exists (select 1 from public.learner_review_items where item_key = 'homework:' || m_articles2) then
    raise exception 'A corrected mistake was not removed';
  end if;
  update public.academy_homework_mistakes set status = 'open', resolved_at = null where id = m_articles2;
  if (select mastery_status from public.learner_language_errors where id = e.id) <> 'reopened' then
    raise exception 'A practised mistake made again should reopen';
  end if;

  -- 6. A teacher's edit moves the copy to the new text and keeps the review step.
  update public.learner_review_items set box = 2 where item_key = 'homework:' || m_articles2;
  update public.academy_homework_mistakes set excerpt = 'I has a car', correction = 'I have a car', tag = 'grammar.subject_verb_agreement' where id = m_articles2;
  if not exists (select 1 from public.learner_language_errors where user_id = student and service_key = 'academy_homework'
      and subskill_key = 'grammar.agreement' and error_type = 'I has a car → I have a car')
     or (select error_frequency from public.learner_language_errors where id = e.id) <> 1
     or (select box from public.learner_review_items where item_key = 'homework:' || m_articles2) <> 2
     or (select payload->>'prompt' from public.learner_review_items where item_key = 'homework:' || m_articles2) <> 'I has a car' then
    raise exception 'An edited mistake was not re-mapped';
  end if;

  -- 7. Deleting a mistake removes its copies.
  delete from public.academy_homework_mistakes where id = m_articles2;
  if exists (select 1 from public.learner_review_items where item_key = 'homework:' || m_articles2)
     or exists (select 1 from public.learner_language_errors where user_id = student and service_key = 'academy_homework' and subskill_key = 'grammar.agreement') then
    raise exception 'A deleted mistake left copies behind';
  end if;

  -- 8. Revoking removes every copy from this centre and stops new ones.
  result := public.academy_homework_feed_learner_command(student, academy, false, null, 'telegram_app');
  if result->'consents'->0->>'status' <> 'revoked' or (result->'consents'->0->>'copied')::int <> 0 then
    raise exception 'Revoke did not report the new state: %', result;
  end if;
  if exists (select 1 from public.learner_language_errors where user_id = student and service_key = 'academy_homework')
     or exists (select 1 from public.learner_review_items where user_id = student and item_key like 'homework:%')
     or exists (select 1 from public.academy_homework_mistake_feed where user_id = student) then
    raise exception 'Revoke left copied rows';
  end if;
  if not exists (select 1 from public.learner_language_errors where id = own_error) then raise exception 'Revoke removed the learner''s own mistake'; end if;
  if not exists (select 1 from public.academy_homework_feed_consents where contact_id = child and status = 'revoked' and revoked_at is not null and revoked_by_role = 'learner')
     or not exists (select 1 from public.academy_homework_feed_consent_events where contact_id = child and action = 'revoked') then
    raise exception 'Revoke was not recorded';
  end if;
  insert into public.academy_homework_mistakes(academy_id, contact_id, classroom_id, assignment_id, submission_id, tag, excerpt, correction, source)
  values (academy, child, classroom, assignment, sub_id, 'grammar.past_simple', 'I go yesterday', 'I went yesterday', 'teacher') returning id into m_late;
  if exists (select 1 from public.academy_homework_mistake_feed where mistake_id = m_late) then raise exception 'A mistake flowed after revoke'; end if;

  -- 9. A guardian with current parent access can turn it on for their child; the learner can still turn it off.
  insert into public.academy_guardians(id, academy_id, user_id, full_name, telegram_user_id, status, locale)
  values (guardian, academy, parent_user, 'Aziza''s mother', '778', 'verified', 'en');
  insert into public.academy_student_guardian_relationships(id, academy_id, contact_id, guardian_id, relationship_type, status, consent_status, consented_at, can_view_homework)
  values (relationship, academy, child, guardian, 'mother', 'active', 'granted', now(), false);
  begin
    perform public.academy_homework_feed_guardian_command(parent_user, relationship, true, 'fixture');
    raise exception 'A guardian without homework access turned it on';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.academy_homework_feed_guardian_command(other_user, relationship, true, 'fixture');
    raise exception 'A stranger used a guardian relationship';
  exception when insufficient_privilege then null;
  end;
  update public.academy_student_guardian_relationships set can_view_homework = true where id = relationship;
  result := public.academy_homework_feed_guardian_state(parent_user, relationship);
  if result->>'status' <> 'revoked' or result->>'account_linked' <> 'true' then raise exception 'Guardian state is wrong: %', result; end if;
  result := public.academy_homework_feed_guardian_command(parent_user, relationship, true, 'guardian_portal');
  if result->>'status' <> 'granted' or (result->>'copied')::int <> 3 then raise exception 'Guardian grant did not copy: %', result; end if;
  if not exists (select 1 from public.academy_homework_feed_consents where contact_id = child and granted_by_role = 'guardian'
      and guardian_relationship_id = relationship and granted_by_user_id = parent_user and learner_user_id = student) then
    raise exception 'Guardian consent was not stored';
  end if;
  if exists (select 1 from public.academy_homework_mistake_feed where mistake_id = m_b) then raise exception 'Guardian consent crossed into another centre'; end if;
  result := public.academy_homework_feed_learner_command(student, academy, false, null, 'academy_web');
  if exists (select 1 from public.academy_homework_mistake_feed where academy_id = academy) then raise exception 'The learner could not withdraw a guardian''s consent'; end if;

  -- 10. Re-linking the learner record to another account ends the consent.
  perform public.academy_homework_feed_learner_command(student, academy, true, true, 'academy_web');
  if not exists (select 1 from public.academy_homework_mistake_feed where academy_id = academy) then raise exception 'Re-grant did not copy'; end if;
  update public.academy_contacts set user_id = other_user where id = child;
  if exists (select 1 from public.academy_homework_mistake_feed where academy_id = academy)
     or exists (select 1 from public.learner_review_items where user_id = student and item_key like 'homework:%')
     or not exists (select 1 from public.academy_homework_feed_consents where contact_id = child and status = 'revoked' and revoked_by_role = 'system' and revocation_reason = 'account_changed') then
    raise exception 'An account change kept the old consent';
  end if;
  update public.academy_contacts set user_id = student where id = child;
  if exists (select 1 from public.academy_homework_mistake_feed where academy_id = academy) then raise exception 'Consent came back on its own'; end if;

  -- 11. Browsers never reach the consent, copies or commands directly.
  if has_table_privilege('authenticated', 'public.academy_homework_feed_consents', 'SELECT')
     or has_table_privilege('anon', 'public.academy_homework_mistake_feed', 'SELECT')
     or has_table_privilege('authenticated', 'public.academy_homework_feed_consent_events', 'INSERT')
     or has_function_privilege('authenticated', 'public.academy_homework_feed_learner_command(uuid,uuid,boolean,boolean,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.academy_homework_feed_guardian_command(uuid,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.academy_homework_feed_mistake(uuid)', 'EXECUTE') then
    raise exception 'Browser role bypasses the consent gateway';
  end if;
end;
$fixture$;
rollback;
select 'academy-homework-mistake-feed-ok';
