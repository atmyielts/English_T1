-- SAT admin-builder hardening:
-- 1) allow SAT section types in section templates
-- 2) make publish gate validation SAT-aware (reading_writing/math)

alter table public.section_templates
  drop constraint if exists section_templates_type_chk;

alter table public.section_templates
  add constraint section_templates_type_chk
  check (lower(section_type) in ('listening', 'reading', 'writing', 'reading_writing', 'math'));

create or replace function public.admin_section_template_upsert(
  p_product_id uuid,
  p_template_name text,
  p_section_type text,
  p_section_payload jsonb,
  p_actor uuid,
  p_template_id uuid default null,
  p_source_snapshot_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_template_name text;
  v_section_type text;
  v_next_version integer;
  v_version_id uuid;
begin
  if p_product_id is null then
    raise exception 'product_id is required';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'Invalid product_id (product not found)';
  end if;

  v_template_name := trim(coalesce(p_template_name, ''));
  if v_template_name = '' then
    raise exception 'template_name is required';
  end if;

  v_section_type := lower(trim(coalesce(p_section_type, '')));
  if v_section_type not in ('listening', 'reading', 'writing', 'reading_writing', 'math') then
    raise exception 'section_type must be one of listening|reading|writing|reading_writing|math';
  end if;

  if p_section_payload is null or jsonb_typeof(p_section_payload) <> 'object' then
    raise exception 'section_payload must be a JSON object';
  end if;

  if jsonb_typeof(p_section_payload->'parts') <> 'array' or jsonb_array_length(p_section_payload->'parts') = 0 then
    raise exception 'section_payload.parts must be a non-empty array';
  end if;

  if p_source_snapshot_id is not null and not exists (
    select 1 from public.experience_snapshots s where s.id = p_source_snapshot_id
  ) then
    raise exception 'source_snapshot_id not found';
  end if;

  if p_template_id is null then
    insert into public.section_templates (
      product_id,
      name,
      section_type,
      latest_version,
      metadata,
      created_by
    ) values (
      p_product_id,
      v_template_name,
      v_section_type,
      0,
      '{}'::jsonb,
      p_actor
    ) returning id into v_template_id;

    v_next_version := 1;
  else
    select st.id, coalesce(st.latest_version, 0) + 1
      into v_template_id, v_next_version
    from public.section_templates st
    where st.id = p_template_id
      and st.product_id = p_product_id
    for update;

    if not found then
      raise exception 'template_id not found for this product';
    end if;

    update public.section_templates
      set name = v_template_name,
          section_type = v_section_type
    where id = v_template_id;
  end if;

  insert into public.section_template_versions (
    template_id,
    version,
    section_payload,
    source_snapshot_id,
    created_by
  ) values (
    v_template_id,
    v_next_version,
    p_section_payload,
    p_source_snapshot_id,
    p_actor
  ) returning id into v_version_id;

  update public.section_templates
    set latest_version = v_next_version,
        updated_at = now()
  where id = v_template_id;

  return jsonb_build_object(
    'template_id', v_template_id,
    'template_name', v_template_name,
    'section_type', v_section_type,
    'version', v_next_version,
    'template_version_id', v_version_id,
    'source_snapshot_id', p_source_snapshot_id
  );
end;
$$;

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
    if v_type not in ('listening', 'reading', 'writing', 'reading_writing', 'math') then
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

      if v_type in ('listening', 'reading', 'reading_writing', 'math') and v_unit.unit_type like 'question_%' then
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

    -- IELTS reading/listening stay on 40-point calibrated sections.
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
