-- Filter the entire published bank before limiting. Answer keys and actor-scoped
-- learning history are available only to the Edge service, never directly to browsers.
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
    select u.*, k.correct,
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
    join public.answer_keys k on k.content_unit_id = u.id
    where e.metadata->>'format' = 'sat_practice_bank'
      and (e.is_active or p_include_retired)
      and u.type like 'question_%' and jsonb_typeof(u.data) = 'object'
      and k.correct is not null and k.correct <> 'null'::jsonb
      and (p_question_ids is null or u.id = any(p_question_ids))
      and (p_include_retired or coalesce(u.metadata->>'content_status','published') not in ('retired','legacy_placeholder'))
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
  order by n.priority,n.experience_order,n.section_order,n.part_order,n.display_order,n.id
  limit p_limit;
end;
$$;

revoke all on function public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean) from public,anon,authenticated;
grant execute on function public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean) to service_role;

-- Skip unavailable/retired items before the due-page limit as well, so an old
-- queue cannot hide later usable reviews. The private key is stripped at the Edge.
create function public.select_sat_practice_due_questions(p_user_id uuid)
returns setof jsonb language sql security definer set search_path = public, pg_temp as $$
  select to_jsonb(q) || jsonb_build_object('question',question)
  from public.sat_practice_srs_queue q
  cross join lateral public.select_sat_practice_questions(
    p_user_id,null,null,null,null,array[q.question_id],1,false
  ) question
  where q.user_id = p_user_id and q.next_review_at <= now()
  order by q.next_review_at,q.id
  limit 20;
$$;
revoke all on function public.select_sat_practice_due_questions(uuid) from public,anon,authenticated;
grant execute on function public.select_sat_practice_due_questions(uuid) to service_role;
