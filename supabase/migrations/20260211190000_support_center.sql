-- Support center: contact links + inbound messages (admin inbox)

create table if not exists public.support_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  type text not null check (type in ('email', 'telegram', 'url')),
  value text not null,
  is_active boolean not null default true,
  display_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  email text not null,
  telegram text,
  subject text,
  message text not null,
  source text not null default 'platform',
  service_slug text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'closed')),
  admin_note text,
  metadata jsonb not null default '{}'::jsonb,
  handled_by uuid references public.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_links_active_order_idx
  on public.support_links(is_active, display_order, created_at);

create index if not exists support_messages_status_created_idx
  on public.support_messages(status, created_at desc);

create index if not exists support_messages_email_created_idx
  on public.support_messages(lower(email), created_at desc);

create index if not exists support_messages_service_created_idx
  on public.support_messages(service_slug, created_at desc);

create or replace function public.handle_support_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_links_updated_at on public.support_links;
create trigger support_links_updated_at
before update on public.support_links
for each row
execute procedure public.handle_support_updated_at();

drop trigger if exists support_messages_updated_at on public.support_messages;
create trigger support_messages_updated_at
before update on public.support_messages
for each row
execute procedure public.handle_support_updated_at();

alter table public.support_links enable row level security;
alter table public.support_messages enable row level security;

-- Public can only view active contact links.
drop policy if exists "Support links public read" on public.support_links;
create policy "Support links public read"
on public.support_links
for select
using (is_active = true);

-- Admins can fully manage links.
drop policy if exists "Support links admin manage" on public.support_links;
create policy "Support links admin manage"
on public.support_links
for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

-- Admin-only inbox visibility/updates.
drop policy if exists "Support messages admin read" on public.support_messages;
create policy "Support messages admin read"
on public.support_messages
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "Support messages admin update" on public.support_messages;
create policy "Support messages admin update"
on public.support_messages
for update
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

-- Seed reasonable defaults if table is empty.
insert into public.support_links (label, type, value, is_active, display_order)
select * from (
  values
    ('Email support', 'email', 'support@schood.com', true, 10),
    ('Telegram support', 'telegram', 'https://t.me/schood_support', true, 20)
) as seed(label, type, value, is_active, display_order)
where not exists (select 1 from public.support_links);
