-- Rich education center operations: roles, students, groups, events, reviews, reports.

alter table public.tenant_memberships
  drop constraint if exists tenant_memberships_role_check;

alter table public.tenant_memberships
  add constraint tenant_memberships_role_check
  check (role in ('owner', 'admin', 'member', 'teacher', 'counselor'));

alter table public.partner_center_staff_invites
  drop constraint if exists partner_center_staff_invites_role_check;

alter table public.partner_center_staff_invites
  add constraint partner_center_staff_invites_role_check
  check (role in ('admin', 'member', 'teacher', 'counselor'));

alter table public.partner_center_staff_invites
  drop constraint if exists partner_center_staff_invites_status_check;

alter table public.partner_center_staff_invites
  add constraint partner_center_staff_invites_status_check
  check (status in ('pending', 'accepted', 'revoked', 'expired'));

create table if not exists public.partner_center_students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  full_name text,
  email text,
  phone text,
  status text not null default 'invited' check (status in ('invited', 'active', 'inactive', 'archived')),
  source_voucher_id uuid references public.partner_vouchers(id) on delete set null,
  source_invite_id uuid,
  last_activity_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_center_students_user_unique
  on public.partner_center_students (tenant_id, user_id)
  where user_id is not null;

create unique index if not exists partner_center_students_email_unique
  on public.partner_center_students (tenant_id, lower(email))
  where email is not null and length(email) > 0;

create index if not exists partner_center_students_tenant_idx
  on public.partner_center_students (tenant_id, status, updated_at desc);

create table if not exists public.partner_center_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  product_id uuid references public.products(id) on delete set null,
  assigned_teacher_membership_id uuid references public.tenant_memberships(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_center_groups_tenant_idx
  on public.partner_center_groups (tenant_id, status, created_at desc);

create table if not exists public.partner_center_group_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  group_id uuid not null references public.partner_center_groups(id) on delete cascade,
  student_id uuid not null references public.partner_center_students(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, student_id)
);

create index if not exists partner_center_group_members_tenant_idx
  on public.partner_center_group_members (tenant_id, group_id, status);

create table if not exists public.partner_center_student_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid references public.partner_center_students(id) on delete set null,
  group_id uuid references public.partner_center_groups(id) on delete set null,
  voucher_batch_id uuid references public.partner_voucher_batches(id) on delete set null,
  voucher_id uuid references public.partner_vouchers(id) on delete set null,
  full_name text,
  email text,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invite_url text,
  message text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_center_student_invites_tenant_idx
  on public.partner_center_student_invites (tenant_id, status, created_at desc);

create table if not exists public.partner_center_mock_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  product_id uuid references public.products(id) on delete set null,
  experience_id uuid references public.experiences(id) on delete set null,
  group_id uuid references public.partner_center_groups(id) on delete set null,
  voucher_batch_id uuid references public.partner_voucher_batches(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  mode text not null default 'online' check (mode in ('online', 'offline', 'hybrid')),
  location text,
  meeting_url text,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'scheduled' check (status in ('draft', 'scheduled', 'completed', 'cancelled')),
  instructions text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_center_mock_events_tenant_idx
  on public.partner_center_mock_events (tenant_id, status, starts_at desc);

create table if not exists public.partner_center_event_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.partner_center_mock_events(id) on delete cascade,
  student_id uuid references public.partner_center_students(id) on delete set null,
  voucher_id uuid references public.partner_vouchers(id) on delete set null,
  exam_registration_id uuid references public.exam_registrations(id) on delete set null,
  registration_status text not null default 'registered' check (registration_status in ('registered', 'cancelled', 'completed')),
  attendance_status text not null default 'pending' check (attendance_status in ('pending', 'present', 'absent', 'late')),
  checked_in_by uuid references public.users(id) on delete set null,
  checked_in_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, student_id),
  unique (event_id, voucher_id)
);

create index if not exists partner_center_event_registrations_tenant_idx
  on public.partner_center_event_registrations (tenant_id, event_id, attendance_status);

create table if not exists public.partner_center_review_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid references public.partner_center_students(id) on delete set null,
  group_id uuid references public.partner_center_groups(id) on delete set null,
  event_id uuid references public.partner_center_mock_events(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  exam_registration_id uuid references public.exam_registrations(id) on delete set null,
  skill text not null check (skill in ('writing', 'speaking', 'manual')),
  assigned_staff_membership_id uuid references public.tenant_memberships(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'completed', 'released', 'cancelled')),
  due_at timestamptz,
  score numeric,
  max_score numeric,
  notes text,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_center_review_items_tenant_idx
  on public.partner_center_review_items (tenant_id, status, due_at, created_at desc);

create table if not exists public.partner_center_report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_type text not null check (report_type in ('student_pdf', 'group_pdf', 'event_pdf', 'statement_pdf', 'csv')),
  filters jsonb not null default '{}'::jsonb,
  storage jsonb not null default '{}'::jsonb,
  filename text,
  generated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists partner_center_report_exports_tenant_idx
  on public.partner_center_report_exports (tenant_id, report_type, created_at desc);

create table if not exists public.partner_center_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  currency text not null default 'UZS',
  opening_balance integer not null default 0,
  credits_total integer not null default 0,
  debits_total integer not null default 0,
  closing_balance integer not null default 0,
  status text not null default 'generated' check (status in ('generated', 'void')),
  metadata jsonb not null default '{}'::jsonb,
  generated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_start, period_end, currency)
);

create index if not exists partner_center_statements_tenant_idx
  on public.partner_center_statements (tenant_id, period_start desc);

drop trigger if exists partner_center_students_updated_at on public.partner_center_students;
create trigger partner_center_students_updated_at
before update on public.partner_center_students
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_groups_updated_at on public.partner_center_groups;
create trigger partner_center_groups_updated_at
before update on public.partner_center_groups
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_group_members_updated_at on public.partner_center_group_members;
create trigger partner_center_group_members_updated_at
before update on public.partner_center_group_members
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_student_invites_updated_at on public.partner_center_student_invites;
create trigger partner_center_student_invites_updated_at
before update on public.partner_center_student_invites
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_mock_events_updated_at on public.partner_center_mock_events;
create trigger partner_center_mock_events_updated_at
before update on public.partner_center_mock_events
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_event_registrations_updated_at on public.partner_center_event_registrations;
create trigger partner_center_event_registrations_updated_at
before update on public.partner_center_event_registrations
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_review_items_updated_at on public.partner_center_review_items;
create trigger partner_center_review_items_updated_at
before update on public.partner_center_review_items
for each row execute procedure public.handle_partner_centers_updated_at();

drop trigger if exists partner_center_statements_updated_at on public.partner_center_statements;
create trigger partner_center_statements_updated_at
before update on public.partner_center_statements
for each row execute procedure public.handle_partner_centers_updated_at();

create or replace function public.partner_center_role(p_role text)
returns text
language sql
immutable
as $$
  select case when p_role = 'member' then 'teacher' else coalesce(p_role, '') end
$$;

create or replace function public.partner_center_has_role(
  p_tenant_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and public.partner_center_role(m.role) = any(p_roles)
  );
$$;

create or replace function public.partner_center_is_admin(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select public.partner_center_has_role(p_tenant_id, array['owner', 'admin'])
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin');
$$;

create or replace function public.partner_center_can_view(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select public.partner_center_has_role(p_tenant_id, array['owner', 'admin', 'teacher', 'counselor'])
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin');
$$;

grant execute on function public.partner_center_role(text) to authenticated, service_role;
grant execute on function public.partner_center_has_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.partner_center_is_admin(uuid) to authenticated, service_role;
grant execute on function public.partner_center_can_view(uuid) to authenticated, service_role;

alter table public.partner_center_students enable row level security;
alter table public.partner_center_groups enable row level security;
alter table public.partner_center_group_members enable row level security;
alter table public.partner_center_student_invites enable row level security;
alter table public.partner_center_mock_events enable row level security;
alter table public.partner_center_event_registrations enable row level security;
alter table public.partner_center_review_items enable row level security;
alter table public.partner_center_report_exports enable row level security;
alter table public.partner_center_statements enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'partner_center_students',
    'partner_center_groups',
    'partner_center_group_members',
    'partner_center_student_invites',
    'partner_center_mock_events',
    'partner_center_event_registrations',
    'partner_center_review_items',
    'partner_center_report_exports',
    'partner_center_statements'
  ] loop
    execute format('drop policy if exists "%s view by center staff" on public.%I', t, t);
    execute format('create policy "%s view by center staff" on public.%I for select using (public.partner_center_can_view(tenant_id))', t, t);
    execute format('drop policy if exists "%s manage by center admin" on public.%I', t, t);
    execute format('create policy "%s manage by center admin" on public.%I for all using (public.partner_center_is_admin(tenant_id)) with check (public.partner_center_is_admin(tenant_id))', t, t);
  end loop;
end $$;

drop policy if exists "Partner center teacher view assigned groups" on public.partner_center_groups;
create policy "Partner center teacher view assigned groups"
on public.partner_center_groups
for select
using (
  assigned_teacher_membership_id in (
    select m.id from public.tenant_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
  )
);

drop policy if exists "Partner center teacher view assigned review items" on public.partner_center_review_items;
create policy "Partner center teacher view assigned review items"
on public.partner_center_review_items
for select
using (
  assigned_staff_membership_id in (
    select m.id from public.tenant_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
  )
);

insert into public.admin_permissions_catalog (permission_key, label, description)
values ('admin.partners.reports', 'Partner reports', 'Generate partner center reports, statements, and payout review exports.')
on conflict (permission_key) do update
set label = excluded.label,
    description = excluded.description;

insert into public.admin_role_permissions (role, permission_key)
values
  ('admin_commerce', 'admin.partners.reports'),
  ('admin_ops', 'admin.partners.reports')
on conflict (role, permission_key) do nothing;
