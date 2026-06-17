-- Academy role grants: first-class staff/admin access lifecycle with audit trail.

alter table public.academy_staff
  drop constraint if exists academy_staff_role_check;

alter table public.academy_staff
  add constraint academy_staff_role_check
  check (role in ('admin','center_admin','teacher','manager','counselor','assistant'));

create table if not exists public.academy_role_grants (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid references public.users(id) on delete set null,
  email         text not null,
  display_name  text,
  role          text not null
    check (role in ('owner','admin','center_admin','manager','counselor','teacher','assistant')),
  scope_type    text not null default 'academy'
    check (scope_type in ('academy','classrooms','students')),
  scope_ids     jsonb not null default '[]'::jsonb,
  status        text not null default 'invited'
    check (status in ('invited','active','suspended','expired','revoked')),
  granted_by    uuid references public.users(id) on delete set null,
  revoked_by    uuid references public.users(id) on delete set null,
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz,
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (academy_id, email)
);

create index if not exists academy_role_grants_academy_idx
  on public.academy_role_grants(academy_id);

create index if not exists academy_role_grants_user_idx
  on public.academy_role_grants(user_id)
  where user_id is not null;

create index if not exists academy_role_grants_email_idx
  on public.academy_role_grants(lower(email));

create index if not exists academy_role_grants_status_idx
  on public.academy_role_grants(academy_id, status);

create table if not exists public.academy_access_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.tenants(id) on delete cascade,
  actor_user_id   uuid references public.users(id) on delete set null,
  target_user_id  uuid references public.users(id) on delete set null,
  target_email    text,
  action          text not null,
  role            text,
  previous_status text,
  next_status     text,
  scope_type      text,
  scope_ids       jsonb not null default '[]'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists academy_access_audit_logs_academy_idx
  on public.academy_access_audit_logs(academy_id, created_at desc);

create index if not exists academy_access_audit_logs_target_idx
  on public.academy_access_audit_logs(academy_id, lower(target_email));

alter table public.academy_role_grants enable row level security;
alter table public.academy_access_audit_logs enable row level security;

drop policy if exists "Academy role grants read by admin" on public.academy_role_grants;
create policy "Academy role grants read by admin"
  on public.academy_role_grants for select
  using (public.is_academy_admin(academy_id));

drop policy if exists "Academy role grants manage by admin" on public.academy_role_grants;
create policy "Academy role grants manage by admin"
  on public.academy_role_grants for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy access audit read by admin" on public.academy_access_audit_logs;
create policy "Academy access audit read by admin"
  on public.academy_access_audit_logs for select
  using (public.is_academy_admin(academy_id));

drop policy if exists "Academy access audit insert by admin" on public.academy_access_audit_logs;
create policy "Academy access audit insert by admin"
  on public.academy_access_audit_logs for insert
  with check (public.is_academy_admin(academy_id));

drop trigger if exists academy_role_grants_updated_at on public.academy_role_grants;
create trigger academy_role_grants_updated_at
  before update on public.academy_role_grants
  for each row execute procedure public.handle_teacher_studio_updated_at();

insert into public.academy_role_grants (
  academy_id,
  user_id,
  email,
  display_name,
  role,
  scope_type,
  scope_ids,
  status,
  granted_by,
  starts_at,
  revoked_at,
  metadata,
  created_at,
  updated_at
)
select
  s.academy_id,
  s.user_id,
  lower(s.email),
  s.display_name,
  s.role,
  case when s.role in ('teacher','assistant') then 'classrooms' else 'academy' end,
  coalesce(s.classroom_ids, '[]'::jsonb),
  case when s.is_active then 'active' else 'revoked' end,
  s.created_by,
  s.created_at,
  case when s.is_active then null else s.updated_at end,
  jsonb_build_object('backfilled_from', 'academy_staff'),
  s.created_at,
  s.updated_at
from public.academy_staff s
where not exists (
  select 1
  from public.academy_role_grants g
  where g.academy_id = s.academy_id
    and lower(g.email) = lower(s.email)
);
