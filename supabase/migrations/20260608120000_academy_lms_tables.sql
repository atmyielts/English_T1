-- LMS layer: assignments, submissions, attendance, bulk invites, score weights
-- Builds on the existing academy_classrooms / academy_contacts schema.

-- ── Feature 2 & 10 & 11: Assignments + prerequisites + scheduled position ──

create table if not exists public.academy_assignments (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.tenants(id) on delete cascade,
  classroom_id   uuid not null references public.academy_classrooms(id) on delete cascade,
  title          text not null,
  description    text,
  assignment_type text not null default 'task'
    check (assignment_type in ('task','test','lab','reading','writing','listening','speaking','custom')),
  experience_id  uuid,          -- links to an IELTS/SAT experience when type=lab/test
  due_at         timestamptz,
  released_at    timestamptz default now(),
  prerequisite_id uuid references public.academy_assignments(id) on delete set null,
  position       integer not null default 0,
  max_score      numeric,
  score_weight   numeric not null default 1.0,  -- feature 9: weight in composite score
  status         text not null default 'active'
    check (status in ('draft','active','archived')),
  metadata       jsonb not null default '{}'::jsonb,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists academy_assignments_academy_idx    on public.academy_assignments(academy_id);
create index if not exists academy_assignments_classroom_idx  on public.academy_assignments(classroom_id);
create index if not exists academy_assignments_status_idx     on public.academy_assignments(classroom_id, status);

-- ── Feature 3: Gradebook / Submissions ────────────────────────────────────

create table if not exists public.academy_submissions (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.tenants(id) on delete cascade,
  assignment_id  uuid not null references public.academy_assignments(id) on delete cascade,
  classroom_id   uuid not null,
  contact_id     uuid not null references public.academy_contacts(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  session_id     uuid,          -- link to an IELTS Practice / lab session for auto-score
  score          numeric,
  max_score      numeric,
  status         text not null default 'submitted'
    check (status in ('missing','submitted','graded','late')),
  submitted_at   timestamptz default now(),
  graded_at      timestamptz,
  graded_by      uuid references public.users(id) on delete set null,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assignment_id, contact_id)
);

create index if not exists academy_submissions_academy_idx    on public.academy_submissions(academy_id);
create index if not exists academy_submissions_assignment_idx on public.academy_submissions(assignment_id);
create index if not exists academy_submissions_contact_idx    on public.academy_submissions(contact_id);
create index if not exists academy_submissions_classroom_idx  on public.academy_submissions(classroom_id);

-- ── Feature 6: Attendance ─────────────────────────────────────────────────

create table if not exists public.academy_attendance (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.tenants(id) on delete cascade,
  classroom_id   uuid not null references public.academy_classrooms(id) on delete cascade,
  contact_id     uuid not null references public.academy_contacts(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  session_date   date not null default current_date,
  status         text not null default 'present'
    check (status in ('present','absent','late','excused')),
  notes          text,
  marked_by      uuid references public.users(id) on delete set null,
  marked_at      timestamptz default now(),
  metadata       jsonb not null default '{}'::jsonb,
  unique (classroom_id, contact_id, session_date)
);

create index if not exists academy_attendance_academy_idx    on public.academy_attendance(academy_id);
create index if not exists academy_attendance_classroom_idx  on public.academy_attendance(classroom_id);
create index if not exists academy_attendance_contact_idx    on public.academy_attendance(contact_id);
create index if not exists academy_attendance_date_idx       on public.academy_attendance(classroom_id, session_date);

-- ── Feature 5: Bulk Invites ───────────────────────────────────────────────

create table if not exists public.academy_bulk_invites (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.tenants(id) on delete cascade,
  classroom_id   uuid references public.academy_classrooms(id) on delete cascade,
  invited_by     uuid not null references public.users(id) on delete cascade,
  email          text not null,
  first_name     text,
  last_name      text,
  status         text not null default 'pending'
    check (status in ('pending','sent','joined','failed')),
  invited_at     timestamptz default now(),
  joined_at      timestamptz,
  error          text,
  metadata       jsonb not null default '{}'::jsonb
);

create index if not exists academy_bulk_invites_academy_idx   on public.academy_bulk_invites(academy_id);
create index if not exists academy_bulk_invites_classroom_idx on public.academy_bulk_invites(classroom_id);
create index if not exists academy_bulk_invites_email_idx     on public.academy_bulk_invites(academy_id, email);

-- ── Feature 9: Score weights on classrooms ───────────────────────────────
-- e.g. { "reading": 0.25, "writing": 0.25, "listening": 0.25, "speaking": 0.25 }
alter table public.academy_classrooms
  add column if not exists score_weights jsonb;

-- ── Feature 7: Teacher role on classroom memberships ─────────────────────
-- Existing role check is ('student','assistant') — add 'teacher' and 'observer'.
alter table public.academy_classroom_memberships
  drop constraint if exists academy_classroom_memberships_role_check;
alter table public.academy_classroom_memberships
  add constraint academy_classroom_memberships_role_check
  check (role in ('student','assistant','teacher','observer'));

-- ── Triggers for updated_at ───────────────────────────────────────────────

drop trigger if exists academy_assignments_updated_at on public.academy_assignments;
create trigger academy_assignments_updated_at
  before update on public.academy_assignments
  for each row execute procedure public.handle_teacher_studio_updated_at();

drop trigger if exists academy_submissions_updated_at on public.academy_submissions;
create trigger academy_submissions_updated_at
  before update on public.academy_submissions
  for each row execute procedure public.handle_teacher_studio_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.academy_assignments    enable row level security;
alter table public.academy_submissions    enable row level security;
alter table public.academy_attendance     enable row level security;
alter table public.academy_bulk_invites   enable row level security;

drop policy if exists "Academy assignments read by member"  on public.academy_assignments;
create policy "Academy assignments read by member"
  on public.academy_assignments for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy assignments manage by admin" on public.academy_assignments;
create policy "Academy assignments manage by admin"
  on public.academy_assignments for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy submissions read by member"  on public.academy_submissions;
create policy "Academy submissions read by member"
  on public.academy_submissions for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy submissions manage by admin" on public.academy_submissions;
create policy "Academy submissions manage by admin"
  on public.academy_submissions for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy attendance read by member"   on public.academy_attendance;
create policy "Academy attendance read by member"
  on public.academy_attendance for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy attendance manage by admin"  on public.academy_attendance;
create policy "Academy attendance manage by admin"
  on public.academy_attendance for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop policy if exists "Academy bulk invites manage by admin" on public.academy_bulk_invites;
create policy "Academy bulk invites manage by admin"
  on public.academy_bulk_invites for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));
