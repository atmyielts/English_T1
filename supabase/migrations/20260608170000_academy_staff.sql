-- Operations loop: staff roles + classroom assignments

create table if not exists public.academy_staff (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid references public.users(id) on delete set null,
  email         text not null,
  display_name  text,
  role          text not null default 'teacher'
    check (role in ('teacher','manager','assistant')),
  classroom_ids jsonb not null default '[]'::jsonb,  -- assigned classroom ids
  is_active     boolean not null default true,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (academy_id, email)
);

create index if not exists academy_staff_academy_idx on public.academy_staff(academy_id);
create index if not exists academy_staff_user_idx    on public.academy_staff(user_id);

alter table public.academy_staff enable row level security;

drop policy if exists "Academy staff read by member" on public.academy_staff;
create policy "Academy staff read by member"
  on public.academy_staff for select
  using (public.is_academy_member(academy_id));

drop policy if exists "Academy staff manage by admin" on public.academy_staff;
create policy "Academy staff manage by admin"
  on public.academy_staff for all
  using (public.is_academy_admin(academy_id))
  with check (public.is_academy_admin(academy_id));

drop trigger if exists academy_staff_updated_at on public.academy_staff;
create trigger academy_staff_updated_at
  before update on public.academy_staff
  for each row execute procedure public.handle_teacher_studio_updated_at();
