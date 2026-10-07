begin;

-- Immutable server-owned questions/keys selected at start. Browser roles cannot
-- read this table; the Edge removes the entire correct property before submission.
create table public.sat_practice_attempt_sources (
  attempt_id uuid primary key references public.sat_practice_lab_attempts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  filters_used jsonb not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  created_at timestamptz not null default now()
);
alter table public.sat_practice_attempt_sources enable row level security;
revoke all on public.sat_practice_attempt_sources from public,anon,authenticated,service_role;
grant select,insert on public.sat_practice_attempt_sources to service_role;
create function public.guard_sat_practice_attempt_source() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'Started drill questions are immutable' using errcode='23505';
end;
$$;
create trigger sat_practice_attempt_source_immutable before update on public.sat_practice_attempt_sources
for each row execute function public.guard_sat_practice_attempt_source();

create function public.start_sat_practice_attempt(p_user_id uuid,p_request_id uuid,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.sat_practice_lab_attempts%rowtype;
  source public.sat_practice_attempt_sources%rowtype;
  questions jsonb; ids uuid[]; selected_ids uuid[];
  session_id uuid; experience_id uuid; count_requested integer;
  retry_id uuid;
begin
  if p_user_id is null or p_request_id is null or p_filters is null
    or jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text)>16384 then
    raise exception 'Invalid drill start' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_filters) k
    where k not in ('section_type','domain','difficulty','mistake_history','question_ids','limit','retry_notebook_id'))
    or jsonb_typeof(p_filters->'limit') is distinct from 'number'
    or coalesce(p_filters->>'limit','') !~ '^([1-9]|[1-9][0-9]|100)$' then
    raise exception 'Invalid drill filters' using errcode='22023';
  end if;
  count_requested:=(p_filters->>'limit')::integer;
  if p_filters ? 'question_ids' then
    if jsonb_typeof(p_filters->'question_ids') is distinct from 'array' then
      raise exception 'Invalid question IDs' using errcode='22023';
    end if;
    select coalesce(array_agg(value::uuid order by ord),'{}'::uuid[]) into selected_ids
      from jsonb_array_elements_text(p_filters->'question_ids') with ordinality as x(value,ord);
    if cardinality(selected_ids)>100 or (select count(distinct id) from unnest(selected_ids) id)<>cardinality(selected_ids) then
      raise exception 'Invalid question IDs' using errcode='22023';
    end if;
  end if;
  -- Serialize by request identity, including accidental or adversarial cross-actor collisions.
  perform pg_advisory_xact_lock(hashtextextended('sat-practice-start:'||p_request_id::text,0));
  select * into a from public.sat_practice_lab_attempts where id=p_request_id for update;
  if found then
    if a.user_id is distinct from p_user_id then
      raise exception 'Drill not found' using errcode='P0002';
    end if;
    select * into source from public.sat_practice_attempt_sources where attempt_id=a.id and user_id=p_user_id;
    if not found or source.filters_used is distinct from p_filters or a.status='abandoned' then
      raise exception 'Start request already used' using errcode='23505';
    end if;
    return jsonb_build_object('attempt',to_jsonb(a),'questions',source.questions,'replayed_start',true);
  end if;
  if p_filters ? 'retry_notebook_id' then
    if jsonb_typeof(p_filters->'retry_notebook_id') is distinct from 'string' then
      raise exception 'Invalid review ID' using errcode='22023';
    end if;
    retry_id:=(p_filters->>'retry_notebook_id')::uuid;
    perform 1 from public.sat_practice_mistake_notebook where id=retry_id and user_id=p_user_id;
    if not found then raise exception 'Review not found' using errcode='P0002'; end if;
  end if;
  select coalesce(jsonb_agg(q order by ord),'[]'::jsonb) into questions
    from public.select_sat_practice_questions(p_user_id,p_filters->>'section_type',p_filters->>'domain',
      p_filters->>'difficulty',p_filters->>'mistake_history',selected_ids,count_requested,false)
      with ordinality as selected(q,ord);
  if jsonb_array_length(questions)=0 then
    raise exception 'No matching practice questions' using errcode='P0001';
  end if;
  select array_agg((q->>'id')::uuid order by ord) into ids
    from jsonb_array_elements(questions) with ordinality as x(q,ord);
  -- Match the shared session to selected content, rather than choosing an arbitrary bank.
  select s.experience_id into experience_id from public.content_units u
    join public.parts p on p.id=u.part_id join public.sections s on s.id=p.section_id where u.id=ids[1];
  if experience_id is null then raise exception 'Question source unavailable' using errcode='P0001'; end if;
  insert into public.sessions(user_id,experience_id,status,started_at,metadata)
    values(p_user_id,experience_id,'active',now(),jsonb_build_object('mode','sat_practice_lab','filters',p_filters))
    returning id into session_id;
  insert into public.sat_practice_lab_attempts(id,user_id,session_id,filters_used,question_ids,status)
    values(p_request_id,p_user_id,session_id,p_filters,ids,'in_progress') returning * into a;
  insert into public.sat_practice_attempt_sources(attempt_id,user_id,filters_used,questions)
    values(a.id,p_user_id,p_filters,questions);
  return jsonb_build_object('attempt',to_jsonb(a),'questions',questions,'replayed_start',false);
end;
$$;
revoke all on function public.start_sat_practice_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_sat_practice_attempt(uuid,uuid,jsonb) to service_role;

-- Keep the tested completion transaction intact behind a snapshot-validation
-- wrapper. Its previous body is no longer callable directly by browser/service RPCs.
alter function public.complete_sat_practice_attempt(uuid,uuid,jsonb,jsonb,jsonb)
  rename to complete_sat_practice_attempt_v1;
revoke all on function public.complete_sat_practice_attempt_v1(uuid,uuid,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
create function public.complete_sat_practice_attempt(
  p_user_id uuid,p_attempt_id uuid,p_answers jsonb,p_questions jsonb,p_scored_items jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare frozen jsonb; attempt_status text;
begin
  select a.status,s.questions into attempt_status,frozen
    from public.sat_practice_lab_attempts a
    left join public.sat_practice_attempt_sources s on s.attempt_id=a.id and s.user_id=a.user_id
    where a.id=p_attempt_id and a.user_id=p_user_id;
  if attempt_status is distinct from 'scored' and frozen is not null and p_questions is distinct from frozen then
    raise exception 'Questions differ from the started drill' using errcode='22023';
  end if;
  return public.complete_sat_practice_attempt_v1(p_user_id,p_attempt_id,p_answers,p_questions,p_scored_items);
end;
$$;
revoke all on function public.complete_sat_practice_attempt(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_sat_practice_attempt(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
