create or replace function public.admin_builder_estimate_unit_max_score(
  p_unit_type text,
  p_correct jsonb
)
returns integer
language plpgsql
stable
as $$
declare
  v_type text := lower(coalesce(p_unit_type, ''));
begin
  if p_correct is null or jsonb_typeof(p_correct) <> 'object' then
    return 0;
  end if;

  if v_type = 'question_single_choice' then
    return case when coalesce(nullif(p_correct->>'option_id', ''), '') <> '' then 1 else 0 end;
  end if;

  if v_type = 'question_multi_choice' then
    return case when jsonb_typeof(p_correct->'option_ids') = 'array' and jsonb_array_length(p_correct->'option_ids') > 0 then 1 else 0 end;
  end if;

  if v_type = 'question_text' then
    return case
      when jsonb_typeof(p_correct->'answers') = 'array' and jsonb_array_length(p_correct->'answers') > 0 then 1
      when coalesce(nullif(p_correct->>'answer', ''), '') <> '' then 1
      else 0
    end;
  end if;

  if v_type in (
    'question_matching',
    'question_matching_headings',
    'question_sentence_endings',
    'question_true_false_not_given',
    'question_yes_no_not_given'
  ) then
    return case
      when jsonb_typeof(p_correct->'matches') = 'object' then (
        select count(*)::integer
        from jsonb_object_keys(p_correct->'matches')
      )
      else 0
    end;
  end if;

  if v_type in ('question_gap_fill', 'question_select_from_list') then
    return case
      when jsonb_typeof(p_correct->'blanks') = 'object' then (
        select count(*)::integer
        from jsonb_object_keys(p_correct->'blanks')
      )
      else 0
    end;
  end if;

  if v_type = 'question_table_completion' then
    return case
      when jsonb_typeof(p_correct->'cells') = 'object' then (
        select count(*)::integer
        from jsonb_object_keys(p_correct->'cells')
      )
      else 0
    end;
  end if;

  if v_type = 'question_diagram_labeling' then
    return case
      when jsonb_typeof(p_correct->'labels') = 'object' then (
        select count(*)::integer
        from jsonb_object_keys(p_correct->'labels')
      )
      else 0
    end;
  end if;

  if v_type = 'question_drag_drop' then
    return case
      when jsonb_typeof(p_correct->'targets') = 'object' then (
        select count(*)::integer
        from jsonb_object_keys(p_correct->'targets')
      )
      else 0
    end;
  end if;

  return 0;
end;
$$;

create or replace function public.admin_rate_limit_consume(
  p_user_id uuid,
  p_route_key text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns table(allowed boolean, request_count integer, window_started_at timestamptz, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_secs integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / v_window_secs) * v_window_secs
  );

  insert into public.admin_api_rate_limits (user_id, route_key, window_started_at, request_count)
  values (p_user_id, p_route_key, v_window_start, 1)
  on conflict on constraint admin_api_rate_limits_pkey
  do update
    set request_count = public.admin_api_rate_limits.request_count + 1,
        updated_at = now()
  returning public.admin_api_rate_limits.request_count into v_count;

  return query
  select
    (v_count <= v_limit) as allowed,
    v_count as request_count,
    v_window_start as window_started_at,
    (v_window_start + make_interval(secs => v_window_secs)) as reset_at;
end;
$$;
