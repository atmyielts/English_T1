-- ============================================================================
-- SECTION TEMPLATE LIBRARY + SECTION INSTANCES (ADMIN BUILDER EVOLUTION)
-- - reusable section templates with immutable version rows
-- - section instances linked to template version + source snapshot
-- - deterministic test composition through fixed template version references
-- ============================================================================

create table if not exists public.section_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  section_type text not null,
  latest_version integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint section_templates_type_chk check (lower(section_type) in ('listening', 'reading', 'writing'))
);

create index if not exists section_templates_product_idx
  on public.section_templates(product_id, is_active, updated_at desc);

create trigger section_templates_updated_at
before update on public.section_templates
for each row
execute procedure public.handle_user_updated_at();

create table if not exists public.section_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.section_templates(id) on delete cascade,
  version integer not null,
  section_payload jsonb not null,
  source_snapshot_id uuid references public.experience_snapshots(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint section_template_versions_payload_obj_chk check (jsonb_typeof(section_payload) = 'object'),
  unique(template_id, version)
);

create index if not exists section_template_versions_template_idx
  on public.section_template_versions(template_id, version desc);

create index if not exists section_template_versions_snapshot_idx
  on public.section_template_versions(source_snapshot_id);

create table if not exists public.section_instances (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  template_id uuid not null references public.section_templates(id) on delete restrict,
  template_version_id uuid not null references public.section_template_versions(id) on delete restrict,
  template_version integer not null,
  source_snapshot_id uuid references public.experience_snapshots(id) on delete set null,
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section_id)
);

create index if not exists section_instances_experience_order_idx
  on public.section_instances(experience_id, display_order);

create index if not exists section_instances_template_idx
  on public.section_instances(template_id, template_version_id);

create trigger section_instances_updated_at
before update on public.section_instances
for each row
execute procedure public.handle_user_updated_at();

alter table public.section_templates enable row level security;
alter table public.section_template_versions enable row level security;
alter table public.section_instances enable row level security;

drop policy if exists "Admins can manage section templates" on public.section_templates;
create policy "Admins can manage section templates"
on public.section_templates
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage section template versions" on public.section_template_versions;
create policy "Admins can manage section template versions"
on public.section_template_versions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage section instances" on public.section_instances;
create policy "Admins can manage section instances"
on public.section_instances
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.admin_section_templates_list(
  p_product_id uuid
)
returns table (
  template_id uuid,
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

create or replace function public.admin_section_template_get_payload(
  p_template_version_id uuid
)
returns table (
  template_version_id uuid,
  template_id uuid,
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
  if v_section_type not in ('listening', 'reading', 'writing') then
    raise exception 'section_type must be one of listening|reading|writing';
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

create or replace function public.admin_builder_sync_section_instances(
  p_experience_id uuid,
  p_sections jsonb,
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
  v_section_id uuid;
  v_metadata jsonb;
  v_template_ref jsonb;
  v_template_id uuid;
  v_template_version_id uuid;
  v_template_version integer;
  v_source_snapshot_id uuid;
  v_display_order integer;
  v_rows integer := 0;
begin
  if p_experience_id is null then
    raise exception 'experience_id is required';
  end if;

  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'sections must be an array';
  end if;

  delete from public.section_instances where experience_id = p_experience_id;

  for v_section in
    select value as value, ordinality as ord
    from jsonb_array_elements(p_sections) with ordinality
  loop
    if jsonb_typeof(v_section.value) <> 'object' then
      continue;
    end if;

    v_section_id := nullif(v_section.value->>'id', '')::uuid;
    if v_section_id is null then
      continue;
    end if;

    v_display_order := coalesce(nullif(v_section.value->>'display_order', '')::integer, v_section.ord::integer);
    v_metadata := coalesce(v_section.value->'metadata', '{}'::jsonb);
    if jsonb_typeof(v_metadata) <> 'object' then
      continue;
    end if;

    v_template_ref := v_metadata->'template_ref';
    if jsonb_typeof(v_template_ref) <> 'object' then
      continue;
    end if;

    v_template_id := nullif(v_template_ref->>'template_id', '')::uuid;
    v_template_version_id := nullif(v_template_ref->>'template_version_id', '')::uuid;

    if v_template_id is null or v_template_version_id is null then
      continue;
    end if;

    v_template_version := nullif(v_template_ref->>'template_version', '')::integer;
    if v_template_version is null then
      select stv.version
        into v_template_version
      from public.section_template_versions stv
      where stv.id = v_template_version_id;
    end if;

    if v_template_version is null then
      raise exception 'Template version not found for section %', v_section_id;
    end if;

    v_source_snapshot_id := nullif(v_template_ref->>'source_snapshot_id', '')::uuid;

    insert into public.section_instances (
      experience_id,
      section_id,
      template_id,
      template_version_id,
      template_version,
      source_snapshot_id,
      display_order,
      metadata,
      created_by
    ) values (
      p_experience_id,
      v_section_id,
      v_template_id,
      v_template_version_id,
      v_template_version,
      v_source_snapshot_id,
      v_display_order,
      '{}'::jsonb,
      p_actor
    );

    v_rows := v_rows + 1;
  end loop;

  return v_rows;
end;
$$;
