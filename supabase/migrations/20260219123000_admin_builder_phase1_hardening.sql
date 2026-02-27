-- ============================================================================
-- ADMIN BUILDER PHASE 1 HARDENING
-- - transactional saves (single DB function)
-- - publish gate validation (scoring/media integrity)
-- - optimistic version locking + snapshots + rollback
-- ============================================================================

alter table public.experiences
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

-- Reuse shared updated_at trigger behavior.
drop trigger if exists experiences_updated_at on public.experiences;
create trigger experiences_updated_at
before update on public.experiences
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.experience_snapshots (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  version integer not null,
  action text not null default 'save',
  payload jsonb not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists experience_snapshots_experience_created_idx
  on public.experience_snapshots(experience_id, created_at desc);

alter table public.experience_snapshots enable row level security;

drop policy if exists "Admins can manage experience snapshots" on public.experience_snapshots;
create policy "Admins can manage experience snapshots"
on public.experience_snapshots
for all
using (public.is_admin())
with check (public.is_admin());

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
    return case when jsonb_typeof(p_correct->'matches') = 'object' then jsonb_object_length(p_correct->'matches') else 0 end;
  end if;

  if v_type in ('question_gap_fill', 'question_select_from_list') then
    return case when jsonb_typeof(p_correct->'blanks') = 'object' then jsonb_object_length(p_correct->'blanks') else 0 end;
  end if;

  if v_type = 'question_table_completion' then
    return case when jsonb_typeof(p_correct->'cells') = 'object' then jsonb_object_length(p_correct->'cells') else 0 end;
  end if;

  if v_type = 'question_diagram_labeling' then
    return case when jsonb_typeof(p_correct->'labels') = 'object' then jsonb_object_length(p_correct->'labels') else 0 end;
  end if;

  if v_type = 'question_drag_drop' then
    return case when jsonb_typeof(p_correct->'targets') = 'object' then jsonb_object_length(p_correct->'targets') else 0 end;
  end if;

  return 0;
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
          if not exists (select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = v_path) then
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
          if not exists (select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = v_path) then
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
          if not exists (select 1 from storage.objects o where o.bucket_id = v_bucket and o.name = v_path) then
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

create or replace function public.admin_builder_save(
  p_payload jsonb,
  p_actor uuid,
  p_action text default 'save'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_experience jsonb;
  v_product_id uuid;
  v_experience_id uuid;
  v_experience_name text;
  v_display_order integer;
  v_is_active boolean;
  v_price_amount numeric;
  v_price_currency text;
  v_experience_metadata jsonb;
  v_expected_version integer;
  v_current_version integer;
  v_next_version integer;
  v_prev_is_active boolean := false;

  v_sections_json jsonb;
  v_section record;
  v_part record;
  v_unit record;

  v_section_id uuid;
  v_part_id uuid;
  v_unit_id uuid;
  v_section_name text;
  v_part_name text;
  v_unit_type text;
  v_unit_data jsonb;
  v_unit_metadata jsonb;
  v_section_metadata jsonb;
  v_part_metadata jsonb;

  v_section_display_order integer;
  v_part_display_order integer;
  v_unit_display_order integer;

  v_counts_sections integer := 0;
  v_counts_parts integer := 0;
  v_counts_units integer := 0;
  v_counts_keys integer := 0;

  v_deleted jsonb;
  v_deleted_units uuid[] := '{}'::uuid[];
  v_deleted_parts uuid[] := '{}'::uuid[];
  v_deleted_sections uuid[] := '{}'::uuid[];

  v_payload_unit_ids uuid[] := '{}'::uuid[];
  v_collected_key_unit_ids uuid[] := '{}'::uuid[];
  v_payload_key_unit_ids uuid[] := '{}'::uuid[];

  v_effective_action text;
  v_snapshot_payload jsonb;
  v_snapshot_id uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid payload';
  end if;

  v_experience := p_payload->'experience';
  if v_experience is null or jsonb_typeof(v_experience) <> 'object' then
    raise exception 'experience is required';
  end if;

  v_product_id := nullif(p_payload->>'product_id', '')::uuid;
  if v_product_id is null then
    raise exception 'product_id is required';
  end if;

  if not exists (select 1 from public.products where id = v_product_id) then
    raise exception 'Invalid product_id (product not found)';
  end if;

  v_experience_name := trim(coalesce(v_experience->>'name', ''));
  if v_experience_name = '' then
    raise exception 'experience.name is required';
  end if;

  v_display_order := coalesce(nullif(v_experience->>'display_order', '')::integer, 0);
  v_is_active := coalesce((v_experience->>'is_active')::boolean, true);
  v_price_amount := nullif(v_experience->>'price_amount', '')::numeric;
  if v_price_amount is not null and v_price_amount < 0 then
    raise exception 'experience.price_amount must be a non-negative number';
  end if;

  v_price_currency := upper(trim(coalesce(v_experience->>'price_currency', 'UZS')));
  if v_price_currency = '' then
    v_price_currency := 'UZS';
  end if;

  v_experience_metadata := coalesce(v_experience->'metadata', '{}'::jsonb);
  if jsonb_typeof(v_experience_metadata) <> 'object' then
    v_experience_metadata := '{}'::jsonb;
  end if;

  v_expected_version := nullif(v_experience->>'version', '')::integer;
  v_experience_id := coalesce(nullif(v_experience->>'id', '')::uuid, gen_random_uuid());

  select e.version, e.is_active
    into v_current_version, v_prev_is_active
  from public.experiences e
  where e.id = v_experience_id
  for update;

  if found then
    if v_expected_version is null then
      raise exception 'Version conflict: expected experience.version is required for updates';
    end if;
    if v_expected_version <> v_current_version then
      raise exception 'Version conflict: this test was updated by another admin (current version: %, your version: %)', v_current_version, v_expected_version;
    end if;

    update public.experiences
      set product_id = v_product_id,
          name = v_experience_name,
          display_order = v_display_order,
          is_active = v_is_active,
          metadata = v_experience_metadata,
          price_amount = v_price_amount,
          price_currency = v_price_currency,
          version = v_current_version + 1
    where id = v_experience_id
      and version = v_expected_version;

    if not found then
      raise exception 'Version conflict: failed to update due to concurrent change';
    end if;

    v_next_version := v_current_version + 1;
  else
    insert into public.experiences (
      id,
      product_id,
      name,
      display_order,
      is_active,
      metadata,
      price_amount,
      price_currency,
      version
    ) values (
      v_experience_id,
      v_product_id,
      v_experience_name,
      v_display_order,
      v_is_active,
      v_experience_metadata,
      v_price_amount,
      v_price_currency,
      1
    );

    v_next_version := 1;
  end if;

  v_sections_json := coalesce(p_payload->'sections', '[]'::jsonb);
  if jsonb_typeof(v_sections_json) <> 'array' or jsonb_array_length(v_sections_json) = 0 then
    raise exception 'sections must be a non-empty array';
  end if;

  for v_section in
    select value as value, ordinality as ord
    from jsonb_array_elements(v_sections_json) with ordinality
  loop
    if jsonb_typeof(v_section.value) <> 'object' then
      raise exception 'sections[%] must be an object', v_section.ord;
    end if;

    v_section_id := coalesce(nullif(v_section.value->>'id', '')::uuid, gen_random_uuid());
    v_section_name := trim(coalesce(v_section.value->>'name', ''));
    if v_section_name = '' then
      raise exception 'sections[%].name is required', v_section.ord;
    end if;

    v_section_display_order := coalesce(nullif(v_section.value->>'display_order', '')::integer, v_section.ord::integer);
    v_section_metadata := coalesce(v_section.value->'metadata', '{}'::jsonb);
    if jsonb_typeof(v_section_metadata) <> 'object' then
      v_section_metadata := '{}'::jsonb;
    end if;

    insert into public.sections (id, experience_id, name, display_order, metadata)
    values (v_section_id, v_experience_id, v_section_name, v_section_display_order, v_section_metadata)
    on conflict (id) do update
      set experience_id = excluded.experience_id,
          name = excluded.name,
          display_order = excluded.display_order,
          metadata = excluded.metadata;

    v_counts_sections := v_counts_sections + 1;

    if jsonb_typeof(v_section.value->'parts') <> 'array' or jsonb_array_length(v_section.value->'parts') = 0 then
      raise exception 'sections[%].parts must be a non-empty array', v_section.ord;
    end if;

    for v_part in
      select value as value, ordinality as ord
      from jsonb_array_elements(v_section.value->'parts') with ordinality
    loop
      if jsonb_typeof(v_part.value) <> 'object' then
        raise exception 'sections[%].parts[%] must be an object', v_section.ord, v_part.ord;
      end if;

      v_part_id := coalesce(nullif(v_part.value->>'id', '')::uuid, gen_random_uuid());
      v_part_name := trim(coalesce(v_part.value->>'name', ''));
      if v_part_name = '' then
        raise exception 'sections[%].parts[%].name is required', v_section.ord, v_part.ord;
      end if;

      v_part_display_order := coalesce(nullif(v_part.value->>'display_order', '')::integer, v_part.ord::integer);
      v_part_metadata := coalesce(v_part.value->'metadata', '{}'::jsonb);
      if jsonb_typeof(v_part_metadata) <> 'object' then
        v_part_metadata := '{}'::jsonb;
      end if;

      insert into public.parts (id, section_id, name, display_order, metadata)
      values (v_part_id, v_section_id, v_part_name, v_part_display_order, v_part_metadata)
      on conflict (id) do update
        set section_id = excluded.section_id,
            name = excluded.name,
            display_order = excluded.display_order,
            metadata = excluded.metadata;

      v_counts_parts := v_counts_parts + 1;

      if jsonb_typeof(v_part.value->'content_units') <> 'array' or jsonb_array_length(v_part.value->'content_units') = 0 then
        raise exception 'sections[%].parts[%].content_units must be a non-empty array', v_section.ord, v_part.ord;
      end if;

      for v_unit in
        select value as value, ordinality as ord
        from jsonb_array_elements(v_part.value->'content_units') with ordinality
      loop
        if jsonb_typeof(v_unit.value) <> 'object' then
          raise exception 'sections[%].parts[%].content_units[%] must be an object', v_section.ord, v_part.ord, v_unit.ord;
        end if;

        v_unit_id := coalesce(nullif(v_unit.value->>'id', '')::uuid, gen_random_uuid());
        v_unit_type := trim(coalesce(v_unit.value->>'type', ''));
        if v_unit_type = '' then
          raise exception 'sections[%].parts[%].content_units[%].type is required', v_section.ord, v_part.ord, v_unit.ord;
        end if;

        v_unit_data := coalesce(v_unit.value->'data', '{}'::jsonb);
        if jsonb_typeof(v_unit_data) <> 'object' then
          raise exception 'sections[%].parts[%].content_units[%].data must be an object', v_section.ord, v_part.ord, v_unit.ord;
        end if;

        v_unit_metadata := coalesce(v_unit.value->'metadata', '{}'::jsonb);
        if jsonb_typeof(v_unit_metadata) <> 'object' then
          v_unit_metadata := '{}'::jsonb;
        end if;

        v_unit_display_order := coalesce(nullif(v_unit.value->>'display_order', '')::integer, v_unit.ord::integer);

        insert into public.content_units (id, part_id, type, data, display_order, metadata)
        values (v_unit_id, v_part_id, v_unit_type, v_unit_data, v_unit_display_order, v_unit_metadata)
        on conflict (id) do update
          set part_id = excluded.part_id,
              type = excluded.type,
              data = excluded.data,
              display_order = excluded.display_order,
              metadata = excluded.metadata;

        v_counts_units := v_counts_units + 1;
        v_payload_unit_ids := array_append(v_payload_unit_ids, v_unit_id);

        if jsonb_typeof(v_unit.value#>'{answer_key,correct}') = 'object' then
          insert into public.answer_keys (content_unit_id, correct, metadata)
          values (
            v_unit_id,
            v_unit.value#>'{answer_key,correct}',
            case
              when jsonb_typeof(v_unit.value#>'{answer_key,metadata}') = 'object' then v_unit.value#>'{answer_key,metadata}'
              else '{}'::jsonb
            end
          )
          on conflict (content_unit_id) do update
            set correct = excluded.correct,
                metadata = excluded.metadata;

          v_counts_keys := v_counts_keys + 1;
          v_collected_key_unit_ids := array_append(v_collected_key_unit_ids, v_unit_id);
        end if;
      end loop;
    end loop;
  end loop;

  if jsonb_typeof(p_payload->'answer_key_unit_ids') = 'array' and jsonb_array_length(p_payload->'answer_key_unit_ids') > 0 then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_payload_key_unit_ids
    from jsonb_array_elements_text(p_payload->'answer_key_unit_ids') as t(value)
    where nullif(value, '') is not null;
  else
    v_payload_key_unit_ids := v_collected_key_unit_ids;
  end if;

  if array_length(v_payload_unit_ids, 1) is not null then
    if array_length(v_payload_key_unit_ids, 1) is not null then
      delete from public.answer_keys
      where content_unit_id = any(v_payload_unit_ids)
        and not (content_unit_id = any(v_payload_key_unit_ids));
    else
      delete from public.answer_keys
      where content_unit_id = any(v_payload_unit_ids);
    end if;
  end if;

  v_deleted := coalesce(p_payload->'deleted', '{}'::jsonb);

  if jsonb_typeof(v_deleted->'unit_ids') = 'array' and jsonb_array_length(v_deleted->'unit_ids') > 0 then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_deleted_units
    from jsonb_array_elements_text(v_deleted->'unit_ids') as t(value)
    where nullif(value, '') is not null;
  end if;

  if jsonb_typeof(v_deleted->'part_ids') = 'array' and jsonb_array_length(v_deleted->'part_ids') > 0 then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_deleted_parts
    from jsonb_array_elements_text(v_deleted->'part_ids') as t(value)
    where nullif(value, '') is not null;
  end if;

  if jsonb_typeof(v_deleted->'section_ids') = 'array' and jsonb_array_length(v_deleted->'section_ids') > 0 then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_deleted_sections
    from jsonb_array_elements_text(v_deleted->'section_ids') as t(value)
    where nullif(value, '') is not null;
  end if;

  if array_length(v_deleted_units, 1) is not null then
    delete from public.content_units where id = any(v_deleted_units);
  end if;

  if array_length(v_deleted_parts, 1) is not null then
    delete from public.parts where id = any(v_deleted_parts);
  end if;

  if array_length(v_deleted_sections, 1) is not null then
    delete from public.sections where id = any(v_deleted_sections);
  end if;

  if v_is_active then
    perform public.admin_builder_assert_publish_ready_experience(v_experience_id);
  end if;

  v_effective_action := nullif(trim(coalesce(p_action, '')), '');
  if v_effective_action is null then
    if v_is_active and not coalesce(v_prev_is_active, false) then
      v_effective_action := 'publish';
    else
      v_effective_action := 'save';
    end if;
  end if;

  v_snapshot_payload := p_payload;
  if jsonb_typeof(v_snapshot_payload->'experience') <> 'object' then
    v_snapshot_payload := jsonb_set(v_snapshot_payload, '{experience}', '{}'::jsonb, true);
  end if;
  v_snapshot_payload := jsonb_set(v_snapshot_payload, '{experience,id}', to_jsonb(v_experience_id::text), true);
  v_snapshot_payload := jsonb_set(v_snapshot_payload, '{experience,version}', to_jsonb(v_next_version), true);

  insert into public.experience_snapshots (experience_id, version, action, payload, created_by)
  values (v_experience_id, v_next_version, v_effective_action, v_snapshot_payload, p_actor)
  returning id into v_snapshot_id;

  return jsonb_build_object(
    'experience_id', v_experience_id,
    'version', v_next_version,
    'snapshot_id', v_snapshot_id,
    'counts', jsonb_build_object(
      'sections', v_counts_sections,
      'parts', v_counts_parts,
      'content_units', v_counts_units,
      'answer_keys', v_counts_keys
    )
  );
end;
$$;

create or replace function public.admin_builder_rollback(
  p_snapshot_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot record;
  v_payload jsonb;
  v_current_version integer;
  v_result jsonb;
begin
  select id, experience_id, payload
    into v_snapshot
  from public.experience_snapshots
  where id = p_snapshot_id;

  if not found then
    raise exception 'Snapshot not found';
  end if;

  select version
    into v_current_version
  from public.experiences
  where id = v_snapshot.experience_id
  for update;

  if not found then
    raise exception 'Experience not found for snapshot';
  end if;

  v_payload := coalesce(v_snapshot.payload, '{}'::jsonb);
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Snapshot payload is invalid';
  end if;

  if jsonb_typeof(v_payload->'experience') <> 'object' then
    v_payload := jsonb_set(v_payload, '{experience}', '{}'::jsonb, true);
  end if;

  v_payload := jsonb_set(v_payload, '{experience,id}', to_jsonb(v_snapshot.experience_id::text), true);
  v_payload := jsonb_set(v_payload, '{experience,version}', to_jsonb(v_current_version), true);

  v_result := public.admin_builder_save(v_payload, p_actor, 'rollback');
  return v_result || jsonb_build_object('source_snapshot_id', p_snapshot_id);
end;
$$;

revoke all on function public.admin_builder_estimate_unit_max_score(text, jsonb) from public;
revoke all on function public.admin_builder_assert_publish_ready_experience(uuid) from public;
revoke all on function public.admin_builder_save(jsonb, uuid, text) from public;
revoke all on function public.admin_builder_rollback(uuid, uuid) from public;

grant execute on function public.admin_builder_estimate_unit_max_score(text, jsonb) to service_role;
grant execute on function public.admin_builder_assert_publish_ready_experience(uuid) to service_role;
grant execute on function public.admin_builder_save(jsonb, uuid, text) to service_role;
grant execute on function public.admin_builder_rollback(uuid, uuid) to service_role;
