create table if not exists public.academy_classroom_resource_progress (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.tenants(id) on delete cascade,
  classroom_id uuid not null references public.academy_classrooms(id) on delete cascade,
  resource_id uuid not null references public.academy_classroom_resources(id) on delete cascade,
  contact_id uuid not null references public.academy_contacts(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  completed boolean not null default false,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, resource_id, contact_id)
);

create index if not exists academy_resource_progress_academy_idx
  on public.academy_classroom_resource_progress(academy_id);
create index if not exists academy_resource_progress_classroom_idx
  on public.academy_classroom_resource_progress(classroom_id);
create index if not exists academy_resource_progress_resource_idx
  on public.academy_classroom_resource_progress(resource_id);
create index if not exists academy_resource_progress_contact_idx
  on public.academy_classroom_resource_progress(contact_id);

drop trigger if exists academy_resource_progress_updated_at on public.academy_classroom_resource_progress;
create trigger academy_resource_progress_updated_at
before update on public.academy_classroom_resource_progress
for each row
execute procedure public.handle_teacher_studio_updated_at();

alter table public.academy_classroom_resource_progress enable row level security;

drop policy if exists "Academy classroom progress read by membership" on public.academy_classroom_resource_progress;
create policy "Academy classroom progress read by membership"
on public.academy_classroom_resource_progress
for select
using (public.is_academy_member(academy_id));

drop policy if exists "Academy classroom progress manage by membership" on public.academy_classroom_resource_progress;
create policy "Academy classroom progress manage by membership"
on public.academy_classroom_resource_progress
for all
using (public.is_academy_member(academy_id))
with check (public.is_academy_member(academy_id));
