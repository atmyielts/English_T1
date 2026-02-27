-- ============================================================================
-- Publish gate compatibility for external media providers (S3)
-- - Keep strict checks for Supabase Storage buckets
-- - For external buckets, validate reference presence but skip storage.objects lookup
-- ============================================================================

create or replace function public.admin_builder_assert_publish_ready_experience(
  p_experience_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
  v_unit record;
  v_type text;
  v_duration_seconds integer;
  v_section_max integer;
  v_unit_max integer;
  v_has_questions boolean;
  v_has_writing_prompt boolean;
  v_bucket text;
  v_path text;
  v_url text;
  v_is_supabase_bucket boolean;
begin
  if p_experience_id is null then
    raise exception 'Publish gate: experience_id is required';
  end if;

  if not exists (select 1 from public.experiences where id = p_experience_id) then
    raise exception 'Publish gate: experience not found';
  end if;

  for v_section in
    select s.id, s.name, coalesce(s.metadata, '{}'::jsonb) as metadata
    from public.sections s
    where s.experience_id = p_experience_id
    order by s.display_order
  loop
    v_type := lower(coalesce(v_section.metadata->>'type', ''));
    if v_type not in ('listening', 'reading', 'writing') then
      raise exception 'Publish gate: section "%" is missing a valid type', coalesce(v_section.name, v_section.id::text);
    end if;

    v_duration_seconds := nullif(v_section.metadata->>'duration_seconds', '')::integer;
    if coalesce(v_duration_seconds, 0) <= 0 then
      raise exception 'Publish gate: section "%" has no valid duration', coalesce(v_section.name, v_section.id::text);
    end if;

    v_section_max := 0;
    v_has_questions := false;
    v_has_writing_prompt := false;

    for v_unit in
      select
        cu.id,
        lower(coalesce(cu.type, '')) as unit_type,
        coalesce(cu.data, '{}'::jsonb) as data,
        ak.correct
      from public.parts p
      join public.content_units cu on cu.part_id = p.id
      left join public.answer_keys ak on ak.content_unit_id = cu.id
      where p.section_id = v_section.id
      order by p.display_order, cu.display_order
    loop
      if v_unit.unit_type like 'question_%' then
        v_has_questions := true;
      end if;

      if v_type = 'writing' and v_unit.unit_type = 'question_text' then
        v_has_writing_prompt := true;
      end if;

      if v_type in ('listening', 'reading') and v_unit.unit_type like 'question_%' then
        if v_unit.correct is null or jsonb_typeof(v_unit.correct) <> 'object' then
          raise exception 'Publish gate: section "%" has missing answer key for unit %', coalesce(v_section.name, v_section.id::text), v_unit.id;
        end if;

        v_unit_max := public.admin_builder_estimate_unit_max_score(v_unit.unit_type, v_unit.correct);
        if v_unit_max <= 0 then
          raise exception 'Publish gate: section "%" has invalid answer key for unit %', coalesce(v_section.name, v_section.id::text), v_unit.id;
        end if;
        v_section_max := v_section_max + v_unit_max;
      end if;

      if v_unit.unit_type = 'audio' then
        v_url := coalesce(v_unit.data->>'url', '');
        if length(trim(v_url)) = 0 then
          v_bucket := coalesce(v_unit.data#>>'{storage,bucket}', '');
          v_path := coalesce(v_unit.data#>>'{storage,path}', '');
          if v_bucket = '' or v_path = '' then
            raise exception 'Publish gate: audio unit % is missing storage reference', v_unit.id;
          end if;

          select exists (select 1 from storage.buckets b where b.id = v_bucket)
            into v_is_supabase_bucket;

          if v_is_supabase_bucket and not exists (
            select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = v_path
          ) then
            raise exception 'Publish gate: audio file missing for unit % (%/%)', v_unit.id, v_bucket, v_path;
          end if;
        end if;
      end if;

      if v_unit.unit_type = 'image' then
        v_url := coalesce(v_unit.data->>'url', '');
        if length(trim(v_url)) = 0 then
          v_bucket := coalesce(v_unit.data#>>'{storage,bucket}', '');
          v_path := coalesce(v_unit.data#>>'{storage,path}', '');
          if v_bucket = '' or v_path = '' then
            raise exception 'Publish gate: image unit % is missing storage reference', v_unit.id;
          end if;

          select exists (select 1 from storage.buckets b where b.id = v_bucket)
            into v_is_supabase_bucket;

          if v_is_supabase_bucket and not exists (
            select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = v_path
          ) then
            raise exception 'Publish gate: image file missing for unit % (%/%)', v_unit.id, v_bucket, v_path;
          end if;
        end if;
      end if;

      if v_unit.unit_type = 'question_diagram_labeling' then
        v_url := coalesce(v_unit.data#>>'{image,url}', '');
        if length(trim(v_url)) = 0 then
          v_bucket := coalesce(v_unit.data#>>'{image,storage,bucket}', '');
          v_path := coalesce(v_unit.data#>>'{image,storage,path}', '');
          if v_bucket = '' or v_path = '' then
            raise exception 'Publish gate: diagram unit % is missing image storage reference', v_unit.id;
          end if;

          select exists (select 1 from storage.buckets b where b.id = v_bucket)
            into v_is_supabase_bucket;

          if v_is_supabase_bucket and not exists (
            select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = v_path
          ) then
            raise exception 'Publish gate: diagram image missing for unit % (%/%)', v_unit.id, v_bucket, v_path;
          end if;
        end if;
      end if;
    end loop;

    if not v_has_questions then
      raise exception 'Publish gate: section "%" has no question units', coalesce(v_section.name, v_section.id::text);
    end if;

    if v_type in ('listening', 'reading') and v_section_max <> 40 then
      raise exception 'Publish gate: section "%" max score is %, expected 40', coalesce(v_section.name, v_section.id::text), v_section_max;
    end if;

    if v_type = 'writing' and not v_has_writing_prompt then
      raise exception 'Publish gate: section "%" has no writing prompt (question_text)', coalesce(v_section.name, v_section.id::text);
    end if;
  end loop;
end;
$$;

grant execute on function public.admin_builder_assert_publish_ready_experience(uuid) to service_role;
