-- Academy LMS v2: student submissions, content links, timetable

-- ── Student submission content (Loop 2) ───────────────────────────────────────
alter table public.academy_submissions
  add column if not exists submission_content text,       -- student-written text answer
  add column if not exists submission_url     text;       -- link to file/image/recording

-- ── Schood content link on assignments (Loop 5) ───────────────────────────────
alter table public.academy_assignments
  add column if not exists experience_url text;           -- deep-link to Schood resource

-- ── Classroom timetable / recurring schedule (Loop 7) ─────────────────────────

create table if not exists public.academy_classroom_schedules (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  -- Recurring slot
  day_of_week  smallint not null check (day_of_week between 0 and 6),  -- 0=Sun … 6=Sat
  start_time   time not null,    -- local time e.g. '14:00'
  end_time     time,             -- optional
  timezone     text not null default 'Asia/Tashkent',
  label        text,             -- e.g. "Speaking practice"
  is_active    boolean not null default true,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists academy_classroom_schedules_classroom_idx
  on public.academy_classroom_schedules(classroom_id);

alter table public.academy_classroom_schedules enable row level security;

drop policy if exists "Academy schedules read by member" on public.academy_classroom_schedules;
create policy "Academy schedules read by member"
  on public.academy_classroom_schedules for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy schedules manage by admin" on public.academy_classroom_schedules;
create policy "Academy schedules manage by admin"
  on public.academy_classroom_schedules for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop trigger if exists academy_classroom_schedules_updated_at on public.academy_classroom_schedules;
create trigger academy_classroom_schedules_updated_at
  before update on public.academy_classroom_schedules
  for each row execute procedure public.handle_teacher_studio_updated_at();
