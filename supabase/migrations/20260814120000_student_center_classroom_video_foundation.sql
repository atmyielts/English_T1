-- Unified Student Center, Classroom 2.0 delivery, and managed video foundation.
-- Additive and default-off: existing Academy and Platform contracts remain valid.

alter table public.platform_settings
  add column if not exists student_center_enabled boolean not null default false,
  add column if not exists classroom_v2_enabled boolean not null default false,
  add column if not exists academy_video_provider text not null default 'cloudflare_stream'
    check (academy_video_provider in ('cloudflare_stream')),
  add column if not exists academy_video_uploads_enabled boolean not null default false;

create table if not exists public.academy_session_delivery (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid not null,
  provider text not null default 'other'
    check (provider in ('zoom', 'google_meet', 'microsoft_teams', 'other')),
  attendee_url text not null check (attendee_url ~ '^https://'),
  join_opens_at timestamptz not null,
  join_closes_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, session_id),
  constraint academy_session_delivery_session_fk
    foreign key (academy_id, session_id)
    references public.academy_lesson_sessions(academy_id, id) on delete cascade,
  constraint academy_session_delivery_window_check check (join_closes_at > join_opens_at)
);

create index if not exists academy_session_delivery_window_idx
  on public.academy_session_delivery(academy_id, join_opens_at, join_closes_at)
  where status = 'active';

create table if not exists public.academy_video_policies (
  academy_id uuid primary key references public.tenants(id) on delete cascade,
  upload_enabled boolean not null default false,
  max_asset_duration_seconds integer not null default 0 check (max_asset_duration_seconds >= 0),
  max_total_stored_minutes integer not null default 0 check (max_total_stored_minutes >= 0),
  max_monthly_upload_minutes integer not null default 0 check (max_monthly_upload_minutes >= 0),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_video_policy_approval_check check (
    not upload_enabled or (
      approved_by is not null and approved_at is not null and
      max_asset_duration_seconds > 0 and
      max_total_stored_minutes > 0 and
      max_monthly_upload_minutes > 0
    )
  )
);

create table if not exists public.academy_video_assets (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'cloudflare_stream'
    check (provider in ('cloudflare_stream')),
  provider_asset_id text not null,
  title text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'uploading', 'processing', 'ready', 'failed', 'blocked', 'deleted')),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  failure_code text,
  failure_message text,
  created_by uuid references public.users(id) on delete set null,
  deleted_by uuid references public.users(id) on delete set null,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, academy_id),
  unique (provider, provider_asset_id)
);

create index if not exists academy_video_assets_usage_idx
  on public.academy_video_assets(academy_id, status, created_at desc)
  where status not in ('deleted', 'blocked', 'failed');

create table if not exists public.academy_lesson_media (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  lesson_id uuid not null,
  video_asset_id uuid not null,
  position integer not null default 0 check (position >= 0),
  required_for_completion boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lesson_id, video_asset_id),
  constraint academy_lesson_media_lesson_fk
    foreign key (lesson_id, academy_id)
    references public.academy_lessons(id, academy_id) on delete cascade,
  constraint academy_lesson_media_asset_fk
    foreign key (video_asset_id, academy_id)
    references public.academy_video_assets(id, academy_id) on delete restrict
);

create index if not exists academy_lesson_media_lesson_position_idx
  on public.academy_lesson_media(academy_id, lesson_id, position);

alter table public.academy_classroom_resources
  add column if not exists legacy_video_read_only boolean not null default false;

update public.academy_classroom_resources
set legacy_video_read_only = true
where kind = 'video' and legacy_video_read_only = false;

create or replace function public.academy_protect_legacy_video_resource()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.legacy_video_read_only then
      raise exception 'Legacy video resources are read-only';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' and new.kind = 'video' then
    raise exception 'New video resources must use managed lesson media';
  end if;

  if tg_op = 'UPDATE' and old.legacy_video_read_only then
    if (to_jsonb(new) - 'updated_at') is distinct from
       (to_jsonb(old) - 'updated_at') then
      raise exception 'Legacy video resources are read-only';
    end if;
    new.legacy_video_read_only := true;
  end if;

  if tg_op = 'UPDATE' and not old.legacy_video_read_only and new.kind = 'video' then
    raise exception 'New video resources must use managed lesson media';
  end if;

  return new;
end;
$$;

drop trigger if exists academy_classroom_resources_video_guard on public.academy_classroom_resources;
create trigger academy_classroom_resources_video_guard
before insert or update or delete on public.academy_classroom_resources
for each row execute function public.academy_protect_legacy_video_resource();

create or replace function public.academy_reserve_video_asset(
  p_academy_id uuid,
  p_lesson_id uuid,
  p_provider_asset_id text,
  p_title text,
  p_max_duration_seconds integer,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.academy_video_policies%rowtype;
  v_asset public.academy_video_assets%rowtype;
  v_reserved_minutes integer;
  v_stored_minutes integer;
  v_monthly_minutes integer;
begin
  if not coalesce((select academy_video_uploads_enabled from public.platform_settings where id = 1), false) then
    raise exception 'GLOBAL_DISABLED';
  end if;

  select * into v_policy
  from public.academy_video_policies
  where academy_id = p_academy_id
  for update;

  if not found or not v_policy.upload_enabled or v_policy.approved_by is null or v_policy.approved_at is null then
    raise exception 'ACADEMY_NOT_APPROVED';
  end if;
  if p_max_duration_seconds <= 0 or p_max_duration_seconds > v_policy.max_asset_duration_seconds then
    raise exception 'ASSET_DURATION_QUOTA';
  end if;
  if not exists (
    select 1 from public.academy_lessons
    where id = p_lesson_id and academy_id = p_academy_id and status = 'published'
  ) then
    raise exception 'PUBLISHED_LESSON_NOT_FOUND';
  end if;

  v_reserved_minutes := ceil(p_max_duration_seconds / 60.0)::integer;
  select coalesce(ceil(sum(coalesce(
    duration_seconds,
    case when metadata->>'max_duration_seconds' ~ '^[0-9]+$'
      then (metadata->>'max_duration_seconds')::integer else 0 end
  )) / 60.0), 0)::integer
  into v_stored_minutes
  from public.academy_video_assets
  where academy_id = p_academy_id and status not in ('deleted', 'blocked', 'failed');

  select coalesce(ceil(sum(coalesce(
    duration_seconds,
    case when metadata->>'max_duration_seconds' ~ '^[0-9]+$'
      then (metadata->>'max_duration_seconds')::integer else 0 end
  )) / 60.0), 0)::integer
  into v_monthly_minutes
  from public.academy_video_assets
  where academy_id = p_academy_id
    and status not in ('deleted', 'blocked', 'failed')
    and created_at >= date_trunc('month', now());

  if v_stored_minutes + v_reserved_minutes > v_policy.max_total_stored_minutes then
    raise exception 'STORAGE_QUOTA_REACHED';
  end if;
  if v_monthly_minutes + v_reserved_minutes > v_policy.max_monthly_upload_minutes then
    raise exception 'MONTHLY_UPLOAD_QUOTA_REACHED';
  end if;

  insert into public.academy_video_assets(
    academy_id, provider, provider_asset_id, title, status, created_by, metadata
  ) values (
    p_academy_id, 'cloudflare_stream', p_provider_asset_id, left(trim(p_title), 240),
    'reserved', p_created_by,
    jsonb_build_object('max_duration_seconds', p_max_duration_seconds, 'lesson_id', p_lesson_id)
  ) returning * into v_asset;

  insert into public.academy_lesson_media(academy_id, lesson_id, video_asset_id, created_by)
  values (p_academy_id, p_lesson_id, v_asset.id, p_created_by);

  return to_jsonb(v_asset);
end;
$$;

revoke all on function public.academy_reserve_video_asset(uuid, uuid, text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.academy_reserve_video_asset(uuid, uuid, text, text, integer, uuid)
  to service_role;

drop trigger if exists academy_session_delivery_updated_at on public.academy_session_delivery;
create trigger academy_session_delivery_updated_at
before update on public.academy_session_delivery
for each row execute function public.set_updated_at();

drop trigger if exists academy_video_policies_updated_at on public.academy_video_policies;
create trigger academy_video_policies_updated_at
before update on public.academy_video_policies
for each row execute function public.set_updated_at();

drop trigger if exists academy_video_assets_updated_at on public.academy_video_assets;
create trigger academy_video_assets_updated_at
before update on public.academy_video_assets
for each row execute function public.set_updated_at();

alter table public.academy_session_delivery enable row level security;
alter table public.academy_video_policies enable row level security;
alter table public.academy_video_assets enable row level security;
alter table public.academy_lesson_media enable row level security;

-- These contracts intentionally have no authenticated table policies. Access is
-- mediated by the role-checking Academy and Academy Video Edge Functions.
revoke all on public.academy_session_delivery from anon, authenticated;
revoke all on public.academy_video_policies from anon, authenticated;
revoke all on public.academy_video_assets from anon, authenticated;
revoke all on public.academy_lesson_media from anon, authenticated;

comment on table public.academy_session_delivery is
  'Role-protected external meeting details for Academy lesson sessions.';
comment on table public.academy_video_policies is
  'Master-admin approval and hard cost limits for managed Academy video.';
comment on table public.academy_video_assets is
  'Provider-backed video records. Media bytes never transit Supabase.';
