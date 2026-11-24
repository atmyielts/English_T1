-- Keep SAT Short Sets out of automatic practice while allowing explicit IDs.
-- This migration contains no private content. It extends the existing v2 selectors.
begin;
set local lock_timeout = '5s';

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
      and (p_question_ids is not null or coalesce(u.metadata->>'sat_practice_short_set_only','false') <> 'true')
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
      and coalesce(u.metadata->>'sat_practice_short_set_only','false') <> 'true'
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

-- A set is one transaction. If an item vanishes between listing and start,
-- the regular start's writes roll back instead of leaving a partial checkpoint.
create or replace function public.start_sat_practice_short_set_attempt(
  p_user_id uuid,p_request_id uuid,p_filters jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  started jsonb;
begin
  if jsonb_typeof(p_filters->'question_ids') is distinct from 'array' then
    raise exception 'Short set requires explicit question IDs' using errcode='22023';
  end if;
  started:=public.start_sat_practice_attempt(p_user_id,p_request_id,p_filters);
  if started->'attempt'->'question_ids' is distinct from p_filters->'question_ids' then
    raise exception 'Short set is no longer complete' using errcode='P0001';
  end if;
  return started;
end;
$$;
revoke all on function public.start_sat_practice_short_set_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_sat_practice_short_set_attempt(uuid,uuid,jsonb) to service_role;

commit;
