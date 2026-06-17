-- Support inbox replies and delivery tracking.

create table if not exists public.support_message_replies (
  id uuid primary key default gen_random_uuid(),
  support_message_id uuid not null references public.support_messages(id) on delete cascade,
  author_user_id uuid references public.users(id) on delete set null,
  author_type text not null default 'admin' check (author_type in ('admin', 'system')),
  body text not null,
  delivery_channel text not null default 'internal' check (delivery_channel in ('internal', 'telegram', 'email')),
  delivery_status text not null default 'sent' check (delivery_status in ('sent', 'prepared', 'failed', 'skipped')),
  delivery_target text,
  delivery_error text,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_message_replies_message_created_idx
  on public.support_message_replies(support_message_id, created_at);

create index if not exists support_message_replies_channel_status_idx
  on public.support_message_replies(delivery_channel, delivery_status, created_at desc);

alter table public.support_message_replies enable row level security;

drop policy if exists "Support message replies admin read" on public.support_message_replies;
create policy "Support message replies admin read"
on public.support_message_replies
for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role like 'admin%'
  )
);

drop policy if exists "Support message replies admin insert" on public.support_message_replies;
create policy "Support message replies admin insert"
on public.support_message_replies
for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role like 'admin%'
  )
);
