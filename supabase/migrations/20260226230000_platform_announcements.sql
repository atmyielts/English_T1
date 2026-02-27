create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 200),
  body text not null check (char_length(body) <= 5000),
  cta_label text null check (cta_label is null or char_length(cta_label) <= 80),
  cta_href text null check (cta_href is null or char_length(cta_href) <= 500),
  audience text not null default 'all' check (audience in ('all', 'authenticated')),
  is_active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,
  priority integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_announcements_window_valid check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  )
);

create index if not exists platform_announcements_active_window_idx
  on public.platform_announcements (is_active, starts_at, ends_at, priority, created_at desc);

create index if not exists platform_announcements_created_idx
  on public.platform_announcements (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists platform_announcements_updated_at on public.platform_announcements;
create trigger platform_announcements_updated_at
before update on public.platform_announcements
for each row execute function public.set_updated_at();

alter table public.platform_announcements enable row level security;

drop policy if exists "Platform announcements public read active" on public.platform_announcements;
create policy "Platform announcements public read active"
on public.platform_announcements
for select
to anon, authenticated
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  and audience in ('all', 'authenticated')
);

drop policy if exists "Platform announcements admin read all" on public.platform_announcements;
create policy "Platform announcements admin read all"
on public.platform_announcements
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

drop policy if exists "Platform announcements admin manage" on public.platform_announcements;
create policy "Platform announcements admin manage"
on public.platform_announcements
for all
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) = 'admin'
  )
);
