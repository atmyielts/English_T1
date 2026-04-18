-- Launch iTEP simulator product, flagship family content, and future-ready admin support.

alter table public.section_templates
  drop constraint if exists section_templates_type_chk;

alter table public.section_templates
  add constraint section_templates_type_chk
  check (lower(section_type) in ('listening', 'reading', 'grammar', 'writing', 'speaking', 'reading_writing', 'math'));

alter table public.part_templates
  drop constraint if exists part_templates_module_type_chk;

alter table public.part_templates
  add constraint part_templates_module_type_chk
  check (lower(module_type) in ('listening', 'reading', 'grammar', 'writing', 'speaking'));

create or replace function public.admin_section_template_upsert(
  p_product_id uuid,
  p_template_name text,
  p_template_key text,
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
  v_template_key text;
  v_base_key text;
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
  if v_section_type not in ('listening', 'reading', 'grammar', 'writing', 'speaking', 'reading_writing', 'math') then
    raise exception 'section_type must be one of listening|reading|grammar|writing|speaking|reading_writing|math';
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

  v_base_key := coalesce(
    nullif(public.admin_template_slug(p_template_key), ''),
    nullif(public.admin_template_slug(v_template_name), ''),
    'section-template'
  );
  v_template_key := v_base_key;

  if p_template_id is null then
    while exists (
      select 1
      from public.section_templates st
      where st.product_id = p_product_id
        and st.template_key = v_template_key
    ) loop
      v_template_key := concat(v_base_key, '-', substr(md5(gen_random_uuid()::text), 1, 6));
    end loop;

    insert into public.section_templates (
      product_id,
      name,
      template_key,
      section_type,
      latest_version,
      metadata,
      created_by
    ) values (
      p_product_id,
      v_template_name,
      v_template_key,
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

    while exists (
      select 1
      from public.section_templates st
      where st.product_id = p_product_id
        and st.template_key = v_template_key
        and st.id <> v_template_id
    ) loop
      v_template_key := concat(v_base_key, '-', substr(md5(gen_random_uuid()::text), 1, 6));
    end loop;

    update public.section_templates
      set name = v_template_name,
          template_key = v_template_key,
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
    'template_key', v_template_key,
    'template_name', v_template_name,
    'section_type', v_section_type,
    'version', v_next_version,
    'template_version_id', v_version_id,
    'source_snapshot_id', p_source_snapshot_id
  );
end;
$$;

create or replace function public.admin_part_template_upsert(
  p_product_id uuid,
  p_template_name text,
  p_template_key text,
  p_module_type text,
  p_part_payload jsonb,
  p_actor uuid,
  p_template_id uuid default null,
  p_source_section_template_version_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_template_name text;
  v_template_key text;
  v_base_key text;
  v_module_type text;
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

  v_module_type := lower(trim(coalesce(p_module_type, '')));
  if v_module_type not in ('listening', 'reading', 'grammar', 'writing', 'speaking') then
    raise exception 'module_type must be one of listening|reading|grammar|writing|speaking';
  end if;

  if p_part_payload is null or jsonb_typeof(p_part_payload) <> 'object' then
    raise exception 'part_payload must be a JSON object';
  end if;

  if jsonb_typeof(p_part_payload->'content_units') <> 'array' or jsonb_array_length(p_part_payload->'content_units') = 0 then
    raise exception 'part_payload.content_units must be a non-empty array';
  end if;

  if p_source_section_template_version_id is not null and not exists (
    select 1 from public.section_template_versions stv where stv.id = p_source_section_template_version_id
  ) then
    raise exception 'source_section_template_version_id not found';
  end if;

  v_base_key := coalesce(
    nullif(public.admin_template_slug(p_template_key), ''),
    nullif(public.admin_template_slug(v_template_name), ''),
    'part-template'
  );
  v_template_key := v_base_key;

  if p_template_id is null then
    while exists (
      select 1
      from public.part_templates pt
      where pt.product_id = p_product_id
        and pt.template_key = v_template_key
    ) loop
      v_template_key := concat(v_base_key, '-', substr(md5(gen_random_uuid()::text), 1, 6));
    end loop;

    insert into public.part_templates (
      product_id,
      name,
      template_key,
      module_type,
      latest_version,
      metadata,
      created_by
    ) values (
      p_product_id,
      v_template_name,
      v_template_key,
      v_module_type,
      0,
      '{}'::jsonb,
      p_actor
    ) returning id into v_template_id;

    v_next_version := 1;
  else
    select pt.id, coalesce(pt.latest_version, 0) + 1
      into v_template_id, v_next_version
    from public.part_templates pt
    where pt.id = p_template_id
      and pt.product_id = p_product_id
    for update;

    if not found then
      raise exception 'template_id not found for this product';
    end if;

    while exists (
      select 1
      from public.part_templates pt
      where pt.product_id = p_product_id
        and pt.template_key = v_template_key
        and pt.id <> v_template_id
    ) loop
      v_template_key := concat(v_base_key, '-', substr(md5(gen_random_uuid()::text), 1, 6));
    end loop;

    update public.part_templates
      set name = v_template_name,
          template_key = v_template_key,
          module_type = v_module_type
    where id = v_template_id;
  end if;

  insert into public.part_template_versions (
    template_id,
    version,
    part_payload,
    source_section_template_version_id,
    created_by
  ) values (
    v_template_id,
    v_next_version,
    p_part_payload,
    p_source_section_template_version_id,
    p_actor
  ) returning id into v_version_id;

  update public.part_templates
    set latest_version = v_next_version,
        updated_at = now()
  where id = v_template_id;

  return jsonb_build_object(
    'template_id', v_template_id,
    'template_key', v_template_key,
    'template_name', v_template_name,
    'module_type', v_module_type,
    'version', v_next_version,
    'template_version_id', v_version_id,
    'source_section_template_version_id', p_source_section_template_version_id
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
  v_product_slug text := '';
  v_itep_variant text := '';
  v_itep_content_format text := '';
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
  v_section_count integer := 0;
  v_listening_sections integer := 0;
  v_reading_sections integer := 0;
  v_grammar_sections integer := 0;
  v_writing_sections integer := 0;
  v_speaking_sections integer := 0;
  v_part_count integer := 0;
begin
  if p_experience_id is null then
    raise exception 'Publish gate: experience_id is required';
  end if;

  select
    lower(coalesce(p.metadata->>'slug', '')),
    lower(coalesce(e.metadata->>'variant', '')),
    lower(coalesce(e.metadata->>'content_format', ''))
  into v_product_slug, v_itep_variant, v_itep_content_format
  from public.experiences e
  join public.products p on p.id = e.product_id
  where e.id = p_experience_id;

  if not exists (select 1 from public.experiences where id = p_experience_id) then
    raise exception 'Publish gate: experience not found';
  end if;

  for v_section in
    select s.id, s.name, coalesce(s.metadata, '{}'::jsonb) as metadata
    from public.sections s
    where s.experience_id = p_experience_id
    order by s.display_order
  loop
    v_section_count := v_section_count + 1;
    v_type := lower(coalesce(v_section.metadata->>'type', ''));
    if v_type not in ('listening', 'reading', 'grammar', 'writing', 'speaking', 'reading_writing', 'math') then
      raise exception 'Publish gate: section "%" is missing a valid type', coalesce(v_section.name, v_section.id::text);
    end if;

    if v_type = 'listening' then
      v_listening_sections := v_listening_sections + 1;
    elsif v_type = 'reading' then
      v_reading_sections := v_reading_sections + 1;
    elsif v_type = 'grammar' then
      v_grammar_sections := v_grammar_sections + 1;
    elsif v_type = 'writing' then
      v_writing_sections := v_writing_sections + 1;
    elsif v_type = 'speaking' then
      v_speaking_sections := v_speaking_sections + 1;
    end if;

    if v_product_slug = 'itep-simulator' and v_type = 'speaking' then
      raise exception 'Publish gate: speaking is foundation-only and cannot be published yet';
    end if;

    v_duration_seconds := nullif(v_section.metadata->>'duration_seconds', '')::integer;
    if coalesce(v_duration_seconds, 0) <= 0 then
      raise exception 'Publish gate: section "%" has no valid duration', coalesce(v_section.name, v_section.id::text);
    end if;

    select count(*)
      into v_part_count
    from public.parts p
    where p.section_id = v_section.id;

    if v_product_slug = 'ielts-academic-simulator' then
      if v_type = 'listening' and v_part_count <> 4 then
        raise exception 'Publish gate: listening section "%" must have exactly 4 parts', coalesce(v_section.name, v_section.id::text);
      end if;
      if v_type = 'reading' and v_part_count <> 3 then
        raise exception 'Publish gate: reading section "%" must have exactly 3 passages', coalesce(v_section.name, v_section.id::text);
      end if;
      if v_type = 'writing' and v_part_count <> 2 then
        raise exception 'Publish gate: writing section "%" must have exactly 2 tasks', coalesce(v_section.name, v_section.id::text);
      end if;
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

      if v_type in ('listening', 'reading', 'grammar', 'reading_writing', 'math') and v_unit.unit_type like 'question_%' then
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

    if v_type in ('listening', 'reading') and v_product_slug = 'ielts-academic-simulator' and v_section_max <> 40 then
      raise exception 'Publish gate: section "%" max score is %, expected 40', coalesce(v_section.name, v_section.id::text), v_section_max;
    end if;

    if v_product_slug = 'itep-simulator' then
      if v_type = 'reading' and v_section_max <> 10 then
        raise exception 'Publish gate: iTEP reading section "%" must total 10 scored items', coalesce(v_section.name, v_section.id::text);
      end if;
      if v_type = 'listening' and v_section_max <> 14 then
        raise exception 'Publish gate: iTEP listening section "%" must total 14 scored items', coalesce(v_section.name, v_section.id::text);
      end if;
      if v_type = 'grammar' and v_section_max <> 25 then
        raise exception 'Publish gate: iTEP grammar section "%" must total 25 scored items', coalesce(v_section.name, v_section.id::text);
      end if;
    end if;

    if v_type = 'writing' and not v_has_writing_prompt then
      raise exception 'Publish gate: section "%" has no writing prompt (question_text)', coalesce(v_section.name, v_section.id::text);
    end if;
  end loop;

  if v_product_slug = 'ielts-academic-simulator' then
    if v_section_count <> 3 then
      raise exception 'Publish gate: IELTS mock tests must contain exactly 3 sections';
    end if;
    if v_listening_sections <> 1 or v_reading_sections <> 1 or v_writing_sections <> 1 then
      raise exception 'Publish gate: IELTS mock tests must contain exactly one Listening, one Reading, and one Writing section';
    end if;
  end if;

  if v_product_slug = 'itep-simulator' then
    if v_itep_content_format <> 'itep.content.v1' then
      raise exception 'Publish gate: iTEP experiences must declare content_format=itep.content.v1';
    end if;

    if v_itep_variant = 'core' then
      if v_section_count <> 3 then
        raise exception 'Publish gate: iTEP Core experiences must contain exactly 3 sections';
      end if;
      if v_reading_sections <> 1 or v_listening_sections <> 1 or v_grammar_sections <> 1 or v_writing_sections <> 0 or v_speaking_sections <> 0 then
        raise exception 'Publish gate: iTEP Core must contain one Reading, one Listening, and one Grammar section only';
      end if;
    elsif v_itep_variant = 'writing_live' then
      if v_section_count <> 1 or v_writing_sections <> 1 or v_reading_sections <> 0 or v_listening_sections <> 0 or v_grammar_sections <> 0 or v_speaking_sections <> 0 then
        raise exception 'Publish gate: iTEP Writing Live must contain one Writing section only';
      end if;
    else
      raise exception 'Publish gate: iTEP experiences must declare a supported variant (core or writing_live)';
    end if;
  end if;
end;
$$;

grant execute on function public.admin_section_template_upsert(uuid, text, text, text, jsonb, uuid, uuid, uuid) to service_role;
grant execute on function public.admin_part_template_upsert(uuid, text, text, text, jsonb, uuid, uuid, uuid) to service_role;
grant execute on function public.admin_builder_assert_publish_ready_experience(uuid) to service_role;

do $seed$
declare
  target_product_id constant uuid := 'a6c7887c-633c-4d88-8b70-397ed04dbbb1';
  starter_plan_id constant uuid := '75d44294-6ec6-4656-bff4-2c9db8630257';
  monthly_plan_id constant uuid := '362f1269-dc3e-4aac-b231-d9beec8ddee4';
  academic_core_id constant uuid := '2ff49733-c26c-4b5e-87e8-c12052c02c15';
  academic_writing_live_id constant uuid := '1a2ed890-2bd0-4e37-91f7-31b7a85553b3';
  slate_core_id constant uuid := '1271f66c-0412-43ef-b5f3-e600d2962d41';
  slate_writing_live_id constant uuid := '673de4f1-c97a-4d2d-8d30-de37689cfb75';
  business_core_id constant uuid := 'dda21573-ecb6-4bb4-a44a-211f158e57c2';
  business_writing_live_id constant uuid := '320fc572-30de-494e-8d31-4755782d81ff';

  resolved_product_id uuid;
  localhost_pattern constant text := '^https?://(localhost|127\.0\.0\.1)(:\d+)?(/|$)';
  exp_id uuid;
  section_id uuid;
  part_id uuid;
  unit_id uuid;
  family_index integer;
  family_slug text;
  family_label text;
  core_name text;
  writing_name text;
  reading_part1_title text;
  reading_part1_text text;
  reading_part2_title text;
  reading_part2_text text;
  reading_part1_questions jsonb;
  reading_part2_questions jsonb;
  listening_part1_url text;
  listening_part2_url text;
  listening_part3_url text;
  listening_part1_questions jsonb;
  listening_part2_questions jsonb;
  listening_part3_questions jsonb;
  writing_task_1_prompt text;
  writing_task_2_prompt text;
  completion_questions jsonb := $$[
    {"prompt":"The committee ___ its recommendation before the deadline.","options":[{"id":"A","label":"submit"},{"id":"B","label":"submitted"},{"id":"C","label":"will submitted"},{"id":"D","label":"submitting"}],"correct":"B"},
    {"prompt":"By the time we arrived, the technician ___ the system restart.","options":[{"id":"A","label":"finished"},{"id":"B","label":"has finished"},{"id":"C","label":"had finished"},{"id":"D","label":"finishes"}],"correct":"C"},
    {"prompt":"Each of the new interns ___ responsible for updating one client file.","options":[{"id":"A","label":"are"},{"id":"B","label":"were"},{"id":"C","label":"is"},{"id":"D","label":"be"}],"correct":"C"},
    {"prompt":"The teacher asked us to hand in the forms ___ Friday afternoon.","options":[{"id":"A","label":"at"},{"id":"B","label":"by"},{"id":"C","label":"for"},{"id":"D","label":"into"}],"correct":"B"},
    {"prompt":"Neither the manager nor the assistants ___ available for the late call.","options":[{"id":"A","label":"was"},{"id":"B","label":"were"},{"id":"C","label":"is"},{"id":"D","label":"be"}],"correct":"B"},
    {"prompt":"If the weather improves, the class ___ the experiment outdoors.","options":[{"id":"A","label":"conducts"},{"id":"B","label":"conducted"},{"id":"C","label":"will conduct"},{"id":"D","label":"has conducted"}],"correct":"C"},
    {"prompt":"The report was useful because it explained the problem ___ examples.","options":[{"id":"A","label":"through"},{"id":"B","label":"with"},{"id":"C","label":"over"},{"id":"D","label":"between"}],"correct":"B"},
    {"prompt":"Students should check their work carefully so they can avoid ___ mistakes.","options":[{"id":"A","label":"make"},{"id":"B","label":"made"},{"id":"C","label":"making"},{"id":"D","label":"to make"}],"correct":"C"},
    {"prompt":"The conference room, along with the projector, ___ reserved for tomorrow morning.","options":[{"id":"A","label":"is"},{"id":"B","label":"are"},{"id":"C","label":"were"},{"id":"D","label":"have been"}],"correct":"A"},
    {"prompt":"I would have replied earlier if I ___ your message last night.","options":[{"id":"A","label":"see"},{"id":"B","label":"saw"},{"id":"C","label":"had seen"},{"id":"D","label":"have seen"}],"correct":"C"},
    {"prompt":"The students were excited ___ the chance to present their design.","options":[{"id":"A","label":"about"},{"id":"B","label":"for"},{"id":"C","label":"with"},{"id":"D","label":"by"}],"correct":"A"},
    {"prompt":"Please keep the receipt in case the device needs to be ___ later.","options":[{"id":"A","label":"returned"},{"id":"B","label":"returning"},{"id":"C","label":"return"},{"id":"D","label":"returns"}],"correct":"A"},
    {"prompt":"The director suggested that the team ___ the proposal before noon.","options":[{"id":"A","label":"reviews"},{"id":"B","label":"review"},{"id":"C","label":"reviewed"},{"id":"D","label":"has reviewed"}],"correct":"B"}
  ]$$::jsonb;
  error_questions jsonb := $$[
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: The students"},{"id":"B","label":"B: was waiting"},{"id":"C","label":"C: outside the hall"},{"id":"D","label":"D: after lunch"}],"correct":"B"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: She asked"},{"id":"B","label":"B: if the files"},{"id":"C","label":"C: was ready"},{"id":"D","label":"D: for review"}],"correct":"C"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: Neither of the answers"},{"id":"B","label":"B: were accepted"},{"id":"C","label":"C: by the editor"},{"id":"D","label":"D: this morning"}],"correct":"B"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: The coach advised"},{"id":"B","label":"B: the team to"},{"id":"C","label":"C: practiced earlier"},{"id":"D","label":"D: on Friday"}],"correct":"C"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: Everyone in the workshop"},{"id":"B","label":"B: have received"},{"id":"C","label":"C: the new schedule"},{"id":"D","label":"D: by email"}],"correct":"B"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: If I knew"},{"id":"B","label":"B: about the delay"},{"id":"C","label":"C: I will call"},{"id":"D","label":"D: the client sooner"}],"correct":"C"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: The museum guide"},{"id":"B","label":"B: explained the exhibit"},{"id":"C","label":"C: clear to"},{"id":"D","label":"D: the visiting students"}],"correct":"C"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: Our manager prefers"},{"id":"B","label":"B: that each report"},{"id":"C","label":"C: includes a brief summary"},{"id":"D","label":"D: and three action points"}],"correct":"B"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: The new tablets"},{"id":"B","label":"B: are more lighter"},{"id":"C","label":"C: than the old ones"},{"id":"D","label":"D: used last year"}],"correct":"B"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: We were surprised"},{"id":"B","label":"B: by how quickly"},{"id":"C","label":"C: the issue"},{"id":"D","label":"D: was solving"}],"correct":"D"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: The volunteers"},{"id":"B","label":"B: arrived early"},{"id":"C","label":"C: because they wanted"},{"id":"D","label":"D: help with setup"}],"correct":"D"},
    {"prompt":"Identify the incorrect phrase or word.","options":[{"id":"A","label":"A: This policy"},{"id":"B","label":"B: applies to"},{"id":"C","label":"C: all staff members"},{"id":"D","label":"D: except they"}],"correct":"D"}
  ]$$::jsonb;
  core_score_profile jsonb := jsonb_build_object(
    'scale', '0-6',
    'weighting', 'equal',
    'objective_calibration', jsonb_build_object(
      'reading', jsonb_build_array(
        jsonb_build_object('min_raw', 0, 'max_raw', 1, 'score', 1.0),
        jsonb_build_object('min_raw', 2, 'max_raw', 2, 'score', 1.8),
        jsonb_build_object('min_raw', 3, 'max_raw', 3, 'score', 2.4),
        jsonb_build_object('min_raw', 4, 'max_raw', 4, 'score', 3.0),
        jsonb_build_object('min_raw', 5, 'max_raw', 5, 'score', 3.6),
        jsonb_build_object('min_raw', 6, 'max_raw', 6, 'score', 4.2),
        jsonb_build_object('min_raw', 7, 'max_raw', 7, 'score', 4.8),
        jsonb_build_object('min_raw', 8, 'max_raw', 8, 'score', 5.2),
        jsonb_build_object('min_raw', 9, 'max_raw', 9, 'score', 5.6),
        jsonb_build_object('min_raw', 10, 'max_raw', 10, 'score', 6.0)
      ),
      'listening', jsonb_build_array(
        jsonb_build_object('min_raw', 0, 'max_raw', 2, 'score', 1.0),
        jsonb_build_object('min_raw', 3, 'max_raw', 4, 'score', 2.0),
        jsonb_build_object('min_raw', 5, 'max_raw', 6, 'score', 2.8),
        jsonb_build_object('min_raw', 7, 'max_raw', 8, 'score', 3.6),
        jsonb_build_object('min_raw', 9, 'max_raw', 10, 'score', 4.4),
        jsonb_build_object('min_raw', 11, 'max_raw', 12, 'score', 5.1),
        jsonb_build_object('min_raw', 13, 'max_raw', 13, 'score', 5.6),
        jsonb_build_object('min_raw', 14, 'max_raw', 14, 'score', 6.0)
      ),
      'grammar', jsonb_build_array(
        jsonb_build_object('min_raw', 0, 'max_raw', 4, 'score', 1.0),
        jsonb_build_object('min_raw', 5, 'max_raw', 8, 'score', 2.0),
        jsonb_build_object('min_raw', 9, 'max_raw', 12, 'score', 3.0),
        jsonb_build_object('min_raw', 13, 'max_raw', 16, 'score', 4.0),
        jsonb_build_object('min_raw', 17, 'max_raw', 20, 'score', 4.8),
        jsonb_build_object('min_raw', 21, 'max_raw', 23, 'score', 5.5),
        jsonb_build_object('min_raw', 24, 'max_raw', 25, 'score', 6.0)
      )
    )
  );
  writing_score_profile jsonb := jsonb_build_object(
    'scale', '0-6',
    'weighting', 'equal',
    'writing_rubric', 'itep-writing-estimate-v1'
  );
  question_record jsonb;
  question_index integer;
begin
  select p.id
  into resolved_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'itep-simulator'
     or lower(p.name) = 'itep simulator'
     or p.id = target_product_id
  order by case when p.id = target_product_id then 0 else 1 end, p.created_at asc
  limit 1;

  if resolved_product_id is null then
    insert into public.products (id, name, type, status, description, metadata)
    values (
      target_product_id,
      'iTEP Simulator',
      'exam',
      'active',
      'Schood iTEP simulator for Academic, SLATE, and Business practice with Core and Writing Live variants.',
      jsonb_build_object(
        'slug', 'itep-simulator',
        'app_url', 'https://itep.schood.online',
        'visible', true,
        'launch_scope', 'core_and_writing_live',
        'speaking_enabled', false,
        'families', jsonb_build_array('academic', 'slate', 'business'),
        'variants', jsonb_build_array('core', 'writing_live'),
        'short_description', 'Practice iTEP Academic, SLATE, and Business with realistic Core and Writing Live flows.',
        'tagline', 'Warm, production-ready iTEP preparation workspace.',
        'sort_order', 36
      )
    )
    on conflict (id) do update
    set
      name = excluded.name,
      type = excluded.type,
      status = excluded.status,
      description = excluded.description,
      metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata
    returning id into resolved_product_id;
  else
    update public.products
    set
      name = 'iTEP Simulator',
      type = 'exam',
      status = 'active',
      description = coalesce(
        nullif(description, ''),
        'Schood iTEP simulator for Academic, SLATE, and Business practice with Core and Writing Live variants.'
      ),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'slug', 'itep-simulator',
          'app_url', 'https://itep.schood.online',
          'visible', true,
          'launch_scope', 'core_and_writing_live',
          'speaking_enabled', false,
          'families', jsonb_build_array('academic', 'slate', 'business'),
          'variants', jsonb_build_array('core', 'writing_live'),
          'short_description', 'Practice iTEP Academic, SLATE, and Business with realistic Core and Writing Live flows.',
          'tagline', 'Warm, production-ready iTEP preparation workspace.',
          'sort_order', 36
        )
    where id = resolved_product_id;
  end if;

  update public.products
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('app_url', 'https://itep.schood.online')
  where id = resolved_product_id
    and (
      nullif(coalesce(metadata->>'app_url', ''), '') is null
      or coalesce(metadata->>'app_url', '') ~* localhost_pattern
      or coalesce(metadata->>'app_url', '') = 'https://schood-itep.pages.dev'
    );

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    starter_plan_id,
    resolved_product_id,
    'iTEP Starter',
    49000,
    'UZS',
    14,
    true,
    jsonb_build_object(
      'display_order', 1,
      'tagline', 'Two-week iTEP launch pack',
      'description', 'Focused iTEP access for Core drills and Writing Live practice across all flagship families.',
      'features', jsonb_build_array(
        'Academic, SLATE, and Business families',
        'Core and Writing Live variants',
        'AI writing scoring with review-ready foundation'
      ),
      'limits', jsonb_build_object(
        'section_practice', 140,
        'full_mock_tests', 6,
        'writing_submissions', 30
      )
    )
  )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    amount = excluded.amount,
    currency = excluded.currency,
    duration_days = excluded.duration_days,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
  values (
    monthly_plan_id,
    resolved_product_id,
    'iTEP Monthly Access',
    119000,
    'UZS',
    30,
    true,
    jsonb_build_object(
      'display_order', 2,
      'recommended', true,
      'tagline', 'Best for full score growth',
      'description', 'Continuous iTEP preparation across Academic, SLATE, and Business with higher writing volume.',
      'features', jsonb_build_array(
        'Full family coverage',
        'Higher monthly practice capacity',
        'Composite and skill-tracking workflow'
      ),
      'limits', jsonb_build_object(
        'section_practice', 600,
        'full_mock_tests', 30,
        'writing_submissions', 160
      )
    )
  )
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    amount = excluded.amount,
    currency = excluded.currency,
    duration_days = excluded.duration_days,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  insert into public.experiences (id, product_id, name, display_order, is_active, metadata)
  values
    (academic_core_id, resolved_product_id, 'iTEP Academic Core', 1, true, jsonb_build_object('catalog', 'full_test', 'family', 'academic', 'variant', 'core', 'content_format', 'itep.content.v1', 'launch_pack', 'itep_launch_v1', 'duration_seconds', 3000, 'score_profile', core_score_profile)),
    (academic_writing_live_id, resolved_product_id, 'iTEP Academic Writing Live', 2, true, jsonb_build_object('catalog', 'full_test', 'family', 'academic', 'variant', 'writing_live', 'content_format', 'itep.content.v1', 'launch_pack', 'itep_launch_v1', 'duration_seconds', 1500, 'score_profile', writing_score_profile)),
    (slate_core_id, resolved_product_id, 'iTEP SLATE Core', 3, true, jsonb_build_object('catalog', 'full_test', 'family', 'slate', 'variant', 'core', 'content_format', 'itep.content.v1', 'launch_pack', 'itep_launch_v1', 'duration_seconds', 3000, 'score_profile', core_score_profile)),
    (slate_writing_live_id, resolved_product_id, 'iTEP SLATE Writing Live', 4, true, jsonb_build_object('catalog', 'full_test', 'family', 'slate', 'variant', 'writing_live', 'content_format', 'itep.content.v1', 'launch_pack', 'itep_launch_v1', 'duration_seconds', 1500, 'score_profile', writing_score_profile)),
    (business_core_id, resolved_product_id, 'iTEP Business Core', 5, true, jsonb_build_object('catalog', 'full_test', 'family', 'business', 'variant', 'core', 'content_format', 'itep.content.v1', 'launch_pack', 'itep_launch_v1', 'duration_seconds', 3000, 'score_profile', core_score_profile)),
    (business_writing_live_id, resolved_product_id, 'iTEP Business Writing Live', 6, true, jsonb_build_object('catalog', 'full_test', 'family', 'business', 'variant', 'writing_live', 'content_format', 'itep.content.v1', 'launch_pack', 'itep_launch_v1', 'duration_seconds', 1500, 'score_profile', writing_score_profile))
  on conflict (id) do update
  set
    product_id = excluded.product_id,
    name = excluded.name,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    metadata = excluded.metadata;

  delete from public.sections
  where experience_id in (
    academic_core_id,
    academic_writing_live_id,
    slate_core_id,
    slate_writing_live_id,
    business_core_id,
    business_writing_live_id
  );

  for family_index in 1..3 loop
    if family_index = 1 then
      family_slug := 'academic';
      family_label := 'Academic';
      core_name := 'iTEP Academic Core';
      writing_name := 'iTEP Academic Writing Live';
      exp_id := academic_core_id;
      reading_part1_title := 'Rooftop Greenhouse Pilot';
      reading_part1_text := $academic_read_1$
At North Valley University, a student team started a rooftop greenhouse pilot to test whether herbs and lettuce could be grown close to the main cafeteria. The idea sounded simple, but the team soon discovered that the roof created unusual conditions. Afternoon wind was stronger than expected, and night temperatures dropped quickly in early spring. Because of a late frost warning, planting had to begin one week later than planned. The delay disappointed the team at first, yet it also gave them time to install moisture sensors and lighter plant trays. Once the seedlings were transferred, the team found that the sensors helped them decide when to water and when to keep the roof vents closed.
$academic_read_1$;
      reading_part1_questions := $$[
        {"prompt":"Why was the planting schedule delayed?","options":[{"id":"A","label":"A late frost warning"},{"id":"B","label":"A shortage of seeds"},{"id":"C","label":"A broken elevator"},{"id":"D","label":"A cafeteria renovation"}],"correct":"A"},
        {"prompt":"What did the team install during the delay?","options":[{"id":"A","label":"Solar panels"},{"id":"B","label":"Moisture sensors and lighter trays"},{"id":"C","label":"Additional roof lights"},{"id":"D","label":"Large storage tanks"}],"correct":"B"},
        {"prompt":"What challenge did the roof create in the afternoon?","options":[{"id":"A","label":"Heavy rain"},{"id":"B","label":"Too little sunlight"},{"id":"C","label":"Stronger wind"},{"id":"D","label":"Crowded walkways"}],"correct":"C"},
        {"prompt":"What is the main purpose of the passage?","options":[{"id":"A","label":"To explain lessons from a campus greenhouse trial"},{"id":"B","label":"To compare four student clubs"},{"id":"C","label":"To advertise cafeteria meals"},{"id":"D","label":"To describe a chemistry experiment"}],"correct":"A"}
      ]$$::jsonb;
      reading_part2_title := 'Peer Mentor Expansion';
      reading_part2_text := $academic_read_2$
When North Valley University reviewed its orientation program, one result stood out. First-year international students said the most helpful part of orientation was not the welcome lecture or the campus tour. Instead, it was the peer mentor sessions held during the first three weeks of classes. In response, the university expanded the program. Each mentor now supports a small group of students, meets them weekly, and keeps a short log of recurring questions. The logs are later shared with academic advisers, who use them to improve workshops on note-taking, office hours, and course planning.

The expansion required careful training. Mentors were told not to solve every problem for students. Their job was to listen, point students toward the correct resource, and explain common expectations in university classes. Administrators found that students who joined the mentor sessions were more likely to attend support workshops and less likely to miss early deadlines. The program was not perfect. Some mentors needed additional coaching on when to refer students to professional staff. Still, the university concluded that the sessions provided a practical bridge between formal orientation and everyday academic life.
$academic_read_2$;
      reading_part2_questions := $$[
        {"prompt":"What did students identify as the most helpful part of orientation?","options":[{"id":"A","label":"The welcome lecture"},{"id":"B","label":"The campus tour"},{"id":"C","label":"Peer mentor sessions"},{"id":"D","label":"The placement exam"}],"correct":"C"},
        {"prompt":"Why are mentor logs shared with academic advisers?","options":[{"id":"A","label":"To grade the mentors"},{"id":"B","label":"To improve support workshops"},{"id":"C","label":"To replace orientation lectures"},{"id":"D","label":"To choose scholarship winners"}],"correct":"B"},
        {"prompt":"What were mentors told not to do?","options":[{"id":"A","label":"Meet students weekly"},{"id":"B","label":"Explain class expectations"},{"id":"C","label":"Solve every problem for students"},{"id":"D","label":"Share recurring questions"}],"correct":"C"},
        {"prompt":"What happened more often among students who joined the sessions?","options":[{"id":"A","label":"They attended support workshops"},{"id":"B","label":"They changed majors immediately"},{"id":"C","label":"They skipped office hours"},{"id":"D","label":"They finished classes early"}],"correct":"A"},
        {"prompt":"What weakness did the program still have?","options":[{"id":"A","label":"The mentors met too rarely"},{"id":"B","label":"Some mentors needed help with referrals"},{"id":"C","label":"Students disliked weekly logs"},{"id":"D","label":"Academic advisers ignored the reports"}],"correct":"B"},
        {"prompt":"What is the passage mainly about?","options":[{"id":"A","label":"How a university revised its peer mentor program"},{"id":"B","label":"Why international students avoid orientation"},{"id":"C","label":"How lecture halls are assigned"},{"id":"D","label":"Why academic advisers changed departments"}],"correct":"A"}
      ]$$::jsonb;
      listening_part1_url := 'https://itep.schood.online/media/itep/academic-listening-part1.wav';
      listening_part2_url := 'https://itep.schood.online/media/itep/academic-listening-part2.wav';
      listening_part3_url := 'https://itep.schood.online/media/itep/academic-listening-part3.wav';
      listening_part1_questions := $$[
        {"prompt":"Why was the chemistry lab moved?","options":[{"id":"A","label":"The old room is being repaired"},{"id":"B","label":"The class became too large"},{"id":"C","label":"The professor changed buildings"},{"id":"D","label":"The lab equipment was missing"}],"correct":"A"},
        {"prompt":"Why will the student print the paper before dinner?","options":[{"id":"A","label":"The printer is broken later"},{"id":"B","label":"The library closes earlier this week"},{"id":"C","label":"The student has a meeting"},{"id":"D","label":"The teacher requested two copies"}],"correct":"B"},
        {"prompt":"When will the study group meet?","options":[{"id":"A","label":"Tuesday"},{"id":"B","label":"Wednesday"},{"id":"C","label":"Thursday"},{"id":"D","label":"Friday"}],"correct":"C"},
        {"prompt":"Why did the professor extend the report deadline?","options":[{"id":"A","label":"A guest speaker visited campus"},{"id":"B","label":"The library was closed"},{"id":"C","label":"Students requested a longer unit"},{"id":"D","label":"A power outage interrupted work"}],"correct":"D"}
      ]$$::jsonb;
      listening_part2_questions := $$[
        {"prompt":"Which skill does the adviser say needs the most work?","options":[{"id":"A","label":"Reading speed"},{"id":"B","label":"Listening for supporting details"},{"id":"C","label":"Essay organization"},{"id":"D","label":"Grammar editing"}],"correct":"B"},
        {"prompt":"What should the student write for each lecture recording?","options":[{"id":"A","label":"One main idea and two supporting points"},{"id":"B","label":"A full transcript"},{"id":"C","label":"A list of vocabulary only"},{"id":"D","label":"Three questions for the teacher"}],"correct":"A"},
        {"prompt":"When should the student compare notes to the transcript?","options":[{"id":"A","label":"Before listening"},{"id":"B","label":"After pausing during the first minute"},{"id":"C","label":"After one full listen"},{"id":"D","label":"Only after class discussion"}],"correct":"C"},
        {"prompt":"How often does the student plan to practice this strategy?","options":[{"id":"A","label":"Once a month"},{"id":"B","label":"Three times a week"},{"id":"C","label":"Every school day"},{"id":"D","label":"Only before exams"}],"correct":"B"}
      ]$$::jsonb;
      listening_part3_questions := $$[
        {"prompt":"What do marine scientists study first?","options":[{"id":"A","label":"Visitor numbers"},{"id":"B","label":"Water conditions and wave movement"},{"id":"C","label":"Fishing prices"},{"id":"D","label":"Boat repair costs"}],"correct":"B"},
        {"prompt":"Where are young coral fragments grown?","options":[{"id":"A","label":"In protected nurseries"},{"id":"B","label":"In classroom aquariums only"},{"id":"C","label":"On sandy beaches"},{"id":"D","label":"Inside caves"}],"correct":"A"},
        {"prompt":"When are the fragments attached to rock surfaces?","options":[{"id":"A","label":"Immediately after collection"},{"id":"B","label":"After divers finish mapping"},{"id":"C","label":"When the fragments are strong enough"},{"id":"D","label":"Only during winter"}],"correct":"C"},
        {"prompt":"What is one benefit mentioned in the lecture?","options":[{"id":"A","label":"It reduces university tuition"},{"id":"B","label":"It helps sea life return"},{"id":"C","label":"It replaces all field research"},{"id":"D","label":"It eliminates pollution"}],"correct":"B"},
        {"prompt":"What second benefit does the speaker mention?","options":[{"id":"A","label":"Students see how research guides repair"},{"id":"B","label":"Divers need less training"},{"id":"C","label":"Tourists can enter nurseries"},{"id":"D","label":"Boats can travel faster"}],"correct":"A"},
        {"prompt":"What is the main idea of the lecture?","options":[{"id":"A","label":"Reef restoration is random and fast"},{"id":"B","label":"Reef restoration uses staged research-based work"},{"id":"C","label":"Coral fragments cannot survive relocation"},{"id":"D","label":"Only students can restore reefs"}],"correct":"B"}
      ]$$::jsonb;
      writing_task_1_prompt := 'A professor asks for one practical change that would help new international students feel more prepared during their first week on campus. Respond in 50-75 words.';
      writing_task_2_prompt := 'Some universities require first-year students to live on campus. Do you agree or disagree? Write 175-225 words and support your opinion with clear reasons and examples.';
      exp_id := academic_core_id;
    elsif family_index = 2 then
      family_slug := 'slate';
      family_label := 'SLATE';
      core_name := 'iTEP SLATE Core';
      writing_name := 'iTEP SLATE Writing Live';
      exp_id := slate_core_id;
      reading_part1_title := 'Nature Journal Club';
      reading_part1_text := $slate_read_1$
At Riverside Middle School, a teacher started a nature journal club for students who wanted to spend more time observing the school garden. The club met twice a week before classes. Students sketched plants, recorded changes in weather, and wrote short notes about insects they noticed near the flowers. At first, some students thought the journal work would be repetitive. Instead, they found that the garden looked different almost every week. One group even noticed that the tomato plants grew better after the club added mulch to keep water in the soil.
$slate_read_1$;
      reading_part1_questions := $$[
        {"prompt":"Why did the teacher start the club?","options":[{"id":"A","label":"To help students observe the school garden"},{"id":"B","label":"To replace science class"},{"id":"C","label":"To train students for a contest"},{"id":"D","label":"To sell vegetables at lunch"}],"correct":"A"},
        {"prompt":"How often did the club meet?","options":[{"id":"A","label":"Every afternoon"},{"id":"B","label":"Twice a week before classes"},{"id":"C","label":"Only on Fridays"},{"id":"D","label":"Once a month"}],"correct":"B"},
        {"prompt":"What did students realize about the garden?","options":[{"id":"A","label":"It looked different almost every week"},{"id":"B","label":"It was too small to study"},{"id":"C","label":"It needed no care"},{"id":"D","label":"It was closed in winter"}],"correct":"A"},
        {"prompt":"What change helped the tomato plants?","options":[{"id":"A","label":"New lights"},{"id":"B","label":"Extra mulch"},{"id":"C","label":"Longer meetings"},{"id":"D","label":"More notebooks"}],"correct":"B"}
      ]$$::jsonb;
      reading_part2_title := 'Makerspace Redesign';
      reading_part2_text := $slate_read_2$
Riverside later redesigned an unused classroom into a makerspace. The room did not begin with expensive equipment. It started with recycled cardboard, hand tools, measuring tape, and storage shelves. Teachers wanted students to test ideas quickly without worrying about making mistakes. During the first month, several groups built paper bridges and small shelters. Many early models collapsed, but students revised them after discussing what went wrong.

By the end of the term, teachers noticed an important pattern. Students who were quiet during regular lessons often became active leaders in the makerspace. They explained how to strengthen a weak design, divided tasks fairly, and encouraged classmates to test a second version instead of giving up. Because of those results, the school added simple coding kits and planned a family showcase night. Teachers said the room mattered not because it was modern, but because it helped students practice persistence.
$slate_read_2$;
      reading_part2_questions := $$[
        {"prompt":"What materials did the makerspace use at the start?","options":[{"id":"A","label":"Only advanced robots"},{"id":"B","label":"Recycled cardboard and simple tools"},{"id":"C","label":"Large computer servers"},{"id":"D","label":"Professional welding equipment"}],"correct":"B"},
        {"prompt":"What happened to many of the first models?","options":[{"id":"A","label":"They were sold immediately"},{"id":"B","label":"They collapsed and were revised"},{"id":"C","label":"They were judged by visitors"},{"id":"D","label":"They won national prizes"}],"correct":"B"},
        {"prompt":"Which students often became leaders in the makerspace?","options":[{"id":"A","label":"Only athletes"},{"id":"B","label":"Students who were quiet in regular lessons"},{"id":"C","label":"Only the oldest students"},{"id":"D","label":"Students who skipped homework"}],"correct":"B"},
        {"prompt":"What did student leaders help classmates do?","options":[{"id":"A","label":"Leave early"},{"id":"B","label":"Avoid group work"},{"id":"C","label":"Improve weak designs"},{"id":"D","label":"Memorize textbook pages"}],"correct":"C"},
        {"prompt":"Why did the school add coding kits?","options":[{"id":"A","label":"Because the room had shown useful results"},{"id":"B","label":"Because cardboard was banned"},{"id":"C","label":"Because families requested exams"},{"id":"D","label":"Because teachers stopped using shelves"}],"correct":"A"},
        {"prompt":"What is the main idea of the passage?","options":[{"id":"A","label":"A makerspace helped students practice persistence and teamwork"},{"id":"B","label":"Coding kits are better than cardboard"},{"id":"C","label":"Quiet students should work alone"},{"id":"D","label":"Classrooms should be replaced by competitions"}],"correct":"A"}
      ]$$::jsonb;
      listening_part1_url := 'https://itep.schood.online/media/itep/slate-listening-part1.wav';
      listening_part2_url := 'https://itep.schood.online/media/itep/slate-listening-part2.wav';
      listening_part3_url := 'https://itep.schood.online/media/itep/slate-listening-part3.wav';
      listening_part1_questions := $$[
        {"prompt":"Why was practice moved to the gym?","options":[{"id":"A","label":"The coach was absent"},{"id":"B","label":"The field was wet"},{"id":"C","label":"The team changed sports"},{"id":"D","label":"The bus arrived early"}],"correct":"B"},
        {"prompt":"Why was the history quiz moved to Friday?","options":[{"id":"A","label":"The teacher lost the papers"},{"id":"B","label":"The class requested more time"},{"id":"C","label":"A guest speaker arrives tomorrow"},{"id":"D","label":"The classroom is being painted"}],"correct":"C"},
        {"prompt":"When does Ms. Reed want the posters?","options":[{"id":"A","label":"By lunch"},{"id":"B","label":"After school"},{"id":"C","label":"Next Monday"},{"id":"D","label":"At the museum"}],"correct":"A"},
        {"prompt":"What time does the museum bus leave?","options":[{"id":"A","label":"Seven forty-five"},{"id":"B","label":"Eight fifteen"},{"id":"C","label":"Eight thirty"},{"id":"D","label":"Nine o'clock"}],"correct":"B"}
      ]$$::jsonb;
      listening_part2_questions := $$[
        {"prompt":"Which activity helps the student the most?","options":[{"id":"A","label":"Debate"},{"id":"B","label":"Robotics"},{"id":"C","label":"History club"},{"id":"D","label":"Basketball"}],"correct":"B"},
        {"prompt":"Why does the student want to keep that activity?","options":[{"id":"A","label":"It meets only once a month"},{"id":"B","label":"Friends insisted"},{"id":"C","label":"The student likes solving problems with the team"},{"id":"D","label":"It has no homework"}],"correct":"C"},
        {"prompt":"What does the counselor suggest pausing?","options":[{"id":"A","label":"Robotics"},{"id":"B","label":"Debate"},{"id":"C","label":"Homework"},{"id":"D","label":"Science class"}],"correct":"B"},
        {"prompt":"What benefit does the counselor mention?","options":[{"id":"A","label":"More time for homework and sleep"},{"id":"B","label":"A higher bus pass"},{"id":"C","label":"More field trips"},{"id":"D","label":"A shorter school day"}],"correct":"A"}
      ]$$::jsonb;
      listening_part3_questions := $$[
        {"prompt":"What did the makerspace begin with?","options":[{"id":"A","label":"Only expensive machines"},{"id":"B","label":"Cardboard, tape, and simple tools"},{"id":"C","label":"A full computer lab"},{"id":"D","label":"A school bus garage"}],"correct":"B"},
        {"prompt":"Who often became leaders in the makerspace?","options":[{"id":"A","label":"Students quiet in regular class"},{"id":"B","label":"Only teachers"},{"id":"C","label":"Parents at showcase night"},{"id":"D","label":"The oldest athletes"}],"correct":"A"},
        {"prompt":"What was later added to the makerspace?","options":[{"id":"A","label":"School uniforms"},{"id":"B","label":"Coding kits and recycled electronics"},{"id":"C","label":"A cafeteria"},{"id":"D","label":"Textbook storage only"}],"correct":"B"},
        {"prompt":"What important habit did the makerspace build?","options":[{"id":"A","label":"Trying, reflecting, and trying again"},{"id":"B","label":"Finishing without checking"},{"id":"C","label":"Competing instead of sharing"},{"id":"D","label":"Avoiding failed ideas"}],"correct":"A"},
        {"prompt":"What does the speaker say matters most?","options":[{"id":"A","label":"The cost of the equipment"},{"id":"B","label":"The size of the room"},{"id":"C","label":"The habit of persistence"},{"id":"D","label":"The number of visitors"}],"correct":"C"},
        {"prompt":"What is the lecture mainly about?","options":[{"id":"A","label":"Why one school makerspace became valuable"},{"id":"B","label":"How to repair electronics safely"},{"id":"C","label":"Why cardboard should be banned"},{"id":"D","label":"How to design museum exhibits"}],"correct":"A"}
      ]$$::jsonb;
      writing_task_1_prompt := 'Your school is planning a new after-school activity. Recommend one activity and explain why it would help students in 50-75 words.';
      writing_task_2_prompt := 'Some schools should require students to join one club or team. Do you agree or disagree? Write 175-225 words and support your opinion with clear examples.';
      exp_id := slate_core_id;
    else
      family_slug := 'business';
      family_label := 'Business';
      core_name := 'iTEP Business Core';
      writing_name := 'iTEP Business Writing Live';
      exp_id := business_core_id;
      reading_part1_title := 'Shift Board Update';
      reading_part1_text := $business_read_1$
At Meridian Logistics, the warehouse supervisor replaced a paper shift board with a digital board near the loading area. The old paper board was easy to ignore because updates were sometimes posted after workers had already started moving pallets. With the new board, changes appear on a larger screen and can be updated immediately when a truck is delayed. During the first month, the company found that workers arrived at the correct loading zone more quickly and asked fewer repeat questions. Managers also said the screen made it easier to notice whether a high-priority order had been reassigned.
$business_read_1$;
      reading_part1_questions := $$[
        {"prompt":"Why was the paper board ineffective?","options":[{"id":"A","label":"It was posted too late to notice"},{"id":"B","label":"It used too much electricity"},{"id":"C","label":"It cost more than the screen"},{"id":"D","label":"It was kept in the office"}],"correct":"A"},
        {"prompt":"What can the digital board show immediately?","options":[{"id":"A","label":"New employee salaries"},{"id":"B","label":"Truck delay updates"},{"id":"C","label":"Customer photos"},{"id":"D","label":"Weekend vacation requests"}],"correct":"B"},
        {"prompt":"What happened in the first month?","options":[{"id":"A","label":"Workers reached the correct zone more quickly"},{"id":"B","label":"Orders were cancelled"},{"id":"C","label":"The screen stopped working"},{"id":"D","label":"Managers reduced all shifts"}],"correct":"A"},
        {"prompt":"What is the passage mainly about?","options":[{"id":"A","label":"A warehouse communication improvement"},{"id":"B","label":"A safety inspection report"},{"id":"C","label":"A salary dispute"},{"id":"D","label":"A vehicle maintenance guide"}],"correct":"A"}
      ]$$::jsonb;
      reading_part2_title := 'Feedback Dashboard';
      reading_part2_text := $business_read_2$
Meridian's customer support team receives hundreds of short comments every month. At first, the team read the comments individually but struggled to decide which problems needed quick action. To solve that issue, the company created a simple dashboard. The dashboard groups comments into themes such as delivery timing, product quality, billing questions, and follow-up communication. Team leads can compare the current month with previous months and see whether a complaint category is becoming more common.

The dashboard became more useful once every theme was assigned to an action owner. Delivery managers reviewed timing complaints, product managers reviewed quality complaints, and support leads revised email templates when follow-up comments increased. Leaders said the most valuable part of the system was not the graph itself. It was the short weekly meeting that ended with one decision about what to improve first. By keeping the decision process small and regular, the company made customer feedback easier to use.
$business_read_2$;
      reading_part2_questions := $$[
        {"prompt":"Why did the team create the dashboard?","options":[{"id":"A","label":"To reduce internet costs"},{"id":"B","label":"To decide which problems needed action"},{"id":"C","label":"To replace all support staff"},{"id":"D","label":"To store employee schedules"}],"correct":"B"},
        {"prompt":"What does the dashboard group comments by?","options":[{"id":"A","label":"Employee birthdays"},{"id":"B","label":"Comment length only"},{"id":"C","label":"Themes such as delivery and billing"},{"id":"D","label":"Office location"}],"correct":"C"},
        {"prompt":"What made the dashboard more useful?","options":[{"id":"A","label":"Assigning each theme to an action owner"},{"id":"B","label":"Printing it in color"},{"id":"C","label":"Updating it once a year"},{"id":"D","label":"Removing quality comments"}],"correct":"A"},
        {"prompt":"Who reviewed quality complaints?","options":[{"id":"A","label":"Delivery drivers"},{"id":"B","label":"Product managers"},{"id":"C","label":"Accountants"},{"id":"D","label":"Reception staff"}],"correct":"B"},
        {"prompt":"What did leaders value most?","options":[{"id":"A","label":"The size of the graph"},{"id":"B","label":"The weekly meeting and decision"},{"id":"C","label":"The cost of the software"},{"id":"D","label":"The font on the screen"}],"correct":"B"},
        {"prompt":"What is the main idea of the passage?","options":[{"id":"A","label":"A company learned to use feedback through structured review and ownership"},{"id":"B","label":"Billing complaints are the only useful comments"},{"id":"C","label":"Graphs always solve support issues"},{"id":"D","label":"Customers should write longer comments"}],"correct":"A"}
      ]$$::jsonb;
      listening_part1_url := 'https://itep.schood.online/media/itep/business-listening-part1.wav';
      listening_part2_url := 'https://itep.schood.online/media/itep/business-listening-part2.wav';
      listening_part3_url := 'https://itep.schood.online/media/itep/business-listening-part3.wav';
      listening_part1_questions := $$[
        {"prompt":"When will the shipment arrive at warehouse B?","options":[{"id":"A","label":"At ten in the morning"},{"id":"B","label":"Before sunrise"},{"id":"C","label":"After lunch"},{"id":"D","label":"At midnight"}],"correct":"C"},
        {"prompt":"Why must the revised quote be sent before four?","options":[{"id":"A","label":"Finance must approve it that day"},{"id":"B","label":"The printer closes"},{"id":"C","label":"The client cancelled the order"},{"id":"D","label":"The analyst is on leave"}],"correct":"A"},
        {"prompt":"Why was the client meeting moved online?","options":[{"id":"A","label":"The office internet failed"},{"id":"B","label":"Two managers are traveling"},{"id":"C","label":"The client requested a holiday"},{"id":"D","label":"The room was too small"}],"correct":"B"},
        {"prompt":"What does customer support need by tomorrow?","options":[{"id":"A","label":"A training video"},{"id":"B","label":"A hiring plan"},{"id":"C","label":"A one-page return policy summary"},{"id":"D","label":"A new warehouse map"}],"correct":"C"}
      ]$$::jsonb;
      listening_part2_questions := $$[
        {"prompt":"What improved last month?","options":[{"id":"A","label":"Response time"},{"id":"B","label":"Travel budget"},{"id":"C","label":"Office rent"},{"id":"D","label":"Printer speed"}],"correct":"A"},
        {"prompt":"Why did satisfaction scores stay low?","options":[{"id":"A","label":"Calls were too short"},{"id":"B","label":"Emails were unclear"},{"id":"C","label":"Managers were absent"},{"id":"D","label":"The survey was removed"}],"correct":"B"},
        {"prompt":"What does the manager ask the analyst to test?","options":[{"id":"A","label":"Two versions of the first email"},{"id":"B","label":"A new warehouse vehicle"},{"id":"C","label":"A longer phone script"},{"id":"D","label":"A weekend discount"}],"correct":"A"},
        {"prompt":"When will the analyst compare the results?","options":[{"id":"A","label":"By Friday"},{"id":"B","label":"Next month"},{"id":"C","label":"Tomorrow morning"},{"id":"D","label":"After the holiday break"}],"correct":"A"}
      ]$$::jsonb;
      listening_part3_questions := $$[
        {"prompt":"What is the first thing a useful dashboard does?","options":[{"id":"A","label":"It groups comments into themes"},{"id":"B","label":"It deletes old data"},{"id":"C","label":"It hires more staff"},{"id":"D","label":"It closes support tickets automatically"}],"correct":"A"},
        {"prompt":"Why should managers compare current data with previous months?","options":[{"id":"A","label":"To reduce graph colors"},{"id":"B","label":"To see if a problem is growing"},{"id":"C","label":"To shorten shifts"},{"id":"D","label":"To remove customer names"}],"correct":"B"},
        {"prompt":"What final step keeps the dashboard useful?","options":[{"id":"A","label":"Linking feedback to an action owner"},{"id":"B","label":"Printing every report"},{"id":"C","label":"Hiding delivery comments"},{"id":"D","label":"Changing the company logo"}],"correct":"A"},
        {"prompt":"What happens without that final step?","options":[{"id":"A","label":"The dashboard becomes a report that no one uses"},{"id":"B","label":"The dashboard gets faster"},{"id":"C","label":"Customers stop writing"},{"id":"D","label":"Managers travel less"}],"correct":"A"},
        {"prompt":"What do good feedback systems help teams do?","options":[{"id":"A","label":"Choose what to fix first"},{"id":"B","label":"Eliminate all meetings"},{"id":"C","label":"Ignore support comments"},{"id":"D","label":"Increase product prices"}],"correct":"A"},
        {"prompt":"What is the main idea of the lecture?","options":[{"id":"A","label":"Useful dashboards connect feedback to clear action"},{"id":"B","label":"Comments are less useful than sales numbers"},{"id":"C","label":"Support teams should avoid themes"},{"id":"D","label":"Reports should never be shared"}],"correct":"A"}
      ]$$::jsonb;
      writing_task_1_prompt := 'Your manager asks for one change that could make weekly team meetings more efficient. Respond in 50-75 words.';
      writing_task_2_prompt := 'Some companies should allow employees to work remotely part of the week. Do you agree or disagree? Write 175-225 words and support your opinion with clear reasons and examples.';
      exp_id := business_core_id;
    end if;

    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (
      gen_random_uuid(),
      exp_id,
      'Reading',
      1,
      jsonb_build_object('type', 'reading', 'duration_seconds', 1200, 'score_profile', jsonb_build_object('target_score', 10))
    )
    returning id into section_id;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Reading Part 1', 1, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values (
      gen_random_uuid(),
      part_id,
      'instruction',
      1,
      jsonb_build_object('text', 'Read the passage and answer Questions 1-4.'),
      '{}'::jsonb
    );

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values (
      gen_random_uuid(),
      part_id,
      'reading_passage',
      2,
      jsonb_build_object('title', reading_part1_title, 'text', reading_part1_text),
      '{}'::jsonb
    );

    question_index := 1;
    for question_record in select value from jsonb_array_elements(reading_part1_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 2,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Reading Part 2', 2, '{}'::jsonb);

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values (
      gen_random_uuid(),
      part_id,
      'instruction',
      1,
      jsonb_build_object('text', 'Read the passage and answer Questions 5-10.'),
      '{}'::jsonb
    );

    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values (
      gen_random_uuid(),
      part_id,
      'reading_passage',
      2,
      jsonb_build_object('title', reading_part2_title, 'text', reading_part2_text),
      '{}'::jsonb
    );

    for question_record in select value from jsonb_array_elements(reading_part2_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 2,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (
      gen_random_uuid(),
      exp_id,
      'Listening',
      2,
      jsonb_build_object('type', 'listening', 'duration_seconds', 1200, 'score_profile', jsonb_build_object('target_score', 14))
    )
    returning id into section_id;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Listening Part 1', 1, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (gen_random_uuid(), part_id, 'instruction', 1, jsonb_build_object('text', 'Listen to the short conversations and answer Questions 1-4.'), '{}'::jsonb),
      (gen_random_uuid(), part_id, 'audio', 2, jsonb_build_object('url', listening_part1_url, 'play_once', true, 'auto_start', false), '{}'::jsonb);
    question_index := 1;
    for question_record in select value from jsonb_array_elements(listening_part1_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 2,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Listening Part 2', 2, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (gen_random_uuid(), part_id, 'instruction', 1, jsonb_build_object('text', 'Listen to the conversation and answer Questions 5-8.'), '{}'::jsonb),
      (gen_random_uuid(), part_id, 'audio', 2, jsonb_build_object('url', listening_part2_url, 'play_once', true, 'auto_start', false), '{}'::jsonb);
    for question_record in select value from jsonb_array_elements(listening_part2_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 2,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Listening Part 3', 3, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (gen_random_uuid(), part_id, 'instruction', 1, jsonb_build_object('text', 'Listen to the lecture and answer Questions 9-14.'), '{}'::jsonb),
      (gen_random_uuid(), part_id, 'audio', 2, jsonb_build_object('url', listening_part3_url, 'play_once', true, 'auto_start', false), '{}'::jsonb);
    for question_record in select value from jsonb_array_elements(listening_part3_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 2,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (
      gen_random_uuid(),
      exp_id,
      'Grammar',
      3,
      jsonb_build_object('type', 'grammar', 'duration_seconds', 600, 'score_profile', jsonb_build_object('target_score', 25))
    )
    returning id into section_id;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Grammar Part 1', 1, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values (
      gen_random_uuid(),
      part_id,
      'instruction',
      1,
      jsonb_build_object('text', 'Complete the sentences by choosing the best option.'),
      '{}'::jsonb
    );
    question_index := 1;
    for question_record in select value from jsonb_array_elements(completion_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 1,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Grammar Part 2', 2, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values (
      gen_random_uuid(),
      part_id,
      'instruction',
      1,
      jsonb_build_object('text', 'Identify the incorrect word or phrase in each sentence.'),
      '{}'::jsonb
    );
    for question_record in select value from jsonb_array_elements(error_questions)
    loop
      unit_id := gen_random_uuid();
      insert into public.content_units (id, part_id, type, display_order, data, metadata)
      values (
        unit_id,
        part_id,
        'question_single_choice',
        question_index + 1,
        jsonb_build_object('prompt', question_record->>'prompt', 'options', question_record->'options'),
        jsonb_build_object('question_number', question_index)
      );
      insert into public.answer_keys (content_unit_id, correct, metadata)
      values (unit_id, jsonb_build_object('option_id', question_record->>'correct'), '{}'::jsonb)
      on conflict (content_unit_id) do update
      set correct = excluded.correct, metadata = excluded.metadata;
      question_index := question_index + 1;
    end loop;

    if family_index = 1 then
      exp_id := academic_writing_live_id;
    elsif family_index = 2 then
      exp_id := slate_writing_live_id;
    else
      exp_id := business_writing_live_id;
    end if;

    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (
      gen_random_uuid(),
      exp_id,
      'Writing',
      1,
      jsonb_build_object('type', 'writing', 'duration_seconds', 1500)
    )
    returning id into section_id;

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Writing Task 1', 1, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (gen_random_uuid(), part_id, 'instruction', 1, jsonb_build_object('text', 'Read the prompt carefully. Write 50-75 words.'), '{}'::jsonb),
      (gen_random_uuid(), part_id, 'question_text', 2, jsonb_build_object('prompt', writing_task_1_prompt, 'task_type', 'task1', 'min_words', 50, 'max_words', 75, 'rows', 8, 'show_word_count', true), '{}'::jsonb);

    part_id := gen_random_uuid();
    insert into public.parts (id, section_id, name, display_order, metadata)
    values (part_id, section_id, 'Writing Task 2', 2, '{}'::jsonb);
    insert into public.content_units (id, part_id, type, display_order, data, metadata)
    values
      (gen_random_uuid(), part_id, 'instruction', 1, jsonb_build_object('text', 'Read the prompt carefully. Write 175-225 words and support your opinion.'), '{}'::jsonb),
      (gen_random_uuid(), part_id, 'question_text', 2, jsonb_build_object('prompt', writing_task_2_prompt, 'task_type', 'task2', 'min_words', 175, 'max_words', 225, 'rows', 14, 'show_word_count', true), '{}'::jsonb);
  end loop;
end $seed$;
