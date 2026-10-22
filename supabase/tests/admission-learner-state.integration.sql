-- Admission learner state: replay, lost-update protection and browser isolation.
\set ON_ERROR_STOP 1
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
insert into public.users(id) values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2');
insert into public.tenants(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.assessment_item_banks(id, tenant_id, title, created_by)
  values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Maths', '00000000-0000-4000-8000-0000000000a1');
insert into public.assessment_items(id, tenant_id, bank_id, created_by)
  values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1');
insert into public.assessment_item_versions(id, tenant_id, item_id, version, payload, created_by)
  values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1,
    '{"schema_version":"assessment.item.v1"}', '00000000-0000-4000-8000-0000000000a1');
\i /work/migration.sql

do $$
declare
  learner constant uuid := '00000000-0000-4000-8000-0000000000a2';
  answer jsonb := '{"client_answer_id":"50000000-0000-4000-8000-000000000001","item_version_id":"40000000-0000-4000-8000-000000000001","mode":"practice","difficulty":0,"correct":true,"response":"b","seconds":40}';
  state jsonb := '{"theta":0.5,"precision":1.25,"attempts":1,"correct":1,"box":1,"last_at":"2026-11-01T09:00:00Z","next_review_at":"2026-11-03T09:00:00Z"}';
  result jsonb;
  raised boolean := false;
begin
  result := public.learner_subject_record_answer(learner, 'math', 'math.alg.quadratic', answer, 0, state);
  assert result->>'replayed' = 'false', 'first answer stored';
  assert (select attempts from public.learner_subject_mastery where user_id = learner) = 1, 'mastery moved';

  -- The same answer sent again changes nothing and returns what was stored.
  result := public.learner_subject_record_answer(learner, 'math', 'math.alg.quadratic', answer, 0, '{"theta":3,"precision":9,"attempts":9,"correct":9,"box":5}');
  assert result->>'replayed' = 'true' and (result->'answer'->>'correct')::boolean, 'replay';
  assert (select theta from public.learner_subject_mastery where user_id = learner) = 0.5, 'replay left mastery alone';
  assert (select count(*) from public.learner_subject_answers) = 1, 'one answer';

  -- A second tab computed from the old state (0 attempts) and is refused.
  begin
    perform public.learner_subject_record_answer(learner, 'math', 'math.alg.quadratic',
      jsonb_set(answer, '{client_answer_id}', '"50000000-0000-4000-8000-000000000002"'), 0, state);
  exception when serialization_failure then
    raised := sqlerrm = 'mastery_conflict';
  end;
  assert raised, 'stale state refused';
  assert (select count(*) from public.learner_subject_answers) = 1, 'refused answer not stored';

  -- A wrong answer must say what kind of mistake it was.
  raised := false;
  begin
    perform public.learner_subject_record_answer(learner, 'math', 'math.alg.quadratic',
      jsonb_set(jsonb_set(answer, '{client_answer_id}', '"50000000-0000-4000-8000-000000000003"'), '{correct}', 'false'), 1,
      jsonb_set(state, '{attempts}', '2'));
  exception when check_violation then
    raised := true;
  end;
  assert raised, 'wrong answer without error kind refused';
end $$;

-- Browsers get nothing directly.
set role authenticated;
do $$
begin
  begin
    perform 1 from public.learner_subject_mastery;
    raise exception 'authenticated read mastery';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.learner_subject_record_answer('00000000-0000-4000-8000-0000000000a2', 'math', 'math.x', '{}', 0, '{}');
    raise exception 'authenticated called record_answer';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'admission learner state: ok';
