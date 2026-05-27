create table if not exists public.platform_announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  announcement_updated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_announcement_reads_unique unique (announcement_id, user_id)
);

create index if not exists platform_announcement_reads_user_idx
  on public.platform_announcement_reads (user_id, read_at desc);

create index if not exists platform_announcement_reads_announcement_idx
  on public.platform_announcement_reads (announcement_id, read_at desc);

drop trigger if exists platform_announcement_reads_updated_at on public.platform_announcement_reads;
create trigger platform_announcement_reads_updated_at
before update on public.platform_announcement_reads
for each row execute function public.set_updated_at();

alter table public.platform_announcement_reads enable row level security;

drop policy if exists "Announcement reads own select" on public.platform_announcement_reads;
create policy "Announcement reads own select"
on public.platform_announcement_reads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Announcement reads own insert" on public.platform_announcement_reads;
create policy "Announcement reads own insert"
on public.platform_announcement_reads
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Announcement reads own update" on public.platform_announcement_reads;
create policy "Announcement reads own update"
on public.platform_announcement_reads
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Announcement reads admin read all" on public.platform_announcement_reads;
create policy "Announcement reads admin read all"
on public.platform_announcement_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
);
