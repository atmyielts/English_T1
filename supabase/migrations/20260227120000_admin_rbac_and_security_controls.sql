-- Admin RBAC, security controls, and activity audit logs.

create table if not exists public.admin_permissions_catalog (
  permission_key text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role text not null,
  permission_key text not null references public.admin_permissions_catalog(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_key)
);

create table if not exists public.admin_user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  permission_key text not null references public.admin_permissions_catalog(permission_key) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create or replace function public.admin_user_permissions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_user_permissions_updated_at on public.admin_user_permissions;
create trigger admin_user_permissions_updated_at
before update on public.admin_user_permissions
for each row
execute procedure public.admin_user_permissions_touch_updated_at();

create table if not exists public.admin_security_policies (
  id integer primary key default 1 check (id = 1),
  require_mfa boolean not null default true,
  session_timeout_minutes integer not null default 30 check (session_timeout_minutes between 5 and 240),
  rate_limit_per_minute integer not null default 120 check (rate_limit_per_minute between 10 and 2000),
  ip_allowlist text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.admin_security_policies_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_security_policies_updated_at on public.admin_security_policies;
create trigger admin_security_policies_updated_at
before update on public.admin_security_policies
for each row
execute procedure public.admin_security_policies_touch_updated_at();

insert into public.admin_security_policies (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.admin_api_rate_limits (
  user_id uuid not null references public.users(id) on delete cascade,
  route_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, route_key, window_started_at)
);

create or replace function public.admin_api_rate_limits_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_api_rate_limits_updated_at on public.admin_api_rate_limits;
create trigger admin_api_rate_limits_updated_at
before update on public.admin_api_rate_limits
for each row
execute procedure public.admin_api_rate_limits_touch_updated_at();

create index if not exists admin_api_rate_limits_window_idx on public.admin_api_rate_limits(window_started_at);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  user_email text,
  role text,
  permission_key text,
  action text not null,
  method text not null,
  path text not null,
  status_code integer not null,
  ip text,
  user_agent text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_user_id_idx on public.admin_audit_logs(user_id);
create index if not exists admin_audit_logs_status_code_idx on public.admin_audit_logs(status_code);

insert into public.admin_permissions_catalog (permission_key, label, description)
values
  ('admin.*', 'Full admin access', 'Bypasses granular permission checks.'),
  ('admin.portal.access', 'Admin portal access', 'Open and use the /admin workspace.'),
  ('admin.analytics.view', 'View analytics', 'Read platform analytics dashboards.'),
  ('admin.activity.view', 'View admin activity', 'Read admin activity and audit logs.'),
  ('admin.products.manage', 'Manage products', 'Create/update/archive platform products.'),
  ('admin.billing.manage', 'Manage billing plans', 'Create/update plans and billing settings.'),
  ('admin.coupons.manage', 'Manage coupons', 'Create/update coupon campaigns.'),
  ('admin.payments.manage', 'Manage payments', 'Inspect and repair payment state.'),
  ('admin.users.manage', 'Manage users', 'Update user roles and grants.'),
  ('admin.trials.manage', 'Manage trials', 'Configure trial defaults and overrides.'),
  ('admin.settings.manage', 'Manage platform settings', 'Update global platform controls.'),
  ('admin.support.manage', 'Manage support', 'Review support conversations.'),
  ('admin.announcements.manage', 'Manage announcements', 'Publish and edit announcements.'),
  ('admin.assets.manage', 'Manage assets', 'Upload/manage media assets from admin tools.'),
  ('admin.tests.manage', 'Manage tests', 'Manage test metadata and publishing.'),
  ('admin.builder.manage', 'Manage test builder', 'Use admin builder workflows.')
on conflict (permission_key) do update
set label = excluded.label,
    description = excluded.description;

-- Super-admin role keeps full wildcard.
insert into public.admin_role_permissions (role, permission_key)
values ('admin', 'admin.*')
on conflict (role, permission_key) do nothing;

-- Read-only analytics role.
insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_readonly', 'admin.portal.access'),
  ('admin_readonly', 'admin.analytics.view'),
  ('admin_readonly', 'admin.activity.view')
on conflict (role, permission_key) do nothing;

-- Operations role (users/support/announcements).
insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_ops', 'admin.portal.access'),
  ('admin_ops', 'admin.analytics.view'),
  ('admin_ops', 'admin.activity.view'),
  ('admin_ops', 'admin.users.manage'),
  ('admin_ops', 'admin.support.manage'),
  ('admin_ops', 'admin.announcements.manage'),
  ('admin_ops', 'admin.trials.manage')
on conflict (role, permission_key) do nothing;

-- Commerce role.
insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_commerce', 'admin.portal.access'),
  ('admin_commerce', 'admin.analytics.view'),
  ('admin_commerce', 'admin.activity.view'),
  ('admin_commerce', 'admin.billing.manage'),
  ('admin_commerce', 'admin.coupons.manage'),
  ('admin_commerce', 'admin.payments.manage')
on conflict (role, permission_key) do nothing;

-- Content role.
insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_content', 'admin.portal.access'),
  ('admin_content', 'admin.analytics.view'),
  ('admin_content', 'admin.activity.view'),
  ('admin_content', 'admin.products.manage'),
  ('admin_content', 'admin.assets.manage'),
  ('admin_content', 'admin.tests.manage'),
  ('admin_content', 'admin.builder.manage')
on conflict (role, permission_key) do nothing;

create or replace function public.admin_effective_permissions(
  p_user_id uuid,
  p_role text default null
)
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  with resolved_role as (
    select coalesce(nullif(trim(lower(p_role)), ''), lower(u.role)) as role
    from public.users u
    where u.id = p_user_id
    limit 1
  ),
  base_perms as (
    select rp.permission_key
    from public.admin_role_permissions rp
    join resolved_role rr on rr.role = lower(rp.role)
  ),
  allow_overrides as (
    select up.permission_key
    from public.admin_user_permissions up
    where up.user_id = p_user_id and up.is_allowed = true
  ),
  deny_overrides as (
    select up.permission_key
    from public.admin_user_permissions up
    where up.user_id = p_user_id and up.is_allowed = false
  ),
  combined as (
    select permission_key from base_perms
    union
    select permission_key from allow_overrides
  )
  select c.permission_key
  from combined c
  where not exists (
    select 1
    from deny_overrides d
    where d.permission_key = c.permission_key
  );
$$;

revoke all on function public.admin_effective_permissions(uuid, text) from public;
grant execute on function public.admin_effective_permissions(uuid, text) to service_role;

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
  on conflict (user_id, route_key, window_started_at)
  do update set request_count = public.admin_api_rate_limits.request_count + 1,
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

revoke all on function public.admin_rate_limit_consume(uuid, text, integer, integer) from public;
grant execute on function public.admin_rate_limit_consume(uuid, text, integer, integer) to service_role;

alter table public.admin_permissions_catalog enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_permissions enable row level security;
alter table public.admin_security_policies enable row level security;
alter table public.admin_api_rate_limits enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admin permissions read (admin only)" on public.admin_permissions_catalog;
create policy "Admin permissions read (admin only)"
on public.admin_permissions_catalog
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);

drop policy if exists "Admin role permissions read (admin only)" on public.admin_role_permissions;
create policy "Admin role permissions read (admin only)"
on public.admin_role_permissions
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);

drop policy if exists "Admin role permissions manage (admin only)" on public.admin_role_permissions;
create policy "Admin role permissions manage (admin only)"
on public.admin_role_permissions
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Admin user permissions read (admin only)" on public.admin_user_permissions;
create policy "Admin user permissions read (admin only)"
on public.admin_user_permissions
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);

drop policy if exists "Admin user permissions manage (admin only)" on public.admin_user_permissions;
create policy "Admin user permissions manage (admin only)"
on public.admin_user_permissions
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Admin security policies read (admin only)" on public.admin_security_policies;
create policy "Admin security policies read (admin only)"
on public.admin_security_policies
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);

drop policy if exists "Admin security policies manage (admin only)" on public.admin_security_policies;
create policy "Admin security policies manage (admin only)"
on public.admin_security_policies
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Admin rate limits read (admin only)" on public.admin_api_rate_limits;
create policy "Admin rate limits read (admin only)"
on public.admin_api_rate_limits
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);

drop policy if exists "Admin audit logs read (admin only)" on public.admin_audit_logs;
create policy "Admin audit logs read (admin only)"
on public.admin_audit_logs
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and lower(u.role) like 'admin%'
  )
);
