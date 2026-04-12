-- ============================================================================
-- IELTS material standardization
-- - stable template keys for section templates
-- - reusable part template library
-- - canonical template lookup helpers
-- - IELTS-specific publish gate hardening layered on top of shared builder logic
-- ============================================================================

create or replace function public.admin_template_slug(p_value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

alter table public.section_templates
  add column if not exists template_key text;

update public.section_templates
set template_key = concat(
  coalesce(nullif(public.admin_template_slug(name), ''), 'section-template'),
  '-',
  substr(replace(id::text, '-', ''), 1, 8)
)
where coalesce(trim(template_key), '') = '';

alter table public.section_templates
  alter column template_key set not null;

create unique index if not exists section_templates_product_key_uidx
  on public.section_templates(product_id, template_key);

create table if not exists public.part_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  template_key text not null,
  module_type text not null,
  latest_version integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint part_templates_module_type_chk check (lower(module_type) in ('listening', 'reading', 'writing')),
  constraint part_templates_product_key_unique unique (product_id, template_key)
);

create index if not exists part_templates_product_idx
  on public.part_templates(product_id, module_type, is_active, updated_at desc);

drop trigger if exists part_templates_updated_at on public.part_templates;
create trigger part_templates_updated_at
before update on public.part_templates
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.part_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.part_templates(id) on delete cascade,
  version integer not null,
  part_payload jsonb not null,
  source_section_template_version_id uuid references public.section_template_versions(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint part_template_versions_payload_obj_chk check (jsonb_typeof(part_payload) = 'object'),
  unique(template_id, version)
);

create index if not exists part_template_versions_template_idx
  on public.part_template_versions(template_id, version desc);

create index if not exists part_template_versions_source_section_idx
  on public.part_template_versions(source_section_template_version_id);

alter table public.part_templates enable row level security;
alter table public.part_template_versions enable row level security;

drop policy if exists "Admins can manage part templates" on public.part_templates;
create policy "Admins can manage part templates"
on public.part_templates
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage part template versions" on public.part_template_versions;
create policy "Admins can manage part template versions"
on public.part_template_versions
for all
using (public.is_admin())
with check (public.is_admin());

drop function if exists public.admin_section_templates_list(uuid);
create or replace function public.admin_section_templates_list(
  p_product_id uuid
)
returns table (
  template_id uuid,
  template_key text,
  template_name text,
  section_type text,
  latest_version integer,
  latest_version_id uuid,
  latest_source_snapshot_id uuid,
  version_count integer,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    st.id as template_id,
    st.template_key,
    st.name as template_name,
    st.section_type,
    st.latest_version,
    stv.id as latest_version_id,
    stv.source_snapshot_id as latest_source_snapshot_id,
    coalesce(vcnt.total_versions, 0) as version_count,
    st.updated_at,
    st.created_at
  from public.section_templates st
  left join public.section_template_versions stv
    on stv.template_id = st.id
   and stv.version = st.latest_version
  left join lateral (
    select count(*)::integer as total_versions
    from public.section_template_versions v
    where v.template_id = st.id
  ) vcnt on true
  where st.product_id = p_product_id
    and st.is_active = true
  order by st.updated_at desc, st.created_at desc;
$$;

drop function if exists public.admin_section_template_get_payload(uuid);
create or replace function public.admin_section_template_get_payload(
  p_template_version_id uuid
)
returns table (
  template_version_id uuid,
  template_id uuid,
  template_key text,
  template_name text,
  section_type text,
  version integer,
  source_snapshot_id uuid,
  section_payload jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    stv.id as template_version_id,
    st.id as template_id,
    st.template_key,
    st.name as template_name,
    st.section_type,
    stv.version,
    stv.source_snapshot_id,
    stv.section_payload
  from public.section_template_versions stv
  join public.section_templates st on st.id = stv.template_id
  where stv.id = p_template_version_id
  limit 1;
$$;

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

create or replace function public.admin_part_templates_list(
  p_product_id uuid
)
returns table (
  template_id uuid,
  template_key text,
  template_name text,
  module_type text,
  latest_version integer,
  latest_version_id uuid,
  latest_source_section_template_version_id uuid,
  version_count integer,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    pt.id as template_id,
    pt.template_key,
    pt.name as template_name,
    pt.module_type,
    pt.latest_version,
    ptv.id as latest_version_id,
    ptv.source_section_template_version_id as latest_source_section_template_version_id,
    coalesce(vcnt.total_versions, 0) as version_count,
    pt.updated_at,
    pt.created_at
  from public.part_templates pt
  left join public.part_template_versions ptv
    on ptv.template_id = pt.id
   and ptv.version = pt.latest_version
  left join lateral (
    select count(*)::integer as total_versions
    from public.part_template_versions v
    where v.template_id = pt.id
  ) vcnt on true
  where pt.product_id = p_product_id
    and pt.is_active = true
  order by pt.module_type asc, pt.updated_at desc, pt.created_at desc;
$$;

create or replace function public.admin_part_template_get_payload(
  p_template_version_id uuid
)
returns table (
  template_version_id uuid,
  template_id uuid,
  template_key text,
  template_name text,
  module_type text,
  version integer,
  source_section_template_version_id uuid,
  part_payload jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ptv.id as template_version_id,
    pt.id as template_id,
    pt.template_key,
    pt.name as template_name,
    pt.module_type,
    ptv.version,
    ptv.source_section_template_version_id,
    ptv.part_payload
  from public.part_template_versions ptv
  join public.part_templates pt on pt.id = ptv.template_id
  where ptv.id = p_template_version_id
  limit 1;
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
  if v_module_type not in ('listening', 'reading', 'writing') then
    raise exception 'module_type must be one of listening|reading|writing';
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
  v_writing_sections integer := 0;
  v_part_count integer := 0;
begin
  if p_experience_id is null then
    raise exception 'Publish gate: experience_id is required';
  end if;

  select lower(coalesce(p.metadata->>'slug', ''))
    into v_product_slug
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
    if v_type not in ('listening', 'reading', 'writing', 'reading_writing', 'math') then
      raise exception 'Publish gate: section "%" is missing a valid type', coalesce(v_section.name, v_section.id::text);
    end if;

    if v_type = 'listening' then
      v_listening_sections := v_listening_sections + 1;
    elsif v_type = 'reading' then
      v_reading_sections := v_reading_sections + 1;
    elsif v_type = 'writing' then
      v_writing_sections := v_writing_sections + 1;
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

    if v_type in ('listening', 'reading') and v_section_max <> 40 then
      raise exception 'Publish gate: section "%" max score is %, expected 40', coalesce(v_section.name, v_section.id::text), v_section_max;
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
end;
$$;

grant execute on function public.admin_section_templates_list(uuid) to service_role;
grant execute on function public.admin_section_template_get_payload(uuid) to service_role;
grant execute on function public.admin_section_template_upsert(uuid, text, text, text, jsonb, uuid, uuid, uuid) to service_role;
grant execute on function public.admin_part_templates_list(uuid) to service_role;
grant execute on function public.admin_part_template_get_payload(uuid) to service_role;
grant execute on function public.admin_part_template_upsert(uuid, text, text, text, jsonb, uuid, uuid, uuid) to service_role;
grant execute on function public.admin_builder_assert_publish_ready_experience(uuid) to service_role;
