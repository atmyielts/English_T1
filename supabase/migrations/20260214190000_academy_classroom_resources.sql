create table if not exists public.academy_classroom_resources (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('video', 'book', 'asset', 'link')),
  url text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_classroom_resources_academy_idx
  on public.academy_classroom_resources(academy_id);
create index if not exists academy_classroom_resources_classroom_idx
  on public.academy_classroom_resources(classroom_id);
create index if not exists academy_classroom_resources_sort_idx
  on public.academy_classroom_resources(classroom_id, sort_order, created_at);

drop trigger if exists academy_classroom_resources_updated_at on public.academy_classroom_resources;
create trigger academy_classroom_resources_updated_at
before update on public.academy_classroom_resources
for each row
execute procedure public.handle_teacher_studio_updated_at();

alter table public.academy_classroom_resources enable row level security;

drop policy if exists "Academy classroom resources read by membership" on public.academy_classroom_resources;
create policy "Academy classroom resources read by membership"
on public.academy_classroom_resources
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy classroom resources manage by admin" on public.academy_classroom_resources;
create policy "Academy classroom resources manage by admin"
on public.academy_classroom_resources
for all
using (public.is_academy_admin(academy_id))
with check (public.is_academy_admin(academy_id));
