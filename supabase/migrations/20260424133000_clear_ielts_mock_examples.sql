-- One-off cleanup: remove exemplary IELTS Academic Simulator mock experiences only.
-- This intentionally does not delete the IELTS product, plans, IELTS Practice, or IELTS Playbook.

begin;

create temp table _target_ielts_mock_experiences (
  id uuid primary key
) on commit drop;

insert into _target_ielts_mock_experiences (id)
values
  ('33333333-3333-3333-3333-333333333333'::uuid),
  ('c94a04f2-e53d-4f8f-b1e1-eaa33fa0ffe5'::uuid),
  ('fc24b94e-c1ff-4a05-8a19-effcd392912a'::uuid),
  ('63c29767-8b9b-437a-8a00-06ea95aefb0c'::uuid),
  ('d45bd5b2-0aa6-4bb7-83b2-84c6661d810f'::uuid),
  ('77777777-7777-7777-7777-777777777777'::uuid),
  ('5841d030-c6dc-4013-819a-8093822d74bf'::uuid),
  ('acc32024-d115-4abe-8a39-ef8c073574b1'::uuid),
  ('8dacb42d-4f3f-42c0-8a95-b478020ed568'::uuid),
  ('66622bde-19f7-4af9-98dd-6b9aeddf7e12'::uuid),
  ('1722d3b5-e653-4282-936e-6a5d2ee158f3'::uuid),
  ('1a346be2-3295-44d3-81a3-9722efbfd311'::uuid),
  ('038ccd8b-bb60-406e-a6aa-316cd90ba018'::uuid),
  ('52ce2f42-87fa-40ed-aec9-3ac745b7c7cb'::uuid),
  ('25637773-cd9a-40be-8251-1ead261e0d0f'::uuid),
  ('ac18aef6-19f8-4d03-bfa8-88b96d71a4aa'::uuid),
  ('b842c89c-09f4-4324-a5cc-09360a7a5889'::uuid);

do $$
declare
  v_bad_count integer;
begin
  select count(*)
  into v_bad_count
  from _target_ielts_mock_experiences t
  join public.experiences e on e.id = t.id
  where e.product_id <> 'ead05eae-aa97-4bda-a07c-51e5dbb062c0'::uuid;

  if v_bad_count > 0 then
    raise exception 'Refusing IELTS mock cleanup: target list contains non-IELTS Academic Simulator experiences';
  end if;
end
$$;

create temp table _target_ielts_mock_sessions on commit drop as
select s.id
from public.sessions s
where s.experience_id in (select id from _target_ielts_mock_experiences);

create temp table _target_ielts_mock_tokens on commit drop as
select t.id
from public.exam_tokens t
where t.experience_id in (select id from _target_ielts_mock_experiences);

create temp table _target_ielts_mock_registrations on commit drop as
select r.id
from public.exam_registrations r
where r.experience_id in (select id from _target_ielts_mock_experiences)
   or r.session_id in (select id from _target_ielts_mock_sessions)
   or r.token_id in (select id from _target_ielts_mock_tokens);

create temp table _affected_language_profiles on commit drop as
select distinct ls.user_id, ls.language_id
from public.language_signals ls
where ls.session_id in (select id from _target_ielts_mock_sessions);

create temp table _affected_skill_profiles on commit drop as
select distinct s.user_id, e.product_id
from public.sessions s
join public.experiences e on e.id = s.experience_id
where s.id in (select id from _target_ielts_mock_sessions);

delete from public.learner_language_profile_events
where session_id in (select id from _target_ielts_mock_sessions);

delete from public.language_signals
where session_id in (select id from _target_ielts_mock_sessions);

delete from public.learner_skill_profile_events
where session_id in (select id from _target_ielts_mock_sessions);

delete from public.learner_skill_profiles lsp
where exists (
  select 1
  from _affected_skill_profiles affected
  where affected.user_id = lsp.user_id
    and affected.product_id = lsp.product_id
);

delete from public.exam_outcomes
where experience_id in (select id from _target_ielts_mock_experiences)
   or session_id in (select id from _target_ielts_mock_sessions);

delete from public.evaluations
where session_id in (select id from _target_ielts_mock_sessions);

delete from public.responses
where session_id in (select id from _target_ielts_mock_sessions);

update public.sessions
set token_id = null,
    registration_id = null
where id in (select id from _target_ielts_mock_sessions);

delete from public.exam_registrations
where id in (select id from _target_ielts_mock_registrations);

delete from public.exam_tokens
where id in (select id from _target_ielts_mock_tokens);

delete from public.sessions
where id in (select id from _target_ielts_mock_sessions);

delete from public.learner_language_profiles llp
where exists (
  select 1
  from _affected_language_profiles affected
  where affected.user_id = llp.user_id
    and affected.language_id = llp.language_id
)
and not exists (
  select 1
  from public.language_signals ls
  where ls.user_id = llp.user_id
    and ls.language_id = llp.language_id
);

do $$
declare
  v_profile record;
begin
  for v_profile in
    select affected.user_id, affected.language_id
    from _affected_language_profiles affected
    where exists (
      select 1
      from public.language_signals ls
      where ls.user_id = affected.user_id
        and ls.language_id = affected.language_id
    )
  loop
    perform public.recompute_learner_language_profile(v_profile.user_id, v_profile.language_id, null, null);
  end loop;
end
$$;

delete from public.experiences
where id in (select id from _target_ielts_mock_experiences);

commit;
