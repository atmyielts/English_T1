begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- SAT Practice engine v2 (contract A). Additive and compatible with the
-- currently deployed sat-practice Edge function for one deploy:
--  * drafts never reach learners; explicit question lists keep their order;
--  * a light per-learner catalog (taxonomy + own history, no answer keys) for
--    bank filters, plan drills and module building in the Edge service;
--  * starts accept plan/module metadata and mark plan items in progress;
--  * completion records real elapsed minutes (capped per question to ignore
--    idle time) instead of a synthetic floor, and completes the plan item;
--  * admin-only import/publish RPCs for the admin-sat-practice function.

-- 1. Bank selection: exclude drafts, keep the requested order of explicit IDs.
create or replace function public.select_sat_practice_questions(
  p_user_id uuid,
  p_section text default null,
  p_domain text default null,
  p_difficulty text default null,
  p_history text default null,
  p_question_ids uuid[] default null,
  p_limit integer default 30,
  p_include_retired boolean default false
) returns setof jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 100
    or (p_section is not null and p_section not in ('math','reading_writing'))
    or (p_domain is not null and p_domain not in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig'))
    or (p_difficulty is not null and p_difficulty not in ('easy','medium','hard'))
    or (p_history is not null and p_history not in ('previously_missed','mastered','unseen'))
    or cardinality(p_question_ids) > 100
    or (p_include_retired and p_question_ids is null)
  then raise exception 'Invalid bank filters' using errcode = '22023'; end if;

  return query
  with source as (
    select u.*, case when jsonb_typeof(k.correct)='object' and jsonb_typeof(k.metadata->'feedback')='object' then k.correct||jsonb_build_object('feedback',k.metadata->'feedback') else k.correct end as correct,
      e.display_order as experience_order, s.display_order as section_order,
      p.display_order as part_order,
      case when e.metadata->>'bank_priority' = 'curated' then 0 else 1 end as priority,
      lower(trim(coalesce(u.metadata->>'section_type',u.metadata->>'section',u.metadata->>'domain',''))) as raw_section,
      replace(regexp_replace(lower(trim(coalesce(u.metadata->>'sat_domain',u.metadata->>'domain',''))),'[[:space:]-]+','_','g'),'&','and') as raw_domain,
      lower(trim(coalesce(u.metadata->>'difficulty',u.metadata->>'difficulty_tier','medium'))) as raw_difficulty
    from public.experiences e
    join public.sections s on s.experience_id = e.id
    join public.parts p on p.section_id = s.id
    join public.content_units u on u.part_id = p.id
    left join public.answer_keys k on k.content_unit_id = u.id
    where e.metadata->>'format' = 'sat_practice_bank'
      and e.product_id in ('2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,'5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid)
      and (e.is_active or p_include_retired)
      and u.type like 'question_%' and jsonb_typeof(u.data) = 'object'
      and (p_include_retired or (k.correct is not null and k.correct <> 'null'::jsonb))
      and (p_question_ids is null or u.id = any(p_question_ids))
      and (p_include_retired or coalesce(u.metadata->>'content_status','published') not in ('retired','legacy_placeholder','draft'))
  ), domains as (
    select source.*, case
      when raw_domain in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig') then raw_domain
      when raw_domain in ('math') then 'algebra'
      when raw_domain in ('vocabulary','vocab') then 'vocabulary_in_context'
      when raw_domain = 'evidence' then 'command_of_evidence'
      when raw_domain in ('geometry','trig') then 'geometry_trig'
      when raw_domain = 'data_analysis' then 'problem_solving_data_analysis'
      when raw_domain in ('reading_writing','rw') then 'grammar'
      when raw_section = 'math' then 'algebra' else 'grammar' end as domain
    from source
  ), normalized as (
    select domains.*,
      case when raw_section = 'math' or domain in ('algebra','advanced_math','problem_solving_data_analysis','geometry_trig') then 'math' else 'reading_writing' end as section_type,
      case when raw_difficulty in ('easy','medium','hard') then raw_difficulty else 'medium' end as difficulty
    from domains
  )
  select jsonb_build_object('id',n.id,'type',n.type,'data',n.data,'metadata',coalesce(n.metadata,'{}'::jsonb),
    'section_type',n.section_type,'domain',n.domain,'difficulty',n.difficulty,'correct',n.correct)
  from normalized n
  left join public.sat_practice_srs_queue q on q.question_id = n.id and q.user_id = p_user_id
  where (p_section is null or n.section_type = p_section)
    and (p_domain is null or n.domain = p_domain)
    and (p_difficulty is null or n.difficulty = p_difficulty)
    and (p_history is null
      or (p_history = 'mastered' and q.leitner_box = 5 and q.correct_count > 0)
      or (p_history = 'previously_missed' and (q.incorrect_count > 0 or exists (
        select 1 from public.sat_practice_lab_attempts a,
        lateral jsonb_array_elements(case when jsonb_typeof(a.scored_items) = 'array' then a.scored_items else '[]'::jsonb end) item
        where a.user_id = p_user_id and a.status = 'scored' and n.id = any(a.question_ids)
          and item->>'question_id' = n.id::text and item->>'correct' = 'false'
      )))
      or (p_history = 'unseen' and coalesce(q.correct_count + q.incorrect_count,0) = 0 and not exists (
        select 1 from public.sat_practice_lab_attempts a
        where a.user_id = p_user_id and a.status = 'scored' and n.id = any(a.question_ids)
      )))
  order by case when p_question_ids is null then 0 else array_position(p_question_ids, n.id) end,
    n.priority,n.experience_order,n.section_order,n.part_order,n.display_order,n.id
  limit p_limit;
end;
$$;
revoke all on function public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean) from public,anon,authenticated;
grant execute on function public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean) to service_role;

-- 2. Light catalog: every learner-visible question with taxonomy and the
-- learner's own last result. No prompts and no answer keys.
create or replace function public.select_sat_practice_catalog(p_user_id uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null then raise exception 'Invalid catalog request' using errcode = '22023'; end if;
  return query
  with source as (
    select u.id, u.type, u.display_order, coalesce(u.metadata,'{}'::jsonb) as metadata,
      u.data ? 'passage' as has_passage, u.data ? 'table' as has_table, u.data ? 'figure_svg' as has_figure,
      e.display_order as experience_order, s.display_order as section_order, p.display_order as part_order,
      case when e.metadata->>'bank_priority' = 'curated' then 0 else 1 end as priority,
      lower(trim(coalesce(u.metadata->>'section_type',u.metadata->>'section',u.metadata->>'domain',''))) as raw_section,
      replace(regexp_replace(lower(trim(coalesce(u.metadata->>'sat_domain',u.metadata->>'domain',''))),'[[:space:]-]+','_','g'),'&','and') as raw_domain,
      lower(trim(coalesce(u.metadata->>'difficulty',u.metadata->>'difficulty_tier','medium'))) as raw_difficulty
    from public.experiences e
    join public.sections s on s.experience_id = e.id
    join public.parts p on p.section_id = s.id
    join public.content_units u on u.part_id = p.id
    join public.answer_keys k on k.content_unit_id = u.id
    where e.metadata->>'format' = 'sat_practice_bank' and e.is_active
      and e.product_id in ('2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,'5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid)
      and u.type like 'question_%' and jsonb_typeof(u.data) = 'object'
      and k.correct is not null and k.correct <> 'null'::jsonb
      and coalesce(u.metadata->>'content_status','published') not in ('retired','legacy_placeholder','draft')
  ), domains as (
    select source.*, case
      when raw_domain in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig') then raw_domain
      when raw_domain in ('math') then 'algebra'
      when raw_domain in ('vocabulary','vocab') then 'vocabulary_in_context'
      when raw_domain = 'evidence' then 'command_of_evidence'
      when raw_domain in ('geometry','trig') then 'geometry_trig'
      when raw_domain = 'data_analysis' then 'problem_solving_data_analysis'
      when raw_domain in ('reading_writing','rw') then 'grammar'
      when raw_section = 'math' then 'algebra' else 'grammar' end as domain
    from source
  ), normalized as (
    select domains.*,
      case when raw_section = 'math' or domain in ('algebra','advanced_math','problem_solving_data_analysis','geometry_trig') then 'math' else 'reading_writing' end as section_type,
      case when raw_difficulty in ('easy','medium','hard') then raw_difficulty else 'medium' end as difficulty,
      row_number() over (order by priority, experience_order, section_order, part_order, display_order, id) as bank_order
    from domains
  ), history as (
    select (item->>'question_id')::uuid as question_id, count(*) as seen,
      count(*) filter (where item->>'correct' = 'true') as correct_count,
      max(a.scored_at) as last_seen_at,
      (array_agg((item->>'correct')::boolean order by a.scored_at desc nulls last))[1] as last_correct
    from public.sat_practice_lab_attempts a
    cross join lateral jsonb_array_elements(case when jsonb_typeof(a.scored_items) = 'array' then a.scored_items else '[]'::jsonb end) item
    where a.user_id = p_user_id and a.status = 'scored'
      and item->>'question_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and item->>'correct' in ('true','false')
    group by 1
  )
  select jsonb_build_object('id',n.id,'type',n.type,'section_type',n.section_type,'domain',n.domain,'difficulty',n.difficulty,
    'official_domain',n.metadata->>'sat_official_domain','skill',n.metadata->>'sat_skill','sat_domain',n.metadata->>'sat_domain',
    'answer_format',n.metadata->>'answer_format','has_passage',n.has_passage,'has_table',n.has_table,'has_figure',n.has_figure,
    'bank_order',n.bank_order,
    'seen',greatest(coalesce(h.seen,0),coalesce(q.correct_count+q.incorrect_count,0)),
    'correct_count',coalesce(h.correct_count,q.correct_count,0),
    'last_seen_at',coalesce(h.last_seen_at,q.last_reviewed_at),
    'last_correct',h.last_correct)
  from normalized n
  left join history h on h.question_id = n.id
  left join public.sat_practice_srs_queue q on q.question_id = n.id and q.user_id = p_user_id
  order by n.bank_order;
end;
$$;
revoke all on function public.select_sat_practice_catalog(uuid) from public,anon,authenticated;
grant execute on function public.select_sat_practice_catalog(uuid) to service_role;

-- 3. Plan items may now be timed module tasks.
alter table public.sat_practice_plan_items drop constraint if exists sat_practice_plan_items_task_type_check;
alter table public.sat_practice_plan_items add constraint sat_practice_plan_items_task_type_check
  check (task_type in ('drill','notebook_review','half_mock','tutor_session','module'));

-- 4. Start: same atomic replay contract, plus plan/module metadata.
create or replace function public.start_sat_practice_attempt(p_user_id uuid,p_request_id uuid,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.sat_practice_lab_attempts%rowtype;
  source public.sat_practice_attempt_sources%rowtype;
  questions jsonb; ids uuid[]; selected_ids uuid[];
  session_id uuid; experience_id uuid; count_requested integer;
  retry_id uuid; plan_id uuid; meta_key text;
begin
  if p_user_id is null or p_request_id is null or p_filters is null
    or jsonb_typeof(p_filters) <> 'object' or octet_length(p_filters::text)>16384 then
    raise exception 'Invalid drill start' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_filters) k
    where k not in ('section_type','domain','difficulty','mistake_history','question_ids','limit','retry_notebook_id',
      'mode','plan_item_id','module_section','module_profile','time_limit_seconds','official_domain','skill',
      'answer_format','status','requested_count'))
    or jsonb_typeof(p_filters->'limit') is distinct from 'number'
    or coalesce(p_filters->>'limit','') !~ '^([1-9]|[1-9][0-9]|100)$' then
    raise exception 'Invalid drill filters' using errcode='22023';
  end if;
  foreach meta_key in array array['mode','module_section','module_profile','official_domain','skill','answer_format','status'] loop
    if p_filters ? meta_key and (jsonb_typeof(p_filters->meta_key) is distinct from 'string' or coalesce(p_filters->>meta_key,'') !~ '^[a-z_]{1,64}$') then
      raise exception 'Invalid drill metadata' using errcode='22023';
    end if;
  end loop;
  if (p_filters ? 'mode' and p_filters->>'mode' not in ('drill','bank','plan','module','review'))
    or (p_filters ? 'module_section' and p_filters->>'module_section' not in ('reading_writing','math'))
    or (p_filters ? 'time_limit_seconds' and (jsonb_typeof(p_filters->'time_limit_seconds') is distinct from 'number'
      or coalesce(p_filters->>'time_limit_seconds','') !~ '^[1-9][0-9]{1,4}$' or (p_filters->>'time_limit_seconds')::integer not between 60 and 10800))
    or (p_filters ? 'requested_count' and (jsonb_typeof(p_filters->'requested_count') is distinct from 'number'
      or coalesce(p_filters->>'requested_count','') !~ '^([1-9]|[1-9][0-9]|100)$'))
    or (p_filters ? 'plan_item_id' and (jsonb_typeof(p_filters->'plan_item_id') is distinct from 'string'
      or coalesce(p_filters->>'plan_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
    raise exception 'Invalid drill metadata' using errcode='22023';
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
  if p_filters ? 'plan_item_id' then
    plan_id:=(p_filters->>'plan_item_id')::uuid;
    perform 1 from public.sat_practice_plan_items where id=plan_id and user_id=p_user_id for update;
    if not found then raise exception 'Plan item not found' using errcode='P0002'; end if;
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
  if plan_id is not null then
    update public.sat_practice_plan_items set status='in_progress',updated_at=now(),
      payload=payload||jsonb_build_object('attempt_id',a.id)
      where id=plan_id and user_id=p_user_id and status='pending';
  end if;
  return jsonb_build_object('attempt',to_jsonb(a),'questions',questions,'replayed_start',false);
end;
$$;
revoke all on function public.start_sat_practice_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_sat_practice_attempt(uuid,uuid,jsonb) to service_role;

-- 5. Completion: identical scoring transaction; real study time and plan progress.
create or replace function public.complete_sat_practice_attempt_v1(
  p_user_id uuid,p_attempt_id uuid,p_answers jsonb,p_questions jsonb,p_scored_items jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.sat_practice_lab_attempts%rowtype;
  m public.sat_practice_mastery%rowtype;
  s public.sat_practice_srs_queue%rowtype;
  q jsonb; item jsonb; answer jsonb; result jsonb; notebook jsonb:='[]'; mistake jsonb;
  n integer; i integer; correct_count integer:=0; was_correct boolean;
  accuracy numeric; rolling numeric; level numeric; box integer; interval_days integer;
  stamp timestamptz:=now(); day_utc date:=(now() at time zone 'UTC')::date;
  elapsed_seconds integer; counted_seconds integer; study_minutes integer; time_limit integer;
begin
  if p_user_id is null or p_attempt_id is null or p_answers is null
    or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>65536 then
    raise exception 'Invalid submission' using errcode='22023';
  end if;
  -- Actor lock protects aggregates across different attempts; attempt lock protects replay.
  perform pg_advisory_xact_lock(hashtextextended('sat-practice-completion:'||p_user_id::text,0));
  select * into a from public.sat_practice_lab_attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found then raise exception 'Attempt not found' using errcode='P0002'; end if;
  if exists(select 1 from jsonb_object_keys(p_answers) k where not(k=any(a.question_ids::text[]))) then
    raise exception 'Answer does not belong to this attempt' using errcode='22023';
  end if;
  if a.status='scored' then
    if a.answers is distinct from p_answers then
      raise exception 'This drill was already submitted with different answers' using errcode='23505';
    end if;
    select r.result into result from public.sat_practice_attempt_results r where r.attempt_id=a.id and r.user_id=p_user_id;
    -- Historical completions must never be reprocessed or rewarded again.
    return coalesce(result,jsonb_build_object('attempt',to_jsonb(a),'questions',null,'notebook','[]'::jsonb,'legacy_result',true));
  end if;
  if a.status not in ('in_progress','submitted') then
    raise exception 'This drill cannot be submitted' using errcode='23505';
  end if;
  n:=cardinality(a.question_ids);
  if n not between 1 and 100 or (select count(distinct id) from unnest(a.question_ids) id)<>n
    or p_questions is null or jsonb_typeof(p_questions)<>'array'
    or p_scored_items is null or jsonb_typeof(p_scored_items)<>'array' then
    raise exception 'Invalid question set' using errcode='22023';
  end if;
  if jsonb_array_length(p_questions)<>n or jsonb_array_length(p_scored_items)<>n then
    raise exception 'The complete question set is required' using errcode='22023';
  end if;
  if a.session_id is not null then
    perform 1 from public.sessions where id=a.session_id and user_id=p_user_id
      and metadata->>'mode'='sat_practice_lab' for update;
    if not found then raise exception 'Invalid drill session' using errcode='22023'; end if;
  end if;
  for i in 0..n-1 loop
    q:=p_questions->i; item:=p_scored_items->i; answer:=coalesce(p_answers->a.question_ids[i+1]::text,'null'::jsonb);
    if q->>'id' is distinct from a.question_ids[i+1]::text
      or item->>'question_id' is distinct from a.question_ids[i+1]::text
      or jsonb_typeof(item->'correct') is distinct from 'boolean'
      or item->'answer' is distinct from answer or item->'expected' is distinct from q->'correct'
      or q->'correct' is null or q->'correct'='null'::jsonb
      or coalesce(q->>'section_type','') not in ('reading_writing','math')
      or coalesce(q->>'difficulty','') not in ('easy','medium','hard')
      or coalesce(q->>'domain','') not in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig')
      or coalesce(q->>'type','')='' or jsonb_typeof(q->'data') is distinct from 'object' then
      raise exception 'Invalid scored question' using errcode='22023';
    end if;
    was_correct:=(item->>'correct')::boolean;
    if was_correct then correct_count:=correct_count+1; end if;
    select * into m from public.sat_practice_mastery where user_id=p_user_id
      and section_type=q->>'section_type' and domain=q->>'domain' and difficulty=q->>'difficulty';
    rolling:=case when m.rolling_accuracy is null then case when was_correct then 1 else 0 end
      else m.rolling_accuracy*0.7+(case when was_correct then 0.3 else 0 end) end;
    level:=round(rolling*0.75+least(1,(coalesce(m.attempts,0)+1)::numeric/12)*0.25,3);
    insert into public.sat_practice_mastery(user_id,section_type,domain,difficulty,attempts,rolling_accuracy,last_accuracy,mastery_status,mastery_level,last_practiced_at,updated_at)
      values(p_user_id,q->>'section_type',q->>'domain',q->>'difficulty',coalesce(m.attempts,0)+1,round(rolling,3),case when was_correct then 1 else 0 end,
        case when level>=0.9 then 'mastered' when level>=0.72 then 'stable' when level>=0.48 then 'building' when level>0 then 'weak' else 'new' end,level,stamp,stamp)
      on conflict(user_id,section_type,domain,difficulty) do update set
        attempts=excluded.attempts,rolling_accuracy=excluded.rolling_accuracy,last_accuracy=excluded.last_accuracy,
        mastery_status=excluded.mastery_status,mastery_level=excluded.mastery_level,last_practiced_at=stamp,updated_at=stamp;
    select * into s from public.sat_practice_srs_queue where user_id=p_user_id and question_id=a.question_ids[i+1];
    box:=case when was_correct then least(5,coalesce(s.leitner_box,1)+1) else 1 end;
    interval_days:=(array[1,2,4,8,16])[box];
    insert into public.sat_practice_srs_queue(user_id,question_id,leitner_box,interval_days,next_review_at,last_reviewed_at,correct_count,incorrect_count,updated_at)
      values(p_user_id,a.question_ids[i+1],box,interval_days,stamp+make_interval(days=>interval_days),stamp,
        coalesce(s.correct_count,0)+case when was_correct then 1 else 0 end,coalesce(s.incorrect_count,0)+case when was_correct then 0 else 1 end,stamp)
      on conflict(user_id,question_id) do update set leitner_box=excluded.leitner_box,interval_days=excluded.interval_days,
        next_review_at=excluded.next_review_at,last_reviewed_at=stamp,correct_count=excluded.correct_count,incorrect_count=excluded.incorrect_count,updated_at=stamp;
    if a.session_id is not null then
      insert into public.responses(session_id,content_unit_id,type,data,metadata)
        values(a.session_id,a.question_ids[i+1],q->>'type',case when jsonb_typeof(answer)='object' then answer else jsonb_build_object('value',answer) end,
          jsonb_build_object('source','sat_practice','attempt_id',a.id));
    end if;
    if not was_correct then
      insert into public.sat_practice_mistake_notebook(user_id,section_type,domain,difficulty,source,source_session_id,question_id,reason_tag,mistake_pattern,coach_note,status,next_review_at,last_seen_at)
        values(p_user_id,q->>'section_type',q->>'domain',q->>'difficulty','practice_lab',a.session_id,a.question_ids[i+1],'unknown',replace(q->>'domain','_',' ')||' miss',
          'Review the underlying concept, then retry a similar item.','active',stamp,stamp) returning to_jsonb(sat_practice_mistake_notebook.*) into mistake;
      notebook:=notebook||jsonb_build_array(mistake);
    end if;
  end loop;
  -- Real time between the server-recorded start and this completion. Idle time
  -- is ignored beyond four minutes per question (and a timed module's limit
  -- plus two minutes), so a drill left open overnight does not count as study.
  elapsed_seconds:=greatest(0,floor(extract(epoch from (stamp-a.started_at))))::integer;
  time_limit:=case when coalesce(a.filters_used->>'time_limit_seconds','') ~ '^[0-9]{1,5}$' then (a.filters_used->>'time_limit_seconds')::integer end;
  counted_seconds:=least(elapsed_seconds,n*240,coalesce(time_limit+120,n*240));
  study_minutes:=round(counted_seconds/60.0)::integer;
  insert into public.sat_practice_daily_activity(user_id,day,attempts,minutes_studied,xp_earned,updated_at)
    values(p_user_id,day_utc,1,study_minutes,correct_count*10+25,stamp)
    on conflict(user_id,day) do update set attempts=sat_practice_daily_activity.attempts+1,
      minutes_studied=sat_practice_daily_activity.minutes_studied+excluded.minutes_studied,
      xp_earned=sat_practice_daily_activity.xp_earned+excluded.xp_earned,updated_at=stamp;
  accuracy:=round(correct_count::numeric/n,3);
  update public.sat_practice_lab_attempts set answers=p_answers,scored_items=p_scored_items,submitted_at=stamp,
    scored_at=stamp,score_raw=correct_count,score_accuracy=accuracy,status='scored' where id=a.id returning * into a;
  if a.session_id is not null then
    update public.sessions set status='completed',completed_at=stamp where id=a.session_id and user_id=p_user_id;
  end if;
  if coalesce(a.filters_used->>'plan_item_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.sat_practice_plan_items set status='completed',completed_at=stamp,updated_at=stamp,
      payload=payload||jsonb_build_object('attempt_id',a.id,'score_raw',correct_count,'question_count',n)
      where id=(a.filters_used->>'plan_item_id')::uuid and user_id=p_user_id and status<>'completed';
  end if;
  result:=jsonb_build_object('attempt',to_jsonb(a),'questions',p_questions,'notebook',notebook,
    'timing',jsonb_build_object('elapsed_seconds',elapsed_seconds,'counted_seconds',counted_seconds,'study_minutes',study_minutes,'time_limit_seconds',time_limit));
  insert into public.sat_practice_attempt_results(attempt_id,user_id,result) values(a.id,p_user_id,result);
  return result;
end $$;
revoke all on function public.complete_sat_practice_attempt_v1(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

-- 6. Admin import and publishing (called only by admin-sat-practice after the
-- shared admin authorisation; never by browsers). Items are pre-validated rows
-- from _shared/sat-practice-content.ts toContentRows(); ids are deterministic
-- exactly as in the content migrations.
create or replace function public.admin_upsert_sat_practice_items(p_actor uuid,p_items jsonb,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  item jsonb; unit_id uuid; part uuid; section uuid; existing_part uuid; next_order integer;
  inserted integer:=0; updated integer:=0; meta jsonb;
  experience constant uuid:='d2f60197-eaa3-5772-88ac-b05d60f11bb5';
  rw_section constant uuid:='2dd5a6ad-d4e5-5141-982e-22469816765f';
  math_section constant uuid:='bee41358-7368-5bbb-bb76-e42afe3c1c44';
begin
  if p_actor is null or p_status not in ('draft','published') or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 2000 then
    raise exception 'Invalid import' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sat-practice-admin-import',0));
  if not exists(select 1 from public.sections where id=rw_section and experience_id=experience)
    or not exists(select 1 from public.sections where id=math_section and experience_id=experience) then
    raise exception 'SAT Practice sections missing' using errcode='P0002';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if coalesce(item->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(item->>'slug')>80
      or item->>'type' not in ('question_single_choice','question_spr')
      or jsonb_typeof(item->'data') is distinct from 'object' or jsonb_typeof(item->'metadata') is distinct from 'object'
      or jsonb_typeof(item->'correct') is distinct from 'object' or jsonb_typeof(item->'key_metadata') is distinct from 'object'
      or item->>'official_domain' not in ('information_and_ideas','craft_and_structure','expression_of_ideas','standard_english_conventions',
        'algebra','advanced_math','problem_solving_data_analysis','geometry_trigonometry') then
      raise exception 'Invalid import item' using errcode='22023';
    end if;
    section:=case when item->>'official_domain' in ('algebra','advanced_math','problem_solving_data_analysis','geometry_trigonometry') then math_section else rw_section end;
    part:=md5('schood-sat-part:'||(item->>'official_domain'))::uuid;
    insert into public.parts(id,section_id,name,display_order)
      values(part,section,coalesce(nullif(item->>'part_name',''),item->>'official_domain'),case item->>'official_domain'
        when 'information_and_ideas' then 10 when 'craft_and_structure' then 11 when 'expression_of_ideas' then 12 when 'standard_english_conventions' then 13
        when 'algebra' then 10 when 'advanced_math' then 11 when 'problem_solving_data_analysis' then 12 else 13 end)
      on conflict do nothing;
    if not exists(select 1 from public.parts where id=part and section_id=section) then
      raise exception 'The part for % could not be created', item->>'official_domain' using errcode='23505';
    end if;
    unit_id:=md5('schood-sat-q:'||(item->>'slug'))::uuid;
    meta:=(item->'metadata')||jsonb_build_object('content_status',p_status,'imported_by',p_actor,'imported_at',now());
    select u.part_id into existing_part from public.content_units u where u.id=unit_id;
    if found then
      if not exists(select 1 from public.parts p join public.sections s on s.id=p.section_id where p.id=existing_part and s.experience_id=experience) then
        raise exception 'Question % belongs to other content', item->>'slug' using errcode='23505';
      end if;
      update public.content_units set type=item->>'type',data=item->'data',metadata=coalesce(metadata,'{}'::jsonb)||meta where id=unit_id;
      updated:=updated+1;
    else
      -- Admin-authored units live above 100000 so they never take a display_order
      -- that a generated content migration (1..N per part) will insert later.
      select greatest(coalesce(max(display_order),0),100000)+1 into next_order from public.content_units where part_id=part;
      insert into public.content_units(id,part_id,type,data,display_order,metadata)
        values(unit_id,part,item->>'type',item->'data',next_order,meta);
      inserted:=inserted+1;
    end if;
    insert into public.answer_keys(content_unit_id,correct,metadata) values(unit_id,item->'correct',item->'key_metadata')
      on conflict(content_unit_id) do update set correct=excluded.correct,metadata=excluded.metadata;
  end loop;
  return jsonb_build_object('inserted',inserted,'updated',updated,'status',p_status);
end;
$$;
revoke all on function public.admin_upsert_sat_practice_items(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_upsert_sat_practice_items(uuid,jsonb,text) to service_role;

create or replace function public.admin_set_sat_practice_item_status(p_actor uuid,p_ids uuid[],p_status text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if p_actor is null or p_status not in ('draft','published','retired') or p_ids is null or cardinality(p_ids) not between 1 and 500 then
    raise exception 'Invalid status change' using errcode='22023';
  end if;
  update public.content_units u set metadata=coalesce(u.metadata,'{}'::jsonb)||jsonb_build_object('content_status',p_status,'status_changed_by',p_actor,'status_changed_at',now())
    from public.parts p join public.sections s on s.id=p.section_id
    where u.part_id=p.id and s.experience_id='d2f60197-eaa3-5772-88ac-b05d60f11bb5' and u.id=any(p_ids)
      and coalesce(u.metadata->>'content_status','published') is distinct from 'legacy_placeholder';
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function public.admin_set_sat_practice_item_status(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.admin_set_sat_practice_item_status(uuid,uuid[],text) to service_role;

create or replace function public.admin_list_sat_practice_items(p_status text,p_domain text,p_search text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare total integer; rows jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000
    or (p_status is not null and p_status not in ('draft','published','retired'))
    or (p_search is not null and length(p_search)>100) then
    raise exception 'Invalid list request' using errcode='22023';
  end if;
  with items as (
    select u.id,u.type,u.data,u.metadata,u.display_order,p.display_order as part_order,s.display_order as section_order,k.correct,k.metadata as key_metadata
    from public.content_units u join public.parts p on p.id=u.part_id join public.sections s on s.id=p.section_id
    left join public.answer_keys k on k.content_unit_id=u.id
    where s.experience_id='d2f60197-eaa3-5772-88ac-b05d60f11bb5' and u.type like 'question_%'
      and (p_status is null or coalesce(u.metadata->>'content_status','published')=p_status)
      and (p_domain is null or u.metadata->>'sat_official_domain'=p_domain or u.metadata->>'sat_domain'=p_domain)
      and (p_search is null or u.metadata->>'original_slug' ilike '%'||p_search||'%' or u.data->>'prompt' ilike '%'||p_search||'%')
  )
  select count(*)::integer, coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'data',x.data,'metadata',x.metadata,'correct',x.correct,
      'explanation',x.key_metadata->'feedback'->>'explanation') order by x.section_order,x.part_order,x.display_order)
    from (select * from items order by section_order,part_order,display_order limit p_limit offset p_offset) x),'[]'::jsonb)
  into total,rows from items;
  return jsonb_build_object('total',total,'items',rows);
end;
$$;
revoke all on function public.admin_list_sat_practice_items(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_list_sat_practice_items(text,text,text,integer,integer) to service_role;

notify pgrst,'reload schema';
commit;
