-- Teacher Studio announcements feed (separate from per-contact message fanout).

create table if not exists public.academy_announcements (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid references public.academy_classrooms(id) on delete set null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists academy_announcements_academy_idx
  on public.academy_announcements (academy_id, created_at desc);

create index if not exists academy_announcements_classroom_idx
  on public.academy_announcements (classroom_id, created_at desc);

alter table public.academy_announcements enable row level security;

drop policy if exists "Academy announcements read by membership" on public.academy_announcements;
create policy "Academy announcements read by membership"
on public.academy_announcements
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy announcements manage by admin" on public.academy_announcements;
create policy "Academy announcements manage by admin"
on public.academy_announcements
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));
